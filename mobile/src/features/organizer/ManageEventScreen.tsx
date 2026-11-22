import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, Switch, View } from "react-native";
import { Badge, Button, Card, Chip, Divider, Empty, ErrorBox, ErrorView, Field, KV, ListRow, Loading, Notice, RowView, Screen, Segmented, StatusBadge, T, confirm, notify } from "@/components/ui";
import { DateTimeField, EventImage, PromptModal } from "@/components/widgets";
import { EventAnalytics } from "@/features/analytics/OrganizerDashboardScreen";
import { webLink } from "@/lib/config";
import { saveAndShare } from "@/lib/files";
import { formatDate, humanize, kzt } from "@/lib/format";
import { useColors } from "@/lib/theme";
import { api } from "@/services/api";

type Section = "overview" | "tickets" | "activation" | "campaigns" | "attendees" | "orders" | "staff" | "history" | "analytics";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "activation", label: "Paid sales" },
  { key: "campaigns", label: "Campaigns" },
  { key: "attendees", label: "Attendees" },
  { key: "orders", label: "Orders" },
  { key: "staff", label: "Staff" },
  { key: "history", label: "History" },
  { key: "analytics", label: "Analytics" },
];

/** Runs an API action with a busy flag and an error message. */
function useAction(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  return { busy, err, run, setErr };
}

export default function ManageEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const q = useQuery({ queryKey: ["org-event", id], queryFn: () => api.get(`/organizer/events/${id}`) });
  const refresh = () => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["org-events"] });
    void qc.invalidateQueries({ queryKey: ["org-analytics"] });
  };
  const e = q.data;
  if (q.isLoading) return <Loading />;
  if (q.error || !e) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Screen onRefresh={refresh} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: e.title }} />
      <RowView style={{ flexWrap: "wrap" }}>
        <StatusBadge status={e.status} />
        <StatusBadge status={e.lifecycle} />
        <Badge label={e.visibility} />
        <Badge tone={e.paid_sales_status === "active" ? "green" : "gray"} label={`paid sales ${e.paid_sales_status}`} />
        {e.suspended_at ? <Badge tone="red" label="suspended by platform" /> : null}
      </RowView>
      <Segmented value={section} onChange={setSection} options={SECTIONS} />
      {section === "overview" && <Overview e={e} refresh={refresh} />}
      {section === "tickets" && <Tickets e={e} refresh={refresh} />}
      {section === "activation" && <Activation e={e} refresh={refresh} />}
      {section === "campaigns" && <Campaigns e={e} />}
      {section === "attendees" && <Attendees e={e} />}
      {section === "orders" && <Orders e={e} refresh={refresh} />}
      {section === "staff" && <Staff e={e} refresh={refresh} />}
      {section === "history" && <History e={e} />}
      {section === "analytics" && <EventAnalytics eventId={e.id} />}
    </Screen>
  );
}

