# Continuation requirements M5–M8 (received 2026-11-12)

Source: the owner's "TESTPILOT — CLAUDE CONTINUATION MASTER PROMPT" given to Claude Code on 2026-11-12. This is the authoritative scope for M5–M8 until the official PHASE 0–22 reference is supplied. Summary of the concrete requirements (the full Arabic prompt is kept in the session; the items below are the binding scope):

1. Phase 1 — review project state (docs, Git, DB, tests); treat MASTER_REQUIREMENTS.md as a placeholder; do not rebuild working features.
2. Phase 2 — use suitable agents/skills (backend, frontend, database, security, test automation, UI/UX, accessibility, final independent review; Frontend Design skill if installed).
3. Phase 3 — M5:
   - Issues created from a failed test result, with a unique per-project number, title, description, project, run, scenario, reproduction steps, expected and actual result, severity, priority, reporter, assignee, status, environment, build version, screenshots, comments and activity timeline.
   - Workflow New → Triaged → Assigned → In Progress → Ready for Retest → Verified → Closed, plus Reopened, Duplicate, Deferred, Won't Fix; validated transitions and permissions, not free-text status edits.
   - Secure evidence upload (screenshots, videos, attachments): private storage, validation, size limits, authorized downloads, project isolation, safe file names, type verification, audit logs; no public links.
   - Retest workflow: Ready for Retest → linked retest assigned to the right tester → tester executes and records → pass = Verified, fail = Reopened; keep every attempt and its evidence; never replace result history.
   - Frontend: issues dashboard, list, detail, create, evidence gallery, comments, activity timeline, retest screen, filters and search; Arabic RTL in the existing identity.
4. Phase 4 — M6: pass rate, failed and blocked tests, open and critical issues, retest results, tester productivity, execution history, release readiness, trends, project comparisons from real DB data; CSV, JSON, Markdown export, then an Arabic PDF if libraries and environment allow it safely.
5. Phase 5 — M7: prepare Tharaa (https://demo.tharaaplatform.com/, branch dev) as the first project; import scenarios from real documents if available; six suites (registration/onboarding, financial tools, learning/assessment, institutions/groups, permissions/isolation, phone and Kifah); each scenario with detailed Tester A and B steps, prerequisites, test data, expected results and shared checkpoints; start with TEST-TEACHER-001; do not modify Tharaa's database or create real users automatically; record THR-AUD-143 as a Known Issue that is not resolved.
6. Phase 6 — M8: backend, frontend and Playwright tests; security, accessibility, RTL, responsive, authorization, project isolation, concurrent collaboration and evidence security testing; full E2E: project → scenario → assign testers → run → A/B steps → failure → issue → screenshot → trial fix → retest → approve result → final report.
7. Phase 7 — design improvements without rebuilding the UI (dashboard, scenario builder, collaborative runner, issues, analytics, mobile, RTL, light/dark, accessibility).
8. Phase 8 — logical commits after tests, no `git add .`, no force push; update IMPLEMENTATION_STATUS, CLAUDE_HANDOFF, REQUIREMENTS_TRACEABILITY, ROADMAP accurately.
9. Phase 9 — review Docker Compose, Nginx, HTTPS, queue, scheduler and backups for https://qa.softbuild.nl on a Hetzner VPS with an independent PostgreSQL; no deployment or DNS change without approval.
10. Never modify Tharaa, EMC or LifeOS. Leave a stable state and an updated handoff if resources run out. Final report in Arabic.
