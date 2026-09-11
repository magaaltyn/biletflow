import { Router } from "express";

export const ticketsRouter = Router();

ticketsRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});
