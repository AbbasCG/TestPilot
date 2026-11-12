# Claude handoff — 2026-11-12

## Update — second session (2026-11-12)

- Remote `origin` = https://github.com/AbbasCG/TestPilot (public). Branches: `main` (7cb15eb, stable M1–M4), `dev` (M5–M8 + typography + workflow), task branch `feature/global-fonts` merged into `dev`. Open PR `dev` → `main` with an Arabic description; do not merge without the owner. Follow GIT_WORKFLOW.md from now on.
- Not pushed by design: `backup/codex-m5-draft`, `claude/testpilot-m5-m8-continuation-3a6bcd`, `.local/`, licensed fonts.
- Main checkout `D:\Projects\TestPilot` is clean on `main`; Codex draft files were moved to `.local/backups/codex-m5-draft-20261112/moved-from-worktree` after hash verification.
- Fonts: committed under `frontend/src/assets/fonts/thmanyah/` with the owner's permission (2026-11-12); see DEVELOPMENT_SETUP.md › Fonts. Originals backed up in `.local/backups/fonts-thmanyah-original-20261112`.
- First CI run on `dev` failed in Playwright only (textarea accessible names in CI Chromium; login throttling of shared E2E accounts). Fixed on `fix/ci-e2e-and-fonts`.
- Dev database still not migrated to M5 and has no accounts: after the PR is merged (or by checking out `dev`), back up with pg_dump, run `php artisan migrate`, create the owner with `testpilot:user`, then `testpilot:import-tharaa`.

## Resume here (first session)

Work happened in the git worktree `D:\Projects\TestPilot\.claude\worktrees\testpilot-m5-m8-continuation-3a6bcd` on branch `claude/testpilot-m5-m8-continuation-3a6bcd`, starting from 7cb15eb. Commits on that branch (get exact hashes with `git log --oneline 7cb15eb..HEAD`): M5 issues/evidence/retests, M6 analytics/exports, scenario prerequisite fix, M7 Tharaa import, M8 review hardening + quality gates, deployment assets + docs. Nothing is merged into `main` and nothing is pushed. No remote exists.

Important: the main checkout `D:\Projects\TestPilot` still has Codex's **uncommitted** M5 draft (Issue model, EvidenceService, config/evidence.php, migration `2026_11_12_080000_create_issue_and_evidence_tables.php`, filesystems disk). The branch supersedes all of it with the same file names. Before merging, the owner should discard or stash that draft in the main checkout (do not do it without approval).

Read first: CLAUDE.md, IMPLEMENTATION_STATUS.md, REQUIREMENTS_TRACEABILITY.md, CONTINUATION_REQUIREMENTS_M5_M8.md. MASTER_REQUIREMENTS.md is still a placeholder.

## Implementation map

- Backend M5: `IssueWorkflow` (state machine), `IssueService` (create/update/transition/comment/retest/list/summary/detail), `EvidenceService` (inspect, store, download, present), `IssueController`; models `Issue`, `RetestAttempt`; config `evidence.php`; disk `evidence` (`storage/app/private/evidence`, override with EVIDENCE_STORAGE_PATH); rate limiter `evidence` (20/min). `RunService::detail` adds `issues` and `evidence`; `saveResult` refuses results linked to an issue.
- Backend M6: `AnalyticsService` (project report, readiness, comparison), `ReportExporter` (CSV/Markdown), `AnalyticsController`.
- Backend M7: `ImportTharaa` command + `database/data/tharaa.php` (source: Tharaa_platforme/docs/demo/THARAA_DEMO_TEST_SCENARIOS.md, read-only).
- Tables: `issues` (unique project/number, unique step_result_id, composite FKs to runs/cases/environments/duplicate, CHECK constraints on status/severity/priority), `issue_comments`, `issue_activities`, `retest_attempts` (unique issue/attempt, partial unique index: one pending per issue), `evidence_files` (exactly-one-owner check by num_nonnulls ≥ 1, unique path).
- Frontend: `src/issues/` (IssueManagement, Evidence, types, issues.css), `src/analytics/` (Analytics, types, analytics.css), `api.ts upload()`, runner `ResultExtras`. Routes `/projects/:id/issues`, `issues/new?run=&result=`, `issues/:issueId`, `issues/:issueId/retest`, `/projects/:id/analytics`, `analytics/report` (printable), dashboard comparison panel.
- Tests: backend `IssueWorkflowTest`, `EvidenceSecurityTest`, `AnalyticsReportTest`, `IssueHardeningTest`, `TharaaImportTest`, shared fixture trait `tests/Concerns/CreatesCollaborativeRun`; Playwright `issues.spec`, `full-workflow.spec`, `quality-gates.spec`.

## Permissions summary

Viewer: read only. Tester/manager/owner: create issues, comment, upload evidence. Reporter or manager: edit fields; after triage only managers change severity/priority. Managers: triage, assign, defer, won't fix, duplicate, close, reopen, reassign retest. Assignee (or manager): start fix, send to retest. Only the retest assignee records the retest. Retest tester ≠ fixer ≠ requester.

## Verification

36 PostgreSQL tests / 513 assertions; typecheck, lint (2 old Fast Refresh warnings), build; Playwright 9/9 (3.1 min). Independent AppSec review: no Critical/High; fixed M1 and L1–L4, L8. Remaining accepted Lows: video metadata not stripped, inline-view audit throttled to 1/user/file/hour, orphan files only possible after a hard crash (no sweeper yet).

## Next work, in order

1. Owner decision: merge the branch into `main` after discarding the Codex draft in the main checkout; then `php artisan migrate` on the dev DB.
2. Create the owner account (`php artisan testpilot:user email --name=...`), then `php artisan testpilot:import-tharaa email` (try `--dry-run` first). Run TEST-TEACHER-001 on Demo with two real testers.
3. Optional with approval: server-side Arabic PDF (mPDF), Vitest for frontend units, axe-core for automated a11y, video remux to strip metadata, orphan-file sweeper, real-time updates.
4. Operations rehearsal on Hetzner (image build with GD, upload through edge Nginx, backup + restore including evidence archive). No deployment or DNS without approval.
5. Reconcile everything with PHASE 0–22 when the official source arrives.

## Local operation (worktree specifics)

The worktree has its own copied `backend/vendor`, `frontend/node_modules` (junctions resolve to the main checkout and break autoloading/Vite font paths) and `backend/.env`; `.local` is a junction to the main checkout's `.local`. All are git-ignored. PostgreSQL tests: export `.local/database.env`, set `DB_DATABASE=testpilot_test`, run `php artisan test` in backend (or `infra/test-postgres.ps1` in the main checkout). E2E DB `testpilot_e2e` is migrated to the M5 schema and seeded with BrowserTestSeeder. Windows Defender may block uploaded temp files that look like web shells — the service rejects unreadable uploads with 422.

Stage explicit paths only; no `git add .`; no push, deployment, DNS or global installs; do not modify Tharaa, EMC or LifeOS.
