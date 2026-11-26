"use client";
// Interactive seat map (SRS 4.3.1). Seat states are shown with colour AND shape, every seat has an accessible label,
// and a list-based picker offers the same choice without the map.
import { useMemo, useState } from "react";
import { kzt } from "@/lib/api";
import { translate, useT } from "@/lib/i18n";
import { Button, Select } from "./ui";

export interface Seat {
  id: number;
  section: string;
  row: string;
  number: number;
  accessible: boolean;
  x: number;
  y: number;
  status: "available" | "held" | "sold" | "unavailable";
}

export interface SeatMapData {
  seats: Seat[];
  priceBySection: Record<string, { ticketTypeId: number; name: string; price: number }>;
  width: number;
  height: number;
}

const COLORS = { available: "#16a34a", premium: "#0d9488", selected: "#1d4ed8", held: "#f59e0b", sold: "#94a3b8", unavailable: "#e2e8f0" };
// Theme-aware colours for the map background, stage, labels and empty seats.
const THEME = { surface: "var(--color-white)", subtle: "var(--color-slate-100)", outline: "var(--color-slate-300)", stage: "var(--color-slate-300)", label: "var(--color-slate-700)", empty: "var(--color-slate-200)" };

function SeatShape({ seat, selected, onToggle, label }: { seat: Seat; selected: boolean; onToggle: () => void; label: string }) {
  const x = seat.x + 6;
  const y = seat.y + 6;
  const clickable = seat.status === "available";
  const common = {
    role: clickable ? "button" : "img",
    tabIndex: clickable ? 0 : -1,
    "aria-label": label,
    "aria-pressed": clickable ? selected : undefined,
    onClick: clickable ? onToggle : undefined,
    onKeyDown: clickable ? (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle()) : undefined,
    style: { cursor: clickable ? "pointer" : "default" },
  } as const;
  if (selected)
    return (
      <g {...common}>
        <title>{label}</title>
        <circle cx={x} cy={y} r={7.5} fill={COLORS.selected} />
        <path d={`M${x - 3.5} ${y} l2.5 2.5 l4.5 -5`} stroke="#fff" strokeWidth={1.8} fill="none" />
      </g>
    );
  if (seat.status === "sold")
    return (
      <g {...common}>
        <title>{label}</title>
        <circle cx={x} cy={y} r={6.5} fill={COLORS.sold} />
        <path d={`M${x - 3} ${y - 3} l6 6 M${x + 3} ${y - 3} l-6 6`} stroke="#fff" strokeWidth={1.5} />
      </g>
    );
  if (seat.status === "held")
    return (
      <g {...common}>
        <title>{label}</title>
        <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill={COLORS.held} />
        <circle cx={x} cy={y} r={2} fill="#fff" />
      </g>
    );
  if (seat.status === "unavailable")
    return (
      <g {...common}>
        <title>{label}</title>
        <circle cx={x} cy={y} r={6} style={{ fill: THEME.surface, stroke: THEME.empty }} strokeWidth={1.5} />
      </g>
    );
  return (
    <g {...common} className="transition hover:opacity-70 focus:outline-none [&:focus>*]:stroke-blue-700 [&:focus>*]:stroke-2">
      <title>{label}</title>
      {seat.accessible ? (
        <rect x={x - 7} y={y - 7} width={14} height={14} transform={`rotate(45 ${x} ${y})`} fill={COLORS.available} />
      ) : (
        <circle cx={x} cy={y} r={6.5} fill={COLORS.available} />
      )}
    </g>
  );
}

