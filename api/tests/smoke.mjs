// End-to-end smoke test of the BiletFlow API (run against the test database).
// Usage: start the API on a freshly seeded database, then `npm run test:smoke` (BASE defaults to http://localhost:4000/api).
const BASE = process.env.BASE ?? "http://localhost:4000/api";
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };

async function session(email, password = "Demo12345") {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(j)}`);
  const auth = { Authorization: `Bearer ${j.token}` };
  const call = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, { method, headers: { ...auth, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, type };
  };
  return { user: j.user, call };
}

for (let i = 0; i < 30; i++) { try { await fetch(`${BASE}/health`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

const health = await (await fetch(`${BASE}/health`)).json();
ok(health.status === "ok", "health");

const list = await (await fetch(`${BASE}/events`)).json();
ok(list.total >= 4, `public event list (${list.total})`);
ok(!list.items.some((e) => e.title === "Startup Night Almaty"), "past event hidden from discovery");

const attendee = await session("attendee@biletflow.kz");
const a2 = await session("attendee2@biletflow.kz");
const org = await session("organizer@biletflow.kz");
const staff = await session("staff@biletflow.kz");
const admin = await session("admin@biletflow.kz");

const spirit = list.items.find((e) => e.title === "The Spirit of Almaty");
const tech = list.items.find((e) => e.title === "TechFuture Conference");
const basket = list.items.find((e) => e.title.startsWith("Kazakhstan Basketball"));
const detail = await (await fetch(`${BASE}/events/by-slug/${spirit.slug}`)).json();
ok(detail.venue.map_image_url && detail.sections.length === 8 && detail.sections[0].view_image_url, "event page has venue map + section view pictures");
ok(detail.calendar.google.startsWith("https://calendar.google.com"), "calendar links");

// Seat map
const seatMap = await (await fetch(`${BASE}/events/${spirit.id}/seats`)).json();
const sold = seatMap.seats.filter((s) => s.status === "sold");
ok(seatMap.seats.length === 780 && sold.length === 2, `seat map: ${seatMap.seats.length} seats, ${sold.length} sold`);
ok(seatMap.seats.some((s) => s.accessible), "accessible seats marked");

// Buying an already-sold seat is rejected
const taken = await a2.call("POST", "/orders", { eventId: spirit.id, seatIds: [sold[0].id], attendeeName: "Aliya", attendeeEmail: "a2@x.kz" });
ok(taken.status === 409, `sold seat rejected (${taken.status} ${taken.data.code})`);

// Concurrent checkout of the same seat: exactly one wins
const free = seatMap.seats.find((s) => s.status === "available" && s.section === "A");
const [r1, r2] = await Promise.all([
  attendee.call("POST", "/orders", { eventId: spirit.id, seatIds: [free.id], attendeeName: "Dastan", attendeeEmail: "d@x.kz" }),
  a2.call("POST", "/orders", { eventId: spirit.id, seatIds: [free.id], attendeeName: "Aliya", attendeeEmail: "a@x.kz" }),
]);
ok([r1.status, r2.status].sort().join(",") === "201,409", `concurrent seat checkout: ${r1.status}/${r2.status}`);
const heldOrder = r1.status === 201 ? r1 : r2;
const holder = r1.status === 201 ? attendee : a2;
const seatsAfter = await (await fetch(`${BASE}/events/${spirit.id}/seats`)).json();
ok(seatsAfter.seats.find((s) => s.id === free.id).status === "held", "seat shows as temporarily held");

// Promo quote
const quote = await attendee.call("POST", "/orders/quote", { eventId: spirit.id, seatIds: [seatMap.seats.find((s) => s.section === "B" && s.status === "available").id], promoCode: "almaty10" });
ok(quote.data.discount === 1000 && quote.data.fee === 270 && quote.data.total === 9270, `promo quote: ${JSON.stringify(quote.data)}`);
const badPromo = await attendee.call("POST", "/orders/quote", { eventId: spirit.id, seatIds: [free.id], promoCode: "NOPE" });
ok(badPromo.data.promoError, `invalid promo rejected: ${badPromo.data.promoError}`);

// Demo payment failure releases the seat
const pay = await holder.call("POST", `/orders/${heldOrder.data.id}/pay`, { provider: "demo" });
const failed = await holder.call("POST", `/payments/${pay.data.paymentId}/demo`, { success: false });
ok(failed.data.status === "failed" && failed.data.order_status === "failed", "failed payment marks order failed");
const seatsAfterFail = await (await fetch(`${BASE}/events/${spirit.id}/seats`)).json();
ok(seatsAfterFail.seats.find((s) => s.id === free.id).status === "available", "failed payment releases the seat");

// Successful payment issues tickets with assigned seat
const again = await a2.call("POST", "/orders", { eventId: spirit.id, seatIds: [free.id], promoCode: "STUDENT1000", attendeeName: "Aliya", attendeeEmail: "a@x.kz" });
const pay2 = await a2.call("POST", `/orders/${again.data.id}/pay`, { provider: "demo" });
await a2.call("POST", `/payments/${pay2.data.paymentId}/demo`, { success: true });
const paidOrder = await a2.call("GET", `/orders/${again.data.id}`);
ok(paidOrder.data.status === "paid" && paidOrder.data.tickets.length === 1 && paidOrder.data.tickets[0].section_code === "A", "paid order issues seated ticket");
ok(paidOrder.data.discount_kzt === 1000, "fixed promo discount recorded");

// Free ticket rule: one per account per event
const techDetail = await (await fetch(`${BASE}/events/by-slug/${tech.slug}`)).json();
const freeType = techDetail.ticketTypes[0].id;
const dup = await attendee.call("POST", "/orders", { eventId: tech.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Dastan", attendeeEmail: "d@x.kz" });
ok(dup.status === 409 && dup.data.code === "free_limit", `second free ticket rejected (${dup.data.code})`);
const two = await staff.call("POST", "/orders", { eventId: tech.id, items: [{ ticketTypeId: freeType, quantity: 2 }], attendeeName: "Nurs", attendeeEmail: "n@x.kz" });
ok(two.status === 400, `two free tickets in one order rejected (${two.data.code})`);
const one = await staff.call("POST", "/orders", { eventId: tech.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Nursultan", attendeeEmail: "n@x.kz" });
ok(one.status === 201 && one.data.status === "paid" && one.data.total_kzt === 0, "free registration issues ticket immediately");

// Paid tickets blocked until activation: create event without activation
const venues = await (await fetch(`${BASE}/venues`)).json();
const hub = venues.find((v) => v.name === "Astana Hub");
const start = new Date(Date.now() + 40 * 86400000);
const newEv = await org.call("POST", "/organizer/events", { title: "Paid workshop", category: "education", venueId: hub.id, startsAt: start, endsAt: new Date(start.getTime() + 7200000), capacity: 50 });
const tt = await org.call("POST", `/organizer/events/${newEv.data.id}/ticket-types`, { name: "Seat", priceKzt: 5000, quantity: 50 });
const pub = await org.call("POST", `/organizer/events/${newEv.data.id}/publish`);
ok(pub.status === 200, "publish event");
const blocked = await attendee.call("POST", "/orders", { eventId: newEv.data.id, items: [{ ticketTypeId: tt.data.id, quantity: 1 }], attendeeName: "Dastan", attendeeEmail: "d@x.kz" });
ok(blocked.status === 400 && blocked.data.code === "paid_sales_inactive", `paid tickets blocked before activation ${blocked.status} ${JSON.stringify(blocked.data)}`);
let act = (await org.call("GET", `/organizer/events/${newEv.data.id}/activation`)).data;
ok(act.steps.filter((s) => !s.done).map((s) => s.key).join(",") === "fee,terms", `checklist pending: fee, terms`);
const feePay = await org.call("POST", `/organizer/events/${newEv.data.id}/activation/pay`, { provider: "demo" });
await org.call("POST", `/payments/${feePay.data.paymentId}/demo`, { success: true });
act = (await org.call("POST", `/organizer/events/${newEv.data.id}/activation/terms`)).data;
ok(act.status === "active", "paid sales activated after checklist");
const nowOk = await attendee.call("POST", "/orders", { eventId: newEv.data.id, items: [{ ticketTypeId: tt.data.id, quantity: 1 }], attendeeName: "Dastan", attendeeEmail: "d@x.kz" });
ok(nowOk.status === 201 && nowOk.data.status === "pending", `paid order after activation ${nowOk.status} ${JSON.stringify(nowOk.data).slice(0,200)}`);

// Check-in
const myOrders = (await attendee.call("GET", "/orders")).data;
const spiritOrder = myOrders.find((o) => o.title === "The Spirit of Almaty" && o.status === "paid");
const so = (await attendee.call("GET", `/orders/${spiritOrder.id}`)).data;
const qr = so.tickets[0].qrPayload;
const scan1 = await staff.call("POST", `/checkin/${spirit.id}/scan`, { qr });
ok(scan1.data.result === "valid", `scan valid ticket: ${scan1.data.result}`);
const scan2 = await staff.call("POST", `/checkin/${spirit.id}/scan`, { qr });
ok(scan2.data.result === "already_used", `second scan rejected: ${scan2.data.result}`);
const forged = await staff.call("POST", `/checkin/${spirit.id}/scan`, { qr: qr.slice(0, -2) + "xx" });
ok(forged.data.result === "invalid", "tampered QR rejected");
const camps = (await org.call("GET", `/organizer/events/${spirit.id}/campaigns`)).data;
const campaignQr = `http://localhost:3000/c/${camps[0].token}`;
const scanCampaign = await staff.call("POST", `/checkin/${spirit.id}/scan`, { qr: campaignQr });
ok(scanCampaign.data.result === "campaign_qr", "Campaign QR rejected at entrance");
const undo = await staff.call("POST", `/checkin/${spirit.id}/tickets/${scan1.data.ticket.id}/undo`);
ok(undo.data.stats.checked_in === 0, "check-in undone");
const wrongStaff = await a2.call("POST", `/checkin/${spirit.id}/scan`, { qr });
ok(wrongStaff.status === 403, "non-staff cannot scan");

