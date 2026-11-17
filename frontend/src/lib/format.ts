export const money = (n: number | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString('en-US').replace(/,/g, ' ')} KZT`
export const priceLabel = (n: number | null | undefined, freeLabel = 'Free') => (!n ? freeLabel : money(n))

const TZ_FALLBACK = 'Asia/Almaty'

function parts(iso: string, tz = TZ_FALLBACK, locale = 'en-GB') {
  const d = new Date(iso)
  const opt = (o: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat(locale, { timeZone: tz, ...o }).format(d) } catch { return new Intl.DateTimeFormat(locale, o).format(d) }
  }
  return { d, opt }
}

/** "24 May 2026" in the event's time zone */
export const fmtDate = (iso: string, tz?: string, locale?: string) => parts(iso, tz, locale).opt({ day: 'numeric', month: 'short', year: 'numeric' })
export const fmtTime = (iso: string, tz?: string, locale?: string) => parts(iso, tz, locale).opt({ hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtDateTime = (iso: string | null | undefined, tz?: string, locale?: string) => (iso ? `${fmtDate(iso, tz, locale)} · ${fmtTime(iso, tz, locale)}` : '—')
export const dayNum = (iso: string, tz?: string) => parts(iso, tz).opt({ day: '2-digit' })
export const monthShort = (iso: string, tz?: string, locale?: string) => parts(iso, tz, locale).opt({ month: 'short' }).replace('.', '').toUpperCase()
export const year = (iso: string, tz?: string) => parts(iso, tz).opt({ year: 'numeric' })

/** Convert ISO (UTC) -> value for <input type="datetime-local"> in the given zone. */
export function toLocalInput(iso: string | null | undefined, tz = TZ_FALLBACK): string {
  if (!iso) return ''
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

/** Offset (minutes) of a time zone at a given instant. */
function tzOffset(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(at).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** Convert a datetime-local value interpreted in `tz` to an ISO string with offset. */
export function fromLocalInput(value: string, tz = TZ_FALLBACK): string | null {
  if (!value) return null
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const offset = tzOffset(tz, guess)
  return new Date(guess.getTime() - offset * 60000).toISOString()
}

export const STATUS_STYLE: Record<string, string> = {
  valid: 'bg-emerald-50 text-emerald-700', completed: 'bg-emerald-50 text-emerald-700', published: 'bg-emerald-50 text-emerald-700', succeeded: 'bg-emerald-50 text-emerald-700', active: 'bg-emerald-50 text-emerald-700', verified: 'bg-emerald-50 text-emerald-700', resolved: 'bg-emerald-50 text-emerald-700',
  checked_in: 'bg-violet-50 text-violet-700', in_progress: 'bg-blue-50 text-blue-700', open: 'bg-blue-50 text-blue-700', requested: 'bg-amber-50 text-amber-700', pending: 'bg-amber-50 text-amber-700', pending_review: 'bg-amber-50 text-amber-700', waiting_for_customer: 'bg-amber-50 text-amber-700', draft: 'bg-slate-100 text-slate-600', not_started: 'bg-slate-100 text-slate-600', unverified: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-rose-50 text-rose-700', refunded: 'bg-rose-50 text-rose-700', partially_refunded: 'bg-rose-50 text-rose-700', failed: 'bg-rose-50 text-rose-700', expired: 'bg-slate-100 text-slate-500', suspended: 'bg-rose-100 text-rose-800', rejected: 'bg-rose-50 text-rose-700',
}
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
