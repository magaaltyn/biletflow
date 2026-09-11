import { Router } from "express";

export const authRouter = Router();

authRouter.post("/register", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

authRouter.post("/login", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

authRouter.post("/logout", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

authRouter.post("/reset-password", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});
