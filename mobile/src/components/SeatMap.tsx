// Native seat selection for assigned-seating events (SRS 4.3.1). Data comes from GET /api/events/:id/seats,
// and the server holds/sells seats with database constraints — the map only shows what the server reports.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, G, Rect, Text as SvgText } from "react-native-svg";
import { api, qs } from "@/services/api";
import { kzt } from "@/lib/format";
import { radius, useColors } from "@/lib/theme";
import type { Seat, SeatPrice, StadiumLayout } from "@/lib/types";
import { Chip, ErrorView, Loading, RowView, T } from "./ui";

export const SEAT_COLORS = { available: "#16a34a", selected: "#1d4ed8", held: "#f59e0b", sold: "#94a3b8", unavailable: "#cbd5e1" };

interface Props {
  eventId: number;
  accessKey?: string | null;
  selected: number[];
  onChange: (ids: number[], seats: Seat[]) => void;
  disabled?: boolean;
  layout: StadiumLayout | null;
  labels: { available: string; selected: string; held: string; sold: string; section: string; row: string; seat: string };
  max?: number;
}

function Legend({ labels }: { labels: Props["labels"] }) {
  const items: [string, string][] = [[SEAT_COLORS.available, labels.available], [SEAT_COLORS.selected, labels.selected], [SEAT_COLORS.held, labels.held], [SEAT_COLORS.sold, labels.sold]];
  return (
    <RowView style={{ flexWrap: "wrap" }} gap={12}>
      {items.map(([color, l]) => (
        <RowView key={l} gap={4}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
          <T v="small">{l}</T>
        </RowView>
      ))}
    </RowView>
  );
}

