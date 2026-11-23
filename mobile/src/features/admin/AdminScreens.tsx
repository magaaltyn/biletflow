// Platform administration (Platform Admin only — every endpoint below is protected by requireRole("platform_admin")).
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Empty, ErrorBox, ErrorView, Field, KV, Loading, Notice, RowView, Screen, Segmented, StatusBadge, T, confirm, notify } from "@/components/ui";
import { PromptModal, Stat } from "@/components/widgets";
import { saveAndShare } from "@/lib/files";
import { formatDate, humanize, kzt } from "@/lib/format";
import { useColors } from "@/lib/theme";
import { api } from "@/services/api";

function useRun(after?: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      after?.();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  return { busy, err, run };
}

// ---------------------------------------------------------------- overview + monitoring
export function AdminOverviewScreen() {
  const c = useColors();
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get<any>("/admin/overview") });
  const m = useQuery({ queryKey: ["admin-monitoring"], queryFn: () => api.get<{ refunds: any[]; failedPayments: any[]; promoActivity: any[] }>("/admin/monitoring") });
  const refresh = () => {
    void o.refetch();
    void m.refetch();
  };
  return (
    <Screen onRefresh={refresh} refreshing={o.isRefetching}>
      {o.isLoading ? <Loading /> : o.error ? <ErrorView error={o.error} onRetry={refresh} /> : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat label="Users" value={o.data.users} />
          <Stat label="Published events" value={o.data.published_events} />
          <Stat label="Active tickets" value={o.data.active_tickets} />
          <Stat label="DEMO gross" value={kzt(o.data.demo_gross_kzt)} color={c.brand} />
          <Stat label="Refunds" value={o.data.refunds} />
          <Stat label="Failed payments" value={o.data.failed_payments} color={c.red} />
          <Stat label="Open event reports" value={o.data.open_reports} color={o.data.open_reports ? c.amber : undefined} />
          <Stat label="Open support cases" value={o.data.open_cases} />
        </View>
      )}
      <T v="h3">Refund monitoring</T>
      {m.data?.refunds.length ? m.data.refunds.slice(0, 15).map((r) => <KV key={r.id} label={`${r.code} · ${r.title}`} value={`${kzt(r.amount_kzt)} · ${formatDate(r.created_at, { dateStyle: "short" })}`} />) : <T v="muted">No refunds.</T>}
      <T v="h3">Failed payments</T>
      {m.data?.failedPayments.length ? m.data.failedPayments.slice(0, 15).map((p) => <KV key={p.id} label={`${humanize(p.purpose)} · ${p.title}`} value={`${kzt(p.amount_kzt)} · ${p.provider}`} />) : <T v="muted">No failed payments.</T>}
      <T v="h3">Promo activity</T>
      {m.data?.promoActivity.length ? m.data.promoActivity.slice(0, 15).map((p) => <KV key={p.code + p.title} label={`${p.code} · ${p.title}`} value={`${p.redemptions}${p.max_redemptions ? `/${p.max_redemptions}` : ""}${p.active ? "" : " (off)"}`} />) : <T v="muted">No promo codes.</T>}
    </Screen>
  );
}

