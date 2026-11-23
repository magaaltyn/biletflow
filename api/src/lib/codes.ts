import crypto from "node:crypto";
import { config } from "./config.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length: number) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const randomDigits = (n: number) => Array.from(crypto.randomBytes(n), (b) => String(b % 10)).join("");
export const orderCode = () => `BF-${randomDigits(6)}`;
export const ticketCode = (orderCodeValue: string, index: number) => `${orderCodeValue}-${String(index + 1).padStart(4, "0")}`;
export const caseCode = () => `SC-${randomDigits(5)}`;
export const opaqueToken = () => crypto.randomBytes(18).toString("base64url");

export function slugify(text: string) {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 50);
  return `${base || "event"}-${randomCode(4).toLowerCase()}`;
}

/*
 * Admission QR payload: "BFT1.<ticketCode>.<signature>".
 * The HMAC signature makes the QR tamper-resistant (SRS 4.7): a forged or edited code fails verification.
 * Campaign QR codes are plain https links to the website, so they can never pass this check (SRS 4.14).
 */
const sign = (value: string) => crypto.createHmac("sha256", config.qrSecret).update(value).digest("base64url").slice(0, 22);

export const ticketQrPayload = (code: string) => `BFT1.${code}.${sign(code)}`;

export function verifyTicketQr(payload: string): { ok: true; code: string } | { ok: false; reason: "campaign_qr" | "invalid" } {
  const text = payload.trim();
  if (/^https?:\/\//i.test(text)) return { ok: false, reason: "campaign_qr" };
  const parts = text.split(".");
  if (parts.length !== 3 || parts[0] !== "BFT1") return { ok: false, reason: "invalid" };
  const [, code, signature] = parts;
  const expected = sign(code);
  const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return valid ? { ok: true, code } : { ok: false, reason: "invalid" };
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
