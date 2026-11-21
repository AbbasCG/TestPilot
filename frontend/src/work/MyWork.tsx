import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bug, ChevronLeft, ClipboardCheck, Play, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { issueStatuses, severities } from "../issues/types";
import { Busy, Notice } from "../testing/shared";
import "../analytics/quality-overview.css";
import "./my-work.css";

type Base = { id: number; project_id: number; project_name: string; title: string };
type MyRun = Base & { status: "active" | "paused"; build_version: string; my_role: "A" | "B"; my_pending: number; my_total: number };
type MyRetest = Base & { issue_id: number; number: number; severity: string; attempt_number: number; build_version: string };
type MyIssue = Base & { number: number; status: string; severity: string; priority: string };
type MyWorkData = { counts: Record<"runs" | "retests" | "issues", number>; runs: MyRun[]; retests: MyRetest[]; issues: MyIssue[] };

const severityTone = (s: string) => (s === "blocker" || s === "critical" ? "red" : s === "major" ? "amber" : "blue");

/** Everything assigned to the signed-in user across active projects: their sessions, retests and issues. */
export function MyWork() {
  const work = useQuery({ queryKey: ["my-work"], queryFn: () => api<{ data: MyWorkData }>("/api/my-work") });
  const data = work.data?.data;
  const total = data ? data.counts.runs + data.counts.retests + data.counts.issues : 0;

  return (
    <div className="quality-overview my-work">
      <header className="quality-bar">
        <div>
          <h1>عملي</h1>
          <p className="muted">
            {data ? (total ? `${total} مهمة بانتظارك عبر مشاريعك النشطة.` : "لا شيء بانتظارك الآن.") : " "}
          </p>
        </div>
        {data && (
          <button type="button" onClick={() => void work.refetch()} disabled={work.isFetching}>
            <RefreshCw size={16} aria-hidden /> {work.isFetching ? "جارٍ التحديث…" : "تحديث"}
          </button>
        )}
      </header>
      <Notice error={work.error} />
      {work.isPending ? (
        <Busy />
      ) : data ? (
        <>
          <nav className="my-work-jump" aria-label="أقسام عملي">
            <a href="#my-runs"><Play size={16} aria-hidden /> جلساتي <span className="count">{data.counts.runs}</span></a>
            <a href="#my-retests"><ClipboardCheck size={16} aria-hidden /> إعادات الاختبار <span className="count">{data.counts.retests}</span></a>
            <a href="#my-issues"><Bug size={16} aria-hidden /> مشكلات مسندة إليّ <span className="count">{data.counts.issues}</span></a>
          </nav>

          <Section id="my-runs" title="جلساتي الجارية" shown={data.runs.length} count={data.counts.runs} empty="لا توجد جلسات جارية تشارك فيها.">
            {data.runs.map((run) => {
              const done = run.my_total - run.my_pending;
              const finished = run.my_pending === 0;
              return (
                <li key={run.id}>
                  <Link className="quality-item" to={`/projects/${run.project_id}/runs/${run.id}`}>
                    <span className="quality-item-text">
                      <strong>{run.title}</strong>
                      <small>
                        {run.project_name} · <bdi>{run.build_version}</bdi> · <span className="tester-tag">Tester {run.my_role}</span>
                      </small>
                      <span className="my-progress">
                        <progress max={run.my_total || 1} value={done} aria-label={`أنجزت ${done} من ${run.my_total} خطوة`} />
                        <small>{finished ? "أنهيت خطواتك" : `${run.my_pending} متبقية من ${run.my_total}`}</small>
                      </span>
                    </span>
                    <span className={`quality-badge ${run.status === "paused" ? "amber" : finished ? "teal" : "blue"}`}>
                      {run.status === "paused" ? "متوقفة مؤقتًا" : finished ? "بانتظار الإغلاق" : "أكمل الاختبار"}
                    </span>
                    <ChevronLeft size={17} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </Section>

          <Section id="my-retests" title="إعادات اختبار بانتظاري" shown={data.retests.length} count={data.counts.retests} empty="لا توجد إعادات اختبار مسندة إليك.">
            {data.retests.map((r) => (
              <li key={r.id}>
                <Link className="quality-item" to={`/projects/${r.project_id}/issues/${r.issue_id}/retest`}>
                  <span className="quality-item-text">
                    <strong><bdi>#{r.number}</bdi> {r.title}</strong>
                    <small>
                      {r.project_name} · الإصدار <bdi>{r.build_version}</bdi> · المحاولة {r.attempt_number}
                    </small>
                  </span>
                  <span className={`quality-badge ${severityTone(r.severity)}`}>{severities[r.severity] ?? r.severity}</span>
                  <ChevronLeft size={17} aria-hidden />
                </Link>
              </li>
            ))}
          </Section>

          <Section id="my-issues" title="مشكلات مسندة إليّ" shown={data.issues.length} count={data.counts.issues} empty="لا توجد مشكلات مفتوحة مسندة إليك.">
            {data.issues.map((issue) => (
              <li key={issue.id}>
                <Link className="quality-item" to={`/projects/${issue.project_id}/issues/${issue.id}`}>
                  <span className="quality-item-text">
                    <strong><bdi>#{issue.number}</bdi> {issue.title}</strong>
                    <small>{issue.project_name} · {issueStatuses[issue.status] ?? issue.status}</small>
                  </span>
                  <span className={`quality-badge ${severityTone(issue.severity)}`}>{severities[issue.severity] ?? issue.severity}</span>
                  <ChevronLeft size={17} aria-hidden />
                </Link>
              </li>
            ))}
          </Section>
        </>
      ) : (
        <button type="button" onClick={() => void work.refetch()}><RefreshCw size={16} aria-hidden /> إعادة المحاولة</button>
      )}
    </div>
  );
}

function Section({ id, title, shown, count, empty, children }: { id: string; title: string; shown: number; count: number; empty: string; children: ReactNode }) {
  return (
    <section className="panel quality-panel" id={id} aria-labelledby={`${id}-heading`} tabIndex={-1}>
      <div className="quality-heading">
        <h2 id={`${id}-heading`}>{title} <span className="count">{count}</span></h2>
        {count > shown && <span className="quality-window">معروض {shown} من {count}</span>}
      </div>
      {shown > 0 ? <ul className="quality-list">{children}</ul> : <p className="quality-empty">{empty}</p>}
    </section>
  );
}
