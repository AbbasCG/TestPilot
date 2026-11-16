import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bug, ListChecks, Play, Plus, Search, Zap } from "lucide-react";
import { api } from "./api";
import { enterPanel, useGSAP } from "./motion";

type Found = {
  query: string;
  scenarios: { id: number; code: string; title: string; status: string; suite: string }[];
  issues: { id: number; code: string; title: string; status: string; severity: string }[];
  runs: { id: number; title: string; status: string; build_version: string }[];
};
type Option = { key: string; label: string; hint: string; to: string; icon: typeof Search; group: string };

const statusAr: Record<string, string> = { draft: "مسودة", ready: "جاهز", archived: "مؤرشف", open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة", active: "قيد التنفيذ", paused: "متوقفة", completed: "منتهية" };

export function usePaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const match = useMatch("/projects/:id/*");
  const projectId = match?.params.id && /^\d+$/.test(match.params.id) ? match.params.id : null;
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const listId = useId();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useGSAP(() => { if (root.current) return enterPanel(root.current.querySelector(".palette")!, root.current.querySelector(".palette-backdrop")); }, { scope: root });

  const search = useQuery({
    queryKey: ["quick-search", projectId, debounced],
    queryFn: () => api<{ data: Found }>(`/api/projects/${projectId}/search?q=${encodeURIComponent(debounced)}`),
    enabled: Boolean(projectId) && debounced.length > 0,
  });
  const base = projectId ? `/projects/${projectId}` : "";
  const quick: Option[] = projectId
    ? [
        { key: "q-start", label: "ابدأ الاختبار", hint: "جلسة جديدة", to: `${base}/runs/new`, icon: Play, group: "إجراءات سريعة" },
        { key: "q-solo", label: "اختبار منفرد", hint: "مختبر واحد", to: `${base}/runs/new?mode=solo`, icon: Zap, group: "إجراءات سريعة" },
        { key: "q-new", label: "إنشاء سيناريو", hint: "سيناريو جديد", to: `${base}/tests/new`, icon: Plus, group: "إجراءات سريعة" },
        { key: "q-scn", label: "السيناريوهات", hint: "المكتبة", to: `${base}/tests`, icon: ListChecks, group: "انتقال" },
        { key: "q-iss", label: "المشكلات", hint: "كل المشكلات", to: `${base}/issues`, icon: Bug, group: "انتقال" },
      ]
    : [{ key: "q-proj", label: "المشاريع", hint: "اختر مشروعًا للبحث داخله", to: "/projects", icon: Search, group: "انتقال" }];
  const found = search.data?.data;
  const results: Option[] = found
    ? [
        ...found.scenarios.map((s) => ({ key: `s${s.id}`, label: s.title, hint: `${s.code} · ${s.suite} · ${statusAr[s.status] ?? s.status}`, to: `${base}/tests/${s.id}`, icon: ListChecks, group: "السيناريوهات" })),
        ...found.issues.map((i) => ({ key: `i${i.id}`, label: i.title, hint: `${i.code} · ${statusAr[i.status] ?? i.status}`, to: `${base}/issues/${i.id}`, icon: Bug, group: "المشكلات" })),
        ...found.runs.map((r) => ({ key: `r${r.id}`, label: r.title, hint: `${r.build_version} · ${statusAr[r.status] ?? r.status}`, to: `${base}/runs/${r.id}`, icon: Play, group: "الجلسات" })),
      ]
    : [];
  const options = debounced ? results : quick;
  const current = Math.min(active, Math.max(options.length - 1, 0));

  const close = () => {
    onClose();
    queueMicrotask(() => (opener.current as HTMLElement | null)?.focus?.());
  };
  const go = (o: Option) => {
    onClose();
    navigate(o.to, { state: { from: location.pathname } });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % Math.max(options.length, 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + options.length) % Math.max(options.length, 1)); }
    if (e.key === "Enter" && options[current]) { e.preventDefault(); go(options[current]); }
  };
  let lastGroup = "";

  return (
    <div ref={root}>
      <div className="palette-backdrop" onClick={close} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="بحث سريع" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={18} aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[current] ? `${listId}-${options[current].key}` : undefined}
            aria-label={projectId ? "ابحث في المشروع بالعنوان أو الرقم" : "بحث سريع"}
            placeholder={projectId ? "ابحث عن سيناريو أو مشكلة بالعنوان أو الرقم…" : "افتح مشروعًا للبحث داخله"}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
          />
          <kbd dir="ltr">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" className="palette-list">
          {options.map((o, i) => {
            const header = o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.key} role="presentation">
                {header && <p className="palette-group">{header}</p>}
                <div id={`${listId}-${o.key}`} role="option" aria-selected={i === current} className={i === current ? "on" : ""} onMouseMove={() => setActive(i)} onClick={() => go(o)}>
                  <o.icon size={17} aria-hidden />
                  <span>{o.label}<small>{o.hint}</small></span>
                </div>
              </li>
            );
          })}
        </ul>
        {debounced && search.isFetching && <p className="palette-note" role="status">جارٍ البحث…</p>}
        {debounced && !search.isFetching && !results.length && <p className="palette-note" role="status">{search.error ? "تعذّر البحث. أعد المحاولة." : `لا نتائج لـ «${debounced}»`}</p>}
      </div>
    </div>
  );
}
