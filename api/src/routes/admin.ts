// Platform administration (SRS 4.5, 4.12): search, suspensions, reports, activations, settings, exports.
import { Router } from "express";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { me, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, idParam, notFound, parse } from "../lib/http.js";
import { notify } from "../lib/notify.js";

export const adminRouter = Router();
adminRouter.use(requireRole("platform_admin"));

adminRouter.get("/overview", async (_req, res) => {
  res.json(
    await one(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM events WHERE status = 'published') AS published_events,
      (SELECT count(*)::int FROM tickets WHERE status IN ('valid','checked_in')) AS active_tickets,
      (SELECT COALESCE(sum(total_kzt), 0)::int FROM orders WHERE status = 'paid') AS demo_gross_kzt,
      (SELECT count(*)::int FROM refunds) AS refunds,
      (SELECT count(*)::int FROM payments WHERE status = 'failed') AS failed_payments,
      (SELECT count(*)::int FROM event_reports WHERE resolved_at IS NULL) AS open_reports,
      (SELECT count(*)::int FROM support_cases WHERE (kind = 'organizer' OR escalated) AND status <> 'resolved') AS open_cases`),
  );
});

adminRouter.get("/search", async (req, res) => {
  const term = `%${String(req.query.q ?? "").trim()}%`;
  const [users, events, orders, payments] = await Promise.all([
    q("SELECT id, email, full_name, role, suspended_at, created_at FROM users WHERE email ILIKE $1 OR full_name ILIKE $1 ORDER BY id DESC LIMIT 25", [term]),
    q("SELECT e.id, e.title, e.slug, e.status, e.paid_sales_status, e.suspended_at, e.starts_at, p.display_name AS organizer FROM events e JOIN organizer_profiles p ON p.user_id = e.organizer_id WHERE e.title ILIKE $1 OR e.slug ILIKE $1 ORDER BY e.id DESC LIMIT 25", [term]),
    q("SELECT o.id, o.code, o.status, o.total_kzt, o.attendee_email, o.created_at, e.title FROM orders o JOIN events e ON e.id = o.event_id WHERE o.code ILIKE $1 OR o.attendee_email ILIKE $1 ORDER BY o.id DESC LIMIT 25", [term]),
    q("SELECT p.id, p.purpose, p.provider, p.provider_ref, p.amount_kzt, p.status, p.created_at, e.title FROM payments p JOIN events e ON e.id = p.event_id WHERE p.provider_ref ILIKE $1 OR e.title ILIKE $1 ORDER BY p.id DESC LIMIT 25", [term]),
  ]);
  res.json({ users, events, orders, payments });
});

adminRouter.post("/users/:id/suspend", async (req, res) => {
  const { suspended } = parse(z.object({ suspended: z.boolean() }), req.body);
  const id = idParam(req);
  if (id === me(req).id) throw badRequest("You cannot suspend yourself");
  await q("UPDATE users SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1", [id, suspended]);
  await audit({ actorId: me(req).id, action: suspended ? "user.suspended" : "user.unsuspended", entityType: "user", entityId: id, description: `User #${id} ${suspended ? "suspended" : "unsuspended"}` });
  res.json({ ok: true });
});

/**
 * Organizer role is granted only by a platform admin (there is no self-service organizer sign-up).
 * role "organizer" creates the organizer profile; role "attendee" is allowed only while the account owns no events.
 */
adminRouter.post("/users/:id/role", async (req, res) => {
  const b = parse(z.object({ role: z.enum(["organizer", "attendee"]), displayName: z.string().trim().min(2).max(100).optional() }), req.body);
  const user = await one<{ id: number; email: string; full_name: string; role: string }>("SELECT id, email, full_name, role FROM users WHERE id = $1", [idParam(req)]);
  if (!user) throw notFound("User not found");
  if (user.role === "platform_admin") throw badRequest("Platform admin roles cannot be changed here");
  if (user.role === b.role) {
    res.json({ ok: true, role: user.role });
    return;
  }
  if (b.role === "attendee") {
    const owns = await one("SELECT 1 FROM events WHERE organizer_id = $1 LIMIT 1", [user.id]);
    if (owns) throw badRequest("This organizer still has events. Cancel or reassign them first.", "has_events");
  }
  await tx(async (db) => {
    await db.query("UPDATE users SET role = $2 WHERE id = $1", [user.id, b.role]);
    if (b.role === "organizer") {
      await db.query(
        `INSERT INTO organizer_profiles (user_id, display_name, contact_email) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE($4, organizer_profiles.display_name)`,
        [user.id, b.displayName ?? user.full_name, user.email, b.displayName ?? null],
      );
    }
    await audit({ actorId: me(req).id, action: b.role === "organizer" ? "user.made_organizer" : "user.organizer_removed", entityType: "user", entityId: user.id, description: `${user.email} ${b.role === "organizer" ? "made an organizer" : "changed back to attendee"} by platform admin` }, db);
  });
  await notify(user.id, {
    kind: "role_changed",
    title: b.role === "organizer" ? "You can now organize events on BiletFlow" : "Your organizer access was removed",
    body: b.role === "organizer" ? "Open the organizer dashboard from your account menu to create your first event." : "Contact support if you think this is a mistake.",
    link: b.role === "organizer" ? "/organizer" : "/support/new",
  });
  res.json({ ok: true, role: b.role });
});

/** Suspending an event stops all further sales immediately (SRS 4.5, success criteria). */
adminRouter.post("/events/:id/suspend", async (req, res) => {
  const b = parse(z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).default("Policy review") }), req.body);
  const e = await one("SELECT id, title, organizer_id FROM events WHERE id = $1", [idParam(req)]);
  if (!e) throw notFound("Event not found");
  await q("UPDATE events SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END, updated_at = now() WHERE id = $1", [e.id, b.suspended]);
  await audit({ eventId: e.id, actorId: me(req).id, action: b.suspended ? "event.suspended" : "event.unsuspended", entityType: "event", entityId: e.id, description: `Event ${b.suspended ? "suspended" : "unsuspended"} by platform admin: ${b.reason}` });
  await notify(e.organizer_id, { kind: "event_suspended", title: `${b.suspended ? "Suspended" : "Unsuspended"}: ${e.title}`, body: b.reason, link: `/organizer/events/${e.id}` });
  res.json({ ok: true });
});

