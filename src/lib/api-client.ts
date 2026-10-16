"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };

type Params = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, params?: Params) {
  if (!params) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

async function request<T>(method: string, path: string, data?: unknown, params?: Params): Promise<T> {
  const isForm = typeof FormData !== "undefined" && data instanceof FormData;
  const res = await fetch(buildUrl(path, params), {
    method,
    credentials: "same-origin",
    headers: data && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: data === undefined ? undefined : isForm ? (data as FormData) : JSON.stringify(data),
  });
  const text = await res.text();
  const payload = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // Full reload on purpose: drops all cached client state after the session ends.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${next}`);
    }
    const p = payload as { error?: string; fieldErrors?: Record<string, string[]> } | null;
    throw new ApiError(res.status, p?.error ?? `Request failed (${res.status})`, p?.fieldErrors);
  }
  return payload as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, undefined, params),
  post: <T>(path: string, data?: unknown) => request<T>("POST", path, data ?? {}),
  put: <T>(path: string, data?: unknown) => request<T>("PUT", path, data ?? {}),
  patch: <T>(path: string, data?: unknown) => request<T>("PATCH", path, data ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: (file: File | Blob, folder: string, name = "upload.jpg") => {
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : name);
    form.append("folder", folder);
    return request<{ url: string; path: string }>("POST", "/api/uploads", form);
  },
};

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
