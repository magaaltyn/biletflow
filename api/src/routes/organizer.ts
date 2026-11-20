// Organizer area: profile, events, ticket types, paid sales activation, staff, attendees, orders,
// campaigns, history and analytics (SRS 4.2–4.5, 4.9, 4.14–4.16).
import { Router } from "express";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { type AuthUser, me, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { opaqueToken, randomCode, slugify } from "../lib/codes.js";
import { config } from "../lib/config.js";
import { qrPng } from "../lib/documents.js";
import { badRequest, conflict, idParam, notFound, parse, zOptDate } from "../lib/http.js";
import { notify } from "../lib/notify.js";
import { imageUpload, publicUrl } from "../lib/uploads.js";
import { type EventRow, getManagedEvent, lifecycle } from "../services/access.js";
import { halykPaymentObject } from "../services/halyk.js";
import { refundOrCancelPaidOrder, settingNumber, startPayment } from "../services/orders.js";

export const organizerRouter = Router();
organizerRouter.use(requireRole("organizer", "platform_admin"));

// ---------- Profile, identity (simulated) and payout account (demo) ----------
organizerRouter.get("/profile", async (req, res) => {
  const profile = await one("SELECT * FROM organizer_profiles WHERE user_id = $1", [me(req).id]);
  const payout = await one("SELECT bank_name, holder_name, iban_last4, created_at FROM payout_accounts WHERE organizer_id = $1", [me(req).id]);
  res.json({ profile, payout });
});

organizerRouter.put("/profile", async (req, res) => {
  const b = parse(z.object({ displayName: z.string().trim().min(2).max(100), contactEmail: z.string().email().nullable().optional(), contactPhone: z.string().max(30).nullable().optional(), bio: z.string().max(2000).nullable().optional() }), req.body);
  await q(
    `INSERT INTO organizer_profiles (user_id, display_name, contact_email, contact_phone, bio) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET display_name = $2, contact_email = $3, contact_phone = $4, bio = $5`,
    [me(req).id, b.displayName, b.contactEmail ?? null, b.contactPhone ?? null, b.bio ?? null],
  );
  res.json({ ok: true });
});

/** Simulated identity verification for the academic MVP (SRS 3.2: no production KYC). */
organizerRouter.post("/verify-identity", async (req, res) => {
  const b = parse(z.object({ fullLegalName: z.string().trim().min(3), documentLast4: z.string().regex(/^\d{4}$/, "enter the last 4 digits only") }), req.body);
  await q("UPDATE organizer_profiles SET identity_status = 'verified', identity_verified_at = now() WHERE user_id = $1", [me(req).id]);
  await audit({ actorId: me(req).id, action: "organizer.identity_verified", entityType: "user", entityId: me(req).id, description: `Identity verified (simulation) for ${b.fullLegalName}` });
  res.json({ ok: true, simulated: true });
});

organizerRouter.put("/payout-account", async (req, res) => {
  const b = parse(z.object({ bankName: z.string().trim().min(2), holderName: z.string().trim().min(3), iban: z.string().trim().regex(/^KZ[0-9A-Z]{18}$/i, "enter a Kazakh IBAN (KZ + 18 characters)") }), req.body);
  await q(
    `INSERT INTO payout_accounts (organizer_id, bank_name, holder_name, iban_last4) VALUES ($1, $2, $3, $4)
     ON CONFLICT (organizer_id) DO UPDATE SET bank_name = $2, holder_name = $3, iban_last4 = $4`,
    [me(req).id, b.bankName, b.holderName, b.iban.slice(-4)],
  );
  res.json({ ok: true });
});

// ---------- Custom venues with a map picture ----------
organizerRouter.post("/venues", async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2), city: z.string().trim().min(2), address: z.string().trim().min(3), kind: z.enum(["arena", "stadium", "theatre", "hall", "outdoor"]).default("hall") }), req.body);
  const v = await one("INSERT INTO venues (name, city, address, kind, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *", [b.name, b.city, b.address, b.kind, me(req).id]);
  res.status(201).json(v);
});

organizerRouter.post("/venues/:id/map-image", imageUpload, async (req, res) => {
  const venue = await one("SELECT * FROM venues WHERE id = $1", [idParam(req)]);
  if (!venue) throw notFound("Venue not found");
  if (venue.created_by !== me(req).id && me(req).role !== "platform_admin") throw badRequest("Only the venue's creator can change its map");
  if (!req.file) throw badRequest("Choose an image");
  await q("UPDATE venues SET map_image_url = $2 WHERE id = $1", [venue.id, publicUrl(req.file.filename)]);
  res.json({ map_image_url: publicUrl(req.file.filename) });
});

