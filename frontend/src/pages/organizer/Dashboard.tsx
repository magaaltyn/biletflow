import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import jsQR from 'jsqr'
import {
  ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronDown, CircleHelp, Copy, Download, Eye, LayoutDashboard, LifeBuoy, Megaphone, Pencil, Plus,
  QrCode, RotateCcw, ScanLine, Search, Settings, ShieldCheck, Ticket, TicketCheck, Undo2, Upload, Users, Wallet, XCircle,
} from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Analytics, AttendeeRow, Campaign, EventItem, Order, Organizer, Page, Refund } from '../../lib/types'
import { fmtDate, fmtDateTime, money } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { DemoBadge, Empty, ErrorState, Loading, Modal, Pager, StatCard, Status, useAction, useAsync, useToast } from '../../components/ui'
import { CaseList } from '../Support'

const MENU: { name: string; icon: ReactNode }[] = [
  { name: 'Overview', icon: <LayoutDashboard size={16}/> }, { name: 'Events', icon: <CalendarDays size={16}/> }, { name: 'Orders', icon: <Ticket size={16}/> },
  { name: 'Attendees', icon: <Users size={16}/> }, { name: 'Refunds', icon: <Undo2 size={16}/> }, { name: 'Campaigns', icon: <Megaphone size={16}/> },
  { name: 'Analytics', icon: <BarChart3 size={16}/> }, { name: 'Check-in', icon: <ScanLine size={16}/> }, { name: 'Support', icon: <LifeBuoy size={16}/> },
  { name: 'Settings', icon: <Settings size={16}/> },
]
const COLORS = ['#174cf5', '#22c55e', '#fbbf24', '#a855f7', '#f43f5e', '#06b6d4', '#94a3b8']

export default function OrganizerDashboard() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const tab = MENU.some(m => m.name === params.get('tab')) ? params.get('tab')! : 'Overview'
  const setTab = (name: string) => setParams({ tab: name })
  const { data: profile, loading, error, reload } = useAsync(() => api.get<Organizer>('/organizers/me').catch(e => { if (e.code === 'organizer_profile_required') return null; throw e }), [])
  const { data: events, reload: reloadEvents } = useAsync(() => api.get<EventItem[]>('/organizers/me/events').catch(() => [] as EventItem[]), [])
  const staffOnly = !profile && (events?.length ?? 0) > 0

  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  if (!profile && !staffOnly && user?.role !== 'platform_admin') return <OrganizerOnboarding onDone={() => { reload(); reloadEvents() }}/>

  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="grid min-h-[700px] md:grid-cols-[210px_1fr]">
    <aside className="hidden bg-[#0b1635] p-4 text-white md:block">
      <button onClick={() => nav('/')} className="flex items-center gap-2 px-2 py-3 text-lg font-extrabold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand"><TicketCheck size={18}/></span>BiletFlow</button>
      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300"><p className="truncate font-bold text-white">{profile?.name ?? 'Event staff workspace'}</p><p className="mt-0.5 truncate">{profile ? `Paid sales: ${profile.paid_sales_status.replace('_', ' ')}` : 'Assigned events only'}</p></div>
      <nav className="mt-6 space-y-1">{MENU.map(m => <button key={m.name} onClick={() => setTab(m.name)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${tab === m.name ? 'bg-brand text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{m.icon}{m.name}</button>)}</nav>
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/20 text-amber-300"><CircleHelp size={18}/></span><p className="mt-3 text-sm font-bold">Need a hand?</p><p className="mt-1 text-xs leading-5 text-slate-400">Contact the BiletFlow team through a support case.</p><button onClick={() => nav('/support')} className="mt-3 text-xs font-bold text-blue-300">Get help <ArrowRight className="ml-1 inline" size={12}/></button></div>
    </aside>
    <section className="min-w-0 bg-[#f8faff] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold text-slate-500">Workspace / {tab}</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{tab === 'Overview' ? 'Organizer Dashboard' : tab}</h1><p className="mt-1 text-sm text-slate-500">Here’s what’s happening with your events today.</p></div>{profile && <button onClick={() => nav('/organizer/events/new')} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"><Plus className="mr-1 inline" size={16}/> Create Event</button>}</div>
      <div className="mt-5 flex flex-wrap gap-2 md:hidden">{MENU.map(m => <button key={m.name} onClick={() => setTab(m.name)} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === m.name ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{m.name}</button>)}</div>
      <div className="mt-6">
        {tab === 'Overview' && <Overview setTab={setTab} profile={profile}/>}
        {tab === 'Events' && <EventsTab events={events ?? []} reload={reloadEvents} canCreate={!!profile}/>}
        {tab === 'Orders' && <OrdersTab events={events ?? []}/>}
        {tab === 'Attendees' && <AttendeesTab events={events ?? []}/>}
        {tab === 'Refunds' && <RefundsTab/>}
        {tab === 'Campaigns' && <CampaignsTab events={events ?? []}/>}
        {tab === 'Analytics' && <AnalyticsTab events={events ?? []}/>}
        {tab === 'Check-in' && <CheckinTab/>}
        {tab === 'Support' && <CaseList scope="staff"/>}
        {tab === 'Settings' && (profile ? <SettingsTab profile={profile} onChange={reload}/> : <Empty title="No organizer profile" text="You have access to assigned events as staff."/>)}
      </div>
    </section>
  </div></div>
}

// ------------------------------------------------------------------ onboarding
function OrganizerOnboarding({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth()
  const { busy, run } = useAction()
  const [form, setForm] = useState({ name: '', description: '', city: 'Almaty', contact_phone: '', website: '' })
  return <div className="mx-auto max-w-2xl"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
    <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-brand">FOR EVENT ORGANIZERS</span>
    <h1 className="mt-3 text-2xl font-black">Create your organizer profile</h1>
    <p className="mt-1 text-sm text-slate-500">Set up a profile to create events, sell tickets and see analytics. Free events can be published immediately; paid sales need a simulated activation.</p>
    <form className="mt-6 space-y-4" onSubmit={async e => { e.preventDefault(); const r = await run(() => api.post('/organizers/me', { ...form, contact_phone: form.contact_phone || null, website: form.website || null }), 'Organizer profile created'); if (r) { await refresh(); onDone() } }}>
      <label className="field-label">Organizer / company name<input required minLength={2} className="field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label className="field-label">Description<textarea className="field-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      <div className="grid gap-4 sm:grid-cols-3"><label className="field-label">City<input className="field-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}/></label><label className="field-label">Phone<input className="field-input" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })}/></label><label className="field-label">Website<input className="field-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}/></label></div>
      <button disabled={busy} className="btn-primary w-full py-3">Create organizer profile</button>
    </form>
  </div></div>
}

// ------------------------------------------------------------------ charts (same visual language as the original prototype)
function SalesBars({ data }: { data: Analytics['sales_over_time'] }) {
  const days = useMemo(() => {
    const out: { date: string; revenue: number; tickets: number }[] = []
    const byDate = Object.fromEntries(data.map(d => [d.date, d]))
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); const k = d.toISOString().slice(0, 10); out.push({ date: k, revenue: byDate[k]?.revenue ?? 0, tickets: byDate[k]?.tickets ?? 0 }) }
    const older = data.filter(d => d.date < out[0].date)
    return { out, olderCount: older.length }
  }, [data])
  const max = Math.max(1, ...days.out.map(d => d.revenue || d.tickets))
  const useRevenue = days.out.some(d => d.revenue > 0)
  return <>
    <div className="mt-7 flex h-48 items-end gap-1.5 border-b border-l border-slate-100 px-2 pt-3 sm:gap-3">{days.out.map((d, i) => { const v = useRevenue ? d.revenue : d.tickets; return <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${d.date}: ${money(d.revenue)} · ${d.tickets} tickets`}><div style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 100)}%` }} className={`w-full rounded-t-md transition ${i === days.out.length - 1 ? 'bg-brand' : v ? 'bg-blue-200 group-hover:bg-blue-400' : 'bg-slate-100'}`}/></div> })}</div>
    <div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>{days.out[0].date.slice(5)}</span><span>{useRevenue ? 'Revenue per day (KZT)' : 'Tickets per day'}</span><span>Today</span></div>
  </>
}

