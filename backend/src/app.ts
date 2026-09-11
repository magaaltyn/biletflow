import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { authRouter } from "./modules/auth/auth.routes";
import { eventsRouter } from "./modules/events/events.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { ticketsRouter } from "./modules/tickets/tickets.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/events", eventsRouter);
app.use("/api/v1/tickets", ticketsRouter);
app.use("/api/v1/orders", ordersRouter);

app.use(notFound);
app.use(errorHandler);
