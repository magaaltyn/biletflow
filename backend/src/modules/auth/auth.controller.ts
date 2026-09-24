import { Request, Response, NextFunction } from "express";
import { registerSchema, loginSchema, refreshSchema } from "../validators/auth.validator";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  getUserById,
  AuthError,
} from "../services/auth.service";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerSchema.parse(req.body);
    const { user, tokens } = await registerUser(parsed);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.parse(req.body);
    const { user, tokens } = await loginUser(parsed);
    res.status(200).json({ user, ...tokens });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await refreshAccessToken(refreshToken);
    res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    // req.user is populated by the `authenticate` middleware
    const user = await getUserById(req.user!.sub);
    if (!user) {
      throw new AuthError(404, "User not found");
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
