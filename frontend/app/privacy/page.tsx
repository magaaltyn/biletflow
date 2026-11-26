"use client";
import { translate, useT } from "@/lib/i18n";
import Link from "next/link";

const UPDATED = "21 November 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-slate-700">{children}</div>
    </section>
  );
}

export default function Privacy() {
  useT();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{translate("Privacy Policy")}</h1>
      <p className="mt-2 text-sm text-muted">{translate("Last updated:")} {UPDATED}</p>
      <p className="mt-6 text-slate-700">{translate("BiletFlow (“we”, “us”) is a self-service event ticketing platform for Kazakhstan, built as an academic project. This policy explains what personal data we collect when you use biletflow-kz.vercel.app, why we collect it and how you can control it.")}</p>

      <Section title={translate("1. Data we collect")}>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>{translate("Account data:")}</b> {translate("your name, email address, optional phone number, and a securely hashed password if you sign up with email.")}</li>
          <li><b>{translate("Orders and tickets:")}</b> {translate("the events you register for, ticket types, seats, order totals, promo codes used and ticket status (valid, checked in, cancelled, refunded).")}</li>
          <li><b>{translate("Organizer data:")}</b> {translate("organizer name and contacts, a simulated identity check (only the last 4 digits of a document number) and a demo payout account (only the last 4 characters of the IBAN).")}</li>
          <li><b>{translate("Support messages")}</b> {translate("you send and receive, and in-app notifications.")}</li>
          <li><b>{translate("Check-in records:")}</b> {translate("when and by which event staff a ticket was scanned.")}</li>
          <li><b>{translate("Technical data:")}</b> {translate("a session cookie that keeps you signed in, and your language and theme choice stored in your browser.")}</li>
        </ul>
      </Section>

      <Section title={translate("2. Signing in with Google")}>
        <p>{translate("If you choose “Continue with Google”, Google shares with us only your")} <b>{translate("name")}</b>, <b>{translate("email address")}</b>, {translate("whether that email is verified, and a Google account identifier.")} {translate("We request only the openid, email and profile permissions.")}</p>
        <p>{translate("We use this information only to create your BiletFlow account or sign you in to an existing account with the same email. We do not access your contacts, calendar, Gmail, Drive or any other Google data, we do not post anything on your behalf, and we do not sell or share Google user data with anyone.")}</p>
        <p>{translate("BiletFlow’s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.")} <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">{translate("Google API Services User Data Policy")}</a>.</p>
      </Section>

      <Section title={translate("3. How we use your data")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{translate("To issue and deliver tickets, show your orders and let you download printable tickets.")}</li>
          <li>{translate("To let event organizers see the attendee list for their own events and check attendees in.")}</li>
          <li>{translate("To send you service messages: email confirmation, order and refund updates, event changes or cancellations, and support replies.")}</li>
          <li>{translate("To prevent abuse, for example limiting free tickets to one per account per event, and to keep an audit log of organizer and admin actions.")}</li>
        </ul>
        <p>{translate("We do not use your data for advertising and we do not sell it.")}</p>
      </Section>

      <Section title={translate("4. Who can see your data")}>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>{translate("Event organizers")}</b> {translate("see the name, email and ticket details of attendees of their own events, and support cases about their events.")}</li>
          <li><b>{translate("Event staff")}</b> {translate("assigned by an organizer see attendee names and ticket status for that event during check-in.")}</li>
          <li><b>{translate("Platform administrators")}</b> {translate("can view data for moderation, support and fraud prevention.")}</li>
          <li><b>{translate("Service providers")}</b> {translate("that host the platform: Vercel (website, servers and file storage) and Neon (database). They process data only to run the service.")}</li>
        </ul>
      </Section>

      <Section title={translate("5. Payments")}>
        <p>{translate("In this version all payments are demonstration simulations; no real money is charged. BiletFlow never collects or stores payment card numbers. If a bank test payment page (Halyk ePay) is used, card details are entered only on the bank’s page.")}</p>
      </Section>

      <Section title={translate("6. Security and retention")}>
        <p>{translate("Data is sent over HTTPS and stored in an encrypted database. Passwords are stored only as secure hashes. Tickets are protected with signed QR codes. We keep account, order and event history data while your account exists, so organizers keep accurate records of past events.")}</p>
      </Section>

      <Section title={translate("7. Your choices and rights")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{translate("You can update your name and phone on your Profile page at any time.")}</li>
          <li>{translate("You can ask us to export or delete your account and personal data by opening a support case or emailing the address below.")}</li>
          <li>{translate("You can remove BiletFlow’s access to your Google account at any time at")} <a className="text-brand underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</li>
        </ul>
      </Section>

      <Section title={translate("8. Contact")}>
        <p>{translate("Questions about this policy: open a case on the Support page, or write to the BiletFlow team at the support email shown on our Google sign-in screen.")}</p>
      </Section>

      <p className="mt-10 text-sm text-muted">{translate("See also our")} <Link className="text-brand underline" href="/terms">{translate("Terms")}</Link>.</p>
    </div>
  );
}
