// Notification and email links are website paths (e.g. "/orders/12"). This maps them to the matching app screen.
export function appRouteForWebPath(link: string | null | undefined): string | null {
  if (!link) return null;
  const path = link.split("?")[0];
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/orders\/(\d+)$/))) return `/order/${m[1]}`;
  if ((m = path.match(/^\/events\/([^/]+)$/))) return `/event/${m[1]}`;
  if ((m = path.match(/^\/support\/(\d+)$/))) return `/support/${m[1]}`;
  if ((m = path.match(/^\/organizer\/events\/(\d+)$/))) return `/org-event/${m[1]}`;
  if ((m = path.match(/^\/checkin\/(\d+)$/))) return `/scan/${m[1]}`;
  if ((m = path.match(/^\/c\/([\w-]+)$/))) return `/c/${m[1]}`;
  if ((m = path.match(/^\/pay\/(\d+)$/))) return `/pay/${m[1]}`;
  if (path.startsWith("/organizer")) return "/dashboard";
  if (path.startsWith("/admin")) return "/admin";
  if (path === "/orders") return "/orders";
  return null;
}

/** Extracts a Campaign QR token from "https://…/c/<token>" (or a bare token). */
export function campaignTokenFrom(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/c\/([\w-]+)\/?$/);
  if (m) return m[1];
  return /^[\w-]{16,}$/.test(t) ? t : null;
}
