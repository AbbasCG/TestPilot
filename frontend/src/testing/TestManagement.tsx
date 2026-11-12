import { useState } from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Save,
  Trash2,
  ListChecks,
  BookOpen,
} from "lucide-react";
import { api } from "../api";
import type { Page, Project } from "../api";
import { Busy, Notice, useRefreshTesting } from "./shared";
import {
  emptyScenario,
  newStep,
  priorities,
  statuses,
  stepTypes,
  testTypes,
} from "./types";
import type { Scenario, ScenarioContent, Step, Suite, Template } from "./types";

const canDesign = (p: Project) =>
  ["owner", "manager", "tester"].includes(p.role);
export function TestManagement({ project }: { project: Project }) {
  return (
    <Routes>
      <Route index element={<Library project={project} />} />
      <Route path="new" element={<BuilderLoader project={project} />} />
      <Route
        path=":scenarioId/edit"
        element={<BuilderLoader project={project} />}
      />
      <Route
        path=":scenarioId"
        element={<ScenarioDetail project={project} />}
      />
    </Routes>
  );
}
function useSuites(project: number) {
  return useQuery({
    queryKey: ["testing", project, "suites"],
    queryFn: () => api<{ data: Suite[] }>(`/api/projects/${project}/suites`),
  });
}
function Library({ project: p }: { project: Project }) {
  const suites = useSuites(p.id);
  const [suiteId, setSuiteId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Suite | null | undefined>(undefined);
  const cases = useQuery({
    queryKey: ["testing", p.id, "scenarios", suiteId, page],
    queryFn: () =>
      api<Page<Scenario>>(
        `/api/projects/${p.id}/scenarios?page=${page}${suiteId ? `&suite_id=${suiteId}` : ""}`,
      ),
  });
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>مكتبة الاختبارات</h2>
          <p className="muted">
            مجموعات منظمة وسيناريوهات قابلة للتنفيذ، مع تاريخ محفوظ لكل نسخة.
          </p>
        </div>
        {canDesign(p) && (
          <Link className="primary button" to="new">
            <Plus size={18} /> سيناريو جديد
          </Link>
        )}
      </div>
      <Notice error={suites.error || cases.error} />
      <div className="library-grid">
        <aside className="panel padded suite-list">
          <div className="section-heading">
            <h3>المجموعات</h3>
            {canDesign(p) && (
              <button
                aria-label="إنشاء مجموعة"
                onClick={() => setEditing(null)}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          <button
            className={!suiteId ? "selected" : ""}
            onClick={() => {
              setSuiteId("");
              setPage(1);
            }}
          >
            كل السيناريوهات
          </button>
          {suites.data?.data.map((s) => (
            <div key={s.id} className="suite-row">
              <button
                className={suiteId === String(s.id) ? "selected" : ""}
                onClick={() => {
                  setSuiteId(String(s.id));
                  setPage(1);
                }}
              >
                <BookOpen size={17} />
                <span>
                  {s.name}
                  <small>
                    {s.cases_count} سيناريو · {s.ready_count} جاهز{" "}
                    {s.archived ? "· مؤرشفة" : ""}
                  </small>
                </span>
              </button>
              {canDesign(p) && (
                <button
                  className="text-button"
                  aria-label={`تعديل مجموعة ${s.name}`}
                  onClick={() => setEditing(s)}
                >
                  تعديل
                </button>
              )}
            </div>
          ))}
          {suites.isPending && <Busy />}
          {suites.data?.data.length === 0 && (
            <p className="hint">أنشئ مجموعة لتنظيم السيناريوهات.</p>
          )}
        </aside>
        <section className="panel">
          {cases.isPending ? (
            <Busy />
          ) : cases.data?.data.length ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>السيناريو</th>
                      <th>الحالة</th>
                      <th>الأولوية</th>
                      <th>النسخة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.data.data.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link className="scenario-title" to={String(c.id)}>
                            <ListChecks size={20} />
                            <span>
                              {c.title}
                              {c.is_template && (
                                <small>قالب قابل لإعادة الاستخدام</small>
                              )}
                            </span>
                          </Link>
                        </td>
                        <td>{statuses[c.status]}</td>
                        <td>{priorities[c.priority]}</td>
                        <td dir="ltr">v{c.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>{cases.data.meta.total} سيناريو</span>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  السابق
                </button>
                <button
                  disabled={page >= cases.data.meta.last_page}
                  onClick={() => setPage(page + 1)}
                >
                  التالي
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <ListChecks size={34} />
              <h3>حوّل خطوات العمل إلى اختبار واضح</h3>
              <p>ابدأ من قالب جاهز أو أنشئ السيناريو بنفسك.</p>
            </div>
          )}
        </section>
      </div>
      {editing !== undefined && (
        <SuiteEditor
          key={editing?.id ?? "new"}
          project={p}
          suite={editing}
          close={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
function SuiteEditor({
  project,
  suite,
  close,
}: {
  project: Project;
  suite: Suite | null;
  close: () => void;
}) {
  const [data, setData] = useState({
    name: suite?.name || "",
    description: suite?.description || "",
    position: suite?.position || 0,
    archived: suite?.archived || false,
  });
  const refresh = useRefreshTesting(project.id);
  const save = useMutation({
    mutationFn: () =>
      api(
        `/api/projects/${project.id}/suites${suite ? `/${suite.id}` : ""}`,
        suite ? "PUT" : "POST",
        { ...data, version: suite?.version },
      ),
    onSuccess: () => {
      refresh();
      close();
    },
  });
  return (
    <section className="panel padded edit-section">
      <h2>{suite ? "تعديل المجموعة" : "مجموعة جديدة"}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="field-grid">
          <label>
            اسم المجموعة
            <input
              autoFocus
              required
              maxLength={160}
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label>
            ترتيب المجموعة
            <input
              type="number"
              min={0}
              value={data.position}
              onChange={(e) =>
                setData({ ...data, position: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label>
          وصف المجموعة
          <textarea
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={data.archived}
            onChange={(e) => setData({ ...data, archived: e.target.checked })}
          />{" "}
          أرشفة المجموعة
        </label>
        <Notice error={save.error} />
        <div className="form-actions">
          <button className="primary" disabled={save.isPending}>
            حفظ المجموعة
          </button>
          <button type="button" onClick={close}>
            إلغاء
          </button>
        </div>
      </form>
    </section>
  );
}
function BuilderLoader({ project }: { project: Project }) {
  const { scenarioId } = useParams();
  const [params] = useSearchParams();
  const source = scenarioId || params.get("copy");
  const query = useQuery({
    queryKey: ["testing", project.id, "scenario", source],
    queryFn: () =>
      api<{ data: Scenario }>(
        `/api/projects/${project.id}/scenarios/${source}`,
      ),
    enabled: !!source,
  });
  if (!canDesign(project))
    return (
      <div className="panel padded">ليس لديك صلاحية تحرير الاختبارات.</div>
    );
  if (source && query.isPending) return <Busy />;
  if (query.error) return <Notice error={query.error} />;
  return (
    <ScenarioEditor
      key={`${source}-${query.data?.data.version}`}
      project={project}
      scenario={scenarioId ? query.data?.data : undefined}
      initial={source ? query.data?.data.content : undefined}
      copying={!!source && !scenarioId}
    />
  );
}
const contentLabels: Record<string, string> = {
  description: "الوصف",
  objective: "الهدف",
  prerequisites: "المتطلبات المسبقة",
  required_account: "الحساب المطلوب",
  required_role: "الدور المطلوب",
  test_data: "البيانات التجريبية",
  expected_results: "النتائج المتوقعة",
  acceptance_criteria: "معايير القبول",
};
function ScenarioEditor({
  project: p,
  scenario,
  initial,
  copying,
}: {
  project: Project;
  scenario?: Scenario;
  initial?: ScenarioContent;
  copying: boolean;
}) {
  const [content, setContent] = useState<ScenarioContent>(() =>
    initial
      ? {
          ...initial,
          title: copying ? `${initial.title} — نسخة` : initial.title,
          is_template: copying ? false : initial.is_template,
          status: copying ? "draft" : initial.status,
        }
      : emptyScenario(),
  );
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [localError, setLocalError] = useState<Error | null>(null);
  const suites = useSuites(p.id);
  const templates = useQuery({
    queryKey: ["testing", p.id, "templates"],
    queryFn: () =>
      api<{ data: Template[] }>(`/api/projects/${p.id}/scenario-templates`),
  });
  const dependencies = useQuery({
    queryKey: ["testing", p.id, "dependency-options"],
    queryFn: () =>
      api<{ data: { id: number; title: string }[] }>(
        `/api/projects/${p.id}/scenario-options`,
      ),
  });
  const navigate = useNavigate();
  const refresh = useRefreshTesting(p.id);
  const save = useMutation({
    mutationFn: () =>
      api<{ data: Scenario }>(
        `/api/projects/${p.id}/scenarios${scenario ? `/${scenario.id}` : ""}`,
        scenario ? "PUT" : "POST",
        { ...content, version: scenario?.version },
      ),
    onSuccess: (response) => {
      refresh();
      navigate(`/projects/${p.id}/tests/${response.data.id}`);
    },
  });
  const field = <K extends keyof ScenarioContent>(
    key: K,
    value: ScenarioContent[K],
  ) => setContent((prev) => ({ ...prev, [key]: value }));
  const changeStep = (index: number, changes: Partial<Step>) =>
    field(
      "steps",
      content.steps.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    );
  const move = (index: number, direction: number) => {
    const steps = [...content.steps];
    [steps[index], steps[index + direction]] = [
      steps[index + direction],
      steps[index],
    ];
    field("steps", steps);
  };
  function applyTemplate() {
    const template = templates.data?.data.find(
      (t) => t.id === selectedTemplate,
    );
    if (
      template &&
      window.confirm(
        "سيستبدل القالب محتوى المحرر غير المحفوظ. هل تريد المتابعة؟",
      )
    ) {
      const ids = new Map(
        template.content.steps.map((s) => [s.id, crypto.randomUUID()]),
      );
      setContent({
        ...template.content,
        suite_id: content.suite_id,
        environment_id: content.environment_id,
        steps: template.content.steps.map((s) => ({
          ...s,
          id: ids.get(s.id)!,
          depends_on: s.depends_on.map((id) => ids.get(id)!),
        })),
      });
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const seen = new Set<string>();
    for (const step of content.steps) {
      if (step.depends_on.some((id) => !seen.has(id))) {
        setLocalError(
          new Error(
            "ترتيب الخطوات يخالف الاعتماديات. ضع الخطوة المعتمَد عليها أولًا أو عدّل الربط.",
          ),
        );
        return;
      }
      seen.add(step.id);
    }
    setLocalError(null);
    save.mutate();
  }
  if (suites.isPending || templates.isPending || dependencies.isPending)
    return <Busy />;
  return (
    <form onSubmit={submit} className="scenario-editor">
      <div className="section-heading">
        <div>
          <h2>{scenario ? "تعديل السيناريو" : "بناء سيناريو جديد"}</h2>
          <p className="muted">
            خطوات واضحة لكل مختبر. يُحفظ كل تعديل كنسخة مستقلة.
          </p>
        </div>
        <Link to={`/projects/${p.id}/tests`}>العودة للمكتبة</Link>
      </div>
      <Notice
        error={
          save.error ||
          localError ||
          suites.error ||
          templates.error ||
          dependencies.error
        }
      />
      <div className="template-bar">
        <label>
          ابدأ من قالب
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            <option value="">اختر قالبًا جاهزًا</option>
            {templates.data?.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedTemplate}
          onClick={applyTemplate}
        >
          <Copy size={16} /> استخدام القالب
        </button>
      </div>
      <section className="panel padded">
        <h3>تعريف الاختبار</h3>
        <label>
          عنوان السيناريو
          <input
            required
            maxLength={200}
            value={content.title}
            onChange={(e) => field("title", e.target.value)}
          />
        </label>
        <div className="field-grid">
          <label>
            المجموعة
            <select
              required
              value={content.suite_id || ""}
              onChange={(e) => field("suite_id", Number(e.target.value))}
            >
              <option value="">اختر المجموعة</option>
              {suites.data?.data
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            بيئة الاختبار
            <select
              value={content.environment_id || ""}
              onChange={(e) =>
                field(
                  "environment_id",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            >
              <option value="">تُحدد عند التشغيل</option>
              {p.environments
                ?.filter((e) => !e.archived)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            الأولوية
            <select
              value={content.priority}
              onChange={(e) => field("priority", e.target.value)}
            >
              {Object.entries(priorities).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            نوع الاختبار
            <select
              value={content.test_type}
              onChange={(e) => field("test_type", e.target.value)}
            >
              {Object.entries(testTypes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            حالة السيناريو
            <select
              value={content.status}
              onChange={(e) => field("status", e.target.value)}
            >
              {Object.entries(statuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={content.is_template}
              onChange={(e) => field("is_template", e.target.checked)}
            />{" "}
            حفظه كقالب للمشروع
          </label>
        </div>
        <div className="field-grid">
          {Object.entries(contentLabels).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                required={["objective", "acceptance_criteria"].includes(key)}
                maxLength={10000}
                rows={2}
                value={(content[key as keyof ScenarioContent] as string) || ""}
                onChange={(e) => field(key as "description", e.target.value)}
              />
            </label>
          ))}
        </div>
        <fieldset className="dependencies">
          <legend>سيناريوهات يعتمد عليها هذا الاختبار</legend>
          {dependencies.data?.data
            .filter((d) => d.id !== scenario?.id)
            .map((d) => (
              <label className="check-label" key={d.id}>
                <input
                  type="checkbox"
                  checked={content.dependencies.includes(d.id)}
                  onChange={(e) =>
                    field(
                      "dependencies",
                      e.target.checked
                        ? [...content.dependencies, d.id]
                        : content.dependencies.filter((id) => id !== d.id),
                    )
                  }
                />
                {d.title}
              </label>
            ))}
          {!dependencies.data?.data.length && (
            <p className="hint">لا توجد سيناريوهات أخرى بعد.</p>
          )}
        </fieldset>
      </section>
      <div className="section-heading steps-heading">
        <h2>
          خطوات السيناريو{" "}
          <span className="muted">({content.steps.length})</span>
        </h2>
        <button
          type="button"
          disabled={content.steps.length >= 100}
          onClick={() => field("steps", [...content.steps, newStep()])}
        >
          <Plus size={17} /> إضافة خطوة
        </button>
      </div>
      <div className="step-ledger">
        {content.steps.map((step, index) => (
          <section
            className="panel step-card"
            key={step.id}
            aria-label={`الخطوة ${index + 1}`}
          >
            <header>
              <span className="step-number">{index + 1}</span>
              <strong>{step.title || "خطوة جديدة"}</strong>
              <span className={`tester-tag tester-${step.assigned_role}`}>
                {step.assigned_role === "both"
                  ? "المختبران A + B"
                  : `المختبر ${step.assigned_role}`}
              </span>
              <div className="step-actions">
                <button
                  type="button"
                  aria-label={`رفع الخطوة ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`خفض الخطوة ${index + 1}`}
                  disabled={index === content.steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`حذف الخطوة ${index + 1}`}
                  disabled={content.steps.length === 1}
                  onClick={() =>
                    field(
                      "steps",
                      content.steps
                        .filter((s) => s.id !== step.id)
                        .map((s) => ({
                          ...s,
                          depends_on: s.depends_on.filter(
                            (id) => id !== step.id,
                          ),
                        })),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </header>
            <div className="padded">
              <div className="field-grid">
                <label>
                  عنوان الخطوة
                  <input
                    required
                    maxLength={200}
                    value={step.title}
                    onChange={(e) =>
                      changeStep(index, { title: e.target.value })
                    }
                  />
                </label>
                <label>
                  نوع الخطوة
                  <select
                    value={step.type}
                    onChange={(e) =>
                      changeStep(index, {
                        type: e.target.value,
                        ...(e.target.value === "shared_checkpoint"
                          ? { assigned_role: "both" }
                          : {}),
                        ...(e.target.value === "capture_evidence"
                          ? { evidence_required: true }
                          : {}),
                      })
                    }
                  >
                    {Object.entries(stepTypes).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  المختبر المسؤول
                  <select
                    disabled={step.type === "shared_checkpoint"}
                    value={step.assigned_role}
                    onChange={(e) =>
                      changeStep(index, {
                        assigned_role: e.target.value as Step["assigned_role"],
                      })
                    }
                  >
                    <option value="A">Tester A</option>
                    <option value="B">Tester B</option>
                    <option value="both">الطرفان مستقلان</option>
                  </select>
                </label>
                <label>
                  رابط الصفحة
                  <input
                    dir="ltr"
                    type="url"
                    value={step.url || ""}
                    onChange={(e) => changeStep(index, { url: e.target.value })}
                  />
                </label>
                <label>
                  الزر أو الحقل
                  <input
                    value={step.target || ""}
                    onChange={(e) =>
                      changeStep(index, { target: e.target.value })
                    }
                  />
                </label>
                <label>
                  قيمة الاختبار
                  <input
                    value={step.value || ""}
                    onChange={(e) =>
                      changeStep(index, { value: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                النتيجة المتوقعة للخطوة
                <textarea
                  required
                  maxLength={5000}
                  value={step.expected_result}
                  onChange={(e) =>
                    changeStep(index, { expected_result: e.target.value })
                  }
                />
              </label>
              <label>
                تعليمات تفصيلية
                <textarea
                  value={step.instructions || ""}
                  onChange={(e) =>
                    changeStep(index, { instructions: e.target.value })
                  }
                />
              </label>
              {step.type === "shared_checkpoint" && (
                <label>
                  معيار نقطة التحقق المشتركة
                  <input
                    required
                    value={step.checkpoint || ""}
                    onChange={(e) =>
                      changeStep(index, { checkpoint: e.target.value })
                    }
                  />
                </label>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={step.evidence_required}
                  onChange={(e) =>
                    changeStep(index, { evidence_required: e.target.checked })
                  }
                />{" "}
                دليل مطلوب لإثبات النتيجة
              </label>
              {index > 0 && (
                <fieldset className="dependencies">
                  <legend>انتظر اكتمال الخطوات التالية</legend>
                  {content.steps.slice(0, index).map((prior, i) => (
                    <label className="check-label" key={prior.id}>
                      <input
                        type="checkbox"
                        checked={step.depends_on.includes(prior.id)}
                        onChange={(e) =>
                          changeStep(index, {
                            depends_on: e.target.checked
                              ? [...step.depends_on, prior.id]
                              : step.depends_on.filter((id) => id !== prior.id),
                          })
                        }
                      />
                      {i + 1}. {prior.title || "خطوة بلا عنوان"}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="builder-save">
        <span className="muted">
          {scenario
            ? `النسخة الحالية ${scenario.version} · الحفظ ينشئ نسخة جديدة`
            : "لم يُحفظ هذا السيناريو بعد"}
        </span>
        <button className="primary" disabled={save.isPending}>
          <Save size={17} />
          {save.isPending ? "جارٍ الحفظ…" : "حفظ السيناريو"}
        </button>
      </div>
    </form>
  );
}
function ScenarioDetail({ project: p }: { project: Project }) {
  const { scenarioId } = useParams();
  const [revision, setRevision] = useState("");
  const scenario = useQuery({
    queryKey: ["testing", p.id, "scenario", scenarioId],
    queryFn: () =>
      api<{ data: Scenario }>(`/api/projects/${p.id}/scenarios/${scenarioId}`),
  });
  const history = useQuery({
    queryKey: ["testing", p.id, "revisions", scenarioId],
    queryFn: () =>
      api<{
        data: {
          id: number;
          version: number;
          created_at: string;
          content: ScenarioContent;
        }[];
      }>(`/api/projects/${p.id}/scenarios/${scenarioId}/revisions`),
  });
  if (scenario.isPending) return <Busy />;
  if (!scenario.data) return <Notice error={scenario.error} />;
  const s = scenario.data.data;
  const content = revision
    ? history.data?.data.find((r) => r.version === Number(revision))?.content ||
      s.content
    : s.content;
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>{content.title}</h2>
          <p className="muted">
            <span dir="ltr">
              TC-{s.id} · v{revision || s.version}
            </span>{" "}
            · {statuses[content.status]} · {priorities[content.priority]}
          </p>
        </div>
        {canDesign(p) && (
          <div className="inline-actions">
            <Link
              className="button"
              to={`/projects/${p.id}/tests/new?copy=${s.id}`}
            >
              <Copy size={16} /> نسخ السيناريو
            </Link>
            <Link className="primary button" to="edit">
              تعديل السيناريو
            </Link>
          </div>
        )}
      </div>
      <Notice error={history.error} />
      <section className="panel padded">
        <div className="field-grid">
          <label>
            استعراض نسخة محفوظة
            <select
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
            >
              <option value="">النسخة الحالية</option>
              {history.data?.data.map((r) => (
                <option key={r.id} value={r.version}>
                  النسخة {r.version} —{" "}
                  {new Date(r.created_at).toLocaleString("ar")}
                </option>
              ))}
            </select>
          </label>
          <p className="hint" dir="ltr">
            {s.uid}
          </p>
        </div>
        <dl className="scenario-facts">
          {Object.entries(contentLabels).map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{content[key as "description"] || "—"}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          الاعتماديات:{" "}
          {content.dependencies.length
            ? content.dependencies.map((id) => `TC-${id}`).join("، ")
            : "لا توجد"}
        </p>
      </section>
      <h2 className="steps-heading">خطة التنفيذ</h2>
      <div className="step-ledger">
        {content.steps.map((step, i) => (
          <section className="panel padded detail-step" key={step.id}>
            <span className="step-number">{i + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p className="muted">
                {stepTypes[step.type]} ·{" "}
                {step.assigned_role === "both"
                  ? "تأكيد الطرفين"
                  : `Tester ${step.assigned_role}`}
              </p>
              <p>{step.instructions}</p>
              <p>
                <strong>المتوقع: </strong>
                {step.expected_result}
              </p>
              {step.url && (
                <a
                  className="text-link"
                  href={step.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  فتح صفحة الاختبار
                </a>
              )}
              {step.target && (
                <p>
                  الهدف: {step.target} · القيمة: {step.value}
                </p>
              )}
              {step.checkpoint && (
                <p className="checkpoint">{step.checkpoint}</p>
              )}
              {step.evidence_required && (
                <span className="pill">دليل مطلوب</span>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
