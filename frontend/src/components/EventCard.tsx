import { useState } from 'react'
import { ArrowRight, Clock3, Heart, MapPin } from 'lucide-react'
import type { EventItem } from '../lib/types'
import { dayNum, fmtDate, fmtTime, money, monthShort } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { ImageWithFallback } from './ui'

const FAV_KEY = 'biletflow.favorites'
function readFavs(): number[] { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }

/** Original card design, now fed by API data. Favourites are a per-browser convenience (localStorage). */
export default function EventCard({ event, onOpen, index }: { event: EventItem; onOpen: () => void; index: number }) {
  const { t, locale } = useI18n()
  const [favorite, setFavorite] = useState(() => readFavs().includes(event.id))
  const toggle = () => {
    const next = favorite ? readFavs().filter(x => x !== event.id) : [...readFavs(), event.id]
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setFavorite(!favorite)
  }
  const isNew = index === 0 || (event.published_at && Date.now() - new Date(event.published_at).getTime() < 3 * 864e5)
  return <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-soft">
    <div className="relative h-48 overflow-hidden">
      <button onClick={onOpen} className="h-full w-full text-left" aria-label={event.title}><ImageWithFallback src={event.image_url} alt={event.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/><div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-slate-950/10"/></button>
      {event.sold_out ? <span className="absolute left-3 top-3 rounded-md bg-rose-500 px-2 py-1 text-[10px] font-extrabold uppercase text-white">{t('Sold out')}</span> : isNew && <span className="absolute left-3 top-3 rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-extrabold uppercase text-white">New</span>}
      <button aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={toggle} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-slate-950/30 text-white backdrop-blur hover:bg-slate-950/60"><Heart size={17} fill={favorite ? 'currentColor' : 'none'} className={favorite ? 'text-rose-400' : ''}/></button>
      <div className="absolute bottom-3 left-3 flex items-end gap-2"><div className="grid h-12 w-11 place-items-center rounded-lg bg-white text-ink shadow"><span className="text-[9px] font-extrabold text-rose-500">{monthShort(event.starts_at, event.timezone, locale)}</span><span className="text-xl font-black leading-5">{dayNum(event.starts_at, event.timezone)}</span></div><span className="mb-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">{event.category}</span></div>
    </div>
    <button onClick={onOpen} className="block w-full px-4 pb-4 pt-4 text-left">
      <h3 className="line-clamp-1 font-extrabold tracking-tight group-hover:text-brand">{event.title}</h3>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={13}/><span className="line-clamp-1">{event.venue_name}, {event.city}</span></div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={13}/><span>{fmtDate(event.starts_at, event.timezone, locale)} · {fmtTime(event.starts_at, event.timezone)}</span></div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs text-slate-500">{t('From')} <b className={!event.min_price ? 'text-emerald-600' : 'text-brand'}>{!event.min_price ? t('Free') : money(event.min_price)}</b></span><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-brand transition group-hover:bg-brand group-hover:text-white"><ArrowRight size={16}/></span></div>
    </button>
  </article>
}
