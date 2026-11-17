import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, MapPin, Search, ShieldCheck, Ticket, Users, ChevronDown, Sparkles } from 'lucide-react'
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

  useEffect(() => { const id = window.setTimeout(() => { if (search !== q) setParam('q', search) }, 350); return () => window.clearTimeout(id) }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = (p: number) => {
    setLoading(true); setError(null)
    api.get<Page<EventItem>>('/events', { q, city, category, price, date, page: p, page_size: 9 })
      .then(r => { setEvents(old => (p === 1 ? r.items : [...old, ...r.items])); setTotal(r.total); setPage(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(1) }, [q, city, category, price, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToList = () => document.getElementById('events-list')?.scrollIntoView({ behavior: 'smooth' })
  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US')

  return <>
    <section className="relative isolate -mx-4 -mt-5 overflow-hidden bg-[#24105f] text-white sm:-mx-6 lg:-mx-8">
      <ImageWithFallback src={featured?.image_url ?? 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1800&q=90'} alt="Live event audience" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35"/>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(178,24,128,.91)_0%,rgba(104,30,178,.88)_48%,rgba(48,25,151,.94)_100%)]"/>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(255,74,164,.48),transparent_36%),radial-gradient(circle_at_82%_28%,rgba(100,76,255,.45),transparent_38%)]"/>
      <div className="mx-auto grid min-h-[430px] max-w-[1240px] items-center gap-8 px-5 pb-16 pt-14 sm:px-8 md:grid-cols-[1.05fr_.95fr] lg:min-h-[500px] lg:px-10 lg:pb-20">
        <div className="relative z-10 py-4">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold tracking-wide text-white backdrop-blur"><Sparkles size={14}/> {t('YOUR NEXT EXPERIENCE STARTS HERE')}</div>
          <h1 className="max-w-2xl text-4xl font-black leading-[1.06] tracking-tight sm:text-5xl lg:text-[62px]">{t('Find your next')}<br/>{t('unforgettable event')}<br/><span className="text-[#ffb6e0]">{t('with BiletFlow.')}</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/85 sm:text-base">{t('Discover concerts, festivals, sports and experiences across Kazakhstan. Book your place in just a few clicks.')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={scrollToList} className="inline-flex items-center gap-2 rounded-full bg-[#f20b83] px-7 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-purple-950/30 transition hover:-translate-y-0.5 hover:bg-[#d90875]"><Ticket size={17}/> {t('Explore Events')}</button>
            <button onClick={() => nav('/organizer/events/new')} className="rounded-full border border-white/70 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/15">{t('Create an Event')}</button>
          </div>
          {stats && <div className="mt-8 flex items-center gap-3 text-xs text-white/80"><div className="flex -space-x-2">{['A','D','M','S'].map((n,i)=><span key={n} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-[#6820a4] text-[10px] font-bold text-white ${['bg-indigo-500','bg-emerald-500','bg-orange-500','bg-pink-500'][i]}`}>{n}</span>)}</div><span><b className="text-white">{fmt(stats.users)}</b> {t('people finding their next experience')}</span></div>}
        </div>
        <div className="relative hidden min-h-[350px] md:block">
          <div className="absolute right-8 top-2 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl"/>
          <div className="absolute left-4 top-7 h-[300px] w-[88%] rotate-[-3deg] rounded-[34px] border border-white/20 bg-white/10 shadow-2xl backdrop-blur-sm"/>
          <div className="absolute left-0 top-0 h-[330px] w-[90%] overflow-hidden rounded-[30px] border border-white/30 shadow-2xl">
            <ImageWithFallback src={featured?.image_url ?? 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1000&q=85'} alt="Concert stage and crowd" className="h-full w-full object-cover"/>
            <div className="absolute inset-0 bg-gradient-to-t from-[#180b43]/90 via-transparent to-black/10"/>
            {featured && <button onClick={() => nav(`/events/${featured.id}`)} className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#160b3c]/75 p-3 text-left backdrop-blur-lg">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[#32106f]"><span className="text-[9px] font-black text-[#ec1688]">{monthShort(featured.starts_at, featured.timezone, locale)}</span><span className="text-xl font-black leading-5">{dayNum(featured.starts_at, featured.timezone)}</span></div>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold">{featured.title}</span><span className="mt-1 block truncate text-xs text-white/70">{featured.venue_name} · {featured.city}</span></span><ArrowRight size={18}/>
            </button>}
          </div>
          <div className="absolute -right-1 bottom-2 rounded-2xl border border-white/20 bg-white/15 px-4 py-3 shadow-xl backdrop-blur-lg"><p className="text-[10px] font-bold uppercase tracking-widest text-white/70">{t('Made for moments')}</p><p className="mt-1 text-lg font-black">BiletFlow <span className="text-[#ffb6e0]">♡</span></p></div>
        </div>
      </div>
    </section>

    <section className="relative z-10 mx-auto -mt-9 max-w-[1120px] px-3 sm:px-6">
      <div className="grid gap-3 rounded-[22px] bg-white p-4 shadow-[0_18px_50px_rgba(42,19,100,.18)] sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end lg:p-5">
        <label className="field-label"><span className="text-[#3b246f]">{t('Search Event')}</span><span className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b7da9]" size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('What are you looking for?')} className="field-input pl-9"/></span></label>
        <label className="field-label"><span className="text-[#3b246f]">{t('City')}</span><span className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b7da9]" size={15}/><select value={city} onChange={e => setParam('city', e.target.value)} className="field-input pl-9"><option value="">{t('All cities')}</option>{filters.cities.map(c=><option key={c} value={c}>{c}</option>)}</select></span></label>
        <label className="field-label"><span className="text-[#3b246f]">{t('Category')}</span><select value={category} onChange={e => setParam('category', e.target.value)} className="field-input"><option value="">{t('All categories')}</option>{filters.categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label className="field-label"><span className="text-[#3b246f]">{t('Date')}</span><select value={date} onChange={e => setParam('date', e.target.value)} className="field-input"><option value="">{t('Any date')}</option><option value="today">{t('Today')}</option><option value="week">{t('This week')}</option><option value="weekend">{t('This weekend')}</option><option value="month">{t('This month')}</option></select></label>
        <button onClick={scrollToList} className="h-10 rounded-xl bg-[#ed1686] px-6 text-sm font-extrabold text-white shadow-lg shadow-pink-100 transition hover:bg-[#d80c76]"><Search className="mr-1 inline" size={15}/>{t('Search')}</button>
        <div className="sm:col-span-2 lg:col-span-5">{showFilters && <div className="flex flex-wrap gap-2 border-t border-purple-50 pt-3"><label className="field-label min-w-40">{t('Price')}<select value={price} onChange={e=>setParam('price',e.target.value)} className="field-input"><option value="">{t('Any price')}</option><option value="free">{t('Free')}</option><option value="paid">{t('Paid')}</option></select></label><button onClick={clearAll} className="self-end px-3 py-2 text-xs font-bold text-[#6b35bb]">{t('Clear filters')}</button></div>}</div>
        <button onClick={()=>setShowFilters(!showFilters)} className="absolute -bottom-8 right-6 hidden items-center gap-1 text-[11px] font-bold text-white/90 lg:flex">{showFilters ? t('Less filters') : t('More filters')} <ChevronDown size={13}/></button>
      </div>
    </section>

    <div className="mx-auto max-w-[1120px] px-1 sm:px-2">
      <section id="events-list" className="scroll-mt-24 pt-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a13bd0]">{t('Find your next moment')}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-[#2c205f] sm:text-[34px]">{t('Upcoming Events')}</h2><p className="mt-2 text-sm text-slate-500">{t('Discover what is happening around Kazakhstan.')}</p></div><div className="flex items-center gap-2"><button onClick={()=>setShowFilters(!showFilters)} className="rounded-full bg-[#f4f0ff] px-4 py-2.5 text-xs font-bold text-[#54318f] hover:bg-[#eae1ff]">{t('Filters')} <ChevronDown className="ml-1 inline" size={13}/></button><button onClick={clearAll} className="rounded-full border border-[#d9c9ff] px-4 py-2.5 text-xs font-bold text-[#6633c2] hover:bg-[#f8f4ff]">{t('View all')} <ArrowRight className="ml-1 inline" size={13}/></button></div></div>
        {error ? <ErrorState message={error} onRetry={()=>load(1)}/> : loading && page===1 && events.length===0 ? <Loading/> : events.length ? <>
          <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${loading?'opacity-60':''}`}>{events.map((event,i)=><EventCard key={event.id} event={event} onOpen={()=>nav(`/events/${event.id}`)} index={i}/>)}</div>
          {events.length<total && <div className="mt-9 text-center"><button disabled={loading} onClick={()=>load(page+1)} className="rounded-full border border-[#7544e8] px-8 py-3 text-xs font-extrabold text-[#6332c2] transition hover:bg-[#f5efff] disabled:opacity-50">{t('Load more')} ({events.length}/{total})</button></div>}
        </> : <div className="rounded-2xl border border-dashed border-purple-200 bg-white py-16 text-center"><Search className="mx-auto text-purple-200" size={32}/><h3 className="mt-3 font-bold text-[#30205f]">{t('No events found')}</h3><p className="mt-1 text-sm text-slate-500">{t('Try changing your search or filters.')}</p><button className="mt-4 text-sm font-bold text-[#7138cb]" onClick={clearAll}>{t('Clear filters')}</button></div>}
      </section>

      <section id="how-it-works" className="relative mt-16 grid scroll-mt-24 items-center gap-6 overflow-hidden rounded-[28px] bg-[#f0e4ff] px-6 py-8 sm:px-10 lg:grid-cols-[1fr_1.2fr] lg:py-10">
        <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full bg-[#d8b7ff]/50 blur-3xl"/>
        <div className="relative"><span className="inline-flex rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-[#7137c4]">{t('FOR EVENT ORGANIZERS')}</span><h2 className="mt-4 max-w-md text-3xl font-black leading-tight text-[#25164f]">{t('Make your event')}<br/><span className="text-[#8539c9]">{t('the one they remember.')}</span></h2><p className="mt-3 max-w-md text-sm leading-6 text-[#5c5072]">{t('Create an event, publish tickets, welcome your audience and follow your results — all in one place.')}</p><button onClick={()=>nav('/organizer/events/new')} className="mt-5 rounded-full bg-[#ed1686] px-7 py-3 text-xs font-extrabold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:bg-[#d80c76]">{t('Create your event')} <ArrowRight className="ml-2 inline" size={14}/></button></div>
        <div className="relative grid gap-3 sm:grid-cols-3">{[{icon:<Ticket/>,title:t('Publish tickets'),text:t('Offer free or paid ticket types.')},{icon:<ShieldCheck/>,title:t('Sell with confidence'),text:t('Use clear, secure demo checkout in KZT.')},{icon:<BarChart3/>,title:t('Track your event'),text:t('Follow sales, check-ins and attendance.')}].map(item=><div key={item.title} className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1e7ff] text-[#773ac5]">{item.icon}</span><h3 className="mt-4 text-sm font-extrabold text-[#30205f]">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p></div>)}</div>
      </section>

      <section id="pricing" className="mt-10 grid scroll-mt-24 grid-cols-2 gap-3 sm:grid-cols-4">{[{n:fmt(stats?.events_published),l:t('Events published'),icon:<CalendarDays/>,c:'bg-[#7540c8]'},{n:fmt(stats?.tickets_issued),l:t('Tickets issued'),icon:<Ticket/>,c:'bg-[#e72b91]'},{n:stats?.checkin_rate!=null?`${stats.checkin_rate}%`:'—',l:t('Successful check-ins'),icon:<CheckCircle2/>,c:'bg-[#13a982]'},{n:fmt(stats?.organizers),l:t('Organizers'),icon:<Users/>,c:'bg-[#5141bd]'}].map(x=><div key={x.l} className="flex items-center gap-3 rounded-2xl border border-[#eee8f8] bg-white p-4 shadow-sm sm:p-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${x.c}`}>{x.icon}</span><div><p className="text-xl font-black tracking-tight text-[#30205f]">{x.n}</p><p className="text-[11px] text-slate-500 sm:text-xs">{x.l}</p></div></div>)}</section>
      <p className="mt-4 text-center text-[11px] text-slate-400">{t('Free events have no listing fee. Paid ticket sales require a one-time event activation fee. Demo only — no real payments are processed.')}</p>
    </div>
  </>
}