export function SeatMap({ data, selected, onChange, maxSeats = 6 }: { data: SeatMapData; selected: number[]; onChange: (ids: number[]) => void; maxSeats?: number }) {
  const { t } = useT();
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [warn, setWarn] = useState<string | null>(null);

  const sections = useMemo(() => {
    const m = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const s of data.seats) {
      const b = m.get(s.section) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      m.set(s.section, { minX: Math.min(b.minX, s.x), minY: Math.min(b.minY, s.y), maxX: Math.max(b.maxX, s.x), maxY: Math.max(b.maxY, s.y) });
    }
    return [...m.entries()];
  }, [data.seats]);

  const label = (s: Seat) => {
    const price = data.priceBySection[s.section];
    const state = selected.includes(s.id) ? t("selected") : t(s.status === "held" ? "held" : s.status);
    return `${t("section")} ${s.section}, ${t("row")} ${s.row}, ${t("seat")} ${s.number}${s.accessible ? `, ${t("accessible")}` : ""} — ${state}${price ? `, ${kzt(price.price)}` : ""}`;
  };

  const toggle = (id: number) => {
    setWarn(null);
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length >= maxSeats) setWarn(`Max ${maxSeats} seats per order`);
    else onChange([...selected, id]);
  };

  const legend: [string, React.ReactNode][] = [
    [t("available"), <circle key="a" cx="8" cy="8" r="6" fill={COLORS.available} />],
    [t("selected"), <circle key="s" cx="8" cy="8" r="6" fill={COLORS.selected} />],
    [t("held"), <rect key="h" x="2" y="2" width="12" height="12" rx="2" fill={COLORS.held} />],
    [t("sold"), <g key="so"><circle cx="8" cy="8" r="6" fill={COLORS.sold} /><path d="M5 5l6 6M11 5l-6 6" stroke="#fff" strokeWidth="1.5" /></g>],
    [t("unavailable"), <circle key="u" cx="8" cy="8" r="5.5" style={{ fill: THEME.surface, stroke: THEME.empty }} strokeWidth="1.5" />],
    [t("accessible"), <rect key="ac" x="3" y="3" width="10" height="10" transform="rotate(45 8 8)" fill={COLORS.available} />],
  ];

  // List picker (same choices without the map)
  const [ls, setLs] = useState("");
  const [lr, setLr] = useState("");
  const listRows = [...new Set(data.seats.filter((s) => s.section === ls).map((s) => s.row))];
  const listSeats = data.seats.filter((s) => s.section === ls && s.row === lr && s.status === "available");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        {legend.map(([name, icon]) => (
          <span key={name} className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>{icon}</svg>
            {name}
          </span>
        ))}
        <span className="ml-auto flex gap-1">
          <Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => setMode(mode === "map" ? "list" : "map")}>
            {translate(mode === "map" ? "List view" : "Map view")}
          </Button>
          {mode === "map" && (
            <>
              <Button variant="secondary" className="min-h-8 px-2.5 py-1" aria-label={translate("Zoom out")} onClick={() => setZoom(Math.max(1, zoom - 0.5))}>−</Button>
              <Button variant="secondary" className="min-h-8 px-2.5 py-1" aria-label={translate("Zoom in")} onClick={() => setZoom(Math.min(3, zoom + 0.5))}>+</Button>
            </>
          )}
        </span>
      </div>
      {warn && <p className="mb-2 text-sm text-amber-700">{warn}</p>}
      {mode === "map" ? (
        <div className="overflow-auto rounded-xl border border-line bg-slate-50" style={{ maxHeight: 560 }}>
          <svg viewBox={`0 0 ${data.width} ${data.height}`} style={{ width: `${zoom * 100}%`, minWidth: 600 }} role="group" aria-label={translate("Seat map")}>
            <rect x={data.width / 2 - 200} y={40} width={400} height={70} rx={10} style={{ fill: THEME.stage }} />
            <text x={data.width / 2} y={83} textAnchor="middle" fontSize={22} fontWeight={700} style={{ fill: THEME.label }}>STAGE · СЦЕНА</text>
            {sections.map(([code, b]) => {
              const price = data.priceBySection[code];
              return (
                <g key={code}>
                  <rect x={b.minX - 6} y={b.minY - 30} width={b.maxX - b.minX + 24} height={b.maxY - b.minY + 42} rx={10} style={{ fill: price ? THEME.surface : THEME.subtle, stroke: THEME.outline }} />
                  <text x={(b.minX + b.maxX) / 2 + 6} y={b.minY - 12} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: THEME.label }}>
                    {code}
                    {price ? ` · ${kzt(price.price)}` : ""}
                  </text>
                </g>
              );
            })}
            {data.seats.map((s) => (
              <SeatShape key={s.id} seat={s} selected={selected.includes(s.id)} onToggle={() => toggle(s.id)} label={label(s)} />
            ))}
          </svg>
        </div>
      ) : (
        <div className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-3">
          <Select aria-label={t("section")} value={ls} onChange={(e) => { setLs(e.target.value); setLr(""); }}>
            <option value="">{t("section")}</option>
            {sections.map(([code]) => (
              <option key={code} value={code} disabled={!data.priceBySection[code]}>
                {code} {data.priceBySection[code] ? `· ${kzt(data.priceBySection[code].price)}` : `· ${t("unavailable")}`}
              </option>
            ))}
          </Select>
          <Select aria-label={t("row")} value={lr} onChange={(e) => setLr(e.target.value)} disabled={!ls}>
            <option value="">{t("row")}</option>
            {listRows.map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Select aria-label={t("seat")} value="" onChange={(e) => e.target.value && toggle(Number(e.target.value))} disabled={!lr}>
            <option value="">{t("seat")} ({listSeats.length} {t("available").toLowerCase()})</option>
            {listSeats.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}{s.accessible ? ` (${t("accessible")})` : ""}{selected.includes(s.id) ? " ✓" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
