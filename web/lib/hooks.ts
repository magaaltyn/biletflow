"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useSession } from "./session";

/** Loads data from the API; returns { data, error, loading, reload }. */
export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Redirects to /login when signed out. Returns the user once known. */
export function useRequireUser(roles?: string[]) {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    else if (roles && !roles.includes(user.role)) router.replace("/");
  }, [user, loading, router, roles]);
  return { user: user && (!roles || roles.includes(user.role)) ? user : null, loading };
}
