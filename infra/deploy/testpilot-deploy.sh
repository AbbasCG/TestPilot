#!/usr/bin/env bash
# testpilot-deploy — deploy one commit of `dev` to the qa.softbuild.nl TestPilot installation.
#
# Usage (normally through the restricted SSH key, see docs/DEPLOYMENT_AUTOMATION.md):
#   testpilot-deploy "dry-run <40-hex-sha>"   read-only checks, nothing live is changed
#   testpilot-deploy "deploy  <40-hex-sha>"   backup, build, migrate, restart, verify
# The request may also arrive in SSH_ORIGINAL_COMMAND. Nothing but those two shapes is accepted.
#
# Exit codes: 0 ok · 1 failed (rolled back where safe) · 3 refused: sha is no longer the head of dev
#             64 bad request · 75 another deployment is running
#
# Install it as root-owned, not writable by the deploy user:
#   sudo install -o root -g root -m 0755 infra/deploy/testpilot-deploy.sh /usr/local/sbin/testpilot-deploy
set -Eeuo pipefail
umask 077

CONFIG_FILE=${TESTPILOT_DEPLOY_ENV:-/etc/testpilot-deploy.env}
# shellcheck disable=SC1090
if [ -r "$CONFIG_FILE" ]; then . "$CONFIG_FILE"; fi
DIR=${TESTPILOT_DIR:-/var/www/testpilot}
BRANCH=${TESTPILOT_BRANCH:-dev}
REMOTE=${TESTPILOT_REMOTE:-origin}
PROJECT=testpilot # the Compose project is always named explicitly; other stacks on this host are never addressed
BACKUP_DIR=${BACKUP_DIR:-/var/backups/testpilot}
DEPLOY_LOG=${DEPLOY_LOG:-$BACKUP_DIR/deployments.log}
MIN_FREE_MB=${MIN_FREE_MB:-1024}
HEALTH_WAIT=${HEALTH_WAIT:-120}
SELF_VERSION=1

request=${1:-${SSH_ORIGINAL_COMMAND:-}}
if [[ ! $request =~ ^(dry-run|deploy)\ ([0-9a-f]{40})$ ]]; then
  echo 'Bad request. Expected: "dry-run <40-hex-sha>" or "deploy <40-hex-sha>".' >&2
  exit 64
fi
mode=${BASH_REMATCH[1]}
target=${BASH_REMATCH[2]}
tag=${target:0:7}

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
failures=0
stale=0
ok() { log "  ok   $*"; }
bad() { log "  FAIL $*"; failures=$((failures + 1)); }
note() { log "  note $*"; }

dc_tag() { # dc_tag <release-tag> <compose args...>
  local t=$1
  shift
  (cd "$DIR/infra" && RELEASE_TAG=$t docker compose -p "$PROJECT" -f compose.yaml "$@")
}
dc() { dc_tag "$tag" "$@"; }
env_value() { grep -E "^$1=" "$DIR/infra/.env" | head -n 1 | cut -d= -f2- || true; }

# One deployment at a time, including dry runs. The lock lives in the private backup directory.
if [ -d "$BACKUP_DIR" ]; then
  exec 9>>"$BACKUP_DIR/.deploy.lock"
  if ! flock -n 9; then
    echo 'Another TestPilot deployment is running.' >&2
    exit 75
  fi
fi

log "testpilot-deploy v$SELF_VERSION · mode=$mode · target=$target · project=$PROJECT"

