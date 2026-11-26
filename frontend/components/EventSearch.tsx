"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {useT, translate} from "@/lib/i18n";
import { Button, Input, Select } from "./ui";

export interface Filters {
  search?: string;
  city?: string;
  category?: string;
  when?: string;
  free?: string;
}

export function dateRange(when?: string) {
  const now = new Date();
  const end = new Date(now);
  if (when === "week") end.setDate(now.getDate() + 7);
  else if (when === "month") end.setMonth(now.getMonth() + 1);
  else return {};
  return { from: now.toISOString(), to: end.toISOString() };
}

export function EventSearch({ initial = {}, compact = false }: { initial?: Filters; compact?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [f, setF] = useState<Filters>(initial);
  const [opts, setOpts] = useState<{ cities: string[]; categories: string[] }>({ cities: [], categories: [] });
  useEffect(() => {
    api("/events/filters").then(setOpts).catch(() => undefined);
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    router.push(`/events?${p}`);
  };
  return (
    <form onSubmit={submit} className={`grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm ${compact ? "md:grid-cols-6" : "md:grid-cols-6"}`} role="search">
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="q">{t("search")}</label>
        <Input id="q" placeholder={t("searchPlaceholder")} value={f.search ?? ""} onChange={(e) => setF({ ...f, search: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="city">{t("city")}</label>
        <Select id="city" value={f.city ?? ""} onChange={(e) => setF({ ...f, city: e.target.value })}>
          <option value="">{t("allCities")}</option>
          {opts.cities.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="cat">{t("category")}</label>
        <Select id="cat" value={f.category ?? ""} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">{t("allCategories")}</option>
          {opts.categories.map((c) => <option key={c} value={c}>{translate(c)}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="when">{t("date")}</label>
        <Select id="when" value={f.when ?? ""} onChange={(e) => setF({ ...f, when: e.target.value })}>
          <option value="">{t("anyDate")}</option>
          <option value="week">{translate('7 days')}</option>
          <option value="month">{translate('30 days')}</option>
        </Select>
      </div>
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-1.5 whitespace-nowrap pb-2 text-sm">
          <input type="checkbox" checked={f.free === "true"} onChange={(e) => setF({ ...f, free: e.target.checked ? "true" : "" })} />
          {t("freeOnly")}
        </label>
        <Button type="submit" className="flex-1">{t("search")}</Button>
      </div>
    </form>
  );
}
