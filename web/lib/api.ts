// Small fetch wrapper for the BiletFlow REST API (same origin, cookie session).
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body || options.form ? "POST" : "GET"),
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined),
    credentials: "same-origin",
    cache: "no-store",
  });
  const isJson = res.headers.get("content-type")?.includes("json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
  return data as T;
}

export const kzt = (n: number | null | undefined) => (n == null ? "—" : `${new Intl.NumberFormat("ru-RU").format(n)} ₸`);

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Almaty", ...opts }).format(new Date(d));
}

export const toLocalInput = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = new Date(d);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
