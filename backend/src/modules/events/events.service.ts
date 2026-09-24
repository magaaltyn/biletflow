import { EventStatus, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { CreateEventInput, UpdateEventInput } from "./events.validator";

export class EventError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "EventError";
  }
}

interface RequestingUser {
  sub: string;
  role: UserRole;
}

export async function createEvent(organizerId: string, input: CreateEventInput) {
  return prisma.event.create({
    data: {
      organizerId,
      title: input.title,
      description: input.description,
      category: input.category,
      images: input.images ?? [],
      venueName: input.venueName,
      venueAddress: input.venueAddress,
      timezone: input.timezone, 
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      registrationOpensAt: input.registrationOpensAt,
      registrationClosesAt: input.registrationClosesAt,
      capacity: input.capacity,
      visibility: input.visibility,
      seatingType: input.seatingType,
  
    },
  });
}

export async function listMyEvents(organizerId: string) {
  return prisma.event.findMany({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getEventById(id: string, requester?: RequestingUser) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    throw new EventError(404, "Event not found");
  }

  const isPubliclyVisible = event.status === EventStatus.PUBLISHED && event.visibility === "PUBLIC";
  const isOwnerOrAdmin =
    requester &&
    (requester.sub === event.organizerId ||
      requester.role === UserRole.EVENT_ADMIN ||
      requester.role === UserRole.PLATFORM_ADMIN);

  if (!isPubliclyVisible && !isOwnerOrAdmin) {
    throw new EventError(404, "Event not found");
  }

  return event;
}

async function assertOwnership(eventId: string, requester: RequestingUser) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new EventError(404, "Event not found");
  }

  const isOwner = event.organizerId === requester.sub;
  const isAdmin =
    requester.role === UserRole.EVENT_ADMIN || requester.role === UserRole.PLATFORM_ADMIN;

  if (!isOwner && !isAdmin) {
    throw new EventError(403, "You do not have permission to modify this event");
  }

  return event;
}

export async function updateEvent(
  eventId: string,
  requester: RequestingUser,
  input: UpdateEventInput
) {
  await assertOwnership(eventId, requester);

  return prisma.event.update({
    where: { id: eventId },
    data: input,
  });
}

export async function publishEvent(eventId: string, requester: RequestingUser) {
  const event = await assertOwnership(eventId, requester);

  if (event.status === EventStatus.CANCELLED) {
    throw new EventError(409, "A cancelled event cannot be published");
  }

  if (!event.venueName || !event.capacity) {
    throw new EventError(
      422,
      "Event must have a venue and capacity set before it can be published"
    );
  }

  return prisma.event.update({
    where: { id: eventId },
    data: { status: EventStatus.PUBLISHED },
  });
}

export async function cancelEvent(eventId: string, requester: RequestingUser) {
  await assertOwnership(eventId, requester);

  return prisma.event.update({
    where: { id: eventId },
    data: { status: EventStatus.CANCELLED },
  });
}
