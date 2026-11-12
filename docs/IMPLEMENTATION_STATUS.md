# Implementation status — 2026-11-12 (Claude continuation)

Sources: FOUNDATION_REQUEST.md (M1–M4), CONTINUATION_REQUIREMENTS.md (M2–M5), CONTINUATION_REQUIREMENTS_M5_M8.md (M5–M8). The official PHASE 0–22 reference is still missing (MASTER_REQUIREMENTS.md is a placeholder); nothing here claims master-phase coverage.

## Implemented

- M1–M4: unchanged foundation, projects, scenario builder with immutable revisions, collaborative two-tester runs (see git history up to 7cb15eb).
- M3 fix: two steps may now share one prerequisite (the wildcard `distinct` rule wrongly rejected it); duplicates inside one step are still rejected.
- M5 issues: created from a saved failed/blocked step result (or standalone), unique per-project number, all required fields, environment snapshot and build; explicit state machine (`IssueWorkflow`) with manager/assignee permissions, notes required for reasoned transitions, optimistic versions, row locks; comments; activity timeline; filters, search and sorting; summary dashboard. A result linked to an issue is frozen.
- M5 evidence: private `evidence` disk, random project-prefixed names, finfo + magic-byte verification, image decode/re-encode with pixel cap, per-kind size limits, per-item and per-project quotas, no SVG/HTML/executables, authorized download only (`nosniff`, sandbox CSP, `no-store`, inline only for images/video), upload/download audit. Evidence attaches to issues, own step results (unblocks evidence-required steps) and retest attempts.
- M5 retest: Ready for Retest requires fix notes, build and an independent tester (not the fixer, not the requester) and creates an immutable attempt snapshot; only that tester records pass (→ Verified) or fail (→ Reopened); manager may reassign or move back to In Progress (attempt cancelled, kept). All attempts and evidence preserved.
- M5 UI: issues dashboard with stats, severity strip and "my retests"; list with filters/search/pagination; create (prefilled from the frozen run snapshot); detail with workflow panel, evidence gallery/upload, retest history, comments, timeline; dedicated retest screen; runner links to create/view issues and per-step evidence upload.
- M6 analytics: pass rate, failed/blocked, open/critical issues, retest outcomes and first-attempt pass rate, tester productivity, execution history (50 runs), daily trends (latest state per result per day; fixes verified by retest), release readiness per build with seven visible checks, cross-project comparison (member projects only). Exports: CSV (summary/runs/issues/testers, BOM, formula-injection safe), JSON, Markdown (escaped), all audited. Arabic PDF via a printable RTL report and the browser's print engine (no new server dependency); verified by generating a PDF in Playwright.
- M7 Tharaa: `php artisan testpilot:import-tharaa owner@email [--dry-run]` — additive, idempotent, never creates accounts or touches Tharaa. 6 suites, 13 scenarios from Tharaa's verified demo scenario document (b7785e2), each with A/B steps, prerequisites, test data, expected results and shared checkpoints, starting with TEST-TEACHER-001. THR-AUD-143 imported as an open, triaged Known Issue. Kifah tours scenario is a draft because the tours are not deployed on Demo (Tharaa doc B11).
- M8: review-driven hardening (see CLAUDE_HANDOFF), concurrency/security/accessibility Playwright gates, deployment asset fixes for uploads.

## Verification (this session, worktree branch)

- PostgreSQL (`testpilot_test`): 36 tests, 513 assertions pass.
- TypeScript, ESLint/oxlint (2 pre-existing Fast Refresh warnings), production build pass.
- Playwright: 9/9 pass in installed Chrome — foundation, CSRF, scenario builder, collaboration, issues/evidence/retest, full UI lifecycle with PDF report, concurrent numbering/stale transitions, evidence security over HTTP, and an accessibility/RTL/responsive (1440 and 390 px)/dark-mode sweep of 8 screens.
- Independent security review (no Critical/High) and code review; all actionable findings fixed with tests.
- `docker compose config` validates; `backup.sh` passes `sh -n`.

## Not done / limits

1. Arabic PDF is browser-generated (print → PDF); no server-side PDF endpoint (would need a new dependency such as mPDF — owner approval required).
2. No frontend unit-test runner exists (Vitest not installed); frontend behaviour is covered by Playwright. Accessibility checks are scripted (labels, names, alt, ids, lang/dir, overflow, focus), not an axe/screen-reader audit.
3. Videos are not transcoded (metadata kept); inline MP4 has no byte-range support; no malware scanning; orphan-file sweep after hard crashes not implemented.
4. Development DB (`testpilot`) has no accounts and is not migrated to the M5 schema from this branch (the main checkout contains an uncommitted Codex draft of the same migration filename). Run `php artisan migrate` after merging, create an owner with `testpilot:user`, then `testpilot:import-tharaa`.
5. Docker images, TLS, restore drill and remote CI still unverified (Docker daemon unavailable). No deployment, DNS or push performed.
6. Real-time sync is still polling (3 s on runs).
