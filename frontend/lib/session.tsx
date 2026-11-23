"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface SessionUser {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: "attendee" | "organizer" | "platform_admin";
  email_verified: boolean;
  has_password: boolean;
  google_linked: boolean;
  organizer_name: string | null;
  identity_status: string | null;
  is_event_admin: boolean;
}

interface Session {
  user: SessionUser | null;
  loading: boolean;
  config: { googleEnabled: boolean; halykEnabled: boolean; halykScript: string | null };
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Session["config"]>({ googleEnabled: false, halykEnabled: false, halykScript: null });

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: SessionUser | null }>("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api("/auth/config").then(setConfig).catch(() => undefined);
  }, [refresh]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  return <SessionContext.Provider value={{ user, loading, config, refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
