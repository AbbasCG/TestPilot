export type Step = {
  id: string;
  type: string;
  title: string;
  assigned_role: "A" | "B" | "both";
  url: string;
  target: string;
  value: string;
  expected_result: string;
  instructions: string;
  checkpoint: string;
  evidence_required: boolean;
  depends_on: string[];
};
export type ScenarioContent = {
  suite_id: number;
  environment_id: number | null;
  title: string;
  description: string;
  objective: string;
  priority: string;
  test_type: string;
  prerequisites: string;
  required_account: string;
  required_role: string;
  test_data: string;
  expected_results: string;
  acceptance_criteria: string;
  dependencies: number[];
  status: string;
  is_template: boolean;
  steps: Step[];
};
export type Scenario = {
  id: number;
  uid: string;
  project_id: number;
  suite_id: number;
  title: string;
  version: number;
  priority: string;
  status: string;
  is_template: boolean;
  content: ScenarioContent;
};
export type Suite = {
  id: number;
  name: string;
  description: string;
  position: number;
  archived: boolean;
  version: number;
  cases_count: number;
  ready_count: number;
};
export type Template = { id: string; name: string; content: ScenarioContent };
export const stepTypes: Record<string, string> = {
  navigate: "انتقال إلى صفحة",
  click: "نقر زر",
  input: "إدخال قيمة",
  select: "اختيار قيمة",
  upload: "رفع ملف",
  verify: "تحقق",
  compare: "مقارنة",
  switch_user: "تبديل المستخدم",
  wait_for_tester: "انتظار مختبر",
  shared_checkpoint: "نقطة تحقق مشتركة",
  capture_evidence: "التقاط دليل",
  custom_action: "إجراء مخصص",
};
export const statuses: Record<string, string> = {
  draft: "مسودة",
  ready: "جاهز للاختبار",
  archived: "مؤرشف",
};
export const priorities: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};
export const testTypes: Record<string, string> = {
  functional: "وظيفي",
  regression: "انحدار",
  smoke: "فحص أولي",
  security: "أمان",
  integration: "تكامل",
  usability: "سهولة الاستخدام",
  performance: "أداء",
  other: "أخرى",
};
export const newStep = (): Step => ({
  id: crypto.randomUUID(),
  type: "verify",
  title: "",
  assigned_role: "A",
  url: "",
  target: "",
  value: "",
  expected_result: "",
  instructions: "",
  checkpoint: "",
  evidence_required: false,
  depends_on: [],
});
export const emptyScenario = (): ScenarioContent => ({
  suite_id: 0,
  environment_id: null,
  title: "",
  description: "",
  objective: "",
  priority: "medium",
  test_type: "functional",
  prerequisites: "",
  required_account: "",
  required_role: "",
  test_data: "",
  expected_results: "",
  acceptance_criteria: "",
  dependencies: [],
  status: "draft",
  is_template: false,
  steps: [newStep()],
});
