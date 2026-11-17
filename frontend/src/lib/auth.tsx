import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, setUnauthorizedHandler, tokenStore } from './api'
import type { Role, User } from './types'

type AuthResponse = { access_token: string; user: User }
type Ctx = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { email: string; password: string; full_name: string; phone?: string; preferred_language?: string }) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
  setUser: (u: User) => void
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!tokenStore.get())

  const logout = useCallback(() => {
    if (tokenStore.get()) api.post('/auth/logout').catch(() => {})
    tokenStore.set(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return }
    try { setUser(await api.get<User>('/auth/me')) } catch { tokenStore.set(null); setUser(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { setUnauthorizedHandler(() => { tokenStore.set(null); setUser(null) }); refresh() }, [refresh])

  const finish = (r: AuthResponse) => { tokenStore.set(r.access_token); setUser(r.user); return r.user }
  const login = useCallback(async (email: string, password: string) => finish(await api.post<AuthResponse>('/auth/login', { email, password })), [])
  const register = useCallback(async (data: Parameters<Ctx['register']>[0]) => finish(await api.post<AuthResponse>('/auth/register', data)), [])

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh, setUser }), [user, loading, login, register, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export const isOrganizerLike = (u: User | null) => !!u && (u.has_organizer_profile || u.role === 'organizer' || u.role === 'event_admin' || u.role === 'platform_admin')

/** Route guard. Redirects to /login (keeping the target) or shows nothing while loading. */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (roles && !roles.includes(user.role)) {
    return <div className="mx-auto max-w-lg rounded-2xl border border-rose-100 bg-white p-8 text-center"><h1 className="text-xl font-black">Access denied</h1><p className="mt-2 text-sm text-slate-500">Your account ({user.role.replace('_', ' ')}) does not have permission to open this page.</p></div>
  }
  return <>{children}</>
}
