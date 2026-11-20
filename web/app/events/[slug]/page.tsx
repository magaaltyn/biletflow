"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EventImage } from "@/components/EventCard";
import { SeatMap, type SeatMapData } from "@/components/SeatMap";
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, Spinner } from "@/components/ui";
import { api, kzt } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { localeOf, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

interface TicketType {
  id: number;
  name: string;
  description: string;
  price_kzt: number;
  available: number;
  max_per_order: number;
  sales_start: string | null;
  sales_end: string | null;
  section_codes: string[];
}

interface EventDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  seating: "general" | "assigned";
  visibility: string;
  paid_sales_status: string;
  refund_policy: string;
  remaining: number;
  isPreview: boolean;
  venue: { id: number; name: string; city: string; address: string; timezone: string; kind: string; map_image_url: string | null; has_seat_map: boolean };
  sections: { code: string; name: string; price_category: string; view_image_url: string | null }[];
  ticketTypes: TicketType[];
  organizer: { id: number; display_name: string };
  calendar: { google: string; outlook: string };
  campaign: null | { code?: string; token?: string; discountType?: string; discountValue?: number; error?: string };
}

interface Quote {
  count: number;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  promo: { code: string } | null;
  promoError: string | null;
}

function VenueGallery({ e }: { e: EventDetail }) {
  const { t } = useT();
  const withViews = e.sections.filter((s) => s.view_image_url);
  const [view, setView] = useState<string | null>(null);
  const current = withViews.find((s) => s.code === view);
  if (!e.venue.map_image_url && !withViews.length) return null;
  return (
    <Card>
      <h2 className="text-lg font-bold">{t("venueMap")}: {e.venue.name}</h2>
      <p className="text-sm text-muted">{e.venue.address}</p>
      {e.venue.map_image_url && (
        <a href={e.venue.map_image_url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border border-line bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.venue.map_image_url} alt={`${t("venueMap")} — ${e.venue.name}`} className="w-full" />
        </a>
      )}
      {withViews.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">{t("viewFromSection")}</p>
          <div className="flex flex-wrap gap-2">
            {withViews.map((s) => (
              <button key={s.code} onClick={() => setView(view === s.code ? null : s.code)} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${view === s.code ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>
                {s.code}
              </button>
            ))}
          </div>
          {current && (
            <figure className="mt-3 overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.view_image_url!} alt={`${t("viewFromSection")} ${current.code}`} className="w-full" />
              <figcaption className="bg-slate-50 px-3 py-2 text-xs text-muted">{current.name} · {current.price_category}</figcaption>
            </figure>
          )}
        </div>
      )}
    </Card>
  );
}

