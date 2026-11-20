import { Link } from 'react-router-dom'
import { ArrowRight, Check, CircleHelp, CreditCard, Ticket } from 'lucide-react'
import { useI18n } from '../lib/i18n'

export default function Pricing() {
  const { t } = useI18n()
  const freeItems = ['Create and publish free events', 'Create free ticket types', 'Issue QR-code tickets', 'Manage attendee lists and check-ins', 'Send basic confirmation messages']
  const activationItems = ['One-time activation fee for each event', 'Identity and payout verification', 'A valid payout account', 'Acceptance of paid-event terms', 'Paid ticket checkout becomes available after activation']
  return <div className="mx-auto max-w-5xl py-8 sm:py-12">
    <section className="mx-auto max-w-3xl text-center"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#8b45c7]">BiletFlow · {t('Pricing')}</p><h1 className="mt-3 text-4xl font-black tracking-tight text-[#24134f] sm:text-5xl">{t('Simple pricing for events of every size.')}</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{t('Create and publish free events at no platform fee. Pay a one-time activation fee only when you want to sell paid tickets for an event.')}</p></section>
    <section className="mt-10 grid gap-5 md:grid-cols-2">
      <article className="flex flex-col rounded-[28px] border border-[#e8ddf5] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f2e8ff] text-[#7138c8]"><Ticket size={22}/></span><div><h2 className="text-xl font-black text-[#24134f]">{t('Free events')}</h2><p className="text-xs font-semibold text-slate-500">{t('For events with free tickets')}</p></div></div>
        <p className="mt-7 text-4xl font-black text-[#24134f]">₸0 <span className="text-sm font-semibold text-slate-500">{t('platform fee')}</span></p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t('There is no BiletFlow platform fee to create and publish a free event or issue free tickets.')}</p>
        <ul className="mt-6 flex-1 space-y-3">{freeItems.map(x => <li key={x} className="flex gap-2 text-sm text-slate-700"><Check className="mt-0.5 shrink-0 text-emerald-600" size={16}/>{t(x)}</li>)}</ul>
        <Link to="/organizer/events/new" className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#7138c8] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#5d2ca8]">{t('Create a free event')} <ArrowRight size={15}/></Link>
      </article>
      <article className="relative flex flex-col rounded-[28px] border border-[#d8c5ef] bg-[#25105f] p-6 text-white shadow-xl shadow-purple-100 sm:p-8">
        <span className="absolute right-6 top-6 rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-pink-200">{t('Per event')}</span>
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-pink-200"><CreditCard size={22}/></span><div><h2 className="text-xl font-black">{t('Paid ticket sales')}</h2><p className="text-xs font-semibold text-white/60">{t('For organizers selling paid tickets')}</p></div></div>
        <p className="mt-7 text-3xl font-black">{t('One-time activation fee')}</p><p className="mt-1 text-sm font-semibold text-pink-200">{t('Amount in KZT · To be determined')}</p>
        <p className="mt-3 text-sm leading-6 text-white/75">{t('Paid sales remain disabled until the organizer completes the required activation steps for that event.')}</p>
        <ul className="mt-6 flex-1 space-y-3">{activationItems.map(x => <li key={x} className="flex gap-2 text-sm text-white/85"><Check className="mt-0.5 shrink-0 text-pink-200" size={16}/>{t(x)}</li>)}</ul>
        <Link to="/organizer" className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#ed1686] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#d80c76]">{t('Go to organizer workspace')} <ArrowRight size={15}/></Link>
      </article>
    </section>
    <section className="mt-6 grid gap-4 rounded-3xl border border-[#eee8f6] bg-[#faf7ff] p-6 sm:grid-cols-2 sm:p-8">
      <div><h2 className="flex items-center gap-2 font-extrabold text-[#24134f]"><CreditCard size={18}/>{t('Payment processing')}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{t('Payment-processing charges are deducted from each transaction. The final provider, supported methods, and fee details remain decisions for a later release.')}</p></div>
      <div><h2 className="flex items-center gap-2 font-extrabold text-[#24134f]"><CircleHelp size={18}/>{t('No per-ticket service fee in the MVP')}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{t('An optional per-ticket service fee is excluded from the initial MVP and may be considered for a future release.')}</p></div>
    </section>
    <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-xs leading-5 text-amber-900">{t('Academic MVP: activation-fee payment, identity checks, ticket payments, and organizer payouts may be demonstrated using a provider sandbox or a clearly labelled simulation. No real money movement is required. Final fees, processing arrangements, and payout timing have not yet been determined.')}</p>
    <p className="mt-6 text-center text-xs text-slate-500">{t('Pricing model based on BiletFlow SRS v0.3, Section 3.')} <Link to="/how-it-works" className="font-bold text-[#7138c8] underline">{t('See how BiletFlow works')}</Link>.</p>
  </div>
}
