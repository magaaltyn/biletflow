import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, Empty, ErrorBox, ErrorView, Field, Loading, RowView, Screen, StatusBadge, T, confirm } from "@/components/ui";
import { ProgressBar } from "@/components/widgets";
import { formatDate } from "@/lib/format";
import { useColors } from "@/lib/theme";
import type { CheckinStats, ScanResponse, ScanTicket } from "@/lib/types";
import { ApiError, api, errorText } from "@/services/api";
import { createScanGate, describe } from "./scanLogic";

interface AssignedEvent {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  venue_name: string;
  registered: number;
  checked_in: number;
}

const useAssigned = () => useQuery({ queryKey: ["checkin-events"], refetchInterval: 30_000, queryFn: () => api.get<AssignedEvent[]>("/checkin/events") });

// ---------------------------------------------------------------- assigned events
export function AssignedEventsScreen() {
  const q = useAssigned();
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <T v="muted">Events you can check people in for: assigned to you as Event Admin, organized by you, or all events for platform admins.</T>
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No assigned events" text="An organizer adds you as Event Admin from the event's Staff tab. Only published events that have not ended are listed." />
      ) : (
        q.data.map((e) => {
          const pct = e.registered ? (e.checked_in / e.registered) * 100 : 0;
          return (
            <Card key={e.id}>
              <T v="h3">{e.title}</T>
              <T v="muted">{formatDate(e.starts_at)} · {e.venue_name}</T>
              <RowView style={{ justifyContent: "space-between" }}>
                <T v="label">{e.checked_in} / {e.registered} checked in</T>
                <T v="small">{Math.round(pct)}%</T>
              </RowView>
              <ProgressBar percent={pct} />
              <RowView>
                <Button style={{ flex: 1 }} title="Open scanner" onPress={() => router.push(`/scan/${e.id}`)} />
                <Button style={{ flex: 1 }} v="secondary" title="Attendance" onPress={() => router.push(`/attendance/${e.id}`)} />
              </RowView>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------- scanner
type Outcome = { result: string; message?: string; ticket?: ScanTicket; qr: string } | null;

export function ScannerScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const events = useAssigned();
  const event = events.data?.find((e) => String(e.id) === eventId);
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(true);
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [checking, setChecking] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState("");
  const gate = useMemo(() => createScanGate(3000), []);
  const statsQ = useQuery({ queryKey: ["checkin-stats", eventId], queryFn: () => api.get<CheckinStats>(`/checkin/${eventId}/stats`) });
  const counter = stats ?? statsQ.data;
  const sending = useRef(false);

  // Camera only runs while this screen is visible (saves battery, frees the camera for other apps).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const submit = async (qr: string) => {
    if (sending.current) return;
    sending.current = true;
    setChecking(true);
    try {
      // The server verifies the signature, the event and the ticket status, and records the check-in atomically.
      const r = await api.post<ScanResponse>(`/checkin/${eventId}/scan`, { qr });
      setOutcome({ result: r.result, message: r.message, ticket: r.ticket, qr });
      setStats(r.stats);
      void Haptics.notificationAsync(r.result === "valid" ? Haptics.NotificationFeedbackType.Success : r.result === "already_used" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ["checkin-events"] });
      void qc.invalidateQueries({ queryKey: ["checkin-recent", eventId] });
    } catch (e) {
      // Never treat a ticket as valid without the server: show the error and offer a retry of the same code.
      const forbidden = e instanceof ApiError && e.status === 403;
      setOutcome({ result: forbidden ? "forbidden" : "network", message: errorText(e), qr });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      sending.current = false;
      setChecking(false);
      gate.release();
    }
  };

  const onScan = ({ data }: { data: string }) => {
    if (outcome || !gate.accept(data)) return;
    void submit(data.trim());
  };
  const scanAgain = () => {
    setOutcome(null);
    gate.reset();
  };

  const info = outcome ? (outcome.result === "forbidden" ? { title: "Not allowed", tone: "error" as const, admit: false } : describe(outcome.result)) : null;
  const toneColor = info?.tone === "success" ? "#16a34a" : info?.tone === "warning" ? "#d97706" : "#dc2626";
  const canUseCamera = Platform.OS !== "web" && permission?.granted;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* header */}
      <View style={{ padding: 12, gap: 6, backgroundColor: c.card }}>
        <RowView style={{ justifyContent: "space-between" }}>
          <Button small v="ghost" title="‹ Events" onPress={() => router.back()} accessibilityLabel="Switch event" />
          <Button small v="secondary" title="Attendance" onPress={() => router.push(`/attendance/${eventId}`)} />
        </RowView>
        <T v="h3" numberOfLines={1}>{event?.title ?? `Event #${eventId}`}</T>
        {counter ? (
          <>
            <T v="label" accessibilityRole="text">Checked in: {counter.checked_in} / {counter.registered}</T>
            <ProgressBar percent={counter.registered ? (counter.checked_in / counter.registered) * 100 : 0} />
          </>
        ) : null}
      </View>

      {/* camera / permission */}
      <View style={{ flex: 1 }}>
        {Platform.OS === "web" ? (
          <View style={styles.center}>
            <Text style={styles.whiteText}>Camera scanning runs in the Android/iOS app. In the web preview, enter the QR text below.</Text>
          </View>
        ) : !permission ? (
          <Loading label="Starting camera…" />
        ) : !permission.granted ? (
          <View style={[styles.center, { gap: 12 }]}>
            <Text style={styles.whiteText}>BiletFlow needs camera access to scan ticket QR codes. Nothing is recorded or stored.</Text>
            {permission.canAskAgain ? <Button title="Allow camera" onPress={requestPermission} /> : <Button title="Open settings" onPress={() => Linking.openSettings()} />}
            <Text style={styles.whiteText}>You can still check people in from Attendance (search by name or ticket code).</Text>
          </View>
        ) : focused && !outcome ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={checking ? undefined : onScan}
            onMountError={(e) => setOutcome({ result: "network", message: `Camera unavailable: ${e.message}`, qr: "" })}
          />
        ) : null}
        {canUseCamera && !outcome ? (
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.center]}>
            <View style={{ width: 240, height: 240, borderWidth: 3, borderColor: "#fff", borderRadius: 24 }} />
            <Text style={[styles.whiteText, { marginTop: 12 }]}>{checking ? "Checking with the server…" : "Point the camera at the ticket QR code"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={torch ? "Turn flashlight off" : "Turn flashlight on"} onPress={() => setTorch(!torch)} style={{ marginTop: 16, padding: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }}>
              <Text style={styles.whiteText}>{torch ? "🔦 Light off" : "🔦 Light on"}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* result */}
        {outcome && info ? (
          <View accessibilityLiveRegion="assertive" style={[StyleSheet.absoluteFill, { backgroundColor: toneColor, padding: 24, justifyContent: "center", gap: 12 }]}>
            <Text style={{ color: "#fff", fontSize: 56, textAlign: "center" }}>{info.tone === "success" ? "✓" : info.tone === "warning" ? "!" : "✕"}</Text>
            <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center" }}>{info.title}</Text>
            {outcome.message ? <Text style={{ color: "#fff", fontSize: 16, textAlign: "center" }}>{outcome.message}</Text> : null}
            {outcome.ticket ? (
              <View style={{ backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 16, padding: 14, gap: 4 }}>
                <Text style={styles.ticketText}>{outcome.ticket.attendee_name}</Text>
                <Text style={styles.ticketSmall}>{outcome.ticket.ticket_type}{outcome.ticket.section_code ? ` · ${outcome.ticket.section_code}-${outcome.ticket.row_label}-${outcome.ticket.seat_number}` : ""}</Text>
                <Text style={styles.ticketSmall}>{outcome.ticket.code} · {outcome.ticket.status.replace("_", " ")}</Text>
                {event ? <Text style={styles.ticketSmall}>{event.title}</Text> : null}
              </View>
            ) : null}
            <Button title="Scan next ticket" v="secondary" onPress={scanAgain} />
            {outcome.result === "network" && outcome.qr ? <Button title="Retry this ticket" v="secondary" onPress={() => { setOutcome(null); void submit(outcome.qr); }} /> : null}
          </View>
        ) : null}
      </View>

      {/* manual entry (web preview, damaged screens, USB scanners) */}
      <View style={{ padding: 12, backgroundColor: c.card, gap: 8 }}>
        <RowView>
          <View style={{ flex: 1 }}>
            <Field accessibilityLabel="Ticket QR text" placeholder="BFT1.… (manual entry)" value={manual} onChangeText={setManual} autoCapitalize="none" />
          </View>
          <Button small title="Check" disabled={!manual.trim() || checking || Boolean(outcome)} onPress={() => { const v = manual.trim(); setManual(""); gate.reset(); void submit(v); }} />
        </RowView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  whiteText: { color: "#fff", textAlign: "center", fontSize: 15 },
  ticketText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  ticketSmall: { color: "#fff", fontSize: 14 },
});

