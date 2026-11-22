/// <reference types="node" />
// End-to-end tests of the mobile app's API workflows against the REAL local BiletFlow backend.
// They use the app's own API client (src/services/apiClient.ts), so they exercise exactly the requests the app sends.
// Run: start the API (and website) first, then `npm run test:e2e` in mobile/.
//   E2E_API  — API base used by "the phone" (default http://localhost:4000/api)
//   E2E_WEB  — website origin, to prove the website sees the same data (default http://localhost:3000)
// The tests create new records (events named "E2E …", orders, tickets) in the local development database.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { ApiError, createApiClient, type ApiClient } from "../../src/services/apiClient";
import { createScanGate } from "../../src/features/scanner/scanLogic";

const API = process.env.E2E_API ?? "http://localhost:4000/api";
const WEB = process.env.E2E_WEB ?? "http://localhost:3000";
const PASSWORD = "Demo12345";
const RUN = Date.now().toString(36);

function client(token: string | null = null) {
  let t = token;
  const c = createApiClient({ apiUrl: API, getToken: () => t });
  return Object.assign(c, { setToken: (x: string | null) => (t = x) });
}
type C = ReturnType<typeof client>;

async function login(email: string, password = PASSWORD): Promise<C & { user: any; token: string }> {
  const c = client();
  const r = await c.post<{ token: string; user: any }>("/auth/login", { email, password });
  c.setToken(r.token);
  return Object.assign(c, { user: r.user, token: r.token });
}

async function expectApiError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(() => null, (e) => e);
  assert.ok(err instanceof ApiError, `expected ApiError ${status}, got ${err}`);
  assert.equal(err.status, status, `${err.message}`);
  if (code) assert.equal(err.code, code, err.message);
  return err as ApiError;
}

