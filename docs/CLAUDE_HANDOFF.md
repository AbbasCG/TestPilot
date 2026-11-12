# Claude handoff — 2026-11-12

## Resume here

M1–M4 are implemented against FOUNDATION_REQUEST.md and CONTINUATION_REQUIREMENTS.md. M3 commit: 38f564f. Collaborative implementation is the next local commit; obtain its exact hash with `git log -1 --oneline` (a document cannot contain its own commit hash). No remote exists. Do not reinitialize or scaffold again.

Read CLAUDE.md, IMPLEMENTATION_STATUS.md and REQUIREMENTS_TRACEABILITY.md. MASTER_REQUIREMENTS.md is a placeholder: none of the official PHASE 0–22 source sections was actually supplied. The continuation explicitly permits implementation now. Do not invent M6–M8 requirements or claim full master acceptance.

## Implementation map

- Backend project foundation: ProjectController/Service/Policy, AuthController; environment and membership lifecycle.
- M3: ScenarioController/Request/Resource/Service; TestSuite, TestCase, ScenarioRevision; config/scenario_templates.php; test management migration.
- M4: RunController, RunRequest, RunService, TestRun; collaborative runs migration. Tables: test_runs, run_participants, run_cases, step_results, result_history.
- Snapshots pin full scenario revision and environment details. Result ownership is checked server-side, even for project owners. Project/run locks and optimistic versions prevent conflicts. Every result update appends history. Completion is an explicit authorized assessment, never automatic checkbox success.
- Frontend: src/testing/TestManagement.tsx, ProjectMaintenance.tsx, RunManagement.tsx, types.ts, shared.tsx; App.tsx route integration; index.css responsive RTL.
- Pages: /projects/:id/tests, tests/new, tests/:scenarioId, tests/:scenarioId/edit; runs, runs/new, runs/:runId.
- API: project-scoped suites, scenarios, revisions, templates/options; runs GET/POST, runs/{run} GET, results/{result} PUT, transition POST, history GET. Inspect backend/routes/api.php for exact paths.

## Verification

21 PostgreSQL tests / 181 assertions pass. TypeScript, lint, production build and Pint pass. Two nonblocking Fast Refresh export warnings. Collaboration browser test passes with two independent browser contexts, persisted results after reload, synchronization, checkpoint ownership and explicit completion. The reload assertion uses the textbox accessible role: implicit label text can include textarea contents after remount.

## Next work, in order

1. Complete M5: issue creation from a failed saved result, private authenticated screenshot uploads with byte validation/reencoding, issue state/version history, linked retest after fix. Preserve original run and failure history. No placeholder controls.
2. Add relevant backend ownership/isolation/MIME/conflict tests and real browser issue/evidence/retest flow.
3. Review cross-scenario dependency changes: same-scenario downstream passed steps lock prerequisite edits; equivalent cross-case invalidation needs review.
4. Reconcile M1–M8 when actual master source arrives; retain every phase in ROADMAP.md.
5. Operations rehearsal remains pending. Deployment and DNS are prohibited.

## Local operation

Working directory D:\Projects\TestPilot. Start isolated PostgreSQL with `./infra/dev-db.ps1 start`. Configuration already exists in ignored backend/.env and .local/database.env; never print or commit secrets. Development DB testpilot; unit/integration DB testpilot_test; browser DB testpilot_e2e. Run `php artisan migrate` in backend for development updates; migrate the E2E DB separately. Never reset development data.

Backend: `php artisan serve --host=127.0.0.1 --port=8000` in backend. Frontend: `npm run dev` in frontend. Provision a local account using `php artisan testpilot:user email --name=Name` (hidden password). Backend checks: `./infra/test-postgres.ps1`. Frontend checks: npm run typecheck, npm run lint, npm run build, npm run test:e2e. Playwright owns ports 8001/5174, uses installed Chrome and isolated seeded accounts. Fixtures are guarded to the E2E database.

Stage explicit paths only; never .local, .env, vendor, node_modules or test artifacts. No git add .; no push/deployment/DNS/global tools; do not modify Tharaa, EMC or LifeOS.

Final browser regression: all 4 Playwright tests passed (53.2 seconds).
