import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { newStep, stepTypes } from "./types";
import type { Step } from "./types";
import "./step-table.css";

const MAX_STEPS = 100;
const roleLabels: Record<Step["assigned_role"], string> = { A: "Tester A", B: "Tester B", both: "كلاهما" };

/** How many optional details a step carries, shown on its «تفاصيل» toggle. */
const extras = (s: Step) =>
  [s.url, s.target, s.value, s.instructions].filter((v) => (v ?? "").trim() !== "").length + (s.depends_on.length ? 1 : 0) + (s.evidence_required ? 1 : 0);

/**
 * Compact step editor: one row per step (title, type, tester, expected result), optional details in an
 * expandable row, and reordering by drag, by the arrow keys on the handle, or with the move buttons.
 */
export function StepTable({ steps, onChange }: { steps: Step[]; onChange: (steps: Step[]) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Element to focus once the next render has placed it (a new step's title, or a moved step's handle).
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  });

  const change = (id: string, changes: Partial<Step>) => onChange(steps.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  const toggle = (id: string, force?: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (force ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const moveTo = (from: number, to: number, focus: "handle" | null = "handle") => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setAnnouncement(`نُقلت «${moved.title || "خطوة بلا عنوان"}» إلى الموضع ${to + 1} من ${steps.length}`);
    if (focus) pendingFocus.current = `step-handle-${moved.id}`;
  };
  const remove = (id: string) => {
    const index = steps.findIndex((s) => s.id === id);
    onChange(steps.filter((s) => s.id !== id).map((s) => ({ ...s, depends_on: s.depends_on.filter((d) => d !== id) })));
    toggle(id, false);
    const neighbour = steps[index + 1] ?? steps[index - 1];
    if (neighbour) pendingFocus.current = `step-title-${neighbour.id}`;
    setAnnouncement(`حُذفت الخطوة ${index + 1}`);
  };
  const add = () => {
    const added = newStep();
    onChange([...steps, added]);
    pendingFocus.current = `step-title-${added.id}`;
  };

  return (
    <div className="step-table-block">
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className="step-table-wrap">
        <table className="step-table">
          <caption className="sr-only">خطوات السيناريو. اسحب المقبض أو استخدم الأسهم عليه لتغيير الترتيب.</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">ترتيب</span></th>
              <th scope="col">#</th>
              <th scope="col">الخطوة</th>
              <th scope="col">النوع</th>
              <th scope="col">المختبر</th>
              <th scope="col">النتيجة المتوقعة</th>
              <th scope="col"><span className="sr-only">إجراءات</span></th>
            </tr>
          </thead>
          {steps.map((step, index) => {
            const n = index + 1;
            const isOpen = open.has(step.id);
            const count = extras(step);
            const shared = step.type === "shared_checkpoint";
            return (
              <tbody
                key={step.id}
                aria-label={`الخطوة ${n}`}
                className={[isOpen ? "open" : "", dragging === step.id ? "dragging" : "", over === step.id && dragging !== step.id ? "drop-target" : ""].join(" ").trim() || undefined}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== step.id) setOver(step.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = steps.findIndex((s) => s.id === dragging);
                  if (from >= 0) moveTo(from, index);
                  setDragging(null);
                  setOver(null);
                }}
              >
                <tr className="step-row">
                  <td className="step-handle-cell">
                    <button
                      type="button"
                      id={`step-handle-${step.id}`}
                      className="drag-handle"
                      draggable
                      aria-label={`نقل الخطوة ${n}`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="اسحب لتغيير الترتيب، أو استخدم السهمين"
                      onDragStart={(e) => {
                        setDragging(step.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", step.id);
                        const row = e.currentTarget.closest("tr");
                        if (row) e.dataTransfer.setDragImage(row, 24, 24);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          moveTo(index, index - 1);
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          moveTo(index, index + 1);
                        }
                      }}
                    >
                      <GripVertical size={16} aria-hidden />
                    </button>
                  </td>
                  <td className="step-no" aria-hidden>{n}</td>
                  <td data-label="الخطوة">
                    <input
                      id={`step-title-${step.id}`}
                      aria-label={`عنوان الخطوة ${n}`}
                      required
                      maxLength={200}
                      placeholder="ماذا يفعل المختبر؟"
                      value={step.title}
                      onChange={(e) => change(step.id, { title: e.target.value })}
                    />
                  </td>
                  <td data-label="النوع">
                    <select
                      aria-label={`نوع الخطوة ${n}`}
                      value={step.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        change(step.id, {
                          type,
                          ...(type === "shared_checkpoint" ? { assigned_role: "both" as const } : {}),
                          ...(type === "capture_evidence" ? { evidence_required: true } : {}),
                        });
                      }}
                    >
                      {Object.entries(stepTypes).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="المختبر">
                    <select
                      aria-label={`المختبر في الخطوة ${n}`}
                      disabled={shared}
                      value={step.assigned_role}
                      onChange={(e) => change(step.id, { assigned_role: e.target.value as Step["assigned_role"] })}
                    >
                      {(Object.keys(roleLabels) as Step["assigned_role"][]).map((r) => (
                        <option key={r} value={r}>{roleLabels[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="النتيجة المتوقعة">
                    <textarea
                      rows={1}
                      aria-label={`النتيجة المتوقعة للخطوة ${n}`}
                      required
                      maxLength={5000}
                      placeholder="ما الذي يجب أن يظهر؟"
                      value={step.expected_result}
                      onChange={(e) => change(step.id, { expected_result: e.target.value })}
                    />
                    {shared && (
                      // Required, so it stays in the always-visible row: a hidden required field would block saving silently.
                      <input
                        className="checkpoint-input"
                        aria-label={`معيار نقطة التحقق المشتركة للخطوة ${n}`}
                        required
                        placeholder="معيار نقطة التحقق المشتركة"
                        value={step.checkpoint || ""}
                        onChange={(e) => change(step.id, { checkpoint: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="step-row-actions">
                    {step.evidence_required && <Camera size={15} className="evidence-mark" aria-label="يتطلب دليلًا" role="img" />}
                    <button
                      type="button"
                      className="details-toggle"
                      aria-expanded={isOpen}
                      aria-controls={`step-detail-${step.id}`}
                      aria-label={`تفاصيل إضافية للخطوة ${n}${count ? ` — ${count} محفوظة` : ""}`}
                      onClick={() => toggle(step.id)}
                    >
                      <ChevronDown size={16} aria-hidden className={isOpen ? "open" : ""} />
                      {count > 0 && <span className="extras-count" aria-hidden>{count}</span>}
                    </button>
                    <button type="button" className="delete-step" aria-label={`حذف الخطوة ${n}`} disabled={steps.length === 1} onClick={() => remove(step.id)}>
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="step-detail" id={`step-detail-${step.id}`}>
                    <td colSpan={7}>
                      <div className="step-detail-grid">
                        <label>
                          رابط الصفحة
                          <input dir="ltr" type="url" value={step.url || ""} onChange={(e) => change(step.id, { url: e.target.value })} placeholder="https://" />
                        </label>
                        <label>
                          الزر أو الحقل
                          <input value={step.target || ""} onChange={(e) => change(step.id, { target: e.target.value })} />
                        </label>
                        <label>
                          قيمة الاختبار
                          <input value={step.value || ""} onChange={(e) => change(step.id, { value: e.target.value })} />
                        </label>
                      </div>
                      <label>
                        تعليمات تفصيلية
                        <textarea aria-label="تعليمات تفصيلية" rows={2} value={step.instructions || ""} onChange={(e) => change(step.id, { instructions: e.target.value })} />
                      </label>
                      <label className="check-label">
                        <input type="checkbox" checked={step.evidence_required} onChange={(e) => change(step.id, { evidence_required: e.target.checked })} /> دليل مطلوب لإثبات النتيجة
                      </label>
                      {index > 0 && (
                        <fieldset className="dependencies">
                          <legend>انتظر اكتمال الخطوات التالية</legend>
                          {steps.slice(0, index).map((prior, i) => (
                            <label className="check-label" key={prior.id}>
                              <input
                                type="checkbox"
                                checked={step.depends_on.includes(prior.id)}
                                onChange={(e) =>
                                  change(step.id, {
                                    depends_on: e.target.checked ? [...step.depends_on, prior.id] : step.depends_on.filter((d) => d !== prior.id),
                                  })
                                }
                              />
                              {i + 1}. {prior.title || "خطوة بلا عنوان"}
                            </label>
                          ))}
                        </fieldset>
                      )}
                      <div className="inline-actions step-move">
                        <button type="button" aria-label={`رفع الخطوة ${n}`} disabled={index === 0} onClick={() => moveTo(index, index - 1, null)}>
                          <ArrowUp size={15} aria-hidden /> للأعلى
                        </button>
                        <button type="button" aria-label={`خفض الخطوة ${n}`} disabled={index === steps.length - 1} onClick={() => moveTo(index, index + 1, null)}>
                          <ArrowDown size={15} aria-hidden /> للأسفل
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <button type="button" className="add-step" disabled={steps.length >= MAX_STEPS} onClick={add}>
        <Plus size={17} aria-hidden /> إضافة خطوة
      </button>
    </div>
  );
}
