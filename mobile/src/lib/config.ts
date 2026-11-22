// Server addresses come from EXPO_PUBLIC_* variables (mobile/.env). Never put secrets in EXPO_PUBLIC_ variables:
// they are bundled into the app.
const strip = (s: string) => s.trim().replace(/\/$/, "");

/** Website origin: serves event/venue pictures and forwards /api to the Express API. */
export const SERVER_URL = strip(process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:3000");

/** REST API base (…/api). Defaults to the website proxy. */
export const API_URL = strip(process.env.EXPO_PUBLIC_API_URL || `${SERVER_URL}/api`);

/** Resolves image paths stored by the server ("/images/x.svg", "/api/uploads/…") to absolute URLs. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/api/")) return `${API_URL}${path.slice(4)}`;
  return `${SERVER_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Public website link for sharing (e.g. an event page). */
export const webLink = (path: string) => `${SERVER_URL}${path}`;
