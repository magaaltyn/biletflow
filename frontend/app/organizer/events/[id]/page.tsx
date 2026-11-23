"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EventForm, fromEvent } from "@/components/organizer/EventForm";
import { ActivationTab, AnalyticsTab, AttendeesTab, CampaignsTab, HistoryTab, OrdersTab, StaffTab, TicketTypesTab } from "@/components/organizer/Tabs";
import { Button, Card, ErrorBox, Field, Input, Notice, Spinner, Stat, StatusBadge, Tabs } from "@/components/ui";
import { api, formatDate } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

const ROLES = ["organizer", "platform_admin"];
type Tab = "details" | "tickets" | "activation" | "campaigns" | "attendees" | "orders" | "staff" | "analytics" | "history";

function Manage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { user } = useRequireUser(ROLES);
  const { data: e, error, loading, reload } = useApi<any>(user ? `/organizer/events/${id}` : null);
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) ?? "details");
  const [err, setErr] = useState<unknown>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [askCancel, setAskCancel] = useState(false);

  // Returning from the Halyk ePay page after paying the activation fee.
  useEffect(() => {
    const payment = sp.get("payment");
    if (!user || !payment) return;
    api(`/payments/${payment}/halyk-verify`, { method: "POST" })
      .then(() => api(`/organizer/events/${id}/activation/check`, { method: "POST" }))
      .catch(setErr)
      .finally(() => {
        router.replace(`/organizer/events/${id}?tab=activation`);
        setTab("activation");
        void reload();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || loading) return <Spinner />;
  if (error || !e) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorBox error={error} /></div>;

  const act = async (path: string, body?: object) => {
    setErr(null);
    try {
      const r = await api<any>(`/organizer/events/${e.id}/${path}`, { method: "POST", body });
      if (path === "duplicate") router.push(`/organizer/events/${r.id}`);
      void reload();
    } catch (x) {
      setErr(x);
    }
  };
  const upload = async (file: File) => {
    const form = new FormData();
    form.append("image", file);
    await api(`/organizer/events/${e.id}/image`, { form }).catch(setErr);
    void reload();
  };
  const previewUrl = `/events/${e.slug}${e.visibility === "private" ? `?key=${e.private_token}` : ""}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/organizer" className="text-sm text-muted">← Dashboard</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{e.title}</h1>
        <StatusBadge status={e.lifecycle} />
        {e.paid_sales_status !== "inactive" && <span className="text-xs">paid sales <StatusBadge status={e.paid_sales_status} /></span>}
        {e.suspended_at && <StatusBadge status="suspended" />}
      </div>
      <p className="text-sm text-muted">{formatDate(e.starts_at, { dateStyle: "full", timeStyle: "short" })} · {e.venue.name}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold">{e.status === "draft" ? "Preview" : "View page"}</a>
        {e.status === "draft" && <Button onClick={() => act("publish")}>Publish</Button>}
        {e.status === "published" && <Button variant="secondary" onClick={() => act("unpublish")}>Unpublish</Button>}
        <Button variant="secondary" onClick={() => act("duplicate")}>Duplicate</Button>
        {e.status !== "cancelled" && <Button variant="danger" onClick={() => setAskCancel(true)}>Cancel event</Button>}
      </div>
      {e.visibility === "private" && <p className="mt-2 text-xs text-muted">Private invite link: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}{previewUrl}</span></p>}
      {askCancel && (
        <Card className="mt-4 space-y-2 border-red-200">
          <p className="font-bold">Cancel this event?</p>
          <p className="text-sm text-muted">All tickets become invalid. Free registrations are cancelled and paid orders are refunded (DEMO). Ticket holders are notified and get a cancellation calendar file.</p>
          <Field label="Reason shown to attendees"><Input value={cancelReason} onChange={(x) => setCancelReason(x.target.value)} /></Field>
          <div className="flex gap-2"><Button variant="danger" onClick={() => { setAskCancel(false); void act("cancel", { reason: cancelReason }); }}>Cancel event</Button><Button variant="secondary" onClick={() => setAskCancel(false)}>Back</Button></div>
        </Card>
      )}
      <div className="mt-4"><ErrorBox error={err} /></div>
      {e.suspended_at && <div className="mt-4"><Notice tone="amber">This event was suspended by a platform admin; sales are stopped.</Notice></div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Sold" value={`${e.stats.sold} / ${e.stats.quantity}`} />
        <Stat label="Reserved now" value={e.stats.reserved} />
        <Stat label="Checked in" value={e.stats.checked_in} />
        <Stat label="Refunded / cancelled" value={`${e.stats.refunded} / ${e.stats.cancelled}`} />
      </div>

      <div className="mt-6">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: "details", label: "Details" },
            { value: "tickets", label: "Tickets", count: e.ticketTypes.length },
            { value: "activation", label: "Paid sales" },
            { value: "campaigns", label: "Promo & QR" },
            { value: "attendees", label: "Attendees" },
            { value: "orders", label: "Orders & refunds" },
            { value: "staff", label: "Event Admins", count: e.staff.length },
            { value: "analytics", label: "Analytics" },
            { value: "history", label: "History" },
          ]}
        />
        <div className="mt-5">
          {tab === "details" && (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <Card><EventForm initial={fromEvent(e)} submitLabel="Save changes" onSubmit={async (v) => { await api(`/organizer/events/${e.id}`, { method: "PATCH", body: v }); void reload(); }} /></Card>
              <Card className="space-y-3 self-start">
                <h3 className="font-bold">Cover image</h3>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.image_url && <img src={e.image_url} alt="" className="rounded-xl" />}
                <Input type="file" accept="image/*" onChange={(x) => x.target.files?.[0] && upload(x.target.files[0])} aria-label="Upload cover image" />
                {e.venue.map_image_url && (
                  <>
                    <h3 className="pt-2 font-bold">Venue map</h3>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.venue.map_image_url} alt={`Map of ${e.venue.name}`} className="rounded-xl border border-line" />
                  </>
                )}
              </Card>
            </div>
          )}
          {tab === "tickets" && <TicketTypesTab event={e} reload={reload} />}
          {tab === "activation" && <ActivationTab event={e} reload={reload} />}
          {tab === "campaigns" && <CampaignsTab event={e} />}
          {tab === "attendees" && <AttendeesTab event={e} />}
          {tab === "orders" && <OrdersTab event={e} />}
          {tab === "staff" && <StaffTab event={e} reload={reload} />}
          {tab === "analytics" && <AnalyticsTab event={e} />}
          {tab === "history" && <HistoryTab event={e} />}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Spinner />}><Manage /></Suspense>;
}
