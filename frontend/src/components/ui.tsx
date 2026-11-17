import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { STATUS_STYLE, humanize } from '../lib/format'
import { useI18n } from '../lib/i18n'

// ------------------------------------------------------------------ toast (same look as the original "flash" notice)
type Toast = { id: number; msg: string; kind: 'success' | 'error' }
const ToastContext = createContext<(msg: string, kind?: 'success' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-2), { id, msg, kind }])
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 5000 : 3200)
  }, [])
  return <ToastContext.Provider value={push}>
    {children}
    <div className="fixed right-4 top-20 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map(n => <div key={n.id} role="status" className={`flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-xl ${n.kind === 'error' ? 'border-rose-100' : 'border-blue-100'}`}>
        {n.kind === 'error' ? <AlertTriangle className="shrink-0 text-rose-500" size={18}/> : <CheckCircle2 className="shrink-0 text-emerald-500" size={18}/>}
        <span className="flex-1">{n.msg}</span>
        <button aria-label="Dismiss" onClick={() => setToasts(t => t.filter(x => x.id !== n.id))} className="ml-2 text-slate-400"><X size={15}/></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}
export const useToast = () => useContext(ToastContext)

// ------------------------------------------------------------------ data loading hook
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const run = useCallback(async (silent = false) => {
    const id = ++seq.current
    if (!silent) setLoading(true)
    setError(null)
    try { const r = await fn(); if (id === seq.current) setData(r) } catch (e) { if (id === seq.current) setError(errorMessage(e)) } finally { if (id === seq.current) setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  // When the inputs change, report "loading" immediately (before the effect runs) so pages never
  // render stale data for a different id in between.
  const key = JSON.stringify(deps)
  const [loadedKey, setLoadedKey] = useState(key)
  useEffect(() => { if (!loading) setLoadedKey(key) }, [loading, key])
  const stale = key !== loadedKey
  return { data: stale ? null : data, error: stale ? null : error, loading: loading || stale, reload: run, setData }
}

/** Run an action with busy flag + toast on error. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true)
    try { const r = await fn(); if (success) toast(success); return r } catch (e) { toast(errorMessage(e), 'error'); return undefined } finally { setBusy(false) }
  }, [toast])
  return { busy, run }
}

// ------------------------------------------------------------------ states
export function Loading({ label }: { label?: string }) {
  const { t } = useI18n()
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="animate-spin" size={18}/>{label ?? t('Loading…')}</div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-6 text-center"><AlertTriangle className="mx-auto text-rose-400" size={28}/><p className="mt-2 text-sm font-semibold text-rose-800">{message}</p>{onRetry && <button onClick={onRetry} className="mt-3 text-sm font-bold text-brand">{t('Try again')}</button>}</div>
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center"><Inbox className="mx-auto text-slate-300" size={32}/><h3 className="mt-3 font-bold">{title}</h3>{text && <p className="mt-1 text-sm text-slate-500">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>
}

export function Status({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[value] ?? 'bg-slate-100 text-slate-600'}`}>{label ?? (t(value) !== value ? t(value) : humanize(value))}</span>
}

export function DemoBadge() {
  return <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">Demo</span>
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">{title}</h2><button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>
      {children}
    </div>
  </div>
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{total} total · page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-secondary px-3 py-1.5 text-xs">Previous</button><button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn-secondary px-3 py-1.5 text-xs">Next</button></div></div>
}

export function StatCard({ name, value, unit, note, icon, color = 'text-blue-600', bg = 'bg-blue-50' }: { name: string; value: string | number; unit?: string; note?: string; icon: ReactNode; color?: string; bg?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{name}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${bg} ${color}`}>{icon}</span></div><p className={`mt-4 text-2xl font-black tracking-tight ${color}`}>{typeof value === 'number' ? value.toLocaleString('en-US').replace(/,/g, ' ') : value}{unit && <span className="ml-1 text-xs font-bold">{unit}</span>}</p>{note && <p className="mt-2 text-[10px] font-semibold text-slate-500">{note}</p>}</div>
}

export function ConfirmButton({ onConfirm, children, className, question, disabled }: { onConfirm: () => void; children: ReactNode; className?: string; question: string; disabled?: boolean }) {
  return <button disabled={disabled} className={className} onClick={() => { if (window.confirm(question)) onConfirm() }}>{children}</button>
}

export function ImageWithFallback({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div role="img" aria-label={alt} className={`bg-gradient-to-br from-indigo-950 via-blue-800 to-violet-700 ${className ?? ''}`}/>
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy"/>
}
