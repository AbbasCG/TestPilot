import { useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, KeyRound, MailPlus, RotateCcw, Search, ShieldCheck, UserPlus, Users, XCircle } from "lucide-react";
import { api, ApiError } from "../api";
import type { User } from "../api";
import { Busy, Notice } from "../testing/shared";
import { OneTimeSecret } from "./OneTimeSecret";
import type { AdminUser, Delivery, InvitationView, UserDetail } from "./types";
import { activityLabels, formatDateTime, invitationLabels, inviteUrl, platformRoleLabels, projectRoleLabels, stateLabels } from "./types";

type ProjectOption = { id: number; name: string; status: string; owner_id: number };

export function UsersAdmin({ me }: { me: User }) {
  return (
    <Routes>
      <Route index element={<UsersOverview />} />
      <Route path="new" element={<CreateUserWizard me={me} />} />
      <Route path="invitations" element={<InvitationsAdmin />} />
      <Route path=":userId" element={<UserDetailPage me={me} />} />
    </Routes>
  );
}

function useProjects() {
  return useQuery({ queryKey: ["admin", "projects"], queryFn: () => api<{ data: ProjectOption[] }>("/api/admin/projects") });
}

export function StateBadge({ state }: { state: AdminUser["state"] }) {
  return <span className={`account-state state-${state}`}>{stateLabels[state]}</span>;
}

function AdminNav() {
  return (
    <nav className="tabs" aria-label="أقسام إدارة المستخدمين">
      <NavLink to="/admin/users" end>
        المستخدمون
      </NavLink>
      <NavLink to="/admin/users/invitations">الدعوات</NavLink>
      <NavLink to="/admin/users/new">إضافة مستخدم</NavLink>
    </nav>
  );
}

