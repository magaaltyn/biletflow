"use client";
import {useT, translate} from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, LinkButton, PageTitle, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { formatDate } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

export default function SupportList() {
  useT();
  const { user } = useRequireUser();
  const staff = user && user.role !== "attendee";
  const [view, setView] = useState<"mine" | "inbox">("mine");
  const { data, error, loading, reload } = useApi<any[]>(user ? `/support?view=${view}` : null, [view]);
  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageTitle title="Support" subtitle={translate('Questions about tickets, payments, refunds or events')} actions={<LinkButton href="/support/new">{translate('New case')}</LinkButton>} />
      {staff && <Tabs value={view} onChange={setView} items={[{ value: "mine", label: "My cases" }, { value: "inbox", label: user.role === "platform_admin" ? "Support inbox (platform)" : "Attendee cases for my events" }]} />}
      <div className="mt-4 space-y-3">
        {loading && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data?.length === 0 && <Empty title="No support cases" />}
        {data?.map((c) => (
          <Link key={c.id} href={`/support/${c.id}`} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-white p-4 hover:shadow-sm">
            <div>
              <p className="text-xs text-muted">#{c.code} · {translate(c.category.replace(/_/g, " "))}{c.requester_name ? ` · ${c.requester_name}` : ""}</p>
              <p className="font-semibold">{c.subject}</p>
              {c.event_title && <p className="text-sm text-muted">{c.event_title}</p>}
              <p className="text-xs text-slate-400">Updated {formatDate(c.updated_at)}</p>
            </div>
            <StatusBadge status={c.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
