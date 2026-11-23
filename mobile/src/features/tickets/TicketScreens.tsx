import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Empty, ErrorView, KV, Loading, Notice, RowView, Screen, Segmented, StatusBadge, T, notify } from "@/components/ui";
import { EventImage, QrCode } from "@/components/widgets";
import { SignInPrompt } from "@/features/auth/AuthScreens";
import { useAuth } from "@/features/auth/AuthProvider";
import { saveAndShare } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { MyTicket } from "@/lib/types";
import { api } from "@/services/api";

import { ticketTab, type TicketTab as Tab } from "./ticketTab";

export const useMyTickets = (enabled: boolean) => useQuery({ queryKey: ["tickets"], enabled, queryFn: () => api.get<MyTicket[]>("/tickets") });

export function MyTicketsScreen() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const q = useMyTickets(Boolean(user));
  if (!user) return <Screen><SignInPrompt message={t("myTickets")} /></Screen>;
  const all = q.data ?? [];
  const list = all.filter((x) => ticketTab(x) === tab);
  if (tab === "upcoming") list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[{ key: "upcoming", label: t("upcoming") }, { key: "past", label: t("past") }, { key: "cancelled", label: t("cancelled") }, { key: "refunded", label: t("refunded") }]}
      />
      <Button small v="secondary" title={t("myOrders")} onPress={() => router.push("/orders")} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} retryLabel={t("retry")} /> : !list.length ? (
        <Empty title={t("noTickets")} action={<Button small title={t("browseEvents")} onPress={() => router.push("/search")} />} />
      ) : (
        list.map((tk) => (
          <Card key={tk.id} onPress={() => router.push(`/ticket/${tk.id}`)} accessibilityLabel={`${tk.title}, ${tk.ticket_type}, ${tk.status}`} style={{ padding: 0, overflow: "hidden" }}>
            <EventImage src={tk.image_url} height={90} rounded={false} />
            <View style={{ padding: 12, gap: 4 }}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="h3" style={{ flex: 1 }} numberOfLines={2}>{tk.title}</T>
                <StatusBadge status={tk.status} />
              </RowView>
              <T v="muted">{formatDate(tk.starts_at, undefined, locale, tk.timezone)} · {tk.venue_name}</T>
              <T v="small">{tk.ticket_type} · {tk.attendee_name}{tk.section_code ? ` · ${tk.section_code}-${tk.row_label}-${tk.seat_number}` : ""}</T>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

export function TicketScreen() {
  const c = useColors();
  const { t, locale } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useMyTickets(true);
  if (q.isLoading) return <Loading />;
  const tk = q.data?.find((x) => String(x.id) === id);
  if (q.error || !tk) return <ErrorView error={q.error ?? "Ticket not found"} onRetry={() => q.refetch()} />;
  const pdf = () => saveAndShare(`/tickets/${tk.id}/pdf`, `${tk.code}.pdf`, "application/pdf").catch((e) => notify(t("downloadPdf"), String(e?.message ?? e)));
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: tk.code }} />
      <View style={{ backgroundColor: c.brand, borderRadius: 20, padding: 16, gap: 4 }}>
        <T v="h2" color="#fff">{tk.title}</T>
        <T color="#dbeafe">{formatDate(tk.starts_at, { dateStyle: "full", timeStyle: "short" }, locale, tk.timezone)}</T>
        <T color="#dbeafe">{tk.venue_name}, {tk.city}</T>
      </View>
      <Card style={{ alignItems: "center", gap: 10 }}>
        <StatusBadge status={tk.status} />
        {tk.qrPayload ? (
          <>
            {/* Large enough to scan from another phone; the same signed payload as the website and the PDF. */}
            <QrCode value={tk.qrPayload} size={260} faded={tk.status === "checked_in"} />
            {tk.status === "checked_in" ? <Notice tone="blue">{`Checked in ${formatDate(tk.checked_in_at, { timeStyle: "short" }, locale, tk.timezone)}`}</Notice> : <T v="small" center>{t("showAtEntrance")}</T>}
          </>
        ) : (
          <T v="h3" color={c.red}>{t("notValidForEntry")}</T>
        )}
        <T v="mono">{tk.code}</T>
      </Card>
      <Card>
        <KV label={t("tickets")} value={tk.ticket_type} />
        <KV label={t("attendeeName")} value={tk.attendee_name} />
        {tk.section_code ? <KV label={`${t("section")} / ${t("row")} / ${t("seat")}`} value={`${tk.section_code} / ${tk.row_label} / ${tk.seat_number}`} /> : null}
        <KV label="Order" value={tk.order_code} />
      </Card>
      <Button title={t("downloadPdf")} onPress={pdf} />
      <Button v="secondary" title={`${t("share")} (PDF)`} onPress={pdf} />
      <RowView>
        <Button style={{ flex: 1 }} v="secondary" title={t("viewEvent")} onPress={() => router.push(`/event/${tk.slug}`)} />
        <Button style={{ flex: 1 }} v="secondary" title={t("viewOrder")} onPress={() => router.push(`/order/${tk.order_id}`)} />
      </RowView>
      <Button v="ghost" title={t("support")} onPress={() => router.push({ pathname: "/support/new", params: { ticketId: String(tk.id) } })} />
    </Screen>
  );
}
