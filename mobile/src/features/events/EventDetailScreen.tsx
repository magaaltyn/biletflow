import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Share, View } from "react-native";
import { SeatPicker } from "@/components/SeatMap";
import { Badge, Button, Card, Chip, Divider, ErrorBox, ErrorView, Field, KV, Loading, Notice, RowView, Screen, Stepper, T, notify } from "@/components/ui";
import { EventImage, PromptModal } from "@/components/widgets";
import { useAuth } from "@/features/auth/AuthProvider";
import { assetUrl, webLink } from "@/lib/config";
import { saveAndShare } from "@/lib/files";
import { formatDate, kzt } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import type { EventDetail, Quote, Seat } from "@/lib/types";
import { api, qs } from "@/services/api";

export default function EventDetailScreen() {
  const { t } = useT();
  const params = useLocalSearchParams<{ slug: string; c?: string; key?: string }>();
  const query = { c: params.c, key: params.key };
  const ev = useQuery({ queryKey: ["event", params.slug, query], queryFn: () => api.get<EventDetail>(`/events/by-slug/${params.slug}${qs(query)}`) });
  if (ev.isLoading) return <Loading />;
  if (ev.error || !ev.data) return <ErrorView error={ev.error ?? "Event not found"} onRetry={() => ev.refetch()} retryLabel={t("retry")} />;
  return <EventView e={ev.data} accessKey={params.key} />;
}

