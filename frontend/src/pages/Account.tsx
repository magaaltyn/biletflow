import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Download, LifeBuoy, Ticket } from 'lucide-react'
import { api, download, errorMessage, tokenStore } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Notification, Order, Page, TicketOut, User } from '../lib/types'
import { fmtDate, fmtDateTime, fmtTime, money } from '../lib/format'
import { LANGS, useI18n } from '../lib/i18n'
import { DemoBadge, Empty, ErrorState, ImageWithFallback, Loading, Modal, Status, useAction, useAsync, useToast } from '../components/ui'

const TABS = ['orders', 'upcoming', 'past', 'profile', 'notifications'] as const

export default function Account() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'orders'
  const { t } = useI18n()
  const labels: Record<string, string> = { orders: t('Orders'), upcoming: t('Upcoming'), past: t('Past'), profile: t('Profile'), notifications: t('Notifications') }
  return <div className="mx-auto max-w-4xl">
    <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> {t('Back to events')}</Link>
    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-brand">{t('Your account')}</p><h1 className="mt-1 text-3xl font-black">{t('My tickets & orders')}</h1><p className="mt-2 text-sm text-slate-500">{t('Review your ticket purchases and registrations.')}</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-brand"><Ticket size={22}/></span></div>
    <div className="mt-6 flex flex-wrap gap-2">{TABS.map(k => <button key={k} onClick={() => setParams({ tab: k })} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === k ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{labels[k]}</button>)}<Link to="/support" className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><LifeBuoy className="mr-1 inline" size={13}/>{t('Support')}</Link></div>
    <div className="mt-5">
      {tab === 'orders' && <OrdersList/>}
      {(tab === 'upcoming' || tab === 'past') && <TicketsList when={tab}/>}
      {tab === 'profile' && <ProfileForm/>}
      {tab === 'notifications' && <NotificationsList/>}
    </div>
  </div>
}

function OrdersList() {
  const { t, locale } = useI18n()
  const nav = useNavigate()
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Order>>('/orders', { page, page_size: 10 }), [page])
  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  if (!data?.items.length) return <Empty title={t('No orders yet')} text="Find an event and register or buy a ticket." action={<Link to="/" className="btn-primary">{t('Browse events')}</Link>}/>
  return <div className="space-y-3">{data.items.map(o => <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center gap-4 p-5"><ImageWithFallback src={o.event.image_url} alt="" className="h-20 w-28 rounded-xl object-cover"/><div className="min-w-0 flex-1"><h2 className="font-extrabold">{o.event.title}</h2><p className="mt-1 text-xs text-slate-500">{fmtDate(o.event.starts_at, o.event.timezone, locale)} · {o.event.venue_name}, {o.event.city}</p><p className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="font-mono font-bold">{o.code}</span><Status value={o.status}/>{o.refund_status === 'requested' && <Status value="requested" label="Refund requested"/>}<span className="font-semibold">{o.total === 0 ? t('Free') : money(o.total)}</span>{!o.is_free && <DemoBadge/>}<span className="text-slate-400">{o.ticket_count} ticket(s)</span></p></div><button onClick={() => nav(o.status === 'pending' ? `/checkout/${o.id}` : `/account/orders/${o.id}`)} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">{o.status === 'pending' ? 'Complete payment' : t('View order')} <ArrowRight className="ml-1 inline" size={14}/></button></div></div>)}
    {data.total > data.page_size && <div className="flex justify-between text-xs"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary px-3 py-1.5 text-xs">Previous</button><button disabled={page * data.page_size >= data.total} onClick={() => setPage(page + 1)} className="btn-secondary px-3 py-1.5 text-xs">Next</button></div>}
  </div>
}

