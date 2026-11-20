"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PaymentChooser } from "@/components/PaymentChooser";
import { Badge, Button, Card, ErrorBox, Notice, Spinner, StatusBadge } from "@/components/ui";
import { api, formatDate, kzt } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const l = new Date(until).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        onEnd();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onEnd]);
  const s = Math.max(0, Math.floor(left / 1000));
  return <span className="font-mono font-bold">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

function OrderInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { t } = useT();
  const { user } = useRequireUser();
  const { data: o, error, loading, reload } = useApi<any>(user ? `/orders/${id}` : null);
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  // Returning from the Halyk ePay page: confirm the real status with the bank.
  useEffect(() => {
    const payment = sp.get("payment");
    if (!user || !payment) return;
    setVerifying(true);
    api(`/payments/${payment}/halyk-verify`, { method: "POST" })
      .catch(setErr)
      .finally(() => {
        setVerifying(false);
        router.replace(`/orders/${id}`);
        void reload();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading || verifying || !user) return <Spinner />;
  if (error || !o) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorBox error={error} /></div>;

  const cancel = async () => {
    await api(`/orders/${o.id}/cancel`, { method: "POST" }).catch(setErr);
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/orders" className="text-sm text-muted">← {t("myOrders")}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{o.title}</h1>
        <StatusBadge status={o.status} />
      </div>
      <p className="text-sm text-muted">Order {o.code} · {formatDate(o.starts_at, { dateStyle: "full", timeStyle: "short" })} · {o.venue_name}</p>
      <div className="mt-4"><ErrorBox error={err} /></div>

      {o.status === "paid" && <div className="mt-4"><Notice tone="green">✓ {o.total_kzt > 0 ? "Payment successful (DEMO)." : "Registration confirmed."} Your tickets were also sent to {o.attendee_email}.</Notice></div>}
      {o.status === "failed" && <div className="mt-4"><Notice tone="amber">The payment did not go through, so no tickets were issued and the reservation was released. You can start a new order from the event page.</Notice></div>}
      {o.status === "expired" && <div className="mt-4"><Notice tone="amber">The reservation time ran out and the tickets were released.</Notice></div>}

      <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="font-bold">Order summary</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {o.items.map((i: any) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {i.ticket_type}
                  {i.section_code && <span className="text-muted"> · {t("section")} {i.section_code}, {t("row")} {i.row_label}, {t("seat")} {i.seat_number}</span>}
                </span>
                <span>{i.unit_price_kzt === 0 ? t("free") : kzt(i.unit_price_kzt)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>{t("subtotal")}</dt><dd>{kzt(o.subtotal_kzt)}</dd></div>
            {o.discount_kzt > 0 && <div className="flex justify-between text-green-700"><dt>{t("promoCode")} {o.promo_code}</dt><dd>−{kzt(o.discount_kzt)}</dd></div>}
            {o.fee_kzt > 0 && <div className="flex justify-between"><dt>{t("fee")}</dt><dd>{kzt(o.fee_kzt)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>{t("total")}</dt><dd className="text-brand">{kzt(o.total_kzt)}</dd></div>
          </dl>
          {o.payments.length > 0 && (
            <p className="mt-3 text-xs text-muted">Payments: {o.payments.map((p: any) => `${p.provider} ${p.status}${p.is_demo ? " (DEMO)" : ""}`).join(", ")}</p>
          )}
        </Card>
        {o.status === "pending" ? (
          <Card>
            <p className="text-sm">{t("reservedFor")} <Countdown until={o.reserved_until} onEnd={reload} /></p>
            <div className="mt-4"><PaymentChooser path={`/orders/${o.id}/pay`} amountLabel={kzt(o.total_kzt)} /></div>
            <Button variant="ghost" className="mt-2 w-full" onClick={cancel}>Cancel order</Button>
          </Card>
        ) : (
          <Card className="space-y-2 text-sm">
            <p className="font-bold">{t("addToCalendar")}</p>
            <div className="flex flex-wrap gap-3">
              <a className="font-semibold text-brand underline" href={o.calendar.google} target="_blank" rel="noreferrer">Google</a>
              <a className="font-semibold text-brand underline" href={o.calendar.outlook} target="_blank" rel="noreferrer">Outlook</a>
              <a className="font-semibold text-brand underline" href={`/api/events/${o.event_id}/calendar.ics`}>Apple / .ics</a>
            </div>
            <p className="pt-2 font-bold">{t("getHelp")}</p>
            <Link className="font-semibold text-brand" href={`/support/new?orderId=${o.id}`}>{t("support")} →</Link>
            <p className="pt-2 text-xs text-muted">Refund policy: {o.refund_policy}</p>
          </Card>
        )}
      </div>

      {o.tickets.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">{t("tickets")} ({o.tickets.length})</h2>
            <a className="text-sm font-semibold text-brand" href={`/api/tickets/order/${o.id}/pdf`} target="_blank" rel="noreferrer">{t("downloadPdf")} (all)</a>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {o.tickets.map((tk: any) => (
              <Card key={tk.id} className="overflow-hidden p-0">
                <div className="bg-brand p-4 text-white">
                  <p className="text-lg font-bold">{o.title}</p>
                  <p className="text-sm opacity-90">{formatDate(o.starts_at, { dateStyle: "medium", timeStyle: "short" })} · {o.venue_name}</p>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div><p className="text-xs text-muted">{t("section")}</p><p className="font-bold">{tk.section_code ?? "—"}</p></div>
                    <div><p className="text-xs text-muted">{t("row")}</p><p className="font-bold">{tk.row_label ?? "—"}</p></div>
                    <div><p className="text-xs text-muted">{t("seat")}</p><p className="font-bold">{tk.seat_number ?? "—"}</p></div>
                  </div>
                  <p className="mt-2 text-center text-sm">{tk.ticket_type} · {tk.attendee_name}</p>
                  {tk.qrPayload ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/tickets/${tk.id}/qr.png`} alt={`QR code for ticket ${tk.code}`} className="mx-auto mt-3 size-48" />
                  ) : (
                    <p className="my-6 text-center font-bold text-red-600">Not valid for entry</p>
                  )}
                  <p className="text-center font-mono text-xs">{tk.code}</p>
                  <p className="mt-1 text-center"><StatusBadge status={tk.status} /></p>
                  <div className="mt-3 flex justify-center gap-3 text-sm">
                    <a className="font-semibold text-brand" href={`/api/tickets/${tk.id}/pdf`} target="_blank" rel="noreferrer">{t("downloadPdf")}</a>
                    <Link className="font-semibold text-brand" href={`/support/new?ticketId=${tk.id}`}>{t("support")}</Link>
                  </div>
                  <p className="mt-2 text-center text-xs text-muted">{t("showAtEntrance")}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {o.discount_kzt > 0 && <p className="mt-4 text-xs text-muted"><Badge tone="green">{o.promo_code}</Badge> discount applied by the server.</p>}
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrderInner />
    </Suspense>
  );
}
