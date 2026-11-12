import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, Film, Paperclip, Upload } from "lucide-react";
import { upload } from "../api";
import { Notice } from "../testing/shared";
import type { EvidenceFile } from "./types";
import { evidenceKinds, formatDate, formatSize } from "./types";

type Target = { issue_id?: number; step_result_id?: number; retest_attempt_id?: number };

const fileUrl = (projectId: number, id: number, inline = false) =>
  `/api/projects/${projectId}/evidence/${id}${inline ? "?inline=1" : ""}`;

export function EvidenceGallery({ projectId, files, empty }: { projectId: number; files: EvidenceFile[]; empty?: string }) {
  if (!files.length) return <p className="muted evidence-empty">{empty ?? "لا توجد أدلة مرفقة بعد."}</p>;
  return (
    <ul className="evidence-gallery" aria-label="الأدلة المرفقة">
      {files.map((file) => (
        <li key={file.id} className={`evidence-item evidence-${file.kind}`}>
          {file.kind === "screenshot" ? (
            <a href={fileUrl(projectId, file.id, true)} target="_blank" rel="noreferrer" className="evidence-preview">
              <img src={fileUrl(projectId, file.id, true)} alt={`لقطة شاشة: ${file.original_name}`} loading="lazy" />
            </a>
          ) : file.kind === "video" ? (
            <video className="evidence-preview" controls preload="none" src={fileUrl(projectId, file.id, true)} aria-label={`فيديو: ${file.original_name}`} />
          ) : (
            <span className="evidence-preview evidence-icon" aria-hidden="true">
              <FileText size={30} />
            </span>
          )}
          <div className="evidence-meta">
            <a className="text-link" href={fileUrl(projectId, file.id)} dir="auto">
              {file.kind === "video" ? <Film size={14} /> : <Paperclip size={14} />} {file.original_name}
            </a>
            <small>
              {file.uploader} · {formatSize(file.size)} · {formatDate(file.created_at)}
            </small>
            <small className="hash" dir="ltr" title="بصمة SHA-256 للتحقق من سلامة الملف">
              sha256 {file.sha256.slice(0, 12)}…
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceUpload({ projectId, target, onUploaded, compact }: { projectId: number; target: Target; onUploaded: (file: EvidenceFile) => void; compact?: boolean }) {
  const [kind, setKind] = useState<keyof typeof evidenceKinds>("screenshot");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const send = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file!);
      Object.entries(target).forEach(([key, value]) => value && form.append(key, String(value)));
      return upload<{ data: EvidenceFile }>(`/api/projects/${projectId}/evidence`, form);
    },
    onSuccess: (data) => {
      setFile(null);
      if (input.current) input.current.value = "";
      onUploaded(data.data);
    },
  });
  return (
    <form
      className={`evidence-upload${compact ? " compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (file) send.mutate();
      }}
    >
      <label>
        نوع الدليل
        <select value={kind} onChange={(e) => setKind(e.target.value as keyof typeof evidenceKinds)}>
          {Object.entries(evidenceKinds).map(([value, k]) => (
            <option key={value} value={value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={id}>
        الملف
        <input id={id} ref={input} type="file" accept={evidenceKinds[kind].accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-describedby={`${id}-hint`} />
      </label>
      <p className="hint" id={`${id}-hint`}>
        {evidenceKinds[kind].limit}. يُفحص المحتوى فعليًا ويُخزن بشكل خاص داخل المشروع.
      </p>
      <Notice error={send.error} />
      <button type="submit" disabled={!file || send.isPending}>
        <Upload size={16} /> {send.isPending ? "جارٍ الرفع…" : "رفع الدليل"}
      </button>
      {send.isSuccess && (
        <p role="status" className="saved">
          رُفع الدليل وحُفظ بشكل خاص.
        </p>
      )}
    </form>
  );
}
