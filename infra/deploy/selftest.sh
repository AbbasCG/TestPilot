#!/usr/bin/env bash
# Offline self-test for testpilot-deploy.sh: real Git repositories, stubbed docker/curl.
# Never touches Docker, the network or any real installation. Run: bash infra/deploy/selftest.sh
set -Eeuo pipefail
here=$(cd "$(dirname "$0")" && pwd)
deploy="$here/testpilot-deploy.sh"
repo_root=$(cd "$here/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail() { printf 'SELFTEST FAIL: %s\n' "$*" >&2; exit 1; }
check() { local name=$1 expected=$2 actual=$3; [ "$expected" = "$actual" ] && { pass=$((pass + 1)); printf 'ok   %s\n' "$name"; } || fail "$name (expected $expected, got $actual)"; }
git_() { git -c user.name=selftest -c user.email=selftest@example.invalid "$@"; }

stubs="$work/stubs"
mkdir -p "$stubs"
cat > "$stubs/docker" <<'STUB'
#!/usr/bin/env bash
echo "docker RELEASE_TAG=${RELEASE_TAG:-} $*" >> "$STUB_LOG"
case "$*" in
  "info") exit 0 ;;
  "compose version") exit 0 ;;
  *"image inspect"*) exit 0 ;;
  inspect*) echo "testpilot-api:oldtag7" ;;
  *"ps -q api"*) echo cid-api ;;
  *"ps --status running -q database"*) echo cid-db ;;
  *" exec "*) echo data ;;
  *" up "*) [ "${RELEASE_TAG:-}" = "oldtag7" ] && rm -f "$STUB_DIR/curl_fail"; exit 0 ;;
  *) exit 0 ;;
esac
STUB
cat > "$stubs/curl" <<'STUB'
#!/usr/bin/env bash
[ -f "$STUB_DIR/curl_fail" ] && exit 22
exit 0
STUB
chmod +x "$stubs/docker" "$stubs/curl"
export STUB_DIR="$stubs" STUB_LOG="$work/docker.log"
PATH="$stubs:$PATH"
if ! command -v flock > /dev/null 2>&1; then printf '#!/bin/sh\nexit 0\n' > "$stubs/flock"; chmod +x "$stubs/flock"; fi

new_world() { # new_world <name> -> creates origin + server clone, sets $server $backup $cfg $old $new
  local name=$1
  local origin="$work/$name-origin.git"
  server="$work/$name-server"
  backup="$work/$name-backup"
  cfg="$work/$name.env"
  git init -q --bare -b dev "$origin"
  git init -q -b dev "$server"
  mkdir -p "$server/infra" "$server/backend/database/migrations" "$backup"
  cp "$repo_root/infra/backup.sh" "$server/infra/backup.sh"
  : > "$server/infra/compose.yaml"
  printf 'APP_KEY=base64:x\nAPP_URL=https://example.invalid\nDB_PASSWORD=x\nPOSTGRES_ADMIN_PASSWORD=x\nSANCTUM_STATEFUL_DOMAINS=example.invalid\nHTTP_PORT=8099\n' > "$server/infra/.env"
  chmod 600 "$server/infra/.env"
  printf '.env\n' > "$server/.gitignore"
  echo 1 > "$server/backend/database/migrations/001.php"
  git_ -C "$server" add -A && git_ -C "$server" commit -q -m base
  git_ -C "$server" remote add origin "$origin"
  git_ -C "$server" push -q origin dev
  old=$(git_ -C "$server" rev-parse HEAD)
  echo change > "$server/app.txt"
  git_ -C "$server" add app.txt && git_ -C "$server" commit -q -m next
  new=$(git_ -C "$server" rev-parse HEAD)
  git_ -C "$server" push -q origin dev
  git_ -C "$server" reset -q --hard "$old"
  printf 'TESTPILOT_DIR=%s\nBACKUP_DIR=%s\nHEALTH_WAIT=0\n' "$server" "$backup" > "$cfg"
  : > "$STUB_LOG"
  rm -f "$stubs/curl_fail"
}
run() { TESTPILOT_DEPLOY_ENV=$cfg bash "$deploy" "$@" > "$work/out.txt" 2>&1; echo $?; }
head_of() { git_ -C "$server" rev-parse HEAD; }