// ---------- Events ----------
const eventSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().max(10_000).default(""),
  category: z.enum(["concert", "festival", "sports", "theatre", "conference", "education", "exhibition", "community", "other"]),
  venueId: z.coerce.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  seating: z.enum(["general", "assigned"]).default("general"),
  capacity: z.coerce.number().int().min(1).max(200_000),
  registrationOpensAt: zOptDate,
  registrationClosesAt: zOptDate,
  refundPolicy: z.string().max(2000).optional(),
});

async function eventStats(eventId: number) {
  return one(
    `SELECT COALESCE(sum(quantity), 0)::int AS quantity, COALESCE(sum(sold), 0)::int AS sold, COALESCE(sum(reserved), 0)::int AS reserved,
            (SELECT count(*)::int FROM tickets WHERE event_id = $1 AND status = 'checked_in') AS checked_in,
            (SELECT count(*)::int FROM tickets WHERE event_id = $1 AND status = 'refunded') AS refunded,
            (SELECT count(*)::int FROM tickets WHERE event_id = $1 AND status = 'cancelled') AS cancelled
       FROM ticket_types WHERE event_id = $1`,
    [eventId],
  );
}

organizerRouter.get("/events", async (req, res) => {
  const all = me(req).role === "platform_admin" && req.query.all === "true";
  const rows = await q<EventRow & { venue_name: string; sold: number; quantity: number }>(
    `SELECT e.*, v.name AS venue_name,
            (SELECT COALESCE(sum(sold), 0)::int FROM ticket_types t WHERE t.event_id = e.id) AS sold,
            (SELECT COALESCE(sum(quantity), 0)::int FROM ticket_types t WHERE t.event_id = e.id) AS quantity,
            (SELECT COALESCE(sum(total_kzt), 0)::int FROM orders o WHERE o.event_id = e.id AND o.status = 'paid') AS gross_kzt
       FROM events e JOIN venues v ON v.id = e.venue_id
      WHERE ($1 OR e.organizer_id = $2) ORDER BY e.starts_at DESC`,
    [all, me(req).id],
  );
  res.json(rows.map((r) => ({ ...r, lifecycle: lifecycle(r) })));
});

organizerRouter.post("/events", async (req, res) => {
  const b = parse(eventSchema, req.body);
  if (b.endsAt <= b.startsAt) throw badRequest("The end time must be after the start time");
  const venue = await one("SELECT has_seat_map FROM venues WHERE id = $1", [b.venueId]);
  if (!venue) throw badRequest("Unknown venue");
  if (b.seating === "assigned" && !venue.has_seat_map) throw badRequest("Assigned seating needs a venue with a seat map");
  const e = await one<{ id: number; title: string }>(
    `INSERT INTO events (organizer_id, venue_id, slug, title, description, category, starts_at, ends_at, visibility, seating, capacity,
                         registration_opens_at, registration_closes_at, refund_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 'Refunds are possible until 48 hours before the event.'))
     RETURNING id, title`,
    [me(req).id, b.venueId, slugify(b.title), b.title, b.description, b.category, b.startsAt, b.endsAt, b.visibility, b.seating, b.capacity, b.registrationOpensAt ?? null, b.registrationClosesAt ?? null, b.refundPolicy ?? null],
  );
  await audit({ eventId: e!.id, actorId: me(req).id, action: "event.created", entityType: "event", entityId: e!.id, description: `Draft "${e!.title}" created` });
  res.status(201).json(e);
});

async function activationChecklist(event: EventRow) {
  const act = await one("SELECT * FROM event_activations WHERE event_id = $1", [event.id]);
  const profile = await one("SELECT identity_status FROM organizer_profiles WHERE user_id = $1", [event.organizer_id]);
  const payout = await one("SELECT 1 FROM payout_accounts WHERE organizer_id = $1", [event.organizer_id]);
  const paidType = await one("SELECT 1 FROM ticket_types WHERE event_id = $1 AND price_kzt > 0", [event.id]);
  const fee = act?.fee_kzt ?? (await settingNumber("activation_fee_kzt"));
  return {
    status: event.paid_sales_status,
    feeKzt: fee,
    steps: [
      { key: "paid_ticket_type", label: "Create at least one paid ticket type", done: Boolean(paidType) },
      { key: "identity", label: "Verify your identity (simulation)", done: profile?.identity_status === "verified" },
      { key: "payout", label: "Connect a payout account (demo)", done: Boolean(payout) },
      { key: "fee", label: `Pay the Paid Sales Activation Fee (${fee} KZT, DEMO)`, done: Boolean(act?.fee_paid_at) },
      { key: "terms", label: "Accept the paid-event terms", done: Boolean(act?.terms_accepted_at) },
    ],
  };
}

