import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ExternalLink, ListChecks, Lock, Paperclip, X } from "lucide-react";
import { api } from "../api";
import type { Project } from "../api";
import { enterBlock, tweenProgress, useGSAP } from "../motion";
import { EvidenceGallery, EvidenceUpload } from "../issues/Evidence";
import { Notice } from "./shared";
import { stepTypes } from "./types";
import type { Run, Result, RunCase } from "./RunManagement";
import "./guided.css";

type Item = { result: Result; case: RunCase; step: RunCase["snapshot"]["steps"][number]; caseStepIndex: number };
type Choice = "passed" | "failed" | "blocked";
const choices: { value: Choice; label: string; icon: typeof Check }[] = [
  { value: "passed", label: "نجحت", icon: Check },
  { value: "failed", label: "فشلت", icon: X },
  { value: "blocked", label: "تعذّر التنفيذ", icon: AlertTriangle },
];
const stateLabel: Record<string, string> = { pending: "لم تُنفّذ", passed: "نجحت", failed: "فشلت", blocked: "تعذّر التنفيذ" };

/** Ordered steps of the signed-in tester, across all scenarios in the run. */
export function buildItems(run: Run, participantId: number): Item[] {
  const items: Item[] = [];
  for (const c of run.cases) {
    c.snapshot.steps.forEach((step, caseStepIndex) => {
      const result = run.results.find((r) => r.run_case_id === c.id && r.step_key === step.id && r.participant_id === participantId);
      if (result) items.push({ result, case: c, step, caseStepIndex });
    });
  }
  return items;
}
/** A pending step is available once everything it depends on has passed (for either tester). */
export function dependencyState(run: Run, item: Item): "ready" | "waiting" | "stuck" {
  let waiting = false;
  for (const dep of item.step.depends_on) {
    const rows = run.results.filter((r) => r.run_case_id === item.case.id && r.step_key === dep);
    if (rows.some((r) => r.status === "failed" || r.status === "blocked")) return "stuck";
    if (rows.some((r) => r.status !== "passed")) waiting = true;
  }
  return waiting ? "waiting" : "ready";
}

