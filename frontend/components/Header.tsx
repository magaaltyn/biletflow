"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, formatDate } from "@/lib/api";
import { LANGS, translate, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#1d4ed8" />
        <path d="M9 9h9.5a4.5 4.5 0 0 1 1.6 8.7A4.7 4.7 0 0 1 18.8 26H9z" fill="#fff" />
        <circle cx="9" cy="17.5" r="2.4" fill="#1d4ed8" />
      </svg>
      BiletFlow
    </Link>
  );
}

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const [data, setData] = useState<{ items: any[]; unread: number }>({ items: [], unread: 0 });
  const ref = useClickOutside(() => setOpen(false));
  const load = () => api("/notifications").then(setData).catch(() => undefined);
  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000); // lightweight polling, no WebSockets (SRS 4.13)
    return () => clearInterval(id);
  }, []);
  const toggle = async () => {
    setOpen(!open);
    if (!open && data.unread) {
      await api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
      setData((d) => ({ ...d, unread: 0 }));
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative rounded-full p-2 hover:bg-slate-100" aria-label={`${translate("Notifications")}${data.unread ? `, ${data.unread} ${translate("unread")}` : ""}`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-red-500" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-xl">
          {data.items.length === 0 && <p className="p-4 text-center text-sm text-muted">{t("noNotifications")}</p>}
          {data.items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} className="block rounded-lg p-3 hover:bg-slate-50">
              <p className="text-sm font-semibold">{n.title}</p>
              {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>}
              <p className="mt-1 text-[11px] text-slate-400">{formatDate(n.created_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, logout } = useSession();
  const { t, lang, setLang } = useT();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  const ref = useClickOutside(() => setMenu(false));
  useEffect(() => {
    setMobile(false);
    setMenu(false);
  }, [pathname]);

  const nav = [
    { href: "/events", label: t("events") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/pricing", label: t("pricing") },
  ];
  const accountLinks = [
    { href: "/orders", label: t("myOrders"), show: true },
    { href: "/support", label: t("support"), show: true },
    { href: "/organizer", label: t("dashboard"), show: user?.role === "organizer" || user?.role === "platform_admin" },
    { href: "/checkin", label: t("checkin"), show: Boolean(user?.is_event_admin || user?.role !== "attendee") },
    { href: "/admin", label: t("admin"), show: user?.role === "platform_admin" },
    { href: "/account", label: t("account"), show: true },
  ].filter((l) => l.show);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden gap-5 text-sm font-medium text-slate-600 lg:flex" aria-label={t("mainNavigation")}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={cx("hover:text-ink", pathname.startsWith(n.href) && "text-brand")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <select aria-label={t("language")} value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} className="rounded-md border-0 bg-transparent text-xs font-semibold text-slate-600">
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code.toUpperCase()} · KZT
              </option>
            ))}
          </select>
          <ThemeToggle />
          {user ? (
            <>
              <Bell />
              <div className="relative" ref={ref}>
                <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm font-semibold hover:bg-slate-50" aria-expanded={menu}>
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand text-xs text-on-brand">{user.full_name.slice(0, 1).toUpperCase()}</span>
                  <span className="hidden max-w-32 truncate sm:inline">{user.full_name.split(" ")[0]}</span>
                </button>
                {menu && (
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-white p-1 shadow-xl">
                    <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
                    {accountLinks.map((l) => (
                      <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                        {l.label}
                      </Link>
                    ))}
                    <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                      {t("logout")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100 sm:inline-block">
                {t("login")}
              </Link>
              <Link href="/register" className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-on-brand hover:bg-brand-dark">
                {t("signup")}
              </Link>
            </>
          )}
          <button className="rounded-md p-2 lg:hidden" onClick={() => setMobile(!mobile)} aria-label={t("menu")} aria-expanded={mobile}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
      {mobile && (
        <nav className="border-t border-line bg-white px-4 py-2 lg:hidden" aria-label={t("mobileNavigation")}>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="block py-2 text-sm font-medium">
              {n.label}
            </Link>
          ))}
          {!user && (
            <Link href="/login" className="block py-2 text-sm font-medium">
              {t("login")}
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { t } = useT();
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3">{t("footerTagline")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/events">{t("events")}</Link>
          <Link href="/pricing">{t("pricing")}</Link>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/support">{t("support")}</Link>
          <Link href="/terms">{t("terms")}</Link>
          <Link href="/privacy">{t("privacy")}</Link>
          <p>© {new Date().getFullYear()} BiletFlow</p>
        </div>
      </div>
    </footer>
  );
}
