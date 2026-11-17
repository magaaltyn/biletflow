import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, ListFilter, Music2, Search, ShieldCheck, Ticket, Users, Zap } from 'lucide-react'
import { api } from '../lib/api'
import type { EventItem, Page } from '../lib/types'
import { dayNum, monthShort } from '../lib/format'
import { useI18n } from '../lib/i18n'
import EventCard from '../components/EventCard'
import { ErrorState, ImageWithFallback, Loading } from '../components/ui'

type Filters = { cities: string[]; categories: string[] }
type PublicStats = { events_published: number; tickets_issued: number; checkin_rate: number | null; organizers: number; users: number }

export default function Home() {
  const { t, locale } = useI18n()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>({ cities: [], categories: [] })
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [featured, setFeatured] = useState<EventItem | null>(null)

  const city = params.get('city') ?? ''
  const category = params.get('category') ?? ''
  const price = params.get('price') ?? ''
  const date = params.get('date') ?? ''
  const q = params.get('q') ?? ''

  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const clearAll = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }) }

  useEffect(() => {
    api.get<Filters>('/events/filters').then(setFilters).catch(() => {})
    api.get<PublicStats>('/stats/public').then(setStats).catch(() => {})
    api.get<Page<EventItem>>('/events', { page_size: 1 }).then(r => setFeatured(r.items[0] ?? null)).catch(() => {})
  }, [])

  // debounce the text search into the URL
  useEffect(() => { const id = window.setTimeout(() => { if (search !== q) setParam('q', search) }, 350); return () => window.clearTimeout(id) }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = (p: number) => {
    setLoading(true)
    setError(null)
    api.get<Page<EventItem>>('/events', { q, city, category, price, date, page: p, page_size: 12 })
      .then(r => { setEvents(old => (p === 1 ? r.items : [...old, ...r.items])); setTotal(r.total); setPage(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(1) }, [q, city, category, price, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToList = () => document.getElementById('events-list')?.scrollIntoView({ behavior: 'smooth' })
  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')

  return <>
    <section className="relative isolate overflow-hidden rounded-[28px] bg-[#081537] text-white shadow-soft">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_72%_25%,rgba(53,96,255,.35),transparent_35%),radial-gradient(circle_at_85%_95%,rgba(132,56,255,.28),transparent_30%)]"/>
      <div className="grid min-h-[370px] items-center gap-6 md:grid-cols-[.9fr_1.1fr] lg:min-h-[410px]">
        <div className="px-6 py-10 sm:px-10 lg:px-14"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200"><Zap size={13}/> {t('YOUR NEXT EXPERIENCE STARTS HERE')}</div><h1 className="max-w-xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[58px]">{t('Discover events.')}<br/>{t('Book tickets.')}<br/><span className="text-blue-400">{t('Be there.')}</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-slate-300 sm:text-base">{t('Your place for concerts, culture, sport and ideas across Kazakhstan.')}</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={scrollToList} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/30 hover:bg-blue-600"><Ticket size={17}/> {t('Browse Events')}</button><button onClick={() => nav('/organizer/events/new')} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"><Users size={16}/> {t('Create Event')}</button></div>{stats && <div className="mt-8 flex items-center gap-3 text-xs text-slate-300"><div className="flex -space-x-2">{['A', 'D', 'M', 'S'].map((n, i) => <span key={n} className={`grid h-7 w-7 place-items-center rounded-full border-2 border-[#081537] text-[10px] font-bold text-white ${['bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500'][i]}`}>{n}</span>)}</div><span><b className="text-white">{fmt(stats.users)}</b> {t('people find their moments here')}</span></div>}</div>
        <div className="relative hidden h-full min-h-[370px] p-5 md:block lg:p-8"><div className="absolute right-10 top-10 h-24 w-24 rounded-[28px] bg-blue-500/40 blur-2xl"/><ImageWithFallback className="h-full min-h-[330px] w-full rounded-[22px] object-cover" src={featured?.image_url ?? 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1100&q=85'} alt="Concert crowd under stage lights"/>{featured && <div className="absolute bottom-12 left-0 rounded-2xl border border-white/20 bg-slate-950/70 p-4 shadow-xl backdrop-blur-md lg:left-2"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-white text-center text-ink"><span className="text-[9px] font-bold text-rose-500">{monthShort(featured.starts_at, featured.timezone, locale)}</span><span className="text-xl font-black leading-5">{dayNum(featured.starts_at, featured.timezone)}</span></div><div><p className="font-bold">{featured.title}</p><p className="mt-1 text-xs text-slate-300">{featured.venue_name} · {featured.category}</p></div><button aria-label={`Open ${featured.title}`} onClick={() => nav(`/events/${featured.id}`)} className="ml-2 grid h-9 w-9 place-items-center rounded-full bg-brand"><ArrowUpRight size={18}/></button></div></div>}<div className="absolute right-12 top-14 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md"><Music2 size={22}/></div></div>
      </div>
    </section>

    <section className="relative z-10 -mt-5 px-3 sm:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.1fr_1fr_1fr_auto_auto] lg:items-end">
        <label className="field-label">{t('City')}<select value={city} onChange={e => setParam('city', e.target.value)} className="field-input"><option value="">{t('All cities')}</option>{filters.cities.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="field-label">{t('Category')}<select value={category} onChange={e => setParam('category', e.target.value)} className="field-input"><option value="">{t('All categories')}</option>{filters.categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="field-label">{t('Date')}<select value={date} onChange={e => setParam('date', e.target.value)} className="field-input"><option value="">{t('Any date')}</option><option value="today">{t('Today')}</option><option value="week">{t('This week')}</option><option value="weekend">{t('This weekend')}</option><option value="month">{t('This month')}</option></select></label>
        <label className="field-label">{t('Price')}<select value={price} onChange={e => setParam('price', e.target.value)} className="field-input"><option value="">{t('Any price')}</option><option value="free">{t('Free')}</option><option value="paid">{t('Paid')}</option></select></label>
        <button onClick={() => setShowFilters(!showFilters)} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ListFilter size={16}/> {t('More')}</button>
        <button onClick={scrollToList} className="h-10 rounded-xl bg-brand px-6 text-sm font-bold text-white hover:bg-blue-700">{t('Search')}</button>
      </div>
      <div className="relative mt-3 sm:hidden"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search events...')} className="field-input pl-9"/></div>
      {showFilters && <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{t('Quick filters:')}</span><button onClick={() => { const p = new URLSearchParams(params); p.set('price', 'free'); p.delete('category'); setParams(p) }} className="filter-chip">{t('Free events')}</button><button onClick={() => { const p = new URLSearchParams(params); p.set('category', 'Music'); p.delete('price'); setParams(p) }} className="filter-chip">{t('Live music')}</button><button onClick={() => { const p = new URLSearchParams(params); p.set('category', 'Sports'); p.delete('price'); setParams(p) }} className="filter-chip">{t('Sports')}</button><button onClick={() => setParam('date', 'weekend')} className="filter-chip">{t('This weekend')}</button><button onClick={clearAll} className="ml-auto text-brand">{t('Clear filters')}</button></div>}
    </div></section>

    <section id="events-list" className="scroll-mt-24 pt-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand">{t('Find your next moment')}</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('Popular Events')}</h2><p className="mt-1 text-sm text-slate-500">{t('Handpicked experiences happening around you.')}</p></div><div className="flex items-center gap-2"><div className="relative hidden sm:block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search events...')} className="h-10 w-52 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand"/></div><button onClick={clearAll} className="text-sm font-semibold text-brand hover:text-blue-700">{t('View all')} <ArrowRight className="ml-1 inline" size={15}/></button></div></div>
      {error ? <ErrorState message={error} onRetry={() => load(1)}/> : loading && page === 1 && events.length === 0 ? <Loading/> : events.length ? <>
        <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>{events.map((event, i) => <EventCard key={event.id} event={event} onOpen={() => nav(`/events/${event.id}`)} index={i}/>)}</div>
        {events.length < total && <div className="mt-6 text-center"><button disabled={loading} onClick={() => load(page + 1)} className="btn-secondary">{t('Load more')} ({events.length}/{total})</button></div>}
      </> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center"><Search className="mx-auto text-slate-300" size={32}/><h3 className="mt-3 font-bold">{t('No events found')}</h3><p className="mt-1 text-sm text-slate-500">{t('Try changing your search or filters.')}</p><button className="mt-4 text-sm font-bold text-brand" onClick={clearAll}>{t('Clear filters')}</button></div>}
    </section>

    <section id="how-it-works" className="mt-12 grid scroll-mt-24 gap-5 rounded-[26px] bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 sm:p-8 lg:grid-cols-[1.1fr_2fr] lg:items-center"><div><span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-brand">{t('FOR EVENT ORGANIZERS')}</span><h2 className="mt-3 text-2xl font-extrabold tracking-tight">{t('Your event. Your audience.')}<br/><span className="text-brand">{t('All in one place.')}</span></h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{t('Create an event, manage tickets, and track your audience with simple tools built for Kazakhstan.')}</p><button onClick={() => nav('/organizer')} className="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">{t('Get started for free')} <ArrowRight className="ml-2 inline" size={15}/></button></div><div className="grid gap-3 sm:grid-cols-3">{[{ icon: <Ticket/>, title: t('Free events'), text: t('Create and manage free events') }, { icon: <ShieldCheck/>, title: t('Secure sales'), text: t('Simulated checkout in KZT') }, { icon: <BarChart3/>, title: t('Useful analytics'), text: t('Track sales and attendance') }].map(item => <div key={item.title} className="rounded-2xl border border-white bg-white/90 p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand">{item.icon}</span><h3 className="mt-4 font-bold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p></div>)}</div></section>
    <section id="pricing" className="mt-6 grid scroll-mt-24 grid-cols-2 gap-3 sm:grid-cols-4">{[{ n: fmt(stats?.events_published), l: t('Events published'), icon: <CalendarDays/>, c: 'bg-blue-600' }, { n: fmt(stats?.tickets_issued), l: t('Tickets issued'), icon: <Ticket/>, c: 'bg-emerald-500' }, { n: stats?.checkin_rate != null ? `${stats.checkin_rate}%` : '—', l: t('Successful check-ins'), icon: <CheckCircle2/>, c: 'bg-amber-500' }, { n: fmt(stats?.organizers), l: t('Organizers'), icon: <Users/>, c: 'bg-violet-600' }].map(x => <div key={x.l} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${x.c}`}>{x.icon}</span><div><p className="text-xl font-black tracking-tight">{x.n}</p><p className="text-[11px] text-slate-500 sm:text-xs">{x.l}</p></div></div>)}</section>
    <p className="mt-3 text-center text-[11px] text-slate-400">Organizers pay no listing fee for free events. Paid ticket sales require a one-time simulated activation (5 000 KZT, DEMO) — no real payments are processed.</p>
  </>
}
