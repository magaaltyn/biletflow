import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { one } from "../db/pool.js";
import { config } from "./config.js";
import { HttpError, forbidden } from "./http.js";

export type Role = "attendee" | "organizer" | "platform_admin";
export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  email_verified_at: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const COOKIE = "bf_session";
const MAX_AGE_DAYS = 7;

export function signSession(userId: number) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${MAX_AGE_DAYS}d` });
}

export function setSessionCookie(res: Response, userId: number) {
  res.cookie(COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: MAX_AGE_DAYS * 86400_000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

/** Reads the session from the cookie (website) or the Authorization header (mobile app). */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.[COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
      const user = await one<AuthUser & { suspended_at: string | null }>(
        "SELECT id, email, full_name, role, email_verified_at, suspended_at FROM users WHERE id = $1",
        [Number(payload.sub)],
      );
      if (user && !user.suspended_at) req.user = user;
    } catch {
      /* invalid or expired token: treat as signed out */
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Please sign in", "unauthenticated");
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, "Please sign in", "unauthenticated");
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const me = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Please sign in", "unauthenticated");
  return req.user;
};
