# Development setup (Windows)

## Verified environment, 2026-11-11

| Component | Observed version/location |
|---|---|
| PHP | 8.3.29, D:\xampp\php\php.exe (CLI only) |
| Composer | 2.8.6 |
| Node/npm | 24.19.0 / 12.2.2 |
| Git | 2.47.1.windows.2 |
| PostgreSQL | 18.6, C:\Program Files\PostgreSQL\18\bin |
| Docker client | 29.1.3; desktop-linux daemon unavailable |
| Laravel/Sanctum | 13.42.0 / 4.4.0 |
| React/TypeScript/Vite | 19.3.1 / 7.0.2 / 8.3.8 |
| Tailwind/Query/Router | 4.3.5 / 5.107.1 / 7.18.5 |
| Playwright | 1.65.0, installed Chrome for local tests |

PHP extensions verified include pdo_pgsql, pgsql, pdo_sqlite, mbstring, openssl, curl, fileinfo, bcmath, XML/DOM, zip and tokenizer. No global tool installation or PATH change was performed. No Apache/XAMPP services are needed. Compatibility was checked against https://laravel.com/docs/13.x and https://vite.dev/guide/; exact resolved versions are in lockfiles.

## Existing workspace

Dependencies already installed. `.local/database.env` holds the generated local PostgreSQL credential; `backend/.env` holds app key and connection settings. These files are ignored. Start only this cluster with `infra/dev-db.ps1 start` if stopped. It listens only on loopback port 55432.

From backend: `php artisan migrate`, then `php artisan serve --host=127.0.0.1 --port=8000`. From frontend: `npm run dev`. Open http://127.0.0.1:5173, consistently using the same hostname. Default Laravel APP_URL is backend localhost:8000; SPA stateful domains explicitly include 127.0.0.1:5173 and localhost:5173.

Create accounts with `php artisan testpilot:user user@example.com --name="Name"`; password is hidden and must be at least 12 characters. No signup, password reset mail or production default credentials are configured.

Background processes, each in its own terminal: `php artisan queue:work --tries=3 --timeout=60` and `php artisan schedule:work`. `php artisan testpilot:queue-probe` dispatches a heartbeat. On Windows, PHP lacks pcntl signal support; production Linux image explicitly installs pcntl. Production queue lifecycle must be rehearsed there.

## Rebuild on a fresh machine

Install approved PHP 8.3+ with required extensions, Composer, Node 24 and PostgreSQL 18 first; do not install globally without user permission. `composer install` in backend; `npm ci` in frontend. Copy backend/.env.example to backend/.env and run `php artisan key:generate`. Configure a dedicated database, not any existing project's DB.

For an isolated Windows cluster, use PostgreSQL `initdb -D <workspace>\.local\postgres -U testpilot -A scram-sha-256 --pwfile=<private temporary password file> --encoding=UTF8 --locale=C`, delete only the password file afterwards, then `infra/dev-db.ps1 start`. Create `testpilot`, `testpilot_test`, `testpilot_e2e` using createdb against 127.0.0.1:55432. Save connection values as `.local/database.env` and mirror them in backend/.env. Use secure generated secrets, not the test-only CI passwords.

## Tests

- `php artisan test` in backend uses ephemeral SQLite by default for fast tests.
- `infra/test-postgres.ps1` imports the private local credentials, selects only `testpilot_test`, runs the suite and restores process variables. This is the authoritative database check.
- `php vendor/bin/pint --test` checks backend style.
- In frontend: `npm run typecheck`, `npm run lint`, `npm run build`.
- To seed browser fixtures, temporarily set `DB_DATABASE=testpilot_e2e`, run `php artisan migrate --force` and `php artisan db:seed --class=BrowserTestSeeder --force`, then restore/remove that process variable. The seeder refuses non-local/testing environments and DB names not ending `_e2e`.
- `npm run test:e2e` starts API on 8001 and Vite on 5174 with separate cookie name and test database; it uses installed Chrome locally and Chromium in CI. The regular development servers on 8000/5173 can stay running.
- Fixture credentials exist only in BrowserTestSeeder/e2e tests. Never seed those accounts in development or production. Repeated browser runs create separate projects in the disposable e2e DB.

Network/process access inside Codex's sandbox required approved escalated execution for package downloads, PostgreSQL connections, PHP test subprocesses and browsers. This is an execution-environment limitation, not a requirement to run TestPilot as an administrator.

## Git workflow

Follow GIT_WORKFLOW.md: branch `feature/*` or `fix/*` from `dev`, test, commit with explicit paths, push the task branch, PR into `dev`, then one rolling PR `dev` → `main` merged only by the owner. Remote `origin` = https://github.com/AbbasCG/TestPilot (credentials through Git Credential Manager; never store tokens in the repo).

## Fonts (Thmanyah)

The interface uses Thmanyah Sans (300/400/500/700/900) and Thmanyah Serif Display (700/900). The seven `.woff2` files and the licence text are committed in `frontend/src/assets/fonts/thmanyah/` with the owner's permission (confirmed 2026-11-12). `src/fonts.ts` registers them with `font-display: swap`; Vite bundles them with hashed names into `dist/assets`, and CI asserts all seven are present. If a file were missing, the bundled Noto Sans Arabic is used. `e2e/typography.spec.ts` checks that the faces load and apply on every main screen. Do not treat `frontend/dist` as a source: `npm run build` empties it. The owner's original copies are also backed up in `.local/backups/fonts-thmanyah-original-20261112`.

## Manual two-browser test (local)

Full Arabic step-by-step guide: [LOCAL_TESTING_GUIDE_AR.md](LOCAL_TESTING_GUIDE_AR.md). Local uploads above XAMPP's 2 MB limit: start the API with `$env:PHP_INI_SCAN_DIR = "D:\Projects\TestPilot\infra\php-local"` (project-local ini, XAMPP untouched).


1. Start PostgreSQL (`infra/dev-db.ps1 start`), then in `backend`: `php artisan serve --host=127.0.0.1 --port=8000`; in `frontend`: `npm run dev`. Open http://127.0.0.1:5173.
2. Create accounts with `php artisan testpilot:user <email> --name="<name>"` (password typed hidden, at least 12 characters). Use two different browsers or one normal + one private window.
3. Owner: create a project, add an environment, add the second account as `tester` under أعضاء الفريق.
4. الاختبارات: create a suite and a ready scenario (or run `php artisan testpilot:import-tharaa <owner-email>` for the Tharaa suites).
5. جلسات الاختبار ← جلسة جديدة: choose Tester A and Tester B, select scenarios, start.
6. Each tester records their own steps; a failed step shows «إنشاء مشكلة من هذه النتيجة».
7. On the issue: upload a screenshot, triage, assign, start fix, send to retest (choose the other tester).
8. The retester opens «تنفيذ إعادة الاختبار», attaches evidence and records the result.
9. التحليلات: review readiness, export CSV/JSON/Markdown, open «تقرير قابل للطباعة / PDF» and print to PDF.