/** Activates paid sales once all checklist steps are complete (activation applies only to this event). */
async function maybeActivate(user: AuthUser, event: EventRow) {
  const c = await activationChecklist(event);
  if (event.paid_sales_status === "inactive" && c.steps.every((s) => s.done)) {
    await q("UPDATE events SET paid_sales_status = 'active', updated_at = now() WHERE id = $1", [event.id]);
    await q("UPDATE event_activations SET activated_at = now() WHERE event_id = $1", [event.id]);
    await audit({ eventId: event.id, actorId: user.id, action: "activation.completed", entityType: "event", entityId: event.id, description: "Paid ticket sales activated" });
    await notify(event.organizer_id, { kind: "activation", title: `Paid sales are active: ${event.title}`, link: `/organizer/events/${event.id}` });
  }
}

organizerRouter.get("/events/:id", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const ticketTypes = await q("SELECT * FROM ticket_types WHERE event_id = $1 ORDER BY sort_order, id", [e.id]);
  const venue = await one("SELECT * FROM venues WHERE id = $1", [e.venue_id]);
  const staff = await q("SELECT u.id, u.email, u.full_name, s.can_undo FROM staff_assignments s JOIN users u ON u.id = s.user_id WHERE s.event_id = $1 ORDER BY u.full_name", [e.id]);
  res.json({ ...e, lifecycle: lifecycle(e), venue, ticketTypes, staff, stats: await eventStats(e.id), activation: await activationChecklist(e) });
});

organizerRouter.patch("/events/:id", async (req, res) => {
  const user = me(req);
  const e = await getManagedEvent(user, idParam(req));
  if (e.status === "cancelled") throw badRequest("A cancelled event cannot be edited");
  const b = parse(eventSchema.partial(), req.body);
  const startsAt = b.startsAt ?? e.starts_at;
  const endsAt = b.endsAt ?? e.ends_at;
  if (endsAt <= startsAt) throw badRequest("The end time must be after the start time");
  if (b.seating && b.seating !== e.seating) {
    const sold = await one("SELECT 1 FROM orders WHERE event_id = $1 LIMIT 1", [e.id]);
    if (sold) throw badRequest("Seating type cannot change after orders exist");
  }
  if (b.capacity !== undefined) {
    const used = await eventStats(e.id);
    if (b.capacity < (used?.sold ?? 0) + (used?.reserved ?? 0)) throw badRequest("Capacity cannot be below the number of tickets already sold or reserved");
  }
  await q(
    `UPDATE events SET title = $2, description = $3, category = $4, venue_id = $5, starts_at = $6, ends_at = $7, visibility = $8,
            seating = $9, capacity = $10, registration_opens_at = $11, registration_closes_at = $12, refund_policy = $13, updated_at = now()
      WHERE id = $1`,
    [e.id, b.title ?? e.title, b.description ?? e.description, b.category ?? e.category, b.venueId ?? e.venue_id, startsAt, endsAt, b.visibility ?? e.visibility, b.seating ?? e.seating, b.capacity ?? e.capacity,
      b.registrationOpensAt === undefined ? e.registration_opens_at : b.registrationOpensAt, b.registrationClosesAt === undefined ? e.registration_closes_at : b.registrationClosesAt, b.refundPolicy ?? e.refund_policy],
  );
  const changes = Object.keys(b).join(", ");
  await audit({ eventId: e.id, actorId: user.id, action: b.capacity !== undefined && b.capacity !== e.capacity ? "event.capacity_changed" : "event.updated", entityType: "event", entityId: e.id, description: `Event updated (${changes})${b.capacity !== undefined && b.capacity !== e.capacity ? `; capacity ${e.capacity} → ${b.capacity}` : ""}` });
  // Tell ticket holders about changes to time or place (SRS 4.10 "event updates").
  if (e.status === "published" && (b.startsAt || b.endsAt || b.venueId)) {
    const holders = await q<{ user_id: number }>("SELECT DISTINCT user_id FROM tickets WHERE event_id = $1 AND status IN ('valid', 'checked_in')", [e.id]);
    for (const h of holders) await notify(h.user_id, { kind: "event_updated", title: `Event updated: ${b.title ?? e.title}`, body: "The date, time or venue changed. Download the calendar file again to update your calendar.", link: `/events/${e.slug}` });
  }
  res.json({ ok: true });
});

organizerRouter.post("/events/:id/image", imageUpload, async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  if (!req.file) throw badRequest("Choose an image");
  await q("UPDATE events SET image_url = $2, updated_at = now() WHERE id = $1", [e.id, publicUrl(req.file.filename)]);
  res.json({ image_url: publicUrl(req.file.filename) });
});

