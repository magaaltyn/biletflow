// Platform-independent REST client for the BiletFlow Express API.
// Kept free of React Native imports so the same code runs in the app and in the Node end-to-end tests.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** True when the server could not be reached at all (wrong address, no Wi-Fi, firewall). */
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ClientOptions {
  /** e.g. http://192.168.1.76:3000/api */
  apiUrl: string;
  getToken: () => string | null;
  /** Called when the server rejects the session (expired token, suspended account). */
  onUnauthorized?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Awaited before each request (the app waits here until the stored session has been restored). */
  beforeRequest?: (path: string) => Promise<void> | void;
}

export type Body = Record<string, unknown> | unknown[] | FormData;

export function createApiClient(opts: ClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 20_000;

  async function request<T>(method: string, path: string, body?: Body): Promise<T> {
    await opts.beforeRequest?.(path);
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = opts.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res: Response;
    try {
      res = await doFetch(`${opts.apiUrl}${path}`, { method, headers, body: payload, signal: controller.signal });
    } catch {
      throw new ApiError(0, `Cannot reach the BiletFlow server at ${opts.apiUrl}. Check that the phone and the computer are on the same Wi-Fi and the server is running.`, "network");
    } finally {
      clearTimeout(timer);
    }
    const isJson = res.headers.get("content-type")?.includes("json");
    const data = isJson ? await res.json().catch(() => null) : null;
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.();
      throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
    }
    return data as T;
  }

  return {
    apiUrl: opts.apiUrl,
    get: <T = any>(path: string) => request<T>("GET", path),
    post: <T = any>(path: string, body: Body = {}) => request<T>("POST", path, body),
    put: <T = any>(path: string, body: Body = {}) => request<T>("PUT", path, body),
    patch: <T = any>(path: string, body: Body = {}) => request<T>("PATCH", path, body),
    del: <T = any>(path: string) => request<T>("DELETE", path),
    /** Absolute URL for a server path, with the bearer token header for protected files. */
    authHeaders: (): Record<string, string> => {
      const t = opts.getToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong");
