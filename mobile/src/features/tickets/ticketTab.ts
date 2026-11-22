import type { MyTicket } from "@/lib/types";

export type TicketTab = "upcoming" | "past" | "cancelled" | "refunded";

/** Which list a ticket belongs to. Cancelled/refunded win over the date. */
export function ticketTab(t: Pick<MyTicket, "status" | "ends_at">, now = Date.now()): TicketTab {
  if (t.status === "cancelled") return "cancelled";
  if (t.status === "refunded") return "refunded";
  return new Date(t.ends_at).getTime() < now ? "past" : "upcoming";
}
