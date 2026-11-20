// Demo data for development and the term demonstration. Safe to run many times: it does nothing if data exists.
import bcrypt from "bcryptjs";
import { one, pool, q } from "./pool.js";
import type { AuthUser } from "../lib/auth.js";
import { opaqueToken, slugify } from "../lib/codes.js";
import { completePayment, createOrder, startPayment } from "../services/orders.js";

const PASSWORD = "Demo12345";
const day = 86400_000;
const at = (daysFromNow: number, hour: number) => {
  const d = new Date(Date.now() + daysFromNow * day);
  d.setUTCHours(hour - 5, 0, 0, 0); // hour in Almaty time (UTC+5)
  return d;
};

async function user(email: string, name: string, role: AuthUser["role"]) {
  const u = await one<AuthUser>(
    "INSERT INTO users (email, password_hash, full_name, role, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id, email, full_name, role, email_verified_at",
    [email, await bcrypt.hash(PASSWORD, 10), name, role],
  );
  return u!;
}

/** Predefined arena layout (SRS 4.3.1): stage, sections A–H, rows, numbered seats, accessible seats. */
async function seedArena() {
  const venue = await one<{ id: number }>(
    `INSERT INTO venues (name, city, address, timezone, kind, map_image_url, has_seat_map, map_width, map_height)
     VALUES ('Almaty Arena', 'Almaty', 'Momyshuly Ave 44, Almaty', 'Asia/Almaty', 'arena', '/venues/almaty-arena.svg', true, 1000, 860) RETURNING id`,
  );
  const blocks = [
    // code, name, category, x0, y0, rows, seatsPerRow, view picture
    ["A", "Section A (front left)", "premium", 150, 170, 8, 12, "/venues/view-front-left.svg"],
    ["B", "Section B (front centre)", "premium", 395, 170, 8, 12, "/venues/view-front.svg"],
    ["C", "Section C (front right)", "premium", 640, 170, 8, 12, "/venues/view-front-right.svg"],
    ["D", "Section D (left side)", "standard", 30, 380, 12, 8, "/venues/view-side-left.svg"],
    ["E", "Section E (right side)", "standard", 810, 380, 12, 8, "/venues/view-side-right.svg"],
    ["F", "Section F (back left)", "economy", 190, 560, 10, 10, "/venues/view-back.svg"],
    ["H", "Section H (back centre)", "economy", 410, 560, 10, 10, "/venues/view-back.svg"],
    ["G", "Section G (back right)", "economy", 630, 560, 10, 10, "/venues/view-back.svg"],
  ] as const;
  const step = 18;
  for (const [code, name, category, x0, y0, rows, perRow, view] of blocks) {
    const s = await one<{ id: number }>(
      "INSERT INTO venue_sections (venue_id, code, name, price_category, view_image_url) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [venue!.id, code, name, category, view],
    );
    for (let r = 0; r < rows; r++) {
      for (let n = 0; n < perRow; n++) {
        const accessible = (code === "F" || code === "G") && r === 0 && n < 2;
        await q("INSERT INTO seats (venue_id, section_id, row_label, seat_number, accessible, x, y) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
          venue!.id,
          s!.id,
          String(r + 1),
          n + 1,
          accessible,
          x0 + n * step,
          y0 + r * step,
        ]);
      }
    }
  }
  return venue!.id;
}

async function venue(name: string, city: string, address: string, kind: string, map: string) {
  const v = await one<{ id: number }>("INSERT INTO venues (name, city, address, kind, map_image_url) VALUES ($1, $2, $3, $4, $5) RETURNING id", [name, city, address, kind, map]);
  return v!.id;
}

async function event(organizerId: number, venueId: number, e: { title: string; category: string; description: string; image: string; starts: Date; hours: number; seating?: "general" | "assigned"; capacity: number; paid?: boolean }) {
  const row = await one<{ id: number }>(
    `INSERT INTO events (organizer_id, venue_id, slug, title, description, category, image_url, starts_at, ends_at, status, seating, capacity, paid_sales_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', $10, $11, $12) RETURNING id`,
    [organizerId, venueId, slugify(e.title), e.title, e.description, e.category, e.image, e.starts, new Date(e.starts.getTime() + e.hours * 3600_000), e.seating ?? "general", e.capacity, e.paid ? "active" : "inactive"],
  );
  if (e.paid) {
    await q("INSERT INTO event_activations (event_id, fee_kzt, fee_paid_at, terms_accepted_at, activated_at) VALUES ($1, 5000, now(), now(), now())", [row!.id]);
  }
  await q("INSERT INTO audit_log (event_id, actor_id, action, entity_type, entity_id, description) VALUES ($1, $2, 'event.published', 'event', $1, 'Event published')", [row!.id, organizerId]);
  return row!.id;
}

