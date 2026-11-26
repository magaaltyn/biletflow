"use client";
import {useT, translate} from "@/lib/i18n";
// Organizer event management tabs: tickets, paid sales activation, campaigns, attendees, orders, staff, history, analytics.
import Link from "next/link";
import { useState } from "react";
import { api, formatDate, kzt, toLocalInput } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { PaymentChooser } from "../PaymentChooser";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Notice, Select, Spinner, Stat, StatusBadge, Textarea } from "../ui";

// ---------- Ticket types ----------
export function TicketTypesTab({ event, reload }: { event: any; reload: () => void }) {
  useT();
  const sections: { code: string; name: string; price_category: string; seats: number }[] = event.seating === "assigned" ? (event.sections ?? []) : [];
  const blank = { name: "", description: "", priceKzt: 0, quantity: 100, maxPerOrder: 10, salesStart: "", salesEnd: "", hidden: false, sectionCodes: [] as string[] };
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const iso = (s: string) => (s ? new Date(s).toISOString() : null);
  // Sections priced by another ticket type cannot be picked again (one price per seat).
  const takenBy = new Map<string, string>();
  for (const t of event.ticketTypes) if (t.id !== editing) for (const c of t.section_codes) takenBy.set(c, t.name);
  const seatsOf = (codes: string[]) => sections.filter((s) => codes.includes(s.code)).reduce((sum, s) => sum + s.seats, 0);
  const setSections = (codes: string[]) => setF((prev) => ({ ...prev, sectionCodes: codes, quantity: codes.length ? seatsOf(codes) : prev.quantity }));
  const groups = [...new Set(sections.map((s) => s.price_category))].map((cat) => ({ cat, items: sections.filter((s) => s.price_category === cat) }));
  const venueCodes = new Set(sections.map((s) => s.code));
  // On a seated event, a ticket type without any of this venue's sections puts no seats on sale.
  const noSeats = sections.length > 0 ? event.ticketTypes.filter((t: any) => !t.section_codes.some((c: string) => venueCodes.has(c))) : [];
  const save = async () => {
    setErr(null);
    try {
      const body = { ...f, salesStart: iso(f.salesStart), salesEnd: iso(f.salesEnd) };
      if (editing) await api(`/organizer/ticket-types/${editing}`, { method: "PATCH", body });
      else await api(`/organizer/events/${event.id}/ticket-types`, { body });
      setF(blank);
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e);
    }
  };
  const edit = (t: any) => {
    setEditing(t.id);
    // Drop section codes that don't exist at this venue (e.g. left over from an older form).
    const valid = new Set(sections.map((s) => s.code));
    setF({ name: t.name, description: t.description, priceKzt: t.price_kzt, quantity: t.quantity, maxPerOrder: t.max_per_order, salesStart: toLocalInput(t.sales_start), salesEnd: toLocalInput(t.sales_end), hidden: t.hidden, sectionCodes: t.section_codes.filter((c: string) => valid.has(c)) });
  };
  const toggleHidden = async (t: any) => {
    await api(`/organizer/ticket-types/${t.id}`, { method: "PATCH", body: { hidden: !t.hidden } }).catch(setErr);
    reload();
  };
  const remove = async (t: any) => {
    await api(`/organizer/ticket-types/${t.id}`, { method: "DELETE" }).catch(setErr);
    reload();
  };
  return (
    <div className="space-y-4">
      {noSeats.length > 0 && (
        <Notice tone="amber">
          {translate("No seats are on sale for these ticket types because they have no sections of this venue. Click Edit and choose sections:")} <b>{noSeats.map((t: any) => t.name).join(", ")}</b>
        </Notice>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
            <tr><th className="p-3">{translate('Ticket type')}</th><th className="p-3">{translate('Price')}</th><th className="p-3">{translate('Available')}</th><th className="p-3">{translate('Reserved')}</th><th className="p-3">{translate('Sold')}</th><th className="p-3">{translate('Limit')}</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {event.ticketTypes.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">{translate('No ticket types yet. Add one below.')}</td></tr>}
            {event.ticketTypes.map((t: any) => (
              <tr key={t.id} className="border-t border-line">
                <td className="p-3"><b>{t.name}</b> {t.hidden && <Badge>{translate('hidden')}</Badge>}{t.section_codes.some((c: string) => venueCodes.has(c)) && <span className="block text-xs text-muted">{translate("Sections")} {t.section_codes.filter((c: string) => venueCodes.has(c)).join(", ")}</span>}</td>
                <td className="p-3">{t.price_kzt === 0 ? translate("Free") : kzt(t.price_kzt)}</td>
                <td className="p-3">{t.quantity - t.sold - t.reserved} / {t.quantity}</td>
                <td className="p-3">{t.reserved}</td>
                <td className="p-3">{t.sold}</td>
                <td className="p-3">{t.max_per_order}</td>
                <td className="space-x-2 whitespace-nowrap p-3 text-right">
                  <button className="font-semibold text-brand" onClick={() => edit(t)}>{translate('Edit')}</button>
                  <button className="font-semibold text-brand" onClick={() => toggleHidden(t)}>{t.hidden ? translate("Show") : translate("Hide")}</button>
                  {t.sold + t.reserved === 0 && <button className="font-semibold text-red-600" onClick={() => remove(t)}>{translate('Delete')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card className="space-y-3">
        <h3 className="font-bold">{editing ? translate("Edit ticket type") : translate("Add ticket type")}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Price (KZT, 0 = free)"><Input type="number" min={0} value={f.priceKzt} onChange={(e) => setF({ ...f, priceKzt: Number(e.target.value) })} /></Field>
          <Field label="Quantity"><Input type="number" min={0} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
          <Field label="Max per order" hint={f.priceKzt === 0 ? "Free tickets: always 1 per account per event" : undefined}><Input type="number" min={1} disabled={f.priceKzt === 0} value={f.priceKzt === 0 ? 1 : f.maxPerOrder} onChange={(e) => setF({ ...f, maxPerOrder: Number(e.target.value) })} /></Field>
          <Field label="Sales start (optional)"><Input type="datetime-local" value={f.salesStart} onChange={(e) => setF({ ...f, salesStart: e.target.value })} /></Field>
          <Field label="Sales end (optional)"><Input type="datetime-local" value={f.salesEnd} onChange={(e) => setF({ ...f, salesEnd: e.target.value })} /></Field>
        </div>
        <Field label={translate('Description')}><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {event.seating === "assigned" && sections.length === 0 && <Notice tone="amber">{translate("This venue has no seat map sections, so seats cannot be assigned.")}</Notice>}
        {sections.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{translate('Seat-map sections priced with this ticket type')}</legend>
            <p className="text-xs text-muted">{translate("Quantity is set to the number of seats in the chosen sections.")} {f.sectionCodes.length > 0 && <b>{f.sectionCodes.length} · {seatsOf(f.sectionCodes)} {translate("seats")}</b>}</p>
            {groups.map(({ cat, items }) => {
              const free = items.filter((s) => !takenBy.has(s.code)).map((s) => s.code);
              const allOn = free.length > 0 && free.every((c) => f.sectionCodes.includes(c));
              return (
                <div key={cat} className="rounded-xl border border-line p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase text-muted">{cat}</span>
                    {free.length > 1 && (
                      <button type="button" className="text-xs font-semibold text-brand" onClick={() => setSections(allOn ? f.sectionCodes.filter((c) => !free.includes(c)) : [...new Set([...f.sectionCodes, ...free])])}>
                        {allOn ? translate("Clear all") : translate("Select all")}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {items.map((s) => {
                      const owner = takenBy.get(s.code);
                      return (
                        <label key={s.code} title={owner ? `${s.name} · ${owner}` : `${s.name} · ${s.seats}`} className={`flex items-center gap-1 text-sm ${owner ? "text-muted line-through" : ""}`}>
                          <input type="checkbox" disabled={!!owner} checked={f.sectionCodes.includes(s.code)} onChange={(e) => setSections(e.target.checked ? [...f.sectionCodes, s.code] : f.sectionCodes.filter((x) => x !== s.code))} /> {s.code}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </fieldset>
        )}
        {f.priceKzt > 0 && event.paid_sales_status !== "active" && <Notice tone="amber">{translate('Paid tickets can be sold only after paid sales activation (Paid sales tab).')}</Notice>}
        <ErrorBox error={err} />
        <div className="flex gap-2">
          <Button onClick={save}>{editing ? translate("Save changes") : translate("Add ticket type")}</Button>
          {editing && <Button variant="secondary" onClick={() => { setEditing(null); setF(blank); }}>{translate('Cancel')}</Button>}
        </div>
      </Card>
    </div>
  );
}

// ---------- Paid Sales Activation ----------
export function ActivationTab({ event, reload }: { event: any; reload: () => void }) {
  useT();
  const a = event.activation;
  const [err, setErr] = useState<unknown>(null);
  const accept = async () => {
    await api(`/organizer/events/${event.id}/activation/terms`, { method: "POST" }).catch(setErr);
    reload();
  };
  const step = (key: string) => a.steps.find((s: any) => s.key === key);
  return (
    <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
      <Card>
        <h3 className="font-bold">{translate('Paid sales activation checklist')} <StatusBadge status={a.status} /></h3>
        <p className="mt-1 text-sm text-muted">{translate('Paid tickets stay disabled until every step is complete. Activation applies only to this event.')}</p>
        <ol className="mt-4 space-y-3">
          {a.steps.map((s: any, i: number) => (
            <li key={s.key} className="flex items-start gap-3">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-green-600 text-on-brand" : "bg-slate-200"}`}>{s.done ? "✓" : i + 1}</span>
              <div className="text-sm">
                <p className={s.done ? "text-muted line-through" : "font-semibold"}>{translate(s.label)}</p>
                {!s.done && s.key === "identity" && <Link className="text-brand" href="/organizer/profile">{translate('Open profile →')}</Link>}
                {!s.done && s.key === "payout" && <Link className="text-brand" href="/organizer/profile">{translate('Connect payout account →')}</Link>}
                {!s.done && s.key === "paid_ticket_type" && <span className="text-muted">{translate('Use the Tickets tab.')}</span>}
                {!s.done && s.key === "terms" && (
                  <div className="mt-2 space-y-2">
                    <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">I confirm the event is legal and accurately described, I am responsible for my refund policy, and I understand that payments in this academic MVP are simulations and that paid sales can be suspended for fraud or policy violations.</p>
                    <Button variant="secondary" onClick={accept}>{translate('Accept terms')}</Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        <ErrorBox error={err} />
      </Card>
      {!step("fee").done && a.status !== "suspended" && (
        <Card>
          <h3 className="font-bold">{translate('Activation fee')}</h3>
          <p className="mt-1 text-sm text-muted">{translate('One-time fee for this event.')}</p>
          <div className="mt-4"><PaymentChooser path={`/organizer/events/${event.id}/activation/pay`} amountLabel={kzt(a.feeKzt)} /></div>
        </Card>
      )}
      {a.status === "suspended" && <Notice tone="amber">{translate('Paid sales were suspended by a platform admin. Open a support case to resolve it.')}</Notice>}
    </div>
  );
}

// ---------- Campaigns ----------
export function CampaignsTab({ event }: { event: any }) {
  useT();
  const { data, loading, reload } = useApi<any[]>(`/organizer/events/${event.id}/campaigns`);
  const [f, setF] = useState({ name: "", code: "", discountType: "percent", discountValue: 10, validUntil: "", maxRedemptions: "" as number | "", ticketTypeIds: [] as number[] });
  const [err, setErr] = useState<unknown>(null);
  const [qr, setQr] = useState<any>(null);
  const create = async () => {
    setErr(null);
    try {
      await api(`/organizer/events/${event.id}/campaigns`, { body: { ...f, code: f.code || undefined, validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null, maxRedemptions: f.maxRedemptions === "" ? null : f.maxRedemptions } });
      setF({ ...f, name: "", code: "" });
      void reload();
    } catch (e) {
      setErr(e);
    }
  };
  const toggle = async (c: any) => {
    await api(`/organizer/campaigns/${c.id}`, { method: "PATCH", body: { active: !c.active } }).catch(setErr);
    void reload();
  };
  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
            <tr><th className="p-3">{translate('Campaign')}</th><th className="p-3">{translate('Discount')}</th><th className="p-3">{translate('Visits')}</th><th className="p-3">{translate('Redemptions')}</th><th className="p-3">{translate('Tickets')}</th><th className="p-3">{translate('Revenue')}</th><th className="p-3">{translate('Discount given')}</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted">{translate('No campaigns yet.')}</td></tr>}
            {data?.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="p-3"><b className="font-mono">{c.code}</b> {!c.active && <Badge tone="red">{translate('disabled')}</Badge>}<span className="block text-xs text-muted">{c.name}{c.valid_until ? ` · until ${formatDate(c.valid_until, { dateStyle: "medium" })}` : ""}</span></td>
                <td className="p-3">{c.discount_type === "percent" ? `${c.discount_value}%` : kzt(c.discount_value)}</td>
                <td className="p-3">{c.visits}</td>
                <td className="p-3">{c.redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}</td>
                <td className="p-3">{c.tickets}</td>
                <td className="p-3">{kzt(c.revenue_kzt)}</td>
                <td className="p-3">{kzt(c.discount_kzt)}</td>
                <td className="space-x-2 whitespace-nowrap p-3 text-right">
                  <button className="font-semibold text-brand" onClick={() => setQr(c)}>{translate('QR code')}</button>
                  <button className="font-semibold text-brand" onClick={() => toggle(c)}>{c.active ? translate("Disable") : translate("Enable")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {qr && (
        <Card className="flex flex-wrap items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/organizer/campaigns/${qr.id}/qr.png`} alt={`Campaign QR for ${qr.code}`} className="size-48 rounded-xl border-4 border-orange-500" />
          <div className="space-y-2 text-sm">
            <p className="font-bold">Campaign QR · {qr.code}</p>
            <p className="text-muted">{translate('Opens the event page with the promo code applied.')} <b>{translate('This is not a ticket')}</b> {translate('— the check-in scanner rejects it.')}</p>
            <p className="break-all font-mono text-xs">{window.location.origin}/c/{qr.token}</p>
            <a className="font-semibold text-brand" href={`/api/organizer/campaigns/${qr.id}/qr.png`} download={`promo-${qr.code}.png`}>{translate('Download PNG')}</a>
          </div>
        </Card>
      )}
      <Card className="space-y-3">
        <h3 className="font-bold">{translate('New promo code + Campaign QR')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Campaign name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Instagram, posters…" /></Field>
          <Field label="Code (optional)" hint="Leave empty to generate"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
          <Field label={translate('Discount')}>
            <div className="flex gap-2">
              <Input type="number" min={1} value={f.discountValue} onChange={(e) => setF({ ...f, discountValue: Number(e.target.value) })} />
              <Select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value })}><option value="percent">%</option><option value="fixed">{translate('KZT')}</option></Select>
            </div>
          </Field>
          <Field label="Valid until (optional)"><Input type="datetime-local" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
          <Field label="Max redemptions (optional)"><Input type="number" min={1} value={f.maxRedemptions} onChange={(e) => setF({ ...f, maxRedemptions: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
          <Field label="Applies to" hint="None selected = all ticket types">
            <Select multiple className="h-20" value={f.ticketTypeIds.map(String)} onChange={(e) => setF({ ...f, ticketTypeIds: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
              {event.ticketTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <ErrorBox error={err} />
        <Button onClick={create}>{translate('Create campaign')}</Button>
      </Card>
    </div>
  );
}

// ---------- Attendees ----------
export function AttendeesTab({ event }: { event: any }) {
  useT();
  const [search, setSearch] = useState("");
  const { data, loading } = useApi<any[]>(`/organizer/events/${event.id}/attendees?search=${encodeURIComponent(search)}`, [search]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search name, email or ticket ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search attendees" />
        <a className="inline-flex items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold" href={`/api/organizer/events/${event.id}/attendees?format=csv`}>{translate('Export CSV')}</a>
        <Link className="inline-flex items-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand" href={`/checkin/${event.id}`}>{translate('Open check-in')}</Link>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="p-3">{translate('Attendee')}</th><th className="p-3">{translate('Ticket')}</th><th className="p-3">{translate('Seat')}</th><th className="p-3">{translate('Status')}</th><th className="p-3">{translate('Order')}</th></tr></thead>
            <tbody>
              {data?.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">{translate('No attendees yet.')}</td></tr>}
              {data?.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="p-3"><b>{a.attendee_name}</b><span className="block text-xs text-muted">{a.attendee_email}</span></td>
                  <td className="p-3">{a.ticket_type}<span className="block font-mono text-xs text-muted">{a.code}</span></td>
                  <td className="p-3">{a.section_code ? `${a.section_code}-${a.row_label}-${a.seat_number}` : "—"}</td>
                  <td className="p-3"><StatusBadge status={a.status} />{a.checked_in_at && <span className="block text-xs text-muted">{formatDate(a.checked_in_at, { timeStyle: "short" })}</span>}</td>
                  <td className="p-3 font-mono text-xs">{a.order_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Orders & refunds ----------
export function OrdersTab({ event }: { event: any }) {
  useT();
  const { data, loading, reload } = useApi<any[]>(`/organizer/events/${event.id}/orders`);
  const [refunding, setRefunding] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const confirm = async () => {
    setErr(null);
    try {
      await api(`/organizer/orders/${refunding.id}/refund`, { body: { reason } });
      setRefunding(null);
      setReason("");
      void reload();
    } catch (e) {
      setErr(e);
    }
  };
  if (loading) return <Spinner />;
  return (
    <div className="space-y-3">
      {refunding && (
        <Card className="space-y-2 border-red-200">
          <p className="font-bold">{refunding.total_kzt > 0 ? `Refund order ${refunding.code} (${kzt(refunding.total_kzt)}, DEMO)` : `Cancel free registration ${refunding.code}`}</p>
          <p className="text-sm text-muted">{translate('The tickets become invalid immediately and the attendee is notified.')}</p>
          <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <ErrorBox error={err} />
          <div className="flex gap-2"><Button variant="danger" onClick={confirm}>{translate('Confirm')}</Button><Button variant="secondary" onClick={() => setRefunding(null)}>{translate('Back')}</Button></div>
        </Card>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="p-3">{translate('Order')}</th><th className="p-3">{translate('Attendee')}</th><th className="p-3">{translate('Tickets')}</th><th className="p-3">{translate('Total')}</th><th className="p-3">{translate('Status')}</th><th className="p-3" /></tr></thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">{translate('No orders yet.')}</td></tr>}
            {data?.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="p-3 font-mono text-xs">{o.code}<span className="block font-sans text-muted">{formatDate(o.created_at)}</span></td>
                <td className="p-3">{o.attendee_name}<span className="block text-xs text-muted">{o.attendee_email}</span></td>
                <td className="p-3">{o.tickets}</td>
                <td className="p-3">{kzt(o.total_kzt)}{o.promo_code && <span className="block text-xs text-green-700">{o.promo_code} −{kzt(o.discount_kzt)}</span>}</td>
                <td className="p-3"><StatusBadge status={o.status} /></td>
                <td className="p-3 text-right">{o.status === "paid" && <button className="font-semibold text-red-600" onClick={() => setRefunding(o)}>{o.total_kzt > 0 ? translate("Refund") : translate("Cancel")}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Staff ----------
export function StaffTab({ event, reload }: { event: any; reload: () => void }) {
  useT();
  const [email, setEmail] = useState("");
  const [canUndo, setCanUndo] = useState(true);
  const [err, setErr] = useState<unknown>(null);
  const add = async () => {
    setErr(null);
    try {
      await api(`/organizer/events/${event.id}/staff`, { body: { email, canUndo } });
      setEmail("");
      reload();
    } catch (e) {
      setErr(e);
    }
  };
  const remove = async (id: number) => {
    await api(`/organizer/events/${event.id}/staff/${id}`, { method: "DELETE" }).catch(setErr);
    reload();
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="font-bold">{translate('Event Admins (check-in staff)')}</h3>
        <p className="text-sm text-muted">{translate('They can scan tickets for this event in the BiletFlow Scanner app or on the website check-in page. They must have a BiletFlow account.')}</p>
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" type="email" placeholder="staff@email.kz" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Staff email" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={canUndo} onChange={(e) => setCanUndo(e.target.checked)} /> {translate('may undo check-ins')}</label>
          <Button onClick={add}>{translate('Assign')}</Button>
        </div>
        <ErrorBox error={err} />
      </Card>
      {event.staff.length === 0 ? <Empty title="No Event Admins yet" /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {event.staff.map((s: any) => (
            <li key={s.id} className="flex items-center justify-between p-3 text-sm">
              <span><b>{s.full_name}</b> · {s.email} {s.can_undo && <Badge>{translate('can undo')}</Badge>}</span>
              <button className="font-semibold text-red-600" onClick={() => remove(s.id)}>{translate('Remove')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- History ----------
export function HistoryTab({ event }: { event: any }) {
  useT();
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams(Object.entries({ type, from: from ? new Date(from).toISOString() : "", to: to ? new Date(to + "T23:59:59").toISOString() : "" }).filter(([, v]) => v));
  const { data, loading } = useApi<any[]>(`/organizer/events/${event.id}/history?${qs}`, [type, from, to]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select className="max-w-xs" value={type} onChange={(e) => setType(e.target.value)} aria-label="Activity type">
          <option value="">{translate('All activity')}</option>
          {["event", "ticket_type", "order", "campaign", "checkin", "support", "staff", "activation"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </Select>
        <Input type="date" className="max-w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <Input type="date" className="max-w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>
      {loading ? <Spinner /> : (
        <ol className="relative space-y-3 border-l-2 border-line pl-5">
          {data?.length === 0 && <p className="text-sm text-muted">{translate('No activity for these filters.')}</p>}
          {data?.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-brand" />
              <p className="text-sm"><b>{h.description}</b></p>
              <p className="text-xs text-muted">{formatDate(h.created_at)} · {h.actor ?? "system"} · {h.action}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">{translate('History entries cannot be edited or deleted.')}</p>
    </div>
  );
}

// ---------- Analytics ----------
function Bars({ rows, value, label }: { rows: any[]; value: (r: any) => number; label: (r: any) => string }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_90px] items-center gap-2 text-xs">
          <span className="truncate text-muted">{label(r)}</span>
          <div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-brand" style={{ width: `${(value(r) / max) * 100}%` }} /></div>
          <span className="text-right font-semibold">{value(r)}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsTab({ event }: { event: any }) {
  useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeId, setTypeId] = useState("");
  const qs = new URLSearchParams(Object.entries({ eventId: String(event.id), from: from ? new Date(from).toISOString() : "", to: to ? new Date(to + "T23:59:59").toISOString() : "", ticketTypeId: typeId }).filter(([, v]) => v));
  const { data: a, loading } = useApi<any>(`/organizer/analytics?${qs}`, [from, to, typeId]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input type="date" className="max-w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <Input type="date" className="max-w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <Select className="max-w-xs" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label={translate('Ticket type')}>
          <option value="">{translate('All ticket types')}</option>
          {event.ticketTypes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      {loading || !a ? <Spinner /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sold / capacity" value={`${a.capacity.sold} / ${a.capacity.capacity}`} hint={`${a.capacity.percentSold}% ${translate("sold")} · ${a.capacity.remaining} ${translate("remaining")}`} />
            <Stat label="Gross (DEMO)" value={kzt(a.money.gross)} hint={`${translate("discounts")} ${kzt(a.money.discounts)} · ${translate("refunds")} ${kzt(a.money.refunds)}`} />
            <Stat label="Net (DEMO)" value={kzt(a.money.net)} />
            <Stat label="Check-in" value={`${a.attendance.checked_in} / ${a.attendance.holders}`} hint={`${a.attendance.percent}% · ${a.attendance.absent} ${translate("absent")}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><h3 className="mb-3 font-bold">{translate('Tickets sold per day')}</h3>{a.overTime.length ? <Bars rows={a.overTime} value={(r) => r.tickets} label={(r) => r.day} /> : <p className="text-sm text-muted">{translate('No sales in this period.')}</p>}</Card>
            <Card><h3 className="mb-3 font-bold">{translate('Sold by ticket type')}</h3><Bars rows={a.byType} value={(r) => r.sold} label={(r) => r.name} /></Card>
          </div>
          <Card>
            <h3 className="mb-3 font-bold">{translate('Campaigns')}</h3>
            {a.campaigns.length === 0 ? <p className="text-sm text-muted">{translate('No campaigns.')}</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">{translate('Code')}</th><th>{translate('Visits')}</th><th>{translate('Redemptions')}</th><th>{translate('Tickets')}</th><th>{translate('Revenue')}</th><th>{translate('Discount')}</th></tr></thead>
                <tbody>{a.campaigns.map((c: any) => <tr key={c.id} className="border-t border-line"><td className="py-2 font-mono">{c.code}</td><td>{c.visits}</td><td>{c.redemptions}</td><td>{c.tickets}</td><td>{kzt(c.revenue)}</td><td>{kzt(c.discount)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>
          <p className="text-xs text-muted">{translate('All numbers come from BiletFlow orders, tickets, campaigns, refunds and check-ins. Amounts are DEMO KZT.')}</p>
        </>
      )}
    </div>
  );
}
