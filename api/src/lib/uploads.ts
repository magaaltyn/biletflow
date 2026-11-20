import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "./config.js";
import { badRequest } from "./http.js";

fs.mkdirSync(config.uploadDir, { recursive: true });

const TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/svg+xml": ".svg" };

/** Image uploads (event covers, venue maps, section view photos), max 5 MB. */
export const imageUpload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(12).toString("hex")}${TYPES[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[file.mimetype]) cb(null, true);
    else cb(badRequest("Only JPG, PNG, WEBP or SVG images are allowed", "bad_image"));
  },
}).single("image");

export const publicUrl = (filename: string) => `/api/uploads/${path.basename(filename)}`;
