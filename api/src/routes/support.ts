// Support cases with an asynchronous chat-like thread (SRS 4.13) and in-app notifications (SRS 4.10).
import { Router } from "express";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { type AuthUser, me, requireAuth } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { caseCode } from "../lib/codes.js";
import { badRequest, forbidden, idParam, notFound, parse } from "../lib/http.js";
import { notify } from "../lib/notify.js";

export const supportRouter = Router();
supportRouter.use(requireAuth);

const CATEGORIES = ["ticket_delivery", "payment", "refund", "seating", "event_info", "check_in", "account", "activation", "technical"] as const;
const STATUSES = ["open", "in_progress", "waiting_for_customer", "resolved"] as const;

interface CaseRow {
  id: number;
  code: string;
  kind: "attendee" | "organizer";
  requester_id: number;
  event_id: number | null;
  order_id: number | null;
  ticket_id: number | null;
  status: string;
  assignee_id: number | null;
  subject: string;
  organizer_id: number | null;
}

/**
 * Who can see a case: the requester; for attendee cases the event's organizer (organizer support staff);
 * platform admins for organizer cases and escalated attendee cases.
 */
async function loadCase(user: AuthUser, id: number) {
  const c = await one<CaseRow & { escalated: boolean }>("SELECT c.*, e.organizer_id FROM support_cases c LEFT JOIN events e ON e.id = c.event_id WHERE c.id = $1", [id]);
  if (!c) throw notFound("Support case not found");
  const isRequester = c.requester_id === user.id;
  const isOrganizerStaff = c.kind === "attendee" && c.organizer_id === user.id;
  const isAdmin = user.role === "platform_admin";
  if (!isRequester && !isOrganizerStaff && !isAdmin) throw forbidden();
  return { c, isStaff: isOrganizerStaff || isAdmin };
}

supportRouter.get("/", async (req, res) => {
  const user = me(req);
  const view = req.query.view === "inbox" ? "inbox" : "mine";
  const rows =
    view === "mine"
      ? await q(
          `SELECT c.*, e.title AS event_title FROM support_cases c LEFT JOIN events e ON e.id = c.event_id
            WHERE c.requester_id = $1 ORDER BY c.updated_at DESC`,
          [user.id],
        )
      : await q(
          `SELECT c.*, e.title AS event_title, u.full_name AS requester_name FROM support_cases c
             LEFT JOIN events e ON e.id = c.event_id JOIN users u ON u.id = c.requester_id
            WHERE (c.kind = 'attendee' AND e.organizer_id = $1)
               OR ($2 AND (c.kind = 'organizer' OR c.escalated))
            ORDER BY (c.status = 'resolved'), c.updated_at DESC`,
          [user.id, user.role === "platform_admin"],
        );
  res.json(rows);
});

supportRouter.post("/", async (req, res) => {
  const user = me(req);
  const b = parse(
    z.object({
      category: z.enum(CATEGORIES),
      subject: z.string().trim().min(3).max(150),
      message: z.string().trim().min(3).max(5000),
      eventId: z.coerce.number().int().optional(),
      orderId: z.coerce.number().int().optional(),
      ticketId: z.coerce.number().int().optional(),
    }),
    req.body,
  );
  // Attach event/order/ticket context automatically and only if it belongs to the requester (SRS 4.13).
  let eventId = b.eventId ?? null;
  let orderId = b.orderId ?? null;
  const ticketId = b.ticketId ?? null;
  if (ticketId) {
    const t = await one("SELECT order_id, event_id, user_id FROM tickets WHERE id = $1", [ticketId]);
    if (!t || t.user_id !== user.id) throw forbidden();
    orderId = t.order_id;
    eventId = t.event_id;
  }
  if (orderId) {
    const o = await one("SELECT event_id, user_id FROM orders WHERE id = $1", [orderId]);
    if (!o || o.user_id !== user.id) throw forbidden();
    eventId = o.event_id;
  }
  // Organizer cases go to platform admins; attendee cases go to the event organizer.
  let kind: "attendee" | "organizer" = "organizer";
  if (eventId) {
    const e = await one("SELECT organizer_id FROM events WHERE id = $1", [eventId]);
    if (!e) throw badRequest("Unknown event");
    kind = e.organizer_id === user.id ? "organizer" : "attendee";
  } else if (user.role === "attendee") {
    kind = "organizer"; // general account question without an event: handled by platform support
  }
  const created = await tx(async (db) => {
    const c = await one<{ id: number; code: string }>(
      `INSERT INTO support_cases (code, kind, requester_id, category, subject, event_id, order_id, ticket_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, code`,
      [caseCode(), kind, user.id, b.category, b.subject, eventId, orderId, ticketId],
      db,
    );
    await db.query("INSERT INTO support_messages (case_id, author_id, body) VALUES ($1, $2, $3)", [c!.id, user.id, b.message]);
    if (eventId) await audit({ eventId, actorId: user.id, action: "support.opened", entityType: "support_case", entityId: c!.id, description: `Support case ${c!.code} opened: ${b.subject}` }, db);
    return c!;
  });
  // Notify whoever handles it.
  if (kind === "attendee" && eventId) {
    const e = await one("SELECT organizer_id, title FROM events WHERE id = $1", [eventId]);
    await notify(e.organizer_id, { kind: "support_new", title: `New support case ${created.code}: ${e.title}`, body: b.subject, link: `/support/${created.id}` });
  } else {
    const admins = await q<{ id: number }>("SELECT id FROM users WHERE role = 'platform_admin'");
    for (const a of admins) await notify(a.id, { kind: "support_new", title: `New organizer support case ${created.code}`, body: b.subject, link: `/support/${created.id}`, email: false });
  }
  res.status(201).json(created);
});

