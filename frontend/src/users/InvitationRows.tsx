import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Notice } from "../testing/shared";
import { OneTimeSecret } from "./OneTimeSecret";
import type { AdminUser, Delivery, InvitationView } from "./types";
import { formatDateTime, invitationLabels, inviteUrl, projectRoleLabels, stateLabels } from "./types";

export function StateBadge({ state }: { state: AdminUser["state"] }) {
  return <span className={`account-state state-${state}`}>{stateLabels[state]}</span>;
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
