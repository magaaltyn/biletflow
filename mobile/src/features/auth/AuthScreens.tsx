import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, ErrorBox, Field, Notice, RowView, Screen, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import { api } from "@/services/api";
import { useAuth, workspacesFor, type Workspace } from "./AuthProvider";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Logo() {
  const c = useColors();
  return (
    <RowView gap={10}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
        <T v="h2" color="#fff">B</T>
      </View>
      <T v="title">
        Bilet<Text style={{ color: c.brand }}>Flow</Text>
      </T>
    </RowView>
  );
}

export function WelcomeScreen() {
  const c = useColors();
  const { t } = useT();
  return (
    <Screen edges={["top", "bottom"]} style={{ flexGrow: 1, justifyContent: "center", gap: 20 }}>
      <Logo />
      <View style={{ backgroundColor: "#081537", borderRadius: 24, padding: 24, gap: 8 }}>
        <T v="title" color="#fff">{t("heroTitle1")}</T>
        <T v="title" color="#fff">{t("heroTitle2")}</T>
        <T v="title" color="#60a5fa">{t("heroTitle3")}</T>
        <T v="muted" color="#cbd5e1" style={{ marginTop: 8 }}>{t("heroText")}</T>
      </View>
      <Button title={t("login")} onPress={() => router.push("/login")} />
      <Button title={t("signup")} v="secondary" onPress={() => router.push("/register")} />
      <Button title={t("continueAsGuest")} v="ghost" onPress={() => router.replace("/home")} />
      <T v="small" center color={c.muted}>DEMO · academic MVP · KZT</T>
    </Screen>
  );
}

/** Where to go after signing in: the requested screen, or the user's main workspace. */
function landing(ws: Workspace[]) {
  if (ws.includes("admin")) return "/admin";
  if (ws.includes("organizer")) return "/dashboard";
  return "/home";
}

export function LoginScreen() {
  const { t } = useT();
  const { login, setWorkspace, sessionExpired } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) return setErr("Enter a valid email address");
    if (!password) return setErr("Enter your password");
    setBusy(true);
    setErr(null);
    try {
      const u = await login(email.trim(), password);
      const ws = workspacesFor(u);
      const target = next || landing(ws);
      setWorkspace(target === "/admin" ? "admin" : target === "/dashboard" ? "organizer" : "attendee");
      router.replace(target as never);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: t("login") }} />
      <Logo />
      {sessionExpired ? <Notice tone="amber">Your session has expired. Please sign in again.</Notice> : null}
      <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label={t("password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
      <ErrorBox error={err} />
      <Button title={t("login")} onPress={submit} loading={busy} />
      <Button title={t("forgotPassword")} v="ghost" onPress={() => router.push("/forgot-password")} />
      <Button title={t("signup")} v="secondary" onPress={() => router.replace("/register")} />
      <T v="small" center>Google sign-in is available on the website only.</T>
    </Screen>
  );
}

export function RegisterScreen() {
  const { t } = useT();
  const { register, setWorkspace } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (form.fullName.trim().length < 2) return setErr("Enter your full name");
    if (!EMAIL_RE.test(form.email.trim())) return setErr("Enter a valid email address");
    if (form.password.length < 8) return setErr("The password must be at least 8 characters");
    setBusy(true);
    setErr(null);
    try {
      // Everyone signs up as an attendee; a platform admin grants the organizer role.
      await register({ ...form, email: form.email.trim() });
      setWorkspace("attendee");
      router.replace("/home");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: t("signup") }} />
      <Field label={t("fullName")} value={form.fullName} onChangeText={set("fullName")} autoComplete="name" />
      <Field label={t("email")} value={form.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t("password")} value={form.password} onChangeText={set("password")} secureTextEntry hint="At least 8 characters" autoComplete="new-password" />
      <ErrorBox error={err} />
      <Button title={t("signup")} onPress={submit} loading={busy} />
      <T v="small" center>We will send a confirmation link to your email (local Mailpit inbox in development).</T>
    </Screen>
  );
}

function TokenScreen({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <T v="muted">{intro}</T>
      {children}
    </Screen>
  );
}

/** The token from the emailed link (…?token=XYZ). Pasting the whole link also works. */
const tokenFrom = (s: string) => {
  const m = s.match(/[?&]token=([^&\s]+)/);
  return (m ? decodeURIComponent(m[1]) : s).trim();
};

export function ForgotPasswordScreen() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <TokenScreen title={t("forgotPassword")} intro="Enter your account email. We will send a password-reset link.">
      {sent ? (
        <>
          <Notice tone="green">If an account exists for this email, a reset link has been sent. Open it on this phone, or paste it on the next screen.</Notice>
          <Button title="I have the link" onPress={() => router.replace("/reset-password")} />
        </>
      ) : (
        <>
          <Field label={t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <ErrorBox error={err} />
          <Button
            title="Send reset link"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api.post("/auth/forgot-password", { email: email.trim() });
                setSent(true);
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </TokenScreen>
  );
}

export function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <TokenScreen title="Reset password" intro="Paste the link from the email (or its token) and choose a new password.">
      {done ? (
        <>
          <Notice tone="green">Password changed. You can sign in now.</Notice>
          <Button title="Sign in" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <Field label="Link or token" value={token} onChangeText={setToken} autoCapitalize="none" />
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" />
          <ErrorBox error={err} />
          <Button
            title="Set new password"
            loading={busy}
            disabled={!token || password.length < 8}
            onPress={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api.post("/auth/reset-password", { token: tokenFrom(token), password });
                setDone(true);
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </TokenScreen>
  );
}

export function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { refreshUser, user } = useAuth();
  const [token, setToken] = useState(params.token ?? "");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <TokenScreen title="Confirm email" intro="Paste the confirmation link from your email, or use “Resend” to get a new one.">
      {done ? (
        <Notice tone="green">Email confirmed. Thank you!</Notice>
      ) : (
        <>
          <Field label="Link or token" value={token} onChangeText={setToken} autoCapitalize="none" />
          <ErrorBox error={err} />
          <Button
            title="Confirm"
            loading={busy}
            disabled={!token}
            onPress={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api.post("/auth/verify-email", { token: tokenFrom(token) });
                setDone(true);
                if (user) await refreshUser();
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          />
          {user ? <Button v="secondary" title="Resend email" onPress={() => api.post("/auth/resend-verification").then(() => setErr(null)).catch(setErr)} /> : null}
        </>
      )}
    </TokenScreen>
  );
}

/** Inline prompt shown on screens that need an account. */
export function SignInPrompt({ message }: { message: string }) {
  const { t } = useT();
  const c = useColors();
  return (
    <Card style={{ alignItems: "center", gap: 12, padding: 24 }}>
      <T v="h3" center>{message}</T>
      <Button title={t("login")} onPress={() => router.push("/login")} style={{ alignSelf: "stretch" }} />
      <Pressable onPress={() => router.push("/register")} accessibilityRole="button">
        <T color={c.brand} style={{ fontWeight: "700" }}>{t("signup")}</T>
      </Pressable>
    </Card>
  );
}
