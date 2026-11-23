"use client";
import Link from "next/link";
import { useState } from "react";
import { EventImage } from "@/components/EventCard";
import { Empty, ErrorBox, PageTitle, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { formatDate, kzt } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

export default function MyOrders() {
  const { t } = useT();
  const { user } = useRequireUser();
  const { data, error, loading, reload } = useApi<any[]>(user ? "/orders" : null);
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  if (!user || loading) return <Spinner />;
  const now = Date.now();
  const groups = {
    upcoming: (data ?? []).filter((o) => ["paid", "pending"].includes(o.status) && new Date(o.ends_at).getTime() > now),
    past: (data ?? []).filter((o) => o.status === "paid" && new Date(o.ends_at).getTime() <= now),
    cancelled: (data ?? []).filter((o) => ["cancelled", "refunded", "failed", "expired"].includes(o.status)),
  };
  const list = groups[tab];
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageTitle title={t("myOrders")} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "upcoming", label: t("upcoming"), count: groups.upcoming.length }, { value: "past", label: t("past"), count: groups.past.length }, { value: "cancelled", label: t("cancelled"), count: groups.cancelled.length }]} />
      <div className="mt-4 space-y-3">
        <ErrorBox error={error} onRetry={reload} />
        {list.length === 0 && <Empty title="No orders here"><Link className="text-brand" href="/events">{t("browseEvents")}</Link></Empty>}
        {list.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="flex gap-4 rounded-2xl border border-line bg-white p-3 hover:shadow-sm">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-200"><EventImage src={o.image_url} alt="" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{o.title}</p>
              <p className="text-sm text-muted">{formatDate(o.starts_at)} · {o.venue_name}</p>
              <p className="text-sm text-muted">{o.ticket_count} × {t("tickets").toLowerCase()} · {o.code}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{o.total_kzt ? kzt(o.total_kzt) : t("free")}</p>
              <StatusBadge status={o.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
