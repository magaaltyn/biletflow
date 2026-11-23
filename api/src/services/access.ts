import type { AuthUser } from "../lib/auth.js";
import { type Db, one, pool } from "../db/pool.js";
import { forbidden, notFound } from "../lib/http.js";

export interface EventRow {
  id: number;
  organizer_id: number;
  venue_id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  image_url: string | null;
  starts_at: Date;
  ends_at: Date;
  visibility: "public" | "unlisted" | "private";
  private_token: string;
  status: "draft" | "published" | "cancelled";
  seating: "general" | "assigned";
  capacity: number;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  refund_policy: string;
  paid_sales_status: "inactive" | "active" | "suspended";
  suspended_at: Date | null;
}

export async function getEvent(id: number, db: Db = pool, lock = false) {
  const event = await one<EventRow>(`SELECT * FROM events WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id], db);
  if (!event) throw notFound("Event not found");
  return event;
}

/** Organizer who owns the event, or a Platform Admin (SRS 4.15, 4.16 authorization). */
export async function getManagedEvent(user: AuthUser, id: number, db: Db = pool, lock = false) {
  const event = await getEvent(id, db, lock);
  if (user.role !== "platform_admin" && event.organizer_id !== user.id) throw forbidden();
  return event;
}

/** Event Admin assigned to the event, its organizer, or a Platform Admin (SRS 4.8). */
export async function getCheckInEvent(user: AuthUser, id: number) {
  const event = await getEvent(id);
  if (user.role === "platform_admin" || event.organizer_id === user.id) return { event, canUndo: true };
  const staff = await one<{ can_undo: boolean }>(
    "SELECT can_undo FROM staff_assignments WHERE event_id = $1 AND user_id = $2",
    [id, user.id],
  );
  if (!staff) throw forbidden("You are not assigned to this event");
  return { event, canUndo: staff.can_undo };
}

/** Lifecycle label used by the organizer dashboard (SRS 4.16). */
export function lifecycle(e: Pick<EventRow, "status" | "starts_at" | "ends_at">) {
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "draft") return "draft";
  const now = Date.now();
  if (new Date(e.ends_at).getTime() < now) return "completed";
  if (new Date(e.starts_at).getTime() <= now) return "active";
  return "upcoming";
}
