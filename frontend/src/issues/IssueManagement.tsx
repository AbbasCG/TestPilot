import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Bug, CheckCircle2, ClipboardCheck, Plus, RotateCcw, Search, UserCheck } from "lucide-react";
import { api } from "../api";
import type { Project, User } from "../api";
import { Busy, Notice } from "../testing/shared";
import type { Run } from "../testing/RunManagement";
import { EvidenceGallery, EvidenceUpload } from "./Evidence";
import type { Issue, IssueRow, IssueSummary, Retest } from "./types";
import { activityLabels, formatDate, issuePriorities, issueStatuses, noteRequired, severities, transitionLabels } from "./types";

export function IssueManagement({ project }: { project: Project }) {
  return (
    <Routes>
      <Route index element={<IssueDashboard project={project} />} />
      <Route path="new" element={<CreateIssue project={project} />} />
      <Route path=":issueId" element={<IssueDetail project={project} />} />
      <Route path=":issueId/retest" element={<RetestScreen project={project} />} />
    </Routes>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`issue-status status-${status}`}>{issueStatuses[status] ?? status}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`severity severity-${severity}`}>{severities[severity] ?? severity}</span>;
}

function useMe() {
  return useQuery({ queryKey: ["user"], queryFn: () => api<{ data: User }>("/api/user") });
}

