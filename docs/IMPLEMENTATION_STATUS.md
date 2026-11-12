# Implementation status — current checkpoint 2026-11-12

## Continuation checkpoint (supersedes the historical foundation record below)

M2 lifecycle gaps now have environment edit/archive with version conflicts and owner-controlled membership removal. M3 is implemented against CONTINUATION_REQUIREMENTS.md: suites create/edit/order/archive/counts; full scenario fields; visual ordered step builder with all twelve types; independent immutable revisions; dependency validation; ten built-in templates and reusable project scenarios; real API/UI. Tests: 16 backend tests / 121 assertions on PostgreSQL; scenario builder browser test passes, including reload and old revision display. Existing foundation browser checks passed during this stage. TypeScript/build and ESLint (Babel parser for TS7) verified. M4 is next, not yet implemented. PHASE 0–22 remains absent, but the latest attachment explicitly authorizes these domain features.

## Historical foundation record (2026-11-11)

## Complete (verified deliverables, not full master-reference acceptance)

- Independent Git workspace at D:\Projects\TestPilot; Laravel 13.42, Sanctum 4.4, React 19.3, TypeScript 7, Vite 8.3 and Tailwind 4.3 installed with lockfiles.
- Dedicated PostgreSQL 18.6 cluster on loopback port 55432; development, PHPUnit and browser databases separated. Migrations applied successfully.
- Session login/logout, CSRF, login/API rate limits, hashed passwords, CLI account provisioning, project policy authorization.
- Project create/list/detail/edit, optimistic version conflict handling, environments add/list, members add/update/list, roles and transactional audit trail.
- Live dashboard counts, Arabic RTL login/shell/sidebar/topbar, project wizard/detail/team/settings, light/dark theme, responsive styling and real API integration.
- Queue job dispatched and processed using database queue; five-minute schedule registered; DB-aware health endpoint.
- Backend: 9 tests / 46 assertions pass on PostgreSQL (also SQLite). Includes 2 scaffold smoke tests; substantive coverage is authentication, roles, isolation, validation, version conflicts and queue heartbeat expiry.
- Frontend TypeScript, lint, production build pass. Two Playwright tests pass against PostgreSQL: full two-user project-membership browser workflow and CSRF rejection. This is **not** the unimplemented M4 collaborative-run test.
- Login/desktop/dark/mobile screenshots inspected; screenshot files are test artifacts, not mock production data.
- Docker Compose syntax validated with dummy secrets; CI and deployment preparation files written.

## In Progress

- M1/M2 final acceptance: functional foundation verified against the initial attachment, but reconciliation with the official PHASE 0–22 source remains necessary.
- Source traceability: available requirements mapped, full phase registry reserved in ROADMAP.md.

## Pending

- M3 suites/cases/ordered steps, prerequisites/results, scenarios, templates and builder.
- M4 run snapshots, participants, assignments/checkpoints, per-tester results and full two-person testing workflow.
- M5–M8 complete scope and implementation, to be mapped verbatim from the official reference.
- Expanded lifecycle/settings/account management, activity pagination, immutable retention policy and production monitoring as required by the reference.
- Linux Docker image build/runtime checks, TLS, backup/restore drill and deployment rehearsal.

## Blocked

- Official PHASE 0–22 content was not present in the user's follow-up. MASTER_REQUIREMENTS.md is a clearly labeled placeholder; FOUNDATION_REQUEST.md contains the original attachment verbatim. Do not claim the official reference was read.
- Docker engine is not running locally. Only Compose parsing was verified; no images/containers have been built or launched.
- Production deployment/DNS changes are explicitly prohibited until user approval.

## Known issues and limits

- Environments currently add/list only; membership removal and environment editing/deletion are not implemented. Account settings are read-only except browser theme; no public signup/password-reset flow.
- No suite/case/scenario/run UI or API exists. Cross-project **test** isolation and tester result ownership cannot be tested until those entities exist. Project isolation is covered now.
- Local app role is the isolated development cluster owner; production init script creates a non-superuser role.
- Archive is a status label, not a write lock. Audit rows cascade with a project (no project deletion endpoint exists). Role/status DB CHECK constraints are not yet added.
- frontend/src/App.tsx contains the initial pages; split into feature modules before growing M3. Generated backend welcome/assets remain scaffold-only and are not the product frontend.
- CI has not been run remotely; no remote exists. Container tags are major/stable tags and must be pinned to approved digests before release.

No existing Tharaa, EMC or LifeOS project was modified. No global installation, PATH change, remote push, DNS change or deployment was performed.