# ---------------------------------------------------------------- preflight (read-only)
preflight() {
  local cmd
  for cmd in git docker curl flock; do
    if command -v "$cmd" > /dev/null 2>&1; then ok "command $cmd"; else bad "command $cmd is missing"; fi
  done
  if docker info > /dev/null 2>&1; then ok 'docker daemon reachable by this user'; else bad 'docker daemon is not reachable by this user (docker group?)'; fi
  if docker compose version > /dev/null 2>&1; then ok 'docker compose plugin'; else bad 'docker compose plugin is missing'; fi

  if [ -d "$BACKUP_DIR" ] && [ -w "$BACKUP_DIR" ]; then
    ok "backup directory $BACKUP_DIR is writable"
    local free
    free=$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    if [ "${free:-0}" -ge "$MIN_FREE_MB" ]; then ok "free space ${free} MB"; else bad "free space ${free:-?} MB is below ${MIN_FREE_MB} MB"; fi
  else
    bad "backup directory $BACKUP_DIR is missing or not writable"
  fi

  if ! git -C "$DIR" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    bad "$DIR is not a Git work tree"
    return
  fi
  ok "git work tree $DIR"
  [ -f "$DIR/infra/compose.yaml" ] && ok 'infra/compose.yaml present' || bad 'infra/compose.yaml missing'
  if [ -f "$DIR/infra/.env" ]; then
    ok 'infra/.env present'
    local perms key
    perms=$(stat -c %a "$DIR/infra/.env" 2> /dev/null || echo '?')
    case $perms in 600 | 400 | 640) ok "infra/.env mode $perms" ;; *) bad "infra/.env mode $perms is too open (use 600)" ;; esac
    for key in APP_KEY APP_URL DB_PASSWORD POSTGRES_ADMIN_PASSWORD SANCTUM_STATEFUL_DOMAINS; do
      if grep -Eq "^$key=.+" "$DIR/infra/.env"; then ok "infra/.env defines $key"; else bad "infra/.env does not define $key"; fi
    done
  else
    bad 'infra/.env missing'
  fi

  local current
  current=$(git -C "$DIR" symbolic-ref --short -q HEAD || echo 'detached')
  if [ "$current" = "$BRANCH" ]; then ok "work tree is on $BRANCH"; else bad "work tree is on '$current', expected $BRANCH"; fi
  if [ -z "$(git -C "$DIR" status --porcelain --untracked-files=no)" ]; then ok 'work tree has no local changes'; else bad 'work tree has local changes'; fi

  if timeout 90 git -C "$DIR" fetch --quiet "$REMOTE" "$BRANCH"; then ok "fetched $REMOTE/$BRANCH"; else bad "cannot fetch $REMOTE/$BRANCH"; return; fi
  if git -C "$DIR" cat-file -e "$target^{commit}" 2> /dev/null; then ok "commit $tag is available"; else bad "commit $tag is not reachable from $REMOTE"; return; fi
  local head
  head=$(git -C "$DIR" rev-parse "refs/remotes/$REMOTE/$BRANCH")
  if [ "$head" = "$target" ]; then
    ok "$tag is the head of $BRANCH"
  else
    stale=1
    bad "$tag is NOT the head of $BRANCH (head is ${head:0:7}); a newer commit exists"
  fi
  if git -C "$DIR" merge-base --is-ancestor HEAD "$target" 2> /dev/null; then ok 'target is a fast-forward of the live commit'; else bad 'target is not a fast-forward of the live commit'; fi

  if [ -f "$DIR/infra/.env" ] && dc config -q > /dev/null 2>&1; then ok 'compose configuration is valid'; else bad 'compose configuration is invalid'; fi

  prev_tag=
  local api_container
  api_container=$(dc ps -q api 2> /dev/null | head -n 1 || true)
  if [ -n "$api_container" ]; then
    prev_tag=$(docker inspect --format '{{.Config.Image}}' "$api_container" 2> /dev/null | sed 's/^.*://' || true)
    ok "running release: ${prev_tag:-unknown}"
    if [ -n "$prev_tag" ] && docker image inspect "testpilot-api:$prev_tag" "testpilot-web:$prev_tag" > /dev/null 2>&1; then
      ok "images for rollback to $prev_tag exist"
    else
      note "images for the running release are missing: automatic rollback is unavailable"
      prev_tag=
    fi
  else
    bad 'no running api container in project testpilot'
  fi
  if [ "$(dc ps --status running -q database 2> /dev/null | wc -l)" -ge 1 ]; then ok 'database container is running'; else bad 'database container is not running'; fi

  if git -C "$DIR" show "$target:infra/deploy/testpilot-deploy.sh" 2> /dev/null | cmp -s - "$0"; then
    ok 'installed script matches the repository'
  else
    note 'installed script differs from the repository version; reinstall it if the deploy logic changed'
  fi
}
prev_tag=
preflight

