# API reference — implemented endpoints

Base `/api`, JSON request/response; `Accept: application/json`. Authenticated operations use Sanctum session cookies. Fetch `/sanctum/csrf-cookie` before login, then send the decoded XSRF-TOKEN cookie as X-XSRF-TOKEN on writes. No bearer token issuance or public signup is implemented.

| Method | Path | Behavior |
|---|---|---|
| GET | `/sanctum/csrf-cookie` | CSRF/session initialization (outside API prefix) |
| GET | `/api/health` | DB-aware health, 200/503 |
| POST | `/api/login` | `{email,password}`, rate limited, session regeneration |
| POST | `/api/logout` | Auth required; invalidates session; 204 |
| GET | `/api/user` | Authenticated profile; no password/hash |
| GET | `/api/dashboard` | Scoped project, active project, environment counts |
| GET | `/api/projects?page=1` | Membership-scoped list, 20/page; Laravel `data/links/meta` |
| POST | `/api/projects` | `{name,description?,status?}`, owner membership; 201 |
| GET | `/api/projects/{id}` | Project, role, environments, members |
| PATCH | `/api/projects/{id}` | Owner/manager; `{name,description?,status?,version}` |
| POST | `/api/projects/{id}/environments` | Owner/manager; `{name,url?}`; 201 |
| PUT | `/api/projects/{id}/members` | Owner only; existing `{email,role}`; add or update |
| GET | `/api/projects/{id}/activity` | Last 30 events, descending ID |
| GET | `/up` | Laravel application liveness |

Single resources: `{data: {...}}`. Roles: owner (server-assigned), manager, tester, viewer. Project status: active/archived. An archived project currently remains editable; archive means a lifecycle label, not a lock.

Errors: 401 unauthenticated, 403 forbidden member action, 404 absent/outside project, 409 stale version, 419 missing/invalid CSRF proof, 422 validation (`message/errors`), 429 throttled, 503 health dependency failure. Project names max 120 chars, description 5000, environment names 80; environment URLs HTTP(S) only, max 2048.

No suite, case, scenario, run or result endpoints exist yet. Do not advertise or call invented routes. OpenAPI generation and expanded activity pagination can be added after the domain contract is established.