export function GuidedRunner({ project: p, run, userId, queryKey, canWrite }: { project: Project; run: Run; userId: number; queryKey: unknown[]; canWrite: boolean }) {
  const me = run.participants.find((x) => x.user_id === userId);
  const [focusId, setFocusId] = useState<number | null>(null);
  const advanced = useRef(false);
  const scope = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const items = me ? buildItems(run, me.id) : [];
  const issueFor = (id: number) => run.issues.find((i) => i.step_result_id === id);
  const firstAvailable = items.find((i) => i.result.status === "pending" && dependencyState(run, i) === "ready");
  const current = (focusId && items.find((i) => i.result.id === focusId)) || firstAvailable || null;
  const done = items.filter((i) => i.result.status !== "pending").length;
  const pendingLeft = items.filter((i) => i.result.status === "pending");
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const position = current ? items.indexOf(current) + 1 : items.length;
  const writable = canWrite && run.status === "active";

  useGSAP(() => { if (bar.current) return tweenProgress(bar.current, percent); }, { scope, dependencies: [percent] });
  useGSAP(() => {
    if (!current || !advanced.current) return;
    advanced.current = false;
    const cleanup = enterBlock(scope.current!.querySelector(".guided-card"));
    heading.current?.focus();
    return cleanup;
  }, { scope, dependencies: [current?.result.id] });

  if (!me) return <p className="hint">أنت لست مختبرًا في هذه الجلسة. استخدم «كل الخطوات» لمتابعة التقدم.</p>;
  const other = run.participants.filter((x) => x.id !== me.id);

  return (
    <div ref={scope} className="guided">
      <div className="guided-progress">
        <div className="guided-count">
          <strong>{current ? `الخطوة ${position} من ${items.length}` : `${done} من ${items.length} خطوة`}</strong>
          <span className="muted">{done} نتيجة محفوظة</span>
        </div>
        <div className="guided-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="تقدم خطواتك"><span ref={bar} style={{ width: `${percent}%` }} /></div>
        {other.map((o) => {
          const theirs = buildItems(run, o.id);
          return <p key={o.id} className="muted guided-other">{o.name}: {theirs.filter((i) => i.result.status !== "pending").length} من {theirs.length} خطوة</p>;
        })}
      </div>
      {run.status !== "active" && <p className="checkpoint" role="status"><Lock size={15} /> {run.status === "paused" ? "الجلسة متوقفة مؤقتًا. استأنفها لتسجيل نتائج جديدة." : "الجلسة منتهية؛ النتائج للعرض فقط."}</p>}

      {current ? (
        <StepCard
          key={current.result.id}
          project={p}
          run={run}
          item={current}
          index={position}
          total={items.length}
          queryKey={queryKey}
          writable={writable && !issueFor(current.result.id)}
          issue={issueFor(current.result.id)}
          headingRef={heading}
          onSaved={() => { advanced.current = true; setFocusId(null); }}
        />
      ) : (
        <Summary project={p} run={run} items={items} waiting={pendingLeft.length} issueFor={issueFor} />
      )}

      <details className="guided-list">
        <summary><ListChecks size={16} /> قائمة خطوات الاختبار</summary>
        <ol>
          {items.map((i, n) => {
            const dep = dependencyState(run, i);
            const locked = i.result.status === "pending" && dep !== "ready";
            return (
              <li key={i.result.id}>
                <button type="button" disabled={locked} aria-current={current?.result.id === i.result.id ? "step" : undefined} onClick={() => setFocusId(i.result.id)}>
                  <span className={`state-dot ${i.result.status}`} aria-hidden />
                  <span>{n + 1}. {i.step.title}</span>
                  <small>{locked ? (dep === "stuck" ? "عالقة بسبب خطوة فاشلة" : "بانتظار الطرف الآخر") : stateLabel[i.result.status]}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}

function StepCard({ project: p, run, item, index, total, queryKey, writable, issue, headingRef, onSaved }: {
  project: Project; run: Run; item: Item; index: number; total: number; queryKey: unknown[]; writable: boolean; issue?: Run["issues"][number];
  headingRef: React.RefObject<HTMLHeadingElement | null>; onSaved: () => void;
}) {
  const cache = useQueryClient();
  const { result, step } = item;
  const [base, setBase] = useState(result);
  const [status, setStatus] = useState<Choice>(result.status === "pending" ? "passed" : (result.status as Choice));
  const [actual, setActual] = useState(result.actual_result ?? "");
  const [notes, setNotes] = useState(result.notes ?? "");
  const stale = result.version !== base.version;
  const files = run.evidence.filter((e) => e.step_result_id === result.id);
  const needsEvidence = step.evidence_required || step.type === "capture_evidence";
  const happened = status !== "passed";
  const save = useMutation({
    mutationFn: () => api<{ data: Run }>(`/api/projects/${p.id}/runs/${run.id}/results/${result.id}`, "PUT", {
      version: base.version, status, actual_result: actual.trim() || "مطابقة للنتيجة المتوقعة", notes: notes || null, verified: status === "passed",
    }),
    onSuccess: (data) => { cache.setQueryData(queryKey, data); onSaved(); },
  });
  const reload = () => { setBase(result); setStatus(result.status === "pending" ? "passed" : (result.status as Choice)); setActual(result.actual_result ?? ""); setNotes(result.notes ?? ""); };
  const blockedByEvidence = status === "passed" && needsEvidence && files.length === 0;
  const invalid = happened && actual.trim().length < 3;
  const mine = run.participants.find((x) => x.id === result.participant_id);
  const partners = run.participants
    .filter((x) => x.id !== result.participant_id)
    .map((x) => ({ who: x, row: run.results.find((r) => r.run_case_id === item.case.id && r.step_key === step.id && r.participant_id === x.id) }))
    .filter((x) => x.row);
  const shared = step.assigned_role === "both" || step.type === "shared_checkpoint";

  return (
    <article className="guided-card panel padded" aria-label={`الخطوة ${index} من ${total}`}>
      <p className="muted guided-case"><span>{item.case.snapshot.title}</span> <span dir="ltr">TC-{item.case.test_case_id}</span></p>
      <h2 tabIndex={-1} ref={headingRef}>{index}. {step.title}</h2>
      <p className="muted">
        {mine && <span className={`tester-tag tester-${mine.role}`}>Tester {mine.role}</span>} {stepTypes[step.type] ?? step.type}
        {shared && partners.length > 0 && " · خطوة مشتركة ينفّذها المختبران"}
      </p>
      {step.type === "shared_checkpoint" && step.checkpoint && <p className="checkpoint"><strong>{step.checkpoint}</strong></p>}
      <dl className="guided-facts">
        <div><dt>ما المطلوب منك</dt><dd>{step.instructions || step.title}{step.target && <> — <bdi>{step.target}</bdi></>}</dd></div>
        {step.url && <div><dt>الرابط</dt><dd><a className="text-link" href={step.url} target="_blank" rel="noreferrer" dir="ltr">{step.url} <ExternalLink size={13} /></a></dd></div>}
        {step.value && <div><dt>بيانات الاختبار</dt><dd><bdi className="mono">{step.value}</bdi></dd></div>}
        <div className="expected"><dt>النتيجة المتوقعة</dt><dd>{step.expected_result}</dd></div>
      </dl>
      {shared && partners.length > 0 && (
        <ul className="guided-partners" aria-label="نتيجة الطرف الآخر لهذه الخطوة">
          {partners.map(({ who, row }) => (
            <li key={who.id}>
              <span className={`tester-tag tester-${who.role}`}>Tester {who.role}</span> <strong>{who.name}</strong>: {stateLabel[row!.status]}
              {row!.actual_result && <small> — {row!.actual_result}</small>}
            </li>
          ))}
        </ul>
      )}
      {issue && <Link className="linked-issue" to={`/projects/${p.id}/issues/${issue.id}`}><span dir="ltr">#{issue.number}</span> مشكلة مرتبطة بهذه الخطوة</Link>}

      {writable ? (
        <>
        <form id={`step-form-${result.id}`} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <fieldset className="guided-choices">
            <legend>ما نتيجة هذه الخطوة؟</legend>
            {choices.map(({ value, label, icon: Icon }) => (
              <label key={value} className={`choice ${value}${status === value ? " on" : ""}`}>
                <input type="radio" name={`s-${result.id}`} value={value} checked={status === value} onChange={() => setStatus(value)} />
                <Icon size={17} aria-hidden /> {label}
              </label>
            ))}
          </fieldset>
          <label>
            {happened ? "ماذا حدث؟" : "ملاحظات (اختياري)"}
            <textarea rows={3} maxLength={10000} required={happened} minLength={happened ? 3 : undefined} value={actual} onChange={(e) => setActual(e.target.value)} placeholder={happened ? "صف ما ظهر لك فعليًا" : "مطابقة للنتيجة المتوقعة"} />
          </label>
        </form>
        {(needsEvidence || happened) && (
            <div className="guided-evidence">
              <p><Paperclip size={15} aria-hidden /> {needsEvidence ? "هذه الخطوة تتطلب دليلًا قبل اعتماد النجاح." : "أرفق لقطة شاشة أو ملفًا يوضح المشكلة (اختياري)."}</p>
              {files.length > 0 && <EvidenceGallery projectId={p.id} files={files} />}
              <details><summary>إرفاق دليل</summary><EvidenceUpload compact projectId={p.id} target={{ step_result_id: result.id }} onUploaded={() => cache.invalidateQueries({ queryKey })} /></details>
            </div>
          )}
        <div>
          {stale && (
            <div className="error" role="alert">
              تغيّرت هذه النتيجة من جلسة أخرى ({stateLabel[result.status]}: {result.actual_result || "بدون وصف"}). راجعها قبل الحفظ.
              <button type="button" onClick={reload}>تحميل أحدث نتيجة</button>
            </div>
          )}
          <Notice error={save.error} />
          {save.error && <p className="hint">ما كتبتَه ما زال محفوظًا في النموذج؛ اضغط حفظ لإعادة المحاولة.</p>}
          {blockedByEvidence && <p className="hint">أرفق الدليل أولًا لتتمكن من حفظ «نجحت».</p>}
          <div className="guided-save">
            <button type="submit" form={`step-form-${result.id}`} className="primary" disabled={save.isPending || stale || invalid || blockedByEvidence}>
              {save.isPending ? "جارٍ الحفظ…" : save.error ? "إعادة محاولة الحفظ" : index < total ? "حفظ والانتقال للخطوة التالية" : "حفظ النتيجة"}
              <ArrowRight size={17} className="flip" />
            </button>
          </div>
        </div>
        </>
      ) : (
        <div className="recorded-result">
          <p><strong>{stateLabel[result.status]}</strong></p>
          <p>{result.actual_result || "لم تُسجَّل نتيجة بعد."}</p>
          {issue && <p className="hint">النتيجة مرتبطة بمشكلة، ويُتحقق من الإصلاح بإعادة الاختبار.</p>}
        </div>
      )}
    </article>
  );
}

function Summary({ project: p, run, items, waiting, issueFor }: { project: Project; run: Run; items: Item[]; waiting: number; issueFor: (id: number) => Run["issues"][number] | undefined }) {
  const failed = items.filter((i) => i.result.status === "failed" || i.result.status === "blocked");
  const passed = items.filter((i) => i.result.status === "passed").length;
  return (
    <section className="guided-summary panel padded" role="status">
      {items.length === 0 ? (
        <>
          <h2>لا توجد خطوات مسندة إليك في هذه الجلسة</h2>
          <p className="muted">خطوات هذه السيناريوهات مسندة للطرف الآخر. تابع تقدمه من «كل الخطوات».</p>
        </>
      ) : waiting > 0 ? (
        <>
          <h2>بانتظار الطرف الآخر</h2>
          <p className="muted">أنهيت ما يمكنك تنفيذه الآن. بقيت {waiting} خطوة تعتمد على خطوات الطرف الآخر؛ ستفتح تلقائيًا عند نجاحها.</p>
        </>
      ) : (
        <>
          <h2><CheckCircle2 size={22} aria-hidden /> أنهيت كل خطواتك</h2>
          <p className="muted">{passed} نجحت · {failed.length} فشلت أو تعذّر تنفيذها · من أصل {items.length}</p>
        </>
      )}
      {failed.length > 0 && (
        <ul className="guided-failures">
          {failed.map((i) => {
            const issue = issueFor(i.result.id);
            return (
              <li key={i.result.id}>
                <span><strong>{i.step.title}</strong><small>{stateLabel[i.result.status]} — {i.result.actual_result}</small></span>
                {issue ? <Link to={`/projects/${p.id}/issues/${issue.id}`}><bdi>#{issue.number}</bdi> عرض المشكلة</Link>
                  : p.role !== "viewer" && <Link className="button" to={`/projects/${p.id}/issues/new?run=${run.id}&result=${i.result.id}`}>إنشاء مشكلة</Link>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">اعتماد التقييم النهائي للجلسة يتم من «كل الخطوات» ويبقى لمنشئ الجلسة أو مدير المشروع.</p>
      <div className="inline-actions"><Link className="primary button" to="?view=all#final">مراجعة النتائج والتقييم النهائي</Link><Link className="button" to={`/projects/${p.id}/runs`}>كل الجلسات</Link></div>
    </section>
  );
}