// ---------------------------------------------------------------- attendance (manual search, undo, recent scans)
interface RecentScan {
  id: number;
  action: "check_in" | "undo";
  created_at: string;
  ticket_id: number;
  code: string;
  attendee_name: string;
  status: string;
  staff_name: string;
}

export function AttendanceScreen() {
  const qc = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const stats = useQuery({ queryKey: ["checkin-stats", eventId], refetchInterval: 15_000, queryFn: () => api.get<CheckinStats>(`/checkin/${eventId}/stats`) });
  const results = useQuery({ queryKey: ["checkin-search", eventId, search], queryFn: () => api.get<ScanTicket[]>(`/checkin/${eventId}/search?q=${encodeURIComponent(search)}`) });
  const recent = useQuery({ queryKey: ["checkin-recent", eventId], refetchInterval: 15_000, queryFn: () => api.get<RecentScan[]>(`/checkin/${eventId}/recent`) });
  const refresh = () => {
    void stats.refetch();
    void results.refetch();
    void recent.refetch();
    void qc.invalidateQueries({ queryKey: ["checkin-events"] });
  };
  const act = async (ticketId: number, path: string) => {
    setBusy(ticketId);
    setErr(null);
    try {
      await api.post(`/checkin/${eventId}/tickets/${ticketId}${path}`);
      refresh();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const s = stats.data;
  return (
    <Screen onRefresh={refresh} refreshing={stats.isRefetching}>
      <Stack.Screen options={{ title: "Attendance" }} />
      {s ? (
        <Card>
          <T v="h2">{s.checked_in} / {s.registered}</T>
          <T v="muted">checked in · {s.registered - s.checked_in} not yet arrived</T>
          <ProgressBar percent={s.registered ? (s.checked_in / s.registered) * 100 : 0} />
        </Card>
      ) : stats.error ? <ErrorView error={stats.error} onRetry={() => stats.refetch()} /> : <Loading />}
      <Button title="Open camera scanner" onPress={() => router.push(`/scan/${eventId}`)} />
      <RowView>
        <View style={{ flex: 1 }}>
          <Field accessibilityLabel="Search attendee" placeholder="Name, email or ticket code" value={term} onChangeText={setTerm} onSubmitEditing={() => setSearch(term.trim())} returnKeyType="search" />
        </View>
        <Button small title="Search" onPress={() => setSearch(term.trim())} />
      </RowView>
      <ErrorBox error={err} />
      {results.isLoading ? <Loading /> : results.error ? <ErrorView error={results.error} onRetry={() => results.refetch()} /> : !results.data?.length ? <Empty title="No attendees found" /> : results.data.map((t) => (
        <Card key={t.id}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label" style={{ flex: 1 }}>{t.attendee_name}</T>
            <StatusBadge status={t.status} />
          </RowView>
          <T v="small">{t.ticket_type} · {t.code}{t.section_code ? ` · ${t.section_code}-${t.row_label}-${t.seat_number}` : ""}{t.attendee_email ? ` · ${t.attendee_email}` : ""}</T>
          {t.status === "valid" ? <Button small title="Check in manually" loading={busy === t.id} onPress={() => act(t.id, "")} /> : null}
          {t.status === "checked_in" ? (
            <>
              <T v="small">Checked in {formatDate(t.checked_in_at, { timeStyle: "short" })}</T>
              <Button small v="secondary" title="Undo check-in" loading={busy === t.id} onPress={async () => {
                if (await confirm("Undo check-in?", `${t.attendee_name} (${t.code}) will be able to enter again.`, "Undo")) void act(t.id, "/undo");
              }} />
            </>
          ) : null}
        </Card>
      ))}
      <T v="h3">Recent scans</T>
      {recent.data?.length ? recent.data.map((r) => (
        <RowView key={r.id} style={{ justifyContent: "space-between" }}>
          <T v="small" style={{ flex: 1 }}>{formatDate(r.created_at, { timeStyle: "medium" })} · {r.attendee_name} ({r.code}) · {r.staff_name}</T>
          <Badge tone={r.action === "undo" ? "amber" : "green"} label={r.action === "undo" ? "undo" : "in"} />
        </RowView>
      )) : <T v="small">No check-ins yet.</T>}
      <T v="small" center>Undo is available to organizers, platform admins and Event Admins allowed to undo.</T>
    </Screen>
  );
}
