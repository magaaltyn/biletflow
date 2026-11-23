import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { errorText, ApiError } from "@/services/apiClient";
import { humanize } from "@/lib/format";
import { useColors, radius, type Colors } from "@/lib/theme";

// ---------------------------------------------------------------- layout
export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ["bottom"],
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const pad = padded ? { padding: 16, gap: 12 } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[pad, { paddingBottom: 32 }, style]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, pad, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const c = useColors();
  const base: ViewStyle = { backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: 14, gap: 8 };
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[base, style]}>{children}</View>;
}

export function RowView({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

// ---------------------------------------------------------------- text
type TVariant = "title" | "h2" | "h3" | "body" | "muted" | "small" | "label" | "mono" | "price";
export function T({ children, v = "body", style, color, numberOfLines, center, accessibilityRole }: { children: ReactNode; v?: TVariant; style?: StyleProp<TextStyle>; color?: string; numberOfLines?: number; center?: boolean; accessibilityRole?: "header" | "text" }) {
  const c = useColors();
  const map: Record<TVariant, TextStyle> = {
    title: { fontSize: 26, fontWeight: "800", color: c.ink, letterSpacing: -0.5 },
    h2: { fontSize: 20, fontWeight: "800", color: c.ink },
    h3: { fontSize: 16, fontWeight: "700", color: c.ink },
    body: { fontSize: 15, color: c.ink, lineHeight: 21 },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
    small: { fontSize: 12, color: c.muted },
    label: { fontSize: 13, fontWeight: "600", color: c.ink },
    mono: { fontSize: 13, color: c.ink, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
    price: { fontSize: 16, fontWeight: "800", color: c.brand },
  };
  return (
    <Text accessibilityRole={accessibilityRole ?? (v === "title" || v === "h2" ? "header" : undefined)} numberOfLines={numberOfLines} style={[map[v], color ? { color } : null, center && { textAlign: "center" }, style]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- inputs
type BVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export function Button({ title, onPress, v = "primary", loading, disabled, icon, style, small, accessibilityLabel }: { title: string; onPress?: () => void; v?: BVariant; loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle>; small?: boolean; accessibilityLabel?: string }) {
  const c = useColors();
  const bg: Record<BVariant, string> = { primary: c.brand, secondary: c.card, ghost: "transparent", danger: c.red, success: "#16a34a" };
  const fg: Record<BVariant, string> = { primary: c.onBrand, secondary: c.ink, ghost: c.brand, danger: "#fff", success: "#fff" };
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        { minHeight: small ? 38 : 48, paddingHorizontal: small ? 12 : 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: bg[v] },
        v === "secondary" && { borderWidth: 1, borderColor: c.line },
        off && { opacity: 0.5 },
        pressed && !off && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg[v]} /> : icon}
      <Text style={{ color: fg[v], fontWeight: "700", fontSize: small ? 14 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={props.accessibilityLabel ?? label}
        {...props}
        style={[
          { minHeight: 46, borderWidth: 1, borderColor: error ? c.red : c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.ink, backgroundColor: c.card },
          props.multiline && { minHeight: 96, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {error ? <Text style={{ color: c.red, fontSize: 12 }}>{error}</Text> : hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={{ paddingHorizontal: 12, minHeight: 36, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: active ? color ?? c.brand : c.line, backgroundColor: active ? c.brandSoft : c.card }}
    >
      <Text style={{ color: active ? color ?? c.brand : c.ink, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} active={o.key === value} onPress={() => onChange(o.key)} />
      ))}
    </ScrollView>
  );
}

export function Stepper({ value, onChange, min = 0, max, label }: { value: number; onChange: (n: number) => void; min?: number; max: number; label: string }) {
  const c = useColors();
  const btn = (text: string, next: number, disabled: boolean, a11y: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} onPress={() => onChange(next)} style={{ width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1, backgroundColor: c.card }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: c.ink }}>{text}</Text>
    </Pressable>
  );
  return (
    <RowView gap={10}>
      {btn("−", value - 1, value <= min, `Fewer ${label}`)}
      <Text accessibilityLiveRegion="polite" style={{ minWidth: 20, textAlign: "center", fontWeight: "700", color: c.ink, fontSize: 16 }}>{value}</Text>
      {btn("+", value + 1, value >= max, `More ${label}`)}
    </RowView>
  );
}

// ---------------------------------------------------------------- status
const tones = (c: Colors) => ({
  green: { bg: c.greenSoft, fg: c.green },
  amber: { bg: c.amberSoft, fg: c.amber },
  red: { bg: c.redSoft, fg: c.red },
  blue: { bg: c.brandSoft, fg: c.brand },
  violet: { bg: c.violetSoft, fg: c.violet },
  gray: { bg: c.subtle, fg: c.muted },
});
type Tone = keyof ReturnType<typeof tones>;

export function Badge({ label, tone = "gray" }: { label: string; tone?: Tone }) {
  const t = tones(useColors())[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  paid: "green", valid: "green", published: "green", succeeded: "green", active: "green", resolved: "green", upcoming: "blue", verified: "green",
  checked_in: "violet", pending: "amber", in_progress: "blue", open: "blue", waiting_for_customer: "amber", draft: "gray", inactive: "gray",
  cancelled: "red", refunded: "red", failed: "red", expired: "gray", suspended: "red", completed: "gray",
};
export const StatusBadge = ({ status, label }: { status: string; label?: string }) => <Badge label={label ?? humanize(status)} tone={STATUS_TONE[status] ?? "gray"} />;

export function Notice({ children, tone = "blue" }: { children: ReactNode; tone?: Tone }) {
  const t = tones(useColors())[tone];
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: t.bg, borderRadius: radius.md, padding: 12 }}>
      {typeof children === "string" ? <Text style={{ color: t.fg, fontSize: 14, lineHeight: 20 }}>{children}</Text> : children}
    </View>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <Notice tone="red">{errorText(error)}</Notice>;
}

export function Loading({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ padding: 32, alignItems: "center", gap: 10 }} accessibilityLabel={label ?? "Loading"}>
      <ActivityIndicator size="large" color={c.brand} />
      {label ? <Text style={{ color: c.muted }}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry, retryLabel = "Try again" }: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  const network = error instanceof ApiError && error.isNetwork;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Notice tone="red">{(network ? "⚠ Network error. " : "") + errorText(error)}</Notice>
      {onRetry ? <Button title={retryLabel} v="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 8, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, borderRadius: radius.lg }}>
      <Text style={{ fontSize: 28 }}>🎫</Text>
      <Text style={{ fontWeight: "700", color: c.ink, fontSize: 16, textAlign: "center" }}>{title}</Text>
      {text ? <Text style={{ color: c.muted, textAlign: "center" }}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function KV({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  const c = useColors();
  return (
    <RowView style={{ justifyContent: "space-between" }}>
      <Text style={{ color: c.muted, fontSize: 14, flexShrink: 1 }}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? <Text style={{ color: c.ink, fontSize: 14, fontWeight: bold ? "800" : "600", flexShrink: 1, textAlign: "right" }}>{value}</Text> : value}
    </RowView>
  );
}

export function ListRow({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} onPress={onPress} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line, minHeight: 48 }, pressed && onPress && { opacity: 0.7 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.ink, fontWeight: "600", fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.muted, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={{ color: c.muted, fontSize: 18 }}>›</Text> : null)}
    </Pressable>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: useColors().line, marginVertical: 4 }} />;

export function DemoBanner({ text }: { text: string }) {
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: "#fbbf24", borderRadius: radius.md, padding: 10 }}>
      <Text style={{ color: "#451a03", fontWeight: "800", textAlign: "center", fontSize: 13 }}>{text}</Text>
    </View>
  );
}

/** Confirmation dialog for destructive actions (Alert on phones, window.confirm in the web preview). */
export function confirm(title: string, message: string, destructiveLabel = "Confirm"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: destructiveLabel, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

/** Simple informational alert (Alert on phones, window.alert in the web preview). */
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}
