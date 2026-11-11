# Roadmap and dependency order

1. Receive and preserve the complete official PHASE 0–22 reference in MASTER_REQUIREMENTS.md. Map every phase and requirement to M1–M8, implementation files and verification. Do not drop future features.
2. Reconcile M1/M2 foundation against that source. Current account provisioning is CLI-only, settings show account/theme only; environments support add/list, memberships add/update/list. Add lifecycle actions and authorization changes if required by the source. Expand tests before marking full milestone acceptance.
3. M3: implement suites/cases with prerequisites and expected results; transactional ordered steps; separate Tester A/B scenario roles; scenario builder/template CRUD, linking and reordering; API policies/resources/FormRequests; real Arabic screens. Validate cross-project references and revisions.
4. M4 (depends on M3): immutable run snapshots, participants, assignments, per-tester result ownership, shared checkpoints/barrier rules, idempotent persistence and audit. Prove a full two-person workflow, unauthorized result edits, cross-project isolation, concurrent updates and browser refresh recovery. The current two-user membership browser test does **not** satisfy this acceptance criterion.
5. M5–M8: retained, blocked on actual source. Assign exact scope and dependencies after reading every phase; do not fabricate names or remove unimplemented features.
6. Operations hardening: build containers, Linux queue rehearsal, backup/restore, secret management, HTTPS rehearsal, log retention, monitoring and release/rollback drill. Production remains prohibited until explicit approval.

## Full phase registry (source pending)

| Official phase | Source | Milestone assignment |
|---|---|---|
| PHASE 0 | Awaiting full text | Pending |
| PHASE 1 | Awaiting full text | Pending |
| PHASE 2 | Awaiting full text | Pending |
| PHASE 3 | Awaiting full text | Pending |
| PHASE 4 | Awaiting full text | Pending |
| PHASE 5 | Awaiting full text | Pending |
| PHASE 6 | Awaiting full text | Pending |
| PHASE 7 | Awaiting full text | Pending |
| PHASE 8 | Awaiting full text | Pending |
| PHASE 9 | Awaiting full text | Pending |
| PHASE 10 | Awaiting full text | Pending |
| PHASE 11 | Awaiting full text | Pending |
| PHASE 12 | Awaiting full text | Pending |
| PHASE 13 | Awaiting full text | Pending |
| PHASE 14 | Awaiting full text | Pending |
| PHASE 15 | Awaiting full text | Pending |
| PHASE 16 | Awaiting full text | Pending |
| PHASE 17 | Awaiting full text | Pending |
| PHASE 18 | Awaiting full text | Pending |
| PHASE 19 | Awaiting full text | Pending |
| PHASE 20 | Awaiting full text | Pending |
| PHASE 21 | Awaiting full text | Pending |
| PHASE 22 | Awaiting full text | Pending |
