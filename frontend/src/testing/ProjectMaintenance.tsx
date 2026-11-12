import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Project } from "../api";
import { Notice } from "./shared";

export function ProjectMaintenance({ project: p }: { project: Project }) {
  const cache = useQueryClient();
  const [editing, setEditing] =
    useState<
      Project["environments"] extends (infer E)[] | undefined ? E | null : never
    >(null);
  const refresh = () => {
    cache.invalidateQueries({ queryKey: ["project", String(p.id)] });
    cache.invalidateQueries({ queryKey: ["activity", p.id] });
    cache.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/api/projects/${p.id}/environments/${editing!.id}`, "PUT", editing),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      api(`/api/projects/${p.id}/members/${id}`, "DELETE"),
    onSuccess: refresh,
  });
  return (
    <section className="panel padded edit-section">
      <h2>إدارة البيئات والأعضاء</h2>
      <p className="hint">
        أرشفة البيئة تحفظ مراجع الاختبارات السابقة. إزالة العضوية لا تحذف
        الحساب.
      </p>
      <Notice error={save.error || remove.error} />
      <div className="field-grid">
        <div>
          <h3>بيئات المشروع</h3>
          {p.environments?.map((e) => (
            <div className="maintenance-row" key={e.id}>
              <span>
                {e.name} {e.archived ? "— مؤرشفة" : ""}
              </span>
              <button onClick={() => setEditing(e)}>تعديل البيئة</button>
            </div>
          ))}
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <label>
                اسم البيئة المعدّل
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                رابط البيئة المعدّل
                <input
                  type="url"
                  dir="ltr"
                  value={editing.url || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, url: e.target.value })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={editing.archived}
                  onChange={(e) =>
                    setEditing({ ...editing, archived: e.target.checked })
                  }
                />{" "}
                أرشفة البيئة
              </label>
              <div className="inline-actions">
                <button disabled={save.isPending}>حفظ البيئة</button>
                <button type="button" onClick={() => setEditing(null)}>
                  إلغاء
                </button>
              </div>
            </form>
          )}
        </div>
        {p.role === "owner" && (
          <div>
            <h3>إزالة عضوية</h3>
            {p.members
              ?.filter((m) => m.role !== "owner")
              .map((m) => (
                <div className="maintenance-row" key={m.id}>
                  <span>{m.name}</span>
                  <button
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(`إزالة عضوية ${m.name} من هذا المشروع؟`)
                      )
                        remove.mutate(m.id);
                    }}
                  >
                    إزالة العضو
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