function TicketsList({ when }: { when: 'upcoming' | 'past' }) {
  const { t, locale } = useI18n()
  const { data, error, loading, reload } = useAsync(() => api.get<TicketOut[]>('/tickets', { when }), [when])
  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  if (!data?.length) return <Empty title={t('No tickets yet')}/>
  return <div className="grid gap-3 sm:grid-cols-2">{data.map(tk => <Link to={`/tickets/${tk.id}`} key={tk.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-soft"><ImageWithFallback src={tk.event.image_url} alt="" className="h-16 w-16 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="line-clamp-1 font-extrabold">{tk.event.title}</p><p className="text-xs text-slate-500">{fmtDate(tk.event.starts_at, tk.event.timezone, locale)} · {fmtTime(tk.event.starts_at, tk.event.timezone)}</p><p className="mt-1 text-xs text-slate-500">{tk.ticket_type.name} · {tk.attendee.full_name}</p><div className="mt-2"><Status value={tk.status}/></div></div></Link>)}</div>
}

function ProfileForm() {
  const { user, setUser } = useAuth()
  const { t, setLang } = useI18n()
  const { busy, run } = useAction()
  const [form, setForm] = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '', preferred_language: user?.preferred_language ?? 'ru' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  if (!user) return null
  return <div className="grid gap-5 md:grid-cols-2">
    <form className="card space-y-4 p-5" onSubmit={async e => { e.preventDefault(); const u = await run(() => api.patch<User>('/auth/me', form), t('Saved')); if (u) { setUser(u); setLang(u.preferred_language as 'ru') } }}>
      <h2 className="font-extrabold">{t('Profile')}</h2>
      <label className="field-label">Email<input className="field-input" value={user.email} disabled/></label>
      <label className="field-label">{t('Full name')}<input className="field-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required minLength={2}/></label>
      <label className="field-label">{t('Phone (optional)')}<input className="field-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label>
      <label className="field-label">Language<select className="field-input" value={form.preferred_language} onChange={e => setForm({ ...form, preferred_language: e.target.value })}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
      <p className="text-xs text-slate-500">Role: <b>{user.role.replace('_', ' ')}</b> · Email {user.email_verified ? <span className="font-bold text-emerald-600">verified</span> : <span className="font-bold text-amber-600">not verified</span>}</p>
      <button disabled={busy} className="btn-primary">{t('Save changes')}</button>
    </form>
    <form className="card space-y-4 p-5" onSubmit={async e => { e.preventDefault(); const r = await run(() => api.post<{ access_token: string; user: User }>('/auth/change-password', pw), 'Password changed'); if (r) { tokenStore.set(r.access_token); setUser(r.user); setPw({ current_password: '', new_password: '' }) } }}>
      <h2 className="font-extrabold">Change password</h2>
      <label className="field-label">Current password<input type="password" className="field-input" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} required autoComplete="current-password"/></label>
      <label className="field-label">{t('New password')}<input type="password" className="field-input" value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} required minLength={8} autoComplete="new-password"/><span className="font-normal text-slate-400">{t('At least 8 characters with letters and digits')}</span></label>
      <button disabled={busy} className="btn-secondary">Update password</button>
    </form>
  </div>
}

