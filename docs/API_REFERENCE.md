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

Scenario, suite and run endpoints are listed in backend/routes/api.php (M3–M4).

## M5 issues, evidence, retests

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/{id}/issues` | Filters `status` (or `open`), `severity`, `priority`, `assignee_id`, `reporter_id`, `test_run_id`, `search` (title/description/#number), `sort` newest/updated/severity; 25/page |
| GET | `/api/projects/{id}/issues-summary` | Open, critical open, ready for retest, mine, by status/severity, retest counts |
| POST | `/api/projects/{id}/issues` | Non-viewer. Fields title, description, reproduction_steps, expected_result, actual_result, severity (blocker/critical/major/minor/trivial), priority (urgent/high/medium/low), build_version?, step_result_id? (failed/blocked, once), environment_id? |
| GET | `/api/projects/{id}/issues/{issue}` | Detail with run/step, comments, activities, retests, evidence and the caller's allowed `permissions.transitions` |
| PATCH | `/api/projects/{id}/issues/{issue}` | Reporter or manager; `version` required; severity/priority manager-only after triage |
| POST | `/api/projects/{id}/issues/{issue}/transition` | `{to, version, note?, assignee_id?, duplicate_of_id?, retest_assignee_id?, build_version?, environment_id?}`; 403 not allowed, 409 stale, 422 invalid |
| POST | `/api/projects/{id}/issues/{issue}/comments` | Non-viewer `{body}` |
| GET | `/api/projects/{id}/retests/mine` | Caller's pending retests |
| PUT | `/api/projects/{id}/retests/{retest}` | Retest assignee only `{version, status passed/failed, actual_result, notes?, verified}` |
| PUT | `/api/projects/{id}/retests/{retest}/assignee` | Manager `{assignee_id, version}` |
| POST | `/api/projects/{id}/evidence` | Multipart `{file, kind screenshot/video/attachment, issue_id | step_result_id | retest_attempt_id}`; throttled 20/min |
| GET | `/api/projects/{id}/evidence/{evidence}` | Member download; `?inline=1` for images/video; audited |

## M6 analytics

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/projects/{id}/analytics?days=7|30|90&build=` | Full report (results, runs, issues, retests, testers, history, trends, builds, readiness) |
| GET | `/api/projects/{id}/reports/export?format=csv|json|md&dataset=summary|runs|issues|testers` | Attachment download, audited |
| GET | `/api/analytics/projects` | Comparison across the caller's member projects |

## User management (2026-11-13)

All authenticated routes pass `account.usable`: inactive accounts get `403 {code: account_inactive}`, temporary-password accounts get `403 {code: password_change_required}` except on `GET /api/user`, `POST /api/logout`, `POST /api/account/password`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/user` | Self: id, name, email, platform_role, status, must_change_password, password_changed_at |
| POST | `/api/account/password` | `{current_password, password, password_confirmation}`; clears must_change_password; revokes other sessions |
| GET | `/api/auth/options` | Public `{mail_enabled}` |
| POST | `/api/password/forgot` | Public `{email}`; identical response for any address; e-mail only when mail is enabled |
| POST | `/api/password/reset` | Public `{token, email, password, password_confirmation}` (Laravel broker) |
| GET | `/api/invite/{token}` | Public preview: state, email, project name, role, inviter, expiry; `account_exists` only for the signed-in invitee |
| POST | `/api/invite/{token}/accept` | New account `{name, password, password_confirmation}` (signs in); existing account must be signed in as the invitee |
| GET/POST | `/api/projects/{p}/invitations` | Project owner or platform admin; POST `{email, role}` → `{invitation, delivery, token?}` (token only when mail is disabled) |
| POST | `/api/projects/{p}/members/resolve` | `{email}` → member / pending_invitation / unknown (non-admins) or not_found / existing_active / existing_inactive (admins) |
| PUT | `/api/projects/{p}/members` | Change an existing member's role; platform admins may add an existing active account directly |
| POST | `/api/invitations/{id}/resend` · `/revoke` | Resend rotates the token |
| GET | `/api/admin/users` | Platform admins: `search, state, platform_role, project_id, sort, direction, page` + `summary` |
| GET | `/api/admin/users/lookup?email=` | Account summary + pending invitations |
| POST | `/api/admin/users` | `{email, method: invitation|temporary_password, name, project_id, project_role, platform_role (owner only), password_mode: generate|manual, temporary_password}`; `409 {code: account_exists, user}` for duplicates; generated password returned once |
| GET/PATCH | `/api/admin/users/{id}` | Detail (projects, activity, invitations) / `{name, version}` |
| PUT | `/api/admin/users/{id}/platform-role` | Platform owner only `{platform_role}` |
| POST | `/api/admin/users/{id}/status` | `{status: active|suspended|disabled, reason}` |
| POST | `/api/admin/users/{id}/temporary-password` | `{password_mode, temporary_password?}` |
| PUT/DELETE | `/api/admin/users/{id}/memberships[/{project}]` | `{project_id, role}` |
| GET | `/api/admin/projects`, `/api/admin/invitations` | Selection list; invitations with `state, search` |