organizerRouter.post("/events/:id/publish", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  if (e.status === "cancelled") throw badRequest("A cancelled event cannot be published");
  if (e.suspended_at) throw badRequest("This event is suspended by the platform");
  const types = await one<{ n: number }>("SELECT count(*)::int AS n FROM ticket_types WHERE event_id = $1 AND NOT hidden", [e.id]);
  if (!types?.n) throw badRequest("Add at least one ticket type before publishing");
  await q("UPDATE events SET status = 'published', updated_at = now() WHERE id = $1", [e.id]);
  await audit({ eventId: e.id, actorId: me(req).id, action: "event.published", entityType: "event", entityId: e.id, description: "Event published" });
  res.json({ ok: true });
});

organizerRouter.post("/events/:id/unpublish", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  if (e.status !== "published") throw badRequest("Only published events can be unpublished");
  await q("UPDATE events SET status = 'draft', updated_at = now() WHERE id = $1", [e.id]);
  await audit({ eventId: e.id, actorId: me(req).id, action: "event.unpublished", entityType: "event", entityId: e.id, description: "Event unpublished (back to draft)" });
  res.json({ ok: true });
});

/** Cancelling an event invalidates all tickets: free ones are cancelled, paid ones refunded (DEMO). */
organizerRouter.post("/events/:id/cancel", async (req, res) => {
  const user = me(req);
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
  const e = await getManagedEvent(user, idParam(req));
  if (e.status === "cancelled") throw badRequest("Already cancelled");
  const orders = await q<{ id: number }>("SELECT id FROM orders WHERE event_id = $1 AND status = 'paid'", [e.id]);
  await q("UPDATE events SET status = 'cancelled', updated_at = now() WHERE id = $1", [e.id]);
  await audit({ eventId: e.id, actorId: user.id, action: "event.cancelled", entityType: "event", entityId: e.id, description: `Event cancelled: ${reason}` });
  for (const o of orders) await refundOrCancelPaidOrder(user, o.id, `Event cancelled: ${reason}`).catch(() => undefined);
  const holders = await q<{ user_id: number }>("SELECT DISTINCT user_id FROM orders WHERE event_id = $1", [e.id]);
  for (const h of holders) await notify(h.user_id, { kind: "event_cancelled", title: `Event cancelled: ${e.title}`, body: `${reason}. A cancellation calendar file is on the event page.`, link: `/events/${e.slug}` });
  res.json({ ok: true, refundedOrders: orders.length });
});

/** Duplicates configuration only: no orders, tickets, payments, check-ins or support cases (SRS 4.16). */
organizerRouter.post("/events/:id/duplicate", async (req, res) => {
  const user = me(req);
  const e = await getManagedEvent(user, idParam(req));
  const copy = await tx(async (db) => {
    const n = await one<{ id: number }>(
      `INSERT INTO events (organizer_id, venue_id, slug, title, description, category, image_url, starts_at, ends_at, visibility, seating, capacity, refund_policy, duplicated_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [e.organizer_id, e.venue_id, slugify(e.title), `${e.title} (copy)`, e.description, e.category, e.image_url, e.starts_at, e.ends_at, e.visibility, e.seating, e.capacity, e.refund_policy, e.id],
      db,
    );
    await db.query(
      `INSERT INTO ticket_types (event_id, name, description, price_kzt, quantity, max_per_order, hidden, section_codes, sort_order)
       SELECT $2, name, description, price_kzt, quantity, max_per_order, hidden, section_codes, sort_order FROM ticket_types WHERE event_id = $1`,
      [e.id, n!.id],
    );
    await audit({ eventId: n!.id, actorId: user.id, action: "event.duplicated", entityType: "event", entityId: n!.id, description: `Draft created as a copy of event #${e.id}` }, db);
    return n!;
  });
  res.status(201).json(copy);
});

// ---------- Ticket types ----------
const typeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  priceKzt: z.coerce.number().int().min(0).max(10_000_000),
  quantity: z.coerce.number().int().min(0).max(200_000),
  salesStart: zOptDate,
  salesEnd: zOptDate,
  maxPerOrder: z.coerce.number().int().min(1).max(50).default(10),
  hidden: z.boolean().default(false),
  sectionCodes: z.array(z.string().max(10)).default([]),
});

organizerRouter.post("/events/:id/ticket-types", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const b = parse(typeSchema, req.body);
  if (b.priceKzt === 0 && b.maxPerOrder > 1) b.maxPerOrder = 1; // one free ticket per account per event
  const t = await one(
    `INSERT INTO ticket_types (event_id, name, description, price_kzt, quantity, sales_start, sales_end, max_per_order, hidden, section_codes,
                               sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT COALESCE(max(sort_order), 0) + 1 FROM ticket_types WHERE event_id = $1)) RETURNING *`,
    [e.id, b.name, b.description, b.priceKzt, b.quantity, b.salesStart ?? null, b.salesEnd ?? null, b.maxPerOrder, b.hidden, b.sectionCodes],
  );
  await audit({ eventId: e.id, actorId: me(req).id, action: "ticket_type.created", entityType: "ticket_type", entityId: t.id, description: `Ticket type "${b.name}" created: ${b.priceKzt} KZT × ${b.quantity}` });
  res.status(201).json(t);
});

