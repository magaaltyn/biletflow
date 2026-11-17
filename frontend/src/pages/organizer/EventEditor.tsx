import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Copy, Eye, History, Plus, Save, Send, Trash2, Upload, UserPlus, XCircle } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { EventItem, TicketType } from '../../lib/types'
import { fmtDateTime, fromLocalInput, money, toLocalInput } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { ErrorState, Loading, Modal, Status, useAction, useAsync, useToast } from '../../components/ui'

const CATEGORIES = ['Music', 'Conference', 'Sports', 'Theatre', 'Education', 'Exhibition', 'Festival', 'Business', 'Kids', 'Other']
const TIMEZONES = ['Asia/Almaty', 'Asia/Qostanay', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda', 'Europe/Moscow', 'UTC']
const CITIES = ['Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe', 'Taraz', 'Pavlodar', 'Oskemen', 'Semey', 'Atyrau', 'Kostanay', 'Kyzylorda', 'Aktau', 'Turkistan']

type TTForm = { id?: number; name: string; description: string; price: string; quantity_total: string; max_per_order: string; sales_start: string; sales_end: string; visibility: 'visible' | 'hidden'; is_active: boolean; quantity_sold?: number; quantity_reserved?: number; dirty?: boolean }
type Staff = { id: number; role: string; user: { id: number; full_name: string; email: string } }
type HistoryItem = { id: number; action: string; details: Record<string, unknown> | null; created_at: string; actor: { full_name: string; role: string } | null }

const emptyTT = (): TTForm => ({ name: '', description: '', price: '0', quantity_total: '100', max_per_order: '10', sales_start: '', sales_end: '', visibility: 'visible', is_active: true, dirty: true })

export default function EventEditor() {
  const { id } = useParams()
  const isNew = !id
  const nav = useNavigate()
  const toast = useToast()
  const { locale } = useI18n()
  const { busy, run } = useAction()
  const { data: event, error, loading, reload, setData } = useAsync(() => (isNew ? Promise.resolve(null) : api.get<EventItem>(`/events/${id}`)), [id])
  const [tz, setTz] = useState('Asia/Almaty')
  const [f, setF] = useState({ title: '', description: '', category: 'Music', image_url: '', venue_name: '', address: '', city: 'Almaty', starts_at: '', ends_at: '', capacity: '100', registration_opens_at: '', registration_closes_at: '', visibility: 'public' })
  const [tts, setTts] = useState<TTForm[]>([{ ...emptyTT(), name: 'General Admission' }])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [tab, setTab] = useState<'details' | 'staff' | 'history'>('details')

  useEffect(() => {
    if (!event) return
    const z = event.timezone
    setTz(z)
    setF({ title: event.title, description: event.description, category: event.category, image_url: event.image_url ?? '', venue_name: event.venue_name, address: event.address ?? '', city: event.city, starts_at: toLocalInput(event.starts_at, z), ends_at: toLocalInput(event.ends_at, z), capacity: String(event.capacity), registration_opens_at: toLocalInput(event.registration_opens_at, z), registration_closes_at: toLocalInput(event.registration_closes_at, z), visibility: event.visibility })
    setTts((event.ticket_types ?? []).map((t: TicketType) => ({ id: t.id, name: t.name, description: t.description ?? '', price: String(t.price), quantity_total: String(t.quantity_total ?? 0), max_per_order: String(t.max_per_order), sales_start: toLocalInput(t.sales_start, z), sales_end: toLocalInput(t.sales_end, z), visibility: t.visibility, is_active: t.is_active, quantity_sold: t.quantity_sold, quantity_reserved: t.quantity_reserved })))
  }, [event])

  if (error) return <ErrorState message={error} onRetry={reload}/>
  if (loading || (!isNew && !event)) return <Loading/>
  if (event && !event.can_manage) return <ErrorState message="You cannot manage this event."/>

  const eventBody = () => ({
    title: f.title, description: f.description, category: f.category, image_url: f.image_url || null, venue_name: f.venue_name, address: f.address || null, city: f.city,
    starts_at: fromLocalInput(f.starts_at, tz), ends_at: fromLocalInput(f.ends_at, tz), timezone: tz, capacity: Number(f.capacity),
    registration_opens_at: fromLocalInput(f.registration_opens_at, tz), registration_closes_at: fromLocalInput(f.registration_closes_at, tz), visibility: f.visibility,
  })
  const ttBody = (t: TTForm) => ({ name: t.name, description: t.description || null, price: Number(t.price || 0), quantity_total: Number(t.quantity_total || 0), max_per_order: Number(t.max_per_order || 1), sales_start: fromLocalInput(t.sales_start, tz), sales_end: fromLocalInput(t.sales_end, tz), visibility: t.visibility, is_active: t.is_active })

  const save = async () => {
    if (!f.starts_at || !f.ends_at) { toast('Start and end date are required', 'error'); return }
    if (isNew) {
      const created = await run(() => api.post<EventItem>('/events', { ...eventBody(), ticket_types: tts.map(ttBody) }), 'Draft saved')
      if (created) nav(`/organizer/events/${created.id}`, { replace: true })
      return
    }
    const ok = await run(async () => {
      for (const t of tts.filter(t => t.dirty)) {
        if (t.id) await api.patch(`/ticket-types/${t.id}`, ttBody(t))
      }
      const updated = await api.patch<EventItem>(`/events/${id}`, eventBody())
      for (const t of tts.filter(t => t.dirty && !t.id)) await api.post(`/events/${id}/ticket-types`, ttBody(t))
      return updated
    }, 'Changes saved')
    if (ok) reload(true)
  }
  const statusAction = async (path: string, msg: string, body?: unknown) => { const r = await run(() => api.post<EventItem | { event: EventItem }>(`/events/${id}/${path}`, body), msg); if (r) { reload(true); return r } }
  const removeTT = async (i: number) => {
    const t = tts[i]
    if (!t.id) { setTts(tts.filter((_, j) => j !== i)); return }
    if (!window.confirm(`Remove ticket type "${t.name}"? If it has orders it will be deactivated instead.`)) return
    const r = await run(() => api.del<{ message: string }>(`/ticket-types/${t.id}`))
    if (r) { toast(r.message); reload(true) }
  }
  const upload = async (file: File) => { try { const r = await api.upload(file); setF(x => ({ ...x, image_url: r.url })); toast('Image uploaded') } catch (e) { toast(errorMessage(e), 'error') } }
  const setTT = (i: number, patch: Partial<TTForm>) => setTts(list => list.map((t, j) => (j === i ? { ...t, ...patch, dirty: true } : t)))
  const totalQty = tts.filter(t => t.is_active).reduce((s, t) => s + Number(t.quantity_total || 0), 0)
  const locked = event?.status === 'cancelled'

  return <div className="mx-auto max-w-5xl">
    <Link to="/organizer?tab=Events" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> Organizer dashboard</Link>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-brand">{isNew ? 'New event' : `Event #${event!.id}`}</p><h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-black">{f.title || 'Untitled event'} {event && <Status value={event.status}/>}</h1>{event?.suspended_reason && <p className="mt-1 text-sm font-semibold text-rose-600">Suspended by admin: {event.suspended_reason}</p>}{event?.cancel_reason && <p className="mt-1 text-sm font-semibold text-rose-600">Cancelled: {event.cancel_reason}</p>}</div>
      <div className="flex flex-wrap gap-2">
        {!locked && <button disabled={busy} onClick={save} className="btn-secondary"><Save size={15}/> {isNew ? 'Save draft' : 'Save changes'}</button>}
        {event && <Link to={`/events/${event.id}${event.visibility === 'private' && event.access_key ? `?key=${event.access_key}` : ''}`} className="btn-secondary"><Eye size={15}/> Preview</Link>}
        {event?.status === 'draft' && <button disabled={busy} onClick={() => statusAction('publish', 'Event published — it is now live')} className="btn-primary"><Send size={15}/> Publish</button>}
        {event?.status === 'published' && <button disabled={busy} onClick={() => statusAction('unpublish', 'Event unpublished')} className="btn-secondary">Unpublish</button>}
        {event && event.is_owner !== false && <button disabled={busy} onClick={async () => { const r = await run(() => api.post<EventItem>(`/events/${event.id}/duplicate`), 'Duplicated as a new draft'); if (r) nav(`/organizer/events/${r.id}`) }} className="btn-secondary"><Copy size={15}/> Duplicate</button>}
        {event && !locked && <button onClick={() => setCancelOpen(true)} className="btn-danger"><XCircle size={15}/> Cancel event</button>}
        {event && <Link to={`/organizer?tab=Analytics`} className="btn-secondary"><BarChart3 size={15}/></Link>}
      </div></div>

    {event && <div className="mb-4 flex gap-2">{(['details', 'staff', 'history'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${tab === k ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{k === 'history' ? 'Event history' : k}</button>)}</div>}

    {tab === 'details' && <fieldset disabled={locked} className="space-y-5">
      <section className="card p-5 sm:p-6"><h2 className="font-extrabold">Basic information</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">Title *<input className="field-input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={200}/></label>
        <label className="field-label sm:col-span-2">Description *<textarea className="field-input" rows={5} value={f.description} onChange={e => setF({ ...f, description: e.target.value })}/></label>
        <label className="field-label">Category *<select className="field-input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field-label">Visibility<select className="field-input" value={f.visibility} onChange={e => setF({ ...f, visibility: e.target.value })}><option value="public">Public — listed in the catalog</option><option value="unlisted">Unlisted — anyone with the link</option><option value="private">Private — secret link only</option></select></label>
        <div className="sm:col-span-2"><p className="field-label">Event image</p><div className="mt-1.5 flex flex-wrap items-center gap-3">{f.image_url && <img src={f.image_url} alt="" className="h-20 w-32 rounded-xl object-cover"/>}<input className="field-input flex-1" placeholder="Image URL or upload →" value={f.image_url} onChange={e => setF({ ...f, image_url: e.target.value })}/><label className="btn-secondary cursor-pointer"><Upload size={15}/> Upload<input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) upload(file) }}/></label></div></div>
        {event?.visibility === 'private' && event.access_key && <p className="text-xs text-slate-500 sm:col-span-2">Private link: <code className="rounded bg-slate-100 px-1">{window.location.origin}/events/{event.id}?key={event.access_key}</code></p>}
      </div></section>

      <section className="card p-5 sm:p-6"><h2 className="font-extrabold">Venue & schedule</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="field-label">Venue *<input className="field-input" value={f.venue_name} onChange={e => setF({ ...f, venue_name: e.target.value })}/></label>
        <label className="field-label">City *<input list="kz-cities" className="field-input" value={f.city} onChange={e => setF({ ...f, city: e.target.value })}/><datalist id="kz-cities">{CITIES.map(c => <option key={c} value={c}/>)}</datalist></label>
        <label className="field-label sm:col-span-2">Address<input className="field-input" value={f.address} onChange={e => setF({ ...f, address: e.target.value })}/></label>
        <label className="field-label">Starts *<input type="datetime-local" className="field-input" value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })}/></label>
        <label className="field-label">Ends *<input type="datetime-local" className="field-input" value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })}/></label>
        <label className="field-label">Time zone<select className="field-input" value={tz} onChange={e => setTz(e.target.value)}>{TIMEZONES.map(z => <option key={z}>{z}</option>)}</select></label>
        <label className="field-label">Capacity *<input type="number" min={1} className="field-input" value={f.capacity} onChange={e => setF({ ...f, capacity: e.target.value })}/></label>
        <label className="field-label">Registration opens<input type="datetime-local" className="field-input" value={f.registration_opens_at} onChange={e => setF({ ...f, registration_opens_at: e.target.value })}/></label>
        <label className="field-label">Registration closes<input type="datetime-local" className="field-input" value={f.registration_closes_at} onChange={e => setF({ ...f, registration_closes_at: e.target.value })}/></label>
      </div></section>

      <section className="card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-extrabold">Ticket types</h2><p className="text-xs text-slate-500">Prices in KZT (0 = free). Total quantity {totalQty} / capacity {f.capacity}. {!event?.organizer.paid_sales_active && 'Paid tickets require paid-sales activation before publishing.'}</p></div><button type="button" onClick={() => setTts([...tts, emptyTT()])} className="btn-secondary text-xs"><Plus size={14}/> Add ticket type</button></div>
        <div className="mt-4 space-y-3">{tts.map((t, i) => <div key={t.id ?? `new-${i}`} className={`rounded-2xl border p-4 ${t.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-70'}`}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="field-label">Name<input className="field-input" value={t.name} onChange={e => setTT(i, { name: e.target.value })}/></label>
            <label className="field-label">Price (KZT)<input type="number" min={0} step="1" className="field-input" value={t.price} onChange={e => setTT(i, { price: e.target.value })} disabled={!!t.quantity_sold}/></label>
            <label className="field-label">Quantity<input type="number" min={0} className="field-input" value={t.quantity_total} onChange={e => setTT(i, { quantity_total: e.target.value })}/></label>
            <label className="field-label">Max / order<input type="number" min={1} className="field-input" value={t.max_per_order} onChange={e => setTT(i, { max_per_order: e.target.value })}/></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="field-label">Description<input className="field-input" value={t.description} onChange={e => setTT(i, { description: e.target.value })}/></label>
            <label className="field-label">Sales start<input type="datetime-local" className="field-input" value={t.sales_start} onChange={e => setTT(i, { sales_start: e.target.value })}/></label>
            <label className="field-label">Sales end<input type="datetime-local" className="field-input" value={t.sales_end} onChange={e => setTT(i, { sales_end: e.target.value })}/></label>
            <label className="field-label">Visibility<select className="field-input" value={t.visibility} onChange={e => setTT(i, { visibility: e.target.value as 'visible' | 'hidden' })}><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{t.id ? `Sold ${t.quantity_sold ?? 0} · reserved ${t.quantity_reserved ?? 0} · ${Number(t.price) > 0 ? money(Number(t.price)) : 'Free'}` : 'New — saved with the event'}{t.dirty && t.id ? ' · unsaved changes' : ''}</span><span className="flex items-center gap-3"><label className="flex items-center gap-1.5"><input type="checkbox" checked={t.is_active} onChange={e => setTT(i, { is_active: e.target.checked })}/> Active</label><button type="button" onClick={() => removeTT(i)} className="flex items-center gap-1 font-bold text-rose-600"><Trash2 size={13}/> Remove</button></span></div>
        </div>)}</div>
      </section>
      {!locked && <div className="flex justify-end"><button disabled={busy} onClick={save} className="btn-primary"><Save size={15}/> {isNew ? 'Save draft' : 'Save changes'}</button></div>}
    </fieldset>}

    {tab === 'staff' && event && <StaffPanel eventId={event.id}/>}
    {tab === 'history' && event && <HistoryPanel eventId={event.id} locale={locale}/>}

    <Modal open={cancelOpen} title="Cancel event" onClose={() => setCancelOpen(false)}>
      <p className="text-sm text-slate-600">All paid orders are refunded (DEMO), free registrations are cancelled, tickets become invalid and every attendee is notified. This cannot be undone.</p>
      <label className="field-label mt-4">Reason (shown to attendees)<textarea className="field-input" value={cancelReason} onChange={e => setCancelReason(e.target.value)}/></label>
      <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setCancelOpen(false)}>Keep event</button><button disabled={busy || cancelReason.trim().length < 3} className="btn-danger" onClick={async () => { const r = await statusAction('cancel', 'Event cancelled', { reason: cancelReason }) as { refunded_orders?: number } | undefined; if (r) setCancelOpen(false) }}>Cancel event</button></div>
    </Modal>
  </div>
}

