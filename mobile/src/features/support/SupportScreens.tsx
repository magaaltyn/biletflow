import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Chip, Empty, ErrorBox, ErrorView, Field, Loading, RowView, Screen, Segmented, StatusBadge, T } from "@/components/ui";
import { SignInPrompt } from "@/features/auth/AuthScreens";
import { useAuth } from "@/features/auth/AuthProvider";
import { formatDate, humanize } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { SupportCaseRow } from "@/lib/types";
import { api } from "@/services/api";

// Same lists as api/src/routes/support.ts
export const CATEGORIES = ["ticket_delivery", "payment", "refund", "seating", "event_info", "check_in", "account", "activation", "technical"] as const;
export const STATUSES = ["open", "in_progress", "waiting_for_customer", "resolved"] as const;

function CaseList({ view }: { view: "mine" | "inbox" }) {
  const { locale } = useT();
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const q = useQuery({ queryKey: ["support", view], refetchInterval: 20_000, queryFn: () => api.get<SupportCaseRow[]>(`/support?view=${view}`) });
  const list = (q.data ?? []).filter((c) => filter === "all" || (filter === "resolved" ? c.status === "resolved" : c.status !== "resolved"));
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {view === "mine" ? <Button title="New support case" onPress={() => router.push("/support/new")} /> : <T v="muted">Cases from attendees of your events{" "}(and organizer/escalated cases for platform admins).</T>}
      <Segmented value={filter} onChange={setFilter} options={[{ key: "active", label: "Active" }, { key: "resolved", label: "Resolved" }, { key: "all", label: "All" }]} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !list.length ? <Empty title="No support cases" /> : list.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/support/${c.id}`)} accessibilityLabel={`${c.code} ${c.subject} ${c.status}`}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label" style={{ flex: 1 }}>{c.subject}</T>
            <StatusBadge status={c.status} />
          </RowView>
          <T v="small">{c.code} · {humanize(c.category)}{c.event_title ? ` · ${c.event_title}` : ""}{c.requester_name ? ` · ${c.requester_name}` : ""}</T>
          <T v="small">Updated {formatDate(c.updated_at, undefined, locale)}{c.escalated ? " · escalated" : ""}</T>
        </Card>
      ))}
    </Screen>
  );
}

export function MySupportScreen() {
  const { user } = useAuth();
  const { t } = useT();
  if (!user) return <Screen><SignInPrompt message={t("support")} /></Screen>;
  return (
    <>
      <Stack.Screen options={{ title: t("support") }} />
      <CaseList view="mine" />
    </>
  );
}

export function SupportInboxScreen() {
  return <CaseList view="inbox" />;
}

export function NewCaseScreen() {
  const { t } = useT();
  const params = useLocalSearchParams<{ eventId?: string; orderId?: string; ticketId?: string }>();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(params.ticketId || params.orderId ? "ticket_delivery" : "event_info");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const context = params.ticketId ? `Ticket #${params.ticketId}` : params.orderId ? `Order #${params.orderId}` : params.eventId ? `Event #${params.eventId}` : "General question";
  return (
    <Screen>
      <Stack.Screen options={{ title: "New support case" }} />
      <Card>
        <T v="small">Linked to: {context}</T>
        <T v="label">Category</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CATEGORIES.map((c) => <Chip key={c} label={humanize(c)} active={category === c} onPress={() => setCategory(c)} />)}
        </View>
      </Card>
      <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={150} />
      <Field label="Message" value={message} onChangeText={setMessage} multiline maxLength={5000} />
      <ErrorBox error={err} />
      <Button
        title="Send"
        loading={busy}
        disabled={subject.trim().length < 3 || message.trim().length < 3}
        onPress={async () => {
          setBusy(true);
          setErr(null);
          try {
            const body: Record<string, unknown> = { category, subject: subject.trim(), message: message.trim() };
            if (params.eventId) body.eventId = Number(params.eventId);
            if (params.orderId) body.orderId = Number(params.orderId);
            if (params.ticketId) body.ticketId = Number(params.ticketId);
            const c = await api.post<{ id: number }>("/support", body);
            router.replace(`/support/${c.id}`);
          } catch (e) {
            setErr(e);
          } finally {
            setBusy(false);
          }
        }}
      />
      <T v="small">{t("getHelp")} Attendee questions about an event go to its organizer; other questions go to BiletFlow platform support.</T>
    </Screen>
  );
}

