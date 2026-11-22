import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, Chip, Empty, ErrorView, KV, Loading, Notice, RowView, Screen, Segmented, T } from "@/components/ui";
import { BarChart, ProgressBar, Stat } from "@/components/widgets";
import { useAuth } from "@/features/auth/AuthProvider";
import { kzt } from "@/lib/format";
import { useColors } from "@/lib/theme";
import { api, qs } from "@/services/api";

interface Analytics {
  demo: boolean;
  capacity: { capacity: number; sold: number; reserved: number; remaining: number; percentSold: number };
  money: { gross: number; discounts: number; refunds: number; net: number };
  overTime: { day: string; tickets: number; revenue: number }[];
  byType: { id: number; name: string; event_title: string; quantity: number; sold: number; price_kzt: number; revenue: number }[];
  campaigns: { id: number; code: string; name: string; event_title: string; redemptions: number; visits: number; tickets: number; revenue: number; discount: number }[];
  attendance: { holders: number; checked_in: number; absent: number; percent: number };
}

type Period = "all" | "7" | "30";
const fromFor = (p: Period) => (p === "all" ? undefined : new Date(Date.now() - Number(p) * 86_400_000).toISOString());

/** Analytics from GET /api/organizer/analytics — the same numbers as the website (BiletFlow records only). */
export function EventAnalytics({ eventId }: { eventId?: number }) {
  const c = useColors();
  const [period, setPeriod] = useState<Period>("all");
  const q = useQuery({ queryKey: ["org-analytics", eventId ?? "all", period], queryFn: () => api.get<Analytics>(`/organizer/analytics${qs({ eventId, from: fromFor(period) })}`) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  return (
    <View style={{ gap: 12 }}>
      <Segmented value={period} onChange={setPeriod} options={[{ key: "all", label: "All time" }, { key: "30", label: "Last 30 days" }, { key: "7", label: "Last 7 days" }]} />
      <Notice tone="amber">Revenue figures are DEMO payments (no real money).</Notice>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Total capacity" value={a.capacity.capacity} />
        <Stat label="Tickets sold" value={a.capacity.sold} note={`${a.capacity.percentSold}% sold`} color={c.brand} />
        <Stat label="Remaining" value={a.capacity.remaining} note={`${a.capacity.reserved} reserved in checkout`} />
        <Stat label="Checked in" value={a.attendance.checked_in} note={`${a.attendance.percent}% of ${a.attendance.holders} holders`} color={c.violet} />
      </View>
      <Card>
        <T v="h3">Sales</T>
        <ProgressBar percent={a.capacity.percentSold} />
        <KV label="Gross sales" value={kzt(a.money.gross)} />
        <KV label="Discounts" value={`−${kzt(a.money.discounts)}`} />
        <KV label="Refunds" value={`−${kzt(a.money.refunds)}`} />
        <KV label="Net revenue (DEMO)" value={kzt(a.money.net)} bold />
      </Card>
      <Card>
        <T v="h3">Revenue over time</T>
        <BarChart data={a.overTime.map((d) => ({ label: d.day.slice(5), value: d.revenue }))} format={kzt} />
        <T v="small">Tickets per day: {a.overTime.map((d) => `${d.day.slice(5)}: ${d.tickets}`).join(" · ") || "—"}</T>
      </Card>
      <Card>
        <T v="h3">Sales by ticket type</T>
        {a.byType.length ? a.byType.map((t) => (
          <View key={t.id} style={{ gap: 4, paddingVertical: 4 }}>
            <RowView style={{ justifyContent: "space-between" }}>
              <T v="label" style={{ flex: 1 }}>{t.name}{eventId ? "" : ` · ${t.event_title}`}</T>
              <T v="small">{t.sold}/{t.quantity} · {kzt(t.revenue)}</T>
            </RowView>
            <ProgressBar percent={t.quantity ? (t.sold / t.quantity) * 100 : 0} />
          </View>
        )) : <T v="muted">No ticket types.</T>}
      </Card>
      <Card>
        <T v="h3">Promo campaign performance</T>
        {a.campaigns.length ? a.campaigns.map((cp) => (
          <KV key={cp.id} label={`${cp.code} · ${cp.visits} visits · ${cp.redemptions} redemptions`} value={`${cp.tickets} tickets · ${kzt(cp.revenue)}`} />
        )) : <T v="muted">No campaigns.</T>}
      </Card>
      <Card>
        <T v="h3">Attendance</T>
        <ProgressBar percent={a.attendance.percent} color={c.violet} />
        <KV label="Checked in" value={a.attendance.checked_in} />
        <KV label="Not arrived" value={a.attendance.absent} />
      </Card>
    </View>
  );
}

export default function OrganizerDashboardScreen() {
  const { user } = useAuth();
  const events = useQuery({ queryKey: ["org-events"], queryFn: () => api.get<any[]>("/organizer/events") });
  const [eventId, setEventId] = useState<number | undefined>(undefined);
  const list = events.data ?? [];
  return (
    <Screen onRefresh={() => events.refetch()} refreshing={events.isRefetching}>
      <T v="h2">{user?.organizer_name ?? "Organizer"}</T>
      <RowView>
        <Button style={{ flex: 1 }} title="+ Create event" onPress={() => router.push("/org-event-new")} />
        <Button style={{ flex: 1 }} v="secondary" title="Profile & payouts" onPress={() => router.push("/org-profile")} />
      </RowView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Card style={{ flexBasis: "47%", flexGrow: 1 }}><T v="small">Total events</T><T v="h2">{list.length}</T></Card>
        <Card style={{ flexBasis: "47%", flexGrow: 1 }}><T v="small">Published / drafts</T><T v="h2">{list.filter((e) => e.status === "published").length} / {list.filter((e) => e.status === "draft").length}</T></Card>
      </View>
      {events.isLoading ? <Loading /> : list.length === 0 ? <Empty title="No events yet" action={<Button small title="Create event" onPress={() => router.push("/org-event-new")} />} /> : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Chip label="All events" active={!eventId} onPress={() => setEventId(undefined)} />
          {list.map((e) => <Chip key={e.id} label={e.title} active={eventId === e.id} onPress={() => setEventId(e.id)} />)}
        </View>
      )}
      <EventAnalytics eventId={eventId} />
    </Screen>
  );
}
