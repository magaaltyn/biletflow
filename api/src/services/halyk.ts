// Halyk ePay (Halyk Bank) payment page integration, test environment.
// Docs: https://epayment.kz/en-US/docs/platezhnaya-stranica and https://epayment.kz/en-US/docs/check-status-payment
import { config } from "../lib/config.js";
import { HttpError } from "../lib/http.js";

async function token(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(config.halyk.oauthUrl, { method: "POST", body: form });
  if (!res.ok) throw new HttpError(502, `Halyk ePay did not issue a token (HTTP ${res.status})`, "provider_error");
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new HttpError(502, "Halyk ePay did not issue a token", "provider_error");
  return body.access_token;
}

/** Returns the object the browser passes to halyk.pay() to open the bank's payment page. */
export async function halykPaymentObject(p: { invoiceId: string; amount: number; description: string; email: string; accountId: string; backPath: string; paymentId: number }) {
  const postLink = `${config.webUrl}/api/payments/halyk/callback`;
  const auth = await token({
    grant_type: "client_credentials",
    scope: "payment",
    client_id: config.halyk.clientId,
    client_secret: config.halyk.clientSecret,
    invoiceID: p.invoiceId,
    amount: String(p.amount),
    currency: "KZT",
    terminal: config.halyk.terminal,
    postLink,
    failurePostLink: postLink,
  });
  return {
    invoiceId: p.invoiceId,
    backLink: `${config.webUrl}${p.backPath}?payment=${p.paymentId}&result=success`,
    failureBackLink: `${config.webUrl}${p.backPath}?payment=${p.paymentId}&result=failure`,
    postLink,
    failurePostLink: postLink,
    language: "RUS",
    description: p.description.slice(0, 120),
    accountId: p.accountId,
    terminal: config.halyk.terminal,
    amount: p.amount,
    currency: "KZT",
    email: p.email,
    auth: {
      access_token: auth,
      expires_in: 1200,
      refresh_token: "",
      scope: "payment",
      token_type: "Bearer",
    },
  };
}

/** Asks Halyk for the real status of an invoice; never trust the browser or the callback body alone. */
export async function halykStatus(invoiceId: string): Promise<"succeeded" | "failed" | "pending"> {
  const auth = await token({
    grant_type: "client_credentials",
    scope: "webapi usermanagement email_send verification statement statistics payment",
    client_id: config.halyk.clientId,
    client_secret: config.halyk.clientSecret,
    terminal: config.halyk.terminal,
  });
  let body: { resultCode?: string; resultMessage?: string; transaction?: { statusName?: string; reasonCode?: number } };
  try {
    const res = await fetch(`${config.halyk.statusUrl}/${encodeURIComponent(invoiceId)}`, {
      headers: { Authorization: `Bearer ${auth}` },
      signal: AbortSignal.timeout(10_000),
    });
    body = await res.json();
    if (!res.ok) {
      console.log(`halyk status ${invoiceId}: HTTP ${res.status}`, JSON.stringify(body).slice(0, 200));
      return "pending";
    }
  } catch (err) {
    // Network problem: keep the payment pending; the attendee can check again or the bank's callback will arrive.
    console.error(`halyk status ${invoiceId}: request failed`, (err as Error).message);
    return "pending";
  }
  const status = (body.transaction?.statusName ?? "").toUpperCase();
  console.log(`halyk status ${invoiceId}: resultCode=${body.resultCode} statusName=${status}`);
  // resultCode 100 = found; 101 = rejected; 102 = invoice not found (not paid yet); 107 = try again later.
  if (body.resultCode === "101") return "failed";
  if (body.resultCode !== "100") return "pending";
  if (["AUTH", "CHARGE", "COMPLETE", "COMPLETED", "PAID"].includes(status)) return "succeeded";
  if (["REJECT", "REJECTED", "FAILED", "CANCEL", "CANCELLED", "DECLINED"].includes(status)) return "failed";
  return "pending";
}
