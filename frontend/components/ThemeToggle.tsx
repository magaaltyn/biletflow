"use client";
// Light / night / system theme switch. The choice is remembered in this browser only.
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { THEME_KEY as KEY } from "@/lib/theme";

export type ThemeMode = "light" | "dark" | "system";

function apply(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>("system");
  useEffect(() => {
    let saved: ThemeMode = "system";
    try {
      saved = (localStorage.getItem(KEY) as ThemeMode | null) ?? "system";
    } catch {
      /* storage blocked */
    }
    setModeState(saved);
    apply(saved);
  }, []);
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
  const setMode = (m: ThemeMode) => {
    setModeState(m);
    apply(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* storage blocked */
    }
  };
  return { mode, setMode };
}

const Sun = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** Header button: switches between light and night. "Match system" is available on the profile page. */
export function ThemeToggle() {
  const { t } = useT();
  const { setMode } = useTheme();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const label = dark ? t("themeLight") : t("themeDark");
  return (
    <button onClick={() => setMode(dark ? "light" : "dark")} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label={label} title={label}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
