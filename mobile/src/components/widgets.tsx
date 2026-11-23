import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { assetUrl } from "@/lib/config";
import { formatDate, kzt } from "@/lib/format";
import { radius, useColors } from "@/lib/theme";
import type { EventCardData } from "@/lib/types";
import { Button, Card, RowView, T } from "./ui";

// ---------------------------------------------------------------- images
const FALLBACK: Record<string, string> = { concert: "🎵", festival: "🎪", sports: "🏟", theatre: "🎭", conference: "🎤", education: "📚", exhibition: "🖼", community: "🤝", other: "🎟" };

export function EventImage({ src, category, height = 160, rounded = true }: { src: string | null; category?: string; height?: number; rounded?: boolean }) {
  const c = useColors();
  const [failed, setFailed] = useState(false);
  const uri = assetUrl(src);
  const style = { width: "100%" as const, height, borderRadius: rounded ? radius.lg : 0, backgroundColor: c.brandSoft };
  if (!uri || failed)
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center" }]} accessibilityLabel="Event image">
        <Text style={{ fontSize: 48 }}>{FALLBACK[category ?? "other"] ?? "🎟"}</Text>
      </View>
    );
  return <Image source={{ uri }} style={style} contentFit="cover" onError={() => setFailed(true)} accessibilityLabel="Event image" />;
}

