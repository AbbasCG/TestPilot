# Requirements traceability

Current source C: CONTINUATION_REQUIREMENTS.md, preserved verbatim. All PHASE 0–22 sections remain absent; C explicitly authorizes implementation now.

| Current source | Delivered | Evidence |
|---|---|---|
| C §2 | Environment edit/archive/version, membership removal, owner invariant | ScenarioManagementTest lifecycle test; ProjectMaintenance UI |
| C §3.1 | Suites create/edit/order/archive and total/ready counts | ScenarioController; suite version/archive tests |
| C §3.2–3.3 | Complete scenario metadata and twelve ordered step types; visual persistent builder | ScenarioRequest/Service/Resource; TestManagement; browser workflow |
| C §3.4 | Immutable revisions on every edit; stale writes rejected | revision history and conflict tests |
| C §3.5 | Ten built-in templates and project reusable scenarios | all ten instantiated in backend tests |
| C §4 | Collaborative runs | Next milestone |
| C §5 | Results/issues/evidence/retest | After M4 |

The entries below are the preserved foundation checkpoint; this current source table takes precedence where functionality has advanced.

Source F: initial foundation prompt supplied on 2026-11-11. The user has confirmed that a separate PHASE 0–22 reference is authoritative; its text has not yet been received. Do not invent or collapse those phases.

| Source | Milestone | Implementation target | Verification |
|---|---|---|---|
| F §1–3 | M1 | Independent Laravel/React/PostgreSQL workspace | Runtime versions, migrations, builds |
| F §5 M1, §8 | M1 | Sanctum sessions, policies, validation, rate limits | Authentication and authorization tests |
| F §5 M2 | M2 | Projects, environments, memberships, live dashboard | Isolation, role and CRUD tests |
| F §5 M3 | M3 | Suites, cases, ordered steps, scenarios, templates | Await detailed source mapping |
| F §5 M4 | M4 | Participants, assignments, checkpoints, independent results | Two-user integration and concurrency tests |
| F §7 | Operations | Single-origin Nginx, private PostgreSQL, worker, scheduler | Compose validation, deployment rehearsal pending approval |
| F §11 | Handoff | Living documentation and logical commits | Git review and handoff |
| PHASE 0–22 | M1–M8 | Full mapping pending receipt of reference | Blocked: source text missing |

Future M5–M8 are reserved, not removed from scope. Their detailed requirements and dependencies must be retained verbatim and mapped when supplied.

## Delivered evidence

| Requirement | Implementation | Verified evidence / limit |
|---|---|---|
| M1 auth and security | AuthController, ProjectPolicy, api.php, AppServiceProvider, config/cors.php | ProjectFoundationTest and real-browser CSRF/login/logout |
| M1 database/queue | migrations, RecordQueueHeartbeat, console.php, infra/dev-db.ps1 | PostgreSQL migration/test run; real database job processed |
| M1 RTL/layout/theme | frontend/src/App.tsx, index.css, api.ts | Build/typecheck/lint; desktop/dark/mobile screenshot review; mobile width assertion |
| M2 projects | ProjectController, ProjectService, ProjectRequest, ProjectResource | CRUD/role/isolation/version tests and wizard browser test |
| M2 environments | environments table, environment controller action, ProjectOverview | Add/list persisted, uniqueness and URL validation; update/delete pending |
| M2 team | project_members, ProjectPolicy, member action, Team | Owner-only membership updates; second browser session; removal pending |
| M2 dashboard | dashboard action and Dashboard | Scoped DB counts and browser rendering, no mocks |
| M3/M4 | No domain entities implemented yet | Blocked on complete official source; M4 result security not claimed |
| Deployment preparation | infra/*, .github/workflows/ci.yml | Compose parses; Docker runtime and remote CI unverified |
| Handoff | README, CLAUDE, docs/* | Local commits and explicit next-step/known-issue registry |

The complete PHASE 0–22 placeholder registry is in ROADMAP.md. Replace source-pending entries with exact source requirement IDs and coverage after receipt; do not map phases to guessed meanings.
