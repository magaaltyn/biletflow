import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LayoutDashboard, LifeBuoy, LogOut, Menu, ShieldCheck, Ticket, TicketCheck, User as UserIcon, X } from 'lucide-react'
import { api } from './lib/api'
import { RequireAuth, useAuth } from './lib/auth'
import { LANGS, useI18n } from './lib/i18n'
import type { Notification } from './lib/types'
import { fmtDateTime } from './lib/format'
import Home from './pages/Home'
import EventPage from './pages/EventPage'
import Checkout, { PayOrder } from './pages/Checkout'
import TicketPage from './pages/TicketPage'
import Account, { OrderDetail } from './pages/Account'
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/AuthPages'
import Support, { SupportCaseView } from './pages/Support'
import OrganizerDashboard from './pages/organizer/Dashboard'
import EventEditor from './pages/organizer/EventEditor'
import Admin from './pages/admin/Admin'
import OrganizerPublic from './pages/OrganizerPublic'
import { Privacy, NotFound } from './pages/Static'
import ErrorBoundary from './components/ErrorBoundary'

function LanguageMenu() {
  const { lang, setLang } = useI18n()
  const { user, setUser } = useAuth()
  const [open, setOpen] = useState(false)
  const current = LANGS.find(l => l.code === lang)!
  const choose = (code: typeof lang) => {
    setLang(code)
    setOpen(false)
    if (user && user.preferred_language !== code) api.patch('/auth/me', { preferred_language: code }).then(u => setUser(u as typeof user)).catch(() => {})
  }
  return <div className="relative">
    <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-semibold text-slate-600" aria-haspopup="listbox" aria-expanded={open}>🇰🇿 {current.flag} · KZT <ChevronDown size={13}/></button>
    {open && <div className="absolute right-0 top-8 z-50 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl" role="listbox">
      {LANGS.map(l => <button key={l.code} onClick={() => choose(l.code)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${l.code === lang ? 'bg-blue-50 font-bold text-brand' : 'hover:bg-slate-50'}`}>{l.label}<span className="text-[10px] text-slate-400">{l.flag}</span></button>)}
    </div>}
  </div>
}

function NotificationBell() {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ items: Notification[]; unread: number }>({ items: [], unread: 0 })
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const load = () => api.get<{ items: Notification[]; unread: number }>('/notifications', { limit: 15 }).then(setData).catch(() => {})
  useEffect(() => { load(); const id = window.setInterval(load, 30000); return () => window.clearInterval(id) }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const openItem = async (n: Notification) => {
    if (!n.read) await api.post(`/notifications/${n.id}/read`).catch(() => {})
    setOpen(false)
    load()
    if (n.link) nav(n.link)
  }
  return <div className="relative" ref={ref}>
    <button onClick={() => { setOpen(!open); if (!open) load() }} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600" aria-label={t('Notifications')}><Bell size={17}/>{data.unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{data.unread}</span>}</button>
    {open && <div className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><span className="text-sm font-extrabold">{t('Notifications')}</span><button onClick={() => api.post('/notifications/read-all').then(load)} className="text-xs font-bold text-brand">{t('Mark all read')}</button></div>
      <div className="max-h-96 overflow-y-auto">{data.items.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">{t('No notifications yet')}</p> : data.items.map(n => <button key={n.id} onClick={() => openItem(n)} className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/50'}`}><p className="text-sm font-bold">{n.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p><p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(n.created_at, undefined, locale)}</p></button>)}</div>
    </div>}
  </div>
}

function UserMenu() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  if (!user) return null
  const go = (to: string) => { setOpen(false); nav(to) }
  return <div className="relative" ref={ref}>
    <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold hover:bg-slate-100"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-white">{user.full_name.slice(0, 1).toUpperCase()}</span><span className="hidden max-w-[120px] truncate lg:inline">{user.full_name}</span><ChevronDown size={14}/></button>
    {open && <div className="absolute right-0 top-12 z-50 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
      <div className="px-3 py-2"><p className="truncate text-sm font-bold">{user.full_name}</p><p className="truncate text-xs text-slate-500">{user.email}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-brand">{user.role.replace('_', ' ')}</p></div>
      <button className="nav-mobile flex w-full items-center gap-2" onClick={() => go('/account')}><Ticket size={15}/>{t('My tickets & orders')}</button>
      <button className="nav-mobile flex w-full items-center gap-2" onClick={() => go('/account?tab=profile')}><UserIcon size={15}/>{t('Profile')}</button>
      <button className="nav-mobile flex w-full items-center gap-2" onClick={() => go('/organizer')}><LayoutDashboard size={15}/>{t('Organizer dashboard')}</button>
      {user.role === 'platform_admin' && <button className="nav-mobile flex w-full items-center gap-2" onClick={() => go('/admin')}><ShieldCheck size={15}/>{t('Admin panel')}</button>}
      <button className="nav-mobile flex w-full items-center gap-2" onClick={() => go('/support')}><LifeBuoy size={15}/>{t('Support')}</button>
      <button className="nav-mobile flex w-full items-center gap-2 text-rose-600" onClick={() => { setOpen(false); logout(); nav('/') }}><LogOut size={15}/>{t('Log out')}</button>
    </div>}
  </div>
}

