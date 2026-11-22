/// <reference types="jest" />
import { appRouteForWebPath, campaignTokenFrom } from "../../src/lib/links";
import { formatDate, kzt, mmss, secondsUntil, humanize } from "../../src/lib/format";
import { ApiError, createApiClient, qs } from "../../src/services/apiClient";
import { ticketTab } from "../../src/features/tickets/ticketTab";
import { workspacesFor } from "../../src/features/auth/workspaces";

describe("notification links -> app screens", () => {
  test.each<[string, string]>([
    ["/orders/12", "/order/12"],
    ["/events/the-spirit-of-almaty-g7t7", "/event/the-spirit-of-almaty-g7t7"],
    ["/support/5", "/support/5"],
    ["/organizer/events/7", "/org-event/7"],
    ["/checkin/3", "/scan/3"],
    ["/organizer/events/7?tab=activation", "/org-event/7"],
    ["/organizer", "/dashboard"],
    ["/c/AbCdEf123456789xyz", "/c/AbCdEf123456789xyz"],
  ])("%s -> %s", (web, app) => expect(appRouteForWebPath(web)).toBe(app));
  test("unknown or empty links", () => {
    expect(appRouteForWebPath("/terms")).toBeNull();
    expect(appRouteForWebPath(null)).toBeNull();
  });
  test("campaign token from a full https link or a bare token", () => {
    expect(campaignTokenFrom("http://192.168.1.76:3000/c/QWERTYuiop_-1234567")).toBe("QWERTYuiop_-1234567");
    expect(campaignTokenFrom("QWERTYuiop_-1234567")).toBe("QWERTYuiop_-1234567");
    expect(campaignTokenFrom("BFT1.BF-1.sig")).toBeNull();
  });
});

describe("formatting", () => {
  test("KZT amounts use the same format as the website", () => {
    expect(kzt(3245)).toBe("3 245 ₸");
    expect(kzt(0)).toBe("0 ₸");
    expect(kzt(null)).toBe("—");
  });
  test("Kazakh dates avoid broken Intl output (2026 M12 5) and use the event time zone", () => {
    const iso = "2026-12-05T14:00:00Z"; // 19:00 in Almaty (UTC+5)
    expect(formatDate(iso, { dateStyle: "medium", timeStyle: "short" }, "kk-KZ")).toBe("05.12.2026, 19:00");
    expect(formatDate(iso, { month: "short" }, "kk-KZ")).toBe("жел");
    expect(formatDate(iso, { day: "numeric" }, "kk-KZ")).toBe("5");
    expect(formatDate(iso, { timeStyle: "short" }, "ru-RU")).toBe("19:00");
  });
  test("countdown", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(secondsUntil("2026-01-01T10:01:05Z", now)).toBe(65);
    expect(secondsUntil("2026-01-01T09:00:00Z", now)).toBe(0);
    expect(mmss(65)).toBe("01:05");
    expect(humanize("waiting_for_customer")).toBe("Waiting for customer");
  });
});

describe("ticket tabs", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  test("status wins over date", () => {
    expect(ticketTab({ status: "refunded", ends_at: future })).toBe("refunded");
    expect(ticketTab({ status: "cancelled", ends_at: past })).toBe("cancelled");
    expect(ticketTab({ status: "valid", ends_at: future })).toBe("upcoming");
    expect(ticketTab({ status: "checked_in", ends_at: past })).toBe("past");
  });
});

describe("role-aware workspaces", () => {
  const base = { id: 1, email: "a@b.kz", full_name: "A", phone: null, email_verified: true, has_password: true, google_linked: false, organizer_name: null, identity_status: null };
  test("attendee only sees the attendee workspace", () => expect(workspacesFor({ ...base, role: "attendee", is_event_admin: false })).toEqual(["attendee"]));
  test("event admin gets the scanner but not admin", () => expect(workspacesFor({ ...base, role: "attendee", is_event_admin: true })).toEqual(["attendee", "staff"]));
  test("organizer", () => expect(workspacesFor({ ...base, role: "organizer", is_event_admin: false })).toEqual(["attendee", "organizer", "staff"]));
  test("platform admin", () => expect(workspacesFor({ ...base, role: "platform_admin", is_event_admin: false })).toEqual(["attendee", "staff", "admin"]));
  test("guest", () => expect(workspacesFor(null)).toEqual(["attendee"]));
});

describe("API client", () => {
  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  test("sends the bearer token and JSON body", async () => {
    const fetchImpl = jest.fn(() => json(200, { ok: true })) as unknown as typeof fetch;
    const c = createApiClient({ apiUrl: "http://x/api", getToken: () => "TOKEN", fetchImpl });
    await c.post("/orders", { a: 1 });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("http://x/api/orders");
    expect(init.headers.Authorization).toBe("Bearer TOKEN");
    expect(init.body).toBe('{"a":1}');
  });

  test("turns API errors into ApiError with the server message and code", async () => {
    const c = createApiClient({ apiUrl: "http://x/api", getToken: () => null, fetchImpl: (() => json(409, { error: "Not enough tickets", code: "sold_out" })) as unknown as typeof fetch });
    await expect(c.get("/x")).rejects.toMatchObject({ status: 409, message: "Not enough tickets", code: "sold_out" });
  });

  test("401 with a token signs the user out (expired session)", async () => {
    const onUnauthorized = jest.fn();
    const c = createApiClient({ apiUrl: "http://x/api", getToken: () => "OLD", onUnauthorized, fetchImpl: (() => json(401, { error: "Please sign in" })) as unknown as typeof fetch });
    await expect(c.get("/orders")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test("network failures become a readable ApiError with status 0", async () => {
    const c = createApiClient({ apiUrl: "http://10.0.0.1:3000/api", getToken: () => null, fetchImpl: (() => Promise.reject(new TypeError("Network request failed"))) as unknown as typeof fetch });
    const err = await c.get("/events").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/same Wi-Fi/);
  });

  test("query strings skip empty values", () => {
    expect(qs({ a: 1, b: "", c: undefined, d: "x y" })).toBe("?a=1&d=x%20y");
    expect(qs({})).toBe("");
  });
});
