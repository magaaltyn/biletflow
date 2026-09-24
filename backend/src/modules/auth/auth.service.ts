import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword, verifyPassword } from "../utils/password";
import { issueTokens, verifyRefreshToken, signAccessToken } from "../utils/jwt";
import { RegisterInput, LoginInput, AuthTokens } from "../types/auth.types";

const prisma = new PrismaClient();

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new AuthError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: input.role ?? UserRole.ATTENDEE,
    },
  });

  const tokens = issueTokens({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return { user: toPublicUser(user), tokens };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  // Same error for "no user" and "wrong password" — don't leak which one it was.
  if (!user) {
    throw new AuthError(401, "Invalid email or password");
  }

  const validPassword = await verifyPassword(input.password, user.passwordHash);
  if (!validPassword) {
    throw new AuthError(401, "Invalid email or password");
  }

  const tokens = issueTokens({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return { user: toPublicUser(user), tokens };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AuthError(401, "Invalid or expired refresh token");
  }

  // Re-fetch the user so a role change or deletion is reflected immediately,
  // rather than trusting stale claims baked into the old refresh token.
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AuthError(401, "User no longer exists");
  }

  const freshPayload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(freshPayload),
    refreshToken, // rotate here if you want single-use refresh tokens
  };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

// Never leak passwordHash back to the client.
function toPublicUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}) {
  const { id, email, firstName, lastName, phone, role, emailVerifiedAt, createdAt } = user;
  return { id, email, firstName, lastName, phone, role, emailVerifiedAt, createdAt };
}