adminRouter.post("/events/:id/paid-sales", async (req, res) => {
  const b = parse(z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).default("Suspected fraud or policy violation") }), req.body);
  const e = await one("SELECT id, title, organizer_id, paid_sales_status FROM events WHERE id = $1", [idParam(req)]);
  if (!e) throw notFound("Event not found");
  const act = await one("SELECT activated_at FROM event_activations WHERE event_id = $1", [e.id]);
  const status = b.suspended ? "suspended" : act?.activated_at ? "active" : "inactive";
  await q("UPDATE events SET paid_sales_status = $2, updated_at = now() WHERE id = $1", [e.id, status]);
  await audit({ eventId: e.id, actorId: me(req).id, action: b.suspended ? "activation.suspended" : "activation.restored", entityType: "event", entityId: e.id, description: `Paid sales ${status}: ${b.reason}` });
  await notify(e.organizer_id, { kind: "paid_sales", title: `Paid sales ${status}: ${e.title}`, body: b.reason, link: `/organizer/events/${e.id}` });
  res.json({ ok: true });
});

adminRouter.get("/activations", async (_req, res) => {
  res.json(
    await q(
      `SELECT a.*, e.title, e.paid_sales_status, p.display_name AS organizer, p.identity_status,
              (SELECT bank_name || ' ••' || iban_last4 FROM payout_accounts pa WHERE pa.organizer_id = e.organizer_id) AS payout
         FROM event_activations a JOIN events e ON e.id = a.event_id JOIN organizer_profiles p ON p.user_id = e.organizer_id
        ORDER BY a.event_id DESC`,
    ),
  );
});

adminRouter.get("/reports", async (_req, res) => {
  res.json(
    await q(
      `SELECT r.*, e.title, e.suspended_at, u.email AS reporter FROM event_reports r JOIN events e ON e.id = r.event_id JOIN users u ON u.id = r.reporter_id
        ORDER BY r.resolved_at NULLS FIRST, r.created_at DESC`,
    ),
  );
});

adminRouter.post("/reports/:id/resolve", async (req, res) => {
  await q("UPDATE event_reports SET resolved_at = now() WHERE id = $1", [idParam(req)]);
  res.json({ ok: true });
});

adminRouter.get("/monitoring", async (_req, res) => {
  const [refunds, failedPayments, promoActivity] = await Promise.all([
    q("SELECT r.*, o.code, e.title FROM refunds r JOIN orders o ON o.id = r.order_id JOIN events e ON e.id = o.event_id ORDER BY r.created_at DESC LIMIT 50"),
    q("SELECT p.id, p.purpose, p.provider, p.amount_kzt, p.created_at, e.title FROM payments p JOIN events e ON e.id = p.event_id WHERE p.status = 'failed' ORDER BY p.created_at DESC LIMIT 50"),
    q("SELECT c.code, c.name, c.redemptions, c.max_redemptions, c.active, e.title FROM campaigns c JOIN events e ON e.id = c.event_id ORDER BY c.redemptions DESC LIMIT 50"),
  ]);
  res.json({ refunds, failedPayments, promoActivity });
});

adminRouter.get("/settings", async (_req, res) => {
  res.json(Object.fromEntries((await q<{ key: string; value: string }>("SELECT key, value FROM platform_settings")).map((r) => [r.key, r.value])));
});

adminRouter.put("/settings", async (req, res) => {
  const b = parse(z.object({ activation_fee_kzt: z.coerce.number().int().min(0).max(10_000_000), processing_fee_percent: z.coerce.number().min(0).max(20) }), req.body);
  for (const [key, value] of Object.entries(b)) await q("UPDATE platform_settings SET value = $2 WHERE key = $1", [key, String(value)]);
  await audit({ actorId: me(req).id, action: "settings.updated", entityType: "settings", description: `Activation fee ${b.activation_fee_kzt} KZT, processing ${b.processing_fee_percent}%` });
  res.json({ ok: true });
});

/** Basic operational report as CSV. */
adminRouter.get("/export/:kind.csv", async (req, res) => {
  const queries: Record<string, string> = {
    orders: "SELECT o.code, e.title AS event, o.status, o.subtotal_kzt, o.discount_kzt, o.fee_kzt, o.total_kzt, o.attendee_email, o.created_at FROM orders o JOIN events e ON e.id = o.event_id ORDER BY o.id",
    events: "SELECT e.id, e.title, e.status, e.paid_sales_status, e.starts_at, (SELECT sum(sold) FROM ticket_types t WHERE t.event_id = e.id) AS sold FROM events e ORDER BY e.id",
    payments: "SELECT p.provider_ref, p.purpose, p.provider, p.amount_kzt, p.status, p.is_demo, p.created_at FROM payments p ORDER BY p.id",
  };
  const sql = queries[String(req.params.kind)];
  if (!sql) throw notFound();
  const rows = await q(sql);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : (v ?? "")).replace(/"/g, '""')}"`;
  res.type("text/csv").setHeader("Content-Disposition", `attachment; filename="biletflow-${req.params.kind}.csv"`);
  res.send([cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"));
});
