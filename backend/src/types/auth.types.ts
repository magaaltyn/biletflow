import { UserRole } from "@prisma/client";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequestUser extends JwtPayload {}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
    }
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
