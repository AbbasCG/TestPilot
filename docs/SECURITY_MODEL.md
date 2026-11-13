# Security model — TestPilot

## Authentication

- Laravel Sanctum stateful SPA sessions (same origin), CSRF via `XSRF-TOKEN`/`X-XSRF-TOKEN`, session regeneration on login, invalidation on logout. Sanctum's `AuthenticateSession` stores the password hash in the session, so changing a password signs out other sessions on their next request; the database session rows of the user are also deleted.
- Passwords: `hashed` cast (bcrypt/argon per Laravel config). Policy (`AccountService::passwordRule`): 12–128 characters, letters, mixed case, a number. Never logged; `password`, `password_confirmation`, `current_password`, `temporary_password` and `token` are excluded from flashed input.
- Login throttle: 5/min per e-mail+IP and 30/min per IP (`LOGIN_ATTEMPTS_PER_MINUTE`, default 5; raised only for the isolated E2E server).

## Authorization layers

1. **Account state** — `account.usable` middleware on every authenticated API route:
   - `suspended` / `disabled` → signed out, `403 {code: account_inactive}`; login refused with the same code.
   - `must_change_password` → only `GET /api/user`, `POST /api/logout`, `POST /api/account/password`; everything else `403 {code: password_change_required}`. The SPA shows only the change screen, but the server enforces it.
2. **Platform roles** (`users.platform_role`): `owner` and `admin` may use the users console (`can:manageUsers`). Only an active platform owner grants or removes platform roles; admins cannot manage owner/admin accounts; nobody changes their own status; the last active owner can never be demoted, suspended or disabled. Platform roles never bypass project policies (an admin who is not a project member still gets 404 on that project's data).
3. **Project roles** (`project_members.role`: owner, manager, tester, viewer) remain the boundary for all project data. Membership changes go through `MembershipService` (project owner or platform admin), which protects the project owner and refuses demoting/removing participants of active runs.

## Accounts and invitations

- Admin-created accounts get a temporary password (typed or generated with `Str::password(20)` until it satisfies the policy). It is hashed, returned once in the creation/reset response, never stored in plain text, logged or written to audit metadata, and forces a change at first login.
- Invitations: 48-character random token, only its SHA-256 hash stored; bound to the lower-case e-mail and (optionally) a project and role; expire after `INVITATION_TTL_HOURS` (168); single use (row lock + state check); revocable; resending rotates the token and invalidates the old link; one pending invitation per e-mail and project (partial unique index).
- Acceptance re-checks that the inviter still manages the project. Pending invitations of a user are revoked when that user is suspended, disabled or loses a platform role. Existing accounts accept only while signed in as the invited e-mail and only after any temporary password was changed.
- Delivery: e-mail only when `TESTPILOT_MAIL_ENABLED=true`. Otherwise the link is shown once to the inviter (local/manual mode). In manual mode the inviter technically holds the link, so hand it over through a trusted channel; prefer enabling mail in production.

## Account discovery

- Project owners who are not platform admins always add people through invitations. `members/resolve`, `PUT members` and invitation creation never reveal whether an e-mail has an account elsewhere; the invitation preview shows `account_exists` only to the signed-in invitee, and anonymous acceptance validates name and password before any account check.
- `POST /api/password/forgot` returns the same body for known and unknown addresses, sends the reset mail after the response (no timing oracle) and, with mail disabled, explains that an administrator must issue a temporary password. Reset tokens use Laravel's broker (hashed, 60-minute expiry, single use, throttled).

## Audit

- `account_activities` (append-only): account creation, password changes and admin resets (without values), status and platform-role changes with reason, membership changes, invitation create/resend/revoke/accept, refused logins of inactive accounts. Sensitive keys are stripped defensively by `AccountAudit`.
- Project `activity_logs` keep membership changes per project.

## Rate limits

`invitations` (30/hour per actor, `INVITATIONS_PER_HOUR`), `invitation-public` (30/min per IP), `password-recovery` (5/min per e-mail+IP, 20/min per IP), `password-change` (10/min per user), `admin-actions` (`ADMIN_ACTIONS_PER_MINUTE` × 4 per admin), `api` (120/min per user), `evidence` uploads (20/min).

## Known limits

- No hard deletion of accounts (test history and audit integrity); use `disabled`.
- No breached-password (HIBP) check — it would call an external service.
- Session revocation by row deletion requires the `database` session driver (the default here); other drivers rely on Sanctum's password-hash check and the account middleware.
- The first platform owner is created once from the CLI (`testpilot:user … --platform-role=owner` or `testpilot:platform-owner`); there is deliberately no open "first-run" web setup.
