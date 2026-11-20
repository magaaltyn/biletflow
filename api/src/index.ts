import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { pool } from "./db/pool.js";
import { loadUser } from "./lib/auth.js";
import { config } from "./lib/config.js";
import { errorHandler } from "./lib/http.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { checkinRouter } from "./routes/checkin.js";
import { eventsRouter, venuesRouter } from "./routes/events.js";
import { ordersRouter, paymentsRouter, ticketsRouter } from "./routes/orders.js";
import { organizerRouter } from "./routes/organizer.js";
import { notificationsRouter, supportRouter } from "./routes/support.js";
import { releaseExpiredReservations } from "./services/orders.js";

export const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(loadUser);

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

app.use("/api/uploads", express.static(path.resolve(config.uploadDir), { maxAge: "7d" }));
app.use("/api/auth", authRouter);
app.use("/api/events", eventsRouter);
app.use("/api/venues", venuesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/organizer", organizerRouter);
app.use("/api/checkin", checkinRouter);
app.use("/api/support", supportRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin", adminRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found", code: "not_found" });
});
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => console.log(`BiletFlow API on http://localhost:${config.port}`));
  // Release seats and tickets from checkouts that were abandoned (SRS 4.3.1, 4.6).
  setInterval(() => {
    releaseExpiredReservations().catch((err) => console.error("reservation sweep failed", err));
  }, 60_000);
}
