"use client";
import { translate, useT } from "@/lib/i18n";

export function SkipLink() {
  useT();
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
      {translate("Skip to content")}
    </a>
  );
}
