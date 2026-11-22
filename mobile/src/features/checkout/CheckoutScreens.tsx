import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Badge, Button, Card, DemoBanner, Divider, Empty, ErrorBox, ErrorView, KV, Loading, Notice, RowView, Screen, Segmented, StatusBadge, T, confirm, notify } from "@/components/ui";
import { QrCode } from "@/components/widgets";
import { SignInPrompt } from "@/features/auth/AuthScreens";
import { useAuth } from "@/features/auth/AuthProvider";
import { saveAndShare } from "@/lib/files";
import { formatDate, kzt, mmss, secondsUntil } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { OrderDetail, OrderListItem, Payment } from "@/lib/types";
import { api } from "@/services/api";

// ---------------------------------------------------------------- order list
export function OrdersScreen() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "failed" | "refunded">("all");
  const q = useQuery({ queryKey: ["orders"], enabled: Boolean(user), queryFn: () => api.get<OrderListItem[]>("/orders") });
  if (!user) return <Screen><SignInPrompt message={t("myOrders")} /></Screen>;
  const list = (q.data ?? []).filter((o) => filter === "all" || o.status === filter || (filter === "failed" && (o.status === "expired" || o.status === "cancelled")));
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: t("myOrders") }} />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[{ key: "all", label: "All" }, { key: "pending", label: "Pending" }, { key: "paid", label: "Completed" }, { key: "failed", label: "Failed / expired" }, { key: "refunded", label: t("refunded") }]}
      />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !list.length ? <Empty title={t("noOrders")} /> : list.map((o) => (
        <Card key={o.id} onPress={() => router.push(`/order/${o.id}`)} accessibilityLabel={`Order ${o.code}, ${o.title}, ${o.status}`}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="h3" style={{ flex: 1 }} numberOfLines={2}>{o.title}</T>
            <StatusBadge status={o.status} />
          </RowView>
          <T v="muted">{formatDate(o.starts_at, undefined, locale)} · {o.venue_name}</T>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="small">{o.code} · {o.ticket_count} × 🎟</T>
            <T v="price">{o.total_kzt === 0 ? t("free") : kzt(o.total_kzt)}</T>
          </RowView>
        </Card>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- order detail
function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => secondsUntil(until));
  useEffect(() => {
    const id = setInterval(() => {
      const l = secondsUntil(until);
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        onEnd();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onEnd]);
  return <T v="h2" accessibilityRole="text">{mmss(left)}</T>;
}

export function OrderScreen() {
  const c = useColors();
  const { t, locale } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const o = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error || !o) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const refresh = () => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const pay = async () => {
    setBusy("pay");
    setErr(null);
    try {
      // Same endpoint as the website: creates a pending DEMO payment, then the DEMO page completes it.
      const r = await api.post<{ paymentId: number; provider: string }>(`/orders/${o.id}/pay`, { provider: "demo" });
      router.push(`/pay/${r.paymentId}`);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    if (!(await confirm(t("cancelOrder"), "Your reserved tickets will be released.", t("cancelOrder")))) return;
    setBusy("cancel");
    try {
      await api.post(`/orders/${o.id}/cancel`);
      refresh();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const pdf = (path: string, name: string) => saveAndShare(path, name, "application/pdf").catch((e) => notify(t("downloadPdf"), String(e?.message ?? e)));

  return (
    <Screen onRefresh={refresh} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: `Order ${o.code}` }} />
      <RowView style={{ justifyContent: "space-between" }}>
        <T v="h2" style={{ flex: 1 }}>{o.title}</T>
        <StatusBadge status={o.status} />
      </RowView>
      <T v="muted">{formatDate(o.starts_at, { dateStyle: "full", timeStyle: "short" }, locale, o.timezone)} · {o.venue_name}</T>
      {o.status === "paid" ? <Notice tone="green">{`✓ ${o.total_kzt > 0 ? "Payment successful (DEMO)." : "Registration confirmed."} Your tickets were also sent to ${o.attendee_email}.`}</Notice> : null}
      {o.status === "failed" ? <Notice tone="amber">The payment did not go through, so no tickets were issued and the reservation was released. You can start a new order from the event page.</Notice> : null}
      {o.status === "expired" ? <Notice tone="amber">The reservation time ran out and the tickets were released.</Notice> : null}
      {o.status === "refunded" ? <Notice tone="red">This order was refunded (DEMO). Its tickets are no longer valid.</Notice> : null}
      {o.status === "cancelled" ? <Notice tone="red">This order was cancelled. Its tickets are no longer valid.</Notice> : null}
      <ErrorBox error={err} />

      {o.status === "pending" && o.reserved_until ? (
        <Card style={{ gap: 10 }}>
          <T v="label">{t("reservedFor")}</T>
          <Countdown until={o.reserved_until} onEnd={refresh} />
          <DemoBanner text={t("demoNotice")} />
          <Button title={`${t("pay")} ${kzt(o.total_kzt)}`} onPress={pay} loading={busy === "pay"} disabled={busy !== null} />
          <Button v="ghost" title={t("cancelOrder")} onPress={cancel} loading={busy === "cancel"} disabled={busy !== null} />
        </Card>
      ) : null}

      <Card>
        <T v="h3">Order summary</T>
        {o.items.map((i) => (
          <KV key={i.id} label={`${i.ticket_type}${i.section_code ? ` · ${t("section")} ${i.section_code}, ${t("row")} ${i.row_label}, ${t("seat")} ${i.seat_number}` : ""}`} value={i.unit_price_kzt === 0 ? t("free") : kzt(i.unit_price_kzt)} />
        ))}
        <Divider />
        <KV label={t("subtotal")} value={kzt(o.subtotal_kzt)} />
        {o.discount_kzt > 0 ? <KV label={`${t("promoCode")} ${o.promo_code ?? ""}`} value={`−${kzt(o.discount_kzt)}`} /> : null}
        {o.fee_kzt > 0 ? <KV label={t("fee")} value={kzt(o.fee_kzt)} /> : null}
        <KV label={t("total")} value={kzt(o.total_kzt)} bold />
        {o.payments.length ? <T v="small">Payments: {o.payments.map((p) => `${p.provider} ${p.status}${p.is_demo ? " (DEMO)" : ""}`).join(", ")}</T> : null}
      </Card>

      {o.tickets.length > 0 ? (
        <>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="h2">{t("tickets")} ({o.tickets.length})</T>
            <Button small v="secondary" title={`${t("downloadPdf")} (all)`} onPress={() => pdf(`/tickets/order/${o.id}/pdf`, `biletflow-order-${o.code}.pdf`)} />
          </RowView>
          {o.tickets.map((tk) => (
            <Card key={tk.id} onPress={() => router.push(`/ticket/${tk.id}`)} accessibilityLabel={`${t("ticketQr")} ${tk.code}`}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label">{tk.ticket_type} · {tk.attendee_name}</T>
                <StatusBadge status={tk.status} />
              </RowView>
              {tk.section_code ? <T v="small">{t("section")} {tk.section_code} · {t("row")} {tk.row_label} · {t("seat")} {tk.seat_number}</T> : null}
              {tk.qrPayload ? <QrCode value={tk.qrPayload} size={150} faded={tk.status === "checked_in"} /> : <T v="h3" color={c.red} center>{t("notValidForEntry")}</T>}
              <T v="mono" center>{tk.code}</T>
            </Card>
          ))}
        </>
      ) : null}

      {o.status !== "pending" ? (
        <Card>
          <T v="label">{t("addToCalendar")}</T>
          <RowView style={{ flexWrap: "wrap" }}>
            <Button small v="secondary" title="Google" onPress={() => Linking.openURL(o.calendar.google)} />
            <Button small v="secondary" title="Outlook" onPress={() => Linking.openURL(o.calendar.outlook)} />
            <Button small v="secondary" title=".ics" onPress={() => saveAndShare(`/events/${o.event_id}/calendar.ics`, `${o.slug}.ics`, "text/calendar").catch((e) => notify("Calendar", String(e?.message ?? e)))} />
          </RowView>
          <Divider />
          <T v="label">{t("getHelp")}</T>
          <Button small v="secondary" title={t("support")} onPress={() => router.push({ pathname: "/support/new", params: { orderId: String(o.id) } })} />
          <T v="small">Refund policy: {o.refund_policy}. Refunds are issued by the organizer — contact support to request one.</T>
        </Card>
      ) : null}
      <Button v="ghost" title={t("viewEvent")} onPress={() => router.push(`/event/${o.slug}`)} />
    </Screen>
  );
}

// ---------------------------------------------------------------- DEMO payment
export function DemoPayScreen() {
  const c = useColors();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payment", id], queryFn: () => api.get<Payment>(`/payments/${id}`) });
  const [method, setMethod] = useState<"kaspi" | "card">("kaspi");
  const [busy, setBusy] = useState<null | "ok" | "fail">(null);
  const [err, setErr] = useState<unknown>(null);
  const p = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error || !p) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;

  const back = () => {
    if (p.purpose === "activation_fee") router.replace(`/org-event/${p.event_id}`);
    else router.replace(`/order/${p.order_id}`);
  };
  const finish = async (success: boolean) => {
    setBusy(success ? "ok" : "fail");
    setErr(null);
    try {
      await api.post(`/payments/${p.id}/demo`, { success, method });
      if (p.purpose === "activation_fee") await api.post(`/organizer/events/${p.event_id}/activation/check`).catch(() => undefined);
      await qc.invalidateQueries();
      back();
    } catch (e) {
      setErr(e);
      setBusy(null);
    }
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: "DEMO payment" }} />
      <DemoBanner text={t("demoPayTitle")} />
      <Card>
        <T v="muted">{p.purpose === "activation_fee" ? "Paid Sales Activation Fee" : `Order ${p.order_code}`}</T>
        <T v="h3">{p.title}</T>
        <T v="title" color={c.brand}>{kzt(p.amount_kzt)}</T>
      </Card>
      {p.status !== "pending" ? (
        <>
          <Notice>{`This payment is already ${p.status}.`}</Notice>
          <Button title={t("continue")} onPress={back} />
        </>
      ) : (
        <>
          <T v="label">{t("paymentMethod")}</T>
          <Segmented value={method} onChange={setMethod} options={[{ key: "kaspi", label: "Kaspi Pay (demo)" }, { key: "card", label: "Visa / Mastercard (demo)" }]} />
          <T v="small">Choose the outcome to test both paths. Nothing is charged and no card details are collected.</T>
          <ErrorBox error={err} />
          <Button v="success" title={t("paySuccess")} onPress={() => finish(true)} loading={busy === "ok"} disabled={busy !== null} />
          <Button v="secondary" title={t("payFail")} onPress={() => finish(false)} loading={busy === "fail"} disabled={busy !== null} />
          <Button v="ghost" title="Back" onPress={back} disabled={busy !== null} />
          <View style={{ alignItems: "center" }}><Badge tone="amber" label="DEMO" /></View>
        </>
      )}
    </Screen>
  );
}
