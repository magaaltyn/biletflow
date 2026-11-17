import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, TicketCheck, XCircle } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import type { User } from '../lib/types'

function Shell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-md py-6 sm:py-10"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8"><span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-white shadow-lg shadow-blue-200"><TicketCheck size={22}/></span><h1 className="mt-5 text-2xl font-black tracking-tight">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}<div className="mt-6">{children}</div></div></div>
}

function FormError({ msg }: { msg: string | null }) {
  return msg ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{msg}</p> : null
}

export function Login() {
  const { t } = useI18n()
  const { login } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { const u = await login(email, password); nav(params.get('next') || (u.role === 'platform_admin' ? '/admin' : u.has_organizer_profile ? '/organizer' : '/'), { replace: true }) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <Shell title={t('Welcome back')} subtitle={<>{t('No account yet?')} <Link className="font-bold text-brand" to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>{t('Sign up')}</Link></>}>
    <form onSubmit={submit} className="space-y-4">
      <FormError msg={error}/>
      <label className="field-label">Email<input type="email" required autoComplete="email" className="field-input" value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label className="field-label">{t('Password')}<input type="password" required autoComplete="current-password" className="field-input" value={password} onChange={e => setPassword(e.target.value)}/></label>
      <div className="text-right"><Link to="/forgot-password" className="text-xs font-bold text-brand">{t('Forgot password?')}</Link></div>
      <button disabled={busy} className="btn-primary w-full py-3">{busy ? <Loader2 className="animate-spin" size={16}/> : null}{t('Log in')}</button>
    </form>
  </Shell>
}

export function Register() {
  const { t, lang } = useI18n()
  const { register } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { await register({ ...form, phone: form.phone || undefined, preferred_language: lang }); nav(params.get('next') || '/account', { replace: true }) } catch (err) { setError(errorMessage(err)) } finally { setBusy(false) }
  }
  return <Shell title={t('Create your account')} subtitle={<>{t('Already have an account?')} <Link className="font-bold text-brand" to="/login">{t('Log in')}</Link></>}>
    <form onSubmit={submit} className="space-y-4">
      <FormError msg={error}/>
      <label className="field-label">{t('Full name')}<input required minLength={2} autoComplete="name" className="field-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}/></label>
      <label className="field-label">Email<input type="email" required autoComplete="email" className="field-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label>
      <label className="field-label">{t('Phone (optional)')}<input autoComplete="tel" className="field-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+7 7xx xxx xx xx"/></label>
      <label className="field-label">{t('Password')}<input type="password" required minLength={8} autoComplete="new-password" className="field-input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/><span className="font-normal text-slate-400">{t('At least 8 characters with letters and digits')}</span></label>
      <button disabled={busy} className="btn-primary w-full py-3">{busy ? <Loader2 className="animate-spin" size={16}/> : null}{t('Sign up')}</button>
      <p className="text-center text-[11px] text-slate-400">We will send a verification link to your email (local Mailpit inbox at localhost:8025).</p>
    </form>
  </Shell>
}

export function VerifyEmail() {
  const [params] = useSearchParams()
  const { setUser } = useAuth()
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [msg, setMsg] = useState('')
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    api.post<{ user: User }>('/auth/verify-email', { token: params.get('token') ?? '' })
      .then(r => { setState('ok'); setUser(r.user) })
      .catch(e => { setState('error'); setMsg(errorMessage(e)) })
  }, [params, setUser])
  return <Shell title="Email verification">
    {state === 'loading' && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16}/> Verifying…</p>}
    {state === 'ok' && <div className="text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={40}/><p className="mt-3 font-bold">Your email address is verified.</p><Link to="/" className="btn-primary mt-5">Continue</Link></div>}
    {state === 'error' && <div className="text-center"><XCircle className="mx-auto text-rose-500" size={40}/><p className="mt-3 font-bold">{msg}</p><p className="mt-1 text-sm text-slate-500">Log in and use “Resend email” in the banner to get a new link.</p></div>}
  </Shell>
}

export function ForgotPassword() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return <Shell title={t('Reset password')} subtitle="Enter your account email and we will send you a reset link.">
    {sent ? <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{sent} Open the local inbox at <a className="underline" href="http://localhost:8025" target="_blank" rel="noreferrer">localhost:8025</a>.</p> :
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setError(null); try { setSent((await api.post<{ message: string }>('/auth/forgot-password', { email })).message + '.') } catch (err) { setError(errorMessage(err)) } }}>
        <FormError msg={error}/>
        <label className="field-label">Email<input type="email" required className="field-input" value={email} onChange={e => setEmail(e.target.value)}/></label>
        <button className="btn-primary w-full py-3">{t('Send reset link')}</button>
        <p className="text-center text-xs"><Link to="/login" className="font-bold text-brand">{t('Log in')}</Link></p>
      </form>}
  </Shell>
}

export function ResetPassword() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  return <Shell title={t('New password')}>
    {ok ? <div className="text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={40}/><p className="mt-3 font-bold">Password updated.</p><button onClick={() => nav('/login')} className="btn-primary mt-5">{t('Log in')}</button></div> :
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setError(null); try { await api.post('/auth/reset-password', { token: params.get('token') ?? '', password }); setOk(true) } catch (err) { setError(errorMessage(err)) } }}>
        <FormError msg={error}/>
        <label className="field-label">{t('New password')}<input type="password" required minLength={8} autoComplete="new-password" className="field-input" value={password} onChange={e => setPassword(e.target.value)}/><span className="font-normal text-slate-400">{t('At least 8 characters with letters and digits')}</span></label>
        <button className="btn-primary w-full py-3">{t('Save changes')}</button>
      </form>}
  </Shell>
}
