import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, MailWarning, ShieldAlert, ShieldCheck, UserPlus } from "lucide-react";
import { api, ApiError } from "../api";
import type { User } from "../api";
import { Notice } from "../testing/shared";
import { projectRoleLabels } from "./types";

const POLICY = "12 حرفًا على الأقل، تتضمن حروفًا كبيرة وصغيرة ورقمًا.";

export function AuthLayout({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <ShieldCheck size={30} /> TestPilot
        </div>
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
        {children}
      </section>
    </main>
  );
}

/** New password + confirmation fields with the policy hint and a basic client check (server is authoritative). */
function NewPasswordFields({ password, confirm, setPassword, setConfirm }: { password: string; confirm: string; setPassword: (v: string) => void; setConfirm: (v: string) => void }) {
  return (
    <>
      <label>
        كلمة المرور الجديدة
        <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-policy" />
      </label>
      <p className="hint" id="password-policy">
        {POLICY}
      </p>
      <label>
        تأكيد كلمة المرور الجديدة
        <input type="password" dir="ltr" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {confirm && password !== confirm && <p className="field-error">كلمتا المرور غير متطابقتين.</p>}
    </>
  );
}

export function ChangePasswordForm({ onChanged, submitLabel = "تغيير كلمة المرور" }: { onChanged: (user: User) => void; submitLabel?: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: () => api<{ data: User }>("/api/account/password", "POST", { current_password: current, password, password_confirmation: confirm }),
    onSuccess: (data) => {
      setCurrent("");
      setPassword("");
      setConfirm("");
      onChanged(data.data);
    },
  });
  return (
    <form
      className="password-form"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
    >
      <label>
        كلمة المرور الحالية
        <input type="password" dir="ltr" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <NewPasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
      <Notice error={change.error} />
      <button className="primary" disabled={change.isPending || !current || password.length < 12 || password !== confirm}>
        <KeyRound size={17} /> {change.isPending ? "جارٍ الحفظ…" : submitLabel}
      </button>
      {change.isSuccess && (
        <p role="status" className="saved">
          تم تغيير كلمة المرور، وأُنهيت جلساتك الأخرى.
        </p>
      )}
    </form>
  );
}

/** Shown instead of the whole app while the account still has a temporary password. */
export function ForcedPasswordChange({ user, onLogout }: { user: User; onLogout: () => void }) {
  const cache = useQueryClient();
  return (
    <AuthLayout title="غيّر كلمة المرور المؤقتة" text={`مرحبًا ${user.name}. أُنشئ حسابك بكلمة مرور مؤقتة، ويجب استبدالها قبل الوصول إلى المشاريع.`}>
      <ChangePasswordForm submitLabel="حفظ كلمة المرور والمتابعة" onChanged={(next) => cache.setQueryData(["user"], { data: next })} />
      <button type="button" className="text-link-button" onClick={onLogout}>
        <LogOut size={16} /> تسجيل الخروج
      </button>
    </AuthLayout>
  );
}

