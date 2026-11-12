import { useState } from "react";
import { Link, Route, Routes, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bug, CheckCircle2, Download, FileJson, FileText, Gauge, Printer, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { api } from "../api";
import type { Project } from "../api";
import { Busy, Notice } from "../testing/shared";
import { resultLabels } from "../testing/RunManagement";
import type { AnalyticsReport, ComparisonRow, TrendPoint } from "./types";
import { readinessLabels, roleLabels } from "./types";

export function AnalyticsSection({ project }: { project: Project }) {
  return (
    <Routes>
      <Route index element={<AnalyticsPage project={project} />} />
      <Route path="report" element={<PrintableReport project={project} />} />
    </Routes>
  );
}

function useReport(projectId: number) {
  const [params, setParams] = useSearchParams();
  const days = params.get("days") ?? "30";
  const build = params.get("build") ?? "";
  const query = useQuery({
    queryKey: ["testing", projectId, "analytics", days, build],
    queryFn: () => api<{ data: AnalyticsReport }>(`/api/projects/${projectId}/analytics?days=${days}${build ? `&build=${encodeURIComponent(build)}` : ""}`),
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return { query, days, build, set, params };
}

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

function AnalyticsPage({ project: p }: { project: Project }) {
  const { query, days, build, set, params } = useReport(p.id);
  const exportUrl = (format: string, dataset?: string) => `/api/projects/${p.id}/reports/export?format=${format}&days=${days}${build ? `&build=${encodeURIComponent(build)}` : ""}${dataset ? `&dataset=${dataset}` : ""}`;
  const r = query.data?.data;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>التحليلات والتقارير</h2>
          <p className="muted">مؤشرات محسوبة مباشرة من النتائج والمشكلات وإعادة الاختبار المحفوظة.</p>
        </div>
        <Link className="button" to={`report?${params.toString()}`}>
          <Printer size={16} /> تقرير قابل للطباعة / PDF
        </Link>
      </div>
      <div className="analytics-filters panel padded" role="group" aria-label="نطاق التحليل">
        <label>
          فترة الاتجاهات
          <select value={days} onChange={(e) => set("days", e.target.value)}>
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يومًا</option>
            <option value="90">آخر 90 يومًا</option>
          </select>
        </label>
        <label>
          إصدار الجاهزية
          <select value={build || r?.readiness?.build || ""} onChange={(e) => set("build", e.target.value)} disabled={!r?.builds.length}>
            {!r?.builds.length && <option value="">لا توجد إصدارات</option>}
            {r?.builds.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <div className="export-links" aria-label="تصدير التقرير">
          <span className="muted">تصدير:</span>
          <a className="button" href={exportUrl("csv")} download>
            <Download size={15} /> CSV ملخص
          </a>
          <a className="button" href={exportUrl("csv", "runs")} download>
            CSV الجلسات
          </a>
          <a className="button" href={exportUrl("csv", "issues")} download>
            CSV المشكلات
          </a>
          <a className="button" href={exportUrl("csv", "testers")} download>
            CSV المختبرون
          </a>
          <a className="button" href={exportUrl("json")} download>
            <FileJson size={15} /> JSON
          </a>
          <a className="button" href={exportUrl("md")} download>
            <FileText size={15} /> Markdown
          </a>
        </div>
      </div>
      <Notice error={query.error} />
      {query.isPending ? <Busy /> : r && <ReportBody report={r} project={p} />}
    </>
  );
}

function ReportBody({ report: r, project: p, print }: { report: AnalyticsReport; project: Project; print?: boolean }) {
  const tiles = [
    { icon: Gauge, label: "نسبة النجاح", value: pct(r.results.pass_rate), hint: `${r.results.passed} من ${r.results.executed} خطوة منفذة` },
    { icon: XCircle, label: "خطوات فاشلة", value: r.results.failed, hint: `${r.results.pending} غير منفذة` },
    { icon: AlertTriangle, label: "خطوات متعذرة", value: r.results.blocked, hint: "Blocked" },
    { icon: Bug, label: "مشكلات مفتوحة", value: r.issues.open, hint: `${r.issues.total} إجمالًا` },
    { icon: ShieldAlert, label: "حرجة مفتوحة", value: r.issues.critical_open, hint: "معطِّلة أو حرجة" },
    { icon: RotateCcw, label: "إعادة الاختبار", value: `${r.retests.passed} / ${r.retests.failed}`, hint: `ناجحة / فاشلة · نجاح أول محاولة ${pct(r.retests.first_attempt_pass_rate)}` },
  ];
  return (
    <>
      <div className="kpi-grid">
        {tiles.map((t) => (
          <section className="stat kpi" key={t.label}>
            <t.icon size={20} aria-hidden="true" />
            <span>{t.label}</span>
            <strong>{t.value}</strong>
            <small>{t.hint}</small>
          </section>
        ))}
      </div>
      <div className="analytics-grid">
        <Readiness report={r} />
        <section className="panel padded">
          <h3>اتجاه النتائج المسجلة</h3>
          <p className="muted chart-sub">كل حفظ لنتيجة خطوة في اليوم، من السجل غير القابل للتعديل.</p>
          <TrendChart points={r.trends} print={print} />
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>إنتاجية المختبرين</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>العضو</th>
                <th>جلسات</th>
                <th>خطوات منفذة</th>
                <th>نسبة النجاح</th>
                <th>فاشلة / متعذرة</th>
                <th>مشكلات مبلّغ عنها</th>
                <th>إعادة اختبار منفذة</th>
                <th>مشكلات أُصلحت</th>
              </tr>
            </thead>
            <tbody>
              {r.testers.map((t) => (
                <tr key={t.user_id}>
                  <td>
                    {t.name} <small className="muted">{roleLabels[t.role]}</small>
                  </td>
                  <td>{t.runs}</td>
                  <td>{t.steps_executed}</td>
                  <td>
                    <Meter value={t.pass_rate} />
                  </td>
                  <td>
                    {t.failed} / {t.blocked}
                  </td>
                  <td>{t.issues_reported}</td>
                  <td>{t.retests_executed}</td>
                  <td>{t.issues_resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h2>سجل التنفيذ</h2>
          <span className="muted">آخر 50 جلسة</span>
        </div>
        {r.history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الجلسة</th>
                  <th>الإصدار</th>
                  <th>البيئة</th>
                  <th>الحالة / التقييم</th>
                  <th>ناجحة</th>
                  <th>فاشلة</th>
                  <th>متعذرة</th>
                  <th>معلّقة</th>
                  <th>نسبة النجاح</th>
                  <th>مشكلات</th>
                </tr>
              </thead>
              <tbody>
                {r.history.map((h) => (
                  <tr key={h.id}>
                    <td>{print ? h.title : <Link className="text-link" to={`/projects/${p.id}/runs/${h.id}`}>{h.title}</Link>}</td>
                    <td dir="ltr">{h.build_version}</td>
                    <td>{h.environment ?? "—"}</td>
                    <td>
                      {resultLabels[h.status]}
                      {h.outcome && ` · ${resultLabels[h.outcome]}`}
                    </td>
                    <td className="num">{h.passed}</td>
                    <td className="num">{h.failed}</td>
                    <td className="num">{h.blocked}</td>
                    <td className="num">{h.pending}</td>
                    <td>
                      <Meter value={h.pass_rate} />
                    </td>
                    <td>{h.issues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">لا توجد جلسات بعد.</p>
        )}
      </section>
    </>
  );
}

function Meter({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  return (
    <span className="meter">
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${value}%` }} />
      </span>
      <span className="num">{value}%</span>
    </span>
  );
}

function Readiness({ report: r }: { report: AnalyticsReport }) {
  if (!r.readiness)
    return (
      <section className="panel padded readiness">
        <h3>جاهزية الإصدار</h3>
        <p className="muted">ابدأ جلسة اختبار بإصدار محدد لعرض الجاهزية.</p>
      </section>
    );
  const s = r.readiness.status;
  const Icon = s === "ready" ? CheckCircle2 : s === "at_risk" ? AlertTriangle : XCircle;
  return (
    <section className={`panel padded readiness readiness-${s}`} aria-labelledby="readiness-title">
      <h3 id="readiness-title">
        جاهزية الإصدار <span dir="ltr">{r.readiness.build}</span>
      </h3>
      <p className="readiness-verdict">
        <Icon size={22} aria-hidden="true" /> {readinessLabels[s]}
      </p>
      <ul className="readiness-checks">
        {r.readiness.checks.map((c) => (
          <li key={c.key} className={c.passed ? "ok" : "fail"}>
            {c.passed ? <CheckCircle2 size={16} aria-label="متحقق" /> : <XCircle size={16} aria-label="غير متحقق" />}
            <span>{c.label}</span>
            <small className="num">{c.detail}</small>
          </li>
        ))}
      </ul>
      <p className="hint">المعايير ثابتة وظاهرة: لا يُعتبر الإصدار جاهزًا إلا إذا تحققت جميعها.</p>
    </section>
  );
}

const SERIES = [
  { key: "passed", label: "ناجحة" },
  { key: "blocked", label: "متعذرة" },
  { key: "failed", label: "فاشلة" },
] as const;

function TrendChart({ points, print }: { points: TrendPoint[]; print?: boolean }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((pt) => pt.passed + pt.failed + pt.blocked));
  const total = points.reduce((sum, pt) => sum + pt.passed + pt.failed + pt.blocked, 0);
  const height = 180;
  const width = 640;
  const slot = width / points.length;
  const bar = Math.max(3, Math.min(22, slot - 4));
  const day = (d: string) => new Date(d).toLocaleDateString("ar", { day: "numeric", month: "short" });
  const tickEvery = Math.ceil(points.length / 6);
  const active = hover !== null ? points[hover] : null;
  return (
    <div className="trend">
      <div className="chart-head">
        <ul className="legend" aria-label="مفتاح الألوان">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`swatch series-${s.key}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        {!print && (
          <button type="button" className="text-button" onClick={() => setTable(!table)} aria-pressed={table}>
            {table ? "عرض كرسم" : "عرض كجدول"}
          </button>
        )}
      </div>
      {total === 0 && !table ? (
        <p className="muted chart-empty">لا توجد نتائج مسجلة في هذه الفترة.</p>
      ) : table ? (
        <div className="table-wrap">
          <table className="trend-table">
            <thead>
              <tr>
                <th>اليوم</th>
                <th>ناجحة</th>
                <th>فاشلة</th>
                <th>متعذرة</th>
                <th>مشكلات فُتحت</th>
                <th>مشكلات حُلّت</th>
              </tr>
            </thead>
            <tbody>
              {points
                .filter((pt) => pt.passed + pt.failed + pt.blocked + pt.issues_opened + pt.issues_resolved > 0)
                .map((pt) => (
                  <tr key={pt.date}>
                    <td>{day(pt.date)}</td>
                    <td>{pt.passed}</td>
                    <td>{pt.failed}</td>
                    <td>{pt.blocked}</td>
                    <td>{pt.issues_opened}</td>
                    <td>{pt.issues_resolved}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-frame" dir="ltr">
          {/* Time runs left-to-right even in RTL so the latest day sits at the familiar end of the axis. */}
          <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={`نتائج مسجلة يوميًا: ${total} نتيجة خلال ${points.length} يومًا`}>
            {[0.5, 1].map((f) => (
              <g key={f}>
                <line x1={0} x2={width} y1={height - f * height} y2={height - f * height} className="grid" />
                <text x={width} y={height - f * height - 4} textAnchor="end" className="axis">
                  {Math.round(max * f)}
                </text>
              </g>
            ))}
            <line x1={0} x2={width} y1={height} y2={height} className="baseline" />
            {points.map((pt, i) => {
              let y = height;
              const x = i * slot + (slot - bar) / 2;
              const sum = pt.passed + pt.failed + pt.blocked;
              return (
                <g
                  key={pt.date}
                  tabIndex={sum ? 0 : -1}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className={hover === i ? "bar-group active" : "bar-group"}
                  aria-label={`${day(pt.date)}: ${pt.passed} ناجحة، ${pt.failed} فاشلة، ${pt.blocked} متعذرة`}
                >
                  <rect x={i * slot} y={0} width={slot} height={height} className="hit" />
                  {SERIES.map((s, si) => {
                    const value = pt[s.key];
                    if (!value) return null;
                    const h = Math.max(2, (value / max) * height);
                    y -= h;
                    const top = SERIES.slice(si + 1).every((later) => !pt[later.key]);
                    return <rect key={s.key} x={x} y={y + (top ? 0 : 2)} width={bar} height={Math.max(1, h - (top ? 0 : 2))} rx={top ? 3 : 0} className={`series-${s.key}`} />;
                  })}
                  {i % tickEvery === 0 && (
                    <text x={i * slot + slot / 2} y={height + 17} textAnchor="middle" className="axis">
                      {day(pt.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {active && (
            <div className="chart-tooltip" dir="rtl" role="status" style={{ left: `${((hover! + 0.5) / points.length) * 100}%` }}>
              <strong>{day(active.date)}</strong>
              {SERIES.map((s) => (
                <span key={s.key}>
                  <i className={`key series-${s.key}`} aria-hidden="true" />
                  <b>{active[s.key]}</b> {s.label}
                </span>
              ))}
              <span className="muted">
                مشكلات: {active.issues_opened} فُتحت · {active.issues_resolved} حُلّت
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PrintableReport({ project: p }: { project: Project }) {
  const { query } = useReport(p.id);
  if (query.isPending) return <Busy />;
  if (!query.data) return <Notice error={query.error} />;
  const r = query.data.data;
  return (
    <article className="print-report">
      <div className="section-heading no-print">
        <Link to={`/projects/${p.id}/analytics`}>العودة إلى التحليلات</Link>
        <button className="primary" type="button" onClick={() => window.print()}>
          <Printer size={16} /> طباعة أو حفظ PDF
        </button>
      </div>
      <header className="print-header">
        <p className="muted">TestPilot · تقرير جودة</p>
        <h2 className="print-title">{r.project.name}</h2>
        <p className="muted">أُنشئ في {new Date(r.generated_at).toLocaleString("ar")} من بيانات المشروع الفعلية.</p>
      </header>
      <ReportBody report={r} project={p} print />
    </article>
  );
}

export function ProjectComparison() {
  const query = useQuery({ queryKey: ["analytics", "comparison"], queryFn: () => api<{ data: ComparisonRow[] }>("/api/analytics/projects") });
  if (query.isPending) return <Busy />;
  if (!query.data?.data.length) return <Notice error={query.error} />;
  return (
    <section className="panel comparison">
      <div className="panel-title">
        <h2>مقارنة المشاريع</h2>
        <span className="muted">المشاريع التي أنت عضو فيها فقط</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>المشروع</th>
              <th>جلسات</th>
              <th>خطوات منفذة</th>
              <th>نسبة النجاح</th>
              <th>فاشلة / متعذرة</th>
              <th>مشكلات مفتوحة</th>
              <th>حرجة مفتوحة</th>
              <th>آخر إصدار</th>
            </tr>
          </thead>
          <tbody>
            {query.data.data.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link className="text-link" to={`/projects/${row.id}/analytics`}>
                    {row.name}
                  </Link>
                </td>
                <td>{row.runs}</td>
                <td>{row.executed}</td>
                <td>
                  <Meter value={row.pass_rate} />
                </td>
                <td>
                  {row.failed} / {row.blocked}
                </td>
                <td>{row.open_issues}</td>
                <td>{row.critical_open ? <span className="severity severity-critical">{row.critical_open}</span> : 0}</td>
                <td dir="ltr">{row.last_build ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
