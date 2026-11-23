import { API_URL } from "@/lib/config";
import { createApiClient } from "./apiClient";

// The current token lives in memory for synchronous access; it is persisted in SecureStore by the AuthProvider.
let token: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;
export const setUnauthorizedHandler = (fn: () => void) => {
  unauthorizedHandler = fn;
};

// Screens can mount before the stored session is restored (deep links, reloads). Until the AuthProvider has
// restored it, every request except /auth/* waits, so nothing is sent without the token by mistake.
let markReady: () => void = () => undefined;
const sessionReady = new Promise<void>((resolve) => {
  markReady = resolve;
});
export const markSessionReady = () => markReady();

export const api = createApiClient({
  apiUrl: API_URL,
  getToken: () => token,
  onUnauthorized: () => unauthorizedHandler?.(),
  beforeRequest: (path) => (path.startsWith("/auth/") ? undefined : sessionReady),
});

export { ApiError, errorText, qs } from "./apiClient";

