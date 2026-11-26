"use client";
import {useT, translate} from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, LinkButton, PageTitle, Spinner, Stat, StatusBadge, Tabs } from "@/components/ui";
import { formatDate, kzt } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

const ROLES = ["organizer", "platform_admin"];

export default function OrganizerDashboard() {
  useT();
  const { user } = useRequireUser(ROLES);
  const { data: events, error, loading, reload } = useApi<any[]>(user ? "/organizer/events" : null);
  const { data: an } = useApi<any>(user ? "/organizer/analytics" : null);
  const [tab, setTab] = useState("upcoming");
  if (!user || loading) return <Spinner />;
  const groups = ["upcoming", "active", "draft", "completed", "cancelled"];
  const list = (events ?? []).filter((e) => e.lifecycle === tab);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageTitle
        title="Organizer dashboard"
        subtitle={user.organizer_name ?? user.full_name}
        actions={<><LinkButton href="/organizer/profile" variant="secondary">{translate('Profile & payouts')}</LinkButton><LinkButton href="/organizer/events/new">{translate('+ Create event')}</LinkButton></>}
      />
      {an && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Gross sales (DEMO)" value={kzt(an.money.gross)} />
          <Stat label="Tickets sold" value={an.capacity.sold} hint={`${an.capacity.percentSold}% ${translate("of")} ${an.capacity.capacity}`} />
          <Stat label="Net revenue (DEMO)" value={kzt(an.money.net)} hint={`${translate("discounts")} ${kzt(an.money.discounts)}`} />
          <Stat label={translate('Checked in')} value={an.attendance.checked_in} hint={`${an.attendance.percent}% ${translate("of ticket holders")}`} />
          <Stat label={translate('Refunds')} value={kzt(an.money.refunds)} />
        </div>
      )}
      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} items={groups.map((g) => ({ value: g, label: translate(g[0].toUpperCase() + g.slice(1)), count: (events ?? []).filter((e) => e.lifecycle === g).length }))} />
        <div className="mt-4 space-y-3">
          <ErrorBox error={error} onRetry={reload} />
          {list.length === 0 && <Empty title={`No ${tab} events`}>{tab === "upcoming" && <Link className="text-brand" href="/organizer/events/new">{translate('Create your first event')}</Link>}</Empty>}
          {list.map((e) => (
            <Link key={e.id} href={`/organizer/events/${e.id}`} className="grid gap-2 rounded-2xl border border-line bg-white p-4 hover:shadow-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
              <div>
                <p className="font-bold">{e.title}</p>
                <p className="text-sm text-muted">{formatDate(e.starts_at)} · {e.venue_name}</p>
              </div>
              <div className="text-sm">
                <p><b>{e.sold}</b> / {e.quantity} {translate("sold")}</p>
                <div className="mt-1 h-1.5 w-40 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${e.quantity ? Math.min(100, (e.sold / e.quantity) * 100) : 0}%` }} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={e.status} />
                {e.paid_sales_status !== "inactive" && <StatusBadge status={e.paid_sales_status} />}
                {e.suspended_at && <StatusBadge status="suspended" />}
                <span className="text-sm font-semibold">{kzt(e.gross_kzt)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
