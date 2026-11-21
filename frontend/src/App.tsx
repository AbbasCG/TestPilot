import { lazy, Suspense, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  Link,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  keepPreviousData,
  MutationCache,
  QueryCache,
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
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronLeft,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { Page, Project, User } from "./api";





import { QualityOverview } from "./analytics/QualityOverview";
import { AcceptInvitation, ChangePasswordForm, ForcedPasswordChange, ForgotPassword, InactiveAccount, ResetPassword } from "./users/AccountScreens";
import { TeamMembers } from "./users/TeamMembers";

import { CommandPalette, usePaletteShortcut } from "./CommandPalette";
import "./shell.css";

const TestManagement = lazy(() => import("./testing/TestManagement").then((m) => ({ default: m.TestManagement })));
const ProjectMaintenance = lazy(() => import("./testing/ProjectMaintenance").then((m) => ({ default: m.ProjectMaintenance })));
const RunManagement = lazy(() => import("./testing/RunManagement").then((m) => ({ default: m.RunManagement })));
const IssueManagement = lazy(() => import("./issues/IssueManagement").then((m) => ({ default: m.IssueManagement })));
const AnalyticsSection = lazy(() => import("./analytics/Analytics").then((m) => ({ default: m.AnalyticsSection })));
const ProjectComparison = lazy(() => import("./analytics/Analytics").then((m) => ({ default: m.ProjectComparison })));
const MyWork = lazy(() => import("./work/MyWork").then((m) => ({ default: m.MyWork })));
const UsersAdmin = lazy(() => import("./users/UsersAdmin").then((m) => ({ default: m.UsersAdmin })));

// Server-side account gates: an inactive account leaves the app; a pending
// temporary-password change re-reads the profile so the change screen appears.
function onAccountError(error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.code === "account_inactive") {
    client.clear();
    if (window.location.pathname !== "/account-inactive") window.location.replace("/account-inactive");
  } else if (error.code === "password_change_required") {
    client.invalidateQueries({ queryKey: ["user"] });
  }
}
const client: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAccountError }),
  mutationCache: new MutationCache({ onError: onAccountError }),
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
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
      navigate(safeNext(params.get("next")));
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
          <p className="hint">
            <Link className="text-link" to="/forgot-password">
              نسيت كلمة المرور؟
            </Link>
          </p>
          <p className="hint">للحصول على حساب، اطلب دعوة من مسؤول مساحة العمل.</p>
        </div>
      </section>
    </main>
  );
}
function Shell() {
  const me = useMe();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const projectMatch = useMatch("/projects/:id/*");
  const projectId = projectMatch?.params.id && /^\d+$/.test(projectMatch.params.id) ? projectMatch.params.id : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  usePaletteShortcut(() => setPaletteOpen(true));
  const switcher = useQuery({
    queryKey: ["projects", "switcher"],
    queryFn: () => api<Page<Project>>("/api/projects?status=active"),
    enabled: Boolean(me.data),
  });
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
  if (me.error instanceof ApiError && me.error.code === "account_inactive")
    return <Navigate to="/account-inactive" replace />;
  if (me.data?.data.must_change_password)
    return <ForcedPasswordChange user={me.data.data} onLogout={() => logout.mutate()} />;
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
        <label className="project-switcher">
          المشروع الحالي
          <select
            value={projectId ?? ""}
            onChange={(e) => {
              const tail = projectId ? location.pathname.split("/").slice(3, 4).join("/") : "";
              navigate(e.target.value ? `/projects/${e.target.value}${tail ? `/${tail}` : ""}` : "/projects");
            }}
          >
            <option value="">{projectId ? "كل المشاريع" : "اختر مشروعًا"}</option>
            {switcher.data?.data.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="search-button" onClick={() => setPaletteOpen(true)}>
          <span><Search size={16} /> بحث سريع</span>
          <kbd dir="ltr">Ctrl K</kbd>
        </button>
        <nav aria-label="التنقل الرئيسي">
          <NavLink to="/" end>
            <LayoutDashboard size={20} /> نظرة عامة
          </NavLink>
          <NavLink to="/my-work">
            <ClipboardList size={20} /> عملي
          </NavLink>
          <NavLink to="/projects">
            <FolderKanban size={20} /> المشاريع
          </NavLink>
          {(me.data.data.platform_role === "owner" || me.data.data.platform_role === "admin") && (
            <NavLink to="/admin/users">
              <UserCog size={20} /> إدارة المستخدمين
            </NavLink>
          )}
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
            {projectId && switcher.data?.data.find((p) => String(p.id) === projectId)?.name}
          </span>
          <div className="topbar-actions">
          <button className="icon-button mobile-only" type="button" aria-label="تسجيل الخروج" onClick={() => logout.mutate()}>
            <LogOut size={20} />
          </button>
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
          </div>
        </header>
        <main className="content">
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/my-work" element={<MyWork />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<ProjectWizard />} />
            <Route path="/projects/:id/*" element={<ProjectDetail />} />
            <Route
              path="/settings"
              element={<SettingsPage user={me.data.data} />}
            />
            {(me.data.data.platform_role === "owner" || me.data.data.platform_role === "admin") && (
              <Route path="/admin/users/*" element={<UsersAdmin me={me.data.data} />} />
            )}
            <Route
              path="*"
              element={
                <div className="empty">
                  الصفحة غير موجودة. <Link to="/">العودة للرئيسية</Link>
                </div>
              }
            />
          </Routes>
          </Suspense>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="التنقل السريع">
        <NavLink to="/" end><LayoutDashboard size={20} />الرئيسية</NavLink>
        {!projectId && <NavLink to="/my-work"><ClipboardList size={20} />عملي</NavLink>}
        <NavLink to="/projects" end><FolderKanban size={20} />المشاريع</NavLink>
        {projectId && <NavLink to={`/projects/${projectId}/runs`}><Play size={20} />الجلسات</NavLink>}
        {projectId && <NavLink to={`/projects/${projectId}/tests`}><ListChecks size={20} />السيناريوهات</NavLink>}
        <button type="button" onClick={() => setPaletteOpen(true)}><Search size={20} />بحث</button>
        <NavLink to="/settings"><Settings size={20} />حسابي</NavLink>
      </nav>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
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
function ProjectTable({ projects, filtered = false }: { projects: Project[]; filtered?: boolean }) {
  return projects.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>المشروع</th>
            <th>الحالة</th>
            <th>دورك</th>
            <th>آخر إصدار مختبَر</th>
            <th>مفتوح</th>
            <th>
              <span className="sr-only">إجراء</span>
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
              <td>
                {p.stats?.last_run ? (
                  <>
                    <bdi>{p.stats.last_run.build_version}</bdi>
                    <small>{p.stats.last_run.environment ?? "—"}</small>
                  </>
                ) : (
                  <span className="muted">لم يُختبر بعد</span>
                )}
              </td>
              <td>
                {p.stats ? (
                  <span className="project-counts">
                    {p.stats.open_runs} جلسة · {p.stats.open_issues} مشكلة
                    {p.stats.critical_open > 0 && <b className="danger-text"> ({p.stats.critical_open} حرجة)</b>}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="row-actions">
                {p.role !== "viewer" && p.status === "active" && (p.stats?.scenarios_ready ?? 0) > 0 && (
                  <Link className="button primary" to={`/projects/${p.id}/runs/new`}>ابدأ الاختبار</Link>
                )}
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
    filtered ? (
      <div className="empty">
        <h3>لا توجد مشاريع مطابقة</h3>
        <p>عدّل البحث أو الحالة.</p>
      </div>
    ) : (
      <div className="empty">
        <FolderKanban size={38} />
        <h3>ابدأ بمشروعك الأول</h3>
        <p>أنشئ مساحة مستقلة للفريق وبيئات الاختبار.</p>
        <NewProjectLink />
      </div>
    )
  );
}
function Dashboard() {
  const projects = useQuery({
    queryKey: ["projects", 1],
    queryFn: () => api<Page<Project>>("/api/projects"),
  });
  return (
    <>
      <QualityOverview action={<NewProjectLink />} />
      <ErrorNote error={projects.error} />
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
      <ProjectComparison />
    </>
  );
}
function Projects() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };
  const projects = useQuery({
    queryKey: ["projects", page, search, status],
    queryFn: () => api<Page<Project>>(`/api/projects?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}${status ? `&status=${status}` : ""}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageTitle title="المشاريع" text="لكل مشروع فريقه وصلاحياته وبيئاته المستقلة." action={<NewProjectLink />} />
      <ErrorNote error={projects.error} />
      <div className="filter-bar" role="search">
        <label className="search-field">
          <span className="sr-only">ابحث عن مشروع</span>
          <Search size={16} aria-hidden />
          <input type="search" defaultValue={search} placeholder="ابحث باسم المشروع" onChange={(e) => update({ q: e.target.value.trim() })} />
        </label>
        <label>
          <span className="sr-only">الحالة</span>
          <select value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="archived">مؤرشف</option>
          </select>
        </label>
      </div>
      <section className="panel">
        {projects.isPending ? (
          <Loading />
        ) : (
          projects.data && (
            <>
              <ProjectTable projects={projects.data.data} filtered={Boolean(search || status)} />
              <div className="pagination">
                <span>{projects.data.meta.total} مشروع</span>
                <button disabled={page === 1} onClick={() => update({ page: String(page - 1) })}>السابق</button>
                <span>{page} / {projects.data.meta.last_page}</span>
                <button disabled={page >= projects.data.meta.last_page} onClick={() => update({ page: String(page + 1) })}>التالي</button>
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
                <textarea aria-label="وصف المشروع"
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
  const runMatch = useMatch("/projects/:id/runs/:runId");
  // A single session is a focused screen: no project header or tabs around it.
  const focusRun = Boolean(runMatch?.params.runId && /^\d+$/.test(runMatch.params.runId));
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api<{ data: Project }>(`/api/projects/${id}`),
  });
  if (project.isPending) return <Loading />;
  if (project.error || !project.data)
    return <ErrorNote error={project.error} />;
  const p = project.data.data;
  if (focusRun)
    return (
      <>
        <Link className="back" to={`/projects/${p.id}/runs`}>
          <ArrowRight size={16} /> جلسات {p.name}
        </Link>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="runs/*" element={<RunManagement project={p} />} />
          </Routes>
        </Suspense>
      </>
    );
  return (
    <>
      <Link className="back" to="/projects">
        <ArrowRight size={16} /> المشاريع
      </Link>
      <PageTitle
        title={p.name}
        text={p.description || "مساحة المشروع"}
        action={
          <div className="inline-actions">
            <span className={`status ${p.status}`}>
              {p.status === "active" ? "نشط" : "مؤرشف"}
            </span>
            {p.role !== "viewer" && p.status === "active" && (
              <>
                <Link className="button" to={`/projects/${p.id}/runs/new?mode=solo`}>اختبار منفرد</Link>
                <Link className="primary button" to={`/projects/${p.id}/runs/new`}>
                  <Play size={17} /> ابدأ الاختبار
                </Link>
              </>
            )}
          </div>
        }
      />
      <nav className="tabs" aria-label="أقسام المشروع">
        <NavLink to={`/projects/${id}/runs`}>جلسات الاختبار</NavLink>
        <NavLink to={`/projects/${id}/tests`}>الاختبارات</NavLink>
        <NavLink to={`/projects/${id}/issues`}>المشكلات</NavLink>
        <NavLink to={`/projects/${id}/analytics`}>التحليلات</NavLink>
        <NavLink to={`/projects/${id}`} end>
          نظرة عامة
        </NavLink>
        <NavLink to={`/projects/${id}/team`}>
          <Users size={17} /> أعضاء الفريق
        </NavLink>
        <NavLink to={`/projects/${id}/edit`}>إعدادات المشروع</NavLink>
      </nav>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="runs/*" element={<RunManagement project={p} />} />
        <Route path="tests/*" element={<TestManagement project={p} />} />
        <Route path="issues/*" element={<IssueManagement project={p} />} />
        <Route path="analytics/*" element={<AnalyticsSection project={p} />} />
        <Route index element={<ProjectOverview project={p} />} />
        <Route path="team" element={<TeamMembers project={p} />} />
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
      </Suspense>
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
  const stats = p.stats;
  const canManage = ["owner", "manager"].includes(p.role);
  const steps = stats && p.status === "active" && p.role !== "viewer"
    ? [
        { done: stats.environments_active > 0, text: "أضف بيئة اختبار", to: null as string | null, hint: "من قسم بيئات العمل أدناه", show: canManage },
        { done: stats.scenarios_total > 0, text: "أضف سيناريوهات", to: `/projects/${p.id}/tests`, hint: "أنشئ سيناريو أو استورد ملفًا", show: true },
        { done: stats.scenarios_ready > 0, text: "جهّز سيناريو للاختبار", to: `/projects/${p.id}/tests?status=draft`, hint: "حوّل المسودة إلى «جاهز للاختبار»", show: true },
        { done: stats.runs_total > 0, text: "ابدأ أول جلسة اختبار", to: `/projects/${p.id}/runs/new`, hint: "اختر السيناريوهات والبيئة", show: true },
      ].filter((x) => x.show)
    : [];
  const next = steps.find((x) => !x.done);
  return (
    <>
      {next && (
        <section className="panel padded next-steps" aria-label="الخطوة التالية">
          <h2>ابدأ من هنا</h2>
          <ol>
            {steps.map((x) => (
              <li key={x.text} className={x.done ? "done" : x === next ? "now" : ""}>
                <span className="step-mark" aria-hidden>{x.done ? <Check size={14} /> : ""}</span>
                <span>{x.text}<small>{x.hint}</small></span>
                {x === next && x.to && <Link className="primary button" to={x.to}>متابعة</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {stats?.last_run && (
        <p className="last-run muted">
          آخر جلسة: <Link className="text-link" to={`/projects/${p.id}/runs/${stats.last_run.id}`}>{stats.last_run.title}</Link> · <bdi>{stats.last_run.build_version}</bdi>
          {stats.last_run.environment && <> · {stats.last_run.environment}</>}
        </p>
      )}
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
    </>
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
          <textarea aria-label="الوصف"
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
      <section className="panel padded">
        <h2>تغيير كلمة المرور</h2>
        <p className="hint">بعد التغيير تُنهى جلساتك على الأجهزة الأخرى.</p>
        <ChangePasswordForm onChanged={() => undefined} />
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
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<AcceptInvitation />} />
          <Route path="/account-inactive" element={<InactiveAccount />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