// Campaign link resolves and pre-applies
const viaLink = await (await fetch(`${BASE}/events/by-slug/${spirit.slug}?c=${camps[0].token}`)).json();
ok(viaLink.campaign && viaLink.campaign.code, `campaign link pre-applies ${viaLink.campaign?.code}`);

// Documents
const pdf = await attendee.call("GET", `/tickets/${so.tickets[0].id}/pdf`);
ok(pdf.status === 200 && pdf.type.includes("pdf") && pdf.data.byteLength > 5000, `ticket PDF (${pdf.data.byteLength} bytes)`);
const ics = await fetch(`${BASE}/events/${spirit.id}/calendar.ics`);
const icsText = await ics.text();
ok(icsText.includes("UID:event-") && icsText.includes("TZID=Asia/Almaty"), "ics file with stable UID and time zone");
const otherPdf = await a2.call("GET", `/tickets/${so.tickets[0].id}/pdf`);
ok(otherPdf.status === 403, "other users cannot download someone else's ticket");

// Refund invalidates tickets
const orgOrders = (await org.call("GET", `/organizer/events/${basket.id}/orders`)).data;
const refund = await org.call("POST", `/organizer/orders/${orgOrders[0].id}/refund`, { reason: "Customer request" });
ok(refund.status === 200, "organizer refund");
const refunded = (await a2.call("GET", `/orders/${orgOrders[0].id}`)).data;
ok(refunded.status === "refunded" && refunded.tickets.every((t) => t.status === "refunded"), "refunded tickets invalid");

