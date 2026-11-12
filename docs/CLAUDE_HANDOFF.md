# Claude handoff

## Current continuation checkpoint — 2026-11-12

M2 environment edit/archive and membership removal implemented. M3 now has test_suites/test_cases/scenario_revisions, immutable full-content revisions, ScenarioController/Request/Resource/Service, all twelve step types, ten templates, visual library/builder/detail/history in frontend/src/testing. Follow CONTINUATION_REQUIREMENTS.md (verbatim user attachment) for M3→M4→M5; the official PHASE 0–22 text is still missing, but this attachment explicitly authorizes implementation. M3 passed 16 PostgreSQL tests / 121 assertions plus browser creation/edit/reload/history. M4 is next. Run `git log -1 --oneline` for the milestone commit. The sections below describe the original foundation and are retained as history until the final handoff rewrite.

## 1. What actually exists

A running, persisted foundation for Arabic RTL project quality management. Laravel/Sanctum session auth; PostgreSQL project/membership/environment/audit schema; scoped REST API; policy enforcement; version conflicts; real React dashboard and project flows. No M3/M4 domain implementation is claimed.

## 2. Files and components

- backend/app/Http/Controllers: AuthController, ProjectController, HealthController.
- backend/app/Http/Requests/ProjectRequest.php; Resources/ProjectResource.php; Policies/ProjectPolicy.php; Services/ProjectService.php.
- Models User, Project, Environment; project foundation migration and standard auth/session/cache/queue/Sanctum migrations.
- Console/Commands/CreateUser.php; Jobs/RecordQueueHeartbeat.php; routes/api.php and console.php.
- tests/Feature/ProjectFoundationTest.php and QueueHeartbeatTest.php; BrowserTestSeeder guarded to a dedicated e2e DB.
- frontend/src/App.tsx: Login, Shell, Dashboard, Projects, ProjectWizard, ProjectDetail, ProjectOverview, Team, EditProject, SettingsPage. api.ts implements relative fetch with CSRF and normalized errors. index.css is the design system; local Noto Sans Arabic.
- frontend/e2e/foundation.spec.ts and playwright.config.ts; two real browser tests with separate DB/API/frontend ports.
- infra: Compose, Dockerfiles, Nginx templates, PostgreSQL init, backup, local DB lifecycle and PostgreSQL test scripts. .github/workflows/ci.yml is check-only.

## 3. How it works

See SYSTEM_ARCHITECTURE.md and DATABASE_DESIGN.md. Project membership is the isolation boundary; owner/manager/tester/viewer are project roles. Owner alone changes memberships. Policy checks precede all scoped operations. Project edit is transactional/locked/versioned; activity shares the transaction. Future Tester A/B roles are separate and not yet implemented. The frontend never substitutes mock data for API results.

## 4. Local startup

See README.md and DEVELOPMENT_SETUP.md. Existing private configuration is in backend/.env and .local/database.env. Start only the TestPilot cluster with infra/dev-db.ps1 start if needed, backend on 127.0.0.1:8000 and Vite on 127.0.0.1:5173. Use `php artisan testpilot:user <email> --name=<name>` to create an account with a hidden password. Production credentials do not exist.

## 5. Tests

From root: infra/test-postgres.ps1. From frontend: npm run typecheck, npm run lint, npm run build, npm run test:e2e. Browser DB testpilot_e2e is migrated/seeded; regular DB remains independent. Last verified backend: 9 tests/46 assertions; Playwright: 2 passing tests. See IMPLEMENTATION_STATUS.md for coverage limits. Test artifacts under frontend/test-results are ignored.

## 6. Git handoff point

Implementation commits: `fd0cca0` (backend foundation), `2a9879f` (Arabic frontend and browser tests; latest application-code commit). Operations/documentation are committed separately after verification. For the exact final delivery commit use `git log -1 --format="%h %s"`; a document cannot embed the hash of its own commit without changing that hash. No remote or push. Do not redo scaffolding or reinitialize Git.

## 7. Remaining issues

The actual PHASE 0–22 reference is missing despite a follow-up designating it authoritative. MASTER_REQUIREMENTS.md explicitly records that fact, not invented requirements. M3/M4 cannot be claimed complete; M5–M8 remain in scope. Docker daemon unavailable; image build, Nginx runtime, TLS and restore unverified. Environment/member lifecycle gaps and settings limits are itemized in IMPLEMENTATION_STATUS.md.

## 8. Architectural decisions

Dedicated monorepo; Laravel API + React SPA, PostgreSQL; same-origin cookie auth rather than browser tokens; project policies rather than trusting client project IDs; atomic audit; optimistic versions and row locks; database queue/cache; private storage and no published DB port. Future immutable run snapshots, domain services and result ownership boundaries are documented as design intent, conditional on the official reference. No unrequested tenant/billing architecture was invented.

## 9. Next work in dependency order

1. Obtain the official source, preserve it completely, read every phase, map every requirement and reconcile M1/M2. User explicitly requires this before domain implementation.
2. Close source-required foundation gaps; retain tested auth/isolation contracts.
3. M3 suites/cases/revisions/ordered steps, role-aware scenarios/templates and real builder/detail UI with association validation.
4. M4 run snapshots, participants, step assignments, results, checkpoints and two-person integration/browser tests, including concurrent and unauthorized edits.
5. Map and implement all M5–M8 requirements without dropping future functionality.
6. Build/rehearse isolated Linux operations, backup/restore, HTTPS and rollback. Obtain explicit user approval before deployment or DNS changes; inspect existing VPS services first.

## 10. Do not repeat

Do not reinstall tools globally, move XAMPP, change PATH, recreate the PostgreSQL cluster, replace working auth with tokens, rerun test fixtures in the development database, recreate the React/Laravel scaffold, modify other projects or deploy. Preserve lockfiles, schema history, policies, versions, real API connections, RTL and the existing tests.

Laravel Boost dev dependency and generated backend AGENTS.md/CLAUDE.md came from scaffold setup. Read applicable guidelines; user instructions take precedence, especially no deployment and no global changes. Agency Agents are intended for the user's later Claude workflow; they were not claimed installed or used here.