function StaffPanel({ eventId }: { eventId: number }) {
  const { data, error, loading, reload } = useAsync(() => api.get<Staff[]>(`/events/${eventId}/staff`), [eventId])
  const { busy, run } = useAction()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('event_admin')
  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  return <div className="card p-5">
    <h2 className="font-extrabold">Event staff</h2><p className="mt-1 text-xs text-slate-500"><b>Event Admin</b>: manage this event, orders, refunds and check-in. <b>Check-in</b>: scan tickets only. The person must already have a BiletFlow account.</p>
    <div className="mt-4 flex flex-wrap gap-2"><input type="email" className="field-input flex-1" placeholder="colleague@example.com" value={email} onChange={e => setEmail(e.target.value)}/><select className="field-input w-40" value={role} onChange={e => setRole(e.target.value)}><option value="event_admin">Event Admin</option><option value="checkin">Check-in</option></select><button disabled={busy || !email.includes('@')} onClick={async () => { if (await run(() => api.post(`/events/${eventId}/staff`, { email, role }), 'Staff member added') !== undefined) { setEmail(''); reload(true) } }} className="btn-primary"><UserPlus size={15}/> Add</button></div>
    <div className="mt-4 space-y-2">{data?.length ? data.map(s => <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm"><span><b>{s.user.full_name}</b> · {s.user.email}</span><span className="flex items-center gap-3"><Status value="open" label={s.role.replace('_', ' ')}/><button className="text-xs font-bold text-rose-600" onClick={async () => { if (window.confirm('Remove this staff member?') && await run(() => api.del(`/events/${eventId}/staff/${s.id}`), 'Removed') !== undefined) reload(true) }}>Remove</button></span></div>) : <p className="text-sm text-slate-400">No staff assigned.</p>}</div>
  </div>
}

const ACTION_LABEL: Record<string, string> = {
  'event.created': 'Event created', 'event.updated': 'Event details changed', 'event.published': 'Event published', 'event.unpublished': 'Event unpublished', 'event.cancelled': 'Event cancelled', 'event.duplicated': 'Created as a duplicate', 'event.duplicated_to': 'Duplicated to a new event',
  'ticket_type.created': 'Ticket type added', 'ticket_type.updated': 'Ticket type changed', 'ticket_type.deleted': 'Ticket type deleted', 'ticket_type.deactivated': 'Ticket type deactivated', 'order.created': 'Order created', 'order.expired': 'Reservation expired', 'order.cancelled': 'Order cancelled',
  'payment.succeeded': 'Payment succeeded (DEMO)', 'payment.failed': 'Payment failed (DEMO)', 'payment.cancelled': 'Payment cancelled', 'tickets.issued': 'Tickets issued', 'refund.requested': 'Refund requested', 'refund.completed': 'Refund completed', 'refund.rejected': 'Refund declined', 'registration.cancelled': 'Registration cancelled',
  'campaign.created': 'Campaign created', 'campaign.updated': 'Campaign updated', 'campaign.activated': 'Campaign activated', 'campaign.deactivated': 'Campaign deactivated', 'promo.created': 'Promo code created', 'promo.updated': 'Promo code updated', 'ticket.checked_in': 'Ticket checked in', 'ticket.checkin_reversed': 'Check-in reversed',
  'staff.assigned': 'Staff assigned', 'staff.removed': 'Staff removed', 'admin.event_suspended': 'Suspended by platform admin', 'admin.event_unsuspended': 'Suspension lifted', 'support.case_created': 'Support case opened', 'support.status_changed': 'Support case status changed',
}

function HistoryPanel({ eventId, locale }: { eventId: number; locale: string }) {
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAsync(() => api.get<{ items: HistoryItem[]; total: number }>(`/events/${eventId}/history`, { page, page_size: 50 }), [eventId, page])
  if (loading) return <Loading/>
  if (error) return <ErrorState message={error} onRetry={reload}/>
  return <div className="card p-5"><h2 className="flex items-center gap-2 font-extrabold"><History size={17}/> Event history & activity timeline</h2>
    <ol className="mt-4 space-y-0 border-l-2 border-slate-100 pl-5">{data?.items.map(h => <li key={h.id} className="relative pb-4"><span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand"/><p className="text-sm font-bold">{ACTION_LABEL[h.action] ?? h.action}</p><p className="text-xs text-slate-500">{fmtDateTime(h.created_at, undefined, locale)} · {h.actor ? `${h.actor.full_name} (${h.actor.role.replace('_', ' ')})` : 'System'}</p>{h.details && Object.keys(h.details).length > 0 && <p className="mt-1 break-all text-[11px] text-slate-400">{Object.entries(h.details).filter(([k]) => k !== 'seeded').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}</p>}</li>)}</ol>
    {(data?.total ?? 0) > 50 && <div className="flex justify-between"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary text-xs">Newer</button><button disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage(page + 1)} className="btn-secondary text-xs">Older</button></div>}
  </div>
}
