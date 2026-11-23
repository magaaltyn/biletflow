// Attendee checkout, orders, tickets (QR + PDF) and payments (DEMO simulation or Halyk ePay test).
import { Router } from "express";
import { z } from "zod";
import { one, q } from "../db/pool.js";
import { type AuthUser, me, requireAuth } from "../lib/auth.js";
import { ticketQrPayload } from "../lib/codes.js";
import { config } from "../lib/config.js";
import { calendarLinks, qrPng, ticketPdf } from "../lib/documents.js";
import { badRequest, forbidden, idParam, notFound, parse } from "../lib/http.js";
import { getEvent } from "../services/access.js";
import { halykPaymentObject, halykStatus } from "../services/halyk.js";
import { cancelPendingOrder, completePayment, createOrder, discountFor, findCampaign, releaseExpiredReservations, settingNumber, startPayment } from "../services/orders.js";

export const ordersRouter = Router();

const cartSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  items: z.array(z.object({ ticketTypeId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(0).max(50) })).default([]),
  seatIds: z.array(z.coerce.number().int().positive()).max(20).default([]),
  promoCode: z.string().trim().max(40).nullable().optional(),
  campaignToken: z.string().trim().max(60).nullable().optional(),
});

/** Price preview with the promo code applied, before anything is reserved. Public: no account needed. */
ordersRouter.post("/quote", async (req, res) => {
  const body = parse(cartSchema, req.body);
  const event = await getEvent(body.eventId);
  const types = await q<{ id: number; name: string; price_kzt: number; section_codes: string[] }>("SELECT id, name, price_kzt, section_codes FROM ticket_types WHERE event_id = $1 AND NOT hidden", [event.id]);
  const lines: { typeId: number; name: string; price: number }[] = [];
  if (event.seating === "assigned") {
    const seats = await q<{ section: string }>("SELECT vs.code AS section FROM seats s JOIN venue_sections vs ON vs.id = s.section_id WHERE s.id = ANY($1::bigint[]) AND s.venue_id = $2", [body.seatIds, event.venue_id]);
    for (const s of seats) {
      const t = types.find((x) => x.section_codes.includes(s.section));
      if (t) lines.push({ typeId: t.id, name: t.name, price: t.price_kzt });
    }
  } else {
    for (const it of body.items) {
      const t = types.find((x) => x.id === it.ticketTypeId);
      if (t) for (let i = 0; i < it.quantity; i++) lines.push({ typeId: t.id, name: t.name, price: t.price_kzt });
    }
  }
  let campaign: Awaited<ReturnType<typeof findCampaign>> | undefined;
  let promoError: string | null = null;
  if (body.promoCode || body.campaignToken) {
    try {
      campaign = await findCampaign(event.id, { code: body.promoCode, token: body.campaignToken });
    } catch (err) {
      promoError = (err as Error).message;
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  const discount = lines.reduce((s, l) => s + discountFor(campaign, l.typeId, l.price), 0);
  if (campaign && discount === 0 && lines.length) promoError = "This promo code does not apply to the selected tickets";
  const fee = Math.round(((subtotal - discount) * (await settingNumber("processing_fee_percent"))) / 100);
  res.json({ count: lines.length, subtotal, discount, fee, total: subtotal - discount + fee, promo: campaign && !promoError ? { code: campaign.code } : null, promoError });
});

// Everything below needs a signed-in user; the price preview above is public so visitors see totals.
ordersRouter.use(requireAuth);

ordersRouter.post("/", async (req, res) => {
  const body = parse(
    cartSchema.extend({ attendeeName: z.string().trim().min(2).max(100), attendeeEmail: z.string().trim().email() }),
    req.body,
  );
  const orderId = await createOrder(me(req), body);
  res.status(201).json(await orderDetail(me(req), orderId));
});

ordersRouter.get("/", async (req, res) => {
  await releaseExpiredReservations();
  const rows = await q(
    `SELECT o.id, o.code, o.status, o.total_kzt, o.created_at, o.reserved_until,
            e.id AS event_id, e.title, e.slug, e.starts_at, e.ends_at, e.image_url, e.status AS event_status, v.name AS venue_name,
            (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS ticket_count
       FROM orders o JOIN events e ON e.id = o.event_id JOIN venues v ON v.id = e.venue_id
      WHERE o.user_id = $1 ORDER BY e.starts_at DESC`,
    [me(req).id],
  );
  res.json(rows);
});

async function orderDetail(user: AuthUser, orderId: number) {
  const order = await one(
    `SELECT o.*, e.title, e.slug, e.starts_at, e.ends_at, e.image_url, e.status AS event_status, e.refund_policy, e.organizer_id,
            v.name AS venue_name, v.address AS venue_address, v.timezone, e.updated_at, e.description, c.code AS promo_code
       FROM orders o JOIN events e ON e.id = o.event_id JOIN venues v ON v.id = e.venue_id
       LEFT JOIN campaigns c ON c.id = o.campaign_id
      WHERE o.id = $1`,
    [orderId],
  );
  if (!order) throw notFound("Order not found");
  if (order.user_id !== user.id && order.organizer_id !== user.id && user.role !== "platform_admin") throw forbidden();
  const tickets = await q(
    `SELECT t.id, t.code, t.status, t.attendee_name, t.section_code, t.row_label, t.seat_number, tt.name AS ticket_type
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id WHERE t.order_id = $1 ORDER BY t.id`,
    [orderId],
  );
  const items = await q(
    `SELECT i.id, tt.name AS ticket_type, i.unit_price_kzt, i.discount_kzt, i.section_code, i.row_label, i.seat_number
       FROM order_items i JOIN ticket_types tt ON tt.id = i.ticket_type_id WHERE i.order_id = $1 ORDER BY i.id`,
    [orderId],
  );
  const payments = await q("SELECT id, provider, amount_kzt, status, is_demo, created_at FROM payments WHERE order_id = $1 ORDER BY id DESC", [orderId]);
  const calendar = calendarLinks({ id: order.event_id, slug: order.slug, title: order.title, description: order.description, startsAt: order.starts_at, endsAt: order.ends_at, timezone: order.timezone, venueName: order.venue_name, venueAddress: order.venue_address, updatedAt: order.updated_at, cancelled: order.event_status === "cancelled" });
  const { description: _d, updated_at: _u, ...rest } = order;
  return { ...rest, tickets: tickets.map((t) => ({ ...t, qrPayload: t.status === "valid" || t.status === "checked_in" ? ticketQrPayload(t.code) : null })), items, payments, calendar };
}

ordersRouter.get("/:id", async (req, res) => {
  await releaseExpiredReservations();
  res.json(await orderDetail(me(req), idParam(req)));
});

ordersRouter.post("/:id/cancel", async (req, res) => {
  await cancelPendingOrder(me(req), idParam(req));
  res.json(await orderDetail(me(req), idParam(req)));
});

ordersRouter.post("/:id/pay", async (req, res) => {
  const { provider } = parse(z.object({ provider: z.enum(["demo", "halyk"]).default("demo") }), req.body);
  await releaseExpiredReservations();
  const order = await one("SELECT o.*, e.title FROM orders o JOIN events e ON e.id = o.event_id WHERE o.id = $1", [idParam(req)]);
  if (!order) throw notFound("Order not found");
  if (order.user_id !== me(req).id) throw forbidden();
  if (order.status !== "pending") throw badRequest("This order is no longer waiting for payment", "order_not_pending");
  const payment = await startPayment(me(req), "ticket_order", { orderId: order.id, eventId: order.event_id, amount: order.total_kzt }, provider);
  if (provider === "halyk") {
    const paymentObject = await halykPaymentObject({ invoiceId: payment.provider_ref, amount: order.total_kzt, description: `BiletFlow: ${order.title}`, email: order.attendee_email, accountId: String(order.user_id), backPath: `/orders/${order.id}`, paymentId: payment.id });
    res.json({ paymentId: payment.id, provider, paymentObject, script: config.halyk.payformScript });
    return;
  }
  res.json({ paymentId: payment.id, provider });
});

// ---------- Tickets ----------
export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

async function ticketsForDocs(where: string, id: number, user: AuthUser) {
  const rows = await q(
    `SELECT t.*, tt.name AS ticket_type, e.title, e.starts_at, e.organizer_id, v.name AS venue_name, v.address, v.timezone
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN events e ON e.id = t.event_id JOIN venues v ON v.id = e.venue_id
      WHERE ${where} = $1 ORDER BY t.id`,
    [id],
  );
  if (!rows.length) throw notFound("Ticket not found");
  const r0 = rows[0];
  if (r0.user_id !== user.id && r0.organizer_id !== user.id && user.role !== "platform_admin") throw forbidden();
  return rows;
}

/** All tickets of the signed-in user, newest event first (mobile "My tickets"). QR payload only for usable tickets. */
ticketsRouter.get("/", async (req, res) => {
  const rows = await q(
    `SELECT t.id, t.code, t.status, t.attendee_name, t.checked_in_at, t.section_code, t.row_label, t.seat_number, t.order_id,
            tt.name AS ticket_type, o.code AS order_code, e.id AS event_id, e.slug, e.title, e.starts_at, e.ends_at, e.image_url,
            e.status AS event_status, v.name AS venue_name, v.city, v.timezone
       FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN orders o ON o.id = t.order_id
       JOIN events e ON e.id = t.event_id JOIN venues v ON v.id = e.venue_id
      WHERE t.user_id = $1 ORDER BY e.starts_at DESC, t.id`,
    [me(req).id],
  );
  res.json(rows.map((t) => ({ ...t, qrPayload: t.status === "valid" || t.status === "checked_in" ? ticketQrPayload(t.code) : null })));
});

const toDoc = (t: Record<string, any>) => ({
  code: t.code, qrPayload: ticketQrPayload(t.code), eventTitle: t.title, startsAt: t.starts_at, timezone: t.timezone,
  venueName: t.venue_name, venueAddress: t.address, ticketType: t.ticket_type, attendeeName: t.attendee_name,
  section: t.section_code, row: t.row_label, seat: t.seat_number, status: t.status,
});

ticketsRouter.get("/:id/qr.png", async (req, res) => {
  const [t] = await ticketsForDocs("t.id", idParam(req), me(req));
  if (t.status !== "valid" && t.status !== "checked_in") throw badRequest("This ticket is no longer valid", "ticket_invalid");
  res.type("png").send(await qrPng(ticketQrPayload(t.code)));
});

ticketsRouter.get("/:id/pdf", async (req, res) => {
  const tickets = await ticketsForDocs("t.id", idParam(req), me(req));
  res.type("pdf").setHeader("Content-Disposition", `inline; filename="${tickets[0].code}.pdf"`);
  res.send(await ticketPdf(tickets.map(toDoc)));
});

ticketsRouter.get("/order/:id/pdf", async (req, res) => {
  const tickets = await ticketsForDocs("t.order_id", idParam(req), me(req));
  res.type("pdf").setHeader("Content-Disposition", `inline; filename="biletflow-order-${req.params.id}.pdf"`);
  res.send(await ticketPdf(tickets.map(toDoc)));
});

// ---------- Payments ----------
export const paymentsRouter = Router();

/** Halyk server-to-server notification (postLink). The body is not trusted: status is re-checked with Halyk. */
paymentsRouter.post("/halyk/callback", async (req, res) => {
  const invoiceId = String(req.body?.invoiceId ?? "");
  const payment = await one<{ id: number; status: string }>("SELECT id, status FROM payments WHERE provider = 'halyk' AND provider_ref = $1", [invoiceId]);
  if (payment?.status === "pending") {
    const status = await halykStatus(invoiceId);
    if (status !== "pending") await completePayment(payment.id, status === "succeeded", { via: "callback" }).catch(() => undefined);
  }
  res.json({ ok: true });
});

paymentsRouter.use(requireAuth);

async function ownPayment(user: AuthUser, id: number) {
  const p = await one(
    `SELECT p.*, e.title, o.code AS order_code, o.reserved_until, o.status AS order_status
       FROM payments p JOIN events e ON e.id = p.event_id LEFT JOIN orders o ON o.id = p.order_id WHERE p.id = $1`,
    [id],
  );
  if (!p) throw notFound("Payment not found");
  if (p.user_id !== user.id) throw forbidden();
  return p;
}

paymentsRouter.get("/:id", async (req, res) => {
  const p = await ownPayment(me(req), idParam(req));
  const { details: _d, ...rest } = p;
  res.json(rest);
});

/** DEMO payment page: the attendee chooses whether the simulated payment succeeds or fails. No real money moves. */
paymentsRouter.post("/:id/demo", async (req, res) => {
  const { success } = parse(z.object({ success: z.boolean() }), req.body);
  const p = await ownPayment(me(req), idParam(req));
  if (p.provider !== "demo") throw badRequest("Not a demo payment");
  await completePayment(p.id, success, { method: req.body?.method ?? "demo_card" });
  res.json(await ownPayment(me(req), p.id));
});

/** Called when the attendee returns from the Halyk payment page. */
paymentsRouter.post("/:id/halyk-verify", async (req, res) => {
  const p = await ownPayment(me(req), idParam(req));
  if (p.provider !== "halyk") throw badRequest("Not a Halyk payment");
  if (p.status === "pending") {
    const status = await halykStatus(p.provider_ref);
    if (status !== "pending") await completePayment(p.id, status === "succeeded", { via: "return" });
  }
  res.json(await ownPayment(me(req), p.id));
});
