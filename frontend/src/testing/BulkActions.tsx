import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Archive, CheckCircle2, FolderInput, Play, X } from "lucide-react";
import { api } from "../api";
import type { Project } from "../api";
import { Notice, useRefreshTesting } from "./shared";
import type { Scenario, Suite } from "./types";

type Change = { action: "status"; status: Scenario["status"] } | { action: "suite"; suite_id: number };

/**
 * Actions on the scenarios selected in the library: change status, move to a suite, or start a session with the
 * ready ones. The server applies a change to all of them or to none (each is checked against its version).
 */
export function BulkActions({ project: p, selected, suites, onDone, onClear }: {
  project: Project;
  selected: Scenario[];
  suites: Suite[] | undefined;
  onDone: (message: string) => void;
  onClear: () => void;
}) {
  const refresh = useRefreshTesting(p.id);
  const [target, setTarget] = useState("");
  const ready = selected.filter((s) => s.status === "ready");
  const apply = useMutation({
    mutationFn: (change: Change) =>
      api<{ data: { updated: number; unchanged: number } }>(`/api/projects/${p.id}/scenarios/bulk`, "POST", {
        items: selected.map((s) => ({ id: s.id, version: s.version })),
        ...change,
      }),
    onSuccess: ({ data }, change) => {
      refresh();
      const what = change.action === "suite" ? "نُقل" : "حُدّث";
      onDone(`${what} ${data.updated} سيناريو${data.unchanged ? ` (${data.unchanged} بلا تغيير)` : ""}.`);
      setTarget("");
    },
    onError: () => refresh(),
  });
  const status = (s: Scenario["status"]) => apply.mutate({ action: "status", status: s });

  return (
    <section className="bulk-bar" aria-label="إجراءات على السيناريوهات المحددة">
      <div className="bulk-bar-row">
        <span className="bulk-selection">
          <strong aria-live="polite">{selected.length} محدد</strong>
          <button type="button" className="text-button" onClick={onClear}><X size={15} aria-hidden /> إلغاء التحديد</button>
        </span>
        <div className="bulk-group" role="group" aria-label="تغيير الحالة">
          <button type="button" disabled={apply.isPending} onClick={() => status("ready")}><CheckCircle2 size={16} aria-hidden /> اجعلها جاهزة</button>
          <button type="button" disabled={apply.isPending} onClick={() => status("draft")}>أعدها مسودة</button>
          <button type="button" disabled={apply.isPending} onClick={() => status("archived")}><Archive size={16} aria-hidden /> أرشفة</button>
        </div>
        <form
          className="bulk-group"
          onSubmit={(e) => {
            e.preventDefault();
            if (target) apply.mutate({ action: "suite", suite_id: Number(target) });
          }}
        >
          <label>
            <span className="sr-only">المجموعة الهدف</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">نقل إلى مجموعة…</option>
              {suites?.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!target || apply.isPending}><FolderInput size={16} aria-hidden /> نقل</button>
        </form>
        {ready.length > 0 ? (
          <Link className="primary button" to={`/projects/${p.id}/runs/new?scenarios=${ready.map((s) => s.id).join(",")}`}>
            <Play size={16} aria-hidden /> {ready.length === selected.length ? "ابدأ جلسة بها" : `ابدأ جلسة بالجاهزة (${ready.length})`}
          </Link>
        ) : (
          <span className="muted bulk-hint">لبدء جلسة اختر سيناريوهات جاهزة.</span>
        )}
      </div>
      <Notice error={apply.error} />
    </section>
  );
}
