// Accounts (SRS 4.1): email + password, email verification, password reset, Google sign-in.
import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { one, q } from "../db/pool.js";
import { clearSessionCookie, me, requireAuth, setSessionCookie, signSession } from "../lib/auth.js";
import { opaqueToken, sha256 } from "../lib/codes.js";
import { config, googleEnabled } from "../lib/config.js";
import { HttpError, badRequest, conflict, parse } from "../lib/http.js";
import { sendEmail } from "../lib/notify.js";

export const authRouter = Router();

const password = z.string().min(8, "must be at least 8 characters").max(100);
const email = z.string().trim().toLowerCase().email();

async function publicUser(id: number) {
  return one(
    `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.email_verified_at IS NOT NULL AS email_verified,
            u.password_hash IS NOT NULL AS has_password, u.google_id IS NOT NULL AS google_linked,
            p.display_name AS organizer_name, p.identity_status,
            EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = u.id) AS is_event_admin
       FROM users u LEFT JOIN organizer_profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [id],
  );
}

function sendVerification(user: { id: number; email: string }) {
  const token = jwt.sign({ sub: String(user.id), purpose: "verify", email: user.email }, config.jwtSecret, { expiresIn: "48h" });
  return sendEmail(user.email, "Confirm your BiletFlow email", `Confirm your email address:\n\n${config.webUrl}/verify-email?token=${token}\n\nThe link is valid for 48 hours.`);
}

authRouter.get("/config", (_req, res) => {
  res.json({ googleEnabled: googleEnabled(), halykEnabled: config.halyk.enabled, halykScript: config.halyk.enabled ? config.halyk.payformScript : null });
});

authRouter.post("/register", async (req, res) => {
  const body = parse(
    // Everyone signs up as an attendee. Only a platform admin can make an account an organizer (POST /api/admin/users/:id/role).
    z.object({ email, password, fullName: z.string().trim().min(2).max(100) }),
    req.body,
  );
  const exists = await one("SELECT 1 FROM users WHERE email = $1", [body.email]);
  if (exists) throw conflict("An account with this email already exists", "email_taken");
  const hash = await bcrypt.hash(body.password, 10);
  const user = (await one<{ id: number; email: string }>(
    "INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'attendee') RETURNING id, email",
    [body.email, hash, body.fullName],
  ))!;
  await sendVerification(user);
  setSessionCookie(res, user.id);
  res.status(201).json({ user: await publicUser(user.id), token: signSession(user.id) });
});

authRouter.post("/login", async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1) }), req.body);
  const user = await one<{ id: number; password_hash: string | null; suspended_at: string | null }>(
    "SELECT id, password_hash, suspended_at FROM users WHERE email = $1",
    [body.email],
  );
  const ok = user?.password_hash ? await bcrypt.compare(body.password, user.password_hash) : false;
  if (!user || !ok) throw new HttpError(401, "Wrong email or password", "bad_credentials");
  if (user.suspended_at) throw new HttpError(403, "This account is suspended. Contact support.", "suspended");
  setSessionCookie(res, user.id);
  // `token` is used by the mobile scanner app (Authorization: Bearer)
  res.json({ user: await publicUser(user.id), token: signSession(user.id) });
});

/** Mobile app: exchanges a still-valid token for a fresh 7-day token (sliding session). */
authRouter.post("/refresh", requireAuth, async (req, res) => {
  res.json({ user: await publicUser(me(req).id), token: signSession(me(req).id) });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  res.json({ user: req.user ? await publicUser(req.user.id) : null });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const body = parse(z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().max(30).nullable().optional() }), req.body);
  await q("UPDATE users SET full_name = $2, phone = $3 WHERE id = $1", [me(req).id, body.fullName, body.phone ?? null]);
  res.json({ user: await publicUser(me(req).id) });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().optional(), newPassword: password }), req.body);
  const u = await one<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [me(req).id]);
  if (u?.password_hash && !(await bcrypt.compare(body.currentPassword ?? "", u.password_hash))) throw badRequest("Current password is wrong", "bad_credentials");
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [me(req).id, await bcrypt.hash(body.newPassword, 10)]);
  res.json({ ok: true });
});

authRouter.post("/verify-email", async (req, res) => {
  const { token } = parse(z.object({ token: z.string() }), req.body);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string; purpose: string; email: string };
    if (payload.purpose !== "verify") throw new Error();
    await q("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 AND email = $2", [Number(payload.sub), payload.email]);
    res.json({ ok: true });
  } catch {
    throw badRequest("This confirmation link is invalid or has expired", "token_invalid");
  }
});

authRouter.post("/resend-verification", requireAuth, async (req, res) => {
  await sendVerification(me(req));
  res.json({ ok: true });
});

authRouter.post("/forgot-password", async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = await one<{ id: number; email: string }>("SELECT id, email FROM users WHERE email = $1", [body.email]);
  if (user) {
    const token = opaqueToken();
    await q("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')", [sha256(token), user.id]);
    await sendEmail(user.email, "Reset your BiletFlow password", `Set a new password:\n\n${config.webUrl}/reset-password?token=${token}\n\nThe link is valid for 1 hour. If you did not ask for this, ignore this email.`);
  }
  // Same answer whether or not the account exists, so emails cannot be probed.
  res.json({ ok: true });
});

authRouter.post("/reset-password", async (req, res) => {
  const body = parse(z.object({ token: z.string(), password }), req.body);
  const reset = await one<{ user_id: number }>(
    "UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
    [sha256(body.token)],
  );
  if (!reset) throw badRequest("This reset link is invalid or has expired", "token_invalid");
  await q("UPDATE users SET password_hash = $2 WHERE id = $1", [reset.user_id, await bcrypt.hash(body.password, 10)]);
  res.json({ ok: true });
});

// ---------- Google sign-in (OAuth 2.0 authorization code flow) ----------
const redirectUri = () => `${config.webUrl}/api/auth/google/callback`;
const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");

authRouter.get("/google", (req, res) => {
  if (!googleEnabled()) throw badRequest("Google sign-in is not configured on this server", "google_disabled");
  const state = jwt.sign({ next: safeNext(req.query.next), n: opaqueToken() }, config.jwtSecret, { expiresIn: "10m" });
  res.cookie("bf_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 600_000, path: "/" });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get("/google/callback", async (req, res) => {
  const fail = (reason: string) => res.redirect(`${config.webUrl}/login?error=${encodeURIComponent(reason)}`);
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state || state !== req.cookies?.bf_oauth_state) return fail("google_state");
  res.clearCookie("bf_oauth_state", { path: "/" });
  let next = "/";
  try {
    next = safeNext((jwt.verify(state, config.jwtSecret) as { next: string }).next);
  } catch {
    return fail("google_state");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return fail("google_token");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) return fail("google_profile");
  const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
  if (!info.email || !info.email_verified) return fail("google_email_unverified");

  const emailLower = info.email.toLowerCase();
  let user = await one<{ id: number; suspended_at: string | null }>("SELECT id, suspended_at FROM users WHERE google_id = $1", [info.sub]);
  if (!user) {
    // Link to an existing account with the same (Google-verified) email, or create a new attendee.
    user = await one(
      `INSERT INTO users (email, full_name, google_id, email_verified_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (email) DO UPDATE SET google_id = EXCLUDED.google_id, email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id, suspended_at`,
      [emailLower, info.name || emailLower.split("@")[0], info.sub],
    );
  }
  if (!user || user.suspended_at) return fail("suspended");
  setSessionCookie(res, user.id);
  res.redirect(`${config.webUrl}${next}`);
});
