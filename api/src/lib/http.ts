import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export const badRequest = (msg: string, code = "bad_request") => new HttpError(400, msg, code);
export const notFound = (what = "Not found") => new HttpError(404, what, "not_found");
export const forbidden = (msg = "You do not have access to this") => new HttpError(403, msg, "forbidden");
export const conflict = (msg: string, code = "conflict") => new HttpError(409, msg, code);

/** Parses and validates input with a zod schema; throws 400 with a readable message. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join(".");
    throw badRequest(field ? `${field}: ${issue.message}` : (issue?.message ?? "Invalid input"), "validation");
  }
  return result.data;
}

export const idParam = (req: Request, name = "id") => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === "23505") {
    res.status(409).json({ error: "This already exists", code: "duplicate", constraint: pgErr.constraint });
    return;
  }
  if (pgErr?.code === "23514") {
    res.status(409).json({ error: "Not enough tickets or seats left", code: "sold_out", constraint: pgErr.constraint });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side", code: "internal" });
}

// Common zod helpers
export const zDate = z.coerce.date();
export const zOptDate = z.union([z.coerce.date(), z.null()]).optional();
export const zMoney = z.coerce.number().int().min(0).max(100_000_000);
