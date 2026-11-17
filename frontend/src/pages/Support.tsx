import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LifeBuoy, Plus, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Order, Page, SupportCase } from '../lib/types'
import { fmtDateTime } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { Empty, ErrorState, Loading, Modal, Status, useAction, useAsync } from '../components/ui'

export const CATEGORIES = ['tickets', 'payment', 'refund', 'event', 'account', 'organizer', 'other']
export const SUPPORT_STATUSES = ['open', 'in_progress', 'waiting_for_customer', 'resolved'] as const

export function CaseList({ scope, basePath = '/support' }: { scope: 'mine' | 'staff'; basePath?: string }) {
  const { locale } = useI18n()
  const [status, setStatus] = useState('')
  const { data, error, loading, reload } = useAsync(() => api.get<Page<SupportCase>>('/support/cases', { scope, status, page_size: 50 }), [scope, status])
  useEffect(() => { const id = window.setInterval(() => reload(true), 20000); return () => window.clearInterval(id) }, [reload])
  return <div>
    <div className="mb-3 flex flex-wrap gap-2">{['', ...SUPPORT_STATUSES].map(s => <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${status === s ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{s ? s.replace(/_/g, ' ') : 'All'}</button>)}</div>
    {loading ? <Loading/> : error ? <ErrorState message={error} onRetry={reload}/> : !data?.items.length ? <Empty title="No support cases" text={scope === 'mine' ? 'Create a case and our team will reply here.' : 'Nothing in the queue.'}/> :
      <div className="card divide-y divide-slate-100">{data.items.map(c => <Link key={c.id} to={`${basePath}/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50"><div className="min-w-0"><p className="font-bold">#{c.id} · {c.subject}</p><p className="mt-0.5 text-xs text-slate-500">{c.category}{c.event_title ? ` · ${c.event_title}` : ''}{scope === 'staff' ? ` · ${c.user.full_name} (${c.user.email})` : ''} · {c.message_count} messages · updated {fmtDateTime(c.updated_at, undefined, locale)}</p></div><Status value={c.status}/></Link>)}</div>}
  </div>
}

export default function Support() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [open, setOpen] = useState(!!params.get('order') || !!params.get('event'))
  const { busy, run } = useAction()
  const { data: orders } = useAsync(() => api.get<Page<Order>>('/orders', { page_size: 50 }), [])
  const [form, setForm] = useState({ subject: '', category: 'tickets', message: '', order_id: params.get('order') ?? '', event_id: params.get('event') ?? '' })
  const submit = async () => {
    const c = await run(() => api.post<SupportCase>('/support/cases', { subject: form.subject, category: form.category, message: form.message, order_id: form.order_id ? Number(form.order_id) : null, event_id: form.event_id ? Number(form.event_id) : null }), 'Support case created')
    if (c) nav(`/support/${c.id}`)
  }
  return <div className="mx-auto max-w-4xl">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-brand">{t('Help & Support')}</p><h1 className="mt-1 text-3xl font-black">{t('Support')}</h1><p className="mt-1 text-sm text-slate-500">Ask about tickets, payments, refunds or your account. Replies appear here and in your notifications.</p></div><button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16}/> New case</button></div>
    <CaseList scope="mine"/>
    <Modal open={open} title="New support case" onClose={() => setOpen(false)}>
      <div className="space-y-4">
        <label className="field-label">Subject<input className="field-input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} maxLength={200}/></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Category<select className="field-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="field-label">Related order (optional)<select className="field-input" value={form.order_id} onChange={e => setForm({ ...form, order_id: e.target.value })}><option value="">—</option>{orders?.items.map(o => <option key={o.id} value={o.id}>{o.code} · {o.event.title}</option>)}</select></label></div>
        <label className="field-label">Message<textarea className="field-input" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} maxLength={5000}/></label>
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)}>{t('Cancel')}</button><button disabled={busy || form.subject.trim().length < 3 || form.message.trim().length < 2} onClick={submit} className="btn-primary"><Send size={15}/> Send</button></div>
      </div>
    </Modal>
  </div>
}

/** Conversation view shared by attendees, organizer staff and platform admins (REST + polling). */
export function SupportCaseView({ backTo = '/support' }: { backTo?: string }) {
  const { id } = useParams()
  const { user } = useAuth()
  const { locale } = useI18n()
  const { data: c, error, loading, reload, setData } = useAsync(() => api.get<SupportCase>(`/support/cases/${id}`), [id])
  const [body, setBody] = useState('')
  const { busy, run } = useAction()
  useEffect(() => { const t = window.setInterval(() => reload(true), 10000); return () => window.clearInterval(t) }, [reload])
  if (loading) return <Loading/>
  if (error || !c) return <ErrorState message={error ?? 'Not found'} onRetry={reload}/>
  const staff = !!c.can_reply_as_staff && c.user.id !== user?.id
  const send = async () => { const r = await run(() => api.post<SupportCase>(`/support/cases/${c.id}/messages`, { body })); if (r) { setData(r); setBody('') } }
  const setStatus = async (status: string) => { const r = await run(() => api.patch<SupportCase>(`/support/cases/${c.id}/status`, { status }), 'Status updated'); if (r) setData(r) }
  return <div className="mx-auto max-w-3xl">
    <Link to={backTo} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft size={16}/> Support cases</Link>
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5"><div><p className="text-xs font-bold text-slate-400">Case #{c.id} · {c.category}{c.event_title ? ` · ${c.event_title}` : ''}</p><h1 className="mt-1 text-xl font-black">{c.subject}</h1><p className="mt-1 text-xs text-slate-500">Opened by {c.user.full_name} · {fmtDateTime(c.created_at, undefined, locale)}</p></div><div className="flex flex-col items-end gap-2"><Status value={c.status}/>{staff ? <select aria-label="Change status" className="field-input h-8 w-48 text-xs" value={c.status} onChange={e => setStatus(e.target.value)}>{SUPPORT_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select> : c.status === 'resolved' ? <button className="text-xs font-bold text-brand" onClick={() => setStatus('open')}>Reopen</button> : <button className="text-xs font-bold text-brand" onClick={() => setStatus('resolved')}>Mark as resolved</button>}</div></div>
      <div className="space-y-3 bg-slate-50/60 p-5">{c.messages?.map(m => m.kind === 'status_change' ? <p key={m.id} className="text-center text-[11px] text-slate-400">{m.body} · {m.author?.full_name} · {fmtDateTime(m.created_at, undefined, locale)}</p> :
        <div key={m.id} className={`flex ${m.author?.id === user?.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.author?.id === user?.id ? 'bg-brand text-white' : m.is_staff ? 'border border-blue-100 bg-white' : 'border border-slate-200 bg-white'}`}><p className={`text-[11px] font-bold ${m.author?.id === user?.id ? 'text-blue-100' : 'text-slate-500'}`}>{m.author?.full_name ?? 'System'}{m.is_staff && <span className="ml-1 rounded bg-blue-100 px-1 text-[9px] uppercase text-brand">staff</span>} · {fmtDateTime(m.created_at, undefined, locale)}</p><p className="mt-1 whitespace-pre-line">{m.body}</p></div></div>)}</div>
      <div className="flex gap-2 border-t border-slate-100 p-4"><textarea aria-label="Reply" className="field-input min-h-[48px]" placeholder="Write a reply…" value={body} onChange={e => setBody(e.target.value)} maxLength={5000}/><button disabled={busy || !body.trim()} onClick={send} className="btn-primary self-end"><Send size={15}/></button></div>
    </div>
    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><LifeBuoy size={13}/> This conversation refreshes automatically every 10 seconds.</p>
  </div>
}
