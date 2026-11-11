# Architecture

## Implemented

Browser → same-origin React SPA → Laravel `/api` routes → FormRequest/validation → policy → controller → transactional service → Eloquent/PostgreSQL. `ProjectResource` defines project responses. Dashboard queries are scoped through the authenticated user's membership relation.

Local Vite proxies `/api` and `/sanctum` to port 8000. Production Nginx serves built assets and forwards API, Sanctum and health requests to PHP-FPM. All frontend API paths are relative; production hostname is an environment value.

Sanctum uses Laravel's web session, never localStorage bearer tokens. Login obtains the CSRF cookie, sends decoded X-XSRF-TOKEN, regenerates session ID; logout invalidates the session and rotates CSRF. Host-only cookies with SameSite=Lax; production uses Secure, HttpOnly session cookie and encrypted session payload. Cross-origin clients are not part of this scope. Login throttles both identity/IP and IP; authenticated API throttles by user.

Policies distinguish owner, manager, tester, viewer. Every project read checks membership; outsiders receive 404. Owner alone manages membership; owner/manager edits project and adds environments. Project creation creates owner membership atomically. Project update locks the row and compares a required version, returning 409 for a stale write. Activity is written in the mutation transaction, not asynchronously, so a committed mutation always has its audit entry.

Database queue and cache tables exist. RecordQueueHeartbeat is a real queued job scheduled every five minutes; its cache marker expires after fifteen. Worker and scheduler have separate deployment services. General health verifies PostgreSQL; queue freshness is not yet exposed as an operations dashboard.

## Extension seams for M3–M8 (design, not implemented)

Keep project membership as a stable security boundary. Add domain modules for case definition, scenario composition and run execution rather than expanding ProjectService. Case/step revisions must be snapshotted into a run so edits cannot rewrite historical results. Run participants and scenario Tester A/B roles are distinct from project authorization roles. Step results need `(run, step, participant)` uniqueness and explicit authorized writers; locks/version checks protect checkpoints and transitions. Validate all suite/case/environment/run associations within one project, preferably with composite database constraints where suitable.

Add domain events and idempotent queued handlers when the actual later-phase requirements justify them. Keep audit writes atomic; use an outbox for external side effects if required. Reserve private storage with authorized download controllers, content/type/size restrictions and malware scanning before attachments. Never expose storage via a public symlink for evidence files.

M5–M8 domain decisions remain conditional on the missing master source. This is an extension strategy, not a claim to have interpreted the unavailable phases. No billing, integrations or tenant hierarchy is invented.

Reference checked: https://laravel.com/framework/docs/sanctum and https://laravel.com/framework/docs/csrf. Laravel 13 also recognizes browser same-origin request metadata; the real-browser test separately proves a request without CSRF proof is rejected.
