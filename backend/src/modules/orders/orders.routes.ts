import { Router } from "express";

export const ordersRouter = Router();

ordersRouter.get("/", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});
