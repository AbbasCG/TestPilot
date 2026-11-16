import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, FileUp, ListChecks, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import type { Page, Project } from "../api";
import { Busy, Notice } from "./shared";
import { priorities, statuses } from "./types";
import type { Scenario, Suite } from "./types";
import { ImportPanel } from "./ImportPanel";

const canDesign = (p: Project) => ["owner", "manager", "tester"].includes(p.role);

/** Filters live in the URL so a list can be shared, restored and survives "back". */
function useLibraryFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };
  return { q: get("q"), status: get("status"), priority: get("priority"), suite: get("suite"), page: Math.max(1, Number(get("page")) || 1), set, active: ["q", "status", "priority", "suite"].some((k) => params.has(k)) };
}

export function Library({ project: p, onEditSuite, suites }: { project: Project; suites: Suite[] | undefined; onEditSuite: (s: Suite | null) => void }) {
  const f = useLibraryFilters();
  const [draft, setDraft] = useState(f.q);
  const [seenQ, setSeenQ] = useState(f.q);
  const latest = useRef(f);
  useEffect(() => {
    latest.current = f;
  });
  // Back/forward changes the URL: mirror it into the input (adjusting state while rendering).
  if (f.q !== seenQ) {
    setSeenQ(f.q);
    setDraft(f.q);
  }
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== latest.current.q) latest.current.set({ q: draft.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [draft]);
  const query = new URLSearchParams({ page: String(f.page), ...(f.q && { search: f.q }), ...(f.status && { status: f.status }), ...(f.priority && { priority: f.priority }), ...(f.suite && { suite_id: f.suite }) });
  const cases = useQuery({
    queryKey: ["testing", p.id, "scenarios", query.toString()],
    queryFn: () => api<Page<Scenario>>(`/api/projects/${p.id}/scenarios?${query}`),
    placeholderData: keepPreviousData,
  });
  const suiteName = (id: number) => suites?.find((s) => s.id === id)?.name ?? "—";
  const rows = cases.data?.data ?? [];

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>السيناريوهات</h2>
          <p className="muted">{cases.data ? `${cases.data.meta.total} سيناريو${f.active ? " مطابق للتصفية" : ""}` : " "}</p>
        </div>
        {canDesign(p) && (
          <div className="inline-actions">
            <button type="button" onClick={() => setImporting(true)}><FileUp size={17} /> استيراد ملف</button>
            <Link className="primary button" to="new"><Plus size={18} /> إنشاء سيناريو</Link>
          </div>
        )}
      </div>
      <Notice error={cases.error} />
      <div className="filter-bar" role="search">
        <label className="search-field">
          <span className="sr-only">ابحث بالعنوان أو الرقم</span>
          <Search size={16} aria-hidden />
          <input type="search" value={draft} placeholder="ابحث بالعنوان أو الرقم (TC-12)" onChange={(e) => setDraft(e.target.value)} />
        </label>
        <label><span className="sr-only">الحالة</span>
          <select value={f.status} onChange={(e) => f.set({ status: e.target.value })}>
            <option value="">كل الحالات</option>
            {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="sr-only">الأولوية</span>
          <select value={f.priority} onChange={(e) => f.set({ priority: e.target.value })}>
            <option value="">كل الأولويات</option>
            {Object.entries(priorities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="sr-only">المجموعة</span>
          <select value={f.suite} onChange={(e) => f.set({ suite: e.target.value })}>
            <option value="">كل المجموعات</option>
            {suites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {f.active && <button type="button" onClick={() => { setDraft(""); f.set({ q: "", status: "", priority: "", suite: "" }); }}><X size={15} /> مسح التصفية</button>}
        {canDesign(p) && <button type="button" className="text-button" aria-label="إنشاء مجموعة" onClick={() => onEditSuite(null)}><BookOpen size={15} /> مجموعة جديدة</button>}
      </div>
      {suites && suites.length > 0 && (
        <ul className="suite-strip" aria-label="المجموعات">
          {suites.map((x) => (
            <li key={x.id} className={f.suite === String(x.id) ? "on" : ""}>
              <button type="button" aria-pressed={f.suite === String(x.id)} onClick={() => f.set({ suite: f.suite === String(x.id) ? "" : String(x.id) })}>
                <BookOpen size={14} aria-hidden /> {x.name} <small>{x.cases_count}{x.archived ? " · مؤرشفة" : ""}</small>
              </button>
              {canDesign(p) && <button type="button" className="text-button" aria-label={`تعديل مجموعة ${x.name}`} onClick={() => onEditSuite(x)}>تعديل</button>}
            </li>
          ))}
        </ul>
      )}
      <section className="panel" aria-busy={cases.isFetching}>
        {cases.isPending ? <Busy /> : rows.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>السيناريو</th><th>المجموعة</th><th>الحالة</th><th>الأولوية</th><th>النسخة</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link className="scenario-title" to={String(c.id)}>
                          <ListChecks size={18} />
                          <span>{c.title}<small dir="ltr">TC-{c.id}{c.is_template ? " · قالب" : ""}</small></span>
                        </Link>
                      </td>
                      <td>{suiteName(c.suite_id)}</td>
                      <td><span className={`state-chip ${c.status}`}>{statuses[c.status]}</span></td>
                      <td>{priorities[c.priority]}</td>
                      <td dir="ltr">v{c.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>{cases.data!.meta.total} سيناريو</span>
              <button disabled={f.page === 1} onClick={() => f.set({ page: String(f.page - 1) })}>السابق</button>
              <span>{f.page} / {cases.data!.meta.last_page}</span>
              <button disabled={f.page >= cases.data!.meta.last_page} onClick={() => f.set({ page: String(f.page + 1) })}>التالي</button>
            </div>
          </>
        ) : f.active ? (
          <div className="empty"><Search size={30} /><h3>لا توجد سيناريوهات مطابقة</h3><p>جرّب تعديل البحث أو مسح التصفية.</p></div>
        ) : (
          <div className="empty">
            <ListChecks size={32} />
            <h3>لا توجد سيناريوهات بعد</h3>
            <p>أنشئ سيناريو بنفسك، أو استورد ملفًا جاهزًا من أداة ذكاء اصطناعي.</p>
            {canDesign(p) && <div className="inline-actions"><button type="button" onClick={() => setImporting(true)}><FileUp size={16} /> استيراد ملف</button><Link className="primary button" to="new">أنشئ أول سيناريو</Link></div>}
          </div>
        )}
      </section>
      {importing && <ImportPanel project={p} suiteId={f.suite ? Number(f.suite) : null} onClose={() => setImporting(false)} />}
    </>
  );
}