const iso = (days: number, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();

let org: Awaited<ReturnType<typeof login>>;
let attendee: Awaited<ReturnType<typeof login>>;
let attendee2: Awaited<ReturnType<typeof login>>;
let staff: Awaited<ReturnType<typeof login>>;
let admin: Awaited<ReturnType<typeof login>>;
let event: { id: number; slug: string };
let otherEvent: { id: number };
let freeType: number;
let paidType: number;
let promoCode: string;

before(async () => {
  const h = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  assert.equal(h?.status, "ok", `API not reachable at ${API} — start it with "npm run dev" in api/`);
  [org, attendee, attendee2, staff, admin] = await Promise.all([
    login("organizer@biletflow.kz"),
    login("attendee@biletflow.kz"),
    login("attendee2@biletflow.kz"),
    login("staff@biletflow.kz"),
    login("admin@biletflow.kz"),
  ]);
});

describe("authentication", () => {
  test("wrong password is rejected", async () => {
    await expectApiError(client().post("/auth/login", { email: "attendee@biletflow.kz", password: "wrong-pass" }), 401, "bad_credentials");
  });

  test("registration, duplicate email and token refresh", async () => {
    const c = client();
    const email = `e2e-${RUN}@example.com`;
    const r = await c.post<{ token: string; user: any }>("/auth/register", { email, password: "Secret123", fullName: "E2E User" });
    assert.equal(r.user.email, email);
    assert.equal(r.user.role, "attendee");
    await expectApiError(c.post("/auth/register", { email, password: "Secret123", fullName: "Again" }), 409, "email_taken");
    c.setToken(r.token);
    const refreshed = await c.post<{ token: string; user: any }>("/auth/refresh");
    assert.ok(refreshed.token.length > 20);
    assert.equal(refreshed.user.email, email);
  });

  test("protected endpoints need a valid token; an expired/garbage token is treated as signed out", async () => {
    await expectApiError(client().get("/orders"), 401, "unauthenticated");
    let signedOut = 0;
    const c = createApiClient({ apiUrl: API, getToken: () => "eyJhbGciOiJIUzI1NiJ9.invalid.signature", onUnauthorized: () => signedOut++ });
    await expectApiError(c.get("/tickets"), 401);
    assert.equal(signedOut, 1, "the app signs the user out on 401");
    await expectApiError(client().post("/auth/refresh"), 401);
  });

  test("role permissions are enforced by the server", async () => {
    await expectApiError(attendee.get("/admin/overview"), 403);
    await expectApiError(staff.get("/admin/overview"), 403);
    await expectApiError(attendee.get("/organizer/events"), 403);
    assert.ok((await admin.get("/admin/overview")).users > 0);
  });

  test("network errors are reported, never silently ignored", async () => {
    const c = createApiClient({ apiUrl: "http://127.0.0.1:9/api", getToken: () => null, timeoutMs: 3000 });
    const err = await expectApiError(c.get("/events"), 0);
    assert.ok(err.isNetwork);
  });
});

describe("Scenario 1 — organizer creates and publishes an event on mobile", () => {
  test("create draft, ticket types, paid-sales activation (DEMO), publish; visible on the website", async () => {
    const venues = await org.get<any[]>("/venues");
    const hall = venues.find((v) => !v.has_seat_map) ?? venues[0];
    const created = await org.post<{ id: number }>("/organizer/events", {
      title: `E2E Mobile Meetup ${RUN}`, description: "Created by the mobile e2e test", category: "community", venueId: hall.id,
      startsAt: iso(10), endsAt: iso(10, 3), visibility: "public", seating: "general", capacity: 50,
    });
    const free = await org.post<any>(`/organizer/events/${created.id}/ticket-types`, { name: "Free entry", priceKzt: 0, quantity: 20 });
    const paid = await org.post<any>(`/organizer/events/${created.id}/ticket-types`, { name: "VIP", priceKzt: 5000, quantity: 3, maxPerOrder: 4 });
    freeType = free.id;
    paidType = paid.id;
    assert.equal(free.max_per_order, 1, "free tickets are limited to one per order by the server");

    // Paid sales activation (simulated): identity, payout, DEMO fee, terms.
    await org.post("/organizer/verify-identity", { fullLegalName: "Nursultan Organizer", documentLast4: "1234" });
    await org.put("/organizer/payout-account", { bankName: "Demo Bank", holderName: "Steppe Events", iban: "KZ000000000000000000" });
    const fee = await org.post<{ paymentId: number }>(`/organizer/events/${created.id}/activation/pay`, { provider: "demo" });
    await org.post(`/payments/${fee.paymentId}/demo`, { success: true, method: "kaspi" });
    await org.post(`/organizer/events/${created.id}/activation/check`);
    const act = await org.post<any>(`/organizer/events/${created.id}/activation/terms`);
    assert.equal(act.status, "active", JSON.stringify(act.steps));

    await org.post(`/organizer/events/${created.id}/publish`);
    const detail = await org.get<any>(`/organizer/events/${created.id}`);
    assert.equal(detail.status, "published");
    event = { id: created.id, slug: detail.slug };

    // The website reads the same API and database.
    const web = await fetch(`${WEB}/api/events?search=${encodeURIComponent(`E2E Mobile Meetup ${RUN}`)}`).then((r) => r.json());
    assert.equal(web.total, 1, "event visible through the website");
    const page = await fetch(`${WEB}/events/${event.slug}`);
    assert.equal(page.status, 200, "website event page renders");

    const second = await org.post<{ id: number }>("/organizer/events", { title: `E2E Other ${RUN}`, category: "other", venueId: hall.id, startsAt: iso(12), endsAt: iso(12, 2), capacity: 10 });
    await org.post(`/organizer/events/${second.id}/ticket-types`, { name: "Free", priceKzt: 0, quantity: 10 });
    await org.post(`/organizer/events/${second.id}/publish`);
    otherEvent = { id: second.id };
  });

  test("validation: end before start is rejected", async () => {
    await expectApiError(org.post("/organizer/events", { title: "Bad dates", category: "other", venueId: 1, startsAt: iso(5), endsAt: iso(4), capacity: 5 }), 400);
  });

  test("other organizers' events cannot be managed", async () => {
    await expectApiError(attendee.patch(`/organizer/events/${event.id}`, { title: "Hacked" }), 403);
  });
});

describe("Scenario 2 — purchase with promo code and DEMO payment", () => {
  let orderId: number;
  test("campaign, quote, order, failed then successful payment", async () => {
    const camp = await org.post<any>(`/organizer/events/${event.id}/campaigns`, { name: "Mobile launch", code: `MOB${RUN}`.toUpperCase().slice(0, 20), discountType: "percent", discountValue: 20, maxRedemptions: 5 });
    promoCode = camp.code;
    const quote = await attendee.post<any>("/orders/quote", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 1 }], promoCode });
    assert.equal(quote.subtotal, 5000);
    assert.equal(quote.discount, 1000);
    assert.equal(quote.total, 5000 - 1000 + quote.fee);
    assert.equal(quote.promo.code, promoCode);
    const bad = await attendee.post<any>("/orders/quote", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 1 }], promoCode: "NOPE" });
    assert.ok(bad.promoError, "invalid promo reported by the server");

    // A failed DEMO payment issues no tickets and releases the reservation.
    const failed = await attendee.post<any>("/orders", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 1 }], attendeeName: "Dastan", attendeeEmail: "attendee@biletflow.kz" });
    const p1 = await attendee.post<{ paymentId: number }>(`/orders/${failed.id}/pay`, { provider: "demo" });
    await attendee.post(`/payments/${p1.paymentId}/demo`, { success: false });
    const afterFail = await attendee.get<any>(`/orders/${failed.id}`);
    assert.equal(afterFail.status, "failed");
    assert.equal(afterFail.tickets.length, 0);

    const order = await attendee.post<any>("/orders", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 1 }], promoCode, attendeeName: "Dastan Mukhanov", attendeeEmail: "attendee@biletflow.kz" });
    assert.equal(order.status, "pending");
    assert.equal(order.total_kzt, quote.total);
    const pay = await attendee.post<{ paymentId: number }>(`/orders/${order.id}/pay`, { provider: "demo" });
    const p = await attendee.post<any>(`/payments/${pay.paymentId}/demo`, { success: true, method: "kaspi" });
    assert.equal(p.status, "succeeded");
    // A duplicate confirmation (e.g. a double tap) must not issue more tickets.
    const dup = await attendee.post<any>(`/payments/${pay.paymentId}/demo`, { success: true, method: "kaspi" });
    assert.equal(dup.status, "succeeded");
    const done = await attendee.get<any>(`/orders/${order.id}`);
    assert.equal(done.status, "paid");
    assert.equal(done.tickets.length, 1);
    assert.match(done.tickets[0].qrPayload, /^BFT1\./);
    orderId = order.id;

    // "My tickets" (mobile) lists the same server-side ticket with the same QR payload.
    const mine = await attendee.get<any[]>("/tickets");
    const t = mine.find((x) => x.order_id === order.id);
    assert.equal(t.qrPayload, done.tickets[0].qrPayload);

    // The same order through the website's /api proxy.
    const viaWeb = await fetch(`${WEB}/api/orders/${order.id}`, { headers: { Authorization: `Bearer ${attendee.token}` } }).then((r) => r.json());
    assert.equal(viaWeb.code, done.code);
  });

  test("ticket PDF downloads for the owner only", async () => {
    const o = await attendee.get<any>(`/orders/${orderId}`);
    const res = await fetch(`${API}/tickets/${o.tickets[0].id}/pdf`, { headers: attendee.authHeaders() });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const spy = await fetch(`${API}/tickets/${o.tickets[0].id}/pdf`, { headers: attendee2.authHeaders() });
    assert.equal(spy.status, 403);
  });

  test("users cannot read other users' orders", async () => {
    await expectApiError(attendee2.get(`/orders/${orderId}`), 403);
  });

  test("inventory: overselling is impossible", async () => {
    // VIP had 3 tickets; 1 sold. Ask for 3 more.
    await expectApiError(attendee2.post("/orders", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 3 }], attendeeName: "Aliya", attendeeEmail: "a@x.kz" }), 409, "sold_out");
  });

  test("free registration: one free ticket per account", async () => {
    const o = await attendee2.post<any>("/orders", { eventId: event.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Aliya", attendeeEmail: "attendee2@biletflow.kz" });
    assert.equal(o.status, "paid");
    assert.equal(o.total_kzt, 0);
    await expectApiError(attendee2.post("/orders", { eventId: event.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Aliya", attendeeEmail: "attendee2@biletflow.kz" }), 409, "free_limit");
  });
});

describe("Scenario 3 — check-in (scanner API) and QR security", () => {
  let staffNoUndo: C;
  let qrA: string;
  let ticketA: number;
  let qrB: string;
  before(async () => {
    await org.post(`/organizer/events/${event.id}/staff`, { email: "staff@biletflow.kz", canUndo: true });
    const email = `e2e-staff-${RUN}@example.com`;
    const c = client();
    const r = await c.post<{ token: string }>("/auth/register", { email, password: "Secret123", fullName: "Scanner NoUndo" });
    c.setToken(r.token);
    await org.post(`/organizer/events/${event.id}/staff`, { email, canUndo: false });
    staffNoUndo = c;
    const t = (await attendee.get<any[]>("/tickets")).find((x) => x.event_id === event.id && x.status === "valid");
    qrA = t.qrPayload;
    ticketA = t.id;
    const t2 = (await attendee2.get<any[]>("/tickets")).find((x) => x.event_id === event.id && x.status === "valid");
    qrB = t2.qrPayload;
  });

  test("Event Admin sees the assigned event; unassigned users are rejected", async () => {
    const list = await staff.get<any[]>("/checkin/events");
    assert.ok(list.some((e) => e.id === event.id));
    await expectApiError(attendee2.post(`/checkin/${event.id}/scan`, { qr: qrA }), 403);
  });

  test("valid ticket is checked in and the counter increases; a second scan is rejected", async () => {
    const before = await staff.get<any>(`/checkin/${event.id}/stats`);
    const r = await staff.post<any>(`/checkin/${event.id}/scan`, { qr: qrA });
    assert.equal(r.result, "valid");
    assert.equal(r.ticket.attendee_name, "Dastan Mukhanov");
    assert.equal(r.stats.checked_in, before.checked_in + 1);
    const again = await staff.post<any>(`/checkin/${event.id}/scan`, { qr: qrA });
    assert.equal(again.result, "already_used");
    assert.equal(again.stats.checked_in, before.checked_in + 1);
  });

  test("two devices scanning the same ticket at the same time: exactly one admission", async () => {
    const [a, b] = await Promise.all([staff.post<any>(`/checkin/${event.id}/scan`, { qr: qrB }), org.post<any>(`/checkin/${event.id}/scan`, { qr: qrB })]);
    assert.deepEqual([a.result, b.result].sort(), ["already_used", "valid"]);
  });

  test("rapid repeated camera frames send one request (client gate)", async () => {
    const gate = createScanGate(3000);
    let sent = 0;
    for (let i = 0; i < 20; i++) if (gate.accept(qrA)) sent++;
    assert.equal(sent, 1);
  });

  test("invalid, forged, wrong-event and campaign QR codes are rejected", async () => {
    const random = await staff.post<any>(`/checkin/${event.id}/scan`, { qr: "hello world" });
    assert.equal(random.result, "invalid");
    const parts = qrA.split(".");
    const forged = await staff.post<any>(`/checkin/${event.id}/scan`, { qr: `${parts[0]}.${parts[1].replace(/\d$/, (d) => String((Number(d) + 1) % 10))}.${parts[2]}` });
    assert.equal(forged.result, "invalid", "edited ticket code fails the HMAC signature");
    const wrong = await org.post<any>(`/checkin/${otherEvent.id}/scan`, { qr: qrA });
    assert.equal(wrong.result, "wrong_event");
    const campaigns = await org.get<any[]>(`/organizer/events/${event.id}/campaigns`);
    const promoQr = `${WEB}/c/${campaigns[0].token}`;
    const promo = await staff.post<any>(`/checkin/${event.id}/scan`, { qr: promoQr });
    assert.equal(promo.result, "campaign_qr");
  });

  test("manual search, undo by an allowed admin, undo refused without permission, recent scans", async () => {
    const found = await staff.get<any[]>(`/checkin/${event.id}/search?q=Dastan`);
    assert.ok(found.some((t) => t.id === ticketA));
    await expectApiError(staffNoUndo.post(`/checkin/${event.id}/tickets/${ticketA}/undo`), 403);
    const undo = await staff.post<any>(`/checkin/${event.id}/tickets/${ticketA}/undo`);
    assert.ok(undo.ok);
    const manual = await staffNoUndo.post<any>(`/checkin/${event.id}/tickets/${ticketA}`);
    assert.equal(manual.result, "valid");
    const recent = await staff.get<any[]>(`/checkin/${event.id}/recent`);
    assert.ok(recent.length >= 3);
    assert.ok(recent.some((r) => r.action === "undo"));
  });
});

describe("Scenario 4 — refunded and cancelled tickets are rejected by the scanner", () => {
  test("refund on the organizer side, then scan", async () => {
    // A fresh paid ticket for attendee2 (1 VIP left), refunded by the organizer.
    const o = await attendee2.post<any>("/orders", { eventId: event.id, items: [{ ticketTypeId: paidType, quantity: 1 }], attendeeName: "Aliya", attendeeEmail: "attendee2@biletflow.kz" });
    const pay = await attendee2.post<{ paymentId: number }>(`/orders/${o.id}/pay`, { provider: "demo" });
    await attendee2.post(`/payments/${pay.paymentId}/demo`, { success: true });
    const paid = await attendee2.get<any>(`/orders/${o.id}`);
    const qr = paid.tickets[0].qrPayload;
    await org.post(`/organizer/orders/${o.id}/refund`, { reason: "E2E refund test" });
    const r = await staff.post<any>(`/checkin/${event.id}/scan`, { qr });
    assert.equal(r.result, "refunded");
    const after = await attendee2.get<any>(`/orders/${o.id}`);
    assert.equal(after.status, "refunded");
    assert.equal(after.tickets[0].qrPayload, null, "the app no longer receives a QR for a refunded ticket");
  });

  test("cancelled free registration is rejected", async () => {
    const c = client();
    const r = await c.post<{ token: string }>("/auth/register", { email: `e2e-free-${RUN}@example.com`, password: "Secret123", fullName: "Free Guest" });
    c.setToken(r.token);
    const o = await c.post<any>("/orders", { eventId: event.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Free Guest", attendeeEmail: `e2e-free-${RUN}@example.com` });
    const qr = o.tickets[0].qrPayload;
    await org.post(`/organizer/orders/${o.id}/refund`, { reason: "E2E cancel test" });
    const s = await staff.post<any>(`/checkin/${event.id}/scan`, { qr });
    assert.equal(s.result, "cancelled");
  });
});

describe("Scenario 5 — organizer analytics reflect the real records", () => {
  test("sales, discounts, refunds and attendance", async () => {
    const a = await org.get<any>(`/organizer/analytics?eventId=${event.id}`);
    // VIP: 1 sold with 20% promo (kept), 1 sold then refunded. Free: attendee2 (checked in) + 1 cancelled.
    assert.equal(a.capacity.sold, 2, JSON.stringify(a.capacity)); // VIP 1 + free 1
    assert.equal(a.money.gross, 10000);
    assert.equal(a.money.discounts, 1000);
    assert.equal(a.money.refunds, 5000);
    assert.equal(a.money.net, 4000);
    assert.equal(a.attendance.holders, 2);
    assert.equal(a.attendance.checked_in, 2);
    assert.equal(a.attendance.percent, 100);
    const camp = a.campaigns.find((c: any) => c.code === promoCode);
    assert.equal(camp.tickets, 1);
    const history = await org.get<any[]>(`/organizer/events/${event.id}/history`);
    for (const action of ["event.created", "ticket_type.created", "activation.completed", "event.published", "campaign.created", "order.paid", "checkin.recorded", "checkin.reversed", "order.refunded"]) {
      assert.ok(history.some((h) => h.action === action), `history has ${action}`);
    }
  });
});

describe("Scenario 6 — platform administration", () => {
  test("suspending an event blocks purchases on mobile and web; non-admins cannot suspend", async () => {
    await expectApiError(org.post(`/admin/events/${event.id}/suspend`, { suspended: true }), 403);
    const found = await admin.get<any>(`/admin/search?q=${encodeURIComponent(`E2E Mobile Meetup ${RUN}`)}`);
    assert.equal(found.events[0].id, event.id);
    await admin.post(`/admin/events/${event.id}/suspend`, { suspended: true, reason: "E2E moderation" });
    const c = client();
    const r = await c.post<{ token: string }>("/auth/register", { email: `e2e-blocked-${RUN}@example.com`, password: "Secret123", fullName: "Blocked Buyer" });
    c.setToken(r.token);
    await expectApiError(c.post("/orders", { eventId: event.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Blocked", attendeeEmail: "b@x.kz" }), 400, "event_suspended");
    const viaWeb = await fetch(`${WEB}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${r.token}` }, body: JSON.stringify({ eventId: event.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Blocked", attendeeEmail: "b@x.kz" }) });
    assert.equal(viaWeb.status, 400);
    const list = await client().get<any>(`/events?search=${encodeURIComponent(`E2E Mobile Meetup ${RUN}`)}`);
    assert.equal(list.total, 0, "suspended events disappear from discovery");
    await admin.post(`/admin/events/${event.id}/suspend`, { suspended: false, reason: "E2E done" });
    const monitoring = await admin.get<any>("/admin/monitoring");
    assert.ok(monitoring.refunds.length >= 1);
  });
});

describe("Scenario 7 — support conversation", () => {
  test("attendee asks, organizer replies, attendee sees the reply and the status", async () => {
    const created = await attendee.post<{ id: number }>("/support", { category: "event_info", subject: "Parking at the venue?", message: "Is there parking nearby?", eventId: event.id });
    const inbox = await org.get<any[]>("/support?view=inbox");
    assert.ok(inbox.some((c) => c.id === created.id));
    await expectApiError(attendee2.get(`/support/${created.id}`), 403);
    await org.post(`/support/${created.id}/messages`, { body: "Yes, free parking at the north entrance." });
    const seen = await attendee.get<any>(`/support/${created.id}`);
    assert.equal(seen.status, "waiting_for_customer");
    assert.ok(seen.messages.some((m: any) => m.body.includes("north entrance") && m.author_role === "organizer"));
    const notes = await attendee.get<any>("/notifications");
    assert.ok(notes.items.some((n: any) => n.kind === "support_reply" && n.link === `/support/${created.id}`));
    await attendee.patch(`/support/${created.id}`, { status: "resolved" });
    assert.equal((await attendee.get<any>(`/support/${created.id}`)).status, "resolved");
  });
});

// Keep the type import used (documentation of the client shape).
export type { ApiClient };
