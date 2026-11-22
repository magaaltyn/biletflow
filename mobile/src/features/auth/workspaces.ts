import type { User } from "@/lib/types";

export type Workspace = "attendee" | "organizer" | "staff" | "admin";

/** Workspaces a user may open. Authorization is still enforced by the server on every request. */
export function workspacesFor(user: User | null): Workspace[] {
  if (!user) return ["attendee"];
  const list: Workspace[] = ["attendee"];
  if (user.role === "organizer") list.push("organizer");
  if (user.is_event_admin || user.role === "organizer" || user.role === "platform_admin") list.push("staff");
  if (user.role === "platform_admin") list.push("admin");
  return list;
}