function NotificationsList() {
  const { t, locale } = useI18n()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.get<{ items: Notification[]; unread: number }>('/notifications', { limit: 100 }), [])
  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  if (!data?.items.length) return <Empty title={t('No notifications yet')}/>
  return <div className="card divide-y divide-slate-100">{data.items.map(n => <button key={n.id} onClick={async () => { await api.post(`/notifications/${n.id}/read`).catch(() => {}); if (n.link) nav(n.link); else reload(true) }} className={`block w-full p-4 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-blue-50/40'}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">{n.title}</p><span className="text-[10px] text-slate-400">{fmtDateTime(n.created_at, undefined, locale)}</span></div><p className="mt-1 text-xs text-slate-500">{n.body}</p></button>)}</div>
}

export function OrderDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { t, locale } = useI18n()
  const toast = useToast()
  const { data: o, error, loading, reload } = useAsync(() => api.get<Order>(`/orders/${id}`), [id])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { busy, run } = useAction()
  if (loading) return <Loading/>
  if (error || !o) return <ErrorState message={error ?? 'Order not found'} onRetry={reload}/>
  const started = new Date(o.event.starts_at).getTime() <= Date.now()
  const eligible = o.status === 'completed' && !started && o.refund_status !== 'requested' && (o.tickets ?? []).some(tk => tk.status === 'valid')
  const submitCancel = async () => {
    const r = await run(() => api.post<{ result: string }>(`/orders/${o.id}/cancel-registration`, { reason }))
    if (r) { toast(r.result === 'cancelled' ? 'Registration cancelled' : 'Refund requested — the organizer will review it'); setCancelOpen(false); reload(true) }
  }
  return <div className="mx-auto max-w-4xl">
    <Link to="/account" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> {t('My orders')}</Link>
    {params.get('new') && o.status === 'completed' && <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2/> {o.is_free ? 'You are registered!' : 'DEMO payment successful!'} Your tickets are below and were also sent to your email (local Mailpit inbox).</div>}
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-5"><ImageWithFallback src={o.event.image_url} alt="" className="h-20 w-28 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="font-mono text-xs font-bold text-slate-400">Order {o.code}</p><h1 className="text-xl font-black">{o.event.title}</h1><p className="mt-1 text-xs text-slate-500">{fmtDate(o.event.starts_at, o.event.timezone, locale)} · {fmtTime(o.event.starts_at, o.event.timezone)} · {o.event.venue_name}, {o.event.city}</p></div><div className="text-right"><Status value={o.status}/><p className="mt-2 text-xl font-black text-brand">{o.total === 0 ? t('Free') : money(o.total)}</p></div></div>
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_260px]">
        <div>
          <h2 className="font-extrabold">{t('Tickets')}</h2>
          {o.tickets?.length ? <div className="mt-3 space-y-2">{o.tickets.map(tk => <Link key={tk.id} to={`/tickets/${tk.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50"><div><p className="text-sm font-bold">{tk.attendee.full_name} · {tk.ticket_type.name}</p><p className="font-mono text-xs text-slate-400">{tk.code}</p></div><div className="flex items-center gap-2"><Status value={tk.status}/><ArrowRight size={15} className="text-slate-400"/></div></Link>)}</div> : <p className="mt-2 text-sm text-slate-500">{o.status === 'pending' ? <>Tickets are issued after payment. <Link className="font-bold text-brand" to={`/checkout/${o.id}`}>Complete payment</Link></> : 'No tickets for this order.'}</p>}
          <h2 className="mt-6 font-extrabold">Items</h2>
          <div className="mt-2 space-y-1 text-sm">{o.items?.map(i => <div key={i.id} className="flex justify-between"><span className="text-slate-500">{i.name} × {i.quantity}{i.discount > 0 && <span className="text-emerald-600"> (−{money(i.discount)})</span>}</span><span className="font-semibold">{money(i.line_total)}</span></div>)}{o.discount_total > 0 && <p className="text-xs text-emerald-700">Promo {o.promo_code}: −{money(o.discount_total)}</p>}{o.refunded_total > 0 && <p className="text-xs font-bold text-rose-600">Refunded: {money(o.refunded_total)}</p>}</div>
          {(o.payments?.length ?? 0) > 0 && <><h2 className="mt-6 flex items-center gap-2 font-extrabold">Payments <DemoBadge/></h2><div className="mt-2 space-y-1 text-xs">{o.payments!.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><span className="font-mono">{p.reference}</span><span>{p.method.replace('_demo', '')}</span><span>{money(p.amount)}</span><Status value={p.status}/></div>)}</div></>}
          {(o.refunds?.length ?? 0) > 0 && <><h2 className="mt-6 font-extrabold">Refunds</h2><div className="mt-2 space-y-1 text-xs">{o.refunds!.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><span>{fmtDateTime(r.created_at, undefined, locale)}</span><span>{money(r.amount)}</span><Status value={r.status}/></div>)}</div></>}
        </div>
        <aside className="space-y-2">
          {o.tickets && o.tickets.length > 0 && <button onClick={() => download(`/orders/${o.id}/tickets.pdf`, `biletflow-${o.code}.pdf`).catch(e => toast(errorMessage(e), 'error'))} className="btn-primary w-full"><Download size={16}/> {t('Download PDF')} ({o.tickets.length})</button>}
          <a href={`/api/v1/events/${o.event.id}/calendar.ics`} className="btn-secondary w-full">{t('Add to Calendar')}</a>
          <Link to={`/support?order=${o.id}`} className="btn-secondary w-full"><LifeBuoy size={15}/> {t('Support')}</Link>
          {eligible && <button onClick={() => setCancelOpen(true)} className="btn-danger w-full">{o.total === 0 ? 'Cancel registration' : 'Request refund'}</button>}
          {o.refund_status === 'requested' && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Refund requested — waiting for the organizer.</p>}
          {started && o.status === 'completed' && <p className="text-xs text-slate-400">Cancellation is not available after the event has started.</p>}
        </aside>
      </div>
    </div>
    <Modal open={cancelOpen} title={o.total === 0 ? 'Cancel registration' : 'Request a refund'} onClose={() => setCancelOpen(false)}>
      <p className="text-sm text-slate-600">{o.total === 0 ? 'Your tickets will be cancelled immediately and the places released.' : `The organizer will review your request. If approved, ${money(o.total - o.refunded_total)} (DEMO) is refunded and your tickets become invalid.`}</p>
      <label className="field-label mt-4">Reason (optional)<textarea className="field-input" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label>
      <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setCancelOpen(false)}>{t('Close')}</button><button disabled={busy} className="btn-danger" onClick={submitCancel}>Confirm</button></div>
    </Modal>
  </div>
}
