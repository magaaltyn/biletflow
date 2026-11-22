import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { Badge, Button, Card, Chip, Empty, ErrorBox, ErrorView, Field, ListRow, Loading, Notice, RowView, Screen, T, confirm, notify } from "@/components/ui";
import { SignInPrompt } from "@/features/auth/AuthScreens";
import { useAuth, workspacesFor, type Workspace } from "@/features/auth/AuthProvider";
import { API_URL, SERVER_URL, webLink } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { LANGS, useT } from "@/lib/i18n";
import { appRouteForWebPath } from "@/lib/links";
import { useColors } from "@/lib/theme";
import type { AppNotification, User } from "@/lib/types";
import { api } from "@/services/api";

const WS_LABEL: Record<Workspace, string> = { attendee: "Attendee", organizer: "Organizer", staff: "Event Admin (check-in)", admin: "Platform Admin" };
const WS_HOME: Record<Workspace, string> = { attendee: "/home", organizer: "/dashboard", staff: "/scan-events", admin: "/admin" };

export function ProfileScreen() {
  const c = useColors();
  const { t, lang, setLang } = useT();
  const qc = useQueryClient();
  const { user, workspace, setWorkspace, logout, setUser } = useAuth();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ fullName: user?.full_name ?? "", phone: user?.phone ?? "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const langPicker = (
    <Card>
      <T v="label">{t("language")}</T>
      <RowView style={{ flexWrap: "wrap" }}>{LANGS.map((l) => <Chip key={l.code} label={l.label} active={lang === l.code} onPress={() => setLang(l.code)} />)}</RowView>
    </Card>
  );
  if (!user)
    return (
      <Screen>
        <SignInPrompt message={t("account")} />
        {langPicker}
      </Screen>
    );

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };
  const switchTo = (w: Workspace) => {
    setWorkspace(w);
    router.replace(WS_HOME[w] as never);
  };
  const spaces = workspacesFor(user);

  return (
    <Screen>
      <Card>
        <T v="h2">{user.full_name}</T>
        <T v="muted">{user.email}</T>
        <RowView style={{ flexWrap: "wrap" }}>
          <Badge tone="blue" label={user.role.replace("_", " ")} />
          {user.is_event_admin ? <Badge tone="violet" label="event admin" /> : null}
          {user.email_verified ? <Badge tone="green" label="email verified" /> : <Badge tone="amber" label="email not verified" />}
        </RowView>
      </Card>
      {!user.email_verified ? (
        <Notice tone="amber">
          <View style={{ gap: 8 }}>
            <T color={c.amber}>{t("verifyEmail")}</T>
            <RowView>
              <Button small v="secondary" title={t("resend")} loading={busy === "resend"} onPress={() => run("resend", () => api.post("/auth/resend-verification"), "Confirmation email sent.")} />
              <Button small v="ghost" title="I have the link" onPress={() => router.push("/verify-email")} />
            </RowView>
          </View>
        </Notice>
      ) : null}
      {msg ? <Notice tone="green">{msg}</Notice> : null}
      <ErrorBox error={err} />

      {spaces.length > 1 ? (
        <Card>
          <T v="label">{t("workspace")}</T>
          {spaces.map((w) => (
            <ListRow key={w} title={WS_LABEL[w]} subtitle={w === workspace ? "Current" : undefined} onPress={() => switchTo(w)} right={w === workspace ? <Badge tone="blue" label="✓" /> : undefined} />
          ))}
        </Card>
      ) : null}

      <Card>
        <ListRow title={t("myOrders")} onPress={() => router.push("/orders")} />
        <ListRow title={t("myTickets")} onPress={() => (workspace === "attendee" ? router.push("/my-tickets") : (switchTo("attendee"), router.push("/my-tickets")))} />
        <ListRow title={t("support")} onPress={() => router.push("/support")} />
        <ListRow title="Open a promo link" onPress={() => router.push("/c/paste")} />
        {spaces.includes("organizer") ? <ListRow title="Organizer profile & payouts" onPress={() => router.push("/org-profile")} /> : null}
      </Card>

      <Card>
        <RowView style={{ justifyContent: "space-between" }}>
          <T v="label">{t("editProfile")}</T>
          <Button small v="ghost" title={edit ? "Close" : "Edit"} onPress={() => setEdit(!edit)} />
        </RowView>
        {edit ? (
          <>
            <Field label={t("fullName")} value={form.fullName} onChangeText={(v) => setForm({ ...form, fullName: v })} />
            <Field label={t("phone")} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
            <Button title={t("save")} loading={busy === "save"} onPress={() => run("save", async () => {
              const r = await api.patch<{ user: User }>("/auth/me", { fullName: form.fullName, phone: form.phone || null });
              setUser(r.user);
              setEdit(false);
            }, "Profile saved.")} />
            <T v="label" style={{ marginTop: 8 }}>{t("changePassword")}</T>
            {user.has_password ? <Field label="Current password" value={pw.currentPassword} onChangeText={(v) => setPw({ ...pw, currentPassword: v })} secureTextEntry /> : null}
            <Field label="New password" value={pw.newPassword} onChangeText={(v) => setPw({ ...pw, newPassword: v })} secureTextEntry hint="At least 8 characters" />
            <Button v="secondary" title={t("changePassword")} disabled={pw.newPassword.length < 8} loading={busy === "pw"} onPress={() => run("pw", async () => {
              await api.post("/auth/change-password", pw);
              setPw({ currentPassword: "", newPassword: "" });
            }, "Password changed.")} />
          </>
        ) : null}
      </Card>

      {user.role === "attendee" ? (
        <Card>
          <T v="label">{t("forOrganizers")}</T>
          <T v="small">Create events and sell tickets. Your attendee tickets stay in your account.</T>
          <Field label="Organizer name" value={orgName} onChangeText={setOrgName} placeholder="Steppe Events" />
          <Button v="secondary" title="Become an organizer" disabled={orgName.trim().length < 2} loading={busy === "org"} onPress={() => run("org", async () => {
            const r = await api.post<{ user: User }>("/auth/become-organizer", { displayName: orgName.trim() });
            setUser(r.user);
            switchTo("organizer");
          })} />
        </Card>
      ) : null}

      {langPicker}
      <Card>
        <ListRow title={t("howItWorks")} onPress={() => Linking.openURL(webLink("/how-it-works"))} />
        <ListRow title={t("pricing")} onPress={() => Linking.openURL(webLink("/pricing"))} />
        <ListRow title="Terms & privacy" onPress={() => Linking.openURL(webLink("/privacy"))} />
      </Card>
      <Card>
        <T v="small">Server: {SERVER_URL}</T>
        <T v="small">API: {API_URL}</T>
      </Card>
      <Button v="danger" title={t("logout")} onPress={async () => {
        if (await confirm(t("logout"), user.email, t("logout"))) {
          await logout();
          qc.clear();
          router.replace("/welcome");
        }
      }} />
    </Screen>
  );
}

