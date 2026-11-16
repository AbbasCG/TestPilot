import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Download, FileJson, Upload, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { Project } from "../api";
import { confirmPulse, enterPanel, useGSAP } from "../motion";
import "./import.css";

type Kit = { template: Record<string, unknown>; prompt: string; limits: { max_bytes: number; max_scenarios: number; max_total_steps: number } };
type Row = { index: number; title: string; status: "new" | "duplicate" | "duplicate_in_file" | "invalid"; steps_count: number; duplicate_of: { id: number; title: string } | null; errors: string[] };
type Preview = { summary: { total: number; new: number; duplicate: number; invalid: number; steps: number }; scenarios: Row[]; errors: string[]; suite: { mode: "existing" | "create"; id: number | null; name: string | null } };
type Imported = { created: { id: number; title: string }[]; skipped_duplicates: unknown[]; suite: { id: number; name: string }; replayed: boolean };

const rowLabel: Record<Row["status"], string> = { new: "جديد", duplicate: "مكرر في المشروع", duplicate_in_file: "مكرر داخل الملف", invalid: "غير صالح" };

/** Models often wrap JSON in a ```json fence; accept that as pasted text. */
export function parseDocument(text: string): unknown {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPanel({ project: p, suiteId, onClose }: { project: Project; suiteId: number | null; onClose: () => void }) {
  const cache = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [doc, setDoc] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [copied, setCopied] = useState(false);
  const [duplicates, setDuplicates] = useState<"skip" | "create">("skip");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [changed, setChanged] = useState<Preview | null>(null);
  const [lastPreview, setLastPreview] = useState<Preview | null>(null);

  const kit = useQuery({ queryKey: ["import-kit", p.id], queryFn: () => api<{ data: Kit }>(`/api/projects/${p.id}/scenarios/import/kit`) });
  const body = (extra: object = {}) => ({ document: doc, suite_id: suiteId, ...extra });

  const preview = useMutation({
    mutationFn: () => api<{ data: Preview }>(`/api/projects/${p.id}/scenarios/import/preview`, "POST", body()),
    onSuccess: (r) => { setLastPreview(r.data); setChanged(null); setKey(crypto.randomUUID()); },
  });
  const confirm = useMutation({
    mutationFn: (acknowledge: boolean) => {
      const s = (changed ?? lastPreview)!.summary;
      return api<{ data: Imported }>(`/api/projects/${p.id}/scenarios/import`, "POST", body({ idempotency_key: key, duplicates, expected: { new: s.new, duplicate: s.duplicate }, acknowledge_changes: acknowledge || undefined }));
    },
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: ["testing", p.id] });
      cache.invalidateQueries({ queryKey: ["activity", p.id] });
      cache.invalidateQueries({ queryKey: ["project", String(p.id)] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "import_changed" && e.payload.preview) {
        setChanged(e.payload.preview as Preview);
        setKey(crypto.randomUUID());
      }
    },
  });

  useGSAP(() => {
    if (root.current) enterPanel(root.current.querySelector(".import-panel")!, root.current.querySelector(".import-backdrop"));
    heading.current?.focus();
  }, { scope: root });
  useGSAP(() => {
    if (confirm.isSuccess && result.current) {
      confirmPulse(result.current);
      result.current.focus();
    }
  }, { scope: root, dependencies: [confirm.isSuccess] });

  const close = () => {
    onClose();
    queueMicrotask(() => (opener.current as HTMLElement | null)?.focus?.());
  };
  const data = changed ?? lastPreview;
  const done = confirm.data?.data;
  const readFile = async (file: File | undefined) => {
    setFileError(""); setDoc(null); setLastPreview(null); setChanged(null); confirm.reset(); preview.reset();
    if (!file) return;
    setFileName(file.name);
    const limit = kit.data?.data.limits.max_bytes ?? 1_048_576;
    if (file.size > limit) return setFileError(`حجم الملف ${(file.size / 1048576).toFixed(1)} ميغابايت ويتجاوز الحد (${limit / 1048576} ميغابايت).`);
    try {
      const parsed = parseDocument(await file.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("shape");
      setDoc(parsed);
    } catch {
      setFileError("تعذّرت قراءة الملف: تأكد أنه JSON صالح بصيغة القالب.");
    }
  };
  const errorText = (e: unknown) => (e instanceof ApiError ? (Array.isArray((e.payload.errors as Record<string, string[]> | undefined)?.document) ? (e.payload.errors as Record<string, string[]>).document : [e.message]) : ["تعذّر إكمال العملية. أعد المحاولة."]);
  const failure = preview.error ?? (confirm.error && !(confirm.error instanceof ApiError && confirm.error.code === "import_changed") ? confirm.error : null);

  return (
    <div ref={root}>
      <div className="import-backdrop" onClick={close} />
      <div className="import-panel" role="dialog" aria-modal="true" aria-labelledby="import-title" onKeyDown={(e) => e.key === "Escape" && close()}>
        <header>
          <h2 id="import-title" tabIndex={-1} ref={heading}>استيراد سيناريوهات من ملف</h2>
          <button type="button" className="icon-button" aria-label="إغلاق" onClick={close}><X size={18} /></button>
        </header>
        <div className="import-body">
          {done ? (
            <div ref={result} tabIndex={-1} className="import-done" role="status">
              <CheckCircle2 size={34} />
              <h3>{done.created.length ? `أُضيف ${done.created.length} سيناريو كمسودات` : "لم يُضف أي سيناريو جديد"}</h3>
              <p>
                {done.skipped_duplicates.length ? `تخطّينا ${done.skipped_duplicates.length} سيناريو مكررًا. ` : ""}
                المجموعة: <strong>{done.suite.name}</strong>. راجع السيناريوهات وحوّلها إلى «جاهز للاختبار» عند الاكتمال.
              </p>
              <div className="inline-actions">
                <Link className="primary button" to={`/projects/${p.id}/tests?suite=${done.suite.id}&status=draft`} onClick={onClose}>راجع السيناريوهات</Link>
                <button type="button" onClick={close}>إغلاق</button>
              </div>
            </div>
          ) : (
            <>
              <ol className="import-steps">
                <li>
                  <h3><span>1</span> جهّز الملف</h3>
                  <p className="muted">اطلب من أداة الذكاء الاصطناعي توليد السيناريوهات بهذه الصيغة، أو عدّل القالب يدويًا.</p>
                  <div className="inline-actions">
                    <button type="button" disabled={!kit.data} onClick={async () => { await navigator.clipboard.writeText(kit.data!.data.prompt); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
                      <Copy size={16} /> {copied ? "تم النسخ" : "نسخ الموجّه (Prompt)"}
                    </button>
                    <button type="button" disabled={!kit.data} onClick={() => download("testpilot-scenarios-template.json", JSON.stringify(kit.data!.data.template, null, 2))}>
                      <Download size={16} /> تنزيل قالب JSON
                    </button>
                  </div>
                  <span role="status" className="sr-only">{copied ? "نُسخ الموجّه إلى الحافظة" : ""}</span>
                  {kit.isError && <p className="error" role="alert">تعذّر تحميل القالب. أعد فتح النافذة.</p>}
                </li>
                <li>
                  <h3><span>2</span> ارفع الملف وراجعه</h3>
                  <label className="import-drop">
                    <Upload size={20} />
                    <span>{fileName || "اختر ملف JSON (حتى 1 ميغابايت)"}</span>
                    <input type="file" accept=".json,application/json,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
                  </label>
                  {fileError && <p className="error" role="alert">{fileError}</p>}
                  <button type="button" className="primary" disabled={!doc || preview.isPending} onClick={() => preview.mutate()}>
                    <FileJson size={16} /> {preview.isPending ? "جارٍ الفحص…" : "فحص الملف (لن يُحفظ شيء)"}
                  </button>
                  {failure && (
                    <ul className="import-errors" role="alert">
                      {errorText(failure).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
                </li>
                {data && (
                  <li aria-live="polite">
                    <h3><span>3</span> المعاينة</h3>
                    {changed && <p className="checkpoint"><AlertTriangle size={16} /> تغيّرت بيانات المشروع منذ المعاينة السابقة. راجع الأرقام الجديدة ثم أكّد.</p>}
                    <p className="import-summary">
                      <b>{data.summary.new}</b> جديد · <b>{data.summary.duplicate}</b> مكرر · <b className={data.summary.invalid ? "bad" : ""}>{data.summary.invalid}</b> غير صالح · <b>{data.summary.steps}</b> خطوة
                    </p>
                    <p className="muted">
                      {data.suite.mode === "create" ? <>ستُنشأ مجموعة جديدة: <strong>{data.suite.name}</strong></> : <>ستُضاف إلى المجموعة: <strong>{data.suite.name}</strong></>}
                    </p>
                    {data.errors.length > 0 && (
                      <ul className="import-errors">{data.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    )}
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>#</th><th>السيناريو</th><th>الحالة</th><th>الخطوات</th></tr></thead>
                        <tbody>
                          {data.scenarios.map((r) => (
                            <tr key={r.index} className={`import-row ${r.status}`}>
                              <td dir="ltr">{r.index}</td>
                              <td>{r.title}{r.duplicate_of && <small>يطابق «{r.duplicate_of.title}»</small>}</td>
                              <td><span className={`import-chip ${r.status}`}>{rowLabel[r.status]}</span></td>
                              <td>{r.steps_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.summary.duplicate > 0 && (
                      <fieldset className="import-dupes">
                        <legend>المكررات</legend>
                        <label className="check-label"><input type="radio" name="dupes" checked={duplicates === "skip"} onChange={() => setDuplicates("skip")} /> تخطّيها (الافتراضي)</label>
                        <label className="check-label"><input type="radio" name="dupes" checked={duplicates === "create"} onChange={() => setDuplicates("create")} /> أضفها كنسخ جديدة</label>
                      </fieldset>
                    )}
                    <button
                      type="button"
                      className="primary"
                      disabled={confirm.isPending || data.summary.invalid > 0 || (data.summary.new === 0 && duplicates === "skip")}
                      onClick={() => confirm.mutate(Boolean(changed))}
                    >
                      {confirm.isPending ? "جارٍ الاستيراد…" : data.summary.invalid > 0 ? "أصلح الأخطاء ثم أعد الرفع" : "استيراد كمسودات"}
                    </button>
                    {confirm.error && !(confirm.error instanceof ApiError && confirm.error.code === "import_changed") && (
                      <p className="error" role="alert">{confirm.error.message} يمكنك إعادة الضغط بأمان؛ لن يتكرر الاستيراد.</p>
                    )}
                  </li>
                )}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