# 1. malformed requests are refused before anything else happens
new_world t1
check 'rejects free text' 64 "$(run 'deploy; rm -rf /')"
check 'rejects short sha' 64 "$(run 'deploy abc123')"
check 'rejects newline injection' 64 "$(run $'deploy '"$new"$'\nrm -rf /')"

# 2. dry run: all checks, no live change
check 'dry-run of dev head succeeds' 0 "$(run "dry-run $new")"
check 'dry-run leaves work tree alone' "$old" "$(head_of)"
if grep -Eq 'compose.* (build|up|run) ' "$STUB_LOG"; then fail 'dry-run touched containers'; fi
pass=$((pass + 1)); echo 'ok   dry-run never builds, runs or restarts'

# 3. stale sha (CI finished late for an older commit) is refused with exit 3
check 'stale sha refused' 3 "$(run "deploy $old")"
check 'stale deploy changed nothing' "$old" "$(head_of)"

# 4. dirty work tree refuses
new_world t4
echo dirty >> "$server/backend/database/migrations/001.php"
check 'dirty tree refused' 1 "$(run "dry-run $new")"

# 5. happy path
new_world t5
check 'deploy succeeds' 0 "$(run "deploy $new")"
check 'work tree moved to target' "$new" "$(head_of)"
grep -q 'build api web' "$STUB_LOG" || fail 'no build'
grep -q 'migrate --force' "$STUB_LOG" || fail 'no migrate'
grep -q "RELEASE_TAG=${new:0:7} compose -p testpilot" "$STUB_LOG" || fail 'compose not pinned to project testpilot with sha tag'
pass=$((pass + 1)); echo 'ok   build, migrate and up ran with project testpilot and sha tag'
ls "$backup" | grep -q '\.dump$' || fail 'no database backup file'
ls "$backup" | grep -q 'evidence.*tar\.gz$' || fail 'no evidence backup file'
grep -q 'OK$' "$backup/deployments.log" || fail 'deployment not logged'
pass=$((pass + 1)); echo 'ok   backups written and deployment logged'

# 6. unhealthy release without migration changes rolls back to the previous images
new_world t6
touch "$stubs/curl_fail"
check 'unhealthy deploy fails' 1 "$(run "deploy $new")"
check 'rolled back work tree' "$old" "$(head_of)"
grep -q 'FAILED-ROLLED-BACK' "$backup/deployments.log" || fail 'rollback not logged'
grep -q 'RELEASE_TAG=oldtag7 compose' "$STUB_LOG" || fail 'previous release was not restored'
pass=$((pass + 1)); echo 'ok   previous release restored automatically'

# 7. unhealthy release WITH migration changes must not roll back automatically
new_world t7
git_ -C "$server" reset -q --hard "$new"
echo 2 > "$server/backend/database/migrations/002.php"
git_ -C "$server" add -A && git_ -C "$server" commit -q -m migration
mig=$(head_of)
git_ -C "$server" push -q origin dev
git_ -C "$server" reset -q --hard "$new"
touch "$stubs/curl_fail"
: > "$STUB_LOG"
check 'migration deploy fails when unhealthy' 1 "$(run "deploy $mig")"
grep -q 'FAILED-MANUAL' "$backup/deployments.log" || fail 'manual-rollback case not logged'
if grep -q 'RELEASE_TAG=oldtag7 compose' "$STUB_LOG"; then fail 'rolled back despite migration changes'; fi
pass=$((pass + 1)); echo 'ok   no automatic rollback when migrations changed'

# 8. concurrent deployment is refused
if command -v flock > /dev/null 2>&1 && [ ! -f "$stubs/flock" ]; then
  new_world t8
  (exec 8>>"$backup/.deploy.lock"; flock -n 8 && sleep 5) &
  sleep 1
  check 'overlapping deployment refused' 75 "$(run "dry-run $new")"
  wait
fi

printf 'All %d self-test checks passed.\n' "$pass"
