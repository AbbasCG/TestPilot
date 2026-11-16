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

## Redesign and daily test flow (2026-11-16, branch feature/testpilot-next)

- Backend: scenario import from JSON (kit, read-only preview, idempotent confirm, duplicate and changed-since-preview handling, project audit), solo sessions (`test_runs.mode`, server-side eligibility), project quick search, URL-friendly list filters, project `stats`, shared `ScenarioRules` used by both the editor and the importer. PHPUnit on PostgreSQL: 59 tests pass.
- Frontend: new shell (project switcher, Ctrl/⌘+K palette, mobile bottom bar), home = work list first, projects list with search/stats/«ابدأ الاختبار», next-step checklist on the project overview, scenario library as a URL-filtered table with «إنشاء سيناريو» and «استيراد ملف» (side panel: copy prompt, download template, upload, preview with located errors, confirm, result), advanced scenario settings behind a disclosure, guided runner as default (`?view=all` keeps the full ledger and the final assessment), solo/collaborative session type, focused run page, generic Arabic message for 5xx/network errors.
- GSAP (`gsap`, `@gsap/react`): step change, import panel, import result, disclosure; all via `gsap.matchMedia()` so reduced motion removes offsets. Bundle JS/gzip: 598.9 kB / 170.0 kB before, 710.1 kB / 208.9 kB after (+37 kB gzip: GSAP core plus new screens). Route-level code splitting (tests, runs, issues, analytics, users, project maintenance) then brought the entry chunk to 488.0 kB / 154.9 kB.
- Verification: `npm run typecheck`, `npm run build` clean; eslint clean (oxlint keeps a few fast-refresh warnings); Playwright 22 specs pass locally on Chrome, including new `guided-flows.spec.ts` (valid/invalid/duplicate import, URL filters, Ctrl+K, solo run, save failure + retry, resume, evidence-gated step, collaborative empty-role case, reduced motion). Comparison screenshots: `docs/redesign/before-*` / `after-*` (home, scenarios, runner, issue; light/dark 1440, light 390).
- Not done: users/admin: colour-coded stat cards, an active-filter summary with «مسح الفلاتر», a banner on suspended/disabled accounts, sticky table header (colours and focus use the shared tokens); analytics now leads with release readiness and the trend, then colour-coded KPI tiles, with the six export links folded into one «تصدير التقرير» menu; the editor keeps one form but each step now hides url/target/value/instructions/dependencies behind a «تفاصيل إضافية للخطوة» disclosure (no section navigation yet); the guided runner now shows the tester's own role tag and, on «both»/shared-checkpoint steps, the other tester's result for the same step (covered only for the role tag in Playwright; the partner panel has no browser test yet); route-level code splitting plus stable vendor chunks (react+router 258 kB, gsap 71 kB, tanstack-query 35 kB; entry chunk 488 → 195 kB) so app releases do not invalidate cached libraries; automated axe-core WCAG 2.1 A/AA scan (14 screens, light and dark; Playwright axe.spec.ts) is clean after raising muted/link contrast, but there is still no manual screen-reader test.

## User management (2026-11-13, branch feature/user-management)

- Platform roles (owner/admin) separate from project roles; account states active/suspended/disabled plus mandatory temporary-password change, enforced server-side on every API route.
- «إدارة المستخدمين»: overview with summary, search, filters, sorting, pagination; create-user wizard (lookup → details → invitation or temporary password); user detail with memberships, platform role, suspend/disable/reactivate, temporary password reissue and account activity timeline; invitations management.
- Secure invitations (hashed single-use tokens, expiry, resend rotation, revoke, inviter re-check); invitation acceptance page; forced first-login change; settings password change; forgot/reset password (mail only when configured, honest UI otherwise); suspended-account screen.
- «أعضاء الفريق» rebuilt on the same flows: Arabic states instead of "The selected email is invalid", no account enumeration for non-admin project owners.
- Verification: 46 PostgreSQL tests / 690 assertions; TypeScript, lint (2 old warnings), build; Playwright user-management journey with four independent browser contexts plus the updated existing specs. Independent security review: no Critical/High; all Medium and actionable Low findings fixed with tests.
- Not included: hard account deletion, breached-password check, SSO/2FA. CLI only for the first platform owner.

## Local readiness (2026-11-12)

- `main` (6b7067a) contains M1–M8, fonts and workflow; GitHub Actions green.
- Development database migrated to the M5 schema after a verified pg_dump backup; no accounts yet (owner-created via `testpilot:user`).
- Arabic two-browser runbook: LOCAL_TESTING_GUIDE_AR.md; project-local PHP upload limits for `artisan serve`.

## Repository and typography (2026-11-12, second session)

- GitHub: https://github.com/AbbasCG/TestPilot. `main` = stable base 7cb15eb (M1–M4); `dev` = M5–M8 plus the typography/workflow work; PR `dev` → `main` open for owner review. Policy in GIT_WORKFLOW.md and CLAUDE.md. CI runs on PRs and pushes to main/dev.
- Typography: Thmanyah Sans / Thmanyah Serif Display applied to every screen through `src/fonts.ts` and Tailwind tokens; the font files are committed with the owner's permission; Noto Sans Arabic fallback; verified by e2e/typography.spec.ts and a CI bundle check.
- CI fixes: stable accessible names for all labelled textareas (Chromium included typed text in the name), and a configurable login throttle (`LOGIN_ATTEMPTS_PER_MINUTE`, default 5) raised only for the isolated E2E server.
- Codex's uncommitted M5 draft: backed up (`.local/backups/codex-m5-draft-20261112`, local branch `backup/codex-m5-draft`), moved out of the main working tree; no unique work worth merging.

## Verification (first session, worktree branch)

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

## Deployment automation (prepared, not executed)

- `.github/workflows/deploy-production.yml`, `infra/deploy/testpilot-deploy.sh` and its offline `selftest.sh` (also run in CI) are written; docs in DEPLOYMENT_AUTOMATION.md. Not yet run on GitHub or the server: no dry run, no deploy. `AUTO_DEPLOY` is not set.
