import { useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronLeft,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { Page, Project, User } from "./api";
import { TestManagement } from "./testing/TestManagement";
import { ProjectMaintenance } from "./testing/ProjectMaintenance";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, e) =>
        !(e instanceof ApiError && e.status < 500) && count < 1,
      staleTime: 15_000,
    },
  },
});
const roles: Record<string, string> = {
  owner: "مالك المشروع",
  manager: "مدير",
  tester: "مختبر",
  viewer: "مشاهد",
};
function ErrorNote({ error }: { error: Error | null }) {
  return error ? (
    <div className="error" role="alert">
      {error.message}
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="empty" role="status">
      جارٍ تحميل مساحة العمل…
    </div>
  );
}
function useMe() {
  return useQuery({
    queryKey: ["user"],
    queryFn: () => api<{ data: User }>("/api/user"),
    retry: false,
  });
}

const loginSchema = z.object({
  email: z.email("أدخل بريدًا إلكترونيًا صحيحًا"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});
function Login() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  const login = useMutation({
    mutationFn: async (values: z.infer<typeof loginSchema>) => {
      await api("/sanctum/csrf-cookie");
      return api<{ data: User }>("/api/login", "POST", values);
    },
    onSuccess: (data) => {
      cache.clear();
      cache.setQueryData(["user"], data);
      navigate("/");
    },
  });
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <ShieldCheck size={34} /> TestPilot
        </div>
        <div>
          <span className="pill">مساحة عمل ضمان الجودة</span>
          <h1>
            كل اختبار،
            <br />
            خطوة نحو الثقة.
          </h1>
          <p>
            نظّم مشاريعك وبيئات العمل، واجمع فريق الجودة في مساحة واحدة واضحة.
          </p>
          <div className="login-track">
            <span>
              <Check /> مشاريع مستقلة
            </span>
            <span>
              <Check /> صلاحيات واضحة
            </span>
            <span>
              <Check /> سجل تغييرات محفوظ
            </span>
          </div>
        </div>
        <small>مساحة خاصة لفريقك ومشاريعك</small>
      </section>
      <section className="login-form">
        <div>
          <h2>مرحبًا بعودتك</h2>
          <p className="muted">سجّل الدخول إلى مساحة الاختبارات.</p>
          <form onSubmit={form.handleSubmit((v) => login.mutate(v))}>
            <label>
              البريد الإلكتروني
              <input
                autoComplete="username"
                dir="ltr"
                type="email"
                {...form.register("email")}
              />
            </label>
            <span className="field-error">
              {form.formState.errors.email?.message}
            </span>
            <label>
              كلمة المرور
              <input
                autoComplete="current-password"
                dir="ltr"
                type="password"
                {...form.register("password")}
              />
            </label>
            <span className="field-error">
              {form.formState.errors.password?.message}
            </span>
            <ErrorNote error={login.error} />
            <button className="primary" disabled={login.isPending}>
              {login.isPending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
              <ArrowLeft size={18} />
            </button>
          </form>
          <p className="hint">للحصول على حساب، تواصل مع مسؤول مساحة العمل.</p>
        </div>
      </section>
    </main>
  );
}
function Shell() {
  const me = useMe();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const logout = useMutation({
    mutationFn: () => api("/api/logout", "POST"),
    onSuccess: () => {
      cache.clear();
      navigate("/login");
    },
  });
  if (me.isPending) return <Loading />;
  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.error || !me.data)
    return (
      <main className="content">
        <ErrorNote error={me.error} />
        <button onClick={() => me.refetch()}>إعادة المحاولة</button>
      </main>
    );
  return (
    <div className="app" data-theme={dark ? "dark" : "light"}>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <ShieldCheck size={29} /> TestPilot
        </Link>
        <div className="workspace">
          <span className="workspace-icon">TP</span>
          <div>
            مساحة الجودة<small>إدارة المشاريع والاختبارات</small>
          </div>
        </div>
        <nav aria-label="التنقل الرئيسي">
          <NavLink to="/" end>
            <LayoutDashboard size={20} /> نظرة عامة
          </NavLink>
          <NavLink to="/projects">
            <FolderKanban size={20} /> المشاريع
          </NavLink>
          <NavLink to="/settings">
            <Settings size={20} /> الإعدادات
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="identity">
            <span className="avatar">{me.data.data.name[0]}</span>
            <div>
              {me.data.data.name}
              <small dir="ltr">{me.data.data.email}</small>
            </div>
          </div>
          <button onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut size={18} /> تسجيل الخروج
          </button>
          <ErrorNote error={logout.error} />
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            مساحة العمل <ChevronLeft size={15} /> ضمان الجودة
          </span>
          <button
            className="icon-button"
            aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            onClick={() => {
              setDark(!dark);
              localStorage.setItem("theme", dark ? "light" : "dark");
            }}
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<ProjectWizard />} />
            <Route path="/projects/:id/*" element={<ProjectDetail />} />
            <Route
              path="/settings"
              element={<SettingsPage user={me.data.data} />}
            />
            <Route
              path="*"
              element={
                <div className="empty">
                  الصفحة غير موجودة. <Link to="/">العودة للرئيسية</Link>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function PageTitle({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </div>
      {action}
    </div>
  );
}
function NewProjectLink() {
  return (
    <Link className="primary button" to="/projects/new">
      <Plus size={18} /> مشروع جديد
    </Link>
  );
}
function ProjectTable({ projects }: { projects: Project[] }) {
  return projects.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>المشروع</th>
            <th>الحالة</th>
            <th>دورك</th>
            <th>الأعضاء</th>
            <th>
              <span className="sr-only">عرض</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <Link className="project-name" to={`/projects/${p.id}`}>
                  <span className="project-icon">
                    <FolderKanban size={21} />
                  </span>
                  <span>
                    {p.name}
                    <small>{p.description || "لم يُضف وصف بعد"}</small>
                  </span>
                </Link>
              </td>
              <td>
                <span className={`status ${p.status}`}>
                  {p.status === "active" ? "نشط" : "مؤرشف"}
                </span>
              </td>
              <td>{roles[p.role]}</td>
              <td>{p.members_count}</td>
              <td>
                <Link aria-label={`فتح ${p.name}`} to={`/projects/${p.id}`}>
                  <ChevronLeft size={20} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      <FolderKanban size={38} />
      <h3>ابدأ بمشروعك الأول</h3>
      <p>أنشئ مساحة مستقلة للفريق وبيئات الاختبار.</p>
      <NewProjectLink />
    </div>
  );
}
function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard"],
    queryFn: () =>
      api<{
        data: {
          projects: number;
          active_projects: number;
          environments: number;
        };
      }>("/api/dashboard"),
  });
  const projects = useQuery({
    queryKey: ["projects", 1],
    queryFn: () => api<Page<Project>>("/api/projects"),
  });
  const metrics = [
    { icon: FolderKanban, label: "المشاريع", value: stats.data?.data.projects },
    {
      icon: Activity,
      label: "المشاريع النشطة",
      value: stats.data?.data.active_projects,
    },
    { icon: Boxes, label: "بيئات العمل", value: stats.data?.data.environments },
  ];
  return (
    <>
      <PageTitle
        title="نظرة واضحة على الجودة"
        text="مشاريعك وبيئاتك، من بيانات مساحة العمل مباشرة."
        action={<NewProjectLink />}
      />
      <ErrorNote error={stats.error || projects.error} />
      <div className="stats">
        {metrics.map((m) => (
          <section className="stat" key={m.label}>
            <m.icon size={22} />
            <span>{m.label}</span>
            <strong>{m.value ?? "—"}</strong>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>آخر المشاريع</h2>
          <Link to="/projects">
            كل المشاريع <ArrowLeft size={16} />
          </Link>
        </div>
        {projects.isPending ? (
          <Loading />
        ) : (
          projects.data && <ProjectTable projects={projects.data.data} />
        )}
      </section>
    </>
  );
}
function Projects() {
  const [page, setPage] = useState(1);
  const projects = useQuery({
    queryKey: ["projects", page],
    queryFn: () => api<Page<Project>>(`/api/projects?page=${page}`),
  });
  return (
    <>
      <PageTitle
        title="المشاريع"
        text="لكل مشروع فريقه وصلاحياته وبيئاته المستقلة."
        action={<NewProjectLink />}
      />
      <ErrorNote error={projects.error} />
      <section className="panel">
        {projects.isPending ? (
          <Loading />
        ) : (
          projects.data && (
            <>
              <ProjectTable projects={projects.data.data} />
              <div className="pagination">
                <span>{projects.data.meta.total} مشروع</span>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  السابق
                </button>
                <span>
                  {page} / {projects.data.meta.last_page}
                </span>
                <button
                  disabled={page >= projects.data.meta.last_page}
                  onClick={() => setPage(page + 1)}
                >
                  التالي
                </button>
              </div>
            </>
          )
        )}
      </section>
    </>
  );
}
const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "اسم المشروع مطلوب")
    .max(120, "الحد الأقصى 120 حرفًا"),
  description: z.string().max(5000, "الوصف طويل جدًا"),
});
type ProjectInput = z.infer<typeof projectSchema>;
function ProjectWizard() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", description: "" },
  });
  const create = useMutation({
    mutationFn: (data: ProjectInput) =>
      api<{ data: Project }>("/api/projects", "POST", data),
    onSuccess: (data) => {
      cache.invalidateQueries({ queryKey: ["projects"] });
      cache.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/projects/${data.data.id}`);
    },
  });
  return (
    <>
      <PageTitle
        title="إنشاء مشروع"
        text="ابدأ بالتفاصيل، ثم راجع المشروع قبل إنشائه."
      />
      <div className="wizard-steps">
        <span className={step === 1 ? "selected" : ""}>1. تفاصيل المشروع</span>
        <span className={step === 2 ? "selected" : ""}>2. المراجعة</span>
      </div>
      <section className="panel form-panel">
        <form
          onSubmit={form.handleSubmit((values) =>
            step === 1 ? setStep(2) : create.mutate(values),
          )}
        >
          {step === 1 ? (
            <>
              <label>
                اسم المشروع
                <input
                  {...form.register("name")}
                  placeholder="مثل: بوابة العملاء"
                />
              </label>
              <span className="field-error">
                {form.formState.errors.name?.message}
              </span>
              <label>
                وصف المشروع
                <textarea
                  {...form.register("description")}
                  rows={4}
                  placeholder="ما الذي سيختبره الفريق في هذا المشروع؟"
                />
              </label>
              <span className="field-error">
                {form.formState.errors.description?.message}
              </span>
            </>
          ) : (
            <div className="review">
              <h2>{form.getValues("name")}</h2>
              <p>{form.getValues("description") || "بدون وصف"}</p>
              <p className="muted">
                ستصبح مالك المشروع، ويمكنك إضافة الأعضاء والبيئات من صفحة
                المشروع.
              </p>
            </div>
          )}
          <ErrorNote error={create.error} />
          <div className="form-actions">
            <button className="primary" disabled={create.isPending}>
              {step === 1
                ? "متابعة للمراجعة"
                : create.isPending
                  ? "جارٍ الإنشاء…"
                  : "إنشاء المشروع"}
              <ArrowLeft size={17} />
            </button>
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)}>
                رجوع
              </button>
            )}
            <Link to="/projects">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
function ProjectDetail() {
  const { id } = useParams();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<{ data: Project }>(`/api/projects/${id}`),
  });
  if (project.isPending) return <Loading />;
  if (project.error || !project.data)
    return <ErrorNote error={project.error} />;
  const p = project.data.data;
  return (
    <>
      <Link className="back" to="/projects">
        <ArrowRight size={16} /> المشاريع
      </Link>
      <PageTitle
        title={p.name}
        text={p.description || "مساحة المشروع"}
        action={
          <span className={`status ${p.status}`}>
            {p.status === "active" ? "نشط" : "مؤرشف"}
          </span>
        }
      />
      <nav className="tabs" aria-label="أقسام المشروع">
        <NavLink to={`/projects/${id}/tests`}>الاختبارات</NavLink>
        <NavLink to={`/projects/${id}`} end>
          نظرة عامة
        </NavLink>
        <NavLink to={`/projects/${id}/team`}>
          <Users size={17} /> أعضاء الفريق
        </NavLink>
        <NavLink to={`/projects/${id}/edit`}>إعدادات المشروع</NavLink>
      </nav>
      <Routes>
        <Route path="tests/*" element={<TestManagement project={p} />} />
        <Route index element={<ProjectOverview project={p} />} />
        <Route path="team" element={<Team project={p} />} />
        <Route
          path="edit"
          element={
            <>
              <EditProject key={p.version} project={p} />
              {["owner", "manager"].includes(p.role) && (
                <ProjectMaintenance project={p} />
              )}
            </>
          }
        />
      </Routes>
    </>
  );
}
function useRefreshProject(id: number) {
  const cache = useQueryClient();
  return () => {
    cache.invalidateQueries({ queryKey: ["project", String(id)] });
    cache.invalidateQueries({ queryKey: ["projects"] });
    cache.invalidateQueries({ queryKey: ["dashboard"] });
    cache.invalidateQueries({ queryKey: ["activity", id] });
  };
}
function ProjectOverview({ project: p }: { project: Project }) {
  const refresh = useRefreshProject(p.id);
  const form = useForm<{ name: string; url: string }>();
  const add = useMutation({
    mutationFn: (data: { name: string; url: string }) =>
      api(`/api/projects/${p.id}/environments`, "POST", data),
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  const activity = useQuery({
    queryKey: ["activity", p.id],
    queryFn: () =>
      api<{ data: { id: number; action: string; created_at: string }[] }>(
        `/api/projects/${p.id}/activity`,
      ),
  });
  const labels: Record<string, string> = {
    "project.created": "إنشاء المشروع",
    "project.updated": "تحديث المشروع",
    "environment.created": "إضافة بيئة عمل",
    "member.updated": "تحديث عضوية الفريق",
  };
  return (
    <div className="detail-grid">
      <section className="panel padded">
        <h2>بيئات العمل</h2>
        <p className="muted">عناوين البيئات التي يستخدمها فريق الاختبار.</p>
        {p.environments?.length ? (
          <ul className="environments">
            {p.environments.map((e) => (
              <li key={e.id}>
                <Boxes size={20} />
                <div>
                  <strong>{e.name}</strong>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" dir="ltr">
                      {e.url}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">لا توجد بيئات. أضف بيئة التطوير أو التجربة.</p>
        )}
        {["owner", "manager"].includes(p.role) && (
          <form onSubmit={form.handleSubmit((v) => add.mutate(v))}>
            <label>
              اسم البيئة
              <input
                {...form.register("name", { required: true })}
                required
                maxLength={80}
                placeholder="بيئة التجربة"
              />
            </label>
            <label>
              عنوان البيئة (اختياري)
              <input
                {...form.register("url")}
                type="url"
                dir="ltr"
                placeholder="https://staging.example.com"
              />
            </label>
            <ErrorNote error={add.error} />
            <button disabled={add.isPending}>
              <Plus size={17} /> إضافة بيئة
            </button>
          </form>
        )}
      </section>
      <section className="panel padded">
        <h2>سجل النشاط</h2>
        <ErrorNote error={activity.error} />
        {activity.isPending ? (
          <Loading />
        ) : (
          <ol className="activity">
            {activity.data?.data.map((a) => (
              <li key={a.id}>
                <span className="activity-dot" />
                <div>
                  {labels[a.action] || a.action}
                  <small>{new Date(a.created_at).toLocaleString("ar")}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
function Team({ project: p }: { project: Project }) {
  const refresh = useRefreshProject(p.id);
  const form = useForm<{ email: string; role: string }>({
    defaultValues: { role: "tester" },
  });
  const add = useMutation({
    mutationFn: (data: { email: string; role: string }) =>
      api(`/api/projects/${p.id}/members`, "PUT", data),
    onSuccess: () => {
      form.reset();
      refresh();
    },
  });
  return (
    <section className="panel padded">
      <h2>أعضاء الفريق</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>البريد الإلكتروني</th>
              <th>الصلاحية</th>
            </tr>
          </thead>
          <tbody>
            {p.members?.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  <span dir="ltr">{m.email}</span>
                </td>
                <td>{roles[m.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.role === "owner" && (
        <form
          className="member-form"
          onSubmit={form.handleSubmit((v) => add.mutate(v))}
        >
          <h3>إضافة عضو أو تحديث صلاحياته</h3>
          <p className="muted">يجب أن يكون للعضو حساب موجود في مساحة العمل.</p>
          <label>
            البريد الإلكتروني
            <input
              type="email"
              dir="ltr"
              {...form.register("email", { required: true })}
              required
            />
          </label>
          <label>
            الصلاحية
            <select {...form.register("role")}>
              <option value="tester">مختبر</option>
              <option value="manager">مدير</option>
              <option value="viewer">مشاهد</option>
            </select>
          </label>
          <ErrorNote error={add.error} />
          <button className="primary" disabled={add.isPending}>
            حفظ العضوية
          </button>
          {add.isSuccess && <p role="status">تم حفظ العضوية.</p>}
        </form>
      )}
    </section>
  );
}
function EditProject({ project: p }: { project: Project }) {
  const refresh = useRefreshProject(p.id);
  const form = useForm<ProjectInput & { status: string }>({
    defaultValues: {
      name: p.name,
      description: p.description || "",
      status: p.status,
    },
  });
  const update = useMutation({
    mutationFn: (values: ProjectInput & { status: string }) =>
      api(`/api/projects/${p.id}`, "PATCH", { ...values, version: p.version }),
    onSuccess: refresh,
  });
  if (!["owner", "manager"].includes(p.role))
    return (
      <div className="panel padded">إعدادات المشروع متاحة للمالك والمدير.</div>
    );
  return (
    <section className="panel form-panel">
      <h2>تفاصيل المشروع</h2>
      <form onSubmit={form.handleSubmit((v) => update.mutate(v))}>
        <label>
          اسم المشروع
          <input {...form.register("name")} required maxLength={120} />
        </label>
        <label>
          الوصف
          <textarea
            {...form.register("description")}
            maxLength={5000}
            rows={4}
          />
        </label>
        <label>
          الحالة
          <select {...form.register("status")}>
            <option value="active">نشط</option>
            <option value="archived">مؤرشف</option>
          </select>
        </label>
        <ErrorNote error={update.error} />
        {update.error instanceof ApiError && update.error.status === 409 && (
          <button type="button" onClick={refresh}>
            تحميل أحدث نسخة
          </button>
        )}
        <button className="primary" disabled={update.isPending}>
          حفظ التغييرات
        </button>
      </form>
    </section>
  );
}
function SettingsPage({ user }: { user: User }) {
  return (
    <>
      <PageTitle
        title="إعدادات مساحة العمل"
        text="معلومات حسابك وتفضيلات العرض."
      />
      <section className="panel padded">
        <h2>الحساب</h2>
        <dl className="account">
          <dt>الاسم</dt>
          <dd>{user.name}</dd>
          <dt>البريد الإلكتروني</dt>
          <dd dir="ltr">{user.email}</dd>
          <dt>اللغة والاتجاه</dt>
          <dd>العربية — من اليمين إلى اليسار</dd>
        </dl>
        <p className="hint">
          يمكنك تبديل المظهر الفاتح والداكن من أعلى الصفحة. تُحفظ تفضيلاتك على
          هذا الجهاز.
        </p>
      </section>
    </>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