// ---------------------------------------------------------------- overview & lifecycle actions
function Overview({ e, refresh }: { e: any; refresh: () => void }) {
  const { busy, err, run } = useAction(refresh);
  const [cancelling, setCancelling] = useState(false);
  const s = e.stats ?? {};
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return notify("Photos", "Allow access to your photos to choose a cover image.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [16, 9] });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const form = new FormData();
    const type = a.mimeType ?? "image/jpeg";
    // React Native FormData accepts { uri, name, type } for files.
    form.append("image", { uri: a.uri, name: a.fileName ?? `cover.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
    await run("image", () => api.post(`/organizer/events/${e.id}/image`, form));
  };
  const link = webLink(`/events/${e.slug}${e.visibility === "private" ? `?key=${e.private_token}` : ""}`);
  return (
    <>
      <EventImage src={e.image_url} category={e.category} height={170} />
      <Button small v="secondary" title="Change cover image" loading={busy === "image"} onPress={pickImage} />
      <Card>
        <T v="h3">{e.title}</T>
        <T v="muted">{formatDate(e.starts_at, { dateStyle: "full", timeStyle: "short" })} – {formatDate(e.ends_at, { timeStyle: "short" })}</T>
        <T v="muted">{e.venue?.name}, {e.venue?.address}</T>
        <KV label="Capacity" value={e.capacity} />
        <KV label="Sold / reserved" value={`${s.sold ?? 0} / ${s.reserved ?? 0}`} />
        <KV label="Checked in" value={s.checked_in ?? 0} />
        <KV label="Refunded / cancelled tickets" value={`${s.refunded ?? 0} / ${s.cancelled ?? 0}`} />
      </Card>
      <ErrorBox error={err} />
      {e.status === "draft" ? <Button title="Publish" loading={busy === "publish"} onPress={() => run("publish", () => api.post(`/organizer/events/${e.id}/publish`))} /> : null}
      {e.status === "published" ? <Button v="secondary" title="Unpublish (back to draft)" loading={busy === "unpublish"} onPress={() => run("unpublish", () => api.post(`/organizer/events/${e.id}/unpublish`))} /> : null}
      <RowView>
        <Button style={{ flex: 1 }} v="secondary" title="Edit details" disabled={e.status === "cancelled"} onPress={() => router.push(`/org-event-edit/${e.id}`)} />
        <Button style={{ flex: 1 }} v="secondary" title="Preview" onPress={() => router.push({ pathname: "/event/[slug]", params: { slug: e.slug, ...(e.visibility === "private" ? { key: e.private_token } : {}) } })} />
      </RowView>
      <RowView>
        <Button style={{ flex: 1 }} v="secondary" title="Share link" onPress={() => Share.share({ message: `${e.title}\n${link}`, url: link })} />
        <Button style={{ flex: 1 }} v="secondary" title="Duplicate" loading={busy === "dup"} onPress={() => run("dup", async () => {
          const copy = await api.post<{ id: number }>(`/organizer/events/${e.id}/duplicate`);
          router.push(`/org-event/${copy.id}`);
        })} />
      </RowView>
      {e.visibility === "private" ? <T v="small">Private invite link: {link}</T> : null}
      <Button small v="ghost" title="Open check-in scanner" onPress={() => router.push(`/scan/${e.id}`)} />
      {e.status !== "cancelled" ? <Button v="danger" title="Cancel event" onPress={() => setCancelling(true)} /> : <Notice tone="red">This event is cancelled. All tickets were invalidated and paid orders refunded (DEMO).</Notice>}
      <PromptModal
        visible={cancelling}
        danger
        title="Cancel this event?"
        message="Every ticket becomes invalid: free ones are cancelled, paid ones refunded (DEMO). Ticket holders are notified. This cannot be undone."
        placeholder="Reason shown to attendees"
        confirmLabel="Cancel event"
        onCancel={() => setCancelling(false)}
        onSubmit={(reason) => {
          setCancelling(false);
          void run("cancel", () => api.post(`/organizer/events/${e.id}/cancel`, { reason }));
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- ticket types
function Tickets({ e, refresh }: { e: any; refresh: () => void }) {
  const c = useColors();
  const { busy, err, run } = useAction(refresh);
  const blank = { name: "", description: "", priceKzt: "0", quantity: "100", maxPerOrder: "10", hidden: false, salesStart: null as Date | null, salesEnd: null as Date | null, sectionCodes: [] as string[] };
  const [form, setForm] = useState<typeof blank | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const sections: string[] = e.seating === "assigned" ? (e.venue?.layout?.sectors?.map((s: { code: string }) => s.code) ?? ["A", "B", "C", "D", "E", "F", "G", "H"]) : [];
  const save = () =>
    run("save", async () => {
      if (!form) return;
      const body = { name: form.name.trim(), description: form.description, priceKzt: Number(form.priceKzt || 0), quantity: Number(form.quantity || 0), maxPerOrder: Number(form.maxPerOrder || 1), hidden: form.hidden, salesStart: form.salesStart?.toISOString() ?? null, salesEnd: form.salesEnd?.toISOString() ?? null, sectionCodes: form.sectionCodes };
      if (editId) await api.patch(`/organizer/ticket-types/${editId}`, body);
      else await api.post(`/organizer/events/${e.id}/ticket-types`, body);
      setForm(null);
      setEditId(null);
    });
  return (
    <>
      {e.paid_sales_status !== "active" ? <Notice tone="amber">Paid tickets can be sold only after paid sales activation (Paid sales tab). Free tickets work right away.</Notice> : null}
      <ErrorBox error={err} />
      {e.ticketTypes.length === 0 ? <Empty title="No ticket types yet" text="Add at least one ticket type before publishing." /> : null}
      {e.ticketTypes.map((t: any) => (
        <Card key={t.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="h3" style={{ flex: 1 }}>{t.name}</T>
            {t.hidden ? <Badge label="hidden" /> : null}
          </RowView>
          <T v="price">{t.price_kzt === 0 ? "Free" : kzt(t.price_kzt)}</T>
          <KV label="Quantity" value={t.quantity} />
          <KV label="Sold / reserved / available" value={`${t.sold} / ${t.reserved} / ${Math.max(t.quantity - t.sold - t.reserved, 0)}`} />
          <KV label="Max per order" value={t.max_per_order} />
          {t.sales_start || t.sales_end ? <T v="small">Sales: {formatDate(t.sales_start)} → {formatDate(t.sales_end)}</T> : null}
          {t.section_codes?.length ? <T v="small">Sections: {t.section_codes.join(", ")}</T> : null}
          <RowView style={{ flexWrap: "wrap" }}>
            <Button small v="secondary" title="Edit" onPress={() => { setEditId(t.id); setForm({ name: t.name, description: t.description ?? "", priceKzt: String(t.price_kzt), quantity: String(t.quantity), maxPerOrder: String(t.max_per_order), hidden: t.hidden, salesStart: t.sales_start ? new Date(t.sales_start) : null, salesEnd: t.sales_end ? new Date(t.sales_end) : null, sectionCodes: t.section_codes ?? [] }); }} />
            <Button small v="secondary" title={t.hidden ? "Show" : "Hide"} loading={busy === `h${t.id}`} onPress={() => run(`h${t.id}`, () => api.patch(`/organizer/ticket-types/${t.id}`, { hidden: !t.hidden }))} />
            <Button small v="ghost" title="Delete" onPress={async () => { if (await confirm("Delete ticket type?", t.name, "Delete")) void run(`d${t.id}`, () => api.del(`/organizer/ticket-types/${t.id}`)); }} />
          </RowView>
        </Card>
      ))}
      {form ? (
        <Card>
          <T v="h3">{editId ? "Edit ticket type" : "New ticket type"}</T>
          <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="VIP, Early bird, Standard…" />
          <Field label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
          <Field label="Price, KZT (0 = free)" value={form.priceKzt} onChangeText={(v) => setForm({ ...form, priceKzt: v.replace(/\D/g, "") })} keyboardType="number-pad" />
          <Field label="Quantity" value={form.quantity} onChangeText={(v) => setForm({ ...form, quantity: v.replace(/\D/g, "") })} keyboardType="number-pad" />
          <Field label="Max per order" value={form.maxPerOrder} onChangeText={(v) => setForm({ ...form, maxPerOrder: v.replace(/\D/g, "") })} keyboardType="number-pad" hint={Number(form.priceKzt) === 0 ? "Free tickets: one per account per event (the server enforces 1)." : undefined} />
          <DateTimeField label="Sales start (optional)" value={form.salesStart} onChange={(d) => setForm({ ...form, salesStart: d })} optional />
          <DateTimeField label="Sales end (optional)" value={form.salesEnd} onChange={(d) => setForm({ ...form, salesEnd: d })} optional />
          {sections.length ? (
            <>
              <T v="label">Seat sections sold with this type</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{sections.map((s) => <Chip key={s} label={s} active={form.sectionCodes.includes(s)} onPress={() => setForm({ ...form, sectionCodes: form.sectionCodes.includes(s) ? form.sectionCodes.filter((x) => x !== s) : [...form.sectionCodes, s] })} />)}</View>
            </>
          ) : null}
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label">Hidden (not on sale)</T>
            <Switch accessibilityLabel="Hidden" value={form.hidden} onValueChange={(v) => setForm({ ...form, hidden: v })} />
          </RowView>
          <RowView>
            <Button style={{ flex: 1 }} title="Save" loading={busy === "save"} disabled={!form.name.trim()} onPress={save} />
            <Button style={{ flex: 1 }} v="secondary" title="Cancel" onPress={() => { setForm(null); setEditId(null); }} />
          </RowView>
        </Card>
      ) : (
        <Button title="+ Add ticket type" disabled={e.status === "cancelled"} onPress={() => setForm(blank)} />
      )}
      <T v="small" color={c.muted}>Inventory is enforced by the server: quantity can never drop below sold + reserved.</T>
    </>
  );
}

// ---------------------------------------------------------------- paid sales activation (simulated)
function Activation({ e, refresh }: { e: any; refresh: () => void }) {
  const { busy, err, run } = useAction(refresh);
  const a = e.activation;
  const done = (k: string) => a?.steps.find((s: any) => s.key === k)?.done;
  return (
    <>
      <Notice tone="amber">Simulation for the academic MVP: no real identity check, bank account or money. Activation applies to this event only.</Notice>
      <Card>
        <KV label="Status" value={<StatusBadge status={a?.status ?? e.paid_sales_status} />} />
        {a?.steps.map((s: any) => <ListRow key={s.key} title={`${s.done ? "✅" : "⬜"} ${s.label}`} />)}
      </Card>
      <ErrorBox error={err} />
      {!done("paid_ticket_type") ? <Button v="secondary" title="Add a paid ticket type" onPress={() => notify("Tickets tab", "Open the Tickets tab and add a ticket type with a price above 0.")} /> : null}
      {!done("identity") || !done("payout") ? <Button v="secondary" title="Verify identity & add payout (Organizer profile)" onPress={() => router.push("/org-profile")} /> : null}
      {!done("fee") ? <Button title={`Pay activation fee (${kzt(a?.feeKzt)}, DEMO)`} loading={busy === "fee"} onPress={() => run("fee", async () => {
        const p = await api.post<{ paymentId: number }>(`/organizer/events/${e.id}/activation/pay`, { provider: "demo" });
        router.push(`/pay/${p.paymentId}`);
      })} /> : null}
      {!done("terms") ? <Button v="secondary" title="Accept the paid-event terms" loading={busy === "terms"} onPress={() => run("terms", () => api.post(`/organizer/events/${e.id}/activation/terms`))} /> : null}
      <Button v="ghost" title="Re-check activation" loading={busy === "check"} onPress={() => run("check", () => api.post(`/organizer/events/${e.id}/activation/check`))} />
    </>
  );
}

// ---------------------------------------------------------------- campaigns & Campaign QR
function Campaigns({ e }: { e: any }) {
  const q = useQuery({ queryKey: ["campaigns", e.id], queryFn: () => api.get<any[]>(`/organizer/events/${e.id}/campaigns`) });
  const { busy, err, run } = useAction(() => void q.refetch());
  const [form, setForm] = useState<null | { name: string; code: string; discountType: "percent" | "fixed"; discountValue: string; maxRedemptions: string; validFrom: Date | null; validUntil: Date | null; ticketTypeIds: number[] }>(null);
  const [qr, setQr] = useState<number | null>(null);
  return (
    <>
      <ErrorBox error={err} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="No campaigns yet" text="Promo codes give a percentage or a fixed KZT discount; each has a Campaign QR code." /> : q.data.map((c) => (
        <Card key={c.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="h3" style={{ flex: 1 }}>{c.name}</T>
            <StatusBadge status={c.active ? "active" : "inactive"} />
          </RowView>
          <T v="mono">{c.code} · {c.discount_type === "percent" ? `${c.discount_value}%` : kzt(c.discount_value)} off</T>
          <KV label="Redemptions" value={`${c.redemptions}${c.max_redemptions ? ` / ${c.max_redemptions}` : ""}`} />
          <KV label="Visits (QR/link)" value={c.visits} />
          <KV label="Tickets / revenue" value={`${c.tickets} / ${kzt(c.revenue_kzt)}`} />
          <KV label="Discount given" value={kzt(c.discount_kzt)} />
          {c.valid_until ? <T v="small">Valid until {formatDate(c.valid_until)}</T> : null}
          <RowView style={{ flexWrap: "wrap" }}>
            <Button small v="secondary" title={c.active ? "Disable" : "Enable"} loading={busy === `a${c.id}`} onPress={() => run(`a${c.id}`, () => api.patch(`/organizer/campaigns/${c.id}`, { active: !c.active }))} />
            <Button small v="secondary" title={qr === c.id ? "Hide QR" : "Campaign QR"} onPress={() => setQr(qr === c.id ? null : c.id)} />
            <Button small v="ghost" title="Share QR" onPress={() => saveAndShare(`/organizer/campaigns/${c.id}/qr.png`, `promo-${c.code}.png`, "image/png").catch((x) => notify("Share", String(x?.message ?? x)))} />
          </RowView>
          {qr === c.id ? (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Image source={{ uri: `${api.apiUrl}/organizer/campaigns/${c.id}/qr.png`, headers: api.authHeaders() }} style={{ width: 220, height: 220 }} accessibilityLabel={`Campaign QR for ${c.code}`} />
              <T v="small" center>Orange promo QR → opens the event with {c.code}. It is NOT an admission ticket; scanners reject it.</T>
              <T v="small" center>{webLink(`/c/${c.token}`)}</T>
            </View>
          ) : null}
        </Card>
      ))}
      {form ? (
        <Card>
          <T v="h3">New promo campaign</T>
          <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Field label="Code (optional, auto-generated)" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })} autoCapitalize="characters" />
          <RowView>
            <Chip label="Percent %" active={form.discountType === "percent"} onPress={() => setForm({ ...form, discountType: "percent" })} />
            <Chip label="Fixed ₸" active={form.discountType === "fixed"} onPress={() => setForm({ ...form, discountType: "fixed" })} />
          </RowView>
          <Field label={form.discountType === "percent" ? "Discount, %" : "Discount, KZT"} value={form.discountValue} onChangeText={(v) => setForm({ ...form, discountValue: v.replace(/\D/g, "") })} keyboardType="number-pad" />
          <Field label="Max redemptions (optional)" value={form.maxRedemptions} onChangeText={(v) => setForm({ ...form, maxRedemptions: v.replace(/\D/g, "") })} keyboardType="number-pad" />
          <DateTimeField label="Valid from (optional)" value={form.validFrom} onChange={(d) => setForm({ ...form, validFrom: d })} optional />
          <DateTimeField label="Valid until (optional)" value={form.validUntil} onChange={(d) => setForm({ ...form, validUntil: d })} optional />
          <T v="label">Applies to (none selected = all paid types)</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{e.ticketTypes.filter((t: any) => t.price_kzt > 0).map((t: any) => <Chip key={t.id} label={t.name} active={form.ticketTypeIds.includes(t.id)} onPress={() => setForm({ ...form, ticketTypeIds: form.ticketTypeIds.includes(t.id) ? form.ticketTypeIds.filter((x) => x !== t.id) : [...form.ticketTypeIds, t.id] })} />)}</View>
          <RowView>
            <Button style={{ flex: 1 }} title="Create" loading={busy === "create"} disabled={form.name.trim().length < 2 || !Number(form.discountValue)} onPress={() => run("create", async () => {
              await api.post(`/organizer/events/${e.id}/campaigns`, { name: form.name.trim(), ...(form.code.trim() ? { code: form.code.trim() } : {}), discountType: form.discountType, discountValue: Number(form.discountValue), maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null, validFrom: form.validFrom?.toISOString() ?? null, validUntil: form.validUntil?.toISOString() ?? null, ticketTypeIds: form.ticketTypeIds });
              setForm(null);
            })} />
            <Button style={{ flex: 1 }} v="secondary" title="Cancel" onPress={() => setForm(null)} />
          </RowView>
        </Card>
      ) : (
        <Button title="+ New campaign" onPress={() => setForm({ name: "", code: "", discountType: "percent", discountValue: "10", maxRedemptions: "", validFrom: null, validUntil: null, ticketTypeIds: [] })} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- attendees
function Attendees({ e }: { e: any }) {
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["org-attendees", e.id, search], queryFn: () => api.get<any[]>(`/organizer/events/${e.id}/attendees?search=${encodeURIComponent(search)}`) });
  return (
    <>
      <RowView>
        <View style={{ flex: 1 }}><Field accessibilityLabel="Search attendees" placeholder="Name, email or ticket code" value={term} onChangeText={setTerm} onSubmitEditing={() => setSearch(term.trim())} /></View>
        <Button small title="Search" onPress={() => setSearch(term.trim())} />
      </RowView>
      <Button small v="secondary" title="Export CSV (share)" onPress={() => saveAndShare(`/organizer/events/${e.id}/attendees?format=csv`, `attendees-${e.slug}.csv`, "text/csv").catch((x) => notify("Export", String(x?.message ?? x)))} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No attendees" /> : (
        <>
          <T v="small">{q.data.length} tickets · {q.data.filter((a) => a.status === "checked_in").length} checked in</T>
          {q.data.map((a) => (
            <Card key={a.id}>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label" style={{ flex: 1 }}>{a.attendee_name}</T>
                <StatusBadge status={a.status} />
              </RowView>
              <T v="small">{a.ticket_type} · {a.code} · {a.attendee_email}{a.section_code ? ` · ${a.section_code}-${a.row_label}-${a.seat_number}` : ""}</T>
              {a.checked_in_at ? <T v="small">Checked in {formatDate(a.checked_in_at)}</T> : null}
            </Card>
          ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- orders & refunds
function Orders({ e, refresh }: { e: any; refresh: () => void }) {
  const q = useQuery({ queryKey: ["org-orders", e.id], queryFn: () => api.get<any[]>(`/organizer/events/${e.id}/orders`) });
  const { err, run } = useAction(() => { void q.refetch(); refresh(); });
  const [refunding, setRefunding] = useState<any | null>(null);
  return (
    <>
      <ErrorBox error={err} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="No orders yet" /> : q.data.map((o) => (
        <Card key={o.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label">{o.code} · {o.attendee_name}</T>
            <StatusBadge status={o.status} />
          </RowView>
          <T v="small">{o.attendee_email} · {o.tickets} ticket(s) · {formatDate(o.created_at)}</T>
          <KV label="Total" value={o.total_kzt === 0 ? "Free" : kzt(o.total_kzt)} />
          {o.discount_kzt > 0 ? <T v="small">Promo {o.promo_code}: −{kzt(o.discount_kzt)}</T> : null}
          {o.status === "paid" ? <Button small v="secondary" title={o.total_kzt > 0 ? "Refund (DEMO)" : "Cancel registration"} onPress={() => setRefunding(o)} /> : null}
        </Card>
      ))}
      <PromptModal
        visible={Boolean(refunding)}
        danger
        title={refunding?.total_kzt > 0 ? `Refund order ${refunding?.code}?` : `Cancel registration ${refunding?.code}?`}
        message="All tickets in the order become invalid immediately (the scanner rejects them) and the attendee is notified. Orders with a checked-in ticket cannot be refunded."
        placeholder="Reason"
        confirmLabel={refunding?.total_kzt > 0 ? "Refund" : "Cancel registration"}
        onCancel={() => setRefunding(null)}
        onSubmit={(reason) => {
          const o = refunding;
          setRefunding(null);
          void run("refund", () => api.post(`/organizer/orders/${o.id}/refund`, { reason }));
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- staff (Event Admins)
function Staff({ e, refresh }: { e: any; refresh: () => void }) {
  const { busy, err, run } = useAction(refresh);
  const [email, setEmail] = useState("");
  const [canUndo, setCanUndo] = useState(true);
  return (
    <>
      <T v="muted">Event Admins can scan tickets for this event in the mobile app or on the website. They do not get organizer or platform rights.</T>
      <ErrorBox error={err} />
      {e.staff.length ? e.staff.map((s: any) => (
        <Card key={s.id}>
          <T v="label">{s.full_name}</T>
          <T v="small">{s.email} · {s.can_undo ? "can undo check-ins" : "cannot undo"}</T>
          <Button small v="ghost" title="Remove" onPress={async () => { if (await confirm("Remove Event Admin?", s.email, "Remove")) void run(`r${s.id}`, () => api.del(`/organizer/events/${e.id}/staff/${s.id}`)); }} />
        </Card>
      )) : <Empty title="No Event Admins yet" />}
      <Card>
        <Field label="Email of a BiletFlow account" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="label">Allowed to undo check-ins</T>
          <Switch accessibilityLabel="Allowed to undo check-ins" value={canUndo} onValueChange={setCanUndo} />
        </RowView>
        <Button title="Assign Event Admin" loading={busy === "add"} disabled={!email.includes("@")} onPress={() => run("add", async () => {
          await api.post(`/organizer/events/${e.id}/staff`, { email: email.trim(), canUndo });
          setEmail("");
        })} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- history (append-only audit log)
const HISTORY_TYPES = ["", "event", "ticket_type", "order", "campaign", "checkin", "support", "staff", "activation"];
function History({ e }: { e: any }) {
  const [type, setType] = useState("");
  const q = useQuery({ queryKey: ["org-history", e.id, type], queryFn: () => api.get<any[]>(`/organizer/events/${e.id}/history${type ? `?type=${type}` : ""}`) });
  return (
    <>
      <Segmented value={type} onChange={setType} options={HISTORY_TYPES.map((t) => ({ key: t, label: t ? humanize(t) : "All" }))} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="No history entries" /> : q.data.map((h) => (
        <View key={h.id} style={{ gap: 2, paddingVertical: 6 }}>
          <T v="label">{h.description}</T>
          <T v="small">{formatDate(h.created_at)} · {h.actor ?? "system"} · {h.action}</T>
          <Divider />
        </View>
      ))}
    </>
  );
}

