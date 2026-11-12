export type EvidenceFile = {
  id: number;
  issue_id: number | null;
  step_result_id: number | null;
  retest_attempt_id: number | null;
  kind: "screenshot" | "video" | "attachment";
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
  created_at: string;
  uploaded_by: number;
  uploader: string;
};

export type IssueRow = {
  id: number;
  number: number;
  title: string;
  status: string;
  severity: string;
  priority: string;
  assignee_id: number | null;
  assignee_name: string | null;
  reporter_name: string;
  test_run_id: number | null;
  build_version: string | null;
  environment_snapshot: { name: string } | null;
  evidence_count: number;
  retest_count: number;
  created_at: string;
  updated_at: string;
};

export type Retest = {
  id: number;
  attempt_number: number;
  assignee_id: number;
  assignee_name: string;
  requester_name: string;
  build_version: string;
  fix_notes: string;
  status: string;
  actual_result: string | null;
  notes: string | null;
  verified: boolean;
  version: number;
  executed_at: string | null;
  created_at: string;
  snapshot: {
    title: string;
    reproduction_steps: string;
    expected_result: string;
    original_actual_result: string;
    original_build: string | null;
    step: {
      scenario: string | null;
      title: string;
      expected_result: string;
      instructions: string;
    } | null;
  };
  evidence: EvidenceFile[];
};

export type IssueActivity = {
  id: number;
  event: string;
  actor: string;
  created_at: string;
  metadata: Record<string, string | number | null | string[]>;
};

export type Issue = {
  id: number;
  project_id: number;
  number: number;
  title: string;
  description: string;
  reproduction_steps: string;
  expected_result: string;
  actual_result: string;
  severity: string;
  priority: string;
  status: string;
  reporter_id: number;
  reporter_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  build_version: string | null;
  environment_snapshot: { name: string; url: string | null } | null;
  resolution: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  duplicate_of: { id: number; number: number; title: string } | null;
  run: { id: number; title: string; status: string; outcome: string | null; build_version: string } | null;
  scenario: { id: number; title: string; uid: string } | null;
  step: {
    result_id: number;
    status: string;
    tester_role: string;
    tester_id: number;
    tester_name: string;
    title: string | null;
    expected_result: string | null;
    scenario_title: string | null;
    scenario_version: number | null;
    evidence: EvidenceFile[];
  } | null;
  comments: { id: number; body: string; author: string; author_id: number; created_at: string }[];
  activities: IssueActivity[];
  retests: Retest[];
  evidence: EvidenceFile[];
  permissions: { transitions: string[]; edit: boolean; comment: boolean; upload: boolean; manage: boolean };
};

export type IssueSummary = {
  total: number;
  open: number;
  critical_open: number;
  ready_for_retest: number;
  assigned_to_me: number;
  my_pending_retests: number;
  by_status: Record<string, number>;
  open_by_severity: Record<string, number>;
  retests: Record<string, number>;
};

export const issueStatuses: Record<string, string> = {
  new: "جديدة",
  triaged: "مفروزة",
  assigned: "مُسندة",
  in_progress: "قيد الإصلاح",
  ready_for_retest: "جاهزة لإعادة الاختبار",
  verified: "متحقَّق من إصلاحها",
  closed: "مغلقة",
  reopened: "أعيد فتحها",
  duplicate: "مكررة",
  deferred: "مؤجلة",
  wont_fix: "لن تُصلح",
};

export const transitionLabels: Record<string, string> = {
  triaged: "اعتماد الفرز",
  assigned: "إسناد للإصلاح",
  in_progress: "بدء الإصلاح",
  ready_for_retest: "إرسال لإعادة الاختبار",
  closed: "إغلاق المشكلة",
  reopened: "إعادة فتح",
  duplicate: "تعليمها كمكررة",
  deferred: "تأجيل",
  wont_fix: "لن تُصلح",
};

export const noteRequired = ["ready_for_retest", "wont_fix", "deferred", "duplicate", "reopened"];

export const severities: Record<string, string> = {
  blocker: "معطِّلة",
  critical: "حرجة",
  major: "كبيرة",
  minor: "بسيطة",
  trivial: "طفيفة",
};

export const issuePriorities: Record<string, string> = {
  urgent: "عاجلة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

export const evidenceKinds: Record<string, { label: string; accept: string; limit: string }> = {
  screenshot: { label: "لقطة شاشة", accept: "image/png,image/jpeg,image/webp,image/gif", limit: "PNG أو JPEG أو WebP أو GIF حتى 8 ميغابايت" },
  video: { label: "فيديو", accept: "video/mp4,video/webm", limit: "MP4 أو WebM حتى 40 ميغابايت" },
  attachment: { label: "مرفق", accept: ".pdf,.txt,.csv,.json,application/pdf,text/plain,text/csv,application/json", limit: "PDF أو TXT أو CSV أو JSON حتى 10 ميغابايت" },
};

export const activityLabels: Record<string, string> = {
  created: "أنشأ المشكلة",
  updated: "عدّل بيانات المشكلة",
  status_changed: "غيّر الحالة",
  commented: "أضاف تعليقًا",
  evidence_added: "أرفق دليلًا",
  retest_requested: "طلب إعادة اختبار",
  retest_recorded: "سجّل نتيجة إعادة الاختبار",
  retest_reassigned: "أعاد تعيين إعادة الاختبار",
};

export const formatDate = (value: string) =>
  new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });

export const formatSize = (bytes: number) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} م.ب` : `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
