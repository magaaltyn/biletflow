import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, markSessionReady, setToken, setUnauthorizedHandler } from "@/services/api";
import type { User } from "@/lib/types";
import { workspacesFor, type Workspace } from "./workspaces";

export { workspacesFor, type Workspace };

const TOKEN_KEY = "bf_token";
const WORKSPACE_KEY = "bf_workspace";

// Tokens are kept in the OS keychain/keystore (SecureStore). The web preview has no keychain, so it keeps the
// token only for the browser tab (sessionStorage) — that preview is a development tool, not a production target.
const secure = {
  get: (k: string) => (Platform.OS === "web" ? Promise.resolve(globalThis.sessionStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === "web" ? Promise.resolve(globalThis.sessionStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === "web" ? Promise.resolve(globalThis.sessionStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};


interface AuthState {
  user: User | null;
  ready: boolean;
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; fullName: string; organizer?: boolean; organizerName?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspaceState] = useState<Workspace>("attendee");
  const [sessionExpired, setSessionExpired] = useState(false);

  const applySession = useCallback(async (token: string, u: User) => {
    setToken(token);
    await secure.set(TOKEN_KEY, token);
    setUserState(u);
    setSessionExpired(false);
  }, []);

  const clear = useCallback(async () => {
    setToken(null);
    setUserState(null);
    setWorkspaceState("attendee");
    qc.clear();
    await secure.del(TOKEN_KEY);
    await secure.del(WORKSPACE_KEY);
  }, [qc]);

  // Restore the session: a stored token is exchanged for a fresh one (sliding 7-day session).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpired(true);
      void clear();
    });
    (async () => {
      try {
        const token = await secure.get(TOKEN_KEY);
        if (token) {
          setToken(token);
          try {
            const r = await api.post<{ user: User; token: string }>("/auth/refresh");
            await applySession(r.token, r.user);
            const saved = (await secure.get(WORKSPACE_KEY)) as Workspace | null;
            if (saved && workspacesFor(r.user).includes(saved)) setWorkspaceState(saved);
          } catch (e) {
            // Offline: keep the stored token and try again later; rejected token: sign out.
            if (e instanceof ApiError && !e.isNetwork) await clear();
          }
        }
      } finally {
        markSessionReady();
        setReady(true);
      }
    })();
  }, [applySession, clear]);

  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w);
    void secure.set(WORKSPACE_KEY, w);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.post<{ user: User; token: string }>("/auth/login", { email, password });
      await applySession(r.token, r.user);
      return r.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; organizer?: boolean; organizerName?: string }) => {
      const r = await api.post<{ user: User; token: string }>("/auth/register", input);
      await applySession(r.token, r.user);
      return r.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    await clear();
  }, [clear]);

  const refreshUser = useCallback(async () => {
    const r = await api.get<{ user: User | null }>("/auth/me");
    if (r.user) setUserState(r.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, workspace, setWorkspace, login, register, logout, refreshUser, setUser: setUserState, sessionExpired }),
    [user, ready, workspace, setWorkspace, login, register, logout, refreshUser, sessionExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