// Support
const sc = await attendee.call("POST", "/support", { category: "payment", subject: "Receipt please", message: "Can I get a receipt?", orderId: spiritOrder.id });
ok(sc.status === 201, "support case opened with order context");
const inbox = (await org.call("GET", "/support?view=inbox")).data;
ok(inbox.some((c) => c.id === sc.data.id), "organizer sees attendee case");
const reply = await org.call("POST", `/support/${sc.data.id}/messages`, { body: "Sure, attached." });
const caseView = (await attendee.call("GET", `/support/${sc.data.id}`)).data;
ok(reply.status === 201 && caseView.status === "waiting_for_customer" && caseView.messages.length === 2, "reply thread + status");
const peek = await a2.call("GET", `/support/${sc.data.id}`);
ok(peek.status === 403, "other users cannot read the case");

// Analytics & history
const an = (await org.call("GET", `/organizer/analytics?eventId=${spirit.id}`)).data;
ok(an.capacity.sold >= 3 && an.campaigns.length === 2 && an.money.gross > 0, `analytics: sold ${an.capacity.sold}, gross ${an.money.gross}, net ${an.money.net}`);
const hist = (await org.call("GET", `/organizer/events/${spirit.id}/history`)).data;
ok(hist.some((h) => h.action === "checkin.reversed"), `history timeline (${hist.length} entries)`);

// Admin suspends event -> sales stop
await admin.call("POST", `/admin/events/${tech.id}/suspend`, { suspended: true, reason: "Test" });
const afterSuspend = await a2.call("POST", "/orders", { eventId: tech.id, items: [{ ticketTypeId: freeType, quantity: 1 }], attendeeName: "Aliya", attendeeEmail: "a@x.kz" });
ok(afterSuspend.status === 400 && afterSuspend.data.code === "event_suspended", `suspended stops sales ${afterSuspend.status} ${JSON.stringify(afterSuspend.data)}`);
const csv = await admin.call("GET", "/admin/export/orders.csv");
ok(csv.status === 200, "admin CSV export");

// Duplicate event copies config only
const dupEv = await org.call("POST", `/organizer/events/${spirit.id}/duplicate`);
const dupDetail = (await org.call("GET", `/organizer/events/${dupEv.data.id}`)).data;
ok(dupDetail.status === "draft" && dupDetail.stats.sold === 0 && dupDetail.ticketTypes.length === 3, "duplicate copies config without sales");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