organizerRouter.patch("/ticket-types/:tid", async (req, res) => {
  const t = await one("SELECT * FROM ticket_types WHERE id = $1", [idParam(req, "tid")]);
  if (!t) throw notFound("Ticket type not found");
  const e = await getManagedEvent(me(req), t.event_id);
  const b = parse(typeSchema.partial(), req.body);
  if (b.quantity !== undefined && b.quantity < t.sold + t.reserved) throw badRequest(`Quantity cannot be below ${t.sold + t.reserved} (already sold or reserved)`);
  if (b.priceKzt !== undefined && b.priceKzt !== t.price_kzt && t.sold > 0 && (b.priceKzt === 0 || t.price_kzt === 0)) throw badRequest("Cannot switch between free and paid after tickets were issued");
  const price = b.priceKzt ?? t.price_kzt;
  const maxPerOrder = price === 0 ? 1 : (b.maxPerOrder ?? t.max_per_order);
  await q(
    `UPDATE ticket_types SET name = $2, description = $3, price_kzt = $4, quantity = $5, sales_start = $6, sales_end = $7, max_per_order = $8, hidden = $9, section_codes = $10 WHERE id = $1`,
    [t.id, b.name ?? t.name, b.description ?? t.description, price, b.quantity ?? t.quantity, b.salesStart === undefined ? t.sales_start : b.salesStart, b.salesEnd === undefined ? t.sales_end : b.salesEnd, maxPerOrder, b.hidden ?? t.hidden, b.sectionCodes ?? t.section_codes],
  );
  const notes = [];
  if (b.priceKzt !== undefined && b.priceKzt !== t.price_kzt) notes.push(`price ${t.price_kzt} → ${b.priceKzt} KZT`);
  if (b.quantity !== undefined && b.quantity !== t.quantity) notes.push(`quantity ${t.quantity} → ${b.quantity}`);
  if (b.hidden !== undefined && b.hidden !== t.hidden) notes.push(b.hidden ? "hidden" : "shown");
  await audit({ eventId: e.id, actorId: me(req).id, action: notes.length ? "ticket_type.price_or_capacity_changed" : "ticket_type.updated", entityType: "ticket_type", entityId: t.id, description: `Ticket type "${b.name ?? t.name}" updated${notes.length ? `: ${notes.join(", ")}` : ""}` });
  res.json({ ok: true });
});

organizerRouter.delete("/ticket-types/:tid", async (req, res) => {
  const t = await one("SELECT * FROM ticket_types WHERE id = $1", [idParam(req, "tid")]);
  if (!t) throw notFound("Ticket type not found");
  await getManagedEvent(me(req), t.event_id);
  const used = await one("SELECT 1 FROM order_items WHERE ticket_type_id = $1 LIMIT 1", [t.id]);
  if (used) throw conflict("This ticket type has orders. Hide it instead of deleting it.", "in_use");
  await q("DELETE FROM ticket_types WHERE id = $1", [t.id]);
  res.json({ ok: true });
});

// ---------- Paid Sales Activation ----------
organizerRouter.get("/events/:id/activation", async (req, res) => {
  res.json(await activationChecklist(await getManagedEvent(me(req), idParam(req))));
});

organizerRouter.post("/events/:id/activation/terms", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const fee = await settingNumber("activation_fee_kzt");
  await q(
    `INSERT INTO event_activations (event_id, fee_kzt, terms_accepted_at) VALUES ($1, $2, now())
     ON CONFLICT (event_id) DO UPDATE SET terms_accepted_at = now()`,
    [e.id, fee],
  );
  await audit({ eventId: e.id, actorId: me(req).id, action: "activation.terms_accepted", entityType: "event", entityId: e.id, description: "Paid-event terms accepted" });
  await maybeActivate(me(req), e);
  res.json(await activationChecklist(await getManagedEvent(me(req), e.id)));
});

