import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, CheckCircle2, Download, LifeBuoy, Ticket, TicketCheck, XCircle } from 'lucide-react'
import { api, download, errorMessage } from '../lib/api'
import type { TicketOut } from '../lib/types'
import { dayNum, fmtTime, monthShort, year } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { ErrorState, Loading, useAsync, useToast } from '../components/ui'

/** The original "Your ticket" screen, now showing a real, server-signed QR code. */
export default function TicketPage() {
  const { id } = useParams()
  const { t, locale } = useI18n()
  const toast = useToast()
  const { data: tk, error, loading, reload } = useAsync(() => api.get<TicketOut>(`/tickets/${id}`), [id])
  if (loading) return <Loading/>
  if (error || !tk) return <ErrorState message={error ?? 'Ticket not found'} onRetry={reload}/>
  const ev = tk.event
  const ok = tk.status === 'valid' || tk.status === 'checked_in'
  const pdf = () => download(`/tickets/${tk.id}/pdf`, `biletflow-ticket-${tk.code}.pdf`).catch(e => toast(errorMessage(e), 'error'))
  return <div className="mx-auto max-w-4xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className={`text-xs font-bold uppercase tracking-widest ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>{t(tk.status)}</p><h1 className="mt-1 text-3xl font-black">{t('Your ticket')}</h1><p className="mt-1 text-sm text-slate-500">{t('Keep this ticket ready to show at the entrance.')}</p></div><Link to="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50"><ArrowLeft className="mr-1 inline" size={15}/> {t('Browse events')}</Link></div>
    <div className="grid gap-5 md:grid-cols-[1fr_280px]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#102a9d] via-[#174cf5] to-[#622cf0] p-6 text-white sm:p-8"><div className="absolute -right-10 -top-20 h-56 w-56 rounded-full border-[35px] border-white/10"/><div className="relative flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-extrabold"><TicketCheck size={19}/> BiletFlow</span><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">{ev.category}</span></div><h2 className="relative mt-8 max-w-sm text-3xl font-black leading-tight sm:text-4xl">{ev.title}</h2><div className="relative mt-6 flex items-end gap-5"><div><p className="text-xs font-semibold text-blue-200">{t('DATE')}</p><p className="mt-1 text-3xl font-black">{dayNum(ev.starts_at, ev.timezone)}</p><p className="text-xs font-bold">{monthShort(ev.starts_at, ev.timezone, locale)} {year(ev.starts_at, ev.timezone)}</p></div><div className="mb-1 h-12 w-px bg-white/25"/><div><p className="font-bold">{ev.venue_name}</p><p className="mt-1 text-xs text-blue-100">{ev.city}, Kazakhstan</p><p className="mt-1 text-xs text-blue-100">{fmtTime(ev.starts_at, ev.timezone)}–{fmtTime(ev.ends_at, ev.timezone)}</p></div></div></div>
        <div className="grid gap-5 p-6 sm:grid-cols-[1fr_200px] sm:p-8">
          <div>
            <p className="text-[10px] text-slate-400">{t('ATTENDEE')}</p><p className="mt-1 font-bold">{tk.attendee.full_name}</p><p className="text-xs text-slate-500">{tk.attendee.email}</p>
            <p className="mt-5 text-[10px] text-slate-400">{t('TICKET TYPE')}</p><p className="mt-1 font-bold">{tk.ticket_type.name}</p>
            <p className="mt-5 text-[10px] text-slate-400">{t('TICKET ID')}</p><p className="mt-1 font-mono text-sm font-bold">{tk.code}</p><p className="text-xs text-slate-400">Order {tk.order_code}</p>
            <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${tk.status === 'valid' ? 'bg-emerald-50 text-emerald-700' : tk.status === 'checked_in' ? 'bg-violet-50 text-violet-700' : 'bg-rose-50 text-rose-700'}`}>{ok ? <CheckCircle2 size={14}/> : <XCircle size={14}/>} {t(tk.status)}{tk.checked_in_at ? ` · ${new Date(tk.checked_in_at).toLocaleString(locale)}` : ''}</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white p-3">{tk.qr_image && ok ? <img src={tk.qr_image} alt={`QR code for ticket ${tk.code}`} className={`h-[180px] w-[180px] ${tk.status === 'checked_in' ? 'opacity-40' : ''}`}/> : <div className="grid h-[180px] w-[180px] place-items-center rounded-xl bg-slate-100 text-center text-xs font-bold text-slate-500">QR not available<br/>({t(tk.status)})</div>}<p className="mt-2 text-[10px] font-bold text-slate-500">{t('SCAN AT ENTRANCE')}</p><p className="mt-1 text-center text-[9px] text-slate-400">Signed QR · validated by the server</p></div>
        </div>
      </section>
      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold">{t('Ticket actions')}</h2><div className="mt-4 space-y-2"><button onClick={pdf} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50"><Download size={16}/> {t('Download PDF')}</button><a href={`/api/v1/events/${ev.id}/calendar.ics`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50"><CalendarPlus size={16}/> {t('Add to Calendar')}</a><Link to={`/account/orders/${tk.order_id}`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50"><Ticket size={16}/> {t('View order')}</Link><Link to={`/support?order=${tk.order_id}`} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold hover:bg-slate-50"><LifeBuoy size={16}/> {t('Support')}</Link></div><div className="mt-5 rounded-xl bg-blue-50 p-4"><h3 className="text-sm font-bold text-blue-900">{t('Important')}</h3><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-blue-800"><li>{t('Keep your ticket ready at the entrance.')}</li><li>{t('Each ticket can be scanned only once.')}</li><li>Do not share the QR code — anyone holding it can enter.</li></ul></div></aside>
    </div>
  </div>
}
