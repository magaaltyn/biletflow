// Printable PDF tickets (SRS 4.7), QR images and calendar files (SRS 4.11).
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { config } from "./config.js";

// DejaVu Sans supports Kazakh and Russian letters (license: assets/fonts/LICENSE).
// Paths are relative to this file in both src/lib and dist/lib.
const FONT = fileURLToPath(new URL("../../assets/fonts/DejaVuSans.ttf", import.meta.url));
const FONT_BOLD = fileURLToPath(new URL("../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url));

export const qrPng = (text: string, width = 600) =>
  QRCode.toBuffer(text, { errorCorrectionLevel: "M", margin: 2, width, color: { dark: "#000000", light: "#ffffff" } });

export interface TicketDoc {
  code: string;
  qrPayload: string;
  eventTitle: string;
  startsAt: Date;
  timezone: string;
  venueName: string;
  venueAddress: string;
  ticketType: string;
  attendeeName: string;
  section: string | null;
  row: string | null;
  seat: number | null;
  status: string;
}

export function formatEventTime(date: Date, timezone: string, locale = "ru-RU") {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(date);
}

/** A4 print-optimized ticket. Black-on-white only, so it scans when printed in grayscale. */
export async function ticketPdf(tickets: TicketDoc[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "BiletFlow ticket" } });
  doc.registerFont("body", FONT);
  doc.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (i > 0) doc.addPage();
    doc.font("bold").fontSize(12).text("BiletFlow", { continued: true }).font("body").text("  ·  Admission ticket");
    doc.moveDown(1.2);
    doc.font("bold").fontSize(24).text(t.eventTitle);
    doc.moveDown(0.5);
    doc.font("body").fontSize(13).text(formatEventTime(t.startsAt, t.timezone));
    doc.text(`${t.venueName}, ${t.venueAddress}`);
    doc.moveDown(1);

    const rows: [string, string][] = [
      ["Ticket type", t.ticketType],
      ["Attendee", t.attendeeName],
    ];
    if (t.section) rows.push(["Section / Row / Seat", `${t.section} / ${t.row} / ${t.seat}`]);
    rows.push(["Ticket ID", t.code]);
    for (const [label, value] of rows) {
      doc.font("body").fontSize(10).fillColor("#444444").text(label.toUpperCase());
      doc.font("bold").fontSize(14).fillColor("#000000").text(value);
      doc.moveDown(0.4);
    }

    const qr = await qrPng(t.qrPayload, 700);
    const size = 260; // ~9 cm: large enough to scan from paper
    const x = (doc.page.width - size) / 2;
    const y = doc.y + 16;
    doc.image(qr, x, y, { width: size, height: size });
    doc.font("bold").fontSize(12).text(t.code, 48, y + size + 10, { align: "center" });
    if (t.status !== "valid") {
      doc.font("bold").fontSize(16).text(`STATUS: ${t.status.toUpperCase()} — NOT VALID FOR ENTRY`, { align: "center" });
    }
    doc.font("body").fontSize(9).fillColor("#444444").text(
      "Show this QR code at the entrance. Each ticket can be scanned only once. Printed and digital copies are the same ticket.",
      48,
      doc.page.height - 90,
      { align: "center", width: doc.page.width - 96 },
    );
    doc.fillColor("#000000");
  }
  doc.end();
  return done;
}

// ---------- Calendar (.ics) ----------
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

function localStamp(d: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function utcOffset(d: Date, timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? `${m[1]}${m[2]}${m[3] ?? "00"}` : "+0000";
}

export interface CalendarEvent {
  id: number;
  slug: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  venueName: string;
  venueAddress: string;
  updatedAt: Date;
  cancelled: boolean;
}

/** iCalendar file with a stable UID, so updates and cancellations replace the earlier entry. */
export function icsFile(e: CalendarEvent) {
  const offset = utcOffset(e.startsAt, e.timezone);
  const url = `${config.webUrl}/events/${e.slug}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BiletFlow//Events//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VTIMEZONE",
    `TZID:${e.timezone}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:event-${e.id}@biletflow`,
    `SEQUENCE:${Math.floor(new Date(e.updatedAt).getTime() / 1000)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART;TZID=${e.timezone}:${localStamp(e.startsAt, e.timezone)}`,
    `DTEND;TZID=${e.timezone}:${localStamp(e.endsAt, e.timezone)}`,
    `SUMMARY:${icsText(e.cancelled ? `CANCELLED: ${e.title}` : e.title)}`,
    `DESCRIPTION:${icsText(`${e.description.slice(0, 500)}\n\n${url}`)}`,
    `LOCATION:${icsText(`${e.venueName}, ${e.venueAddress}`)}`,
    `URL:${url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** One-click links for common calendar services (no write access to the attendee's calendar is needed). */
export function calendarLinks(e: CalendarEvent) {
  const url = `${config.webUrl}/events/${e.slug}`;
  const location = `${e.venueName}, ${e.venueAddress}`;
  const details = `${e.description.slice(0, 300)}\n\n${url}`;
  const g = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.startsAt)}/${icsDate(e.endsAt)}`, details, location, ctz: e.timezone });
  const o = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: e.startsAt.toISOString(), enddt: e.endsAt.toISOString(), body: details, location });
  return {
    google: `https://calendar.google.com/calendar/render?${g}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?${o}`,
  };
}
