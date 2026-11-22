import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Button, Card, Empty, ErrorBox, ErrorView, Field, KV, Loading, Notice, RowView, Screen, Segmented, StatusBadge, T } from "@/components/ui";
import { ProgressBar } from "@/components/widgets";
import { formatDate, kzt } from "@/lib/format";
import { api } from "@/services/api";

type Lifecycle = "all" | "draft" | "upcoming" | "active" | "completed" | "cancelled";

export function OrganizerEventsScreen() {
  const [filter, setFilter] = useState<Lifecycle>("all");
  const q = useQuery({ queryKey: ["org-events"], queryFn: () => api.get<any[]>("/organizer/events") });
  const list = (q.data ?? []).filter((e) => filter === "all" || e.lifecycle === filter);
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Button title="+ Create event" onPress={() => router.push("/org-event-new")} />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[{ key: "all", label: "All" }, { key: "draft", label: "Drafts" }, { key: "upcoming", label: "Upcoming" }, { key: "active", label: "Active" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" }]}
      />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !list.length ? <Empty title="No events" text="Create your first event — free events need no activation." /> : list.map((e) => (
        <Card key={e.id} onPress={() => router.push(`/org-event/${e.id}`)} accessibilityLabel={`${e.title}, ${e.lifecycle}`}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="h3" style={{ flex: 1 }} numberOfLines={2}>{e.title}</T>
            <StatusBadge status={e.lifecycle} />
          </RowView>
          <T v="muted">{formatDate(e.starts_at)} · {e.venue_name}</T>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="small">{e.sold} / {e.quantity} sold</T>
            <T v="label">{kzt(e.gross_kzt)}</T>
          </RowView>
          <ProgressBar percent={e.quantity ? (e.sold / e.quantity) * 100 : 0} />
          {e.suspended_at ? <StatusBadge status="suspended" label="suspended by platform" /> : null}
        </Card>
      ))}
    </Screen>
  );
}

/** Organizer profile, simulated identity verification and demo payout account (needed for paid sales). */
export function OrganizerProfileScreen() {
  const q = useQuery({ queryKey: ["org-profile"], queryFn: () => api.get<{ profile: any; payout: any }>("/organizer/profile") });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  return <OrganizerProfileForm data={q.data} reload={() => q.refetch()} />;
}

function OrganizerProfileForm({ data, reload }: { data: { profile: any; payout: any }; reload: () => Promise<unknown> }) {
  const pr = data.profile ?? {};
  const [p, setP] = useState({ displayName: pr.display_name ?? "", contactEmail: pr.contact_email ?? "", contactPhone: pr.contact_phone ?? "", bio: pr.bio ?? "" });
  const [idv, setIdv] = useState({ fullLegalName: "", documentLast4: "" });
  const [payout, setPayout] = useState({ bankName: "Demo Bank", holderName: "", iban: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    setErr(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      await reload();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const verified = data.profile?.identity_status === "verified";
  return (
    <Screen>
      <Stack.Screen options={{ title: "Organizer profile" }} />
      {ok ? <Notice tone="green">{ok}</Notice> : null}
      <ErrorBox error={err} />
      <Card>
        <T v="h3">Public profile</T>
        <Field label="Display name" value={p.displayName} onChangeText={(v) => setP({ ...p, displayName: v })} />
        <Field label="Contact email" value={p.contactEmail} onChangeText={(v) => setP({ ...p, contactEmail: v })} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Contact phone" value={p.contactPhone} onChangeText={(v) => setP({ ...p, contactPhone: v })} keyboardType="phone-pad" />
        <Field label="About" value={p.bio} onChangeText={(v) => setP({ ...p, bio: v })} multiline />
        <Button title="Save profile" loading={busy === "p"} disabled={p.displayName.trim().length < 2} onPress={() => run("p", () => api.put("/organizer/profile", { displayName: p.displayName.trim(), contactEmail: p.contactEmail || null, contactPhone: p.contactPhone || null, bio: p.bio || null }), "Profile saved.")} />
      </Card>
      <Card>
        <T v="h3">Identity verification (simulation)</T>
        <KV label="Status" value={<StatusBadge status={verified ? "verified" : "inactive"} label={verified ? "verified" : "not verified"} />} />
        {!verified ? (
          <>
            <Field label="Full legal name" value={idv.fullLegalName} onChangeText={(v) => setIdv({ ...idv, fullLegalName: v })} />
            <Field label="Last 4 digits of ID document" value={idv.documentLast4} onChangeText={(v) => setIdv({ ...idv, documentLast4: v.replace(/\D/g, "").slice(0, 4) })} keyboardType="number-pad" hint="Only the last 4 digits — no full document numbers are collected." />
            <Button v="secondary" title="Verify (simulated)" loading={busy === "id"} disabled={idv.fullLegalName.length < 3 || idv.documentLast4.length !== 4} onPress={() => run("id", () => api.post("/organizer/verify-identity", idv), "Identity verified (simulation).")} />
          </>
        ) : null}
      </Card>
      <Card>
        <T v="h3">Payout account (demo)</T>
        {data.payout ? <T v="muted">{data.payout.bank_name} · {data.payout.holder_name} · ••{data.payout.iban_last4}</T> : <T v="muted">Not connected</T>}
        <Field label="Bank" value={payout.bankName} onChangeText={(v) => setPayout({ ...payout, bankName: v })} />
        <Field label="Account holder" value={payout.holderName} onChangeText={(v) => setPayout({ ...payout, holderName: v })} />
        <Field label="IBAN (KZ + 18 characters)" value={payout.iban} onChangeText={(v) => setPayout({ ...payout, iban: v.toUpperCase().replace(/\s/g, "") })} autoCapitalize="characters" hint="Use a test IBAN such as KZ000000000000000000. Only the last 4 characters are stored." />
        <Button v="secondary" title="Save payout account" loading={busy === "pay"} disabled={!/^KZ[0-9A-Z]{18}$/.test(payout.iban) || payout.holderName.length < 3} onPress={() => run("pay", () => api.put("/organizer/payout-account", payout), "Payout account saved (demo).")} />
      </Card>
    </Screen>
  );
}
