// Formatting identical to the website: amounts in KZT (₸), dates in the event's time zone.
export const kzt = (n: number | null | undefined) =>
  n == null ? "—" : `${String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;

const KK_MONTHS = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"];

export function formatDate(
  d: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale = "ru-RU",
  timeZone = "Asia/Almaty",
) {
  if (!d) return "—";
  // Many Intl implementations (Chrome, Hermes) have no Kazakh month names and print "2026 M12 2".
  // For Kazakh use the unambiguous numeric form 02.12.2026, 19:00 instead.
  if (locale.startsWith("kk")) {
    const onlyMonth = opts.month && !opts.day && !opts.year && !opts.hour && !opts.dateStyle && !opts.timeStyle;
    const onlyDay = opts.day && !opts.month && !opts.year && !opts.hour && !opts.dateStyle && !opts.timeStyle;
    if (onlyMonth || onlyDay) {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric", month: "numeric" }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
      return onlyDay ? p.day : KK_MONTHS[Number(p.month) - 1];
    }
    const withTime = Boolean(opts.timeStyle || opts.hour);
    const withDate = Boolean(opts.dateStyle || opts.day || opts.month || opts.year || opts.weekday);
    opts = {
      ...(withDate ? { day: "2-digit", month: "2-digit", year: "numeric" } : {}),
      ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    } as Intl.DateTimeFormatOptions;
    if (!withDate && !withTime) opts = { day: "2-digit", month: "2-digit" };
    locale = "ru-RU";
  }
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(new Date(d));
  } catch {
    return new Date(d).toLocaleString();
  }
}

export const shortDate = (d: string, locale?: string, tz?: string) => formatDate(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, locale, tz);

/** "Starts in 3 days", "Today", "Ended" — used on ticket cards. */
export function relativeDay(startsAt: string, endsAt: string) {
  const now = Date.now();
  if (new Date(endsAt).getTime() < now) return "past";
  const days = Math.floor((new Date(startsAt).getTime() - now) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export const humanize = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

/** Seconds left until an ISO time, never negative. */
export const secondsUntil = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : 0);
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