async function ticketType(eventId: number, name: string, price: number, quantity: number, extra: { description?: string; sections?: string[]; maxPerOrder?: number } = {}) {
  const t = await one<{ id: number }>(
    `INSERT INTO ticket_types (event_id, name, description, price_kzt, quantity, max_per_order, section_codes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(max(sort_order), 0) + 1 FROM ticket_types WHERE event_id = $1)) RETURNING id`,
    [eventId, name, extra.description ?? "", price, quantity, price === 0 ? 1 : (extra.maxPerOrder ?? 10), extra.sections ?? []],
  );
  return t!.id;
}

async function main() {
  const existing = await one("SELECT 1 FROM users LIMIT 1");
  if (existing) {
    console.log("seed: data already present, skipping");
    return;
  }

  const admin = await user("admin@biletflow.kz", "Platform Admin", "platform_admin");
  const organizer = await user("organizer@biletflow.kz", "Aigerim Sultanova", "organizer");
  const attendee = await user("attendee@biletflow.kz", "Dastan Mukhanov", "attendee");
  const attendee2 = await user("attendee2@biletflow.kz", "Aliya Bekova", "attendee");
  const staff = await user("staff@biletflow.kz", "Nursultan Abenov", "attendee");
  await q("INSERT INTO organizer_profiles (user_id, display_name, contact_email, contact_phone, bio, identity_status, identity_verified_at) VALUES ($1, 'Steppe Events', 'organizer@biletflow.kz', '+7 701 000 0000', 'Concerts and festivals across Kazakhstan.', 'verified', now())", [organizer.id]);
  await q("INSERT INTO payout_accounts (organizer_id, bank_name, holder_name, iban_last4) VALUES ($1, 'Halyk Bank', 'Steppe Events LLP', '4821')", [organizer.id]);

  const arena = await seedArena();
  const astanaArena = await venue("Barys Arena", "Astana", "Turan Ave 57, Astana", "stadium", "/venues/barys-arena.svg");
  const hub = await venue("Astana Hub", "Astana", "Mangilik El Ave 55/8, Astana", "hall", "/venues/astana-hub.svg");
  const theatre = await venue("Qazaq Drama Theatre", "Almaty", "Abylai Khan Ave 103, Almaty", "theatre", "/venues/theatre.svg");

  const spirit = await event(organizer.id, arena, {
    title: "The Spirit of Almaty",
    category: "concert",
    description: "An unforgettable evening with top Kazakh artists and special guests. Don't miss the biggest live concert of the season!",
    image: "/images/concert.svg",
    starts: at(14, 19),
    hours: 3,
    seating: "assigned",
    capacity: 900,
    paid: true,
  });
  const premium = await ticketType(spirit, "Premium (Seated)", 10_000, 288, { description: "Front sections A–C, best view", sections: ["A", "B", "C"], maxPerOrder: 6 });
  await ticketType(spirit, "Standard (Seated)", 7_000, 192, { description: "Side sections D–E", sections: ["D", "E"], maxPerOrder: 6 });
  await ticketType(spirit, "Economy (Seated)", 3_500, 300, { description: "Back sections F–H", sections: ["F", "G", "H"], maxPerOrder: 6 });
  await q(
    `INSERT INTO campaigns (event_id, name, code, token, discount_type, discount_value, max_redemptions, valid_until)
     VALUES ($1, 'Instagram spring promo', 'ALMATY10', $2, 'percent', 10, 200, now() + interval '30 days'),
            ($1, 'University posters', 'STUDENT1000', $3, 'fixed', 1000, 100, now() + interval '30 days')`,
    [spirit, opaqueToken(), opaqueToken()],
  );
  await q("INSERT INTO staff_assignments (event_id, user_id) VALUES ($1, $2)", [spirit, staff.id]);
  void premium;

  const tech = await event(organizer.id, hub, {
    title: "TechFuture Conference",
    category: "conference",
    description: "A day of talks on AI, fintech and startups from Kazakhstan's tech community. Free entry, registration required.",
    image: "/images/conference.svg",
    starts: at(21, 10),
    hours: 8,
    capacity: 1000,
  });
  const techFree = await ticketType(tech, "Free registration", 0, 1000, { description: "One free ticket per account" });

  const basket = await event(organizer.id, astanaArena, {
    title: "Kazakhstan Basketball Cup — Final",
    category: "sports",
    description: "The final of the national basketball cup. Come support your team!",
    image: "/images/basketball.svg",
    starts: at(9, 17),
    hours: 3,
    capacity: 2000,
    paid: true,
  });
  const basketGa = await ticketType(basket, "General Admission", 2_000, 1700);
  await ticketType(basket, "Courtside", 8_000, 300, { description: "First three rows", maxPerOrder: 4 });

  const hamlet = await event(organizer.id, theatre, {
    title: "Hamlet",
    category: "theatre",
    description: "Shakespeare's tragedy in a new production, in Kazakh with Russian subtitles.",
    image: "/images/theatre.svg",
    starts: at(30, 19),
    hours: 3,
    capacity: 400,
    paid: true,
  });
  await ticketType(hamlet, "Parterre", 4_000, 300);
  await ticketType(hamlet, "Balcony", 2_500, 100);

  // A past event for organizer history and analytics.
  const past = await event(organizer.id, hub, {
    title: "Startup Night Almaty",
    category: "community",
    description: "Networking evening for founders and students.",
    image: "/images/community.svg",
    starts: at(-20, 18),
    hours: 3,
    capacity: 200,
  });
  await ticketType(past, "Free entry", 0, 200);

  // Demo orders that go through the real checkout code.
  const cart = (u: AuthUser) => ({ items: [], seatIds: [], attendeeName: u.full_name, attendeeEmail: u.email });
  const seats = await q<{ id: number }>("SELECT s.id FROM seats s JOIN venue_sections vs ON vs.id = s.section_id WHERE vs.code = 'B' AND s.row_label = '1' AND s.seat_number IN (5, 6)");
  const o1 = await createOrder(attendee, { ...cart(attendee), eventId: spirit, seatIds: seats.map((s) => s.id), promoCode: "ALMATY10" });
  const p1 = await startPayment(attendee, "ticket_order", { orderId: o1, eventId: spirit, amount: (await one("SELECT total_kzt FROM orders WHERE id = $1", [o1]))!.total_kzt }, "demo");
  await completePayment(p1.id, true, { method: "demo_card" });

  await createOrder(attendee, { ...cart(attendee), eventId: tech, items: [{ ticketTypeId: techFree, quantity: 1 }] });
  await createOrder(attendee2, { ...cart(attendee2), eventId: tech, items: [{ ticketTypeId: techFree, quantity: 1 }] });

  const o3 = await createOrder(attendee2, { ...cart(attendee2), eventId: basket, items: [{ ticketTypeId: basketGa, quantity: 3 }] });
  const p3 = await startPayment(attendee2, "ticket_order", { orderId: o3, eventId: basket, amount: (await one("SELECT total_kzt FROM orders WHERE id = $1", [o3]))!.total_kzt }, "demo");
  await completePayment(p3.id, true, { method: "demo_card" });

  // A support conversation.
  const ticket = await one<{ id: number; order_id: number }>("SELECT id, order_id FROM tickets WHERE order_id = $1 LIMIT 1", [o1]);
  const sc = await one<{ id: number }>(
    "INSERT INTO support_cases (code, kind, requester_id, category, subject, event_id, order_id, ticket_id, status) VALUES ('SC-10024', 'attendee', $1, 'seating', 'Is section B accessible by elevator?', $2, $3, $4, 'waiting_for_customer') RETURNING id",
    [attendee.id, spirit, ticket!.order_id, ticket!.id],
  );
  await q("INSERT INTO support_messages (case_id, author_id, body, created_at) VALUES ($1, $2, 'Hello! My father uses a wheelchair. Is section B reachable by elevator?', now() - interval '2 hours'), ($1, $3, 'Hi Dastan! Yes, there is an elevator at entrance 2. We also have accessible seats in sections F and G.', now() - interval '1 hour')", [
    sc!.id,
    attendee.id,
    organizer.id,
  ]);
  void admin;

  console.log(`seed: done. Demo accounts (password ${PASSWORD}): admin@, organizer@, attendee@, attendee2@, staff@biletflow.kz`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
