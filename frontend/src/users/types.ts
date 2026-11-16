export type AccountState = "active" | "must_change_password" | "suspended" | "disabled";

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  platform_role: "owner" | "admin" | null;
  status: "active" | "suspended" | "disabled";
  state: AccountState;
  must_change_password: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_at: string;
  version: number;
  projects_count?: number;
};

export type InvitationView = {
  id: number;
  email: string;
  project_id: number | null;
  project?: string | null;
  project_role: string | null;
  state: "pending" | "accepted" | "revoked" | "expired";
  invited_by: { id: number; name: string } | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  last_sent_at: string;
  send_count: number;
  created_at: string;
};

export type Delivery = { invitation: InvitationView; delivery: "email" | "manual_link"; token: string | null };

export type UserDetail = AdminUser & {
  status_reason: string | null;
  status_changed_at: string | null;
  created_by: { id: number; name: string } | null;
  projects: { id: number; name: string; status: string; role: string; joined_at: string }[];
  activity: { id: number; action: string; metadata: Record<string, unknown>; created_at: string; actor: string | null; project: string | null }[];
  invitations: InvitationView[];
};

export const stateLabels: Record<AccountState, string> = {
  active: "نشط",
  must_change_password: "بانتظار تغيير كلمة المرور",
  suspended: "معلّق",
  disabled: "معطّل",
};

export const invitationLabels: Record<InvitationView["state"], string> = {
  pending: "معلّقة",
  accepted: "مقبولة",
  revoked: "ملغاة",
  expired: "منتهية",
};

export const platformRoleLabels: Record<string, string> = { owner: "مالك المنصة", admin: "مسؤول المنصة" };

export const projectRoleLabels: Record<string, string> = { owner: "مالك المشروع", manager: "مدير", tester: "مختبر", viewer: "مشاهد" };

export const activityLabels: Record<string, string> = {
  "account.created": "إنشاء الحساب",
  "account.password_changed": "تغيير كلمة المرور",
  "account.password_reset_by_admin": "إصدار كلمة مرور مؤقتة",
  "account.password_reset_by_link": "استعادة كلمة المرور برابط",
  "account.status_changed": "تغيير حالة الحساب",
  "account.platform_role_changed": "تغيير صلاحية المنصة",
  "account.profile_updated": "تعديل بيانات الحساب",
  "auth.login_refused_inactive": "محاولة دخول لحساب موقوف",
  "membership.added": "إضافة إلى مشروع",
  "membership.role_changed": "تغيير الدور في مشروع",
  "membership.removed": "إزالة من مشروع",
  "invitation.accepted": "قبول دعوة",
};

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

export const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : "—";