export function NotificationsScreen() {
  const { t, locale } = useT();
  const c = useColors();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], enabled: Boolean(user), refetchInterval: 30_000, queryFn: () => api.get<{ items: AppNotification[]; unread: number }>("/notifications") });
  if (!user) return <Screen><SignInPrompt message={t("notifications")} /></Screen>;
  const open = (n: AppNotification) => {
    const route = appRouteForWebPath(n.link);
    if (route) router.push(route as never);
    else if (n.link) notify(n.title, n.body);
  };
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      {q.data?.unread ? (
        <Button small v="secondary" title={`${t("markAllRead")} (${q.data.unread})`} onPress={async () => {
          await api.post("/notifications/read-all").catch(() => undefined);
          void qc.invalidateQueries({ queryKey: ["notifications"] });
        }} />
      ) : null}
      {q.isLoading ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={() => q.refetch()} retryLabel={t("retry")} /> : !q.data?.items.length ? <Empty title={t("noNotifications")} /> : q.data.items.map((n) => (
        <Card key={n.id} onPress={() => open(n)} style={!n.read_at ? { borderColor: c.brand } : undefined} accessibilityLabel={`${n.read_at ? "" : "Unread. "}${n.title}`}>
          <RowView style={{ justifyContent: "space-between" }}>
            <T v="label" style={{ flex: 1 }}>{n.title}</T>
            {!n.read_at ? <Badge tone="blue" label="new" /> : null}
          </RowView>
          {n.body ? <T v="muted">{n.body}</T> : null}
          <T v="small">{formatDate(n.created_at, undefined, locale)}</T>
        </Card>
      ))}
      <T v="small" center>In-app notifications are refreshed every 30 seconds. Emails are delivered by the server.</T>
    </Screen>
  );
}
