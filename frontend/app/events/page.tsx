"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { EventSearch, dateRange } from "@/components/EventSearch";
import { Button, Empty, ErrorBox, PageTitle, Spinner } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

function EventsList() {
  const { t } = useT();
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const filters = { search: sp.get("search") ?? "", city: sp.get("city") ?? "", category: sp.get("category") ?? "", when: sp.get("when") ?? "", free: sp.get("free") ?? "" };
  const query = new URLSearchParams(
    Object.entries({ search: filters.search, city: filters.city, category: filters.category, free: filters.free, ...dateRange(filters.when), page: String(page), pageSize: "12" }).filter(([, v]) => v) as [string, string][],
  );
  const { data, error, loading, reload } = useApi<{ items: EventCardData[]; total: number; pageSize: number }>(`/events?${query}`);
  const pages = data ? Math.ceil(data.total / data.pageSize) : 1;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageTitle title={t("events")} subtitle={data ? `${data.total}` : undefined} />
      <EventSearch key={sp.toString()} initial={filters} />
      <div className="mt-8">
        {loading && <Spinner />}
        <ErrorBox error={error} onRetry={reload} />
        {data && data.items.length === 0 && <Empty title={t("noEvents")} />}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data?.items.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
        {pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</Button>
            <span className="text-sm text-muted">{page} / {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EventsList />
    </Suspense>
  );
}