organizerRouter.post("/events/:id/activation/pay", async (req, res) => {
  const { provider } = parse(z.object({ provider: z.enum(["demo", "halyk"]).default("demo") }), req.body);
  const e = await getManagedEvent(me(req), idParam(req));
  const fee = await settingNumber("activation_fee_kzt");
  const act = await one(
    `INSERT INTO event_activations (event_id, fee_kzt) VALUES ($1, $2) ON CONFLICT (event_id) DO UPDATE SET fee_kzt = event_activations.fee_kzt RETURNING *`,
    [e.id, fee],
  );
  if (act.fee_paid_at) throw badRequest("The activation fee is already paid");
  const payment = await startPayment(me(req), "activation_fee", { eventId: e.id, amount: act.fee_kzt }, provider);
  if (provider === "halyk") {
    const paymentObject = await halykPaymentObject({ invoiceId: payment.provider_ref, amount: act.fee_kzt, description: `BiletFlow activation: ${e.title}`, email: me(req).email, accountId: String(me(req).id), backPath: `/organizer/events/${e.id}`, paymentId: payment.id });
    res.json({ paymentId: payment.id, provider, paymentObject, script: config.halyk.payformScript });
    return;
  }
  res.json({ paymentId: payment.id, provider });
});

/** Re-checks the checklist (called after the fee payment returns). */
organizerRouter.post("/events/:id/activation/check", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  await maybeActivate(me(req), e);
  res.json(await activationChecklist(await getManagedEvent(me(req), e.id)));
});

// ---------- Event Admins (check-in staff) ----------
organizerRouter.post("/events/:id/staff", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const b = parse(z.object({ email: z.string().trim().toLowerCase().email(), canUndo: z.boolean().default(true) }), req.body);
  const user = await one<{ id: number; full_name: string }>("SELECT id, full_name FROM users WHERE email = $1", [b.email]);
  if (!user) throw badRequest("No BiletFlow account with this email. Ask them to sign up first.", "user_not_found");
  await q("INSERT INTO staff_assignments (event_id, user_id, can_undo) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO UPDATE SET can_undo = $3", [e.id, user.id, b.canUndo]);
  await audit({ eventId: e.id, actorId: me(req).id, action: "staff.assigned", entityType: "user", entityId: user.id, description: `${user.full_name} assigned as Event Admin` });
  await notify(user.id, { kind: "staff_assigned", title: `You are an Event Admin for ${e.title}`, body: "Sign in to the BiletFlow Scanner app or open Check-in on the website to verify tickets." , link: `/checkin/${e.id}` });
  res.status(201).json({ ok: true });
});

organizerRouter.delete("/events/:id/staff/:uid", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  await q("DELETE FROM staff_assignments WHERE event_id = $1 AND user_id = $2", [e.id, idParam(req, "uid")]);
  await audit({ eventId: e.id, actorId: me(req).id, action: "staff.removed", entityType: "user", entityId: idParam(req, "uid"), description: "Event Admin removed" });
  res.json({ ok: true });
});

// ---------- Attendees and orders ----------
organizerRouter.get("/events/:id/attendees", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const search = typeof req.query.search === "string" ? `%${req.query.search.trim()}%` : "%";
  const rows = await q(
    `SELECT t.id, t.code, t.status, t.attendee_name, t.checked_in_at, t.section_code, t.row_label, t.seat_number,
            tt.name AS ticket_type, o.code AS order_code, o.attendee_email, o.id AS order_id
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN orders o ON o.id = t.order_id
      WHERE t.event_id = $1 AND (t.attendee_name ILIKE $2 OR t.code ILIKE $2 OR o.attendee_email ILIKE $2)
      ORDER BY t.attendee_name`,
    [e.id, search],
  );
  if (req.query.format === "csv") {
    const header = "ticket_code,attendee,email,ticket_type,section,row,seat,status,checked_in_at";
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [header, ...rows.map((r) => [r.code, r.attendee_name, r.attendee_email, r.ticket_type, r.section_code, r.row_label, r.seat_number, r.status, r.checked_in_at?.toISOString?.() ?? ""].map(esc).join(","))].join("\n");
    res.type("text/csv").setHeader("Content-Disposition", `attachment; filename="attendees-${e.slug}.csv"`).send(csv);
    return;
  }
  res.json(rows);
});

organizerRouter.get("/events/:id/orders", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  res.json(
    await q(
      `SELECT o.id, o.code, o.status, o.attendee_name, o.attendee_email, o.subtotal_kzt, o.discount_kzt, o.fee_kzt, o.total_kzt,
              o.created_at, o.paid_at, c.code AS promo_code, (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS tickets
         FROM orders o LEFT JOIN campaigns c ON c.id = o.campaign_id WHERE o.event_id = $1 ORDER BY o.created_at DESC`,
      [e.id],
    ),
  );
});

organizerRouter.post("/orders/:oid/refund", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
  await refundOrCancelPaidOrder(me(req), idParam(req, "oid"), reason);
  res.json({ ok: true });
});

