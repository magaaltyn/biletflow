"use client";
import Link from "next/link";
import { kzt } from "@/lib/api";
import { localeOf, translate, useT } from "@/lib/i18n";

export interface EventCardData {
  id: number;
  slug: string;
  title: string;
  category: string;
  image_url: string | null;
  starts_at: string;
  venue_name: string;
  city: string;
  min_price: number | null;
}

export function EventImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src ?? "/images/concert.svg"} alt={alt} className={className ?? "h-full w-full object-cover"} />;
}

export function EventCard({ e }: { e: EventCardData }) {
  const { t, lang } = useT();
  const d = new Date(e.starts_at);
  const month = new Intl.DateTimeFormat(localeOf(lang), { month: "short", timeZone: "Asia/Almaty" }).format(d);
  const dayNum = new Intl.DateTimeFormat("en", { day: "numeric", timeZone: "Asia/Almaty" }).format(d);
  return (
    <Link href={`/events/${e.slug}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
        <EventImage src={e.image_url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
        <div className="absolute bottom-3 left-3 rounded-lg bg-white px-2.5 py-1 text-center shadow">
          <p className="text-[10px] font-bold uppercase text-muted">{month}</p>
          <p className="text-lg font-extrabold leading-none">{dayNum}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{translate(e.category)}</p>
        <h3 className="mt-1 line-clamp-2 font-bold">{e.title}</h3>
        <p className="mt-1 text-sm text-muted">
          {e.venue_name}, {e.city}
        </p>
        <p className="mt-1 text-sm text-muted">{new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(d)}</p>
        <p className="mt-auto pt-3 text-sm">
          {e.min_price === 0 ? (
            <span className="font-bold text-green-700">{t("free")}</span>
          ) : (
            <>
              {t("from")} <span className="font-bold text-brand">{kzt(e.min_price)}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