supportRouter.get("/:id", async (req, res) => {
  const { c, isStaff } = await loadCase(me(req), idParam(req));
  const messages = await q(
    `SELECT m.id, m.body, m.created_at, m.author_id, u.full_name AS author_name, u.role AS author_role
       FROM support_messages m JOIN users u ON u.id = m.author_id WHERE m.case_id = $1 ORDER BY m.created_at`,
    [c.id],
  );
  const context = {
    event: c.event_id ? await one("SELECT id, title, slug, starts_at FROM events WHERE id = $1", [c.event_id]) : null,
    order: c.order_id ? await one("SELECT id, code, status, total_kzt FROM orders WHERE id = $1", [c.order_id]) : null,
    ticket: c.ticket_id ? await one("SELECT id, code, status FROM tickets WHERE id = $1", [c.ticket_id]) : null,
    requester: await one("SELECT id, full_name, email FROM users WHERE id = $1", [c.requester_id]),
    assignee: c.assignee_id ? await one("SELECT id, full_name FROM users WHERE id = $1", [c.assignee_id]) : null,
  };
  const { organizer_id: _o, ...caseData } = c;
  res.json({ ...caseData, messages, context, canManage: isStaff });
});

supportRouter.post("/:id/messages", async (req, res) => {
  const user = me(req);
  const { c, isStaff } = await loadCase(user, idParam(req));
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body);
  await q("INSERT INTO support_messages (case_id, author_id, body) VALUES ($1, $2, $3)", [c.id, user.id, body]);
  // A staff reply waits for the customer; a customer reply reopens the case.
  const status = isStaff && user.id !== c.requester_id ? "waiting_for_customer" : c.status === "resolved" || c.status === "waiting_for_customer" ? "open" : c.status;
  await q("UPDATE support_cases SET status = $2, updated_at = now() WHERE id = $1", [c.id, status]);
  const recipients = new Set<number>();
  if (user.id !== c.requester_id) recipients.add(c.requester_id);
  else if (c.assignee_id) recipients.add(c.assignee_id);
  else if (c.kind === "attendee" && c.organizer_id) recipients.add(c.organizer_id);
  for (const r of recipients) await notify(r, { kind: "support_reply", title: `New reply in support case ${c.code}`, body: body.slice(0, 200), link: `/support/${c.id}` });
  res.status(201).json({ ok: true });
});

supportRouter.patch("/:id", async (req, res) => {
  const user = me(req);
  const { c, isStaff } = await loadCase(user, idParam(req));
  const b = parse(z.object({ status: z.enum(STATUSES).optional(), assignToMe: z.boolean().optional(), escalate: z.boolean().optional() }), req.body);
  // The requester may mark their own case resolved; everything else is for support staff.
  if (!isStaff && !(b.status === "resolved" && c.requester_id === user.id && !b.assignToMe && !b.escalate)) throw forbidden();
  await q(
    `UPDATE support_cases SET status = COALESCE($2, status), assignee_id = CASE WHEN $3 THEN $4 ELSE assignee_id END,
            escalated = escalated OR COALESCE($5, false), updated_at = now() WHERE id = $1`,
    [c.id, b.status ?? null, Boolean(b.assignToMe), user.id, b.escalate ?? null],
  );
  if (c.event_id) {
    const what = [b.status && `status → ${b.status}`, b.assignToMe && `assigned to ${user.full_name}`, b.escalate && "escalated to platform admins"].filter(Boolean).join(", ");
    await audit({ eventId: c.event_id, actorId: user.id, action: "support.status_changed", entityType: "support_case", entityId: c.id, description: `Support case ${c.code}: ${what}` });
  }
  if (b.status && c.requester_id !== user.id) {
    await notify(c.requester_id, { kind: "support_status", title: `Support case ${c.code} is now "${b.status.replace(/_/g, " ")}"`, link: `/support/${c.id}` });
  }
  res.json({ ok: true });
});

// ---------- Notifications ----------
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const items = await q("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [me(req).id]);
  const unread = await one<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [me(req).id]);
  res.json({ items, unread: unread?.n ?? 0 });
});

notificationsRouter.post("/read-all", async (req, res) => {
  await q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [me(req).id]);
  res.json({ ok: true });
});
