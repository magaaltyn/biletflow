"use client";
// Stadium seat picker (SRS 4.3.1): rings of sectors drawn in 2D or rotatable 3D, a seat grid for the chosen
// sector and a "Your seats" panel. Sector shapes come from venue.layout; seats and availability come from the API.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, kzt } from "@/lib/api";
import { useT } from "@/lib/i18n";

export interface StadiumLayout {
  type: "stadium";
  width: number;
  height: number;
  stands: Record<string, { name: string; color: string }>;
  rings: { tier: string; n: number; a: number; b: number; h: number; z: number; rake: number; start: number; rows: number; seats: number }[];
  sectors: { code: string; ring: number; index: number; side: string; tier: string }[];
}

interface Summary {
  sections: { section: string; total: number; available: number }[];
  priceBySection: Record<string, { ticketTypeId: number; name: string; price: number }>;
}

interface Seat {
  id: number;
  section: string;
  row: string;
  number: number;
  accessible: boolean;
  status: "available" | "held" | "sold" | "unavailable";
}

export interface PickedSeat {
  id: number;
  sector: string;
  row: number;
  seat: number;
  price: number;
  color: string;
  sub: string;
}

const MAX_SEATS = 8;
const STAGE_BG = "#0C1838";
const ARIA_TIER: Record<string, string> = { lower: "Lower tier", upper: "Upper tier" };

const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

function useGeometry(layout: StadiumLayout) {
  return useMemo(() => {
    const cx = layout.width / 2;
    const cy = layout.height / 2;
    const gap = 3;
    const pt = (a: number, b: number, t: number) => [cx + a * Math.cos(t), cy + b * Math.sin(t)];
    const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    return layout.sectors.map((s) => {
      const r = layout.rings[s.ring];
      const t0 = -Math.PI / 2 + (2 * Math.PI * s.index) / r.n;
      const t1 = -Math.PI / 2 + (2 * Math.PI * (s.index + 1)) / r.n;
      const tm = (t0 + t1) / 2;
      const wIn = dist(pt(r.a, r.b, t0), pt(r.a, r.b, t1)) - gap;
      const wOut = dist(pt(r.a + r.h, r.b + r.h, t0), pt(r.a + r.h, r.b + r.h, t1)) - gap;
      const p = pt(r.a, r.b, tm);
      const phi = (Math.atan2(r.b * Math.cos(tm), -r.a * Math.sin(tm)) * 180) / Math.PI;
      const nphi = ((phi % 360) + 360) % 360;
      return {
        ...s,
        rows: r.rows,
        seats: r.seats,
        left: p[0] - wOut / 2,
        top: p[1] - r.h,
        w: wOut,
        h: r.h,
        k: ((wOut - wIn) / 2 / wOut) * 100,
        phi,
        z: r.z,
        rake: r.rake,
        flip: nphi > 90 && nphi < 270,
      };
    });
  }, [layout]);
}

