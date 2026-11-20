import nodemailer from "nodemailer";
import { type Db, one, pool } from "../db/pool.js";
import { config } from "./config.js";

const transport = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export async function sendEmail(to: string, subject: string, text: string, attachments?: { filename: string; content: Buffer }[]) {
  if (!transport) {
    console.log(`[email disabled] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text, attachments });
  } catch (err) {
    // Email problems must never break a checkout or a check-in.
    console.error("email failed", err);
  }
}

/**
 * Creates an in-app notification and (optionally) emails it (SRS 4.10).
 * Email is sent after the caller's transaction, so pass `db` only for the insert.
 */
export async function notify(
  userId: number,
  n: { kind: string; title: string; body?: string; link?: string; email?: boolean },
  db: Db = pool,
) {
  await db.query("INSERT INTO notifications (user_id, kind, title, body, link) VALUES ($1, $2, $3, $4, $5)", [
    userId,
    n.kind,
    n.title,
    n.body ?? "",
    n.link ?? null,
  ]);
  if (n.email !== false) {
    const user = await one<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
    if (user) {
      const link = n.link ? `\n\n${config.webUrl}${n.link}` : "";
      void sendEmail(user.email, n.title, `${n.body ?? ""}${link}\n\n— BiletFlow`);
    }
  }
}