function Donut({ rows, total }: { rows: { name: string; value: number }[]; total: number }) {
  const sum = rows.reduce((s, r) => s + r.value, 0)
  let acc = 0
  const stops = sum ? rows.map((r, i) => { const from = acc; acc += (r.value / sum) * 100; return `${COLORS[i % COLORS.length]} ${from}% ${acc}%` }).join(', ') : '#e2e8f0 0 100%'
  return <><div className="mx-auto mt-5 grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(${stops})` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span className="text-2xl font-black">{total.toLocaleString()}</span><span className="text-[10px] text-slate-400">tickets sold</span></div></div>
    <div className="mt-5 space-y-3">{rows.map((r, i) => <div key={r.name + i} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }}/><span className="flex-1 truncate text-slate-600">{r.name}</span><span className="font-bold">{sum ? Math.round((r.value / sum) * 100) : 0}%</span></div>)}</div></>
}

function MetricCards({ a }: { a: Analytics }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard name="Gross Sales" value={a.gross_sales} unit="KZT" note={`${a.orders} paid / registered orders`} icon={<Wallet/>}/>
    <StatCard name="Tickets Sold" value={a.tickets_sold} note={`${a.percent_sold}% of ${a.total_capacity.toLocaleString()} capacity · ${a.tickets_remaining.toLocaleString()} left`} icon={<Ticket/>} color="text-emerald-600" bg="bg-emerald-50"/>
    <StatCard name="Net Revenue" value={a.net_revenue} unit="KZT" note={`− ${money(a.discounts)} discounts · − ${money(a.refunds)} refunds`} icon={<BarChart3/>} color="text-emerald-600" bg="bg-emerald-50"/>
    <StatCard name="Checked-in" value={a.checkin.checked_in} note={`${a.checkin.checkin_rate}% of sold tickets`} icon={<CheckCircle2/>} color="text-violet-600" bg="bg-violet-50"/>
  </div>
}