export function StadiumPicker({
  eventId,
  query,
  layout,
  selected,
  onChange,
  refreshKey,
  disabled,
  children,
}: {
  eventId: number;
  query: string;
  layout: StadiumLayout;
  selected: number[];
  onChange: (ids: number[]) => void;
  refreshKey: number;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useT();
  const geo = useGeometry(layout);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [seats, setSeats] = useState<Record<string, Seat[]>>({});
  const [picked, setPicked] = useState<Record<number, PickedSeat>>({});
  const [is3d, setIs3d] = useState(true);
  const [rotZ, setRotZ] = useState(-14);
  const [tilt, setTilt] = useState(54);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; rz: number; tl: number } | null>(null);
  const moved = useRef(false);

  // Free-seat counts per sector (refreshed after a failed checkout).
  useEffect(() => {
    api<Summary>(`/events/${eventId}/seats?summary=1&${query}`)
      .then((s) => {
        setSummary(s);
        setSeats({});
        setSector((cur) => cur ?? s.sections.find((x) => x.available > 0 && layout.sectors.find((g) => g.code === x.section)?.tier === "lower")?.section ?? s.sections[0]?.section ?? null);
      })
      .catch((e) => setLoadErr(e.message));
  }, [eventId, query, refreshKey, layout.sectors]);

  // Seats of the open sector.
  useEffect(() => {
    if (!sector || seats[sector]) return;
    api<{ seats: Seat[] }>(`/events/${eventId}/seats?section=${encodeURIComponent(sector)}&${query}`)
      .then((r) => setSeats((m) => ({ ...m, [sector]: r.seats })))
      .catch((e) => setLoadErr(e.message));
  }, [sector, seats, eventId, query]);

  // The parent clears the selection after a failed checkout.
  useEffect(() => {
    if (selected.length === 0 && Object.keys(picked).length) setPicked({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const stats = useMemo(() => Object.fromEntries((summary?.sections ?? []).map((s) => [s.section, s])), [summary]);
  const priceOf = useCallback((code: string) => summary?.priceBySection[code]?.price ?? null, [summary]);

  const toggle = (seat: Seat, g: (typeof geo)[number]) => {
    if (disabled) return;
    const next = { ...picked };
    if (next[seat.id]) {
      delete next[seat.id];
      setNote("");
    } else {
      if (Object.keys(next).length >= MAX_SEATS) {
        setNote(`You can pick up to ${MAX_SEATS} seats per order.`);
        return;
      }
      const stand = layout.stands[g.side];
      next[seat.id] = { id: seat.id, sector: g.code, row: Number(seat.row), seat: seat.number, price: priceOf(g.code) ?? 0, color: stand.color, sub: `${stand.name} · ${ARIA_TIER[g.tier] ?? g.tier}` };
      setNote("");
    }
    setPicked(next);
    onChange(Object.keys(next).map(Number));
  };

  const removeSeat = (id: number) => {
    const next = { ...picked };
    delete next[id];
    setPicked(next);
    setNote("");
    onChange(Object.keys(next).map(Number));
  };

  const clearAll = () => {
    setPicked({});
    setNote("");
    onChange([]);
  };

  // ---------- Orbit with the pointer (3D only) ----------
  const onDown = (e: React.PointerEvent) => {
    moved.current = false;
    if (!is3d) return;
    drag.current = { x: e.clientX, y: e.clientY, rz: rotZ, tl: tilt };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (!moved.current && Math.hypot(dx, dy) < 5) return;
    moved.current = true;
    setDragging(true);
    setRotZ(drag.current.rz - dx * 0.35);
    setTilt(Math.max(20, Math.min(72, drag.current.tl - dy * 0.25)));
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const openG = geo.find((g) => g.code === sector);
  const openStand = openG ? layout.stands[openG.side] : null;
  const openSeats = sector ? seats[sector] : undefined;
  const pickedList = Object.values(picked).sort((a, b) => a.sector.localeCompare(b.sector) || a.row - b.row || a.seat - b.seat);
  const total = pickedList.reduce((s, x) => s + x.price, 0);

  const rows = useMemo(() => {
    if (!openSeats) return [];
    const byRow = new Map<number, Seat[]>();
    for (const s of openSeats) {
      const r = Number(s.row);
      byRow.set(r, [...(byRow.get(r) ?? []), s]);
    }
    return [...byRow.entries()].sort((a, b) => b[0] - a[0]).map(([row, list]) => ({ row, seats: list.sort((a, b) => a.number - b.number) }));
  }, [openSeats]);

  const standLegend = Object.entries(layout.stands).map(([side, stand]) => {
    const prices = layout.sectors
      .filter((s) => s.side === side)
      .reduce<Record<string, number | null>>((m, s) => ({ ...m, [s.tier]: m[s.tier] ?? priceOf(s.code) }), {});
    return { side, ...stand, prices: Object.entries(prices).filter(([, p]) => p != null).map(([tier, p]) => `${tier === "lower" ? "Lower" : "Upper"} ${kzt(p)}`).join(" · ") };
  });

  const stageTransform = is3d ? `translateY(-6px) rotateX(${tilt}deg) rotateZ(${rotZ}deg) scale(1.12)` : "translateY(0px) rotateX(0deg) rotateZ(0deg) scale(1)";
  const toggleBtn = (on: boolean) => (on ? "bg-white text-[#0A1433]" : "bg-transparent text-slate-500");
  const free = (code: string) => (stats[code]?.available ?? 0) - pickedList.filter((p) => p.sector === code).length;

  return (
    <div className="flex flex-wrap items-start gap-6" id="seats">
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
        {/* ---------- Sector map ---------- */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">Choose a sector</h2>
              <p className="text-sm text-muted">{is3d ? "Drag the stadium to orbit. Click a sector to open its seats." : "Click a sector to open its seats."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {is3d && (
                <div className="flex gap-1.5">
                  <button type="button" aria-label="Rotate left" onClick={() => setRotZ(rotZ + 45)} className="flex size-11 items-center justify-center rounded-lg border border-line bg-white hover:bg-slate-100">
                    <Icon d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                  </button>
                  <button type="button" aria-label="Rotate right" onClick={() => setRotZ(rotZ - 45)} className="flex size-11 items-center justify-center rounded-lg border border-line bg-white hover:bg-slate-100">
                    <Icon d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
                  </button>
                  <button type="button" onClick={() => { setRotZ(-14); setTilt(54); }} className="h-11 rounded-lg border border-line bg-white px-3.5 text-sm font-medium hover:bg-slate-100">
                    Reset view
                  </button>
                </div>
              )}
              <div role="group" aria-label="Map view" className="flex gap-1 rounded-xl border border-line p-1" style={{ background: STAGE_BG }}>
                {[["2D", false], ["3D", true]].map(([label, val]) => (
                  <button key={String(label)} type="button" aria-pressed={is3d === val} onClick={() => setIs3d(val as boolean)} className={`h-9 min-w-14 rounded-lg px-3.5 text-sm font-semibold transition ${toggleBtn(is3d === val)}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loadErr && <p className="text-sm text-red-600" role="alert">{loadErr}</p>}

          <div className="overflow-x-auto rounded-xl" style={{ background: STAGE_BG }}>
            <div
              className="relative mx-auto touch-none select-none overflow-hidden"
              style={{ width: layout.width, height: layout.height, perspective: 1500, perspectiveOrigin: "50% 30%", cursor: is3d ? (dragging ? "grabbing" : "grab") : "default" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
            >
              <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", transformOrigin: "50% 50%", transform: stageTransform, transition: dragging ? "none" : "transform .9s cubic-bezier(.2,.7,.2,1)" }}>
                <div className="absolute rounded-[50%]" style={{ left: 60, top: 14, width: 700, height: 572, background: "#13204A", border: "2px solid #22305E", transform: "translateZ(-2px)" }} />
                <div className="absolute rounded-[50%]" style={{ left: 206, top: 160, width: 408, height: 280, background: "#17482E" }} />
                <div className="absolute" style={{ left: 270, top: 210, width: 280, height: 180, border: "2px solid rgba(255,255,255,.75)", background: "repeating-linear-gradient(90deg, #2E8B4A 0 28px, #2A7F44 28px 56px)", transform: "translateZ(1px)" }} aria-hidden="true">
                  <div className="absolute inset-y-0 left-1/2 -ml-px w-0.5" style={{ background: "rgba(255,255,255,.75)" }} />
                  <div className="absolute left-1/2 top-1/2 -ml-[26px] -mt-[26px] size-[52px] rounded-full" style={{ border: "2px solid rgba(255,255,255,.75)" }} />
                  <div className="absolute" style={{ left: -2, top: 44, width: 42, height: 88, border: "2px solid rgba(255,255,255,.75)" }} />
                  <div className="absolute" style={{ right: -2, top: 44, width: 42, height: 88, border: "2px solid rgba(255,255,255,.75)" }} />
                </div>
                {geo.map((g) => {
                  const stand = layout.stands[g.side];
                  const onSale = priceOf(g.code) != null;
                  const freeHere = free(g.code);
                  const active = sector === g.code;
                  const lift = active && is3d ? 10 : 0;
                  const k = g.k.toFixed(2);
                  const opacity = !onSale || freeHere <= 0 ? 0.3 : sector && !active ? 0.6 : 1;
                  return (
                    <button
                      key={g.code}
                      type="button"
                      aria-label={`Sector ${g.code}, ${stand.name}, ${ARIA_TIER[g.tier] ?? g.tier}, ${onSale ? `${Math.max(freeHere, 0)} seats free, ${kzt(priceOf(g.code))}` : "not on sale"}`}
                      aria-pressed={active}
                      onClick={() => {
                        if (moved.current) {
                          moved.current = false;
                          return;
                        }
                        setSector(g.code);
                        setNote("");
                      }}
                      className="absolute flex items-center justify-center border-0 p-0 hover:brightness-125"
                      style={{
                        left: g.left,
                        top: g.top,
                        width: g.w,
                        height: g.h,
                        background: stand.color,
                        clipPath: `polygon(0 0,100% 0,${(100 - g.k).toFixed(2)}% 100%,${k}% 100%)`,
                        transformOrigin: "50% 100%",
                        transform: is3d ? `translateZ(${g.z + lift}px) rotate(${g.phi}deg) rotateX(${g.rake}deg)` : `translateZ(0px) rotate(${g.phi}deg) rotateX(0deg)`,
                        transition: "transform .8s cubic-bezier(.2,.7,.2,1), opacity .25s, filter .2s",
                        opacity,
                        filter: active ? "brightness(1.25) saturate(1.1)" : undefined,
                      }}
                    >
                      <span className="pointer-events-none block text-[11px] font-bold text-[#0A1433]" style={{ transform: g.flip ? "rotate(180deg)" : undefined }}>
                        {g.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {standLegend.map((l) => (
              <div key={l.side} className="flex items-center gap-2 text-sm">
                <span className="size-3.5 rounded" style={{ background: l.color }} aria-hidden="true" />
                <span className="font-semibold">{l.name}</span>
                <span className="text-muted">{l.prices}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Seats of the open sector ---------- */}
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          {openG && openStand ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <span className="h-11 w-3 rounded" style={{ background: openStand.color }} aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold">
                      {t("section")} {openG.code}
                    </h2>
                    <span className="text-sm text-muted">
                      {openStand.name} · {ARIA_TIER[openG.tier] ?? openG.tier}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-bold">{priceOf(openG.code) != null ? kzt(priceOf(openG.code)) : t("unavailable")}</span>
                  <span className="text-sm text-muted">
                    {Math.max(free(openG.code), 0)} of {stats[openG.code]?.total ?? openG.rows * openG.seats} seats free
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl py-4" style={{ background: STAGE_BG }}>
                {!openSeats ? (
                  <p className="py-10 text-center text-sm text-slate-400">Loading seats…</p>
                ) : (
                  <div className="mx-auto w-max" style={{ perspective: 1100, perspectiveOrigin: "50% 100%" }}>
                    <div
                      className="flex flex-col items-center gap-[5px] px-3"
                      style={{ transformStyle: "preserve-3d", transformOrigin: "50% 100%", transition: "transform .8s cubic-bezier(.2,.7,.2,1)", transform: is3d ? "rotateX(46deg) translateY(-12px)" : "rotateX(0deg)" }}
                    >
                      {rows.map(({ row, seats: list }) => {
                        const aisle = Math.floor(list.length / 2) + 1;
                        return (
                          <div key={row} className="flex items-center gap-1" style={{ transformStyle: "preserve-3d", transition: "transform .8s cubic-bezier(.2,.7,.2,1)", transform: `translateZ(${is3d ? (row - 1) * 9 : 0}px)` }}>
                            <span className="w-[34px] pr-1.5 text-right text-xs font-semibold text-[#A7B1D6]">R{row}</span>
                            {list.map((s) => {
                              const sel = Boolean(picked[s.id]);
                              const color = openStand.color;
                              const taken = s.status !== "available";
                              let style: React.CSSProperties;
                              if (sel) style = { background: "#FFFFFF", color: "#0A1433", boxShadow: `0 0 0 2px ${color}, 0 4px 10px rgba(0,0,0,.4)` };
                              else if (s.status === "sold") style = { background: "#26315A", color: "#56628F", cursor: "not-allowed" };
                              else if (s.status === "held") style = { background: "repeating-linear-gradient(45deg,#7C5A12 0 3px,#3A2A10 3px 6px)", color: "#F8D58A", cursor: "not-allowed" };
                              else if (s.status === "unavailable") style = { background: "transparent", color: "#56628F", boxShadow: "inset 0 0 0 1.5px #26315A", cursor: "not-allowed" };
                              else style = { background: color, color: "#0A1433", boxShadow: is3d ? "0 -4px 0 rgba(0,0,0,.28) inset, 0 3px 6px rgba(0,0,0,.35)" : undefined };
                              const state = sel ? t("selected") : t(s.status === "held" ? "held" : s.status);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={taken || disabled}
                                  aria-pressed={sel}
                                  aria-label={`${t("row")} ${row}, ${t("seat")} ${s.number}${s.accessible ? `, ${t("accessible")}` : ""}, ${state}`}
                                  title={`${t("row")} ${row} · ${t("seat")} ${s.number}${s.accessible ? ` · ${t("accessible")}` : ""}`}
                                  onClick={() => toggle(s, openG)}
                                  className="h-[26px] w-[26px] shrink-0 border-0 p-0 text-[10px] font-semibold transition hover:enabled:-translate-y-0.5"
                                  style={{ ...style, marginLeft: s.number === aisle ? 14 : undefined, borderRadius: s.accessible ? "50%" : "7px 7px 4px 4px" }}
                                >
                                  {s.accessible && !sel && !taken ? "♿" : s.number}
                                </button>
                              );
                            })}
                            <span className="w-[34px] pl-1.5 text-xs font-semibold text-[#A7B1D6]">R{row}</span>
                          </div>
                        );
                      })}
                      <div className="mt-2.5 flex h-[30px] w-full items-center justify-center rounded-lg text-xs font-semibold tracking-[.12em]" style={{ background: "#17482E", color: "#CFEFD9" }}>
                        PITCH
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-muted">
                <span className="flex items-center gap-2"><span className="size-[18px] rounded-[5px]" style={{ background: openStand.color }} aria-hidden="true" />{t("available")}</span>
                <span className="flex items-center gap-2"><span className="size-[18px] rounded-[5px] bg-[#FFFFFF]" style={{ boxShadow: `0 0 0 2px ${openStand.color}` }} aria-hidden="true" />{t("selected")}</span>
                <span className="flex items-center gap-2"><span className="size-[18px] rounded-[5px]" style={{ background: "repeating-linear-gradient(45deg,#7C5A12 0 3px,#3A2A10 3px 6px)" }} aria-hidden="true" />{t("held")}</span>
                <span className="flex items-center gap-2"><span className="size-[18px] rounded-[5px] bg-[#26315A]" aria-hidden="true" />{t("sold")}</span>
                <span className="flex items-center gap-2"><span className="size-[18px] rounded-full" style={{ background: openStand.color }} aria-hidden="true" />{t("accessible")} ♿</span>
              </div>
            </>
          ) : (
            <p className="text-muted">Pick a sector on the map to see its seats.</p>
          )}
        </section>
      </div>

      {/* ---------- Your seats + checkout ---------- */}
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-20">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">Your seats</h2>
          <span className="text-sm text-muted">{pickedList.length} selected</span>
        </div>
        {pickedList.length === 0 && <p className="text-sm leading-relaxed text-muted">No seats yet. Click a sector, then click free seats to add them here.</p>}
        <div className="flex flex-col gap-2.5">
          {pickedList.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-slate-50 p-3">
              <span className="w-1.5 self-stretch rounded" style={{ background: p.color }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                  {t("section")} {p.sector} · {t("row")} {p.row} · {t("seat")} {p.seat}
                </span>
                <span className="text-xs text-muted">{p.sub}</span>
              </div>
              <span className="whitespace-nowrap text-[15px] font-semibold">{kzt(p.price)}</span>
              <button type="button" aria-label={`Remove sector ${p.sector}, row ${p.row}, seat ${p.seat}`} onClick={() => removeSeat(p.id)} className="flex size-11 flex-none items-center justify-center rounded-lg bg-slate-100 text-muted hover:text-ink">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {note && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{note}</p>}
        {pickedList.length > 0 && (
          <>
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm text-muted">Seats</span>
              <span className="text-2xl font-extrabold">{kzt(total)}</span>
            </div>
            {children}
            <button type="button" onClick={clearAll} className="h-11 rounded-xl border border-line text-sm font-medium hover:bg-slate-50">
              Clear selection
            </button>
          </>
        )}
        <p className="text-xs text-muted">Up to {MAX_SEATS} seats per order. Seats are held for 10 minutes once you continue to checkout.</p>
      </aside>
    </div>
  );
}
