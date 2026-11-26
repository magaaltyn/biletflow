"use client";
import { translate, useT } from "@/lib/i18n";
import Link from "next/link";
import { Empty, ErrorBox, PageTitle, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

export default function CheckinEvents() {
  useT();
  useT();
  const { user } = useRequireUser();
  const { data, error, loading } = useApi<any[]>(user ? "/checkin/events" : null);
  if (!user || loading) return <Spinner />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageTitle title="Ticket check-in" subtitle="Events you are assigned to as Event Admin. The BiletFlow Scanner mobile app uses the same accounts." />
      <ErrorBox error={error} />
      {data?.length === 0 && <Empty title="No events to check in">{translate("Organizers can assign you on their event's “Event Admins” tab.")}</Empty>}
      <div className="space-y-3">
        {data?.map((e) => (
          <Link key={e.id} href={`/checkin/${e.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-white p-4 hover:shadow-sm">
            <div>
              <p className="font-bold">{e.title}</p>
              <p className="text-sm text-muted">{formatDate(e.starts_at)} · {e.venue_name}</p>
            </div>
            <p className="text-sm"><b>{e.checked_in}</b> / {e.registered} in</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
