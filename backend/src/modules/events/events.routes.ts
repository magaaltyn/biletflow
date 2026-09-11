import { Router } from "express";
import { listPublishedEvents } from "./events.service";

export const eventsRouter = Router();

eventsRouter.get("/", async (_req, res, next) => {
  try {
    const events = await listPublishedEvents();
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

eventsRouter.post("/", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});
