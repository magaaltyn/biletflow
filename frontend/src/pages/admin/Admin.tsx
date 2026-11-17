import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, BadgeCheck, CalendarDays, CreditCard, FileClock, LifeBuoy, Search, ShieldCheck, Ticket, Undo2, Users, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import type { EventItem, Order, Organizer, Page, Refund, User } from '../../lib/types'
import { fmtDateTime, money } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { DemoBadge, ErrorState, Loading, Modal, Pager, StatCard, Status, useAction, useAsync } from '../../components/ui'
import { CaseList } from '../Support'
import { OrderModal } from '../organizer/Dashboard'

const TABS: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <Activity size={15}/> }, { key: 'users', label: 'Users', icon: <Users size={15}/> },
  { key: 'activations', label: 'Organizers & activation', icon: <BadgeCheck size={15}/> }, { key: 'events', label: 'Event moderation', icon: <CalendarDays size={15}/> },
  { key: 'orders', label: 'Orders', icon: <Ticket size={15}/> }, { key: 'payments', label: 'Payments', icon: <CreditCard size={15}/> },
  { key: 'refunds', label: 'Refunds', icon: <Undo2 size={15}/> }, { key: 'support', label: 'Support', icon: <LifeBuoy size={15}/> },
  { key: 'audit', label: 'Audit log', icon: <FileClock size={15}/> },
]

type Stats = { users: number; users_by_role: Record<string, number>; organizers: number; events_by_status: Record<string, number>; orders_completed: number; tickets_by_status: Record<string, number>; gross_sales: number; discounts: number; refunds: number; net_revenue: number; payments_failed: number; pending_activations: number; pending_refunds: number; open_support_cases: number }

export default function Admin() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab')! : 'overview'
  return <div>
    <div className="mb-5"><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand"><ShieldCheck size={14}/> Platform administration</p><h1 className="mt-1 text-3xl font-black">Admin panel</h1></div>
    <div className="mb-5 flex flex-wrap gap-2">{TABS.map(t => <button key={t.key} onClick={() => setParams({ tab: t.key })} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.key ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{t.icon}{t.label}</button>)}</div>
    {tab === 'overview' && <Overview go={k => setParams({ tab: k })}/>}
    {tab === 'users' && <UsersTab/>}
    {tab === 'activations' && <OrganizersTab/>}
    {tab === 'events' && <EventsTab/>}
    {tab === 'orders' && <OrdersTab/>}
    {tab === 'payments' && <PaymentsTab/>}
    {tab === 'refunds' && <RefundsTab/>}
    {tab === 'support' && <div className="card p-5"><CaseList scope="staff"/></div>}
    {tab === 'audit' && <AuditTab/>}
  </div>
}