interface CaseDetail {
  id: number;
  code: string;
  subject: string;
  status: (typeof STATUSES)[number];
  category: string;
  kind: string;
  escalated: boolean;
  requester_id: number;
  canManage: boolean;
  messages: { id: number; body: string; created_at: string; author_id: number; author_name: string; author_role: string }[];
  context: { event: { title: string; slug: string } | null; order: { id: number; code: string } | null; ticket: { code: string } | null; requester: { full_name: string; email: string }; assignee: { full_name: string } | null };
}

export function CaseScreen() {
  const c = useColors();
  const { locale } = useT();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  // REST polling every 10 s (WebSockets are not used by the backend).
  const q = useQuery({ queryKey: ["support-case", id], refetchInterval: 10_000, queryFn: () => api.get<CaseDetail>(`/support/${id}`) });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const k = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error || !k) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const isRequester = k.requester_id === user?.id;
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: k.code }} />
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="h3" style={{ flex: 1 }}>{k.subject}</T>
          <StatusBadge status={k.status} />
        </RowView>
        <T v="small">{humanize(k.category)} · {k.kind} case{k.escalated ? " · escalated" : ""}</T>
        <T v="small">From {k.context.requester.full_name} ({k.context.requester.email}){k.context.assignee ? ` · assigned to ${k.context.assignee.full_name}` : ""}</T>
        {k.context.event ? <Button small v="ghost" title={`Event: ${k.context.event.title}`} onPress={() => router.push(`/event/${k.context.event!.slug}`)} /> : null}
        {k.context.order && isRequester ? <Button small v="ghost" title={`Order ${k.context.order.code}`} onPress={() => router.push(`/order/${k.context.order!.id}`)} /> : null}
        {k.context.ticket ? <T v="small">Ticket {k.context.ticket.code}</T> : null}
      </Card>
      {k.messages.map((m) => {
        const mine = m.author_id === user?.id;
        return (
          <View key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: mine ? c.brand : c.card, borderWidth: mine ? 0 : 1, borderColor: c.line, borderRadius: 16, padding: 12, gap: 4 }}>
            <RowView gap={6}>
              <T v="small" color={mine ? "#dbeafe" : c.muted}>{m.author_name} · {formatDate(m.created_at, { timeStyle: "short", dateStyle: "short" }, locale)}</T>
              {m.author_role !== "attendee" && !mine ? <Badge tone="blue" label={m.author_role === "platform_admin" ? "admin" : "staff"} /> : null}
            </RowView>
            <T color={mine ? "#fff" : c.ink}>{m.body}</T>
          </View>
        );
      })}
      <ErrorBox error={err} />
      <Field label="Reply" value={reply} onChangeText={setReply} multiline maxLength={5000} />
      <Button title="Send reply" disabled={!reply.trim()} loading={busy === "reply"} onPress={() => act("reply", async () => {
        await api.post(`/support/${k.id}/messages`, { body: reply.trim() });
        setReply("");
      })} />
      {k.canManage && !isRequester ? (
        <Card>
          <T v="label">Manage case</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.map((s) => <Chip key={s} label={humanize(s)} active={k.status === s} onPress={() => act("status", () => api.patch(`/support/${k.id}`, { status: s }))} />)}
          </View>
          <RowView style={{ flexWrap: "wrap" }}>
            <Button small v="secondary" title="Assign to me" loading={busy === "assign"} onPress={() => act("assign", () => api.patch(`/support/${k.id}`, { assignToMe: true }))} />
            {!k.escalated && user?.role !== "platform_admin" ? <Button small v="secondary" title="Escalate to platform" loading={busy === "esc"} onPress={() => act("esc", () => api.patch(`/support/${k.id}`, { escalate: true }))} /> : null}
          </RowView>
        </Card>
      ) : isRequester && k.status !== "resolved" ? (
        <Button v="secondary" title="Mark as resolved" loading={busy === "resolve"} onPress={() => act("resolve", () => api.patch(`/support/${k.id}`, { status: "resolved" }))} />
      ) : null}
      <T v="small" center>Refreshes automatically every 10 seconds.</T>
    </Screen>
  );
}
