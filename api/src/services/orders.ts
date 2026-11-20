// Ticket ordering: reservations, promo codes, free-ticket rule, payment completion, cancellations and refunds.
// Every function that changes inventory runs inside one database transaction (SRS 4.3, 4.3.1, 4.6, 4.14).
import type pg from "pg";
import { one, pool, q, tx } from "../db/pool.js";
import type { AuthUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { opaqueToken, orderCode, ticketCode } from "../lib/codes.js";
import { config } from "../lib/config.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/http.js";
import { notify } from "../lib/notify.js";
import { getEvent } from "./access.js";

export interface CartInput {
  eventId: number;
  items: { ticketTypeId: number; quantity: number }[]; // general admission
  seatIds: number[]; // assigned seating
  promoCode?: string | null;
  campaignToken?: string | null;
  attendeeName: string;
  attendeeEmail: string;
}

interface TicketTypeRow {
  id: number;
  event_id: number;
  name: string;
  price_kzt: number;
  quantity: number;
  sold: number;
  reserved: number;
  sales_start: Date | null;
  sales_end: Date | null;
  max_per_order: number;
  hidden: boolean;
  section_codes: string[];
}

export interface CampaignRow {
  id: number;
  event_id: number;
  name: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_from: Date | null;
  valid_until: Date | null;
  max_redemptions: number | null;
  redemptions: number;
  ticket_type_ids: number[];
  active: boolean;
}

export async function settingNumber(key: string, db: pg.Pool | pg.PoolClient = pool) {
  const row = await one<{ value: string }>("SELECT value FROM platform_settings WHERE key = $1", [key], db);
  return Number(row?.value ?? 0);
}

/** Finds a campaign by promo code or Campaign QR token and checks it is usable right now. */
export async function findCampaign(
  eventId: number,
  input: { code?: string | null; token?: string | null },
  db: pg.Pool | pg.PoolClient = pool,
  lock = false,
) {
  let campaign: CampaignRow | undefined;
  const forUpdate = lock ? " FOR UPDATE" : "";
  if (input.token) {
    campaign = await one<CampaignRow>(`SELECT * FROM campaigns WHERE token = $1${forUpdate}`, [input.token], db);
  } else if (input.code) {
    campaign = await one<CampaignRow>(
      `SELECT * FROM campaigns WHERE event_id = $1 AND upper(code) = upper($2)${forUpdate}`,
      [eventId, input.code.trim()],
      db,
    );
  }
  if (!campaign || campaign.event_id !== eventId) throw badRequest("This promo code does not exist for this event", "promo_invalid");
  const now = Date.now();
  if (!campaign.active) throw badRequest("This promo code has been disabled", "promo_disabled");
  if (campaign.valid_from && new Date(campaign.valid_from).getTime() > now) throw badRequest("This promo code is not active yet", "promo_not_started");
  if (campaign.valid_until && new Date(campaign.valid_until).getTime() < now) throw badRequest("This promo code has expired", "promo_expired");
  if (campaign.max_redemptions !== null && campaign.redemptions >= campaign.max_redemptions)
    throw badRequest("This promo code has been fully used", "promo_exhausted");
  return campaign;
}

export function discountFor(campaign: CampaignRow | undefined, ticketTypeId: number, price: number) {
  if (!campaign || price === 0) return 0;
  if (campaign.ticket_type_ids.length && !campaign.ticket_type_ids.includes(ticketTypeId)) return 0;
  const d = campaign.discount_type === "percent" ? Math.floor((price * campaign.discount_value) / 100) : campaign.discount_value;
  return Math.min(d, price);
}

function assertEventOpen(e: Awaited<ReturnType<typeof getEvent>>) {
  const now = Date.now();
  if (e.status !== "published") throw badRequest("This event is not open for registration", "event_closed");
  if (e.suspended_at) throw badRequest("Sales for this event are suspended", "event_suspended");
  if (new Date(e.ends_at).getTime() < now) throw badRequest("This event has already ended", "event_closed");
  if (e.registration_opens_at && new Date(e.registration_opens_at).getTime() > now)
    throw badRequest("Registration has not opened yet", "registration_not_open");
  if (e.registration_closes_at && new Date(e.registration_closes_at).getTime() < now)
    throw badRequest("Registration is closed", "registration_closed");
}

function assertTypeOnSale(t: TicketTypeRow) {
  const now = Date.now();
  if (t.hidden) throw badRequest(`"${t.name}" is not available`, "ticket_unavailable");
  if (t.sales_start && new Date(t.sales_start).getTime() > now) throw badRequest(`Sales for "${t.name}" have not started`, "sales_not_started");
  if (t.sales_end && new Date(t.sales_end).getTime() < now) throw badRequest(`Sales for "${t.name}" have ended`, "sales_ended");
}

/** Creates an order and reserves its tickets/seats. Free (zero-total) orders are completed immediately. */
export async function createOrder(user: AuthUser, input: CartInput) {
  await releaseExpiredReservations();
  const result = await tx(async (db) => {
    // Locking the event row serializes checkouts for one event, so capacity checks are exact.
    const event = await getEvent(input.eventId, db, true);
    assertEventOpen(event);

    const types = await q<TicketTypeRow>("SELECT * FROM ticket_types WHERE event_id = $1 FOR UPDATE", [event.id], db);
    const typeById = new Map(types.map((t) => [t.id, t]));

    // Build the list of tickets to sell: one line per ticket.
    type Line = { type: TicketTypeRow; seat?: { id: number; section_code: string; row_label: string; seat_number: number } };
    const lines: Line[] = [];

    if (event.seating === "assigned") {
      if (!input.seatIds.length) throw badRequest("Choose at least one seat", "no_seats");
      const seats = await q<{ id: number; section_code: string; row_label: string; seat_number: number }>(
        `SELECT s.id, vs.code AS section_code, s.row_label, s.seat_number
           FROM seats s JOIN venue_sections vs ON vs.id = s.section_id
          WHERE s.venue_id = $1 AND s.id = ANY($2::bigint[])`,
        [event.venue_id, input.seatIds],
        db,
      );
      if (seats.length !== new Set(input.seatIds).size) throw badRequest("Some selected seats do not exist", "seat_invalid");
      for (const seat of seats) {
        const type = types.find((t) => !t.hidden && t.section_codes.includes(seat.section_code));
        if (!type) throw badRequest(`Seats in section ${seat.section_code} are not on sale`, "seat_unavailable");
        lines.push({ type, seat });
      }
    } else {
      for (const item of input.items) {
        if (item.quantity <= 0) continue;
        const type = typeById.get(item.ticketTypeId);
        if (!type) throw badRequest("Unknown ticket type", "ticket_invalid");
        for (let i = 0; i < item.quantity; i++) lines.push({ type });
      }
    }
    if (!lines.length) throw badRequest("Choose at least one ticket", "empty_order");

    // Per-type checks: sale window, order limit, paid sales activation.
    const countByType = new Map<number, number>();
    for (const l of lines) countByType.set(l.type.id, (countByType.get(l.type.id) ?? 0) + 1);
    for (const [typeId, count] of countByType) {
      const t = typeById.get(typeId)!;
      assertTypeOnSale(t);
      if (count > t.max_per_order) throw badRequest(`You can buy at most ${t.max_per_order} × "${t.name}" per order`, "order_limit");
      if (t.price_kzt > 0 && event.paid_sales_status !== "active")
        throw badRequest("Paid tickets for this event are not on sale yet", "paid_sales_inactive");
    }

    // Free-ticket rule: one free ticket per account per event.
    const freeCount = lines.filter((l) => l.type.price_kzt === 0).length;
    if (freeCount > 1) throw badRequest("You can get only one free ticket for this event", "free_limit");

    // Event capacity across all ticket types.
    const totals = await one<{ used: number }>("SELECT COALESCE(SUM(sold + reserved), 0)::int AS used FROM ticket_types WHERE event_id = $1", [event.id], db);
    if ((totals?.used ?? 0) + lines.length > event.capacity) throw conflict("Not enough tickets left for this event", "sold_out");

    // Promo code / Campaign QR (validated and counted atomically on the server).
    let campaign: CampaignRow | undefined;
    if (input.promoCode || input.campaignToken) {
      campaign = await findCampaign(event.id, { code: input.promoCode, token: input.campaignToken }, db, true);
    }

    const subtotal = lines.reduce((s, l) => s + l.type.price_kzt, 0);
    const discounts = lines.map((l) => discountFor(campaign, l.type.id, l.type.price_kzt));
    const discount = discounts.reduce((a, b) => a + b, 0);
    if (campaign && discount === 0) throw badRequest("This promo code does not apply to the selected tickets", "promo_not_applicable");
    const feePercent = await settingNumber("processing_fee_percent", db);
    const fee = Math.round(((subtotal - discount) * feePercent) / 100);
    const total = subtotal - discount + fee;

    const order = await one<{ id: number; code: string }>(
      `INSERT INTO orders (code, event_id, user_id, status, subtotal_kzt, discount_kzt, fee_kzt, total_kzt, campaign_id,
                           attendee_name, attendee_email, reserved_until)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, now() + make_interval(mins => $11))
       RETURNING id, code`,
      [orderCode(), event.id, user.id, subtotal, discount, fee, total, campaign?.id ?? null, input.attendeeName, input.attendeeEmail, config.reservationMinutes],
      db,
    );

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await db.query(
        `INSERT INTO order_items (order_id, ticket_type_id, seat_id, section_code, row_label, seat_number, unit_price_kzt, discount_kzt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order!.id, l.type.id, l.seat?.id ?? null, l.seat?.section_code ?? null, l.seat?.row_label ?? null, l.seat?.seat_number ?? null, l.type.price_kzt, discounts[i]],
      );
      if (l.seat) {
        // Primary key (event_id, seat_id) rejects a seat that another order already holds or bought.
        try {
          await db.query("SAVEPOINT seat");
          await db.query(
            `INSERT INTO event_seats (event_id, seat_id, status, order_id, held_until)
             VALUES ($1, $2, 'held', $3, now() + make_interval(mins => $4))`,
            [event.id, l.seat.id, order!.id, config.reservationMinutes],
          );
          await db.query("RELEASE SAVEPOINT seat");
        } catch (err) {
          if ((err as { code?: string }).code === "23505")
            throw conflict(`Seat ${l.seat.section_code}-${l.seat.row_label}-${l.seat.seat_number} was just taken. Please choose another.`, "seat_taken");
          throw err;
        }
      }
    }

    // Reserve inventory; the CHECK (sold + reserved <= quantity) makes overselling impossible.
    for (const [typeId, count] of countByType) {
      const updated = await one(
        "UPDATE ticket_types SET reserved = reserved + $2 WHERE id = $1 AND sold + reserved + $2 <= quantity RETURNING id",
        [typeId, count],
        db,
      );
      if (!updated) throw conflict(`Not enough "${typeById.get(typeId)!.name}" tickets left`, "sold_out");
    }

    if (freeCount === 1) {
      try {
        await db.query("SAVEPOINT free");
        await db.query("INSERT INTO free_ticket_claims (event_id, user_id, order_id) VALUES ($1, $2, $3)", [event.id, user.id, order!.id]);
        await db.query("RELEASE SAVEPOINT free");
      } catch (err) {
        if ((err as { code?: string }).code === "23505")
          throw conflict("You already have a free ticket for this event. Each account can get one free ticket per event.", "free_limit");
        throw err;
      }
    }

    if (campaign) await db.query("UPDATE campaigns SET redemptions = redemptions + 1 WHERE id = $1", [campaign.id]);

    let issued = false;
    if (total === 0) {
      await issueTickets(order!.id, db, "none");
      issued = true;
    }
    return { orderId: order!.id, issued, eventId: event.id, title: event.title };
  });

  if (result.issued) await sendOrderConfirmation(result.orderId);
  return result.orderId;
}

/** Marks an order paid, converts reservations into sales and issues tickets. Call inside a transaction. */
export async function issueTickets(orderId: number, db: pg.PoolClient, provider: "none" | "demo" | "halyk") {
  const order = await one<{ id: number; code: string; event_id: number; user_id: number; status: string; attendee_name: string; campaign_id: number | null; discount_kzt: number }>(
    "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
    [orderId],
    db,
  );
  if (!order) throw notFound("Order not found");
  if (order.status !== "pending") throw conflict("This order is no longer waiting for payment", "order_not_pending");

  const items = await q<{ id: number; ticket_type_id: number; section_code: string | null; row_label: string | null; seat_number: number | null; seat_id: number | null }>(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id",
    [orderId],
    db,
  );
  await db.query("UPDATE orders SET status = 'paid', paid_at = now(), reserved_until = NULL, payment_provider = $2 WHERE id = $1", [orderId, provider]);
  await db.query(
    `UPDATE ticket_types t SET reserved = t.reserved - c.n, sold = t.sold + c.n
       FROM (SELECT ticket_type_id, count(*)::int AS n FROM order_items WHERE order_id = $1 GROUP BY ticket_type_id) c
      WHERE t.id = c.ticket_type_id`,
    [orderId],
  );
  await db.query("UPDATE event_seats SET status = 'sold', held_until = NULL WHERE order_id = $1", [orderId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await db.query(
      `INSERT INTO tickets (code, order_id, order_item_id, event_id, ticket_type_id, user_id, attendee_name, section_code, row_label, seat_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [ticketCode(order.code, i), order.id, it.id, order.event_id, it.ticket_type_id, order.user_id, order.attendee_name, it.section_code, it.row_label, it.seat_number],
    );
  }
  if (order.campaign_id) {
    await db.query("INSERT INTO promo_redemptions (campaign_id, order_id, discount_kzt) VALUES ($1, $2, $3)", [order.campaign_id, order.id, order.discount_kzt]);
  }
  await audit({ eventId: order.event_id, actorId: order.user_id, action: "order.paid", entityType: "order", entityId: order.id, description: `Order ${order.code} completed, ${items.length} ticket(s) issued` }, db);
}

export async function sendOrderConfirmation(orderId: number) {
  const o = await one<{ user_id: number; code: string; title: string; total_kzt: number }>(
    "SELECT o.user_id, o.code, o.total_kzt, e.title FROM orders o JOIN events e ON e.id = o.event_id WHERE o.id = $1",
    [orderId],
  );
  if (!o) return;
  await notify(o.user_id, {
    kind: "order_confirmed",
    title: `Your tickets for ${o.title}`,
    body: `Order ${o.code} is confirmed${o.total_kzt ? ` (DEMO payment, ${o.total_kzt} KZT)` : " (free registration)"}. Your QR tickets are in your account.`,
    link: `/orders/${orderId}`,
  });
}

/** Releases a pending order's reservations (expired, failed or cancelled before payment). */
async function releasePending(orderId: number, db: pg.PoolClient, status: "expired" | "failed" | "cancelled") {
  const order = await one<{ status: string; campaign_id: number | null; event_id: number; code: string }>(
    "SELECT status, campaign_id, event_id, code FROM orders WHERE id = $1 FOR UPDATE",
    [orderId],
    db,
  );
  if (!order || order.status !== "pending") return false;
  await db.query("UPDATE orders SET status = $2, reserved_until = NULL WHERE id = $1", [orderId, status]);
  await db.query(
    `UPDATE ticket_types t SET reserved = t.reserved - c.n
       FROM (SELECT ticket_type_id, count(*)::int AS n FROM order_items WHERE order_id = $1 GROUP BY ticket_type_id) c
      WHERE t.id = c.ticket_type_id`,
    [orderId],
  );
  await db.query("DELETE FROM event_seats WHERE order_id = $1", [orderId]);
  await db.query("DELETE FROM free_ticket_claims WHERE order_id = $1", [orderId]);
  if (order.campaign_id) await db.query("UPDATE campaigns SET redemptions = greatest(redemptions - 1, 0) WHERE id = $1", [order.campaign_id]);
  await audit({ eventId: order.event_id, action: `order.${status}`, entityType: "order", entityId: orderId, description: `Order ${order.code} ${status}; reserved tickets released` }, db);
  return true;
}

/** Releases every reservation whose hold time has passed (runs every minute and before each checkout). */
export async function releaseExpiredReservations() {
  const expired = await q<{ id: number }>("SELECT id FROM orders WHERE status = 'pending' AND reserved_until < now() LIMIT 200");
  for (const { id } of expired) {
    await tx((db) => releasePending(id, db, "expired"));
  }
  return expired.length;
}

export async function cancelPendingOrder(user: AuthUser, orderId: number) {
  const order = await one<{ user_id: number }>("SELECT user_id FROM orders WHERE id = $1", [orderId]);
  if (!order) throw notFound("Order not found");
  if (order.user_id !== user.id) throw forbidden();
  await tx((db) => releasePending(orderId, db, "cancelled"));
}

/** Completes a payment after the provider (or the demo page) reports the outcome. */
export async function completePayment(paymentId: number, success: boolean, details: Record<string, unknown> = {}) {
  const outcome = await tx(async (db) => {
    const p = await one<{ id: number; purpose: string; order_id: number | null; event_id: number; user_id: number; status: string; provider: "demo" | "halyk"; amount_kzt: number }>(
      "SELECT * FROM payments WHERE id = $1 FOR UPDATE",
      [paymentId],
      db,
    );
    if (!p) throw notFound("Payment not found");
    if (p.status !== "pending") return { already: true, p };
    await db.query("UPDATE payments SET status = $2, completed_at = now(), details = details || $3::jsonb WHERE id = $1", [
      p.id,
      success ? "succeeded" : "failed",
      JSON.stringify(details),
    ]);

    if (p.purpose === "activation_fee") {
      if (success) {
        await db.query("UPDATE event_activations SET fee_paid_at = now() WHERE event_id = $1", [p.event_id]);
        await audit({ eventId: p.event_id, actorId: p.user_id, action: "activation.fee_paid", entityType: "event", entityId: p.event_id, description: `Paid Sales Activation Fee paid (DEMO, ${p.amount_kzt} KZT)` }, db);
      }
      return { already: false, p };
    }

    const order = await one<{ status: string; reserved_until: Date | null }>("SELECT status, reserved_until FROM orders WHERE id = $1 FOR UPDATE", [p.order_id], db);
    if (!order || order.status !== "pending") {
      // Payment arrived after the reservation ended: no tickets are issued (SRS 4.6).
      await db.query("UPDATE payments SET details = details || '{\"note\":\"order was no longer pending\"}'::jsonb WHERE id = $1", [p.id]);
      return { already: false, p, lateFor: order?.status };
    }
    if (success) await issueTickets(p.order_id!, db, p.provider);
    else await releasePending(p.order_id!, db, "failed");
    return { already: false, p };
  });

  const p = outcome.p;
  if (!outcome.already && p.purpose === "ticket_order") {
    if (success && !outcome.lateFor) await sendOrderConfirmation(p.order_id!);
    if (!success) {
      await notify(p.user_id, { kind: "payment_failed", title: "Payment failed", body: "Your payment did not go through and your reserved tickets were released. You can try again.", link: `/orders/${p.order_id}` });
    }
  }
  if (outcome.lateFor) throw conflict("Your reservation had already ended, so no tickets were issued. No real money was charged (DEMO).", "reservation_ended");
  return p;
}

export async function startPayment(user: AuthUser, purpose: "ticket_order" | "activation_fee", ref: { orderId?: number; eventId: number; amount: number }, provider: "demo" | "halyk") {
  if (provider === "halyk" && !config.halyk.enabled) throw badRequest("Halyk ePay is not enabled on this server", "provider_disabled");
  // Halyk requires a numeric invoice id that is unique per payment.
  const providerRef = `${Date.now()}`.slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const payment = await one<{ id: number; provider_ref: string }>(
    `INSERT INTO payments (purpose, order_id, event_id, user_id, provider, provider_ref, amount_kzt, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, provider_ref`,
    [purpose, ref.orderId ?? null, ref.eventId, user.id, provider, providerRef, ref.amount, JSON.stringify({ token: opaqueToken() })],
  );
  return payment!;
}

/** Cancels (free) or refunds (paid) a completed order and invalidates its tickets (SRS 4.9). */
export async function refundOrCancelPaidOrder(actor: AuthUser, orderId: number, reason: string) {
  const res = await tx(async (db) => {
    const order = await one<{ id: number; code: string; event_id: number; user_id: number; status: string; total_kzt: number }>(
      "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
      [orderId],
      db,
    );
    if (!order) throw notFound("Order not found");
    const event = await getEvent(order.event_id, db);
    if (actor.role !== "platform_admin" && event.organizer_id !== actor.id) throw forbidden();
    if (order.status !== "paid") throw badRequest("Only completed orders can be cancelled or refunded", "order_not_paid");
    const checkedIn = await one("SELECT 1 FROM tickets WHERE order_id = $1 AND status = 'checked_in'", [orderId], db);
    if (checkedIn) throw badRequest("A ticket in this order was already used for entry", "already_checked_in");

    const isPaid = order.total_kzt > 0;
    const newStatus = isPaid ? "refunded" : "cancelled";
    await db.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, newStatus]);
    await db.query("UPDATE tickets SET status = $2 WHERE order_id = $1", [orderId, newStatus]);
    await db.query(
      `UPDATE ticket_types t SET sold = t.sold - c.n
         FROM (SELECT ticket_type_id, count(*)::int AS n FROM order_items WHERE order_id = $1 GROUP BY ticket_type_id) c
        WHERE t.id = c.ticket_type_id`,
      [orderId],
    );
    await db.query("DELETE FROM event_seats WHERE order_id = $1", [orderId]);
    await db.query("DELETE FROM free_ticket_claims WHERE order_id = $1", [orderId]);
    if (isPaid) {
      await db.query("INSERT INTO refunds (order_id, amount_kzt, reason, created_by) VALUES ($1, $2, $3, $4)", [orderId, order.total_kzt, reason, actor.id]);
    }
    await audit({ eventId: order.event_id, actorId: actor.id, action: isPaid ? "order.refunded" : "order.cancelled", entityType: "order", entityId: orderId, description: `Order ${order.code} ${newStatus}${isPaid ? ` (DEMO refund ${order.total_kzt} KZT)` : ""}: ${reason}` }, db);
    return { order, isPaid, title: event.title };
  });
  await notify(res.order.user_id, {
    kind: res.isPaid ? "refund_completed" : "registration_cancelled",
    title: res.isPaid ? `Refund completed: ${res.title}` : `Registration cancelled: ${res.title}`,
    body: res.isPaid
      ? `Order ${res.order.code} was refunded (DEMO, ${res.order.total_kzt} KZT). Its tickets are no longer valid.`
      : `Your free registration (order ${res.order.code}) was cancelled. Its ticket is no longer valid.`,
    link: `/orders/${orderId}`,
  });
}

export function assertOwnerOrStaff(user: AuthUser, ownerId: number) {
  if (user.id !== ownerId && user.role !== "platform_admin") throw forbidden();
}

export { HttpError };