// ---------- Promotional campaigns ----------
const campaignSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "use 3–30 letters, digits, - or _").optional(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().int().min(1),
  validFrom: zOptDate,
  validUntil: zOptDate,
  maxRedemptions: z.coerce.number().int().min(1).nullable().optional(),
  ticketTypeIds: z.array(z.coerce.number().int()).default([]),
});

organizerRouter.get("/events/:id/campaigns", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  res.json(
    await q(
      `SELECT c.*, (SELECT count(*)::int FROM campaign_visits v WHERE v.campaign_id = c.id) AS visits,
              (SELECT count(*)::int FROM promo_redemptions r WHERE r.campaign_id = c.id) AS paid_redemptions,
              (SELECT COALESCE(sum(r.discount_kzt), 0)::int FROM promo_redemptions r WHERE r.campaign_id = c.id) AS discount_kzt,
              (SELECT COALESCE(sum(o.total_kzt), 0)::int FROM orders o WHERE o.campaign_id = c.id AND o.status = 'paid') AS revenue_kzt,
              (SELECT count(*)::int FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.campaign_id = c.id AND t.status IN ('valid','checked_in')) AS tickets
         FROM campaigns c WHERE c.event_id = $1 ORDER BY c.created_at DESC`,
      [e.id],
    ),
  );
});

organizerRouter.post("/events/:id/campaigns", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const b = parse(campaignSchema, req.body);
  if (b.discountType === "percent" && b.discountValue > 100) throw badRequest("A percent discount cannot be more than 100");
  const c = await one(
    `INSERT INTO campaigns (event_id, name, code, token, discount_type, discount_value, valid_from, valid_until, max_redemptions, ticket_type_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [e.id, b.name, b.code ?? randomCode(8), opaqueToken(), b.discountType, b.discountValue, b.validFrom ?? null, b.validUntil ?? null, b.maxRedemptions ?? null, b.ticketTypeIds],
  );
  await audit({ eventId: e.id, actorId: me(req).id, action: "campaign.created", entityType: "campaign", entityId: c.id, description: `Promo code ${c.code} created (${b.discountType === "percent" ? `${b.discountValue}%` : `${b.discountValue} KZT`} off)` });
  res.status(201).json(c);
});

organizerRouter.patch("/campaigns/:cid", async (req, res) => {
  const c = await one("SELECT * FROM campaigns WHERE id = $1", [idParam(req, "cid")]);
  if (!c) throw notFound("Campaign not found");
  const e = await getManagedEvent(me(req), c.event_id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  await q("UPDATE campaigns SET active = $2 WHERE id = $1", [c.id, active]);
  await audit({ eventId: e.id, actorId: me(req).id, action: active ? "campaign.enabled" : "campaign.disabled", entityType: "campaign", entityId: c.id, description: `Promo code ${c.code} ${active ? "enabled" : "disabled"}` });
  res.json({ ok: true });
});

/** Campaign QR image: an orange-framed HTTPS link with an opaque token. It is NOT an admission ticket. */
organizerRouter.get("/campaigns/:cid/qr.png", async (req, res) => {
  const c = await one("SELECT * FROM campaigns WHERE id = $1", [idParam(req, "cid")]);
  if (!c) throw notFound("Campaign not found");
  await getManagedEvent(me(req), c.event_id);
  const { default: QRCode } = await import("qrcode");
  const png = await QRCode.toBuffer(`${config.webUrl}/c/${c.token}`, { width: 600, margin: 3, color: { dark: "#9a3412", light: "#fff7ed" } });
  res.type("png").setHeader("Content-Disposition", `inline; filename="promo-${c.code}.png"`).send(png);
});

// ---------- History / audit timeline ----------
organizerRouter.get("/events/:id/history", async (req, res) => {
  const e = await getManagedEvent(me(req), idParam(req));
  const f = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), type: z.string().max(40).optional() }), req.query);
  res.json(
    await q(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.description, a.created_at, u.full_name AS actor
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.event_id = $1 AND ($2::timestamptz IS NULL OR a.created_at >= $2) AND ($3::timestamptz IS NULL OR a.created_at <= $3)
          AND ($4::text IS NULL OR a.action LIKE $4 || '%')
        ORDER BY a.created_at DESC LIMIT 500`,
      [e.id, f.from ?? null, f.to ?? null, f.type ?? null],
    ),
  );
});

