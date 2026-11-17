import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, ShieldCheck, Tag, X, XCircle } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { EventItem, Order } from '../lib/types'
import { fmtDate, fmtTime, money } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { DemoBadge, ErrorState, ImageWithFallback, Loading, useAsync, useToast } from '../components/ui'
import { CART_KEY, type Cart } from './EventPage'

type Quote = { items: { ticket_type_id: number; name: string; quantity: number; unit_price: number; discount: number; line_total: number }[]; subtotal: number; discount_total: number; total: number; promo_code: string | null }

const METHODS = [
  { id: 'kaspi_demo', n: 'Kaspi Pay', d: 'Simulated payment flow', icon: '₸' },
  { id: 'card_demo', n: 'Visa / Mastercard', d: 'Sandbox card payment — no card data is collected', icon: '▤' },
  { id: 'other_demo', n: 'Other cards', d: 'Simulated provider', icon: '＋' },
]

function readCart(state: unknown): Cart | null {
  if (state && typeof state === 'object' && 'eventId' in state) return state as Cart
  try { const raw = sessionStorage.getItem(CART_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

export default function Checkout() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const cart = useMemo(() => readCart(loc.state), [loc.state])
  const { data: event, error, loading } = useAsync(() => (cart ? api.get<EventItem>(`/events/${cart.eventId}`, { key: cart.key }) : Promise.reject(new Error('Your cart is empty. Choose tickets on an event page first.'))), [cart?.eventId])
  const [name, setName] = useState(user?.full_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [attendees, setAttendees] = useState<Record<string, { full_name: string; email: string }>>({})
  const [promoInput, setPromoInput] = useState(cart?.promo ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('kaspi_demo')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchQuote = async (code: string) => {
    if (!cart) return
    try {
      const q = await api.post<Quote>('/orders/quote', { event_id: cart.eventId, items: cart.items, promo_code: code || null })
      setQuote(q)
      setPromoError(null)
    } catch (e) {
      setPromoError(errorMessage(e))
      if (code) { const q = await api.post<Quote>('/orders/quote', { event_id: cart.eventId, items: cart.items }).catch(() => null); if (q) setQuote(q) }
    }
  }
  useEffect(() => { fetchQuote(cart?.promo ?? '') }, [cart?.eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading/>
  if (error || !event || !cart) return <div className="mx-auto max-w-xl"><ErrorState message={error ?? 'Your cart is empty.'}/><div className="mt-4 text-center"><Link to="/" className="btn-secondary">{t('Browse events')}</Link></div></div>

  const total = quote?.total ?? 0
  const isFree = (quote?.subtotal ?? 0) === 0
  const slots = (quote?.items ?? []).flatMap(it => Array.from({ length: it.quantity }, (_, i) => ({ key: `${it.ticket_type_id}-${i}`, ticket_type_id: it.ticket_type_id, label: `${it.name} #${i + 1}` })))

  const submit = async () => {
    setBusy(true)
    try {
      const order = await api.post<Order>('/orders', {
        event_id: cart.eventId, items: cart.items, buyer_name: name, buyer_email: email, promo_code: quote?.promo_code ?? null,
        campaign_id: cart.campaignId ?? null, access_key: cart.key ?? null,
        attendees: slots.map(s => ({ ticket_type_id: s.ticket_type_id, full_name: attendees[s.key]?.full_name?.trim() || name, email: attendees[s.key]?.email?.trim() || email })),
      })
      try { sessionStorage.removeItem(CART_KEY) } catch { /* ignore */ }
      if (order.status === 'completed') { toast(isFree ? 'Registration confirmed — your tickets are ready!' : 'Order confirmed'); nav(`/account/orders/${order.id}?new=1`) }
      else nav(`/checkout/${order.id}`, { state: { method: paymentMethod } })
    } catch (e) { toast(errorMessage(e), 'error') } finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-5xl">
    <button onClick={() => nav(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> {t('Back')}</button>
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-brand">{t('Almost there')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('Checkout')}</h1><p className="mt-2 text-sm text-slate-500">{t('Review your order and complete the demo payment.')}</p></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div><h2 className="text-lg font-extrabold">{t('Attendee details')}</h2><p className="mt-1 text-sm text-slate-500">{t('Your ticket will be associated with these details.')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="field-label">{t('Full name')}<input value={name} onChange={e => setName(e.target.value)} className="field-input" placeholder="Your full name" autoComplete="name"/></label><label className="field-label">{t('Email address')}<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="field-input" placeholder="you@example.com" autoComplete="email"/></label></div>
          {slots.length > 1 && <details className="mt-4 rounded-xl border border-slate-100 p-4"><summary className="cursor-pointer text-sm font-bold">Different names per ticket (optional)</summary><div className="mt-3 space-y-3">{slots.map(s => <div key={s.key} className="grid gap-2 sm:grid-cols-[120px_1fr_1fr] sm:items-center"><span className="text-xs font-semibold text-slate-500">{s.label}</span><input className="field-input" placeholder={name || 'Full name'} value={attendees[s.key]?.full_name ?? ''} onChange={e => setAttendees(a => ({ ...a, [s.key]: { ...a[s.key], full_name: e.target.value, email: a[s.key]?.email ?? '' } }))}/><input className="field-input" type="email" placeholder={email || 'Email'} value={attendees[s.key]?.email ?? ''} onChange={e => setAttendees(a => ({ ...a, [s.key]: { full_name: a[s.key]?.full_name ?? '', email: e.target.value } }))}/></div>)}</div></details>}
        </div>
        {!isFree && <div className="border-t border-slate-100 pt-5"><h2 className="text-lg font-extrabold">{t('Promo code')}</h2><div className="mt-3 flex gap-2"><input value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())} className="field-input" placeholder="e.g. ALMATY20"/><button onClick={() => fetchQuote(promoInput.trim())} className="btn-secondary">{t('Apply')}</button>{quote?.promo_code && <button aria-label="Remove promo code" onClick={() => { setPromoInput(''); fetchQuote('') }} className="btn-secondary px-3"><X size={15}/></button>}</div>{promoError && <p className="mt-2 text-xs font-semibold text-rose-600">{promoError}</p>}{quote?.promo_code && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><Tag size={13}/> {quote.promo_code} applied: −{money(quote.discount_total)} (validated by the server)</p>}</div>}
        {!isFree && total > 0 && <div className="border-t border-slate-100 pt-5"><h2 className="flex items-center gap-2 text-lg font-extrabold">{t('Payment method')} <DemoBadge/></h2><p className="mt-1 text-sm text-slate-500">{t('Demo only — no real payment will be taken.')}</p><div className="mt-4 space-y-2">{METHODS.map(p => <button key={p.id} onClick={() => setPaymentMethod(p.id)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${paymentMethod === p.id ? 'border-brand bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'}`}><span className={`grid h-10 w-10 place-items-center rounded-lg text-lg font-black ${paymentMethod === p.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}>{p.icon}</span><span className="flex-1"><span className="block text-sm font-bold">{p.n}</span><span className="mt-0.5 block text-xs text-slate-500">{p.d}</span></span><span className={`grid h-5 w-5 place-items-center rounded-full border ${paymentMethod === p.id ? 'border-brand bg-brand text-white' : 'border-slate-300'}`}>{paymentMethod === p.id && <Check size={12}/>}</span></button>)}</div></div>}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 accent-blue-600"/>{t('I agree to the event terms and understand this is a demonstration payment, not a real financial transaction.')}</label>
        <button disabled={busy || !quote || name.trim().length < 2 || !email.includes('@') || !terms} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-sm font-extrabold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"><ShieldCheck size={17}/> {busy ? t('Loading…') : total === 0 ? t('Register for free') : `${t('Pay')} ${money(total)}`} <ArrowRight size={16}/></button>
      </section>
      <aside className="h-fit overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="h-36"><ImageWithFallback src={event.image_url} alt={event.title} className="h-full w-full object-cover"/></div><div className="p-5"><p className="text-xs font-bold uppercase tracking-widest text-brand">{t('Order summary')}</p><h2 className="mt-2 text-lg font-extrabold">{event.title}</h2><p className="mt-1 text-xs text-slate-500">{fmtDate(event.starts_at, event.timezone, locale)} · {fmtTime(event.starts_at, event.timezone)}</p><p className="mt-1 text-xs text-slate-500">{event.venue_name}, {event.city}</p>
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">{quote?.items.map(it => <div key={it.ticket_type_id} className="flex justify-between gap-3"><span className="text-slate-500">{it.name} × {it.quantity}</span><span className="text-right font-semibold">{it.unit_price === 0 ? t('Free') : money(it.unit_price * it.quantity)}</span></div>)}
          {quote && quote.discount_total > 0 && <div className="flex justify-between text-emerald-700"><span>{t('Discount')} ({quote.promo_code})</span><span className="font-semibold">−{money(quote.discount_total)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">{t('Service fee')}</span><span className="font-semibold">{t('Included')}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-4"><span className="font-bold">{t('Total')}</span><span className="text-xl font-black text-brand">{money(total)}</span></div></div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-800"><ShieldCheck className="mr-1 inline" size={13}/> {t('Demo transaction only. No real money is charged.')}</p></div></aside>
    </div>
  </div>
}

/** Step 2 for paid orders: simulated payment gateway with success / failure / cancel outcomes. */
export function PayOrder() {
  const { orderId } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const toast = useToast()
  const { t, locale } = useI18n()
  const { data: order, error, loading, reload, setData } = useAsync(() => api.get<Order>(`/orders/${orderId}`), [orderId])
  const [method, setMethod] = useState<string>((loc.state as { method?: string } | null)?.method ?? 'kaspi_demo')
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [lastFail, setLastFail] = useState<string | null>(null)
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  useEffect(() => { if (order?.status === 'completed') nav(`/account/orders/${order.id}?new=1`, { replace: true }) }, [order, nav])

  if (loading) return <Loading/>
  if (error || !order) return <ErrorState message={error ?? 'Order not found'} onRetry={reload}/>

  const remaining = order.reserved_until ? Math.max(0, Math.floor((new Date(order.reserved_until).getTime() - now) / 1000)) : 0
  const pay = async (outcome: 'success' | 'fail' | 'cancel') => {
    setBusy(outcome)
    try {
      const r = await api.post<{ payment: { status: string; failure_reason: string | null; reference: string }; order: Order }>('/payments/demo', { order_id: order.id, outcome, method })
      setData(r.order)
      if (outcome === 'success') toast(`DEMO payment ${r.payment.reference} succeeded — tickets issued`)
      else if (outcome === 'fail') { setLastFail(r.payment.failure_reason); toast('DEMO payment failed. You can try again.', 'error') }
      else toast('Payment cancelled. Reserved tickets were released.')
    } catch (e) { toast(errorMessage(e), 'error'); reload(true) } finally { setBusy(null) }
  }

  return <div className="mx-auto max-w-3xl">
    <Link to={`/events/${order.event.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> {order.event.title}</Link>
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#081537] p-6 text-white"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-200">Payment gateway <DemoBadge/></p><h1 className="mt-1 text-2xl font-black">Order {order.code}</h1><p className="mt-1 text-sm text-slate-300">{order.event.title} · {fmtDate(order.event.starts_at, order.event.timezone, locale)}</p></div><div className="text-right"><p className="text-xs text-slate-300">{t('Total')}</p><p className="text-3xl font-black">{money(order.total)}</p></div></div>
      <div className="p-6">
        {order.status === 'pending' ? <>
          <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><Clock3 size={16}/> Tickets are reserved for you for <b>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</b>. Unpaid reservations are released automatically.</div>
          {lastFail && <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><XCircle size={16}/> {lastFail}</div>}
          <div className="mt-5 space-y-2 text-sm">{order.items?.map(i => <div key={i.id} className="flex justify-between"><span className="text-slate-500">{i.name} × {i.quantity}</span><span className="font-semibold">{money(i.unit_price * i.quantity)}</span></div>)}{order.discount_total > 0 && <div className="flex justify-between text-emerald-700"><span>Promo {order.promo_code}</span><span>−{money(order.discount_total)}</span></div>}</div>
          <label className="field-label mt-5">{t('Payment method')}<select className="field-input" value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m.id} value={m.id}>{m.n} (DEMO)</option>)}</select></label>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">This is a simulated payment provider for the academic MVP. No card details are requested or stored, and no money moves. Choose the outcome you want to demonstrate:</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button disabled={!!busy || remaining === 0} onClick={() => pay('success')} className="btn-primary bg-emerald-600 py-3.5 hover:bg-emerald-700"><CheckCircle2 size={17}/> {busy === 'success' ? '…' : `${t('Pay')} ${money(order.total)}`}</button>
            <button disabled={!!busy || remaining === 0} onClick={() => pay('fail')} className="btn-danger py-3.5"><XCircle size={17}/> {busy === 'fail' ? '…' : 'Simulate failure'}</button>
            <button disabled={!!busy} onClick={() => pay('cancel')} className="btn-secondary py-3.5"><X size={17}/> {busy === 'cancel' ? '…' : 'Cancel payment'}</button>
          </div>
          {remaining === 0 && <p className="mt-3 text-sm font-semibold text-rose-600">The reservation has expired. <button className="underline" onClick={() => reload()}>Refresh</button></p>}
        </> : <div className="text-center"><p className="text-sm text-slate-500">This order is <b>{t(order.status)}</b>.</p><div className="mt-4 flex justify-center gap-2"><Link to={`/events/${order.event.id}`} className="btn-primary">Choose tickets again</Link><Link to="/account" className="btn-secondary">{t('My orders')}</Link></div></div>}
      </div>
    </div>
  </div>
}