function IssueDashboard({ project: p }: { project: Project }) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const filters = ["status", "severity", "priority", "assignee_id", "sort", "page"].reduce<Record<string, string>>((all, key) => {
    const value = params.get(key);
    if (value) all[key] = value;
    return all;
  }, {});
  if (params.get("search")) filters.search = params.get("search")!;
  const query = new URLSearchParams(filters).toString();
  const summary = useQuery({ queryKey: ["testing", p.id, "issues-summary"], queryFn: () => api<{ data: IssueSummary }>(`/api/projects/${p.id}/issues-summary`) });
  const list = useQuery({ queryKey: ["testing", p.id, "issues", query], queryFn: () => api<{ data: IssueRow[]; current_page: number; last_page: number; total: number }>(`/api/projects/${p.id}/issues?${query}`) });
  const mine = useQuery({ queryKey: ["testing", p.id, "my-retests"], queryFn: () => api<{ data: { id: number; issue_id: number; number: number; title: string; attempt_number: number; build_version: string; severity: string }[] }>(`/api/projects/${p.id}/retests/mine`) });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const s = summary.data?.data;
  const cards = [
    { icon: Bug, label: "مشكلات مفتوحة", value: s?.open, filter: () => set("status", "open") },
    { icon: AlertOctagon, label: "حرجة أو معطِّلة مفتوحة", value: s?.critical_open, filter: () => set("status", "open") },
    { icon: RotateCcw, label: "بانتظار إعادة الاختبار", value: s?.ready_for_retest, filter: () => set("status", "ready_for_retest") },
    { icon: UserCheck, label: "مسندة إليّ", value: s?.assigned_to_me },
  ];
  const page = Number(params.get("page") ?? 1);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>إدارة المشكلات</h2>
          <p className="muted">من النتيجة الفاشلة إلى الإصلاح وإعادة الاختبار، مع أدلة خاصة وسجل كامل.</p>
        </div>
        {p.role !== "viewer" && p.status !== "archived" && (
          <Link className="primary button" to="new">
            <Plus size={17} /> مشكلة جديدة
          </Link>
        )}
      </div>
      <Notice error={summary.error || list.error || mine.error} />
      <div className="stats issue-stats">
        {cards.map((c) => (
          <section className="stat" key={c.label}>
            <c.icon size={22} />
            <span>{c.label}</span>
            <strong>{c.value ?? "—"}</strong>
          </section>
        ))}
      </div>
      {s && s.total > 0 && (
        <section className="panel padded severity-strip" aria-label="المشكلات المفتوحة حسب الخطورة">
          <h3>المفتوحة حسب الخطورة</h3>
          <div className="severity-bars">
            {Object.keys(severities).map((key) => (
              <button type="button" key={key} className={`severity-bar severity-${key}`} onClick={() => { set("severity", key); set("status", "open"); }} aria-label={`${severities[key]}: ${s.open_by_severity[key] ?? 0}`}>
                <span>{severities[key]}</span>
                <strong>{s.open_by_severity[key] ?? 0}</strong>
              </button>
            ))}
          </div>
          <p className="hint">
            محاولات إعادة الاختبار: {s.retests.passed ?? 0} ناجحة · {s.retests.failed ?? 0} فاشلة · {s.retests.pending ?? 0} معلّقة
          </p>
        </section>
      )}
      {!!mine.data?.data.length && (
        <section className="panel padded my-retests">
          <h3>
            <ClipboardCheck size={18} /> إعادة اختبار مطلوبة منك
          </h3>
          <ul>
            {mine.data.data.map((r) => (
              <li key={r.id}>
                <Link className="text-link" to={`${r.issue_id}/retest`}>
                  #{r.number} {r.title}
                </Link>
                <span className="muted">
                  محاولة {r.attempt_number} · <span dir="ltr">{r.build_version}</span>
                </span>
                <SeverityBadge severity={r.severity} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <form
          className="issue-filters"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set("search", search.trim());
          }}
        >
          <label className="search-field">
            <span className="sr-only">بحث في المشكلات</span>
            <Search size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالعنوان أو الوصف أو #الرقم" maxLength={120} />
          </label>
          <label>
            الحالة
            <select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
              <option value="">الكل</option>
              <option value="open">المفتوحة فقط</option>
              {Object.entries(issueStatuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            الخطورة
            <select value={params.get("severity") ?? ""} onChange={(e) => set("severity", e.target.value)}>
              <option value="">الكل</option>
              {Object.entries(severities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            الأولوية
            <select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
              <option value="">الكل</option>
              {Object.entries(issuePriorities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            المكلَّف
            <select value={params.get("assignee_id") ?? ""} onChange={(e) => set("assignee_id", e.target.value)}>
              <option value="">الكل</option>
              {p.members?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            الترتيب
            <select value={params.get("sort") ?? "newest"} onChange={(e) => set("sort", e.target.value)}>
              <option value="newest">الأحدث</option>
              <option value="updated">آخر تحديث</option>
              <option value="severity">الأخطر أولًا</option>
            </select>
          </label>
          <button type="submit">بحث</button>
        </form>
        {list.isPending ? (
          <Busy />
        ) : list.data?.data.length ? (
          <>
            <div className="table-wrap">
              <table className="issue-table">
                <thead>
                  <tr>
                    <th>المشكلة</th>
                    <th>الحالة</th>
                    <th>الخطورة</th>
                    <th>الأولوية</th>
                    <th>المكلَّف</th>
                    <th>الأدلة / إعادة الاختبار</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link className="scenario-title" to={String(i.id)}>
                          <span className="issue-number" dir="ltr">
                            #{i.number}
                          </span>
                          {i.title}
                        </Link>
                        <small className="muted">
                          {i.reporter_name} · {formatDate(i.created_at)}
                          {i.build_version && (
                            <>
                              {" "}
                              · <span dir="ltr">{i.build_version}</span>
                            </>
                          )}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={i.status} />
                      </td>
                      <td>
                        <SeverityBadge severity={i.severity} />
                      </td>
                      <td>{issuePriorities[i.priority]}</td>
                      <td>{i.assignee_name ?? <span className="muted">غير مسندة</span>}</td>
                      <td>
                        {i.evidence_count} / {i.retest_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                صفحة {page} من {list.data.last_page} · {list.data.total} مشكلة
              </span>
              <button disabled={page <= 1} onClick={() => set("page", String(page - 1))}>
                السابق
              </button>
              <button disabled={page >= list.data.last_page} onClick={() => set("page", String(page + 1))}>
                التالي
              </button>
            </div>
          </>
        ) : (
          <div className="empty">
            <CheckCircle2 size={32} />
            <h3>{query && query !== "sort=newest" ? "لا توجد مشكلات مطابقة للتصفية" : "لا توجد مشكلات مسجلة"}</h3>
            <p>أنشئ مشكلة من نتيجة فاشلة داخل جلسة الاختبار لربطها بالمختبر والسيناريو تلقائيًا.</p>
          </div>
        )}
      </section>
    </>
  );
}

function buildReproduction(run: Run, resultId: number): { step: string; expected: string; actual: string; steps: string } | null {
  const result = run.results.find((r) => r.id === resultId);
  if (!result) return null;
  const runCase = run.cases.find((c) => c.id === result.run_case_id);
  if (!runCase) return null;
  const index = runCase.snapshot.steps.findIndex((s) => s.id === result.step_key);
  const step = runCase.snapshot.steps[index];
  const tester = run.participants.find((t) => t.id === result.participant_id);
  const lines = runCase.snapshot.steps.slice(0, index + 1).map((s, i) => `${i + 1}. [Tester ${s.assigned_role === "both" ? "A+B" : s.assigned_role}] ${s.title}${s.instructions ? ` — ${s.instructions}` : ""}`);
  return {
    step: step.title,
    expected: step.expected_result,
    actual: result.actual_result ?? "",
    steps: `السيناريو: ${runCase.snapshot.title} (v${runCase.snapshot.version})\nالبيئة: ${run.environment_snapshot.name}\nالمنفّذ: Tester ${tester?.role} — ${tester?.name}\n\n${lines.join("\n")}`,
  };
}

function CreateIssue({ project: p }: { project: Project }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const resultId = Number(params.get("result")) || null;
  const runId = Number(params.get("run")) || null;
  const run = useQuery({ queryKey: ["testing", p.id, "run", String(runId)], queryFn: () => api<{ data: Run }>(`/api/projects/${p.id}/runs/${runId}`), enabled: !!runId });
  const prefill = useMemo(() => (run.data && resultId ? buildReproduction(run.data.data, resultId) : null), [run.data, resultId]);
  if (p.role === "viewer") return <p className="empty">ليس لديك صلاحية إنشاء مشكلات.</p>;
  if (runId && run.isPending) return <Busy />;
  return <IssueForm key={prefill ? "prefilled" : "blank"} project={p} prefill={prefill} resultId={prefill ? resultId : null} run={run.data?.data ?? null} onCreated={(issue) => { cache.invalidateQueries({ queryKey: ["testing", p.id] }); navigate(`/projects/${p.id}/issues/${issue.id}`); }} error={run.error} />;
}

function IssueForm({ project: p, prefill, resultId, run, onCreated, error }: { project: Project; prefill: ReturnType<typeof buildReproduction>; resultId: number | null; run: Run | null; onCreated: (issue: Issue) => void; error: Error | null }) {
  const [form, setForm] = useState({
    title: prefill ? `فشل: ${prefill.step}` : "",
    description: "",
    reproduction_steps: prefill?.steps ?? "",
    expected_result: prefill?.expected ?? "",
    actual_result: prefill?.actual ?? "",
    severity: "major",
    priority: "medium",
    build_version: run?.build_version ?? "",
    environment_id: "",
  });
  const update = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const save = useMutation({
    mutationFn: () =>
      api<{ data: Issue }>(`/api/projects/${p.id}/issues`, "POST", {
        ...form,
        build_version: form.build_version || null,
        environment_id: resultId ? null : form.environment_id ? Number(form.environment_id) : null,
        step_result_id: resultId,
      }),
    onSuccess: (data) => onCreated(data.data),
  });
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>تسجيل مشكلة</h2>
          <p className="muted">{resultId ? "مرتبطة بنتيجة فاشلة: تُربط الجلسة والسيناريو والبيئة والإصدار تلقائيًا من الخادم." : "مشكلة مستقلة غير مرتبطة بجلسة اختبار."}</p>
        </div>
        <Link to={`/projects/${p.id}/issues`}>المشكلات</Link>
      </div>
      <form
        className="panel padded issue-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Notice error={save.error || error} />
        {run && resultId && (
          <p className="checkpoint">
            الجلسة: {run.title} · <span dir="ltr">{run.build_version}</span> · {run.environment_snapshot.name}
          </p>
        )}
        <label>
          العنوان
          <input required minLength={3} maxLength={200} value={form.title} onChange={update("title")} />
        </label>
        <label>
          الوصف
          <textarea required minLength={3} maxLength={10000} value={form.description} onChange={update("description")} placeholder="ما الذي حدث ولماذا يُعد خطأ؟" />
        </label>
        <label>
          خطوات إعادة الإنتاج
          <textarea required minLength={3} maxLength={10000} rows={7} value={form.reproduction_steps} onChange={update("reproduction_steps")} />
        </label>
        <div className="field-grid">
          <label>
            النتيجة المتوقعة
            <textarea required minLength={3} maxLength={5000} value={form.expected_result} onChange={update("expected_result")} />
          </label>
          <label>
            النتيجة الفعلية
            <textarea required minLength={3} maxLength={5000} value={form.actual_result} onChange={update("actual_result")} />
          </label>
          <label>
            الخطورة
            <select value={form.severity} onChange={update("severity")}>
              {Object.entries(severities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            الأولوية
            <select value={form.priority} onChange={update("priority")}>
              {Object.entries(issuePriorities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {!resultId && (
            <label>
              البيئة
              <select value={form.environment_id} onChange={update("environment_id")}>
                <option value="">غير محددة</option>
                {p.environments?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            إصدار البناء
            <input dir="ltr" maxLength={120} value={form.build_version} onChange={update("build_version")} placeholder="v1.0.0 / commit" />
          </label>
        </div>
        <p className="hint">يمكنك إرفاق لقطات الشاشة والفيديو بعد إنشاء المشكلة مباشرة.</p>
        <button className="primary" disabled={save.isPending}>
          <Bug size={17} /> إنشاء المشكلة
        </button>
      </form>
    </>
  );
}

function IssueDetail({ project: p }: { project: Project }) {
  const { issueId } = useParams();
  const cache = useQueryClient();
  const key = ["testing", p.id, "issue", issueId];
  const query = useQuery({ queryKey: key, queryFn: () => api<{ data: Issue }>(`/api/projects/${p.id}/issues/${issueId}`) });
  const me = useMe();
  const setData = (data: { data: Issue }) => {
    cache.setQueryData(key, data);
    cache.invalidateQueries({ queryKey: ["testing", p.id, "issues"] });
    cache.invalidateQueries({ queryKey: ["testing", p.id, "issues-summary"] });
    cache.invalidateQueries({ queryKey: ["testing", p.id, "my-retests"] });
    cache.invalidateQueries({ queryKey: ["activity", p.id] });
  };
  if (query.isPending || me.isPending) return <Busy />;
  if (!query.data || !me.data) return <Notice error={query.error || me.error} />;
  const issue = query.data.data;
  const pending = issue.retests.find((r) => r.status === "pending");
  return (
    <>
      <div className="section-heading issue-heading">
        <div>
          <p className="muted">
            <Link to={`/projects/${p.id}/issues`}>المشكلات</Link> / <span dir="ltr">#{issue.number}</span>
          </p>
          <h2>{issue.title}</h2>
          <div className="issue-badges">
            <StatusBadge status={issue.status} />
            <SeverityBadge severity={issue.severity} />
            <span className="pill">أولوية {issuePriorities[issue.priority]}</span>
          </div>
        </div>
        {pending && pending.assignee_id === me.data.data.id && (
          <Link className="primary button" to="retest">
            <RotateCcw size={17} /> تنفيذ إعادة الاختبار
          </Link>
        )}
      </div>
      <div className="issue-layout">
        <div className="issue-main">
          <section className="panel padded">
            <IssueFields issue={issue} project={p} onSaved={setData} />
          </section>
          <section className="panel padded">
            <h3>الأدلة</h3>
            <EvidenceGallery projectId={p.id} files={issue.evidence} />
            {issue.step && issue.step.evidence.length > 0 && (
              <>
                <h4 className="subheading">أدلة الخطوة الأصلية في الجلسة</h4>
                <EvidenceGallery projectId={p.id} files={issue.step.evidence} />
              </>
            )}
            {issue.permissions.upload && issue.status !== "closed" && <EvidenceUpload projectId={p.id} target={{ issue_id: issue.id }} onUploaded={() => query.refetch()} />}
          </section>
          <RetestHistory project={p} issue={issue} retests={issue.retests} canManage={issue.permissions.manage} onChanged={() => query.refetch()} />
          <Comments project={p} issue={issue} onSaved={setData} />
        </div>
        <aside className="issue-side">
          <WorkflowPanel project={p} issue={issue} onSaved={setData} />
          <section className="panel padded">
            <h3>التفاصيل</h3>
            <dl className="issue-facts">
              <div>
                <dt>المبلّغ</dt>
                <dd>{issue.reporter_name}</dd>
              </div>
              <div>
                <dt>المكلَّف</dt>
                <dd>{issue.assignee_name ?? "غير مسندة"}</dd>
              </div>
              <div>
                <dt>البيئة</dt>
                <dd>{issue.environment_snapshot?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>إصدار البناء</dt>
                <dd dir="ltr">{issue.build_version ?? "—"}</dd>
              </div>
              {issue.run && (
                <div>
                  <dt>جلسة الاختبار</dt>
                  <dd>
                    <Link className="text-link" to={`/projects/${p.id}/runs/${issue.run.id}`}>
                      {issue.run.title}
                    </Link>
                  </dd>
                </div>
              )}
              {issue.step && (
                <div>
                  <dt>السيناريو والخطوة</dt>
                  <dd>
                    {issue.step.scenario_title} <span dir="ltr">v{issue.step.scenario_version}</span> — {issue.step.title}
                    <br />
                    <span className="muted">
                      Tester {issue.step.tester_role}: {issue.step.tester_name}
                    </span>
                  </dd>
                </div>
              )}
              {issue.duplicate_of && (
                <div>
                  <dt>مكررة من</dt>
                  <dd>
                    <Link className="text-link" to={`/projects/${p.id}/issues/${issue.duplicate_of.id}`}>
                      #{issue.duplicate_of.number} {issue.duplicate_of.title}
                    </Link>
                  </dd>
                </div>
              )}
              {issue.resolution && (
                <div>
                  <dt>ملاحظة الحل</dt>
                  <dd className="prewrap">{issue.resolution}</dd>
                </div>
              )}
              <div>
                <dt>آخر تحديث</dt>
                <dd>{formatDate(issue.updated_at)}</dd>
              </div>
            </dl>
          </section>
          <Timeline issue={issue} project={p} />
        </aside>
      </div>
    </>
  );
}

function IssueFields({ issue, project: p, onSaved }: { issue: Issue; project: Project; onSaved: (data: { data: Issue }) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: issue.title, description: issue.description, reproduction_steps: issue.reproduction_steps, expected_result: issue.expected_result, actual_result: issue.actual_result, severity: issue.severity, priority: issue.priority });
  const save = useMutation({
    mutationFn: () => api<{ data: Issue }>(`/api/projects/${p.id}/issues/${issue.id}`, "PATCH", { ...form, version: issue.version }),
    onSuccess: (data) => {
      setEditing(false);
      onSaved(data);
    },
  });
  const update = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  if (!editing)
    return (
      <>
        <div className="section-heading">
          <h3>وصف المشكلة</h3>
          {issue.permissions.edit && (
            <button
              type="button"
              onClick={() => {
                setForm({ title: issue.title, description: issue.description, reproduction_steps: issue.reproduction_steps, expected_result: issue.expected_result, actual_result: issue.actual_result, severity: issue.severity, priority: issue.priority });
                setEditing(true);
              }}
            >
              تعديل
            </button>
          )}
        </div>
        <p className="prewrap">{issue.description}</p>
        <h4 className="subheading">خطوات إعادة الإنتاج</h4>
        <p className="prewrap reproduction">{issue.reproduction_steps}</p>
        <div className="expected-actual">
          <div className="expected">
            <strong>النتيجة المتوقعة</strong>
            <p className="prewrap">{issue.expected_result}</p>
          </div>
          <div className="actual">
            <strong>النتيجة الفعلية</strong>
            <p className="prewrap">{issue.actual_result}</p>
          </div>
        </div>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Notice error={save.error} />
      <label>
        العنوان
        <input required minLength={3} maxLength={200} value={form.title} onChange={update("title")} />
      </label>
      <label>
        الوصف
        <textarea required minLength={3} maxLength={10000} value={form.description} onChange={update("description")} />
      </label>
      <label>
        خطوات إعادة الإنتاج
        <textarea required minLength={3} rows={6} maxLength={10000} value={form.reproduction_steps} onChange={update("reproduction_steps")} />
      </label>
      <div className="field-grid">
        <label>
          النتيجة المتوقعة
          <textarea required minLength={3} maxLength={5000} value={form.expected_result} onChange={update("expected_result")} />
        </label>
        <label>
          النتيجة الفعلية
          <textarea required minLength={3} maxLength={5000} value={form.actual_result} onChange={update("actual_result")} />
        </label>
        <label>
          الخطورة
          <select value={form.severity} onChange={update("severity")}>
            {Object.entries(severities).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          الأولوية
          <select value={form.priority} onChange={update("priority")}>
            {Object.entries(issuePriorities).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="inline-actions">
        <button className="primary" disabled={save.isPending}>
          حفظ التعديلات
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

function WorkflowPanel({ project: p, issue, onSaved }: { project: Project; issue: Issue; onSaved: (data: { data: Issue }) => void }) {
  const workers = p.members?.filter((m) => m.role !== "viewer") ?? [];
  const defaultTester = issue.step && issue.step.tester_id !== issue.assignee_id ? issue.step.tester_id : workers.find((m) => m.id !== issue.assignee_id)?.id;
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(String(issue.assignee_id ?? ""));
  const [chosenRetester, setRetester] = useState("");
  const retester = chosenRetester || String(defaultTester ?? "");
  const [build, setBuild] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const move = useMutation({
    mutationFn: async () => {
      let duplicateId: number | null = null;
      if (to === "duplicate") {
        const found = await api<{ data: IssueRow[] }>(`/api/projects/${p.id}/issues?search=${encodeURIComponent(`#${duplicate}`)}`);
        duplicateId = found.data.find((row) => row.number === Number(duplicate))?.id ?? null;
        if (!duplicateId) throw new Error("لم يُعثر على مشكلة بهذا الرقم داخل المشروع.");
      }
      return api<{ data: Issue }>(`/api/projects/${p.id}/issues/${issue.id}/transition`, "POST", {
        to,
        version: issue.version,
        note: note || null,
        assignee_id: to === "assigned" ? Number(assignee) : null,
        retest_assignee_id: to === "ready_for_retest" ? Number(retester) : null,
        build_version: to === "ready_for_retest" ? build : null,
        duplicate_of_id: duplicateId,
      });
    },
    onSuccess: (data) => {
      setTo("");
      setNote("");
      setBuild("");
      onSaved(data);
    },
  });
  const options = issue.permissions.transitions;
  return (
    <section className="panel padded workflow-panel" aria-labelledby="workflow-title">
      <h3 id="workflow-title">سير العمل</h3>
      <ol className="workflow-track" aria-label="مراحل المشكلة">
        {["new", "triaged", "assigned", "in_progress", "ready_for_retest", "verified", "closed"].map((s) => (
          <li key={s} className={s === issue.status ? "current" : ""} aria-current={s === issue.status ? "step" : undefined}>
            {issueStatuses[s]}
          </li>
        ))}
      </ol>
      {issue.status === "ready_for_retest" && <p className="checkpoint">لا تتغير الحالة إلى «متحقَّق» أو «أعيد فتحها» إلا بنتيجة إعادة اختبار يسجلها المختبر المكلَّف.</p>}
      {options.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            move.mutate();
          }}
        >
          <Notice error={move.error} />
          <fieldset className="transition-options">
            <legend>الإجراء التالي</legend>
            {options.map((o) => (
              <label key={o} className="check-label">
                <input type="radio" name="transition" value={o} checked={to === o} onChange={() => setTo(o)} /> {transitionLabels[o]}
              </label>
            ))}
          </fieldset>
          {to === "assigned" && (
            <label>
              المكلَّف بالإصلاح
              <select required value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">اختر عضوًا</option>
                {workers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {to === "ready_for_retest" && (
            <>
              <label>
                إصدار البناء الذي يحتوي الإصلاح
                <input required dir="ltr" maxLength={120} value={build} onChange={(e) => setBuild(e.target.value)} placeholder="v1.0.1" />
              </label>
              <label>
                المختبر الذي سيعيد الاختبار
                <select required value={retester} onChange={(e) => setRetester(e.target.value)}>
                  <option value="">اختر مختبرًا</option>
                  {workers
                    .filter((m) => m.id !== issue.assignee_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {issue.step?.tester_id === m.id ? " — منفّذ الخطوة الأصلية" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {to === "duplicate" && (
            <label>
              رقم المشكلة الأصلية
              <input required inputMode="numeric" pattern="[0-9]+" dir="ltr" value={duplicate} onChange={(e) => setDuplicate(e.target.value)} placeholder="12" />
            </label>
          )}
          {to && (
            <label>
              {to === "ready_for_retest" ? "وصف الإصلاح" : "ملاحظة"}
              {noteRequired.includes(to) ? "" : " (اختيارية)"}
              <textarea required={noteRequired.includes(to)} minLength={noteRequired.includes(to) ? 3 : undefined} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <button className="primary" disabled={!to || move.isPending}>
            تطبيق الانتقال
          </button>
        </form>
      ) : (
        <p className="hint">{issue.status === "ready_for_retest" ? "بانتظار نتيجة إعادة الاختبار." : "لا توجد انتقالات متاحة لك في هذه المرحلة."}</p>
      )}
    </section>
  );
}

function RetestHistory({ project: p, issue, retests, canManage, onChanged }: { project: Project; issue: Issue; retests: Retest[]; canManage: boolean; onChanged: () => void }) {
  const [assignee, setAssignee] = useState("");
  const pending = retests.find((r) => r.status === "pending");
  const reassign = useMutation({
    mutationFn: () => api(`/api/projects/${p.id}/retests/${pending!.id}/assignee`, "PUT", { assignee_id: Number(assignee), version: pending!.version }),
    onSuccess: () => {
      setAssignee("");
      onChanged();
    },
  });
  return (
    <section className="panel padded">
      <h3>محاولات إعادة الاختبار</h3>
      {retests.length ? (
        <ol className="retest-list">
          {retests.map((r) => (
            <li key={r.id} className={`retest retest-${r.status}`}>
              <div className="section-heading">
                <strong>
                  المحاولة {r.attempt_number} · <span dir="ltr">{r.build_version}</span>
                </strong>
                <span className={`result-badge ${r.status}`}>{{ pending: "معلّقة", passed: "نجحت", failed: "فشلت", cancelled: "أُلغيت" }[r.status]}</span>
              </div>
              <p className="muted">
                طلبها {r.requester_name} · المختبر: {r.assignee_name} · {formatDate(r.created_at)}
              </p>
              <p className="prewrap">
                <strong>الإصلاح: </strong>
                {r.fix_notes}
              </p>
              {r.actual_result && (
                <p className="prewrap">
                  <strong>النتيجة الفعلية: </strong>
                  {r.actual_result}
                </p>
              )}
              {r.notes && <p className="prewrap muted">{r.notes}</p>}
              {r.executed_at && <small className="muted">نُفذت {formatDate(r.executed_at)}</small>}
              {r.evidence.length > 0 && <EvidenceGallery projectId={p.id} files={r.evidence} />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">لم تُطلب إعادة اختبار بعد. تُنشأ تلقائيًا عند إرسال المشكلة لإعادة الاختبار.</p>
      )}
      {canManage && pending && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            reassign.mutate();
          }}
        >
          <Notice error={reassign.error} />
          <label>
            إعادة تعيين المحاولة المعلّقة
            <select required value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">اختر مختبرًا</option>
              {p.members
                ?.filter((m) => m.role !== "viewer" && m.id !== issue.assignee_id && m.id !== pending.assignee_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <button disabled={!assignee || reassign.isPending}>إعادة التعيين</button>
        </form>
      )}
    </section>
  );
}

function Comments({ project: p, issue, onSaved }: { project: Project; issue: Issue; onSaved: (data: { data: Issue }) => void }) {
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () => api<{ data: Issue }>(`/api/projects/${p.id}/issues/${issue.id}/comments`, "POST", { body }),
    onSuccess: (data) => {
      setBody("");
      onSaved(data);
    },
  });
  return (
    <section className="panel padded" aria-labelledby="comments-title">
      <h3 id="comments-title">التعليقات ({issue.comments.length})</h3>
      <ol className="comments">
        {issue.comments.map((c) => (
          <li key={c.id}>
            <span className="avatar" aria-hidden="true">
              {c.author.slice(0, 1)}
            </span>
            <div>
              <strong>{c.author}</strong> <small className="muted">{formatDate(c.created_at)}</small>
              <p className="prewrap">{c.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {issue.permissions.comment ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Notice error={send.error} />
          <label>
            تعليق جديد
            <textarea required maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button disabled={!body.trim() || send.isPending}>إضافة التعليق</button>
        </form>
      ) : (
        <p className="hint">المشاهدون يقرأون التعليقات فقط.</p>
      )}
    </section>
  );
}

function describeActivity(a: Issue["activities"][number], p: Project): string {
  const name = (id: unknown) => p.members?.find((m) => m.id === Number(id))?.name ?? "عضو";
  const m = a.metadata;
  switch (a.event) {
    case "status_changed":
      return `${issueStatuses[String(m.from)]} ← ${issueStatuses[String(m.to)]}${m.assignee_id ? ` · المكلَّف: ${name(m.assignee_id)}` : ""}`;
    case "retest_requested":
      return `المحاولة ${m.attempt} على ${m.build_version} · المختبر: ${name(m.assignee_id)}`;
    case "retest_recorded":
      return `المحاولة ${m.attempt}: ${m.result === "passed" ? "نجحت" : "فشلت"}`;
    case "retest_reassigned":
      return `من ${name(m.from)} إلى ${name(m.to)}`;
    case "updated":
      return Array.isArray(m.fields) ? `الحقول: ${m.fields.join("، ")}` : "";
    default:
      return "";
  }
}

function Timeline({ issue, project: p }: { issue: Issue; project: Project }) {
  return (
    <section className="panel padded" aria-labelledby="timeline-title">
      <h3 id="timeline-title">السجل الزمني</h3>
      <ol className="activity issue-timeline">
        {[...issue.activities].reverse().map((a) => (
          <li key={a.id}>
            <span className="activity-dot" aria-hidden="true" />
            <div>
              <strong>{a.actor}</strong> {activityLabels[a.event] ?? a.event}
              {describeActivity(a, p) && <p>{describeActivity(a, p)}</p>}
              {typeof a.metadata.note === "string" && a.metadata.note && <p className="muted prewrap">«{a.metadata.note}»</p>}
              <small>{formatDate(a.created_at)}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RetestScreen({ project: p }: { project: Project }) {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["testing", p.id, "issue", issueId], queryFn: () => api<{ data: Issue }>(`/api/projects/${p.id}/issues/${issueId}`) });
  const me = useMe();
  const [status, setStatus] = useState("passed");
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [verified, setVerified] = useState(false);
  const issue = query.data?.data;
  const attempt = issue?.retests.find((r) => r.status === "pending");
  const save = useMutation({
    mutationFn: () => api<{ data: Issue }>(`/api/projects/${p.id}/retests/${attempt!.id}`, "PUT", { version: attempt!.version, status, actual_result: actual, notes, verified }),
    onSuccess: (data) => {
      cache.setQueryData(["testing", p.id, "issue", issueId], data);
      cache.invalidateQueries({ queryKey: ["testing", p.id] });
      navigate(`/projects/${p.id}/issues/${issueId}`);
    },
  });
  if (query.isPending || me.isPending) return <Busy />;
  if (!issue || !me.data) return <Notice error={query.error || me.error} />;
  if (!attempt || attempt.assignee_id !== me.data.data.id)
    return (
      <div className="empty">
        <h3>لا توجد إعادة اختبار مسندة إليك لهذه المشكلة</h3>
        <Link className="text-link" to={`/projects/${p.id}/issues/${issue.id}`}>
          العودة إلى المشكلة
        </Link>
      </div>
    );
  const snap = attempt.snapshot;
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="muted">
            <Link to={`/projects/${p.id}/issues/${issue.id}`}>
              <span dir="ltr">#{issue.number}</span> {issue.title}
            </Link>
          </p>
          <h2>إعادة الاختبار — المحاولة {attempt.attempt_number}</h2>
          <p className="muted">
            الإصدار المختبَر: <span dir="ltr">{attempt.build_version}</span> · طلبها {attempt.requester_name}
          </p>
        </div>
      </div>
      <div className="issue-layout">
        <div className="issue-main">
          <section className="panel padded">
            <h3>ما الذي أُصلح</h3>
            <p className="prewrap">{attempt.fix_notes}</p>
            <h4 className="subheading">نفّذ خطوات إعادة الإنتاج</h4>
            <p className="prewrap reproduction">{snap.reproduction_steps}</p>
            {snap.step && (
              <p className="hint">
                الخطوة الأصلية: {snap.step.scenario} — {snap.step.title}
              </p>
            )}
            <div className="expected-actual">
              <div className="expected">
                <strong>النتيجة المتوقعة</strong>
                <p className="prewrap">{snap.expected_result}</p>
              </div>
              <div className="actual">
                <strong>ما حدث سابقًا {snap.original_build && <span dir="ltr">({snap.original_build})</span>}</strong>
                <p className="prewrap">{snap.original_actual_result}</p>
              </div>
            </div>
          </section>
          <section className="panel padded">
            <h3>أدلة إعادة الاختبار</h3>
            <EvidenceGallery projectId={p.id} files={attempt.evidence} empty="أرفق لقطة أو فيديو يثبت النتيجة الجديدة." />
            <EvidenceUpload projectId={p.id} target={{ retest_attempt_id: attempt.id }} onUploaded={() => query.refetch()} />
          </section>
        </div>
        <aside className="issue-side">
          <form
            className="panel padded"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <h3>تسجيل النتيجة</h3>
            <Notice error={save.error} />
            <fieldset className="transition-options">
              <legend>النتيجة</legend>
              <label className="check-label">
                <input type="radio" name="retest" checked={status === "passed"} onChange={() => setStatus("passed")} /> نجحت — تُعتمد المشكلة كمتحقَّق منها
              </label>
              <label className="check-label">
                <input type="radio" name="retest" checked={status === "failed"} onChange={() => setStatus("failed")} /> فشلت — يُعاد فتح المشكلة
              </label>
            </fieldset>
            <label>
              النتيجة الفعلية
              <textarea required minLength={3} maxLength={10000} value={actual} onChange={(e) => setActual(e.target.value)} />
            </label>
            <label>
              ملاحظات
              <textarea maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="check-label">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> نفّذت الخطوات فعليًا على الإصدار المحدد وتحققت من النتيجة
            </label>
            <button className="primary" disabled={save.isPending || (status === "passed" && !verified)}>
              حفظ نتيجة إعادة الاختبار
            </button>
            <p className="hint">تُحفظ المحاولة في السجل ولا تُستبدل المحاولات أو النتائج السابقة.</p>
          </form>
        </aside>
      </div>
    </>
  );
}