/** One section's seats as a zoomable row grid (stadiums) or the whole small venue as an SVG map. */
function SeatGrid({ seats, selected, toggle, disabled, priceBySection, labels }: { seats: Seat[]; selected: number[]; toggle: (s: Seat) => void; disabled?: boolean; priceBySection: Record<string, SeatPrice>; labels: Props["labels"] }) {
  const c = useColors();
  const rows = useMemo(() => {
    const m = new Map<string, Seat[]>();
    for (const s of seats) {
      const key = `${s.section}|${s.row}`;
      m.set(key, [...(m.get(key) ?? []), s]);
    }
    return [...m.entries()].map(([k, list]) => ({ key: k, section: list[0].section, row: list[0].row, seats: list.sort((a, b) => a.number - b.number) }));
  }, [seats]);
  return (
    <ScrollView horizontal>
      <View style={{ gap: 4, paddingVertical: 6 }}>
        <View style={{ alignSelf: "center", backgroundColor: c.subtle, borderRadius: 8, paddingHorizontal: 40, paddingVertical: 4, marginBottom: 6 }}>
          <T v="small">STAGE / FIELD</T>
        </View>
        {rows.map((r) => (
          <RowView key={r.key} gap={4}>
            <Text style={{ width: 44, fontSize: 11, color: c.muted }}>{r.section}-{r.row}</Text>
            {r.seats.map((s) => {
              const sel = selected.includes(s.id);
              const can = s.status === "available" && !disabled;
              const color = sel ? SEAT_COLORS.selected : SEAT_COLORS[s.status];
              const price = priceBySection[s.section];
              return (
                <Pressable
                  key={s.id}
                  onPress={can || sel ? () => toggle(s) : undefined}
                  accessibilityRole={can ? "button" : "image"}
                  accessibilityState={{ selected: sel, disabled: !can && !sel }}
                  accessibilityLabel={`${labels.section} ${s.section}, ${labels.row} ${s.row}, ${labels.seat} ${s.number}${s.accessible ? ", accessible" : ""}, ${sel ? labels.selected : s.status}${price ? `, ${kzt(price.price)}` : ""}`}
                  hitSlop={3}
                  style={{ width: 26, height: 26, borderRadius: s.accessible ? 4 : 13, backgroundColor: color, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{sel ? "✓" : s.status === "sold" ? "×" : s.number}</Text>
                </Pressable>
              );
            })}
          </RowView>
        ))}
      </View>
    </ScrollView>
  );
}

function SmallVenueMap({ eventId, accessKey, selected, onChange, disabled, labels, max = 10 }: Props) {
  const q = useQuery({ queryKey: ["seats", eventId], queryFn: () => api.get<{ seats: Seat[]; priceBySection: Record<string, SeatPrice>; width: number; height: number }>(`/events/${eventId}/seats${qs({ key: accessKey })}`) });
  const [section, setSection] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  const { seats, priceBySection, width, height } = q.data;
  const sections = [...new Set(seats.map((s) => s.section))].sort();
  const toggle = (s: Seat) => {
    const next = selected.includes(s.id) ? selected.filter((x) => x !== s.id) : selected.length >= max ? selected : [...selected, s.id];
    onChange(next, seats.filter((x) => next.includes(x.id)));
  };
  return (
    <View style={{ gap: 10 }}>
      <Legend labels={labels} />
      {/* Overview: whole venue in SVG; tap a section to pick seats in a larger grid. */}
      <OverviewSvg seats={seats} width={width} height={height} selected={selected} onSection={setSection} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {sections.map((s) => {
          const free = seats.filter((x) => x.section === s && x.status === "available").length;
          const price = priceBySection[s];
          return <Chip key={s} label={`${s} · ${price ? kzt(price.price) : "—"} · ${free}`} active={section === s} onPress={() => setSection(section === s ? null : s)} />;
        })}
      </ScrollView>
      {section ? <SeatGrid seats={seats.filter((x) => x.section === section)} selected={selected} toggle={toggle} disabled={disabled} priceBySection={priceBySection} labels={labels} /> : <T v="muted">Tap a section to choose seats.</T>}
    </View>
  );
}

function OverviewSvg({ seats, width, height, selected, onSection }: { seats: Seat[]; width: number; height: number; selected: number[]; onSection: (s: string) => void }) {
  const c = useColors();
  const [w, setW] = useState(320);
  const scale = w / (width || 1000);
  const bySection = useMemo(() => {
    const m: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {};
    for (const s of seats) {
      const b = (m[s.section] ??= { x0: s.x, y0: s.y, x1: s.x, y1: s.y });
      b.x0 = Math.min(b.x0, s.x); b.y0 = Math.min(b.y0, s.y); b.x1 = Math.max(b.x1, s.x); b.y1 = Math.max(b.y1, s.y);
    }
    return m;
  }, [seats]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ backgroundColor: c.subtle, borderRadius: radius.md }}>
      <Svg width={w} height={(height || 860) * scale}>
        <Rect x={(width * 0.3) * scale} y={20 * scale} width={width * 0.4 * scale} height={60 * scale} rx={8} fill={c.line} />
        <SvgText x={(width / 2) * scale} y={58 * scale} fontSize={12} fill={c.muted} textAnchor="middle">STAGE</SvgText>
        {seats.map((s) => <Circle key={s.id} cx={(s.x + 6) * scale} cy={(s.y + 6) * scale} r={Math.max(1.2, 5 * scale)} fill={selected.includes(s.id) ? SEAT_COLORS.selected : SEAT_COLORS[s.status]} />)}
        {Object.entries(bySection).map(([code, b]) => (
          <G key={code} onPress={() => onSection(code)}>
            <Rect x={(b.x0 - 4) * scale} y={(b.y0 - 4) * scale} width={(b.x1 - b.x0 + 20) * scale} height={(b.y1 - b.y0 + 20) * scale} fill="transparent" stroke={c.brand} strokeWidth={0.6} />
            <SvgText x={((b.x0 + b.x1) / 2 + 6) * scale} y={(b.y0 - 8) * scale} fontSize={11} fontWeight="bold" fill={c.ink} textAnchor="middle">{code}</SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** Stadiums have 10 000+ seats: pick a sector from the server's per-sector summary, then load only that sector. */
function StadiumPicker({ eventId, accessKey, selected, onChange, disabled, labels, layout, max = 10 }: Props) {
  const summary = useQuery({ queryKey: ["seat-summary", eventId], queryFn: () => api.get<{ sections: { section: string; total: number; available: number }[]; priceBySection: Record<string, SeatPrice> }>(`/events/${eventId}/seats${qs({ summary: 1, key: accessKey })}`) });
  const [sector, setSector] = useState<string | null>(null);
  const [picked, setPicked] = useState<Seat[]>([]);
  const seatsQ = useQuery({ queryKey: ["seats", eventId, sector], enabled: Boolean(sector), queryFn: () => api.get<{ seats: Seat[]; priceBySection: Record<string, SeatPrice> }>(`/events/${eventId}/seats${qs({ section: sector, key: accessKey })}`) });
  if (summary.isLoading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorView error={summary.error} onRetry={() => summary.refetch()} />;
  const stands = layout?.stands ?? {};
  const sideOf = (code: string) => layout?.sectors.find((s) => s.code === code)?.side ?? "";
  const groups = new Map<string, typeof summary.data.sections>();
  for (const s of summary.data.sections) groups.set(sideOf(s.section), [...(groups.get(sideOf(s.section)) ?? []), s]);
  const toggle = (s: Seat) => {
    const has = selected.includes(s.id);
    if (!has && selected.length >= max) return;
    const nextPicked = has ? picked.filter((p) => p.id !== s.id) : [...picked, s];
    setPicked(nextPicked);
    onChange(nextPicked.map((p) => p.id), nextPicked);
  };
  return (
    <View style={{ gap: 10 }}>
      <Legend labels={labels} />
      {[...groups.entries()].map(([side, list]) => (
        <View key={side} style={{ gap: 6 }}>
          <RowView gap={6}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stands[side]?.color ?? "#64748b" }} />
            <T v="label">{stands[side]?.name ?? side}</T>
          </RowView>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {list.map((s) => {
              const price = summary.data!.priceBySection[s.section];
              return <Chip key={s.section} label={`${s.section} · ${s.available}${price ? ` · ${kzt(price.price)}` : ""}`} active={sector === s.section} onPress={() => setSector(sector === s.section ? null : s.section)} />;
            })}
          </View>
        </View>
      ))}
      {sector && (seatsQ.isLoading ? <Loading /> : seatsQ.data ? <SeatGrid seats={seatsQ.data.seats} selected={selected} toggle={toggle} disabled={disabled} priceBySection={seatsQ.data.priceBySection} labels={labels} /> : <ErrorView error={seatsQ.error} onRetry={() => seatsQ.refetch()} />)}
    </View>
  );
}

export function SeatPicker(props: Props) {
  return props.layout?.type === "stadium" ? <StadiumPicker {...props} /> : <SmallVenueMap {...props} />;
}