function OrdersTable({ orders, onOpen }: { orders: Order[]; onOpen?: (o: Order) => void }) {
  const { locale } = useI18n()
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="table-head"><tr>{['Order ID', 'Attendee', 'Event', 'Date', 'Amount', 'Status'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{orders.map(o => <tr key={o.id} onClick={() => onOpen?.(o)} className={`border-b border-slate-100 last:border-0 ${onOpen ? 'cursor-pointer hover:bg-slate-50' : ''}`}><td className="table-cell font-bold">#{o.code}</td><td className="table-cell">{o.buyer_name}<br/><span className="text-slate-400">{o.buyer_email}</span></td><td className="table-cell">{o.event.title}</td><td className="table-cell">{fmtDateTime(o.created_at, undefined, locale)}</td><td className="table-cell font-semibold">{o.total === 0 ? 'Free' : money(o.total)}</td><td className="table-cell"><Status value={o.status}/></td></tr>)}</tbody></table></div>
}

// ------------------------------------------------------------------ overview
function Overview({ setTab, profile }: { setTab: (t: string) => void; profile: Organizer | null }) {
  const { data: a, error, loading, reload } = useAsync(() => api.get<Analytics>('/organizers/me/analytics'), [])
  if (loading) return <Loading/>
  if (error || !a) return <ErrorState message={error ?? 'Failed'} onRetry={reload}/>
  return <>
    {profile && profile.paid_sales_status !== 'active' && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span><ShieldCheck className="mr-1.5 inline" size={16}/> Paid ticket sales are <b>{profile.paid_sales_status.replace('_', ' ')}</b>. Free events work right away.</span><button onClick={() => setTab('Settings')} className="font-bold text-brand">Open activation checklist →</button></div>}
    <MetricCards a={a}/>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Sales overview</h2><p className="mt-1 text-xs text-slate-500">Last 14 days · live database data</p></div><button onClick={() => setTab('Analytics')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Details <ChevronDown className="ml-1 inline -rotate-90" size={12}/></button></div><SalesBars data={a.sales_over_time}/></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Ticket types</h2><p className="mt-1 text-xs text-slate-500">Sales by ticket type (top 6)</p><Donut total={a.tickets_sold} rows={[...a.sales_by_ticket_type].sort((x, y) => y.sold - x.sold).slice(0, 6).map(t => ({ name: t.name, value: t.sold }))}/></div>
    </div>
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-extrabold">Recent orders</h2><p className="mt-1 text-xs text-slate-500">Latest ticket purchases and registrations</p></div><button onClick={() => setTab('Orders')} className="text-xs font-bold text-brand">View all <ArrowRight className="ml-1 inline" size={13}/></button></div>{a.recent_orders?.length ? <OrdersTable orders={a.recent_orders}/> : <p className="mt-4 text-sm text-slate-500">No orders yet.</p>}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-4">{Object.entries(a.events_by_status ?? {}).map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{k} events</p><p className="mt-1 text-2xl font-black">{v}</p></div>)}</div>
    {a.pending_refund_requests > 0 && <button onClick={() => setTab('Refunds')} className="mt-5 w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm font-semibold text-amber-900">{a.pending_refund_requests} refund request(s) waiting for review →</button>}
  </>
}

// ------------------------------------------------------------------ events
function EventsTab({ events, reload, canCreate }: { events: EventItem[]; reload: () => void; canCreate: boolean }) {
  const nav = useNavigate()
  const { locale } = useI18n()
  const { busy, run } = useAction()
  const [filter, setFilter] = useState('')
  const list = events.filter(e => !filter || e.status === filter)
  const act = async (fn: () => Promise<unknown>, msg: string) => { if (await run(fn, msg) !== undefined) reload() }
  if (!events.length) return <Empty title="No events yet" text="Create your first event — it starts as a draft." action={canCreate ? <button onClick={() => nav('/organizer/events/new')} className="btn-primary"><Plus size={16}/> Create Event</button> : undefined}/>
  return <div>
    <div className="mb-3 flex flex-wrap gap-2">{['', 'draft', 'published', 'cancelled', 'suspended'].map(s => <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === s ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s || 'All'} ({s ? events.filter(e => e.status === s).length : events.length})</button>)}</div>
    <div className="space-y-3">{list.map(e => {
      const sold = (e.ticket_types ?? []).reduce((s, t) => s + (t.quantity_sold ?? 0), 0)
      return <div key={e.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{e.title}</h3><Status value={e.status}/>{e.visibility !== 'public' && <Status value="draft" label={e.visibility}/>}{e.is_owner === false && <Status value="open" label="staff"/>}</div><p className="mt-1 text-xs text-slate-500">{fmtDateTime(e.starts_at, e.timezone, locale)} · {e.venue_name}, {e.city} · {sold}/{e.capacity} sold</p>{e.suspended_reason && <p className="mt-1 text-xs font-semibold text-rose-600">Suspended: {e.suspended_reason}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/events/${e.id}`} className="btn-secondary px-3 py-2 text-xs"><Eye size={14}/> {e.status === 'draft' ? 'Preview' : 'View'}</Link>
          <Link to={`/organizer/events/${e.id}`} className="btn-secondary px-3 py-2 text-xs"><Pencil size={14}/> Manage</Link>
          {e.status === 'draft' && <button disabled={busy} onClick={() => act(() => api.post(`/events/${e.id}/publish`), 'Event published')} className="btn-primary px-3 py-2 text-xs">Publish</button>}
          {e.status === 'published' && <button disabled={busy} onClick={() => act(() => api.post(`/events/${e.id}/unpublish`), 'Event unpublished')} className="btn-secondary px-3 py-2 text-xs">Unpublish</button>}
          {e.is_owner !== false && <button disabled={busy} onClick={() => act(async () => { const c = await api.post<EventItem>(`/events/${e.id}/duplicate`); nav(`/organizer/events/${c.id}`) }, 'Event duplicated as draft')} className="btn-secondary px-3 py-2 text-xs"><Copy size={14}/> Duplicate</button>}
        </div>
      </div>
    })}</div>
  </div>
}

// ------------------------------------------------------------------ orders
export function OrderModal({ orderId, onClose, onChanged }: { orderId: number | null; onClose: () => void; onChanged?: () => void }) {
  const { locale } = useI18n()
  const { data: o, loading, reload } = useAsync(() => (orderId ? api.get<Order>(`/orders/${orderId}`) : Promise.resolve(null)), [orderId])
  const { busy, run } = useAction()
  const [reason, setReason] = useState('')
  const refund = async () => { if (await run(() => api.post(`/orders/${orderId}/refund`, { reason: reason || null }), o?.total ? 'Refund completed (DEMO)' : 'Registration cancelled') !== undefined) { reload(true); onChanged?.() } }
  return <Modal open={!!orderId} title={o ? `Order ${o.code}` : 'Order'} onClose={onClose} wide>
    {loading || !o ? <Loading/> : <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Status value={o.status}/><span className="font-bold">{o.total === 0 ? 'Free' : money(o.total)}</span>{o.discount_total > 0 && <span className="text-xs text-emerald-700">promo {o.promo_code} −{money(o.discount_total)}</span>}{o.refunded_total > 0 && <span className="text-xs text-rose-600">refunded {money(o.refunded_total)}</span>}</div>
      <p className="text-slate-600">{o.buyer_name} · {o.buyer_email} · {fmtDateTime(o.created_at, undefined, locale)}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="table-head"><tr><th className="table-cell">Ticket</th><th className="table-cell">Attendee</th><th className="table-cell">Type</th><th className="table-cell">Status</th></tr></thead><tbody>{o.tickets?.map(t => <tr key={t.id} className="border-b border-slate-100"><td className="table-cell font-mono">{t.code}</td><td className="table-cell">{t.attendee.full_name}<br/><span className="text-slate-400">{t.attendee.email}</span></td><td className="table-cell">{t.ticket_type.name}</td><td className="table-cell"><Status value={t.status}/></td></tr>)}</tbody></table></div>
      {(o.payments?.length ?? 0) > 0 && <div><p className="flex items-center gap-2 font-bold">Payments <DemoBadge/></p>{o.payments!.map(p => <p key={p.id} className="mt-1 text-xs text-slate-600">{p.reference} · {p.method} · {money(p.amount)} · <Status value={p.status}/> {p.failure_reason && <span className="text-rose-600">{p.failure_reason}</span>}</p>)}</div>}
      {(o.status === 'completed' || o.status === 'partially_refunded') && <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4"><p className="font-bold text-rose-800">{o.total === 0 ? 'Cancel registration' : 'Issue refund (DEMO)'}</p><p className="mt-1 text-xs text-slate-600">All valid tickets on this order become invalid and inventory is released.</p><div className="mt-3 flex gap-2"><input className="field-input" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)}/><button disabled={busy} onClick={() => { if (window.confirm('Refund / cancel this order?')) refund() }} className="btn-danger">Confirm</button></div></div>}
    </div>}
  </Modal>
}

function EventSelect({ events, value, onChange, all = true }: { events: EventItem[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return <select aria-label="Event" className="field-input sm:w-72" value={value} onChange={e => onChange(e.target.value)}>{all && <option value="">All events</option>}{events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
}

function OrdersTab({ events }: { events: EventItem[] }) {
  const [eventId, setEventId] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Order>>('/organizers/me/orders', { event_id: eventId, status, q, page, page_size: 20 }), [eventId, status, q, page])
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap gap-2"><EventSelect events={events} value={eventId} onChange={v => { setEventId(v); setPage(1) }}/><select aria-label="Status" className="field-input sm:w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option>{['pending', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input className="field-input pl-9" placeholder="Order code, name or email" value={q} onChange={e => { setQ(e.target.value); setPage(1) }}/></div></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">No orders match.</p> : <><OrdersTable orders={data.items} onOpen={o => setOpen(o.id)}/><Pager page={page} pageSize={20} total={data.total} onPage={setPage}/></>}
    <OrderModal orderId={open} onClose={() => setOpen(null)} onChanged={() => reload(true)}/>
  </div>
}

// ------------------------------------------------------------------ attendees
function AttendeesTab({ events }: { events: EventItem[] }) {
  const { locale } = useI18n()
  const [eventId, setEventId] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<AttendeeRow>>('/organizers/me/attendees', { event_id: eventId, q, page, page_size: 50 }), [eventId, q, page])
  const exportCsv = async () => {
    const all = await api.get<Page<AttendeeRow>>('/organizers/me/attendees', { event_id: eventId, q, page: 1, page_size: 200 })
    const rows = [['Ticket', 'Name', 'Email', 'Ticket type', 'Event', 'Order', 'Status', 'Checked in at'], ...all.items.map(a => [a.code, a.attendee_name, a.attendee_email, a.ticket_type, a.event_title ?? '', a.order_code, a.status, a.checked_in_at ?? ''])]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'attendees.csv'; a.click()
  }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap gap-2"><EventSelect events={events} value={eventId} onChange={v => { setEventId(v); setPage(1) }}/><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input className="field-input pl-9" placeholder="Name, email or ticket code" value={q} onChange={e => { setQ(e.target.value); setPage(1) }}/></div><button onClick={exportCsv} className="btn-secondary"><Download size={15}/> CSV</button></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">No attendees yet.</p> : <>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="table-head"><tr>{['Attendee', 'Ticket', 'Type', 'Event', 'Status', 'Checked in'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data.items.map(a => <tr key={a.ticket_id} className="border-b border-slate-100"><td className="table-cell font-bold">{a.attendee_name}<br/><span className="font-normal text-slate-400">{a.attendee_email}</span></td><td className="table-cell font-mono">{a.code}</td><td className="table-cell">{a.ticket_type}</td><td className="table-cell">{a.event_title}</td><td className="table-cell"><Status value={a.status}/></td><td className="table-cell">{a.checked_in_at ? fmtDateTime(a.checked_in_at, undefined, locale) : '—'}</td></tr>)}</tbody></table></div>
      <Pager page={page} pageSize={50} total={data.total} onPage={setPage}/></>}
  </div>
}

// ------------------------------------------------------------------ refunds
function RefundsTab() {
  const { locale } = useI18n()
  const [status, setStatus] = useState('requested')
  const { data, error, loading, reload } = useAsync(() => api.get<Refund[]>('/organizers/me/refunds', { status }), [status])
  const { busy, run } = useAction()
  const decide = async (r: Refund, approve: boolean) => {
    const note = approve ? null : window.prompt('Reason for declining (shown to the attendee):') ?? null
    if (await run(() => api.post(`/refunds/${r.id}/decision`, { approve, note }), approve ? 'Refund completed (DEMO)' : 'Refund declined') !== undefined) reload(true)
  }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap gap-2">{['requested', 'completed', 'rejected', ''].map(s => <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === s ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s || 'All'}</button>)}</div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.length ? <p className="py-10 text-center text-sm text-slate-500">No refunds in this list.</p> :
      <div className="mt-4 space-y-2">{data.map(r => <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-bold">#{r.order_code} · {r.event_title} · {money(r.amount)} <DemoBadge/></p><p className="text-xs text-slate-500">{r.buyer_name} ({r.buyer_email}) · {fmtDateTime(r.created_at, undefined, locale)}{r.reason ? ` · “${r.reason}”` : ''}</p></div><Status value={r.status}/>{r.status === 'requested' && <><button disabled={busy} onClick={() => decide(r, true)} className="btn-primary px-3 py-2 text-xs">Approve</button><button disabled={busy} onClick={() => decide(r, false)} className="btn-danger px-3 py-2 text-xs">Decline</button></>}</div>)}</div>}
  </div>
}

// ------------------------------------------------------------------ campaigns
function CampaignsTab({ events }: { events: EventItem[] }) {
  const toast = useToast()
  const [eventId, setEventId] = useState(events[0]?.id ? String(events[0].id) : '')
  const event = events.find(e => String(e.id) === eventId)
  const { data, error, loading, reload } = useAsync(() => (eventId ? api.get<Campaign[]>(`/events/${eventId}/campaigns`) : Promise.resolve([])), [eventId])
  const { busy, run } = useAction()
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState<Campaign | null>(null)
  const empty = { name: '', description: '', code: '', discount_type: 'percent', discount_value: '10', max_redemptions: '', valid_until: '', ticket_type_ids: [] as number[] }
  const [form, setForm] = useState(empty)
  const [addPromo, setAddPromo] = useState<Campaign | null>(null)

  const promoPayload = () => ({ code: form.code, discount_type: form.discount_type, discount_value: Number(form.discount_value), max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null, valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null, ticket_type_ids: form.ticket_type_ids })
  const create = async () => {
    const body = { name: form.name, description: form.description || null, promo_codes: form.code ? [promoPayload()] : [] }
    if (await run(() => api.post(`/events/${eventId}/campaigns`, body), 'Campaign created') !== undefined) { setOpen(false); setForm(empty); reload(true) }
  }
  const createPromo = async () => { if (addPromo && await run(() => api.post(`/campaigns/${addPromo.id}/promo-codes`, promoPayload()), 'Promo code added') !== undefined) { setAddPromo(null); setForm(empty); reload(true) } }
  const copyLink = async (c: Campaign) => { const r = await api.get<{ url: string }>(`/campaigns/${c.id}/link`); try { await navigator.clipboard.writeText(r.url); toast('Campaign link copied') } catch { toast(r.url) } }

  if (!events.length) return <Empty title="Create an event first"/>
  const promoFields = <>
    <div className="grid gap-3 sm:grid-cols-3"><label className="field-label">Promo code<input className="field-input uppercase" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="SPRING20"/></label><label className="field-label">Type<select className="field-input" value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })}><option value="percent">Percentage %</option><option value="fixed">Fixed KZT</option></select></label><label className="field-label">Value<input type="number" min={1} className="field-input" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })}/></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Redemption limit (optional)<input type="number" min={1} className="field-input" value={form.max_redemptions} onChange={e => setForm({ ...form, max_redemptions: e.target.value })}/></label><label className="field-label">Expires (optional)<input type="datetime-local" className="field-input" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}/></label></div>
    <fieldset className="field-label"><legend className="mb-1">Restrict to ticket types (none = all paid types)</legend><div className="flex flex-wrap gap-2">{event?.ticket_types?.filter(t => t.price > 0).map(t => <label key={t.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 font-normal"><input type="checkbox" checked={form.ticket_type_ids.includes(t.id)} onChange={e => setForm({ ...form, ticket_type_ids: e.target.checked ? [...form.ticket_type_ids, t.id] : form.ticket_type_ids.filter(x => x !== t.id) })}/>{t.name}</label>)}</div></fieldset>
  </>
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2"><EventSelect events={events} value={eventId} onChange={setEventId} all={false}/><button onClick={() => { setForm(empty); setOpen(true) }} className="btn-primary"><Plus size={15}/> New campaign</button></div>
    <div className="mt-4">{loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.length ? <Empty title="No campaigns for this event" text="Create a campaign with a promo code and share its QR code."/> :
      <div className="space-y-3">{data.map(c => <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-extrabold">{c.name} <Status value={c.is_active ? 'active' : 'cancelled'} label={c.is_active ? 'active' : 'inactive'}/></p><p className="text-xs text-slate-500">{c.description ?? ''} · {c.visits} link/QR visits</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => setQr(c)} className="btn-secondary px-3 py-2 text-xs"><QrCode size={14}/> Campaign QR</button><button onClick={() => copyLink(c)} className="btn-secondary px-3 py-2 text-xs"><Copy size={14}/> Link</button><button onClick={() => { setForm(empty); setAddPromo(c) }} className="btn-secondary px-3 py-2 text-xs"><Plus size={14}/> Code</button><button disabled={busy} onClick={async () => { if (await run(() => api.patch(`/campaigns/${c.id}`, { is_active: !c.is_active }), c.is_active ? 'Campaign deactivated' : 'Campaign activated') !== undefined) reload(true) }} className="btn-secondary px-3 py-2 text-xs">{c.is_active ? 'Deactivate' : 'Activate'}</button></div></div>
        {c.promo_codes.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="table-head"><tr>{['Code', 'Discount', 'Used', 'Expires', 'Restricted to', 'Status', ''].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{c.promo_codes.map(p => <tr key={p.id} className="border-b border-slate-100"><td className="table-cell font-mono font-bold">{p.code}</td><td className="table-cell">{p.discount_type === 'percent' ? `${p.discount_value}%` : money(p.discount_value)}</td><td className="table-cell">{p.used}{p.max_redemptions ? ` / ${p.max_redemptions}` : ''}</td><td className="table-cell">{p.valid_until ? fmtDate(p.valid_until) : '—'}</td><td className="table-cell">{p.ticket_type_ids.length ? event?.ticket_types?.filter(t => p.ticket_type_ids.includes(t.id)).map(t => t.name).join(', ') : 'All paid'}</td><td className="table-cell"><Status value={p.is_active ? 'active' : 'cancelled'} label={p.is_active ? 'active' : 'inactive'}/></td><td className="table-cell"><button className="font-bold text-brand" onClick={async () => { if (await run(() => api.patch(`/promo-codes/${p.id}`, { is_active: !p.is_active })) !== undefined) reload(true) }}>{p.is_active ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody></table></div>}
      </div>)}</div>}</div>
    <Modal open={open} title="New campaign" onClose={() => setOpen(false)} wide><div className="space-y-3"><label className="field-label">Campaign name<input className="field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className="field-label">Description<input className="field-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>{promoFields}<div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy || form.name.length < 2} onClick={create} className="btn-primary">Create</button></div></div></Modal>
    <Modal open={!!addPromo} title={`Add promo code to ${addPromo?.name ?? ''}`} onClose={() => setAddPromo(null)} wide><div className="space-y-3">{promoFields}<div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setAddPromo(null)}>Cancel</button><button disabled={busy || form.code.length < 3} onClick={createPromo} className="btn-primary">Add code</button></div></div></Modal>
    <Modal open={!!qr} title="Campaign QR code" onClose={() => setQr(null)}>{qr && <div className="text-center"><img src={`/api/v1/campaigns/${qr.id}/qr.png`} alt="Campaign QR code" className="mx-auto h-64 w-64"/><p className="mt-3 text-sm text-slate-600">Opens the event page{qr.promo_codes.find(p => p.is_active) ? ` with promo ${qr.promo_codes.find(p => p.is_active)!.code} applied` : ''}.</p><p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Marketing QR only — it is <b>not</b> an admission ticket and is rejected by the check-in scanner.</p><a href={`/api/v1/campaigns/${qr.id}/qr.png`} download={`campaign-${qr.id}.png`} className="btn-secondary mt-4"><Download size={15}/> Download PNG</a></div>}</Modal>
  </div>
}

// ------------------------------------------------------------------ analytics
function AnalyticsTab({ events }: { events: EventItem[] }) {
  const [eventId, setEventId] = useState('')
  const { data: a, error, loading, reload } = useAsync(() => api.get<Analytics>(eventId ? `/analytics/events/${eventId}` : '/analytics/organizer'), [eventId])
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2"><EventSelect events={events} value={eventId} onChange={setEventId}/><button onClick={() => reload()} className="btn-secondary text-xs"><RotateCcw size={14}/> Refresh</button></div>
    <div className="mt-4">{loading ? <Loading/> : error || !a ? <ErrorState message={error ?? 'Failed'} onRetry={reload}/> : <>
      <MetricCards a={a}/>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[['Total capacity', a.total_capacity.toLocaleString()], ['Sold', a.tickets_sold], ['Remaining', a.tickets_remaining.toLocaleString()], ['Reserved (checkout)', a.tickets_reserved], ['% sold', `${a.percent_sold}%`], ['Refunded tickets', a.refunded_tickets]].map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-xl font-black">{v}</p></div>)}</div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Sales over time</h2><SalesBars data={a.sales_over_time}/>{a.sales_over_time.length > 0 && <div className="mt-4 max-h-56 overflow-y-auto text-xs"><table className="w-full"><thead className="table-head"><tr><th className="table-cell text-left">Date</th><th className="table-cell text-right">Orders</th><th className="table-cell text-right">Tickets</th><th className="table-cell text-right">Revenue</th></tr></thead><tbody>{[...a.sales_over_time].reverse().map(d => <tr key={d.date} className="border-b border-slate-100"><td className="table-cell">{d.date}</td><td className="table-cell text-right">{d.orders}</td><td className="table-cell text-right">{d.tickets}</td><td className="table-cell text-right">{money(d.revenue)}</td></tr>)}</tbody></table></div>}</div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Sales by ticket type</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="table-head"><tr>{['Ticket type', 'Price', 'Quantity', 'Sold', 'Reserved', 'Available', 'Refunded', 'Checked in', 'Revenue'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{a.sales_by_ticket_type.map(t => <tr key={t.ticket_type_id} className="border-b border-slate-100"><td className="table-cell font-bold">{t.name}{!eventId && <span className="block font-normal text-slate-400">{events.find(e => e.id === t.event_id)?.title}</span>}</td><td className="table-cell">{t.price ? money(t.price) : 'Free'}</td><td className="table-cell">{t.quantity_total}</td><td className="table-cell">{t.sold}</td><td className="table-cell">{t.reserved}</td><td className="table-cell">{t.available}</td><td className="table-cell">{t.refunded}</td><td className="table-cell">{t.checked_in}</td><td className="table-cell font-semibold">{money(t.revenue)}</td></tr>)}</tbody></table></div></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Campaign performance</h2>{a.campaigns.length ? <div className="mt-3 space-y-2 text-xs">{a.campaigns.map(c => <div key={c.campaign_id} className="rounded-xl border border-slate-100 p-3"><p className="font-bold">{c.name} {!c.is_active && <span className="text-slate-400">(inactive)</span>}</p><p className="mt-1 text-slate-600">{c.visits} visits · {c.orders} orders · {c.conversion_rate ?? '—'}% conversion · revenue {money(c.revenue)} · discounts {money(c.discounts)}</p><p className="mt-1 text-slate-400">{c.promo_codes.map(p => `${p.code}: ${p.redemptions}${p.max_redemptions ? `/${p.max_redemptions}` : ''}`).join(' · ')}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No campaigns.</p>}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Check-in statistics</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm">{[['Checked in', a.checkin.checked_in], ['Not yet checked in', a.checkin.not_checked_in], ['Check-in rate', `${a.checkin.checkin_rate}%`], ['Rejected scans', a.checkin.rejected_scans], ['Reversals', a.checkin.reversals]].map(([k, v]) => <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-black">{v}</p></div>)}</div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-500" style={{ width: `${a.checkin.checkin_rate}%` }}/></div></div>
      </div>
      <p className="mt-4 text-xs text-slate-400">All figures are calculated live from PostgreSQL. Revenue figures are DEMO amounts in KZT. Net revenue = gross − discounts − refunds.</p>
    </>}</div>
  </div>
}

// ------------------------------------------------------------------ check-in (web scanner)
type ScanResult = { valid: boolean; reason: string | null; message: string; ticket: AttendeeRow & { ticket_id: number; event_title: string } | null }

function CheckinTab() {
  const { locale } = useI18n()
  const toast = useToast()
  const { data: events, loading } = useAsync(() => api.get<(EventItem & { stats: { sold: number; checked_in: number; checkin_rate: number } })[]>('/checkin/events'), [])
  const [eventId, setEventId] = useState('')
  const [qr, setQr] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [q, setQ] = useState('')
  const { busy, run } = useAction()
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!eventId && events?.length) setEventId(String(events[0].id)) }, [events, eventId])
  const stats = useAsync(() => (eventId ? api.get<{ sold: number; checked_in: number; remaining: number; checkin_rate: number; recent: { id: number; action: string; reason: string | null; created_at: string }[] }>(`/checkin/events/${eventId}/stats`) : Promise.resolve(null)), [eventId])
  const people = useAsync(() => (eventId ? api.get<Page<AttendeeRow>>(`/checkin/events/${eventId}/attendees`, { q, page_size: 20 }) : Promise.resolve(null)), [eventId, q])

  const submit = async (mode: 'validate' | 'scan', payload = qr) => {
    if (!payload.trim()) return
    const r = await run(() => api.post<ScanResult>(`/checkin/${mode}`, { event_id: Number(eventId), qr: payload.trim(), device: 'web-dashboard' }))
    if (r) { setResult(r); if (mode === 'scan') { stats.reload(true); people.reload(true); if (r.valid) setQr('') } }
  }
  const decodeImage = async (file: File) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    await img.decode().catch(() => {})
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
    canvas.width = img.width * scale; canvas.height = img.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    URL.revokeObjectURL(img.src)
    if (!code) { toast('No QR code found in this image', 'error'); return }
    setQr(code.data)
    submit('scan', code.data)
  }
  const reverse = async (ticketId: number) => { const reason = window.prompt('Reason for reversing this check-in?') ?? ''; if (await run(() => api.post(`/checkin/tickets/${ticketId}/reverse`, { reason }), 'Check-in reversed') !== undefined) { stats.reload(true); people.reload(true) } }

  if (loading) return <Loading/>
  if (!events?.length) return <Empty title="No events to check in" text="Published events you own or are assigned to appear here."/>
  return <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className="field-label">Event<select className="field-input" value={eventId} onChange={e => { setEventId(e.target.value); setResult(null) }}>{events.map(e => <option key={e.id} value={e.id}>{e.title} · {fmtDate(e.starts_at, e.timezone, locale)}</option>)}</select></label>
        <label className="field-label mt-4">Ticket QR content<textarea className="field-input font-mono text-xs" rows={3} placeholder="Scan with a USB/phone scanner into this field, paste the QR text, or upload a photo" value={qr} onChange={e => setQr(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit('scan') } }}/></label>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !qr.trim()} onClick={() => submit('scan')} className="btn-primary"><ScanLine size={15}/> Check in</button><button disabled={busy || !qr.trim()} onClick={() => submit('validate')} className="btn-secondary">Validate only</button><button onClick={() => fileRef.current?.click()} className="btn-secondary"><Upload size={15}/> QR photo</button><input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) decodeImage(f); e.target.value = '' }}/></div>
        {result && <div className={`mt-4 rounded-2xl p-4 ${result.valid ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}><p className="flex items-center gap-2 text-lg font-black">{result.valid ? <CheckCircle2/> : <XCircle/>} {result.message}</p>{result.ticket && <p className="mt-1 text-sm">{result.ticket.attendee_name} · {result.ticket.ticket_type} · <span className="font-mono">{result.ticket.code}</span></p>}{result.reason && <p className="mt-1 text-xs font-bold uppercase tracking-wider opacity-70">{result.reason.replace(/_/g, ' ')}</p>}</div>}
      </div>
      {stats.data && <div className="grid grid-cols-3 gap-3">{[['Sold', stats.data.sold], ['Checked in', stats.data.checked_in], ['Rate', `${stats.data.checkin_rate}%`]].map(([k, v]) => <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-black">{v}</p></div>)}</div>}
      {stats.data && stats.data.recent.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs"><h3 className="font-extrabold">Recent scans</h3><div className="mt-2 space-y-1">{stats.data.recent.map(r => <p key={r.id} className="flex justify-between gap-2"><span><Status value={r.action === 'check_in' ? 'checked_in' : r.action === 'reversal' ? 'pending' : 'failed'} label={r.action.replace('_', ' ')}/> {r.reason?.replace(/_/g, ' ')}</span><span className="text-slate-400">{fmtDateTime(r.created_at, undefined, locale)}</span></p>)}</div></div>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-extrabold">Attendee search</h3>
      <div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input className="field-input pl-9" placeholder="Name, email or ticket code" value={q} onChange={e => setQ(e.target.value)}/></div>
      <div className="mt-3 space-y-2">{people.data?.items.map(a => <div key={a.ticket_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-xs"><div><p className="font-bold">{a.attendee_name}</p><p className="text-slate-400">{a.ticket_type} · <span className="font-mono">{a.code}</span></p></div><div className="flex items-center gap-2"><Status value={a.status}/>{a.status === 'checked_in' && <button onClick={() => reverse(a.ticket_id)} className="font-bold text-brand">Reverse</button>}</div></div>)}{people.data && !people.data.items.length && <p className="py-6 text-center text-sm text-slate-400">No attendees found.</p>}</div>
      <p className="mt-4 text-[11px] text-slate-400">The same endpoints (/api/v1/checkin/*) are ready for the separate React Native scanner app.</p>
    </div>
  </div>
}

// ------------------------------------------------------------------ settings: profile + paid sales activation
function SettingsTab({ profile, onChange }: { profile: Organizer; onChange: () => void }) {
  const { user } = useAuth()
  const { busy, run } = useAction()
  const toast = useToast()
  const [form, setForm] = useState({ name: profile.name, description: profile.description ?? '', logo_url: profile.logo_url ?? '', contact_email: profile.contact_email ?? '', contact_phone: profile.contact_phone ?? '', website: profile.website ?? '', city: profile.city ?? '' })
  const [payout, setPayout] = useState({ bank_name: profile.payout_bank_name ?? 'Demo Bank', account_holder: profile.payout_account_holder ?? profile.name, account_number: '' })
  const [terms, setTerms] = useState(!!profile.terms_accepted_at)
  const save = async () => { if (await run(() => api.patch('/organizers/me', { ...form, contact_email: form.contact_email || null, logo_url: form.logo_url || null, website: form.website || null }), 'Profile saved') !== undefined) onChange() }
  const upload = async (f: File) => { try { const r = await api.upload(f); setForm(x => ({ ...x, logo_url: r.url })); toast('Logo uploaded — remember to save') } catch (e) { toast(errorMessage(e), 'error') } }
  const steps = [
    { done: !!user?.email_verified, label: 'Verify your email address', hint: 'Use the link sent to your inbox (Mailpit on localhost:8025).' },
    { done: !!profile.payout_account_masked, label: 'Add a simulated payout account', hint: profile.payout_account_masked ? `${profile.payout_bank_name} ${profile.payout_account_masked}` : 'Demo data only — never enter a real account.' },
    { done: !!profile.activation_fee_paid, label: 'Confirm the activation fee (5 000 KZT, DEMO)', hint: profile.activation_fee_reference ?? 'Simulated payment, no money moves.' },
    { done: !!profile.terms_accepted_at, label: 'Accept organizer terms', hint: '' },
    { done: profile.paid_sales_status === 'active', label: 'Platform review', hint: profile.paid_sales_status === 'pending_review' ? 'Waiting for a BiletFlow admin to approve.' : profile.paid_sales_status === 'rejected' ? `Declined: ${profile.activation_review_note ?? ''}` : '' },
  ]
  return <div className="grid gap-5 xl:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-extrabold">Organizer profile</h2><div className="mt-4 space-y-3">
      <div className="flex items-center gap-3">{form.logo_url ? <img src={form.logo_url} alt="Logo" className="h-16 w-16 rounded-xl object-cover"/> : <span className="grid h-16 w-16 place-items-center rounded-xl bg-blue-50 text-2xl font-black text-brand">{form.name[0]}</span>}<label className="btn-secondary cursor-pointer text-xs"><Upload size={14}/> Upload logo<input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}/></label></div>
      <label className="field-label">Name<input className="field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label className="field-label">Description<textarea className="field-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Contact email<input type="email" className="field-input" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })}/></label><label className="field-label">Contact phone<input className="field-input" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })}/></label><label className="field-label">Website<input className="field-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}/></label><label className="field-label">City<input className="field-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}/></label></div>
      <div className="flex items-center justify-between"><Link to={`/organizers/${profile.id}`} className="text-xs font-bold text-brand">Public profile →</Link><button disabled={busy} onClick={save} className="btn-primary">Save profile</button></div>
    </div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-extrabold">Paid sales activation <DemoBadge/></h2><p className="mt-1 text-xs text-slate-500">Paid checkout stays disabled until every step is complete. Verification: <Status value={profile.verification_status}/> · Status: <Status value={profile.paid_sales_status}/></p>
      <ol className="mt-4 space-y-2">{steps.map((s, i) => <li key={s.label} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>{s.done ? '✓' : i + 1}</span><div><p className="font-bold">{s.label}</p>{s.hint && <p className="text-xs text-slate-500">{s.hint}</p>}</div></li>)}</ol>
      {profile.paid_sales_status !== 'active' && profile.paid_sales_status !== 'pending_review' && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <div className="grid gap-3 sm:grid-cols-3"><label className="field-label">Bank (demo)<input className="field-input" value={payout.bank_name} onChange={e => setPayout({ ...payout, bank_name: e.target.value })}/></label><label className="field-label">Account holder<input className="field-input" value={payout.account_holder} onChange={e => setPayout({ ...payout, account_holder: e.target.value })}/></label><label className="field-label">Demo account no.<input className="field-input" placeholder="KZ00DEMO0000000000" value={payout.account_number} onChange={e => setPayout({ ...payout, account_number: e.target.value })}/></label></div>
        <div className="flex flex-wrap gap-2"><button disabled={busy || payout.account_number.length < 6} onClick={async () => { if (await run(() => api.put('/organizers/me/payout', payout), 'Payout account saved (masked)') !== undefined) onChange() }} className="btn-secondary text-xs">Save payout account</button>{!profile.activation_fee_paid && <button disabled={busy} onClick={async () => { if (await run(() => api.post('/organizers/me/activation-fee'), 'Activation fee confirmed (DEMO)') !== undefined) onChange() }} className="btn-secondary text-xs">Pay activation fee (DEMO)</button>}</div>
        <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5"/>I accept the BiletFlow organizer terms (academic demo) and understand that payouts are simulated.</label>
        <button disabled={busy} onClick={async () => { if (await run(() => api.post('/organizers/me/activation', { accept_terms: terms }), 'Submitted for review') !== undefined) onChange() }} className="btn-primary w-full">Submit for activation</button>
      </div>}
    </div>
  </div>
}
