import { z } from "zod";
import { EventVisibility, SeatingType } from "@prisma/client";

const timeRangeRefinement = <T extends { startsAt: Date; endsAt: Date }>(
  data: T,
  ctx: z.RefinementCtx
) => {
  if (data.endsAt <= data.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    });
  }
};

export const createEventSchema = z
  .object({
    title: z.string().min(3).max(200),
    description: z.string().max(5000).optional(),
    category: z.string().max(100).optional(),
    images: z.array(z.string().url()).max(10).optional(),
    venueName: z.string().max(200).optional(),
    venueAddress: z.string().max(300).optional(),
    timezone: z.string().max(50).optional(), 
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    registrationOpensAt: z.coerce.date().optional(),
    registrationClosesAt: z.coerce.date().optional(),
    capacity: z.number().int().positive().max(1_000_000).optional(),
    visibility: z.nativeEnum(EventVisibility).optional(), 
    seatingType: z.nativeEnum(SeatingType).optional(), 
  })
  .superRefine(timeRangeRefinement);

export const updateEventSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    category: z.string().max(100).optional(),
    images: z.array(z.string().url()).max(10).optional(),
    venueName: z.string().max(200).optional(),
    venueAddress: z.string().max(300).optional(),
    timezone: z.string().max(50).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    registrationOpensAt: z.coerce.date().optional(),
    registrationClosesAt: z.coerce.date().optional(),
    capacity: z.number().int().positive().max(1_000_000).optional(),
    visibility: z.nativeEnum(EventVisibility).optional(),
    seatingType: z.nativeEnum(SeatingType).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startsAt && data.endsAt) {
      timeRangeRefinement({ startsAt: data.startsAt, endsAt: data.endsAt }, ctx);
    }
  });

export const eventIdParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