function Header() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [mobileNav, setMobileNav] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  useEffect(() => { setMobileNav(false) }, [loc.pathname])
  const navCls = ({ isActive }: { isActive: boolean }) => `text-sm font-semibold ${isActive ? 'text-brand' : 'text-slate-600 hover:text-ink'}`
  return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
    <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
      <Link to="/" className="flex items-center gap-2.5" aria-label="BiletFlow home"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-lg shadow-blue-200"><TicketCheck size={21}/></span><span className="text-[21px] font-extrabold tracking-tight">Bilet<span className="text-brand">Flow</span></span></Link>
      <nav className="hidden items-center gap-7 md:flex"><NavLink to="/" end className={navCls}>{t('Events')}</NavLink><NavLink to="/organizer" className={navCls}>{t('For Organizers')}</NavLink><Link to="/#how-it-works" className="text-sm font-semibold text-slate-600 hover:text-ink">{t('How It Works')}</Link><Link to="/#pricing" className="text-sm font-semibold text-slate-600 hover:text-ink">{t('Pricing')}</Link></nav>
      <div className="hidden items-center gap-3 sm:flex">
        <LanguageMenu/>
        {user ? <><NotificationBell/><UserMenu/></> : <><button onClick={() => nav('/login')} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">{t('Log in')}</button><button onClick={() => nav('/register')} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-200 hover:bg-blue-700">{t('Sign up')}</button></>}
      </div>
      <div className="flex items-center gap-2 sm:hidden">{user && <NotificationBell/>}<button className="rounded-lg p-2" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">{mobileNav ? <X/> : <Menu/>}</button></div>
      <button className="hidden rounded-lg p-2 sm:block md:hidden" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">{mobileNav ? <X/> : <Menu/>}</button>
    </div>
    {mobileNav && <div className="border-t border-slate-100 bg-white p-4 md:hidden"><div className="flex flex-col gap-1">
      <Link className="nav-mobile" to="/">{t('Events')}</Link>
      <Link className="nav-mobile" to="/organizer">{t('For Organizers')}</Link>
      {user ? <>
        <Link className="nav-mobile" to="/account">{t('My tickets & orders')}</Link>
        <Link className="nav-mobile" to="/support">{t('Support')}</Link>
        {user.role === 'platform_admin' && <Link className="nav-mobile" to="/admin">{t('Admin panel')}</Link>}
        <button className="nav-mobile text-rose-600" onClick={() => { logout(); nav('/') }}>{t('Log out')} ({user.email})</button>
      </> : <><Link className="nav-mobile" to="/login">{t('Log in')}</Link><Link className="nav-mobile" to="/register">{t('Sign up')}</Link></>}
      <div className="px-3 pt-2"><LanguageMenu/></div>
    </div></div>}
  </header>
}

function VerifyBanner() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [sent, setSent] = useState(false)
  if (!user || user.email_verified) return null
  return <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">{t('Please verify your email address.')} <span className="text-amber-700">(Local inbox: <a className="font-bold underline" href="http://localhost:8025" target="_blank" rel="noreferrer">Mailpit</a>)</span> <button disabled={sent} onClick={() => api.post('/auth/resend-verification').then(() => setSent(true))} className="ml-2 font-bold text-brand disabled:text-slate-400">{sent ? '✓' : t('Resend email')}</button></div>
}

function ScrollToHash() {
  const loc = useLocation()
  useEffect(() => {
    if (loc.hash) { const el = document.getElementById(loc.hash.slice(1)); if (el) { el.scrollIntoView({ behavior: 'smooth' }); return } }
    window.scrollTo({ top: 0 })
  }, [loc.pathname, loc.hash])
  return null
}

function Footer() {
  const { t } = useI18n()
  return <footer className="mt-12 border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><Link to="/" className="flex items-center gap-2 font-extrabold text-ink"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><TicketCheck size={16}/></span>BiletFlow</Link><p>{t('Made for memorable moments across Kazakhstan.')}</p><div className="flex gap-4"><Link to="/support" className="hover:text-brand">{t('Help & Support')}</Link><Link to="/privacy" className="hover:text-brand">{t('Privacy')}</Link><span>© 2026 BiletFlow · Demo</span></div></div></footer>
}

export default function App() {
  const loc = useLocation()
  return <div className="min-h-screen bg-canvas">
    <ScrollToHash/>
    <Header/>
    <VerifyBanner/>
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <ErrorBoundary resetKey={loc.pathname}><Routes>
        <Route path="/" element={<Home/>}/>
        <Route path="/events/:id" element={<EventPage/>}/>
        <Route path="/organizers/:id" element={<OrganizerPublic/>}/>
        <Route path="/checkout" element={<RequireAuth><Checkout/></RequireAuth>}/>
        <Route path="/checkout/:orderId" element={<RequireAuth><PayOrder/></RequireAuth>}/>
        <Route path="/tickets/:id" element={<RequireAuth><TicketPage/></RequireAuth>}/>
        <Route path="/account" element={<RequireAuth><Account/></RequireAuth>}/>
        <Route path="/account/orders/:id" element={<RequireAuth><OrderDetail/></RequireAuth>}/>
        <Route path="/support" element={<RequireAuth><Support/></RequireAuth>}/>
        <Route path="/support/:id" element={<RequireAuth><SupportCaseView/></RequireAuth>}/>
        <Route path="/organizer" element={<RequireAuth><OrganizerDashboard/></RequireAuth>}/>
        <Route path="/organizer/events/new" element={<RequireAuth><EventEditor/></RequireAuth>}/>
        <Route path="/organizer/events/:id" element={<RequireAuth><EventEditor/></RequireAuth>}/>
        <Route path="/admin" element={<RequireAuth roles={['platform_admin']}><Admin/></RequireAuth>}/>
        <Route path="/login" element={<Login/>}/>
        <Route path="/register" element={<Register/>}/>
        <Route path="/verify-email" element={<VerifyEmail/>}/>
        <Route path="/forgot-password" element={<ForgotPassword/>}/>
        <Route path="/reset-password" element={<ResetPassword/>}/>
        <Route path="/privacy" element={<Privacy/>}/>
        <Route path="*" element={<NotFound/>}/>
      </Routes></ErrorBoundary>
    </main>
    <Footer/>
  </div>
}