// ---------- Analytics (from BiletFlow records only, SRS 4.15) ----------
organizerRouter.get("/analytics", async (req, res) => {
  const f = parse(z.object({ eventId: z.coerce.number().int().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), ticketTypeId: z.coerce.number().int().optional() }), req.query);
  const user = me(req);
  if (f.eventId) await getManagedEvent(user, f.eventId);
  // Event scope: one event, or all events this organizer manages.
  const scope = `e.organizer_id = $1 AND ($2::bigint IS NULL OR e.id = $2)`;
  const base = [user.id, f.eventId ?? null];
  const dateFilter = `($3::timestamptz IS NULL OR o.created_at >= $3) AND ($4::timestamptz IS NULL OR o.created_at <= $4)`;
  const typeFilter = `($5::bigint IS NULL OR i.ticket_type_id = $5)`;
  const params = [...base, f.from ?? null, f.to ?? null, f.ticketTypeId ?? null];

  const capacity = await one(
    `SELECT COALESCE(sum(t.quantity), 0)::int AS capacity, COALESCE(sum(t.sold), 0)::int AS sold, COALESCE(sum(t.reserved), 0)::int AS reserved
       FROM ticket_types t JOIN events e ON e.id = t.event_id WHERE ${scope} AND ($3::bigint IS NULL OR t.id = $3)`,
    [...base, f.ticketTypeId ?? null],
  );
  const money = await one(
    `SELECT COALESCE(sum(i.unit_price_kzt) FILTER (WHERE o.status IN ('paid','refunded')), 0)::int AS gross,
            COALESCE(sum(i.discount_kzt) FILTER (WHERE o.status IN ('paid','refunded')), 0)::int AS discounts,
            COALESCE(sum(i.unit_price_kzt - i.discount_kzt) FILTER (WHERE o.status = 'refunded'), 0)::int AS refunds
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN events e ON e.id = o.event_id
      WHERE ${scope} AND ${dateFilter} AND ${typeFilter}`,
    params,
  );
  const overTime = await q(
    `SELECT to_char(date_trunc('day', o.created_at AT TIME ZONE 'Asia/Almaty'), 'YYYY-MM-DD') AS day,
            count(*)::int AS tickets, COALESCE(sum(i.unit_price_kzt - i.discount_kzt), 0)::int AS revenue
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN events e ON e.id = o.event_id
      WHERE ${scope} AND ${dateFilter} AND ${typeFilter} AND o.status = 'paid'
      GROUP BY 1 ORDER BY 1`,
    params,
  );
  const byType = await q(
    `SELECT tt.id, tt.name, e.title AS event_title, tt.quantity, tt.sold, tt.price_kzt,
            COALESCE((SELECT sum(i.unit_price_kzt - i.discount_kzt) FROM order_items i JOIN orders o ON o.id = i.order_id
                       WHERE i.ticket_type_id = tt.id AND o.status = 'paid' AND ${dateFilter}), 0)::int AS revenue
       FROM ticket_types tt JOIN events e ON e.id = tt.event_id WHERE ${scope} AND ($5::bigint IS NULL OR tt.id = $5) ORDER BY e.starts_at, tt.sort_order`,
    params,
  );
  const campaigns = await q(
    `SELECT c.id, c.code, c.name, e.title AS event_title, c.redemptions,
            (SELECT count(*)::int FROM campaign_visits v WHERE v.campaign_id = c.id) AS visits,
            (SELECT count(*)::int FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.campaign_id = c.id AND o.status = 'paid') AS tickets,
            (SELECT COALESCE(sum(o.total_kzt), 0)::int FROM orders o WHERE o.campaign_id = c.id AND o.status = 'paid' AND ${dateFilter}) AS revenue,
            (SELECT COALESCE(sum(o.discount_kzt), 0)::int FROM orders o WHERE o.campaign_id = c.id AND o.status = 'paid' AND ${dateFilter}) AS discount
       FROM campaigns c JOIN events e ON e.id = c.event_id WHERE ${scope} ORDER BY revenue DESC`,
    [...params.slice(0, 4)],
  );
  const attendance = await one(
    `SELECT count(*) FILTER (WHERE t.status IN ('valid','checked_in'))::int AS holders,
            count(*) FILTER (WHERE t.status = 'checked_in')::int AS checked_in
       FROM tickets t JOIN events e ON e.id = t.event_id WHERE ${scope} AND ($3::bigint IS NULL OR t.ticket_type_id = $3)`,
    [...base, f.ticketTypeId ?? null],
  );
  const cap = capacity ?? { capacity: 0, sold: 0, reserved: 0 };
  res.json({
    demo: true,
    capacity: { ...cap, remaining: Math.max(cap.capacity - cap.sold - cap.reserved, 0), percentSold: cap.capacity ? Math.round((cap.sold / cap.capacity) * 1000) / 10 : 0 },
    money: { ...money, net: (money?.gross ?? 0) - (money?.discounts ?? 0) - (money?.refunds ?? 0) },
    overTime,
    byType,
    campaigns,
    attendance: { ...attendance, absent: (attendance?.holders ?? 0) - (attendance?.checked_in ?? 0), percent: attendance?.holders ? Math.round((attendance.checked_in / attendance.holders) * 1000) / 10 : 0 },
  });
});