// ---------------------------------------------------------------- search & moderation
export function AdminSearchScreen() {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"users" | "events" | "orders" | "payments">("events");
  const q = useQuery({ queryKey: ["admin-search", query], queryFn: () => api.get<{ users: any[]; events: any[]; orders: any[]; payments: any[] }>(`/admin/search?q=${encodeURIComponent(query)}`) });
  const { busy, err, run } = useRun(() => void q.refetch());
  const [suspending, setSuspending] = useState<{ kind: "event" | "paid"; e: any } | null>(null);
  const d = q.data;
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <RowView>
        <View style={{ flex: 1 }}><Field accessibilityLabel="Search" placeholder="Email, name, event, order code, payment ref" value={term} onChangeText={setTerm} onSubmitEditing={() => setQuery(term.trim())} autoCapitalize="none" /></View>
        <Button small title="Search" onPress={() => setQuery(term.trim())} />
      </RowView>
      <Segmented value={tab} onChange={setTab} options={[{ key: "events", label: `Events ${d ? d.events.length : ""}` }, { key: "users", label: `Users ${d ? d.users.length : ""}` }, { key: "orders", label: `Orders ${d ? d.orders.length : ""}` }, { key: "payments", label: `Payments ${d ? d.payments.length : ""}` }]} />
      <ErrorBox error={err} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !d ? null : (
        <>
          {tab === "events" && (d.events.length ? d.events.map((e) => (
            <Card key={e.id}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label" style={{ flex: 1 }}>{e.title}</T>
                <StatusBadge status={e.suspended_at ? "suspended" : e.status} />
              </RowView>
              <T v="small">{e.organizer} · {formatDate(e.starts_at, { dateStyle: "medium" })} · paid sales {e.paid_sales_status}</T>
              <RowView style={{ flexWrap: "wrap" }}>
                <Button small v="secondary" title="Open" onPress={() => router.push(`/event/${e.slug}`)} />
                {e.suspended_at ? (
                  <Button small v="secondary" title="Unsuspend" loading={busy === `e${e.id}`} onPress={() => run(`e${e.id}`, () => api.post(`/admin/events/${e.id}/suspend`, { suspended: false, reason: "Review completed" }))} />
                ) : (
                  <Button small v="danger" title="Suspend event" onPress={() => setSuspending({ kind: "event", e })} />
                )}
                {e.paid_sales_status === "suspended" ? (
                  <Button small v="secondary" title="Restore paid sales" loading={busy === `p${e.id}`} onPress={() => run(`p${e.id}`, () => api.post(`/admin/events/${e.id}/paid-sales`, { suspended: false, reason: "Restored by platform admin" }))} />
                ) : e.paid_sales_status === "active" ? (
                  <Button small v="secondary" title="Stop paid sales" onPress={() => setSuspending({ kind: "paid", e })} />
                ) : null}
              </RowView>
            </Card>
          )) : <Empty title="No events" />)}
          {tab === "users" && (d.users.length ? d.users.map((u) => (
            <Card key={u.id}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label" style={{ flex: 1 }}>{u.full_name}</T>
                {u.suspended_at ? <Badge tone="red" label="suspended" /> : <Badge tone="blue" label={u.role.replace("_", " ")} />}
              </RowView>
              <T v="small">{u.email} · joined {formatDate(u.created_at, { dateStyle: "medium" })}</T>
              <Button small v={u.suspended_at ? "secondary" : "danger"} title={u.suspended_at ? "Unsuspend user" : "Suspend user"} loading={busy === `u${u.id}`} onPress={async () => {
                if (!u.suspended_at && !(await confirm("Suspend user?", `${u.email} will be signed out and cannot sign in.`, "Suspend"))) return;
                void run(`u${u.id}`, () => api.post(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended_at }));
              }} />
            </Card>
          )) : <Empty title="No users" />)}
          {tab === "orders" && (d.orders.length ? d.orders.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/order/${o.id}`)}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label">{o.code}</T>
                <StatusBadge status={o.status} />
              </RowView>
              <T v="small">{o.title} · {o.attendee_email} · {kzt(o.total_kzt)} · {formatDate(o.created_at, { dateStyle: "short", timeStyle: "short" })}</T>
            </Card>
          )) : <Empty title="No orders" />)}
          {tab === "payments" && (d.payments.length ? d.payments.map((p) => (
            <Card key={p.id}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label">{humanize(p.purpose)} · {kzt(p.amount_kzt)}</T>
                <StatusBadge status={p.status} />
              </RowView>
              <T v="small">{p.title} · {p.provider}{p.provider === "demo" ? " (DEMO)" : ""} · ref {p.provider_ref} · {formatDate(p.created_at, { dateStyle: "short", timeStyle: "short" })}</T>
            </Card>
          )) : <Empty title="No payments" />)}
        </>
      )}
      <PromptModal
        visible={Boolean(suspending)}
        danger
        title={suspending?.kind === "event" ? `Suspend "${suspending?.e.title}"?` : `Stop paid sales for "${suspending?.e.title}"?`}
        message={suspending?.kind === "event" ? "The event disappears from discovery and all new purchases and registrations are blocked on web and mobile immediately." : "Paid tickets can no longer be bought; free registrations continue."}
        placeholder="Reason (sent to the organizer)"
        confirmLabel="Suspend"
        onCancel={() => setSuspending(null)}
        onSubmit={(reason) => {
          const s = suspending!;
          setSuspending(null);
          void run(`${s.kind}${s.e.id}`, () => api.post(s.kind === "event" ? `/admin/events/${s.e.id}/suspend` : `/admin/events/${s.e.id}/paid-sales`, { suspended: true, reason }));
        }}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------- activation records + event reports
export function AdminReviewScreen() {
  const [tab, setTab] = useState<"reports" | "activations">("reports");
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => api.get<any[]>("/admin/reports") });
  const acts = useQuery({ queryKey: ["admin-activations"], queryFn: () => api.get<any[]>("/admin/activations") });
  const { busy, err, run } = useRun(() => {
    void reports.refetch();
    void acts.refetch();
  });
  return (
    <Screen onRefresh={() => { void reports.refetch(); void acts.refetch(); }} refreshing={reports.isRefetching}>
      <Segmented value={tab} onChange={setTab} options={[{ key: "reports", label: "Event reports" }, { key: "activations", label: "Paid-sales activations" }]} />
      <ErrorBox error={err} />
      {tab === "reports" ? (reports.isLoading ? <Loading /> : !reports.data?.length ? <Empty title="No reports" /> : reports.data.map((r) => (
        <Card key={r.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label" style={{ flex: 1 }}>{r.title}</T>
            {r.resolved_at ? <Badge tone="green" label="resolved" /> : <Badge tone="amber" label="open" />}
          </RowView>
          <T>{r.reason}</T>
          <T v="small">{r.reporter} · {formatDate(r.created_at)}{r.suspended_at ? " · event suspended" : ""}</T>
          <RowView style={{ flexWrap: "wrap" }}>
            {!r.suspended_at ? <Button small v="danger" title="Suspend event" loading={busy === `s${r.id}`} onPress={() => run(`s${r.id}`, () => api.post(`/admin/events/${r.event_id}/suspend`, { suspended: true, reason: `Report: ${r.reason}`.slice(0, 500) }))} /> : null}
            {!r.resolved_at ? <Button small v="secondary" title="Mark resolved" loading={busy === `r${r.id}`} onPress={() => run(`r${r.id}`, () => api.post(`/admin/reports/${r.id}/resolve`))} /> : null}
          </RowView>
        </Card>
      ))) : acts.isLoading ? <Loading /> : !acts.data?.length ? <Empty title="No activation records" /> : acts.data.map((a) => (
        <Card key={a.event_id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label" style={{ flex: 1 }}>{a.title}</T>
            <StatusBadge status={a.paid_sales_status} />
          </RowView>
          <T v="small">{a.organizer} · identity {a.identity_status} · payout {a.payout ?? "—"}</T>
          <KV label="Fee" value={`${kzt(a.fee_kzt)}${a.fee_paid_at ? " · paid (DEMO)" : " · unpaid"}`} />
          <KV label="Terms" value={a.terms_accepted_at ? formatDate(a.terms_accepted_at, { dateStyle: "short" }) : "—"} />
          <KV label="Activated" value={a.activated_at ? formatDate(a.activated_at, { dateStyle: "short" }) : "—"} />
          {a.paid_sales_status === "active" ? <Button small v="secondary" title="Stop paid sales" loading={busy === `p${a.event_id}`} onPress={() => run(`p${a.event_id}`, () => api.post(`/admin/events/${a.event_id}/paid-sales`, { suspended: true, reason: "Stopped after activation review" }))} /> : null}
          {a.paid_sales_status === "suspended" ? <Button small v="secondary" title="Restore paid sales" loading={busy === `p${a.event_id}`} onPress={() => run(`p${a.event_id}`, () => api.post(`/admin/events/${a.event_id}/paid-sales`, { suspended: false, reason: "Restored after review" }))} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- settings + CSV exports
function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [s, setS] = useState({ activation_fee_kzt: initial.activation_fee_kzt ?? "0", processing_fee_percent: initial.processing_fee_percent ?? "0" });
  const [ok, setOk] = useState(false);
  const { busy, err, run } = useRun(() => setOk(true));
  return (
          <>
            <Field label="Paid Sales Activation Fee, KZT" value={s.activation_fee_kzt} onChangeText={(v) => setS({ ...s, activation_fee_kzt: v.replace(/\D/g, "") })} keyboardType="number-pad" />
            <Field label="Processing fee, % of ticket price" value={s.processing_fee_percent} onChangeText={(v) => setS({ ...s, processing_fee_percent: v.replace(/[^\d.]/g, "") })} keyboardType="decimal-pad" />
            {ok ? <Notice tone="green">Settings saved.</Notice> : null}
            <ErrorBox error={err} />
            <Button title="Save settings" loading={busy === "save"} onPress={() => run("save", () => api.put("/admin/settings", { activation_fee_kzt: Number(s.activation_fee_kzt), processing_fee_percent: Number(s.processing_fee_percent) }))} />
          </>
  );
}

export function AdminSettingsScreen() {
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get<Record<string, string>>("/admin/settings") });
  return (
    <Screen>
      <Card>
        <T v="h3">Platform settings</T>
        {q.isLoading ? <Loading /> : q.error || !q.data ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : <SettingsForm initial={q.data} />}
      </Card>
      <Card>
        <T v="h3">Reports (CSV)</T>
        {(["orders", "events", "payments"] as const).map((k) => (
          <Button key={k} small v="secondary" title={`Export ${k}.csv`} onPress={() => saveAndShare(`/admin/export/${k}.csv`, `biletflow-${k}.csv`, "text/csv").catch((e) => notify("Export", String(e?.message ?? e)))} />
        ))}
      </Card>
      <Button v="secondary" title="Account, language & workspaces" onPress={() => router.push("/profile")} />
    </Screen>
  );
}