function UsersOverview() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const projects = useProjects();
  const query = new URLSearchParams([...params.entries()].filter(([, v]) => v)).toString();
  const list = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => api<{ data: AdminUser[]; current_page: number; last_page: number; total: number; summary: { total: number; active: number; must_change_password: number; inactive: number; pending_invitations: number } }>(`/api/admin/users?${query}`),
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const s = list.data?.summary;
  const page = Number(params.get("page") ?? 1);
  const sort = params.get("sort") ?? "created_at";
  const direction = params.get("direction") ?? (sort === "name" ? "asc" : "desc");
  const sortButton = (key: string, label: string) => (
    <button
      type="button"
      className="sort-button"
      aria-label={`ترتيب حسب ${label}`}
      aria-pressed={sort === key}
      onClick={() => {
        const next = new URLSearchParams(params);
        next.set("sort", key);
        next.set("direction", sort === key && direction === "asc" ? "desc" : "asc");
        next.delete("page");
        setParams(next, { replace: true });
      }}
    >
      {label} {sort === key ? (direction === "asc" ? "▲" : "▼") : ""}
    </button>
  );
  const cards = [
    { icon: Users, label: "كل المستخدمين", value: s?.total, filter: "" },
    { icon: CheckCircle2, label: "نشطون", value: s?.active, filter: "active" },
    { icon: KeyRound, label: "بانتظار تغيير كلمة المرور", value: s?.must_change_password, filter: "must_change_password" },
    { icon: Ban, label: "معلّقون أو معطّلون", value: s?.inactive, filter: "suspended" },
  ];
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>إدارة المستخدمين</h1>
          <p className="muted">أنشئ الحسابات وادعُ الأعضاء وأدر حالاتهم وصلاحياتهم في المشاريع.</p>
        </div>
        <Link className="primary button" to="new">
          <UserPlus size={17} /> إضافة مستخدم
        </Link>
      </div>
      <AdminNav />
      <Notice error={list.error || projects.error} />
      <div className="stats users-stats">
        {cards.map((c) => (
          <button type="button" className="stat stat-button" key={c.label} onClick={() => set("state", c.filter)} aria-pressed={(params.get("state") ?? "") === c.filter}>
            <c.icon size={20} aria-hidden="true" />
            <span>{c.label}</span>
            <strong>{c.value ?? "—"}</strong>
          </button>
        ))}
        <Link className="stat stat-button" to="invitations">
          <Clock size={20} aria-hidden="true" />
          <span>دعوات معلّقة</span>
          <strong>{s?.pending_invitations ?? "—"}</strong>
        </Link>
      </div>
      <section className="panel">
        <form
          className="users-filters"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set("search", search.trim());
          }}
        >
          <label className="search-field">
            <span className="sr-only">بحث بالاسم أو البريد</span>
            <Search size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو البريد" maxLength={120} />
          </label>
          <label>
            الحالة
            <select value={params.get("state") ?? ""} onChange={(e) => set("state", e.target.value)}>
              <option value="">الكل</option>
              {Object.entries(stateLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            صلاحية المنصة
            <select value={params.get("platform_role") ?? ""} onChange={(e) => set("platform_role", e.target.value)}>
              <option value="">الكل</option>
              <option value="owner">مالك المنصة</option>
              <option value="admin">مسؤول المنصة</option>
              <option value="none">بلا صلاحية منصة</option>
            </select>
          </label>
          <label>
            المشروع
            <select value={params.get("project_id") ?? ""} onChange={(e) => set("project_id", e.target.value)}>
              <option value="">كل المشاريع</option>
              {projects.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">بحث</button>
        </form>
        {list.isPending ? (
          <Busy />
        ) : list.data?.data.length ? (
          <>
            <div className="table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>{sortButton("name", "المستخدم")}</th>
                    <th>الحالة</th>
                    <th>صلاحية المنصة</th>
                    <th>المشاريع</th>
                    <th>{sortButton("last_login_at", "آخر دخول")}</th>
                    <th>{sortButton("created_at", "تاريخ الإنشاء")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <Link className="user-cell" to={String(u.id)}>
                          <span className="avatar" aria-hidden="true">
                            {u.name.slice(0, 1)}
                          </span>
                          <span>
                            {u.name}
                            <small dir="ltr">{u.email}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <StateBadge state={u.state} />
                      </td>
                      <td>{u.platform_role ? platformRoleLabels[u.platform_role] : <span className="muted">—</span>}</td>
                      <td>{u.projects_count}</td>
                      <td>{formatDateTime(u.last_login_at)}</td>
                      <td>{formatDateTime(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                صفحة {page} من {list.data.last_page} · {list.data.total} مستخدم
              </span>
              <button disabled={page <= 1} onClick={() => set("page", String(page - 1))}>
                السابق
              </button>
              <button disabled={page >= list.data.last_page} onClick={() => set("page", String(page + 1))}>
                التالي
              </button>
            </div>
          </>
        ) : (
          <div className="empty">
            <Users size={32} />
            <h3>{query ? "لا يوجد مستخدمون مطابقون" : "لا يوجد مستخدمون بعد"}</h3>
            <p>أضف مستخدمًا بدعوة آمنة أو بكلمة مرور مؤقتة.</p>
          </div>
        )}
      </section>
    </>
  );
}

function CreateUserWizard({ me }: { me: User }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const projects = useProjects();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectRole, setProjectRole] = useState("tester");
  const [platformRole, setPlatformRole] = useState("");
  const [method, setMethod] = useState<"invitation" | "temporary_password">("invitation");
  const [passwordMode, setPasswordMode] = useState<"generate" | "manual">("generate");
  const [manual, setManual] = useState("");
  const [secret, setSecret] = useState<{ kind: "password" | "link"; value: string } | null>(null);
  const [result, setResult] = useState<{ title: string; userId?: number } | null>(null);
  const lookup = useMutation({
    mutationFn: () => api<{ data: { user: AdminUser | null; pending_invitations: InvitationView[] } }>(`/api/admin/users/lookup?email=${encodeURIComponent(email)}`),
    onSuccess: (data) => {
      if (!data.data.user) setStep(2);
    },
  });
  const addExisting = useMutation({
    mutationFn: (id: number) => api(`/api/admin/users/${id}/memberships`, "PUT", { project_id: Number(projectId), role: projectRole }),
    onSuccess: (_d, id) => {
      cache.invalidateQueries({ queryKey: ["admin"] });
      navigate(`/admin/users/${id}`);
    },
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ data: { method: string; user?: AdminUser; temporary_password?: string | null } & Partial<Delivery> }>("/api/admin/users", "POST", {
        name: name || null,
        email,
        method,
        platform_role: method === "temporary_password" && platformRole ? platformRole : null,
        project_id: projectId ? Number(projectId) : null,
        project_role: projectId ? projectRole : null,
        password_mode: method === "temporary_password" ? passwordMode : null,
        temporary_password: method === "temporary_password" && passwordMode === "manual" ? manual : null,
      }),
    onSuccess: (data) => {
      cache.invalidateQueries({ queryKey: ["admin"] });
      setManual("");
      if (data.data.method === "invitation") {
        setResult({ title: data.data.delivery === "email" ? "أُرسلت الدعوة بالبريد الإلكتروني." : "أُنشئت الدعوة." });
        if (data.data.token) setSecret({ kind: "link", value: inviteUrl(data.data.token) });
      } else {
        setResult({ title: "أُنشئ الحساب. سيُطلب من صاحبه تغيير كلمة المرور عند أول دخول.", userId: data.data.user?.id });
        if (data.data.temporary_password) setSecret({ kind: "password", value: data.data.temporary_password });
      }
    },
  });
  const existing = lookup.data?.data.user;
  const exists409 = create.error instanceof ApiError && create.error.code === "account_exists";
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>إضافة مستخدم</h1>
          <p className="muted">تحقق من البريد، ثم اختر المشروع والدور وطريقة إنشاء الحساب.</p>
        </div>
      </div>
      <AdminNav />
      <ol className="wizard-progress" aria-label="خطوات الإضافة">
        {["البريد الإلكتروني", "البيانات والصلاحيات", "طريقة الإنشاء"].map((label, index) => (
          <li key={label} className={step === index + 1 ? "current" : step > index + 1 ? "done" : ""} aria-current={step === index + 1 ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>
      <section className="panel padded wizard-panel">
        {result ? (
          <div className="wizard-result">
            <p role="status" className="saved">
              <CheckCircle2 size={18} /> {result.title}
            </p>
            {secret && <OneTimeSecret kind={secret.kind} value={secret.value} onDone={() => setSecret(null)} />}
            {!secret && (
              <div className="inline-actions">
                {result.userId && (
                  <Link className="button" to={`/admin/users/${result.userId}`}>
                    فتح صفحة المستخدم
                  </Link>
                )}
                <Link className="button" to="/admin/users">
                  العودة إلى المستخدمين
                </Link>
              </div>
            )}
          </div>
        ) : step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookup.mutate();
            }}
          >
            <label>
              البريد الإلكتروني
              <input type="email" dir="ltr" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <Notice error={lookup.error} />
            {existing ? (
              <div className="existing-account">
                <p>
                  يوجد حساب بهذا البريد: <strong>{existing.name}</strong> <StateBadge state={existing.state} />. لن يُنشأ حساب مكرر.
                </p>
                {existing.status === "active" ? (
                  <div className="field-grid">
                    <label>
                      إضافته إلى مشروع
                      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="">اختر مشروعًا</option>
                        {projects.data?.data.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      الدور في المشروع
                      <select value={projectRole} onChange={(e) => setProjectRole(e.target.value)}>
                        {["tester", "manager", "viewer"].map((r) => (
                          <option key={r} value={r}>
                            {projectRoleLabels[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="hint">الحساب غير نشط. أعد تفعيله من صفحته قبل إضافته إلى مشروع.</p>
                )}
                <Notice error={addExisting.error} />
                <div className="inline-actions">
                  {existing.status === "active" && (
                    <button type="button" className="primary" disabled={!projectId || addExisting.isPending} onClick={() => addExisting.mutate(existing.id)}>
                      إضافة إلى المشروع
                    </button>
                  )}
                  <Link className="button" to={`/admin/users/${existing.id}`}>
                    فتح صفحة المستخدم
                  </Link>
                </div>
              </div>
            ) : (
              <button className="primary" disabled={lookup.isPending}>
                متابعة
              </button>
            )}
            {!!lookup.data?.data.pending_invitations.length && (
              <p className="hint">
                توجد {lookup.data.data.pending_invitations.length} دعوة معلّقة لهذا البريد. <Link to="/admin/users/invitations">إدارة الدعوات</Link>
              </p>
            )}
          </form>
        ) : step === 2 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(3);
            }}
          >
            <p className="muted">
              البريد: <span dir="ltr">{email}</span>
            </p>
            <label>
              الاسم الكامل
              <input required={method === "temporary_password"} minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="يُدخله المدعو بنفسه عند قبول الدعوة" />
            </label>
            <div className="field-grid">
              <label>
                المشروع
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">بدون مشروع الآن</option>
                  {projects.data?.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الدور داخل المشروع
                <select value={projectRole} disabled={!projectId} onChange={(e) => setProjectRole(e.target.value)}>
                  {["tester", "manager", "viewer"].map((r) => (
                    <option key={r} value={r}>
                      {projectRoleLabels[r]}
                    </option>
                  ))}
                </select>
              </label>
              {me.platform_role === "owner" && (
                <label>
                  صلاحية المنصة
                  <select value={platformRole} onChange={(e) => setPlatformRole(e.target.value)}>
                    <option value="">بدون</option>
                    <option value="admin">مسؤول المنصة</option>
                    <option value="owner">مالك المنصة</option>
                  </select>
                </label>
              )}
            </div>
            <p className="hint">الدعوة تتطلب مشروعًا. صلاحيات المنصة تُمنح فقط للحسابات المنشأة بكلمة مرور مؤقتة أو من صفحة المستخدم لاحقًا.</p>
            <div className="inline-actions">
              <button type="button" onClick={() => setStep(1)}>
                رجوع
              </button>
              <button className="primary">متابعة</button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <fieldset className="method-options">
              <legend>طريقة إنشاء الحساب</legend>
              <label className={`method-card${method === "invitation" ? " selected" : ""}`}>
                <input type="radio" name="method" checked={method === "invitation"} disabled={!projectId || !!platformRole} onChange={() => setMethod("invitation")} />
                <MailPlus size={20} aria-hidden="true" />
                <span>
                  <strong>إرسال دعوة آمنة</strong>
                  <small>يختار المدعو اسمه وكلمة مروره عبر رابط لمرة واحدة. {!projectId ? "اختر مشروعًا أولًا." : ""}</small>
                </span>
              </label>
              <label className={`method-card${method === "temporary_password" ? " selected" : ""}`}>
                <input type="radio" name="method" checked={method === "temporary_password"} onChange={() => setMethod("temporary_password")} />
                <KeyRound size={20} aria-hidden="true" />
                <span>
                  <strong>كلمة مرور مؤقتة</strong>
                  <small>يُنشأ الحساب الآن، ويُجبر صاحبه على تغيير كلمة المرور عند أول دخول.</small>
                </span>
              </label>
            </fieldset>
            {method === "temporary_password" && (
              <fieldset className="method-options compact">
                <legend>كلمة المرور المؤقتة</legend>
                <label className="check-label">
                  <input type="radio" name="pmode" checked={passwordMode === "generate"} onChange={() => setPasswordMode("generate")} /> توليد كلمة مرور قوية عشوائيًا
                </label>
                <label className="check-label">
                  <input type="radio" name="pmode" checked={passwordMode === "manual"} onChange={() => setPasswordMode("manual")} /> إدخالها يدويًا
                </label>
                {passwordMode === "manual" && (
                  <label>
                    كلمة المرور المؤقتة
                    <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={manual} onChange={(e) => setManual(e.target.value)} />
                  </label>
                )}
                <p className="hint">12 حرفًا على الأقل بحروف كبيرة وصغيرة ورقم. لا تُحفظ نصيًا ولا تظهر في السجلات.</p>
              </fieldset>
            )}
            <Notice error={exists409 ? null : create.error} />
            {exists409 && <p className="error">يوجد حساب بهذا البريد بالفعل. ارجع للخطوة الأولى لإضافته إلى مشروع.</p>}
            <div className="inline-actions">
              <button type="button" onClick={() => setStep(2)}>
                رجوع
              </button>
              <button className="primary" disabled={create.isPending || (method === "invitation" && !projectId) || (method === "temporary_password" && !name.trim())}>
                {method === "invitation" ? "إنشاء الدعوة" : "إنشاء الحساب"}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

function UserDetailPage({ me }: { me: User }) {
  const { userId } = useParams();
  const cache = useQueryClient();
  const projects = useProjects();
  const key = ["admin", "user", userId];
  const query = useQuery({ queryKey: key, queryFn: () => api<{ data: UserDetail }>(`/api/admin/users/${userId}`) });
  const [reason, setReason] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [memberProject, setMemberProject] = useState("");
  const [memberRole, setMemberRole] = useState("tester");
  const refresh = () => {
    cache.invalidateQueries({ queryKey: key });
    cache.invalidateQueries({ queryKey: ["admin", "users"] });
  };
  const status = useMutation({ mutationFn: (s: string) => api(`/api/admin/users/${userId}/status`, "POST", { status: s, reason: s === "active" ? null : reason }), onSuccess: () => { setReason(""); refresh(); } });
  const role = useMutation({ mutationFn: (r: string) => api(`/api/admin/users/${userId}/platform-role`, "PUT", { platform_role: r || null }), onSuccess: refresh });
  const temporary = useMutation({
    mutationFn: () => api<{ data: { temporary_password: string | null } }>(`/api/admin/users/${userId}/temporary-password`, "POST", { password_mode: "generate" }),
    onSuccess: (data) => {
      setSecret(data.data.temporary_password);
      refresh();
    },
  });
  const membership = useMutation({ mutationFn: (v: { project_id: number; role: string }) => api(`/api/admin/users/${userId}/memberships`, "PUT", v), onSuccess: () => { setMemberProject(""); refresh(); } });
  const removeMembership = useMutation({ mutationFn: (projectId: number) => api(`/api/admin/users/${userId}/memberships/${projectId}`, "DELETE"), onSuccess: refresh });
  if (query.isPending) return <Busy />;
  if (!query.data) return <Notice error={query.error} />;
  const u = query.data.data;
  const self = u.id === me.id;
  const canManage = !u.platform_role || me.platform_role === "owner";
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="muted">
            <Link to="/admin/users">إدارة المستخدمين</Link>
          </p>
          <h1>{u.name}</h1>
          <p className="muted" dir="ltr">
            {u.email}
          </p>
          <div className="issue-badges">
            <StateBadge state={u.state} />
            {u.platform_role && <span className="pill">{platformRoleLabels[u.platform_role]}</span>}
          </div>
        </div>
      </div>
      <Notice error={status.error || role.error || temporary.error || membership.error || removeMembership.error} />
      {secret && <OneTimeSecret kind="password" value={secret} onDone={() => setSecret(null)} />}
      <div className="issue-layout">
        <div className="issue-main">
          <section className="panel padded">
            <h2>المشاريع والصلاحيات</h2>
            {u.projects.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>المشروع</th>
                      <th>الدور</th>
                      <th>منذ</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.projects.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          {p.role === "owner" || !canManage ? (
                            projectRoleLabels[p.role]
                          ) : (
                            <select aria-label={`الدور في ${p.name}`} value={p.role} onChange={(e) => membership.mutate({ project_id: p.id, role: e.target.value })}>
                              {["manager", "tester", "viewer"].map((r) => (
                                <option key={r} value={r}>
                                  {projectRoleLabels[r]}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>{formatDateTime(p.joined_at)}</td>
                        <td>
                          {p.role !== "owner" && canManage && (
                            <button type="button" onClick={() => removeMembership.mutate(p.id)} disabled={removeMembership.isPending}>
                              إزالة
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">ليس عضوًا في أي مشروع.</p>
            )}
            {canManage && u.status === "active" && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  membership.mutate({ project_id: Number(memberProject), role: memberRole });
                }}
              >
                <label>
                  إضافة إلى مشروع
                  <select required value={memberProject} onChange={(e) => setMemberProject(e.target.value)}>
                    <option value="">اختر مشروعًا</option>
                    {projects.data?.data
                      .filter((p) => !u.projects.some((m) => m.id === p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  الدور
                  <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                    {["tester", "manager", "viewer"].map((r) => (
                      <option key={r} value={r}>
                        {projectRoleLabels[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={!memberProject || membership.isPending}>إضافة</button>
              </form>
            )}
          </section>
          <section className="panel padded">
            <h2>سجل إدارة الحساب</h2>
            {u.activity.length ? (
              <ol className="activity issue-timeline">
                {u.activity.map((a) => (
                  <li key={a.id}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div>
                      <strong>{activityLabels[a.action] ?? a.action}</strong>
                      {a.project && <> — {a.project}</>}
                      {typeof a.metadata.to === "string" && <p>إلى: {stateLabelsAny(a.metadata.to)}</p>}
                      {typeof a.metadata.reason === "string" && <p className="muted">«{a.metadata.reason}»</p>}
                      <small>
                        {a.actor ?? "النظام"} · {formatDateTime(a.created_at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">لا توجد أحداث بعد.</p>
            )}
          </section>
        </div>
        <aside className="issue-side">
          <section className="panel padded">
            <h2>الحساب</h2>
            <dl className="issue-facts">
              <div>
                <dt>آخر دخول</dt>
                <dd>{formatDateTime(u.last_login_at)}</dd>
              </div>
              <div>
                <dt>تاريخ الإنشاء</dt>
                <dd>{formatDateTime(u.created_at)}</dd>
              </div>
              <div>
                <dt>آخر تغيير لكلمة المرور</dt>
                <dd>{formatDateTime(u.password_changed_at)}</dd>
              </div>
              {u.created_by && (
                <div>
                  <dt>أنشأه</dt>
                  <dd>{u.created_by.name}</dd>
                </div>
              )}
              {u.status_reason && (
                <div>
                  <dt>سبب الإيقاف</dt>
                  <dd>{u.status_reason}</dd>
                </div>
              )}
            </dl>
          </section>
          {!self && canManage && (
            <section className="panel padded account-actions" aria-labelledby="account-actions-title">
              <h2 id="account-actions-title">إجراءات الحساب</h2>
              {u.status === "active" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    status.mutate((e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "suspended");
                  }}
                >
                  <label>
                    سبب الإيقاف (يراه المسؤولون فقط)
                    <textarea aria-label="سبب الإيقاف" required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </label>
                  <div className="inline-actions">
                    <button value="suspended" disabled={status.isPending || reason.trim().length < 3}>
                      <Ban size={16} /> تعليق الحساب
                    </button>
                    <button value="disabled" className="danger" disabled={status.isPending || reason.trim().length < 3}>
                      <XCircle size={16} /> تعطيل الحساب
                    </button>
                  </div>
                  <p className="hint">يُنهى الوصول فورًا وتُلغى الجلسات. لا تُحذف بيانات الاختبارات.</p>
                </form>
              ) : (
                <button type="button" className="primary" disabled={status.isPending} onClick={() => status.mutate("active")}>
                  <RotateCcw size={16} /> إعادة تفعيل الحساب
                </button>
              )}
              <hr />
              <button type="button" disabled={temporary.isPending} onClick={() => temporary.mutate()}>
                <KeyRound size={16} /> إصدار كلمة مرور مؤقتة جديدة
              </button>
              <p className="hint">تُلغى الجلسات الحالية ويُجبر على تغييرها عند الدخول.</p>
              {me.platform_role === "owner" && (
                <>
                  <hr />
                  <label>
                    صلاحية المنصة
                    <select value={u.platform_role ?? ""} disabled={role.isPending} onChange={(e) => role.mutate(e.target.value)}>
                      <option value="">بدون</option>
                      <option value="admin">مسؤول المنصة</option>
                      <option value="owner">مالك المنصة</option>
                    </select>
                  </label>
                </>
              )}
            </section>
          )}
          {self && (
            <section className="panel padded">
              <p className="hint">
                <ShieldCheck size={16} /> هذا حسابك. غيّر كلمة مرورك من <Link to="/settings">الإعدادات</Link>.
              </p>
            </section>
          )}
          {!!u.invitations.length && (
            <section className="panel padded">
              <h2>دعوات هذا البريد</h2>
              <ul className="plain-list">
                {u.invitations.map((i) => (
                  <li key={i.id}>
                    {invitationLabels[i.state]} · {projectRoleLabels[i.project_role ?? ""] ?? "—"} · {formatDateTime(i.created_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function stateLabelsAny(value: string): string {
  return (stateLabels as Record<string, string>)[value] ?? platformRoleLabels[value] ?? value;
}

export function InvitationRows({ rows, showProject, onChanged }: { rows: InvitationView[]; showProject?: boolean; onChanged: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const resend = useMutation({
    mutationFn: (id: number) => api<{ data: Delivery }>(`/api/invitations/${id}/resend`, "POST"),
    onSuccess: (data) => {
      if (data.data.token) setSecret(inviteUrl(data.data.token));
      onChanged();
    },
  });
  const revoke = useMutation({ mutationFn: (id: number) => api(`/api/invitations/${id}/revoke`, "POST"), onSuccess: onChanged });
  return (
    <>
      <Notice error={resend.error || revoke.error} />
      {secret && <OneTimeSecret kind="link" value={secret} onDone={() => setSecret(null)} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>البريد</th>
              {showProject && <th>المشروع</th>}
              <th>الدور</th>
              <th>الحالة</th>
              <th>صالحة حتى</th>
              <th>أرسلها</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td dir="ltr">{i.email}</td>
                {showProject && <td>{i.project ?? "—"}</td>}
                <td>{projectRoleLabels[i.project_role ?? ""] ?? "—"}</td>
                <td>
                  <span className={`invite-state invite-${i.state}`}>{invitationLabels[i.state]}</span>
                </td>
                <td>{formatDateTime(i.expires_at)}</td>
                <td>
                  {i.invited_by?.name ?? "—"} <small className="muted">×{i.send_count}</small>
                </td>
                <td className="row-actions">
                  {(i.state === "pending" || i.state === "expired") && (
                    <button type="button" disabled={resend.isPending} onClick={() => resend.mutate(i.id)} aria-label={`إعادة إرسال دعوة ${i.email}`}>
                      إعادة إرسال
                    </button>
                  )}
                  {(i.state === "pending" || i.state === "expired") && (
                    <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)} aria-label={`إلغاء دعوة ${i.email}`}>
                      إلغاء
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InvitationsAdmin() {
  const cache = useQueryClient();
  const [state, setState] = useState("pending");
  const list = useQuery({ queryKey: ["admin", "invitations", state], queryFn: () => api<{ data: InvitationView[] }>(`/api/admin/invitations?state=${state}`) });
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>الدعوات</h1>
          <p className="muted">إعادة الإرسال تولّد رابطًا جديدًا وتبطل القديم. الإلغاء يمنع استخدام الرابط فورًا.</p>
        </div>
        <Link className="primary button" to="/admin/users/new">
          <MailPlus size={17} /> دعوة مستخدم
        </Link>
      </div>
      <AdminNav />
      <section className="panel padded">
        <label className="inline-filter">
          الحالة
          <select value={state} onChange={(e) => setState(e.target.value)}>
            {Object.entries(invitationLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Notice error={list.error} />
        {list.isPending ? <Busy /> : list.data?.data.length ? <InvitationRows rows={list.data.data} showProject onChanged={() => cache.invalidateQueries({ queryKey: ["admin"] })} /> : <p className="empty">لا توجد دعوات بهذه الحالة.</p>}
      </section>
    </>
  );
}
