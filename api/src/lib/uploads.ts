import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { get, put } from "@vercel/blob";
import { config } from "./config.js";
import { badRequest } from "./http.js";

const TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/svg+xml": ".svg" };

// On Vercel the disk is temporary, so images go to Vercel Blob storage. Locally and in Docker they go to UPLOAD_DIR.
// A connected Vercel Blob store provides BLOB_STORE_ID (OIDC auth) or BLOB_READ_WRITE_TOKEN.
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
if (!useBlob) fs.mkdirSync(config.uploadDir, { recursive: true });

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest("Only JPG, PNG, WEBP or SVG images are allowed", "bad_image"));
  },
}).single("image");

/**
 * Image uploads (event covers, venue maps), max 5 MB.
 * After this middleware, `req.uploadedUrl` holds the public URL of the stored image.
 */
export function imageUpload(req: Request, res: Response, next: NextFunction) {
  parser(req, res, async (err?: unknown) => {
    if (err) return next(err instanceof multer.MulterError ? badRequest(err.message, "bad_image") : err);
    if (!req.file) return next();
    try {
      const name = `${crypto.randomBytes(12).toString("hex")}${TYPES[req.file.mimetype]}`;
      if (useBlob) {
        // Private store: images are served back through GET /api/uploads/:name (serveUpload).
        await put(`uploads/${name}`, req.file.buffer, { access: "private", contentType: req.file.mimetype });
        req.uploadedUrl = `/api/uploads/${name}`;
      } else {
        await fs.promises.writeFile(path.join(config.uploadDir, name), req.file.buffer);
        req.uploadedUrl = `/api/uploads/${name}`;
      }
      next();
    } catch (e) {
      next(e);
    }
  });
}

/** GET /api/uploads/:name — streams an uploaded image from Vercel Blob or the local upload folder. */
export async function serveUpload(req: Request, res: Response, next: NextFunction) {
  const name = path.basename(String(req.params.name));
  if (!/^[a-f0-9]{24}\.(jpg|png|webp|svg)$/.test(name)) return res.status(404).end();
  if (!useBlob) return res.sendFile(path.resolve(config.uploadDir, name), { maxAge: "7d" }, (err) => err && next());
  try {
    const result = await get(`uploads/${name}`, { access: "private" });
    if (!result || result.statusCode !== 200) return res.status(404).end();
    res.setHeader("Content-Type", result.blob.contentType);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    // SVG uploads must not run scripts when opened directly.
    if (name.endsWith(".svg")) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    Readable.fromWeb(result.stream as never).pipe(res);
  } catch (e) {
    next(e);
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      uploadedUrl?: string;
    }
  }
}
