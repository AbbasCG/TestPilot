export type User = {
  id: number;
  name: string;
  email: string;
  platform_role?: "owner" | "admin" | null;
  status?: "active" | "suspended" | "disabled";
  must_change_password?: boolean;
  password_changed_at?: string | null;
};
export type Member = User & { role: string };
export type ProjectStats = {
  open_issues: number;
  critical_open: number;
  open_runs: number;
  runs_total: number;
  scenarios_ready: number;
  scenarios_total: number;
  environments_active: number;
  last_run: { id: number; title: string; build_version: string; status: string; outcome: string | null; environment: string | null; created_at: string } | null;
};
export type Project = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  version: number;
  role: string;
  owner_id: number;
  members_count?: number;
  stats?: ProjectStats;
  members?: Member[];
  environments?: {
    id: number;
    name: string;
    url: string | null;
    archived: boolean;
    version: number;
  }[];
};
export type Page<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
};
export const NETWORK_MESSAGE = "تعذّر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.";
export const SERVER_MESSAGE = "حدث خطأ في الخادم. أعد المحاولة بعد قليل.";
export class ApiError extends Error {
  status: number;
  code?: string;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = document.cookie
    .split("; ")
    .find((c) => c.startsWith("XSRF-TOKEN="))
    ?.slice(11);
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(NETWORK_MESSAGE, 0);
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const validation = Object.values(payload.errors || {})
      .flat()
      .join(" ");
    // Server faults never leak SQL or stack traces into the interface.
    const fallback = response.status >= 500 ? SERVER_MESSAGE : NETWORK_MESSAGE;
    throw new ApiError(
      validation || (response.status >= 500 ? "" : payload.message) || fallback,
      response.status,
      payload.code,
      payload,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const token = document.cookie
    .split("; ")
    .find((c) => c.startsWith("XSRF-TOKEN="))
    ?.slice(11);
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}),
    },
    body: form,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const validation = Object.values(payload.errors || {})
      .flat()
      .join(" ");
    throw new ApiError(
      validation ||
        payload.message ||
        (response.status === 413
          ? "الملف أكبر من الحد الذي يقبله الخادم."
          : "تعذّر رفع الملف. حاول مرة أخرى."),
      response.status,
    );
  }
  return response.json();
}
