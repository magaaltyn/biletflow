"use client";
import Link from "next/link";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { EventSearch } from "@/components/EventSearch";
import { Empty, ErrorBox, LinkButton, Spinner } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import {useT, translate} from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function Home() {
  const { t } = useT();
  const { user } = useSession();
  // "Create event" is only for organizers and platform admins; attendees and visitors do not see it.
  const canCreate = user?.role === "organizer" || user?.role === "platform_admin";
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
              {canCreate && <LinkButton href="/organizer/events/new" variant="secondary">{t("createEvent")}</LinkButton>}
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
          <Link href="/events" className="text-sm font-semibold text-brand">{translate('View all →')}</Link>
        </div>
        {loading && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data && data.items.length === 0 && <Empty title={t("noEvents")} />}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data?.items.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
      </section>

    </>
  );
}
