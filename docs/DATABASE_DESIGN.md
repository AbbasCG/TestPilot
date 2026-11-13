# Database design

PostgreSQL 18.6. Local cluster `.local/postgres`, loopback port 55432, SCRAM authentication. Databases `testpilot` (development), `testpilot_test` (PHPUnit), `testpilot_e2e` (browser tests). Never run RefreshDatabase against the development database.

| Table | Purpose and constraints |
|---|---|
| users | Unique email, hashed password, hidden password/remember token |
| projects | Owner FK restrict-delete; name, description, indexed status, version, timestamps |
| project_members | Project/user FKs cascade; unique `(project_id,user_id)`; authorization role |
| environments | Project FK cascade; unique `(project_id,name)`; optional HTTP(S) URL |
| activity_logs | Project FK cascade, actor FK nullable/set-null; action, JSON metadata, timestamp; project/time index |
| sessions | Laravel database session store |
| cache/cache_locks | Database cache and locks |
| jobs/job_batches/failed_jobs | Database queue infrastructure |
| personal_access_tokens | Sanctum standard migration; token issuance is not exposed |

Owner membership and project insertion share a transaction. Owner cannot be demoted by the membership endpoint. Roles/status are validated at the API boundary; enum CHECK constraints are a future migration hardening item. Audit records presently share project lifetime; immutable compliance retention is not claimed.

Project update uses `SELECT ... FOR UPDATE`, required client version, increment and audit in one transaction. Membership upsert takes a project row lock. Environments have uniqueness enforced in validation and the database. Environment editing/deletion and membership removal are not yet implemented.

Future entities: suites, cases and versioned steps, scenario templates/composition, immutable run snapshots, participants, step assignments/results and checkpoint arrivals. Exact columns await the authoritative PHASE 0–22 source; do not guess requirements. Enforce project association consistency at both validation and database boundaries.

Local development currently uses the isolated cluster owner role. Production init script creates a separate non-superuser application role owning only TestPilot's database; administrator credentials are only injected into PostgreSQL. Backups must include both DB and private storage when file support is added.

## M5 tables (migration 2026_11_12_080000)

| Table | Purpose and constraints |
|---|---|
| issues | Project FK; unique `(project_id, number)` and `(id, project_id)`; unique `step_result_id`; composite FKs to test_runs, test_cases, environments and duplicate issue within the same project; CHECK on status, severity, priority, no self-duplicate; environment snapshot; version; closed_at |
| issue_comments | Append-only comments per issue |
| issue_activities | Append-only timeline (created, updated, status_changed, commented, evidence_added, retest_*) with JSON metadata |
| retest_attempts | Composite FK to issue in the same project; unique `(issue_id, attempt_number)`; partial unique index: one `pending` per issue; immutable snapshot of steps/expected/original result; status pending/passed/failed/cancelled; version |
| evidence_files | Project FK; owner is an issue (composite FK), step result or retest attempt (`num_nonnulls >= 1`); kind CHECK; unique random path; mime, size, sha256, uploader |

Files live on the private `evidence` disk, never under `public`. Backups must include the evidence archive (infra/backup.sh).

## User management (migration 2026_11_13_000001)

| Table / column | Purpose and constraints |
|---|---|
| users.platform_role | NULL, `owner` or `admin` (CHECK) |
| users.status | `active`, `suspended`, `disabled` (CHECK); `status_reason`, `status_changed_at` |
| users.must_change_password, password_changed_at, last_login_at, created_by, version | Lifecycle and optimistic version; unique index on `lower(email)` |
| invitations | email (lower-case CHECK), project_id + project_role (both NULL or role in manager/tester/viewer), invited_by, `token_hash` (SHA-256, unique), status pending/accepted/revoked (expiry derived from `expires_at`), accepted/revoked fields, send_count, version; partial unique index: one pending per (email, project) |
| account_activities | Append-only account audit: actor, subject user, invitation, project, action, JSON metadata (no secrets), IP |

`password_reset_tokens` (Laravel) stores hashed reset tokens. No hard deletion of users.
