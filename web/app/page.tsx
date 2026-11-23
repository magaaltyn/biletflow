"use client";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { EventSearch } from "@/components/EventSearch";
import { Empty, ErrorBox, LinkButton, Spinner } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

export default function Home() {
  const { t } = useT();
  const { data, error, loading, reload } = useApi<{ items: EventCardData[] }>("/events?pageSize=8");
  return (
    <>
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {t("heroTitle1")}
              <br />
              {t("heroTitle2")}
              <br />
              <span className="text-brand">{t("heroTitle3")}</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted">{t("heroText")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/events">{t("browseEvents")}</LinkButton>
              <LinkButton href="/organizer/events/new" variant="secondary">{t("createEvent")}</LinkButton>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -left-6 -top-6 size-24 rotate-12 rounded-2xl bg-green-500/80" aria-hidden />
            <div className="absolute -bottom-6 -right-4 size-28 rounded-full bg-amber-400/90" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/concert.svg" alt="" className="relative aspect-[16/10] w-full rounded-3xl object-cover shadow-xl" />
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-2 max-w-7xl px-4">
        <EventSearch />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-bold">{t("popularEvents")}</h2>
          <Link href="/events" className="text-sm font-semibold text-brand">View all →</Link>
        </div>
        {loading && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data && data.items.length === 0 && <Empty title={t("noEvents")} />}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data?.items.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="grid gap-6 rounded-3xl bg-brand-soft p-8 md:grid-cols-[1.2fr_2fr] md:p-10">
          <div>
            <h2 className="text-2xl font-bold text-brand">Organize your event with BiletFlow</h2>
            <p className="mt-2 text-muted">Create events, sell tickets, manage attendees and check them in — all in one place.</p>
            <LinkButton href="/organizers" className="mt-5">Get started for free</LinkButton>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Free events", "Create events and give out free QR tickets at no cost."],
              ["Paid ticket sales", "Activate paid sales per event with a one-time fee."],
              ["Seat maps & venue pictures", "Interactive seat selection with a view from each section."],
              ["Analytics & promo codes", "Track sales, campaigns and check-ins in real time."],
            ].map(([h, p]) => (
              <div key={h} className="rounded-2xl bg-white p-4">
                <p className="font-semibold">{h}</p>
                <p className="mt-1 text-sm text-muted">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
