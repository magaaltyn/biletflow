// Public event discovery, event pages, seat maps, calendar export and Campaign QR links.
import { Router } from "express";
import { z } from "zod";
import { one, q } from "../db/pool.js";
import { requireAuth, me } from "../lib/auth.js";
import { calendarLinks, icsFile } from "../lib/documents.js";
import { HttpError, idParam, notFound, parse } from "../lib/http.js";
import { audit } from "../lib/audit.js";
import { type EventRow, getEvent } from "../services/access.js";
import { findCampaign } from "../services/orders.js";

export const eventsRouter = Router();

const CARD_FIELDS = `
  e.id, e.slug, e.title, e.category, e.image_url, e.starts_at, e.ends_at, e.seating, e.capacity,
  v.name AS venue_name, v.city, p.display_name AS organizer_name,
  (SELECT min(price_kzt) FROM ticket_types t WHERE t.event_id = e.id AND NOT t.hidden) AS min_price,
  (SELECT COALESCE(sum(sold), 0)::int FROM ticket_types t WHERE t.event_id = e.id) AS sold`;

eventsRouter.get("/", async (req, res) => {
  const f = parse(
    z.object({
      search: z.string().trim().max(100).optional(),
      city: z.string().trim().max(60).optional(),
      category: z.string().trim().max(40).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      free: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(48).default(12),
    }),
    req.query,
  );
  const where = ["e.status = 'published'", "e.visibility = 'public'", "e.suspended_at IS NULL", "e.ends_at > now()"];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (f.search) add("(e.title ILIKE ? OR e.description ILIKE $" + (params.length + 1) + ")", `%${f.search}%`);
  if (f.city) add("v.city = ?", f.city);
  if (f.category) add("e.category = ?", f.category);
  if (f.from) add("e.ends_at >= ?", f.from);
  if (f.to) add("e.starts_at <= ?", f.to);
  if (f.free === "true") where.push("EXISTS (SELECT 1 FROM ticket_types t WHERE t.event_id = e.id AND t.price_kzt = 0 AND NOT t.hidden)");

  const from = `FROM events e JOIN venues v ON v.id = e.venue_id JOIN organizer_profiles p ON p.user_id = e.organizer_id WHERE ${where.join(" AND ")}`;
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params);
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const items = await q(`SELECT ${CARD_FIELDS} ${from} ORDER BY e.starts_at LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ items, total: total?.n ?? 0, page: f.page, pageSize: f.pageSize });
});

eventsRouter.get("/filters", async (_req, res) => {
  const cities = await q<{ city: string }>("SELECT DISTINCT v.city FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.status = 'published' ORDER BY 1");
  const categories = await q<{ category: string }>("SELECT DISTINCT category FROM events WHERE status = 'published' ORDER BY 1");
  res.json({ cities: cities.map((c) => c.city), categories: categories.map((c) => c.category) });
});

/** Visibility rules: public and unlisted by link; private needs the invite key; drafts only for the organizer (preview). */
function canView(e: EventRow, key: unknown, viewer?: { id: number; role: string }) {
  if (viewer && (viewer.role === "platform_admin" || viewer.id === e.organizer_id)) return true;
  if (e.status === "draft" || e.suspended_at) return false;
  if (e.visibility === "private") return key === e.private_token;
  return true;
}

async function eventDetail(e: EventRow) {
  const venue = await one("SELECT id, name, city, address, timezone, kind, map_image_url, has_seat_map, map_width, map_height FROM venues WHERE id = $1", [e.venue_id]);
  const sections = await q("SELECT code, name, price_category, view_image_url FROM venue_sections WHERE venue_id = $1 ORDER BY code", [e.venue_id]);
  const ticketTypes = await q(
    `SELECT id, name, description, price_kzt, quantity, sold, reserved, greatest(quantity - sold - reserved, 0) AS available,
            sales_start, sales_end, max_per_order, section_codes
       FROM ticket_types WHERE event_id = $1 AND NOT hidden ORDER BY sort_order, price_kzt`,
    [e.id],
  );
  const organizer = await one("SELECT user_id AS id, display_name FROM organizer_profiles WHERE user_id = $1", [e.organizer_id]);
  const updated = await one<{ updated_at: Date }>("SELECT updated_at FROM events WHERE id = $1", [e.id]);
  const cal = { id: e.id, slug: e.slug, title: e.title, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, timezone: venue.timezone, venueName: venue.name, venueAddress: venue.address, updatedAt: updated!.updated_at, cancelled: e.status === "cancelled" };
  const remaining = ticketTypes.reduce((s: number, t: { available: number }) => s + Number(t.available), 0);
  const { private_token: _hidden, ...publicEvent } = e;
  return { ...publicEvent, venue, sections, ticketTypes, organizer, remaining, calendar: calendarLinks(cal) };
}

eventsRouter.get("/by-slug/:slug", async (req, res) => {
  const e = await one<EventRow>("SELECT * FROM events WHERE slug = $1", [req.params.slug]);
  if (!e || !canView(e, req.query.key, req.user)) throw notFound("Event not found");
  const detail = await eventDetail(e);
  // Campaign QR / promo link: validated on the server; the link itself carries no price or discount (SRS 4.14).
  let campaign = null;
  const token = typeof req.query.c === "string" ? req.query.c : null;
  if (token) {
    try {
      const c = await findCampaign(e.id, { token });
      await q("INSERT INTO campaign_visits (campaign_id) VALUES ($1)", [c.id]);
      campaign = { code: c.code, token, discountType: c.discount_type, discountValue: c.discount_value, ticketTypeIds: c.ticket_type_ids };
    } catch (err) {
      campaign = { error: err instanceof HttpError ? err.message : "Invalid promo link" };
    }
  }
  res.json({ ...detail, campaign, isPreview: e.status === "draft" });
});

/** Seat availability for assigned-seating events (SRS 4.3.1). */
eventsRouter.get("/:id/seats", async (req, res) => {
  const e = await getEvent(idParam(req));
  if (!canView(e, req.query.key, req.user)) throw notFound("Event not found");
  const seats = await q(
    `SELECT s.id, vs.code AS section, s.row_label AS row, s.seat_number AS number, s.accessible, s.x, s.y,
            CASE WHEN es.status = 'sold' THEN 'sold'
                 WHEN es.status = 'blocked' THEN 'unavailable'
                 WHEN es.status = 'held' AND es.held_until > now() THEN 'held'
                 ELSE 'available' END AS status
       FROM seats s JOIN venue_sections vs ON vs.id = s.section_id
       LEFT JOIN event_seats es ON es.seat_id = s.id AND es.event_id = $1
      WHERE s.venue_id = $2
      ORDER BY vs.code, s.row_label, s.seat_number`,
    [e.id, e.venue_id],
  );
  const types = await q<{ id: number; name: string; price_kzt: number; section_codes: string[] }>(
    "SELECT id, name, price_kzt, section_codes FROM ticket_types WHERE event_id = $1 AND NOT hidden",
    [e.id],
  );
  const priceBySection: Record<string, { ticketTypeId: number; name: string; price: number }> = {};
  for (const t of types) for (const code of t.section_codes) priceBySection[code] = { ticketTypeId: t.id, name: t.name, price: t.price_kzt };
  // Sections without a ticket type are not on sale.
  const result = seats.map((s) => ({ ...s, status: s.status === "available" && !priceBySection[s.section] ? "unavailable" : s.status }));
  const venue = await one("SELECT map_width, map_height FROM venues WHERE id = $1", [e.venue_id]);
  res.json({ seats: result, priceBySection, width: venue.map_width, height: venue.map_height });
});

eventsRouter.get("/:id/calendar.ics", async (req, res) => {
  const e = await getEvent(idParam(req));
  if (!canView(e, req.query.key, req.user)) throw notFound("Event not found");
  const v = await one("SELECT name, address, timezone FROM venues WHERE id = $1", [e.venue_id]);
  const updated = await one<{ updated_at: Date }>("SELECT updated_at FROM events WHERE id = $1", [e.id]);
  const ics = icsFile({ id: e.id, slug: e.slug, title: e.title, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, timezone: v.timezone, venueName: v.name, venueAddress: v.address, updatedAt: updated!.updated_at, cancelled: e.status === "cancelled" });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${e.slug}${e.status === "cancelled" ? "-cancelled" : ""}.ics"`);
  res.send(ics);
});

