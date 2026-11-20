// All settings come from environment variables (see .env.example).
function required(name: string, fallback?: string): string {
  const value = process.env[name]?.replace(/^﻿/, "").trim() || fallback;
  if (value === undefined || value === "") throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-only-jwt-secret"),
  qrSecret: required("QR_SECRET", isProd ? undefined : "dev-only-qr-secret"),
  // Public address of the website. The API is reached through the website at /api.
  webUrl: required("WEB_URL", "http://localhost:3000").replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  reservationMinutes: Number(process.env.RESERVATION_MINUTES ?? 10),
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 1025),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "BiletFlow <no-reply@biletflow.local>",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  // Halyk ePay test environment (https://epayment.kz/en-US/docs). Disabled unless HALYK_ENABLED=true.
  halyk: {
    enabled: process.env.HALYK_ENABLED === "true",
    clientId: process.env.HALYK_CLIENT_ID ?? "",
    clientSecret: process.env.HALYK_CLIENT_SECRET ?? "",
    terminal: process.env.HALYK_TERMINAL ?? "",
    oauthUrl: process.env.HALYK_OAUTH_URL ?? "https://test-epay-oauth.epayment.kz/oauth2/token",
    payformScript: process.env.HALYK_PAYFORM_SCRIPT ?? "https://test-epay.epayment.kz/payform/payment-api.js",
    statusUrl: process.env.HALYK_STATUS_URL ?? "https://testepay.homebank.kz/api/check-status/payment/transaction",
  },
};

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);