function Overview({ go }: { go: (k: string) => void }) {
  const { data: s, error, loading, reload } = useAsync(() => api.get<Stats>('/admin/stats'), [])
  if (loading) return <Loading/>
  if (error || !s) return <ErrorState message={error ?? 'Failed'} onRetry={reload}/>
  const box = (label: string, value: number, tab: string) => <button onClick={() => go(tab)} className={`rounded-2xl border p-4 text-left ${value ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-black">{value}</p></button>
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard name="Users" value={s.users} note={Object.entries(s.users_by_role).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')} icon={<Users/>}/><StatCard name="Gross sales (DEMO)" value={s.gross_sales} unit="KZT" note={`${s.orders_completed} completed orders`} icon={<Wallet/>} color="text-emerald-600" bg="bg-emerald-50"/><StatCard name="Net revenue (DEMO)" value={s.net_revenue} unit="KZT" note={`−${money(s.discounts)} discounts · −${money(s.refunds)} refunds`} icon={<Wallet/>} color="text-emerald-600" bg="bg-emerald-50"/><StatCard name="Tickets" value={Object.values(s.tickets_by_status).reduce((a, b) => a + b, 0)} note={Object.entries(s.tickets_by_status).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')} icon={<Ticket/>} color="text-violet-600" bg="bg-violet-50"/></div>
    <div className="grid gap-3 sm:grid-cols-4">{box('Pending paid-sales activations', s.pending_activations, 'activations')}{box('Pending refund requests', s.pending_refunds, 'refunds')}{box('Open support cases', s.open_support_cases, 'support')}{box('Failed demo payments', s.payments_failed, 'payments')}</div>
    <div className="card p-5"><h2 className="font-extrabold">Events by status</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(s.events_by_status).map(([k, v]) => <div key={k} className="rounded-xl bg-slate-50 p-3"><Status value={k}/><p className="mt-2 text-2xl font-black">{v}</p></div>)}</div><p className="mt-3 text-xs text-slate-400">{s.organizers} organizer profiles</p></div>
  </div>
}

function Search_({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15}/><input className="field-input pl-9" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}/></div>
}

function UsersTab() {
  const { locale } = useI18n()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<User>>('/admin/users', { q, role, page, page_size: 25 }), [q, role, page])
  const { busy, run } = useAction()
  const patch = async (u: User, body: Partial<User>) => { if (await run(() => api.patch(`/admin/users/${u.id}`, body), 'User updated') !== undefined) reload(true) }
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2"><Search_ value={q} onChange={v => { setQ(v); setPage(1) }} placeholder="Name or email"/><select className="field-input w-48" value={role} onChange={e => { setRole(e.target.value); setPage(1) }}><option value="">All roles</option>{['attendee', 'organizer', 'event_admin', 'platform_admin'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['User', 'Role', 'Email', 'Status', 'Joined', ''].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(u => <tr key={u.id} className="border-b border-slate-100"><td className="table-cell font-bold">{u.full_name}<br/><span className="font-normal text-slate-400">{u.email}</span></td><td className="table-cell"><select disabled={busy} className="field-input h-8 text-xs" value={u.role} onChange={e => patch(u, { role: e.target.value as User['role'] })}>{['attendee', 'organizer', 'event_admin', 'platform_admin'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></td><td className="table-cell">{u.email_verified ? 'verified' : 'unverified'}</td><td className="table-cell"><Status value={u.is_active ? 'active' : 'suspended'} label={u.is_active ? 'active' : 'deactivated'}/></td><td className="table-cell">{fmtDateTime(u.created_at, undefined, locale)}</td><td className="table-cell"><button disabled={busy} onClick={() => { if (window.confirm(`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.email}?`)) patch(u, { is_active: !u.is_active }) }} className={`font-bold ${u.is_active ? 'text-rose-600' : 'text-brand'}`}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div><Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/></>}
  </div>
}

function OrganizersTab() {
  const { locale } = useI18n()
  const [status, setStatus] = useState('pending_review')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Organizer>>('/admin/organizers', { status, page, page_size: 25 }), [status, page])
  const { busy, run } = useAction()
  const review = async (o: Organizer, approve: boolean) => {
    const note = approve ? null : window.prompt('Reason for declining:') ?? ''
    if (await run(() => api.post(`/admin/organizers/${o.id}/activation`, { approve, note }), approve ? 'Paid sales activated' : 'Activation declined') !== undefined) reload(true)
  }
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2">{[['pending_review', 'Pending review'], ['active', 'Active'], ['not_started', 'Not started'], ['rejected', 'Rejected'], ['', 'All']].map(([k, l]) => <button key={k} onClick={() => { setStatus(k); setPage(1) }} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === k ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{l}</button>)}</div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">Nothing here.</p> : <div className="mt-4 space-y-3">{data.items.map(o => <div key={o.id} className="rounded-2xl border border-slate-100 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold">{o.name} <span className="font-normal text-slate-400">· {o.city}</span></p><p className="text-xs text-slate-500">Owner: {o.owner?.full_name} ({o.owner?.email}) · {o.event_count} events</p></div><div className="flex items-center gap-2"><Status value={o.verification_status}/><Status value={o.paid_sales_status}/></div></div>
      <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2"><li>{o.owner?.email_verified ? '✅' : '⬜'} Email verified</li><li>{o.payout_account_masked ? '✅' : '⬜'} Payout (demo): {o.payout_bank_name} {o.payout_account_masked}</li><li>{o.activation_fee_paid ? '✅' : '⬜'} Activation fee <DemoBadge/> {o.activation_fee_reference}</li><li>{o.terms_accepted_at ? '✅' : '⬜'} Terms accepted {o.terms_accepted_at && fmtDateTime(o.terms_accepted_at, undefined, locale)}</li></ul>
      {o.paid_sales_status === 'pending_review' && <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => review(o, true)} className="btn-primary px-3 py-2 text-xs">Approve & verify</button><button disabled={busy} onClick={() => review(o, false)} className="btn-danger px-3 py-2 text-xs">Decline</button></div>}
    </div>)}</div>}
    <Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/>
  </div>
}

function EventsTab() {
  const { locale } = useI18n()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [suspend, setSuspend] = useState<EventItem | null>(null)
  const [reason, setReason] = useState('')
  const { data, error, loading, reload } = useAsync(() => api.get<Page<EventItem>>('/admin/events', { q, status, page, page_size: 25 }), [q, status, page])
  const { busy, run } = useAction()
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2"><Search_ value={q} onChange={v => { setQ(v); setPage(1) }} placeholder="Title or city"/><select className="field-input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option>{['draft', 'published', 'suspended', 'cancelled'].map(s => <option key={s}>{s}</option>)}</select></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['Event', 'Organizer', 'Date', 'Status', ''].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(e => <tr key={e.id} className="border-b border-slate-100"><td className="table-cell"><Link to={`/events/${e.id}`} className="font-bold hover:text-brand">{e.title}</Link><br/><span className="text-slate-400">{e.city} · {e.visibility}</span></td><td className="table-cell">{e.organizer.name}</td><td className="table-cell">{fmtDateTime(e.starts_at, e.timezone, locale)}</td><td className="table-cell"><Status value={e.status}/>{e.suspended_reason && <p className="mt-1 text-rose-600">{e.suspended_reason}</p>}</td><td className="table-cell">{e.status === 'suspended' ? <button disabled={busy} onClick={async () => { if (await run(() => api.post(`/admin/events/${e.id}/unsuspend`), 'Suspension lifted') !== undefined) reload(true) }} className="font-bold text-brand">Unsuspend</button> : e.status !== 'cancelled' && <button onClick={() => { setSuspend(e); setReason('') }} className="font-bold text-rose-600">Suspend</button>}</td></tr>)}</tbody></table></div><Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/></>}
    <Modal open={!!suspend} title={`Suspend “${suspend?.title}”`} onClose={() => setSuspend(null)}><p className="text-sm text-slate-600">The event disappears from the catalog and no new registrations or purchases are accepted. Existing tickets stay valid. The organizer is notified and the action is written to the audit log.</p><label className="field-label mt-4">Reason<textarea className="field-input" value={reason} onChange={e => setReason(e.target.value)}/></label><div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setSuspend(null)}>Cancel</button><button disabled={busy || reason.trim().length < 3} className="btn-danger" onClick={async () => { if (suspend && await run(() => api.post(`/admin/events/${suspend.id}/suspend`, { reason }), 'Event suspended') !== undefined) { setSuspend(null); reload(true) } }}>Suspend event</button></div></Modal>
  </div>
}

function OrdersTab() {
  const { locale } = useI18n()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Order>>('/admin/orders', { q, status, page, page_size: 25 }), [q, status, page])
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2"><Search_ value={q} onChange={v => { setQ(v); setPage(1) }} placeholder="Order code, buyer name or email"/><select className="field-input w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option>{['pending', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'].map(s => <option key={s}>{s}</option>)}</select></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['Order', 'Buyer', 'Event', 'Total', 'Status', 'Created'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(o => <tr key={o.id} onClick={() => setOpen(o.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"><td className="table-cell font-mono font-bold">{o.code}</td><td className="table-cell">{o.buyer_name}<br/><span className="text-slate-400">{o.buyer_email}</span></td><td className="table-cell">{o.event.title}</td><td className="table-cell">{o.total ? money(o.total) : 'Free'}</td><td className="table-cell"><Status value={o.status}/></td><td className="table-cell">{fmtDateTime(o.created_at, undefined, locale)}</td></tr>)}</tbody></table></div><Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/></>}
    <OrderModal orderId={open} onClose={() => setOpen(null)} onChanged={() => reload(true)}/>
  </div>
}

type PaymentRow = { id: number; purpose: string; order_code: string | null; method: string; amount: number; status: string; reference: string; failure_reason: string | null; is_demo: boolean; created_at: string }
function PaymentsTab() {
  const { locale } = useI18n()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<PaymentRow>>('/admin/payments', { status, page, page_size: 25 }), [status, page])
  return <div className="card p-5">
    <div className="flex flex-wrap items-center gap-2">{['', 'succeeded', 'failed', 'cancelled', 'pending'].map(s => <button key={s} onClick={() => { setStatus(s); setPage(1) }} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === s ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s || 'All'}</button>)}<span className="ml-auto text-xs text-slate-500">All records are simulated <DemoBadge/></span></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['Reference', 'Purpose', 'Order', 'Method', 'Amount', 'Status', 'Created'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(p => <tr key={p.id} className="border-b border-slate-100"><td className="table-cell font-mono">{p.reference}</td><td className="table-cell">{p.purpose.replace('_', ' ')}</td><td className="table-cell font-mono">{p.order_code ?? '—'}</td><td className="table-cell">{p.method}</td><td className="table-cell">{money(p.amount)}</td><td className="table-cell"><Status value={p.status}/>{p.failure_reason && <p className="text-rose-600">{p.failure_reason}</p>}</td><td className="table-cell">{fmtDateTime(p.created_at, undefined, locale)}</td></tr>)}</tbody></table></div><Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/></>}
  </div>
}

function RefundsTab() {
  const { locale } = useI18n()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<Refund>>('/admin/refunds', { status, page, page_size: 25 }), [status, page])
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2">{['', 'requested', 'completed', 'rejected'].map(s => <button key={s} onClick={() => { setStatus(s); setPage(1) }} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === s ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s || 'All'}</button>)}</div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['Order', 'Event', 'Buyer', 'Amount', 'Status', 'Requested', 'Processed'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(r => <tr key={r.id} className="border-b border-slate-100"><td className="table-cell font-mono">{r.order_code}</td><td className="table-cell">{r.event_title}</td><td className="table-cell">{r.buyer_email}</td><td className="table-cell">{money(r.amount)}</td><td className="table-cell"><Status value={r.status}/></td><td className="table-cell">{fmtDateTime(r.created_at, undefined, locale)}</td><td className="table-cell">{r.processed_at ? fmtDateTime(r.processed_at, undefined, locale) : '—'}</td></tr>)}</tbody></table></div><Pager page={page} pageSize={25} total={data?.total ?? 0} onPage={setPage}/></>}
    <p className="mt-3 text-xs text-slate-400">Refund decisions are made by the event organizer; this view is for monitoring.</p>
  </div>
}

type AuditRow = { id: number; action: string; entity_type: string; entity_id: number | null; event_id: number | null; details: Record<string, unknown> | null; created_at: string; actor: { email: string; full_name: string } | null }
function AuditTab() {
  const { locale } = useI18n()
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<Page<AuditRow>>('/admin/audit-logs', { action, page, page_size: 50 }), [action, page])
  return <div className="card p-5">
    <div className="flex flex-wrap gap-2"><Search_ value={action} onChange={v => { setAction(v); setPage(1) }} placeholder="Filter by action, e.g. suspend, payment, refund"/></div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="table-head"><tr>{['Time', 'Actor', 'Action', 'Entity', 'Details'].map(x => <th key={x} className="table-cell font-semibold">{x}</th>)}</tr></thead><tbody>{data?.items.map(a => <tr key={a.id} className="border-b border-slate-100 align-top"><td className="table-cell whitespace-nowrap">{fmtDateTime(a.created_at, undefined, locale)}</td><td className="table-cell">{a.actor ? `${a.actor.full_name}` : 'System'}<br/><span className="text-slate-400">{a.actor?.email}</span></td><td className="table-cell font-mono font-bold">{a.action}</td><td className="table-cell">{a.entity_type} #{a.entity_id}{a.event_id ? ` · event ${a.event_id}` : ''}</td><td className="table-cell max-w-xs break-all text-slate-500">{a.details ? JSON.stringify(a.details) : ''}</td></tr>)}</tbody></table></div><Pager page={page} pageSize={50} total={data?.total ?? 0} onPage={setPage}/></>}
  </div>
}
