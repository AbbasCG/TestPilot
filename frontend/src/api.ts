export type User = { id: number; name: string; email: string };
export type Member = User & { role: string };
export type Project = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  version: number;
  role: string;
  owner_id: number;
  members_count?: number;
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
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const validation = Object.values(payload.errors || {})
      .flat()
      .join(" ");
    throw new ApiError(
      validation || payload.message || "تعذّر الاتصال بالخادم. حاول مرة أخرى.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
