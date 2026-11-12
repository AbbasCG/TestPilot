export type ResultCounts = { total: number; executed: number; passed: number; failed: number; blocked: number; pending: number; pass_rate: number | null };

export type TrendPoint = { date: string; passed: number; failed: number; blocked: number; issues_opened: number; issues_resolved: number };

export type AnalyticsReport = {
  generated_at: string;
  project: { id: number; name: string; status: string };
  results: ResultCounts;
  runs: { total: number; by_status: Record<string, number>; by_outcome: Record<string, number> };
  issues: { total: number; open: number; critical_open: number; by_status: Record<string, number>; open_by_severity: Record<string, number> };
  retests: { passed: number; failed: number; pending: number; cancelled: number; first_attempt_pass_rate: number | null };
  testers: { user_id: number; name: string; role: string; runs: number; steps_executed: number; passed: number; failed: number; blocked: number; pass_rate: number | null; issues_reported: number; retests_executed: number; issues_resolved: number }[];
  history: { id: number; title: string; build_version: string; status: string; outcome: string | null; environment: string | null; created_at: string; completed_at: string | null; total: number; passed: number; failed: number; blocked: number; pending: number; pass_rate: number | null; issues: number }[];
  trends: TrendPoint[];
  builds: string[];
  readiness: { build: string; status: "ready" | "at_risk" | "not_ready"; results: ResultCounts; checks: { key: string; label: string; passed: boolean; detail: string }[] } | null;
};

export type ComparisonRow = { id: number; name: string; status: string; role: string; runs: number; executed: number; pass_rate: number | null; failed: number; blocked: number; open_issues: number; critical_open: number; last_build: string | null; last_run_at: string | null };

export const readinessLabels: Record<string, string> = { ready: "جاهز للإصدار", at_risk: "جاهزية مشروطة", not_ready: "غير جاهز" };

export const roleLabels: Record<string, string> = { owner: "مالك", manager: "مدير", tester: "مختبر", viewer: "مشاهد" };
