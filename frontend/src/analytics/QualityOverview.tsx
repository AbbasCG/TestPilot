import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bug, ChevronLeft, ClipboardCheck, FolderKanban, Radar, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { issueStatuses, severities } from "../issues/types";
import { resultLabels } from "../testing/RunManagement";
import { Busy, Notice } from "../testing/shared";
import "./quality-overview.css";

type Outcome = "passed" | "failed" | "inconclusive";
type DashboardItem = { id: number; project_id: number; project_name: string; title: string };
type DashboardSummary = {
  projects: number;
  active_projects: number;
  environments: number;
  open_runs: number;
  open_issues: number;
  critical_open: number;
  my_pending_retests: number;
  outcomes_last_7_days: Record<Outcome, number>;
  my_runs: (DashboardItem & { status: "active" | "paused"; build_version: string })[];
  my_retests: (DashboardItem & { issue_id: number; number: number; build_version: string })[];
  critical_issues: (DashboardItem & { number: number; status: string; severity: "blocker" | "critical" })[];
};

const outcomes: Outcome[] = ["passed", "failed", "inconclusive"];

export function QualityOverview({ action }: { action: ReactNode }) {
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<{ data: DashboardSummary }>("/api/dashboard"),
  });
  const data = summary.data?.data;

  return (
    <div className="quality-overview">
      <header className="quality-hero">
        <div className="quality-hero-content">
          <h1>نظرة واضحة على الجودة</h1>
          <p>تابع جلساتك، وراجع نتائج الاختبار، واعرف ما يحتاج إلى متابعة.</p>
          <div className="quality-actions">
            {action}
            {data && (
              <button type="button" onClick={() => void summary.refetch()} disabled={summary.isFetching}>
                <RefreshCw size={16} /> {summary.isFetching ? "جارٍ التحديث…" : "تحديث اللوحة"}
              </button>
            )}
          </div>
        </div>
        <div className="quality-hero-art" aria-hidden="true"><Radar size={94} strokeWidth={0.9} /></div>
      </header>
      <Notice error={summary.error} />
      {summary.isPending ? <Busy /> : data ? <DashboardContent data={data} /> : (
        <button type="button" onClick={() => void summary.refetch()}><RefreshCw size={16} /> إعادة المحاولة</button>
      )}
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardSummary }) {
  const [work, setWork] = useState<"runs" | "retests">("runs");
  const metrics = [
    { icon: FolderKanban, label: "المشاريع النشطة", value: data.active_projects, detail: `من ${data.projects} مشروع · ${data.environments} بيئة`, tone: "blue" },
    { icon: Activity, label: "جلسات جارية", value: data.open_runs, detail: "قيد التنفيذ أو متوقفة مؤقتًا", tone: "teal" },
    { icon: Bug, label: "مشكلات مفتوحة", value: data.open_issues, detail: `${data.critical_open} حرجة أو معطّلة`, tone: "red" },
    { icon: ClipboardCheck, label: "إعادات اختبار بانتظارك", value: data.my_pending_retests, detail: "محاولات مسندة إليك", tone: "amber" },
  ];

  return (
    <>
      <dl className="quality-metrics" aria-label="مؤشرات الجودة">
        {metrics.map(({ icon: Icon, label, value, detail, tone }) => (
          <div className="panel quality-metric" key={label}>
            <dt><span className={`quality-icon ${tone}`}><Icon size={19} /></span>{label}</dt>
            <dd>{value}</dd>
            <dd className="quality-metric-detail">{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="quality-grid">
        <section className="panel quality-panel" aria-labelledby="quality-work-heading">
          <div className="quality-heading">
            <h2 id="quality-work-heading">قائمة مهامي</h2>
            <div className="quality-switch" role="group" aria-label="نوع المهام">
              <button type="button" aria-pressed={work === "runs"} onClick={() => setWork("runs")}>جلساتي</button>
              <button type="button" aria-pressed={work === "retests"} onClick={() => setWork("retests")}>إعادات الاختبار</button>
            </div>
          </div>
          {work === "runs" ? (
            data.my_runs.length > 0 ? (
              <ul className="quality-list">
                {data.my_runs.map((run) => (
                  <Item key={run.id} item={run} to={`/projects/${run.project_id}/runs/${run.id}`} detail={<bdi>{run.build_version}</bdi>}
                    badge={resultLabels[run.status]} tone={run.status === "active" ? "teal" : "amber"} />
                ))}
              </ul>
            ) : <Empty text="لا توجد جلسات جارية تشارك فيها." />
          ) : (
            data.my_retests.length > 0 ? (
              <ul className="quality-list">
                {data.my_retests.map((retest) => (
                  <Item key={retest.id} item={retest} to={`/projects/${retest.project_id}/issues/${retest.issue_id}/retest`}
                    detail={<><bdi>#{retest.number}</bdi> · <bdi>{retest.build_version}</bdi></>} badge="بانتظار التحقق" tone="amber" />
                ))}
              </ul>
            ) : <Empty text="لا توجد إعادات اختبار مسندة إليك." />
          )}
        </section>
        <section className="panel quality-panel" aria-labelledby="quality-outcomes-heading">
          <div className="quality-heading">
            <h2 id="quality-outcomes-heading">نتائج الجلسات</h2>
            <span className="quality-window">آخر 7 أيام</span>
          </div>
          <OutcomeSummary results={data.outcomes_last_7_days} />
        </section>
      </div>
      <section className="panel quality-panel" aria-labelledby="quality-issues-heading">
        <div className="quality-heading">
          <h2 id="quality-issues-heading">المشكلات الحرجة والمعطّلة</h2>
          {data.critical_open > data.critical_issues.length && (
            <span className="quality-window">معروض {data.critical_issues.length} من {data.critical_open}</span>
          )}
        </div>
        {data.critical_issues.length > 0 ? (
          <ul className="quality-list quality-issues">
            {data.critical_issues.map((issue) => (
              <Item key={issue.id} item={issue} to={`/projects/${issue.project_id}/issues/${issue.id}`}
                detail={<><bdi>#{issue.number}</bdi> · {issueStatuses[issue.status]}</>}
                badge={severities[issue.severity]} tone="red" />
            ))}
          </ul>
        ) : <Empty text="لا توجد مشكلات حرجة أو معطّلة مفتوحة في المشاريع النشطة." />}
      </section>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="quality-empty">{text}</p>;
}

function Item({ item, to, detail, badge, tone }: {
  item: DashboardItem; to: string; detail: ReactNode; badge: string; tone: string;
}) {
  return (
    <li>
      <Link className="quality-item" to={to}>
        <span className="quality-item-text">
          <strong>{item.title}</strong>
          <small>{item.project_name} · {detail}</small>
        </span>
        <span className={`quality-badge ${tone}`}>{badge}</span>
        <ChevronLeft size={17} aria-hidden="true" />
      </Link>
    </li>
  );
}

function OutcomeSummary({ results }: { results: Record<Outcome, number> }) {
  const total = outcomes.reduce((sum, outcome) => sum + results[outcome], 0);

  if (!total) return <Empty text="لا توجد جلسات مكتملة خلال آخر 7 أيام." />;

  return (
    <div className="quality-outcomes">
      <p><strong>{total}</strong> جلسة مكتملة</p>
      <div className="quality-outcomes-bar" aria-hidden="true">
        {outcomes.map((outcome) => <span key={outcome} className={outcome} style={{ flexGrow: results[outcome] }} />)}
      </div>
      <dl>
        {outcomes.map((outcome) => (
          <div key={outcome}>
            <dt><span className={outcome} />{resultLabels[outcome]}</dt>
            <dd>{results[outcome]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