export function EventCard({ e, onPress, locale, freeLabel, fromLabel, compact }: { e: EventCardData; onPress: () => void; locale: string; freeLabel: string; fromLabel: string; compact?: boolean }) {
  const c = useColors();
  return (
    <Card onPress={onPress} accessibilityLabel={`${e.title}, ${formatDate(e.starts_at, { dateStyle: "medium" }, locale)}, ${e.venue_name}`} style={[{ padding: 0, overflow: "hidden" }, compact && { width: 260 }]}>
      <EventImage src={e.image_url} category={e.category} height={compact ? 120 : 150} rounded={false} />
      <View style={{ padding: 12, gap: 4 }}>
        <T v="small" color={c.brand} style={{ fontWeight: "700", textTransform: "uppercase" }}>{e.category} · {e.city}</T>
        <T v="h3" numberOfLines={2}>{e.title}</T>
        <T v="muted" numberOfLines={1}>{formatDate(e.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, locale)} · {e.venue_name}</T>
        <T v="price">{e.min_price == null ? "—" : e.min_price === 0 ? freeLabel : `${fromLabel} ${kzt(e.min_price)}`}</T>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- QR
/** Renders the server-issued QR payload. The payload itself is signed by the server (HMAC); the app never creates one. */
export function QrCode({ value, size = 240, faded }: { value: string; size?: number; faded?: boolean }) {
  return (
    <View accessibilityLabel="Ticket QR code" style={{ backgroundColor: "#fff", padding: 12, borderRadius: radius.md, alignSelf: "center", opacity: faded ? 0.35 : 1 }}>
      <QRCode value={value} size={size} ecl="M" />
    </View>
  );
}

// ---------------------------------------------------------------- date/time
export function DateTimeField({ label, value, onChange, optional }: { label: string; value: Date | null; onChange: (d: Date | null) => void; optional?: boolean }) {
  const c = useColors();
  const [mode, setMode] = useState<null | "date" | "time">(null);
  const shown = value ? formatDate(value, { dateStyle: "medium", timeStyle: "short" }) : optional ? "Not set" : "Choose";
  if (Platform.OS === "web") {
    // Web preview: native <input type="datetime-local"> (the community picker has no web implementation).
    const v = value ? new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    return (
      <View style={{ gap: 6 }}>
        <T v="label">{label}</T>
        <input aria-label={label} type="datetime-local" value={v} onChange={(ev: { target: { value: string } }) => onChange(ev.target.value ? new Date(ev.target.value) : null)} style={{ minHeight: 44, borderRadius: 12, border: `1px solid ${c.line}`, padding: "0 10px", fontSize: 15, background: c.card, color: c.ink }} />
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <RowView>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${shown}. Change date`} onPress={() => setMode("date")} style={{ flex: 1, minHeight: 46, justifyContent: "center", borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: c.card }}>
          <Text style={{ color: value ? c.ink : c.muted, fontSize: 15 }}>{shown}</Text>
        </Pressable>
        {value ? <Button small v="secondary" title="Time" onPress={() => setMode("time")} /> : null}
        {optional && value ? <Button small v="ghost" title="Clear" onPress={() => onChange(null)} /> : null}
      </RowView>
      {mode && (
        <DateTimePicker
          value={value ?? new Date()}
          mode={mode}
          is24Hour
          onChange={(ev, d) => {
            setMode(Platform.OS === "ios" && ev.type !== "dismissed" ? mode : null);
            if (ev.type === "set" && d) {
              const next = new Date(value ?? d);
              if (mode === "date") next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
              else next.setHours(d.getHours(), d.getMinutes(), 0, 0);
              onChange(next);
              if (Platform.OS === "android" && mode === "date") setTimeout(() => setMode("time"), 50);
            }
          }}
        />
      )}
      {Platform.OS === "ios" && mode ? <Button small v="secondary" title="Done" onPress={() => setMode(null)} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- prompt
/** Cross-platform text prompt (refund/cancel/suspend reasons). */
export function PromptModal({ visible, title, message, placeholder, confirmLabel = "Confirm", danger, onCancel, onSubmit, minLength = 3 }: { visible: boolean; title: string; message?: string; placeholder?: string; confirmLabel?: string; danger?: boolean; onCancel: () => void; onSubmit: (text: string) => void; minLength?: number }) {
  const c = useColors();
  const [text, setText] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: c.card, borderRadius: radius.xl, padding: 20, gap: 12 }}>
          <T v="h3">{title}</T>
          {message ? <T v="muted">{message}</T> : null}
          <TextInput accessibilityLabel={title} value={text} onChangeText={setText} placeholder={placeholder} placeholderTextColor={c.muted} multiline style={{ minHeight: 80, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 10, color: c.ink, textAlignVertical: "top" }} />
          <RowView style={{ justifyContent: "flex-end" }}>
            <Button small v="secondary" title="Cancel" onPress={() => { setText(""); onCancel(); }} />
            <Button small v={danger ? "danger" : "primary"} title={confirmLabel} disabled={text.trim().length < minLength} onPress={() => { const t = text.trim(); setText(""); onSubmit(t); }} />
          </RowView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- charts
/** Simple bar chart (SVG) for analytics. Values come straight from the API. */
export function BarChart({ data, height = 160, format = (n: number) => String(n) }: { data: { label: string; value: number }[]; height?: number; format?: (n: number) => string }) {
  const c = useColors();
  const [w, setW] = useState(300);
  if (!data.length) return <T v="muted">No data for this period yet.</T>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = Math.max(4, (w - 8) / data.length - 4);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Chart: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
      <Svg width={w} height={height + 18}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * height);
          return <Rect key={d.label + i} x={4 + i * (bw + 4)} y={height - h} width={bw} height={h} rx={3} fill={i === data.length - 1 ? c.brand : c.brandSoft} stroke={c.brand} strokeWidth={0.5} />;
        })}
        <SvgText x={4} y={height + 14} fontSize={10} fill={c.muted}>{data[0].label}</SvgText>
        <SvgText x={w - 4} y={height + 14} fontSize={10} fill={c.muted} textAnchor="end">{data[data.length - 1].label}</SvgText>
      </Svg>
      <T v="small">Max per day: {format(max)}</T>
    </View>
  );
}

export function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={{ height: 10, borderRadius: 5, backgroundColor: c.subtle, overflow: "hidden" }}>
      <View style={{ width: `${Math.min(100, Math.max(0, percent))}%`, height: "100%", backgroundColor: color ?? c.brand }} />
    </View>
  );
}

export function Stat({ label, value, note, color }: { label: string; value: string | number; note?: string; color?: string }) {
  const c = useColors();
  return (
    <Card style={{ flexBasis: "47%", flexGrow: 1, gap: 4 }}>
      <T v="small">{label}</T>
      <T v="h2" color={color ?? c.ink}>{typeof value === "number" ? value.toLocaleString("ru-RU") : value}</T>
      {note ? <T v="small">{note}</T> : null}
    </Card>
  );
}
