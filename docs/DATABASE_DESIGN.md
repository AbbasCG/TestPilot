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