if [ "$failures" -gt 0 ]; then
  log "preflight: $failures check(s) failed"
  [ "$stale" -eq 1 ] && exit 3
  exit 1
fi
if [ "$mode" = dry-run ]; then
  log "dry-run complete: nothing was changed. A deploy of $tag would back up, build testpilot-{api,web}:$tag, migrate, restart and verify."
  exit 0
fi

# ---------------------------------------------------------------- deploy (changes the live system)
prev_head=$(git -C "$DIR" rev-parse HEAD)
schema_changed=0
git -C "$DIR" diff --quiet "$prev_head" "$target" -- backend/database/migrations || schema_changed=1
stage=prepare
port=$(env_value HTTP_PORT)
port=${port:-8088}
record() { printf '%s %s %s -> %s %s\n' "$(date -u +%FT%TZ)" "$mode" "${prev_head:0:7}" "${target:0:7}" "$1" >> "$DEPLOY_LOG"; }

restore_tree() { git -C "$DIR" reset --hard --quiet "$prev_head"; }

verify() { # verify <label>
  local path waited
  for path in /up /api/health; do
    waited=0
    until curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$port$path"; do
      waited=$((waited + 5))
      if [ "$waited" -ge "$HEALTH_WAIT" ]; then log "$1: $path did not return 200 within ${HEALTH_WAIT}s"; return 1; fi
      sleep 5
    done
    ok "$1: $path returns 200"
  done
  local public
  public=$(env_value APP_URL)
  if [ -n "$public" ] && curl -fsS --max-time 15 -o /dev/null "$public/api/health"; then ok "public $public/api/health returns 200"; else note "public health check skipped or failed (loopback checks passed)"; fi
}

rollback() {
  log "rolling back to release $prev_tag (no migration files changed, so the previous images match the schema)"
  if dc_tag "$prev_tag" up -d --no-build --wait --wait-timeout "$HEALTH_WAIT"; then
    restore_tree
    if verify rollback; then record "FAILED-ROLLED-BACK"; else record "FAILED-ROLLBACK-UNHEALTHY"; fi
  else
    record "FAILED-ROLLBACK-ERROR"
  fi
}

abort() {
  log "ERROR: $*"
  case $stage in
    prepare)
      restore_tree
      record 'FAILED-BEFORE-LIVE'
      log 'live containers were not touched; the work tree was restored.'
      ;;
    live)
      if [ "$schema_changed" -eq 0 ] && [ -n "$prev_tag" ]; then
        rollback
      else
        record 'FAILED-MANUAL'
        log 'NOT rolling back automatically: this release changes database migrations (or the previous images are gone).'
        log "Backups are in $BACKUP_DIR. Read the rollback section of docs/DEPLOYMENT_AUTOMATION.md before acting."
      fi
      ;;
  esac
  exit 1
}

log "deploying ${prev_head:0:7} -> $tag (migrations changed: $schema_changed)"
git -C "$DIR" merge --ff-only --quiet "$target" || abort 'fast-forward failed'
dc config -q > /dev/null 2>&1 || abort 'compose configuration of the target commit is invalid'

log 'backing up database and evidence'
(cd "$DIR/infra" && COMPOSE_PROJECT_NAME=$PROJECT RELEASE_TAG=$tag ./backup.sh "$BACKUP_DIR") || abort 'backup failed'

log "building testpilot-api:$tag and testpilot-web:$tag (previous tags are kept)"
dc build api web || abort 'image build failed'

stage=live
log 'running migrations'
dc run --rm -T --no-deps api php artisan migrate --force || abort 'migration failed'
log 'updating services'
dc up -d --no-build --wait --wait-timeout "$HEALTH_WAIT" || abort 'service update failed'
verify deploy || abort 'health verification failed'

record OK
log "done: TestPilot runs release $tag. Previous release ${prev_tag:-unknown} images are kept for rollback."
