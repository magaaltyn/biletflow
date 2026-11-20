import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { ArrowRight, BadgeCheck, CalendarDays, ClipboardList, CreditCard, QrCode, ScanLine, Search, Ticket, UserRound, Users } from 'lucide-react'

function StepList({ items }: { items: { icon: ReactNode; title: string; text: string }[] }) {
  return <ol className="space-y-4">
    {items.map((item, index) => <li key={item.title} className="flex gap-4 rounded-2xl border border-[#eee8f6] bg-white p-5 shadow-sm">
      <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f2e8ff] text-[#7138c8]">{item.icon}<span className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-[#ed1686] text-[11px] font-black text-white">{index + 1}</span></div>
      <div><h3 className="font-extrabold text-[#24134f]">{item.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p></div>
    </li>)}
  </ol>
}

export default function HowItWorks() {
  const { t } = useI18n()
  const attendee = [
    { icon: <Search size={21}/>, title: t('Discover an event'), text: t('Browse public events and open an event page to review its date, venue, description, and available ticket types.') },
    { icon: <Ticket size={21}/>, title: t('Choose your ticket'), text: t('Select an available free or paid ticket. Assigned seating is an optional stretch feature for events that offer it.') },
    { icon: <CreditCard size={21}/>, title: t('Complete registration or checkout'), text: t('Reserve a free ticket without payment, or complete the demonstration checkout when paid sales are active.') },
    { icon: <QrCode size={21}/>, title: t('Receive your digital ticket'), text: t('After a successful registration or payment, your ticket is issued with a unique QR code, sent by email, and made available in your account.') },
    { icon: <ScanLine size={21}/>, title: t('Present it at the entrance'), text: t('An authorized event administrator scans the admission QR code in the BiletFlow verification app to validate the ticket and record check-in.') },
  ]
  const organizer = [
    { icon: <UserRound size={21}/>, title: t('Create and verify your account'), text: t('Register with an email address, verify it, and set up an organizer profile with contact information.') },
    { icon: <CalendarDays size={21}/>, title: t('Create your event'), text: t('Add the event details, venue, date and time, visibility, capacity, registration period, and event image. Preview before publishing.') },
    { icon: <ClipboardList size={21}/>, title: t('Configure ticket types'), text: t('Create free or paid ticket types, set prices and quantities, define sale periods, and set the maximum tickets per order.') },
    { icon: <BadgeCheck size={21}/>, title: t('Activate paid sales when needed'), text: t('Free events can be published without a platform fee. To sell paid tickets, complete identity and payout verification, pay the one-time event activation fee, connect a valid payout account, and accept the paid-event terms.') },
    { icon: <Users size={21}/>, title: t('Manage the event'), text: t('Track registrations, attendees, orders, refunds, campaigns, sales analytics, and check-in activity from the organizer workspace.') },
  ]
  return <div className="mx-auto max-w-5xl py-8 sm:py-12">
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#25105f] via-[#6330a9] to-[#a51b85] px-6 py-12 text-white sm:px-10 sm:py-16">
      <p className="text-xs font-extrabold uppercase tracking-[.2em] text-pink-200">BiletFlow · {t('How It Works')}</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">{t('From discovering an event to scanning a ticket.')}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">{t('BiletFlow brings event organizers, attendees, and event check-in staff together in one ticketing workflow.')}</p>
      <div className="mt-7 flex flex-wrap gap-3"><Link to="/" className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-[#4b2088] hover:bg-pink-50">{t('Explore events')} <ArrowRight className="ml-1 inline" size={15}/></Link><Link to="/register?next=%2Forganizer" className="rounded-full border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">{t('Create an organizer account')}</Link></div>
    </section>
    <section className="mt-12 grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
      <div className="lg:sticky lg:top-28"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#8b45c7]">{t('For attendees')}</p><h2 className="mt-2 text-3xl font-black text-[#24134f]">{t('Get your ticket in a few steps')}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{t('Find an event, choose a ticket, and keep your QR-code ticket ready for entry.')}</p></div>
      <StepList items={attendee}/>
    </section>
    <section className="mt-14 grid gap-5 border-t border-[#eee8f6] pt-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
      <div className="lg:sticky lg:top-28"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#8b45c7]">{t('For organizers')}</p><h2 className="mt-2 text-3xl font-black text-[#24134f]">{t('Create, publish, and manage events')}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{t('The basic organizer workflow is free for free events. Paid ticket sales require a separate activation process for each event.')}</p></div>
      <StepList items={organizer}/>
    </section>
    <p className="mt-8 rounded-2xl bg-[#f7f2ff] p-5 text-xs leading-5 text-[#594779]">{t('Academic MVP note: identity checks, paid-sales activation fees, ticket payments, and organizer payouts may use a provider sandbox or a clearly labelled simulation. The MVP does not move real money.')}</p>
  </div>
}
