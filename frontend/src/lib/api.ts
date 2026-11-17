// Thin fetch wrapper around the BiletFlow REST API (/api/v1, proxied by Vite to FastAPI).
const BASE = '/api/v1'
const TOKEN_KEY = 'biletflow.token'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const tokenStore = {
  get: (): string | null => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ } },
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

export type Query = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, query?: Query) {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : ''
  return `${BASE}${path}${qs ? `?${qs}` : ''}`
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  let res: Response
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the BiletFlow server. Is the backend running on http://localhost:8000?')
  }
  if (res.status === 401 && token) onUnauthorized?.()
  const text = await res.text()
  let data: unknown = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  if (!res.ok) {
    const err = data && typeof data === 'object' && 'error' in data ? (data as { error: { code: string; message: string; details?: unknown } }).error : null
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details)
  }
  return data as T
}

export const api = {
  get: <T,>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T,>(path: string) => request<T>('DELETE', path),
  upload: (file: File) => { const fd = new FormData(); fd.append('file', file); return request<{ url: string }>('POST', '/uploads/image', fd) },
}

/** Download a protected file (PDF etc.) using the bearer token. */
export async function download(path: string, filename: string) {
  const token = tokenStore.get()
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    let msg = `Download failed (${res.status})`
    try { msg = (await res.json()).error.message } catch { /* not json */ }
    throw new ApiError(res.status, 'download_failed', msg)
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 2000)
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
