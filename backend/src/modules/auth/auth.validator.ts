import { z } from "zod";
import { UserRole } from "@prisma/client";

// Only these two roles can be self-selected at signup.
// EVENT_ADMIN / PLATFORM_ADMIN must be granted internally, never via public register.
const SELF_ASSIGNABLE_ROLES = [UserRole.ATTENDEE, UserRole.ORGANIZER] as const;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"), // bcrypt limit
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().min(5).max(30).optional(),
  role: z.enum(SELF_ASSIGNABLE_ROLES).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterSchema = z.infer<typeof registerSchema>;
export type LoginSchema = z.infer<typeof loginSchema>;
