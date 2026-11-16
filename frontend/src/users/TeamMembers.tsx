import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MailPlus, UserCheck, UserPlus } from "lucide-react";
import { api } from "../api";
import type { Project, User } from "../api";
import { Notice } from "../testing/shared";
import { OneTimeSecret } from "./OneTimeSecret";
import { InvitationRows, StateBadge } from "./UsersAdmin";
import type { Delivery, InvitationView } from "./types";
import { inviteUrl, invitationLabels, projectRoleLabels } from "./types";

type Resolution =
  | { state: "member"; user: { id: number; name: string }; role: string }
  | { state: "pending_invitation"; invitation: InvitationView }
  | { state: "unknown"; can_create_account: false }
  | { state: "not_found"; can_create_account: true }
  | { state: "existing_active" | "existing_inactive"; user: { id: number; name: string; status: "active" | "suspended" | "disabled"; status_reason: string | null } };

export function TeamMembers({ project: p }: { project: Project }) {
  const cache = useQueryClient();
  const me = cache.getQueryData<{ data: User }>(["user"])?.data;
  const isPlatformAdmin = me?.platform_role === "owner" || me?.platform_role === "admin";
  const canManage = p.role === "owner" || isPlatformAdmin;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("tester");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [secret, setSecret] = useState<{ kind: "password" | "link"; value: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const invitations = useQuery({ queryKey: ["project", String(p.id), "invitations"], queryFn: () => api<{ data: InvitationView[] }>(`/api/projects/${p.id}/invitations`), enabled: canManage });
  const refresh = () => {
    cache.invalidateQueries({ queryKey: ["project", String(p.id)] });
    cache.invalidateQueries({ queryKey: ["activity", p.id] });
  };
  const reset = (message: string) => {
    setDone(message);
    setResolution(null);
    setEmail("");
    refresh();
  };
  const resolve = useMutation({
    mutationFn: () => api<{ data: Resolution }>(`/api/projects/${p.id}/members/resolve`, "POST", { email }),
    onSuccess: (data) => {
      setDone(null);
      setResolution(data.data);
    },
  });
  const setMemberRole = useMutation({
    mutationFn: (v: { email: string; role: string }) => api(`/api/projects/${p.id}/members`, "PUT", v),
    onSuccess: () => reset("حُفظت العضوية."),
  });
  const invite = useMutation({
    mutationFn: () => api<{ data: Delivery }>(`/api/projects/${p.id}/invitations`, "POST", { email, role }),
    onSuccess: (data) => {
      if (data.data.token) setSecret({ kind: "link", value: inviteUrl(data.data.token) });
      reset(data.data.delivery === "email" ? "أُرسلت الدعوة بالبريد الإلكتروني." : "أُنشئت الدعوة.");
    },
  });
  const [name, setName] = useState("");
  const createAccount = useMutation({
    mutationFn: () => api<{ data: { temporary_password: string | null } }>("/api/admin/users", "POST", { name, email, method: "temporary_password", password_mode: "generate", project_id: p.id, project_role: role }),
    onSuccess: (data) => {
      if (data.data.temporary_password) setSecret({ kind: "password", value: data.data.temporary_password });
      setName("");
      reset("أُنشئ الحساب وأُضيف إلى المشروع. سيُطلب تغيير كلمة المرور عند أول دخول.");
    },
  });
  const roleOptions = ["tester", "manager", "viewer"];
  return (
    <section className="panel padded team-panel">
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
                <td>
                  {canManage && m.role !== "owner" ? (
                    <select aria-label={`صلاحية ${m.name}`} value={m.role} disabled={setMemberRole.isPending} onChange={(e) => setMemberRole.mutate({ email: m.email, role: e.target.value })}>
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {projectRoleLabels[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    projectRoleLabels[m.role]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div className="member-flow">
          <h3>
            <UserPlus size={18} aria-hidden="true" /> إضافة عضو
          </h3>
          <form
            className="member-form"
            onSubmit={(e) => {
              e.preventDefault();
              resolve.mutate();
            }}
          >
            <label>
              البريد الإلكتروني
              <input type="email" dir="ltr" required maxLength={255} value={email} onChange={(e) => { setEmail(e.target.value); setResolution(null); }} />
            </label>
            <label>
              الصلاحية
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {projectRoleLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={resolve.isPending}>
              متابعة
            </button>
          </form>
          <Notice error={resolve.error || setMemberRole.error || invite.error || createAccount.error} />
          {done && (
            <p role="status" className="saved">
              {done}
            </p>
          )}
          {secret && <OneTimeSecret kind={secret.kind} value={secret.value} onDone={() => setSecret(null)} />}
          {resolution && (
            <div className="resolution" aria-live="polite">
              {resolution.state === "member" && (
                <>
                  <p>
                    <UserCheck size={18} aria-hidden="true" /> {resolution.user.name} عضو في المشروع بدور «{projectRoleLabels[resolution.role]}».
                  </p>
                  {resolution.role !== "owner" && resolution.role !== role && (
                    <button type="button" onClick={() => setMemberRole.mutate({ email, role })}>
                      تغيير دوره إلى «{projectRoleLabels[role]}»
                    </button>
                  )}
                </>
              )}
              {resolution.state === "pending_invitation" && (
                <>
                  <p>توجد دعوة {invitationLabels[resolution.invitation.state]} لهذا البريد في المشروع. أعد إرسالها لتوليد رابط جديد أو ألغِها.</p>
                  <InvitationRows rows={[resolution.invitation]} onChanged={() => { setResolution(null); invitations.refetch(); }} />
                </>
              )}
              {(resolution.state === "unknown" || resolution.state === "not_found") && (
                <>
                  <p>
                    {resolution.state === "not_found" ? "لا يوجد حساب بهذا البريد." : "سنرسل دعوة إلى هذا البريد. إذا كان لصاحبه حساب فسيقبلها بعد تسجيل الدخول، وإلا فسينشئ حسابه بنفسه."}
                  </p>
                  <div className="inline-actions">
                    <button type="button" className="primary" disabled={invite.isPending} onClick={() => invite.mutate()}>
                      <MailPlus size={16} /> إرسال دعوة
                    </button>
                  </div>
                  {resolution.state === "not_found" && (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        createAccount.mutate();
                      }}
                    >
                      <label>
                        أو أنشئ حسابًا بكلمة مرور مؤقتة — الاسم الكامل
                        <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                      </label>
                      <button disabled={createAccount.isPending}>
                        <KeyRound size={16} /> إنشاء الحساب
                      </button>
                    </form>
                  )}
                </>
              )}
              {resolution.state === "existing_active" && (
                <>
                  <p>
                    يوجد حساب نشط باسم <strong>{resolution.user.name}</strong>.
                  </p>
                  <button type="button" className="primary" onClick={() => setMemberRole.mutate({ email, role })}>
                    إضافته مباشرة بدور «{projectRoleLabels[role]}»
                  </button>
                </>
              )}
              {resolution.state === "existing_inactive" && (
                <>
                  <p>
                    الحساب <strong>{resolution.user.name}</strong> <StateBadge state={resolution.user.status === "disabled" ? "disabled" : "suspended"} />
                    {resolution.user.status_reason && <> — {resolution.user.status_reason}</>}
                  </p>
                  <Link className="button" to={`/admin/users/${resolution.user.id}`}>
                    إدارة الحساب
                  </Link>
                </>
              )}
            </div>
          )}
          {!!invitations.data?.data.length && (
            <>
              <h3>دعوات المشروع</h3>
              <InvitationRows rows={invitations.data.data} onChanged={() => invitations.refetch()} />
            </>
          )}
          <Notice error={invitations.error} />
        </div>
      )}
    </section>
  );
}