function EventView({ e, accessKey }: { e: EventDetail; accessKey?: string }) {
  const c = useColors();
  const { t, locale } = useT();
  const { user } = useAuth();

  const [qty, setQty] = useState<Record<number, number>>({});
  const [seatIds, setSeatIds] = useState<number[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  // A Campaign QR / promo link pre-applies its code; the server validated it in /by-slug (SRS 4.14).
  const [promo, setPromo] = useState(e.campaign?.code ?? "");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(e.campaign?.code ?? null);
  const [campaignToken, setCampaignToken] = useState<string | null>(e.campaign?.code ? (e.campaign.token ?? null) : null);
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [view, setView] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const items = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ ticketTypeId: Number(id), quantity: q })), [qty]);
  const hasSelection = e.seating === "assigned" ? seatIds.length > 0 : items.length > 0;

  // Price preview from the server (never computed on the phone). Cached per selection.
  const quoteQ = useQuery({
    queryKey: ["quote", e.id, items, seatIds, appliedPromo, campaignToken],
    enabled: hasSelection,
    placeholderData: (prev) => prev,
    queryFn: () => api.post<Quote>("/orders/quote", { eventId: e.id, items, seatIds, promoCode: campaignToken ? null : appliedPromo, campaignToken }),
  });
  const quote = hasSelection ? (quoteQ.data ?? null) : null;

  const tz = e.venue.timezone;
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => formatDate(d, o, locale, tz);
  const closed = e.status !== "published";
  const paidBlocked = e.paid_sales_status !== "active";

  const checkout = async () => {
    if (!user) {
      router.push({ pathname: "/login", params: { next: `/event/${e.slug}` } });
      return;
    }
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr("Enter the attendee name and a valid email");
      return;
    }
    setBusy(true);
    setErr(null);
    // Only a code the server accepted in the preview is sent; an invalid code is ignored, not a blocker (same as the website).
    const promoOk = Boolean(quote?.promo);
    try {
      const order = await api.post<{ id: number }>("/orders", {
        eventId: e.id,
        items,
        seatIds,
        promoCode: promoOk && !campaignToken ? appliedPromo : null,
        campaignToken: promoOk ? campaignToken : null,
        attendeeName: name.trim(),
        attendeeEmail: email.trim(),
      });
      setQty({});
      setSeatIds([]);
      router.push(`/order/${order.id}`);
    } catch (x) {
      setErr(x);
      if (e.seating === "assigned") setSeatIds([]);
    } finally {
      setBusy(false);
    }
  };

  const share = () => Share.share({ title: e.title, message: `${e.title}\n${webLink(`/events/${e.slug}`)}`, url: webLink(`/events/${e.slug}`) }).catch(() => undefined);
  const viewSection = e.sections.find((s) => s.code === view);
  const seatLabels = { available: t("available"), selected: t("selected"), held: t("held"), sold: t("sold"), section: t("section"), row: t("row"), seat: t("seat") };

  return (
    <Screen>
      <Stack.Screen options={{ title: e.title }} />
      {e.isPreview ? <Notice tone="amber">Preview — this event is a draft and not visible to the public yet.</Notice> : null}
      {e.status === "cancelled" ? <Notice tone="amber">This event was cancelled. Download the calendar file again to remove it from your calendar.</Notice> : null}
      <EventImage src={e.image_url} category={e.category} height={200} />
      <RowView style={{ alignItems: "flex-start" }} gap={12}>
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 8, alignItems: "center", backgroundColor: c.card }}>
          <T v="small" style={{ textTransform: "uppercase", fontWeight: "700" }}>{fmt(e.starts_at, { month: "short" })}</T>
          <T v="h2">{fmt(e.starts_at, { day: "numeric" })}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title" style={{ fontSize: 22 }}>{e.title}</T>
          <T v="small" color={c.brand} style={{ fontWeight: "700" }}>{e.category} · {e.organizer.display_name}</T>
        </View>
      </RowView>
      <RowView style={{ flexWrap: "wrap" }}>
        <Button small v="secondary" title={t("share")} onPress={share} />
        <Button small v="secondary" title="Google" onPress={() => Linking.openURL(e.calendar.google)} accessibilityLabel={`${t("addToCalendar")}: Google`} />
        <Button small v="secondary" title="Outlook" onPress={() => Linking.openURL(e.calendar.outlook)} accessibilityLabel={`${t("addToCalendar")}: Outlook`} />
        <Button small v="secondary" title=".ics" accessibilityLabel={`${t("addToCalendar")}: Apple / .ics`} onPress={() => saveAndShare(`/events/${e.id}/calendar.ics${qs({ key: accessKey })}`, `${e.slug}.ics`, "text/calendar").catch((x) => notify("Calendar", String(x?.message ?? x)))} />
      </RowView>
      <Card>
        <T>📅 {fmt(e.starts_at, { dateStyle: "full", timeStyle: "short" })} – {fmt(e.ends_at, { timeStyle: "short" })}</T>
        <T v="small">{tz}</T>
        <T>📍 {e.venue.name}, {e.venue.address}</T>
      </Card>
      <Card>
        <T v="h3">{t("aboutEvent")}</T>
        <T>{e.description}</T>
        <T v="small">Refund policy: {e.refund_policy}</T>
      </Card>

      {/* ---------------- tickets */}
      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="h3">{t("tickets")}</T>
          {e.remaining > 0 ? <Badge tone="green" label={`${e.remaining} ${t("remaining")}`} /> : <Badge tone="red" label={t("soldOut")} />}
        </RowView>
        {e.campaign?.error ? <Notice tone="amber">{e.campaign.error}</Notice> : null}
        {paidBlocked && e.ticketTypes.some((x) => x.price_kzt > 0) ? <Notice tone="amber">Paid sales for this event are not active yet.</Notice> : null}
        {e.seating === "general" ? (
          e.ticketTypes.map((tt) => {
            const off = (tt.price_kzt > 0 && paidBlocked) || closed;
            const max = Math.min(tt.max_per_order, tt.available);
            const q = qty[tt.id] ?? 0;
            return (
              <View key={tt.id} style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, gap: 6 }}>
                <RowView style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="label">{tt.name}</T>
                    <T v="price">{tt.price_kzt === 0 ? t("free") : kzt(tt.price_kzt)}</T>
                    {tt.description ? <T v="small">{tt.description}</T> : null}
                    {tt.price_kzt === 0 ? <T v="small">{t("freeLimit")}</T> : null}
                    {tt.available === 0 ? <T v="small" color={c.red}>{t("soldOut")}</T> : <T v="small">{tt.available} {t("remaining")}</T>}
                  </View>
                  <Stepper label={tt.name} value={q} max={off ? q : max} onChange={(n) => setQty({ ...qty, [tt.id]: n })} />
                </RowView>
              </View>
            );
          })
        ) : (
          <>
            {e.ticketTypes.map((tt) => <KV key={tt.id} label={`${tt.name} (${tt.section_codes.join(", ")})`} value={kzt(tt.price_kzt)} />)}
            <T v="label">{t("chooseSeats")}</T>
            <SeatPicker eventId={e.id} accessKey={accessKey} layout={e.venue.layout} selected={seatIds} onChange={(ids, list) => { setSeatIds(ids); setSeats(list); }} disabled={closed || paidBlocked} labels={seatLabels} />
            {seatIds.length > 0 ? (
              <RowView style={{ flexWrap: "wrap" }}>{seats.map((s) => <Badge key={s.id} tone="blue" label={`${s.section}-${s.row}-${s.number}`} />)}</RowView>
            ) : null}
            <T v="small">Selected seats are held for you during checkout and released automatically if you do not finish in time.</T>
          </>
        )}

        {hasSelection ? (
          <View style={{ gap: 10 }}>
            <Divider />
            <RowView>
              <View style={{ flex: 1 }}>
                <Field
                  accessibilityLabel={t("promoCode")}
                  placeholder={t("promoCode")}
                  value={promo}
                  autoCapitalize="characters"
                  onChangeText={(x) => {
                    setPromo(x.toUpperCase());
                    setAppliedPromo(null);
                    setCampaignToken(null);
                    setErr(null);
                  }}
                />
              </View>
              <Button small v="secondary" title={t("apply")} disabled={!promo.trim()} onPress={() => { setCampaignToken(null); setAppliedPromo(promo.trim() || null); }} />
            </RowView>
            {(appliedPromo || campaignToken) && quote?.promoError ? <T v="small" color={c.red}>{quote.promoError}</T> : null}
            {quote?.promo ? <T v="small" color={c.green} style={{ fontWeight: "700" }}>✓ {t("promoCode")} {quote.promo.code}</T> : null}
            {quote ? (
              <View style={{ gap: 4 }}>
                <KV label={t("subtotal")} value={kzt(quote.subtotal)} />
                {quote.discount > 0 ? <KV label={t("discount")} value={`−${kzt(quote.discount)}`} /> : null}
                {quote.fee > 0 ? <KV label={t("fee")} value={kzt(quote.fee)} /> : null}
                <KV label={t("total")} value={kzt(quote.total)} bold />
              </View>
            ) : (
              <Loading />
            )}
            {user ? (
              <>
                <Field label={t("attendeeName")} value={name} onChangeText={setName} autoComplete="name" />
                <Field label={t("email")} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </>
            ) : null}
            <ErrorBox error={err ?? quoteQ.error} />
            <Button title={user ? t("continue") : `${t("login")} → ${t("continue")}`} onPress={checkout} loading={busy} disabled={closed} />
            {quote && quote.total > 0 ? <T v="small" center>{t("demoNotice")}</T> : null}
          </View>
        ) : (
          <ErrorBox error={err} />
        )}
      </Card>

      {/* ---------------- venue */}
      {e.venue.map_image_url || e.sections.some((s) => s.view_image_url) ? (
        <Card>
          <T v="h3">{t("venueMap")}: {e.venue.name}</T>
          {e.venue.map_image_url ? <Image source={{ uri: assetUrl(e.venue.map_image_url)! }} style={{ width: "100%", aspectRatio: 1.2, backgroundColor: c.subtle, borderRadius: 12 }} contentFit="contain" accessibilityLabel={`${t("venueMap")} ${e.venue.name}`} /> : null}
          {e.sections.some((s) => s.view_image_url) ? (
            <>
              <T v="label">{t("viewFromSection")}</T>
              <RowView style={{ flexWrap: "wrap" }}>{e.sections.filter((s) => s.view_image_url).map((s) => <Chip key={s.code} label={s.code} active={view === s.code} onPress={() => setView(view === s.code ? null : s.code)} />)}</RowView>
              {viewSection ? (
                <>
                  <Image source={{ uri: assetUrl(viewSection.view_image_url)! }} style={{ width: "100%", aspectRatio: 1.6, borderRadius: 12, backgroundColor: c.subtle }} contentFit="contain" accessibilityLabel={`${t("viewFromSection")} ${viewSection.code}`} />
                  <T v="small">{viewSection.name} · {viewSection.price_category}</T>
                </>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <RowView style={{ flexWrap: "wrap" }}>
        <Button small v="ghost" title={`${t("getHelp")} ${t("support")}`} onPress={() => (user ? router.push({ pathname: "/support/new", params: { eventId: String(e.id) } }) : router.push("/login"))} />
        <Button small v="ghost" title="Report this event" onPress={() => (user ? setReporting(true) : router.push("/login"))} />
      </RowView>
      <PromptModal
        visible={reporting}
        title="Report this event"
        message="Tell the platform admins what is wrong (at least 5 characters)."
        minLength={5}
        confirmLabel="Send report"
        onCancel={() => setReporting(false)}
        onSubmit={async (reason) => {
          setReporting(false);
          try {
            await api.post(`/events/${e.id}/report`, { reason });
            notify("Thank you", "The report was sent to the platform admins.");
          } catch (x) {
            notify("Report failed", String((x as Error).message));
          }
        }}
      />
    </Screen>
  );
}
