// Ticket verification and check-in for Event Admins (SRS 4.8). Used by the website and the mobile app.
import { Router } from "express";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { me, requireAuth } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { verifyTicketQr } from "../lib/codes.js";
import { forbidden, idParam, notFound, parse } from "../lib/http.js";
import { getCheckInEvent } from "../services/access.js";

export const checkinRouter = Router();
checkinRouter.use(requireAuth);

/** Events the signed-in user may check people in for. */
checkinRouter.get("/events", async (req, res) => {
  const user = me(req);
  res.json(
    await q(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, e.status, v.name AS venue_name,
              (SELECT count(*)::int FROM tickets t WHERE t.event_id = e.id AND t.status IN ('valid','checked_in')) AS registered,
              (SELECT count(*)::int FROM tickets t WHERE t.event_id = e.id AND t.status = 'checked_in') AS checked_in
         FROM events e JOIN venues v ON v.id = e.venue_id
        WHERE e.status = 'published' AND e.ends_at > now() - interval '1 day'
          AND ($2 OR e.organizer_id = $1 OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.event_id = e.id AND s.user_id = $1))
        ORDER BY e.starts_at`,
      [user.id, user.role === "platform_admin"],
    ),
  );
});

async function stats(eventId: number) {
  return one(
    `SELECT count(*) FILTER (WHERE status IN ('valid','checked_in'))::int AS registered,
            count(*) FILTER (WHERE status = 'checked_in')::int AS checked_in
       FROM tickets WHERE event_id = $1`,
    [eventId],
  );
}

checkinRouter.get("/:eventId/stats", async (req, res) => {
  const { event } = await getCheckInEvent(me(req), idParam(req, "eventId"));
  res.json(await stats(event.id));
});

const ticketInfo = `t.id, t.code, t.status, t.attendee_name, t.checked_in_at, t.section_code, t.row_label, t.seat_number, t.event_id, tt.name AS ticket_type`;

/**
 * Scans a QR code and, if it is a valid ticket for this event, records the check-in.
 * Result: valid | already_used | cancelled | refunded | wrong_event | campaign_qr | invalid.
 */
checkinRouter.post("/:eventId/scan", async (req, res) => {
  const user = me(req);
  const { event } = await getCheckInEvent(user, idParam(req, "eventId"));
  const { qr } = parse(z.object({ qr: z.string().min(1).max(500) }), req.body);
  const check = verifyTicketQr(qr);
  if (!check.ok) {
    res.json({
      result: check.reason,
      message: check.reason === "campaign_qr" ? "This is a promotional QR code, not a ticket. Entry not allowed." : "Invalid QR code. This is not a BiletFlow ticket.",
      stats: await stats(event.id),
    });
    return;
  }
  const outcome = await tx(async (db) => {
    const t = await one(`SELECT ${ticketInfo} FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id WHERE t.code = $1 FOR UPDATE OF t`, [check.code], db);
    if (!t) return { result: "invalid", message: "Ticket not found." };
    if (t.event_id !== event.id) return { result: "wrong_event", message: "This ticket is for a different event.", ticket: t };
    if (t.status === "cancelled") return { result: "cancelled", message: "This ticket was cancelled.", ticket: t };
    if (t.status === "refunded") return { result: "refunded", message: "This ticket was refunded.", ticket: t };
    if (t.status === "checked_in") return { result: "already_used", message: `Already checked in at ${new Date(t.checked_in_at).toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty" })}.`, ticket: t };
    await db.query("UPDATE tickets SET status = 'checked_in', checked_in_at = now() WHERE id = $1", [t.id]);
    await db.query("INSERT INTO check_ins (ticket_id, event_id, staff_id, action) VALUES ($1, $2, $3, 'check_in')", [t.id, event.id, user.id]);
    await audit({ eventId: event.id, actorId: user.id, action: "checkin.recorded", entityType: "ticket", entityId: t.id, description: `${t.attendee_name} checked in (${t.code})` }, db);
    return { result: "valid", message: "Valid ticket. Checked in.", ticket: { ...t, status: "checked_in" } };
  });
  res.json({ ...outcome, stats: await stats(event.id) });
});

checkinRouter.get("/:eventId/search", async (req, res) => {
  const { event } = await getCheckInEvent(me(req), idParam(req, "eventId"));
  const term = `%${String(req.query.q ?? "").trim()}%`;
  res.json(
    await q(
      `SELECT ${ticketInfo}, o.attendee_email FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id JOIN orders o ON o.id = t.order_id
        WHERE t.event_id = $1 AND (t.attendee_name ILIKE $2 OR t.code ILIKE $2 OR o.attendee_email ILIKE $2)
        ORDER BY t.attendee_name LIMIT 50`,
      [event.id, term],
    ),
  );
});

/** Manual check-in from attendee search. */
checkinRouter.post("/:eventId/tickets/:ticketId", async (req, res) => {
  const user = me(req);
  const { event } = await getCheckInEvent(user, idParam(req, "eventId"));
  const result = await tx(async (db) => {
    const t = await one(`SELECT ${ticketInfo} FROM tickets t JOIN ticket_types tt ON tt.id = t.ticket_type_id WHERE t.id = $1 AND t.event_id = $2 FOR UPDATE OF t`, [idParam(req, "ticketId"), event.id], db);
    if (!t) throw notFound("Ticket not found");
    if (t.status !== "valid") return { result: t.status === "checked_in" ? "already_used" : t.status, ticket: t };
    await db.query("UPDATE tickets SET status = 'checked_in', checked_in_at = now() WHERE id = $1", [t.id]);
    await db.query("INSERT INTO check_ins (ticket_id, event_id, staff_id, action) VALUES ($1, $2, $3, 'check_in')", [t.id, event.id, user.id]);
    await audit({ eventId: event.id, actorId: user.id, action: "checkin.recorded", entityType: "ticket", entityId: t.id, description: `${t.attendee_name} checked in manually (${t.code})` }, db);
    return { result: "valid", ticket: { ...t, status: "checked_in" } };
  });
  res.json({ ...result, stats: await stats(event.id) });
});

/** Undo an accidental check-in (only for staff allowed to undo). */
checkinRouter.post("/:eventId/tickets/:ticketId/undo", async (req, res) => {
  const user = me(req);
  const { event, canUndo } = await getCheckInEvent(user, idParam(req, "eventId"));
  if (!canUndo) throw forbidden("You are not allowed to undo check-ins");
  await tx(async (db) => {
    const t = await one("SELECT id, code, attendee_name, status FROM tickets WHERE id = $1 AND event_id = $2 FOR UPDATE", [idParam(req, "ticketId"), event.id], db);
    if (!t) throw notFound("Ticket not found");
    if (t.status !== "checked_in") return;
    await db.query("UPDATE tickets SET status = 'valid', checked_in_at = NULL WHERE id = $1", [t.id]);
    await db.query("INSERT INTO check_ins (ticket_id, event_id, staff_id, action) VALUES ($1, $2, $3, 'undo')", [t.id, event.id, user.id]);
    await audit({ eventId: event.id, actorId: user.id, action: "checkin.reversed", entityType: "ticket", entityId: t.id, description: `Check-in reversed for ${t.attendee_name} (${t.code})` }, db);
  });
  res.json({ ok: true, stats: await stats(event.id) });
});