eventsRouter.post("/:id/report", requireAuth, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(1000) }), req.body);
  const e = await getEvent(idParam(req));
  await q("INSERT INTO event_reports (event_id, reporter_id, reason) VALUES ($1, $2, $3)", [e.id, me(req).id, reason]);
  await audit({ eventId: e.id, actorId: me(req).id, action: "event.reported", entityType: "event", entityId: e.id, description: "Event reported to platform admins" });
  res.status(201).json({ ok: true });
});

/** Campaign QR links point to /c/<token>; this resolves the token to the event page. */
eventsRouter.get("/campaign/:token", async (req, res) => {
  const row = await one<{ slug: string }>("SELECT e.slug FROM campaigns c JOIN events e ON e.id = c.event_id WHERE c.token = $1", [req.params.token]);
  if (!row) throw notFound("This promo link is not valid");
  res.json({ slug: row.slug, token: req.params.token });
});

export const venuesRouter = Router();

venuesRouter.get("/", async (_req, res) => {
  res.json(await q("SELECT id, name, city, address, kind, map_image_url, has_seat_map FROM venues ORDER BY has_seat_map DESC, name"));
});

venuesRouter.get("/:id", async (req, res) => {
  const venue = await one("SELECT * FROM venues WHERE id = $1", [idParam(req)]);
  if (!venue) throw notFound("Venue not found");
  const sections = await q(
    `SELECT vs.code, vs.name, vs.price_category, vs.view_image_url, count(s.id)::int AS seats
       FROM venue_sections vs LEFT JOIN seats s ON s.section_id = vs.id
      WHERE vs.venue_id = $1 GROUP BY vs.id ORDER BY vs.code`,
    [venue.id],
  );
  res.json({ ...venue, sections, totalSeats: sections.reduce((s: number, x: { seats: number }) => s + x.seats, 0) });
});