function EventPageInner() {
  const { slug } = useParams<{ slug: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { t, lang } = useT();
  const { user } = useSession();
  const qs = new URLSearchParams();
  if (sp.get("c")) qs.set("c", sp.get("c")!);
  if (sp.get("key")) qs.set("key", sp.get("key")!);
  const { data: e, error, loading } = useApi<EventDetail>(`/events/by-slug/${slug}?${qs}`);

  const [qty, setQty] = useState<Record<number, number>>({});
  const [seatIds, setSeatIds] = useState<number[]>([]);
  const [seatMap, setSeatMap] = useState<SeatMapData | null>(null);
  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [campaignToken, setCampaignToken] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (e?.campaign?.code) {
      setPromo(e.campaign.code);
      setAppliedPromo(e.campaign.code);
      setCampaignToken(e.campaign.token ?? null);
    }
  }, [e?.campaign?.code, e?.campaign?.token]);
  useEffect(() => {
    if (user) {
      setName((n) => n || user.full_name);
      setEmail((m) => m || user.email);
    }
  }, [user]);

  const loadSeats = () => e && api<SeatMapData>(`/events/${e.id}/seats?${qs}`).then(setSeatMap).catch(setErr);
  useEffect(() => {
    if (e?.seating === "assigned") void loadSeats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id, e?.seating]);

  const items = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ ticketTypeId: Number(id), quantity: q })), [qty]);
  const hasSelection = e?.seating === "assigned" ? seatIds.length > 0 : items.length > 0;

  useEffect(() => {
    if (!e || !hasSelection) {
      setQuote(null);
      return;
    }
    if (!user) {
      // Quote needs a session; show a simple local subtotal for visitors.
      const subtotal = e.seating === "assigned"
        ? seatIds.reduce((s, id) => s + (seatMap?.priceBySection[seatMap.seats.find((x) => x.id === id)?.section ?? ""]?.price ?? 0), 0)
        : items.reduce((s, it) => s + (e.ticketTypes.find((tt) => tt.id === it.ticketTypeId)?.price_kzt ?? 0) * it.quantity, 0);
      setQuote({ count: 0, subtotal, discount: 0, fee: 0, total: subtotal, promo: null, promoError: null });
      return;
    }
    const id = setTimeout(() => {
      api<Quote>("/orders/quote", { body: { eventId: e.id, items, seatIds, promoCode: campaignToken ? null : appliedPromo, campaignToken } }).then(setQuote).catch(setErr);
    }, 250);
    return () => clearTimeout(id);
  }, [e, items, seatIds, appliedPromo, campaignToken, user, hasSelection, seatMap]);

  if (loading) return <Spinner />;
  if (error || !e) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorBox error={error ?? "Event not found"} /></div>;

  const locale = localeOf(lang);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: e.venue.timezone, ...o }).format(new Date(d));
  const closed = e.status !== "published";
  const paidBlocked = e.paid_sales_status !== "active";

  const checkout = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/events/${e.slug}?${qs}`)}`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const order = await api<{ id: number }>("/orders", {
        body: { eventId: e.id, items, seatIds, promoCode: campaignToken ? null : appliedPromo, campaignToken, attendeeName: name, attendeeEmail: email },
      });
      router.push(`/orders/${order.id}`);
    } catch (x) {
      setErr(x);
      if (e.seating === "assigned") {
        setSeatIds([]);
        void loadSeats();
      }
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = window.location.href.split("?")[0];
    if (navigator.share) await navigator.share({ title: e.title, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {e.isPreview && <Notice tone="amber">Preview — this event is a draft and not visible to the public yet.</Notice>}
      {e.status === "cancelled" && (
        <Notice tone="amber">
          This event was cancelled. <a className="font-semibold underline" href={`/api/events/${e.id}/calendar.ics`}>Download the cancellation calendar file</a> to update your calendar.
        </Notice>
      )}
      <div className="mt-4 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-slate-200">
            <EventImage src={e.image_url} alt={e.title} className="aspect-[16/8] w-full object-cover" />
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-line bg-white px-3 py-2 text-center">
              <p className="text-xs font-bold uppercase text-muted">{fmt(e.starts_at, { month: "short" })}</p>
              <p className="text-2xl font-extrabold">{fmt(e.starts_at, { day: "numeric" })}</p>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-extrabold tracking-tight">{e.title}</h1>
              <p className="mt-1 text-sm font-semibold text-brand">{e.category} · {e.organizer.display_name}</p>
            </div>
            <Button variant="secondary" onClick={share} aria-label="Share">{copied ? "Link copied" : "Share"}</Button>
          </div>
          <Card className="space-y-2 text-sm">
            <p>📅 {fmt(e.starts_at, { dateStyle: "full", timeStyle: "short" })} – {fmt(e.ends_at, { timeStyle: "short" })} ({e.venue.timezone})</p>
            <p>📍 {e.venue.name}, {e.venue.address}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-sm font-semibold">{t("addToCalendar")}:</span>
              <a className="text-sm font-semibold text-brand underline" href={e.calendar.google} target="_blank" rel="noreferrer">Google</a>
              <a className="text-sm font-semibold text-brand underline" href={e.calendar.outlook} target="_blank" rel="noreferrer">Outlook</a>
              <a className="text-sm font-semibold text-brand underline" href={`/api/events/${e.id}/calendar.ics`}>Apple / .ics</a>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{t("aboutEvent")}</h2>
            <p className="mt-2 whitespace-pre-line text-slate-700">{e.description}</p>
            <p className="mt-4 text-xs text-muted">Refund policy: {e.refund_policy}</p>
          </Card>
          <VenueGallery e={e} />
          <p className="text-sm text-muted">
            {t("getHelp")} <Link className="font-semibold text-brand" href={`/support/new?eventId=${e.id}`}>{t("support")}</Link>
            {" · "}
            <Link className="text-muted underline" href={`/support/report?eventId=${e.id}`}>Report this event</Link>
          </p>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("tickets")}</h2>
              {e.remaining > 0 ? <Badge tone="green">{e.remaining} {t("remaining")}</Badge> : <Badge tone="red">{t("soldOut")}</Badge>}
            </div>
            {e.campaign?.error && <Notice tone="amber">{e.campaign.error}</Notice>}
            {e.seating === "general" ? (
              <div className="space-y-3">
                {e.ticketTypes.map((tt) => {
                  const off = tt.price_kzt > 0 && paidBlocked;
                  const max = Math.min(tt.max_per_order, tt.available);
                  const q = qty[tt.id] ?? 0;
                  return (
                    <div key={tt.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{tt.name}</p>
                          <p className="text-sm font-bold text-brand">{tt.price_kzt === 0 ? t("free") : kzt(tt.price_kzt)}</p>
                          {tt.description && <p className="text-xs text-muted">{tt.description}</p>}
                          {tt.price_kzt === 0 && <p className="text-xs text-muted">{t("freeLimit")}</p>}
                          {off && <p className="text-xs text-amber-700">Paid sales not active yet</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="size-8 rounded-lg border border-line font-bold disabled:opacity-40" disabled={q <= 0} onClick={() => setQty({ ...qty, [tt.id]: q - 1 })} aria-label={`Fewer ${tt.name}`}>−</button>
                          <span className="w-5 text-center font-semibold" aria-live="polite">{q}</span>
                          <button className="size-8 rounded-lg border border-line font-bold disabled:opacity-40" disabled={off || closed || q >= max} onClick={() => setQty({ ...qty, [tt.id]: q + 1 })} aria-label={`More ${tt.name}`}>+</button>
                        </div>
                      </div>
                      {tt.available === 0 && <p className="mt-1 text-xs font-semibold text-red-600">{t("soldOut")}</p>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {e.ticketTypes.map((tt) => (
                  <div key={tt.id} className="flex justify-between">
                    <span>{tt.name} <span className="text-muted">({tt.section_codes.join(", ")})</span></span>
                    <span className="font-semibold">{kzt(tt.price_kzt)}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted">{t("chooseSeats")} ↓</p>
              </div>
            )}

            {hasSelection && (
              <>
                <div className="flex gap-2">
                  <Input aria-label={t("promoCode")} placeholder={t("promoCode")} value={promo} onChange={(x) => setPromo(x.target.value.toUpperCase())} />
                  <Button variant="secondary" onClick={() => { setCampaignToken(null); setAppliedPromo(promo.trim() || null); }}>{t("apply")}</Button>
                </div>
                {quote?.promoError && <p className="text-sm text-red-600">{quote.promoError}</p>}
                {quote?.promo && <p className="text-sm font-semibold text-green-700">✓ {t("promoCode")} {quote.promo.code}</p>}
                {quote && (
                  <dl className="space-y-1 border-t border-line pt-3 text-sm">
                    <div className="flex justify-between"><dt>{t("subtotal")}</dt><dd>{kzt(quote.subtotal)}</dd></div>
                    {quote.discount > 0 && <div className="flex justify-between text-green-700"><dt>{t("discount")}</dt><dd>−{kzt(quote.discount)}</dd></div>}
                    {quote.fee > 0 && <div className="flex justify-between"><dt>{t("fee")}</dt><dd>{kzt(quote.fee)}</dd></div>}
                    <div className="flex justify-between text-base font-bold"><dt>{t("total")}</dt><dd className="text-brand">{kzt(quote.total)}</dd></div>
                  </dl>
                )}
                {user && (
                  <div className="grid gap-2">
                    <Field label={t("attendeeName")}><Input value={name} onChange={(x) => setName(x.target.value)} /></Field>
                    <Field label={t("email")}><Input type="email" value={email} onChange={(x) => setEmail(x.target.value)} /></Field>
                  </div>
                )}
                <ErrorBox error={err} />
                <Button className="w-full" onClick={checkout} loading={busy} disabled={closed}>
                  {user ? t("continue") : `${t("login")} → ${t("continue")}`}
                </Button>
              </>
            )}
            {!hasSelection && <ErrorBox error={err} />}
          </Card>
        </aside>
      </div>

      {e.seating === "assigned" && (
        <section className="mt-8" id="seats">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t("chooseSeats")}</h2>
              {seatIds.length > 0 && seatMap && (
                <p className="text-sm">
                  {seatIds.map((id) => {
                    const s = seatMap.seats.find((x) => x.id === id);
                    return s ? <Badge key={id} tone="blue">{s.section}-{s.row}-{s.number}</Badge> : null;
                  })}
                </p>
              )}
            </div>
            {paidBlocked && <Notice tone="amber">Paid sales for this event are not active yet.</Notice>}
            {seatMap ? <SeatMap data={seatMap} selected={seatIds} onChange={setSeatIds} /> : <Spinner />}
            <p className="mt-2 text-xs text-muted">Selected seats are held for you during checkout and released automatically if you do not finish in time.</p>
          </Card>
        </section>
      )}
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EventPageInner />
    </Suspense>
  );
}
