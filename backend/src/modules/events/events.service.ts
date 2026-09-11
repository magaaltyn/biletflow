import { prisma } from "../../config/prisma";

export function listPublishedEvents() {
  return prisma.event.findMany({
    where: { status: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: { startsAt: "asc" },
  });
}
