# Requirements traceability

Sources: F = FOUNDATION_REQUEST.md, C = CONTINUATION_REQUIREMENTS.md, N = CONTINUATION_REQUIREMENTS_M5_M8.md. All official PHASE 0–22 sections remain absent.

| Source | Delivered | Evidence |
|---|---|---|
| F M1–M2 | Auth, isolated PostgreSQL, queue, RTL shell, projects/members/environments/dashboard | ProjectFoundationTest; foundation.spec |
| C §2–§3 | Lifecycle, suites, scenario builder, immutable revisions, templates; shared-prerequisite fix | ScenarioManagementTest (incl. `test_two_steps_may_share_the_same_prerequisite`); scenarios.spec |
| C §4 | Collaborative runs, A/B ownership, checkpoints, pause/resume, final assessment | CollaborativeRunTest; collaboration.spec |
| C §5.1–5.2 / N 3 | Results linked to tester and run; issue from failed result; linked result frozen | IssueWorkflowTest; IssueHardeningTest; issues.spec |
| N 3.1 | All issue fields, per-project number, comments, activity timeline | IssueService; migration 2026_11_12_080000; IssueWorkflowTest |
| N 3.2 | State machine with permissions, notes, versions, duplicate/defer/won't-fix/reopen | IssueWorkflow; IssueWorkflowTest; IssueHardeningTest; quality-gates concurrency |
| N 3.3 / C §5.4 | Private evidence, type/size checks, isolation, safe names, audit, no public URLs | EvidenceService; EvidenceSecurityTest; quality-gates evidence test |
| N 3.4 / C §5.7–5.8 | Retest attempts, independent tester, Verified/Reopened, history preserved | IssueWorkflowTest; IssueHardeningTest; issues.spec; full-workflow.spec |
| N 3.5 | Issues dashboard, list, detail, create, gallery, comments, timeline, retest screen, filters/search | frontend/src/issues; issues.spec; quality-gates a11y sweep |
| N 4 | Analytics metrics, readiness, trends, comparison; CSV/JSON/MD; Arabic PDF via print | AnalyticsService; ReportExporter; AnalyticsReportTest; IssueHardeningTest; full-workflow.spec (PDF) |
| N 5 | Tharaa project import, 6 suites, 13 scenarios, TEST-TEACHER-001, THR-AUD-143 known issue | ImportTharaa; database/data/tharaa.php; TharaaImportTest |
| N 6 | Backend, Playwright, security, a11y, RTL, responsive, authorization, isolation, concurrency, evidence security, full E2E | 36 PHPUnit tests; 9 Playwright tests; security + code review agents |
| N 7 | Design extended in the existing identity (issues, analytics, dark mode, mobile) without a rebuild | issues.css; analytics.css; screenshots in frontend/test-results (not committed) |
| N 8 | Logical commits, docs updated | git log 7cb15eb..HEAD |
| N 9 | Deployment review: GD, upload limits, evidence route body size, evidence backups | infra/*; DEPLOYMENT_PLAN.md |

Not traced to any source (not built): server-side PDF library, notifications/e-mail, integrations, real-time server.
