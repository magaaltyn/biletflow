import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, CalendarPlus, MapPin, Minus, Pencil, Plus, Share2, ShieldCheck, Tag, Users } from 'lucide-react'
import { api } from '../lib/api'
import type { EventItem, TicketType } from '../lib/types'
import { fmtDate, fmtDateTime, fmtTime, money } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { ErrorState, ImageWithFallback, Loading, useAsync, useToast } from '../components/ui'

export const CART_KEY = 'biletflow.cart'
export type Cart = { eventId: number; items: { ticket_type_id: number; quantity: number }[]; promo?: string; campaignId?: number; key?: string }

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand">{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div></div>
}

function saleState(tt: TicketType): string | null {
  const now = Date.now()
  if (tt.sales_start && new Date(tt.sales_start).getTime() > now) return `Sales start ${new Date(tt.sales_start).toLocaleDateString()}`
  if (tt.sales_end && new Date(tt.sales_end).getTime() < now) return 'Sales ended'
  if (tt.sold_out) return 'Sold out'
  return null
}

export default function EventPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const key = params.get('key') ?? undefined
  const campaignId = params.get('campaign') ? Number(params.get('campaign')) : undefined
  const promo = params.get('promo') ?? undefined
  const { t, locale } = useI18n()
  const nav = useNavigate()
  const toast = useToast()
  const { data: event, error, loading, reload } = useAsync(() => api.get<EventItem>(`/events/${id}`, { key }), [id, key])
  const [qty, setQty] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!campaignId) return
    const flag = `biletflow.visit.${campaignId}`
    try { if (sessionStorage.getItem(flag)) return; sessionStorage.setItem(flag, '1') } catch { /* ignore */ }
    api.post(`/campaigns/${campaignId}/visit`).catch(() => {})
  }, [campaignId])

  useEffect(() => {
    if (!event?.ticket_types) return
    const first = event.ticket_types.find(tt => !saleState(tt))
    setQty(first ? { [first.id]: 1 } : {})
  }, [event])

  const tickets = event?.ticket_types ?? []
  const total = useMemo(() => tickets.reduce((s, tt) => s + (qty[tt.id] ?? 0) * tt.price, 0), [tickets, qty])
  const count = Object.values(qty).reduce((a, b) => a + b, 0)

  if (loading) return <Loading/>
  if (error || !event) return <ErrorState message={error ?? 'Event not found'} onRetry={reload}/>

  const closed = event.status !== 'published' || new Date(event.ends_at).getTime() < Date.now()
    || (event.registration_closes_at && new Date(event.registration_closes_at).getTime() < Date.now())
    || (event.registration_opens_at && new Date(event.registration_opens_at).getTime() > Date.now())
  const paidBlocked = tickets.some(tt => (qty[tt.id] ?? 0) > 0 && tt.price > 0) && !event.organizer.paid_sales_active

  const setTypeQty = (tt: TicketType, n: number) => setQty(q => ({ ...q, [tt.id]: Math.max(0, Math.min(n, tt.max_per_order, tt.available)) }))
  const select = (tt: TicketType) => { if (!saleState(tt) && !qty[tt.id]) setTypeQty(tt, 1) }

  const checkout = () => {
    const cart: Cart = { eventId: event.id, items: Object.entries(qty).filter(([, n]) => n > 0).map(([tid, n]) => ({ ticket_type_id: Number(tid), quantity: n })), promo, campaignId, key }
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* ignore */ }
    nav('/checkout', { state: cart })
  }
  const share = async () => {
    const url = window.location.origin + `/events/${event.id}` + (event.visibility === 'private' && event.access_key ? `?key=${event.access_key}` : '')
    try { await navigator.clipboard.writeText(url); toast('Event link copied to clipboard') } catch { toast(url) }
  }
  const banner = event.status === 'cancelled' ? `This event has been cancelled. ${event.cancel_reason ?? ''}`
    : event.status === 'suspended' ? 'This event is temporarily suspended by BiletFlow and is not accepting registrations.'
    : event.status === 'draft' ? 'Draft preview — only you can see this page until the event is published.'
    : event.registration_opens_at && new Date(event.registration_opens_at).getTime() > Date.now() ? `Registration opens ${fmtDateTime(event.registration_opens_at, event.timezone, locale)}.`
    : event.registration_closes_at && new Date(event.registration_closes_at).getTime() < Date.now() ? 'Registration for this event is closed.'
    : new Date(event.ends_at).getTime() < Date.now() ? 'This event has already taken place.' : null

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> {t('Back to events')}</Link>{event.can_manage && <Link to={`/organizer/events/${event.id}`} className="btn-secondary py-2 text-xs"><Pencil size={14}/> Manage event</Link>}</div>
    {banner && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0"/>{banner}</div>}
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-64 sm:h-[390px]"><ImageWithFallback src={event.image_url} alt={event.title} className="h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/10"/><span className="absolute left-5 top-5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">{event.category}</span><button aria-label="Share event" className="absolute right-5 top-5 rounded-xl bg-white/15 p-2.5 text-white backdrop-blur" onClick={share}><Share2 size={17}/></button><div className="absolute bottom-5 left-5 right-5 text-white"><p className="text-sm font-semibold text-blue-200">{event.city} · {event.category}</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{event.title}</h1></div></div>
        <div className="p-5 sm:p-7">
          <div className="grid gap-4 border-b border-slate-100 pb-6 sm:grid-cols-3"><InfoItem icon={<CalendarDays/>} label={t('Date & time')} value={`${fmtDate(event.starts_at, event.timezone, locale)} · ${fmtTime(event.starts_at, event.timezone)}–${fmtTime(event.ends_at, event.timezone)}`}/><InfoItem icon={<MapPin/>} label={t('Venue')} value={`${event.venue_name}, ${event.city}`}/><InfoItem icon={<Users/>} label={t('Capacity')} value={`${event.capacity.toLocaleString()} ${t('guests')}`}/></div>
          <h2 className="mt-6 text-lg font-extrabold">{t('About this event')}</h2>
          <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">{event.description}</p>
          {event.address && <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><MapPin size={15}/> {event.address}</p>}
          <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Time zone: {event.timezone}</span><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Kazakh / Russian</span><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Official ticketing</span></div>
          <Link to={`/organizers/${event.organizer.id}`} className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-100 p-4 hover:bg-slate-50">{event.organizer.logo_url ? <img src={event.organizer.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover"/> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 font-black text-brand">{event.organizer.name[0]}</span>}<div><p className="text-xs text-slate-500">{t('Organized by')}</p><p className="flex items-center gap-1 text-sm font-bold">{event.organizer.name}{event.organizer.verification_status === 'verified' && <BadgeCheck size={15} className="text-brand"/>}</p></div></Link>
          {event.visibility !== 'private' && event.status !== 'draft' && <a href={`/api/v1/events/${event.id}/calendar.ics`} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50"><CalendarPlus size={16}/> {t('Add to Calendar')}</a>}
        </div>
      </div>
      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{t('Select Tickets')}</h2>{closed ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{t('Not available')}</span> : event.sold_out ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-700">{t('Sold out')}</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">{t('On sale')}</span>}</div>
        {promo && <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><Tag size={13}/> Promo {promo} will be applied at checkout</p>}
        <div className="mt-5 space-y-3">{tickets.length === 0 && <p className="text-sm text-slate-500">No tickets configured yet.</p>}{tickets.map(o => {
          const state = saleState(o)
          const n = qty[o.id] ?? 0
          return <div key={o.id} role="button" tabIndex={0} onClick={() => select(o)} onKeyDown={e => e.key === 'Enter' && select(o)} className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition ${n > 0 ? 'border-brand bg-blue-50/70 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300'} ${state ? 'cursor-not-allowed opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{o.name}</p>{o.description && <p className="mt-1 text-xs leading-5 text-slate-500">{o.description}</p>}<p className="mt-1 text-[11px] font-semibold text-slate-400">{state ?? `${o.available} ${t('left')} · max ${o.max_per_order}/order`}</p></div><span className="whitespace-nowrap text-sm font-extrabold">{o.price === 0 ? t('Free') : money(o.price)}</span></div>
            {n > 0 && !closed && <div className="mt-3 flex items-center justify-between border-t border-blue-100 pt-3"><span className="text-xs font-semibold text-slate-600">{t('Quantity')}</span><div className="flex items-center gap-3"><button aria-label="Decrease quantity" onClick={e => { e.stopPropagation(); setTypeQty(o, n - 1) }} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white"><Minus size={13}/></button><span className="w-4 text-center text-sm font-bold">{n}</span><button aria-label="Increase quantity" onClick={e => { e.stopPropagation(); setTypeQty(o, n + 1) }} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white"><Plus size={13}/></button></div></div>}
          </div>
        })}</div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-sm text-slate-500"><span>{t('Subtotal')}</span><span className="font-bold text-ink">{money(total)}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-500"><span>{t('Service fee')}</span><span className="font-semibold text-ink">{total === 0 ? '0 KZT' : t('Included')}</span></div>
          <div className="mt-4 flex items-center justify-between"><span className="font-bold">{t('Total')}</span><span className="text-xl font-black text-brand">{money(total)}</span></div>
          {paidBlocked && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800">Paid ticket sales are not activated for this organizer yet.</p>}
          <button disabled={!!closed || count === 0 || paidBlocked} onClick={checkout} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{t('Continue to Checkout')} <ArrowRight size={16}/></button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck size={13}/> {t('Secure checkout · Demo payment')}</p>
        </div>
      </aside>
    </div>
  </div>
}