export function InactiveAccount() {
  return (
    <AuthLayout title="الحساب موقوف" text="لا يمكن استخدام هذا الحساب حاليًا.">
      <div className="auth-notice">
        <ShieldAlert size={22} aria-hidden="true" />
        <p>أوقف مسؤول مساحة العمل هذا الحساب أو عطّله، وأُنهيت جلساته. تواصل مع المسؤول لمعرفة السبب أو لإعادة التفعيل.</p>
      </div>
      <Link className="button" to="/login">
        العودة إلى تسجيل الدخول
      </Link>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const options = useQuery({ queryKey: ["auth-options"], queryFn: () => api<{ data: { mail_enabled: boolean } }>("/api/auth/options") });
  const send = useMutation({
    mutationFn: async () => {
      await api("/sanctum/csrf-cookie");
      return api<{ data: { mail_enabled: boolean; message: string } }>("/api/password/forgot", "POST", { email });
    },
  });
  const mailDisabled = options.data?.data.mail_enabled === false;
  return (
    <AuthLayout title="نسيت كلمة المرور" text="أدخل بريدك لاستعادة الوصول إلى حسابك.">
      {mailDisabled && (
        <div className="auth-notice">
          <MailWarning size={22} aria-hidden="true" />
          <p>البريد الإلكتروني غير مُعدّ في مساحة العمل هذه، فلا تُرسل روابط الاستعادة. اطلب من مسؤول المنصة إصدار كلمة مرور مؤقتة لك.</p>
        </div>
      )}
      {send.isSuccess ? (
        <p role="status" className="auth-result">
          {send.data.data.message}
        </p>
      ) : (
        !mailDisabled && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <label>
              البريد الإلكتروني
              <input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <Notice error={send.error || options.error} />
            <button className="primary" disabled={send.isPending || options.isPending}>
              إرسال رابط الاستعادة
            </button>
          </form>
        )
      )}
      <Link className="text-link" to="/login">
        العودة إلى تسجيل الدخول
      </Link>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const reset = useMutation({
    mutationFn: async () => {
      await api("/sanctum/csrf-cookie");
      return api<{ data: { message: string } }>("/api/password/reset", "POST", { token, email, password, password_confirmation: confirm });
    },
  });
  return (
    <AuthLayout title="تعيين كلمة مرور جديدة" text={email ? `للحساب ${email}` : undefined}>
      {!token || !email ? (
        <p className="error">رابط الاستعادة غير مكتمل. اطلب رابطًا جديدًا.</p>
      ) : reset.isSuccess ? (
        <>
          <p role="status" className="auth-result">
            {reset.data.data.message}
          </p>
          <Link className="primary button" to="/login">
            تسجيل الدخول
          </Link>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <NewPasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
          <Notice error={reset.error} />
          <button className="primary" disabled={reset.isPending || password.length < 12 || password !== confirm}>
            حفظ كلمة المرور
          </button>
        </form>
      )}
      <Link className="text-link" to="/forgot-password">
        طلب رابط جديد
      </Link>
    </AuthLayout>
  );
}

type Preview = {
  state: "pending" | "accepted" | "revoked" | "expired";
  email: string;
  expires_at: string;
  project: { name: string } | null;
  project_role: string | null;
  inviter: string | null;
  account_exists: boolean | null;
  signed_in: { email: string; is_invitee: boolean } | null;
};

export function AcceptInvitation() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const preview = useQuery({ queryKey: ["invite", token], queryFn: () => api<{ data: Preview }>(`/api/invite/${token}`), retry: false });
  const accept = useMutation({
    mutationFn: async () => {
      await api("/sanctum/csrf-cookie");
      const body = preview.data?.data.signed_in?.is_invitee ? {} : { name, password, password_confirmation: confirm };
      return api<{ data: { user: User; project_id: number | null } }>(`/api/invite/${token}/accept`, "POST", body);
    },
    onSuccess: (data) => {
      cache.clear();
      cache.setQueryData(["user"], { data: data.data.user });
      navigate(data.data.project_id ? `/projects/${data.data.project_id}` : "/");
    },
  });
  if (preview.isPending) return <AuthLayout title="جارٍ التحقق من الدعوة…">{null}</AuthLayout>;
  if (preview.error || !preview.data)
    return (
      <AuthLayout title="رابط الدعوة غير صالح" text="تأكد من نسخ الرابط كاملًا، أو اطلب دعوة جديدة من المسؤول.">
        <Link className="button" to="/login">
          تسجيل الدخول
        </Link>
      </AuthLayout>
    );
  const p = preview.data.data;
  const where = p.project ? `مشروع «${p.project.name}» بدور ${projectRoleLabels[p.project_role ?? ""] ?? p.project_role}` : "مساحة عمل TestPilot";
  if (p.state !== "pending")
    return (
      <AuthLayout title={{ accepted: "استُخدمت هذه الدعوة", revoked: "أُلغيت هذه الدعوة", expired: "انتهت صلاحية هذه الدعوة" }[p.state]} text="اطلب من المسؤول دعوة جديدة إذا كنت ما زلت بحاجة إلى الوصول.">
        <Link className="button" to="/login">
          تسجيل الدخول
        </Link>
      </AuthLayout>
    );
  const asInvitee = !!p.signed_in?.is_invitee;
  const signedInElsewhere = !!p.signed_in && !asInvitee;
  const conflict = accept.error instanceof ApiError && accept.error.status === 409;
  return (
    <AuthLayout title="قبول الدعوة" text={`${p.inviter ?? "مسؤول"} يدعوك للانضمام إلى ${where}.`}>
      <dl className="invite-facts">
        <dt>البريد المدعو</dt>
        <dd dir="ltr">{p.email}</dd>
        <dt>صالحة حتى</dt>
        <dd>{new Date(p.expires_at).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}</dd>
      </dl>
      {signedInElsewhere ? (
        <p className="error">
          أنت مسجّل حاليًا بحساب <span dir="ltr">{p.signed_in!.email}</span>. سجّل الخروج ثم افتح الرابط مرة أخرى.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept.mutate();
          }}
        >
          {!asInvitee && (
            <>
              <p className="hint">أنشئ حسابك لهذا البريد. إذا كان لديك حساب به بالفعل فسجّل الدخول أولًا.</p>
              <label>
                الاسم الكامل
                <input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <NewPasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} />
            </>
          )}
          <Notice error={accept.error instanceof ApiError ? accept.error : null} />
          <button className="primary" disabled={accept.isPending || (!asInvitee && (name.trim().length < 2 || password.length < 12 || password !== confirm))}>
            <UserPlus size={17} /> {asInvitee ? "قبول الدعوة والانضمام" : "إنشاء الحساب والانضمام"}
          </button>
        </form>
      )}
      {!p.signed_in && (
        <Link className={conflict ? "primary button" : "text-link"} to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          لدي حساب بهذا البريد — تسجيل الدخول
        </Link>
      )}
    </AuthLayout>
  );
}
