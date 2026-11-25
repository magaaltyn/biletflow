"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Button, Card, ErrorBox, Field, Input, Notice } from "./ui";

const GOOGLE_ERRORS: Record<string, string> = {
  google_state: "Google sign-in expired. Please try again.",
  google_token: "Google did not confirm the sign-in. Please try again.",
  google_profile: "Could not read your Google profile.",
  google_email_unverified: "Your Google email is not verified.",
  suspended: "This account is suspended. Contact support.",
};

export function GoogleButton({ next }: { next: string }) {
  const { config } = useSession();
  const { t } = useT();
  if (!config.googleEnabled) return null;
  return (
    <>
      <a href={`/api/auth/google?next=${encodeURIComponent(next)}`} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
        <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        {t("orGoogle")}
      </a>
      <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
    </>
  );
}

export function LoginForm() {
  const { t } = useT();
  const { refresh } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(sp.get("error") ? GOOGLE_ERRORS[sp.get("error")!] ?? "Sign-in failed" : null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/login", { body: { email, password } });
      await refresh();
      router.push(next.startsWith("/") ? next : "/");
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t("login")}</h1>
      <GoogleButton next={next} />
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("email")}><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t("password")}><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={err} />
        <Button type="submit" className="w-full" loading={busy}>{t("login")}</Button>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-brand">Forgot password?</Link>
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-brand">{t("signup")}</Link>
      </div>
    </Card>
  );
}

export function RegisterForm() {
  const { t } = useT();
  const { refresh } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/";
  const [f, setF] = useState({ fullName: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/register", { body: f });
      await refresh();
      router.push(next);
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t("signup")}</h1>
      <GoogleButton next={next} />
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("fullName")}><Input required autoComplete="name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label={t("email")}><Input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t("password")} hint="At least 8 characters"><Input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <ErrorBox error={err} />
        <Button type="submit" className="w-full" loading={busy}>{t("signup")}</Button>
        <p className="text-xs text-muted">By signing up you accept the <Link className="underline" href="/terms">terms</Link> and <Link className="underline" href="/privacy">privacy policy</Link>. We will email you a link to confirm your address.</p>
      </form>
      <p className="text-sm">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand">{t("login")}</Link></p>
    </Card>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {sent ? (
        <Notice tone="green">If an account exists for {email}, we sent a reset link. It is valid for 1 hour.</Notice>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await api("/auth/forgot-password", { body: { email } }).catch(() => undefined);
            setSent(true);
            setBusy(false);
          }}
        >
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button className="w-full" type="submit" loading={busy}>Send reset link</Button>
        </form>
      )}
    </Card>
  );
}

export function ResetForm() {
  const sp = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {done ? (
        <Notice tone="green">Password updated. <Link className="font-semibold underline" href="/login">Log in</Link></Notice>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/auth/reset-password", { body: { token: sp.get("token"), password } });
              setDone(true);
            } catch (x) {
              setErr(x);
            }
          }}
        >
          <Field label="New password" hint="At least 8 characters"><Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <ErrorBox error={err} />
          <Button className="w-full" type="submit">Save password</Button>
        </form>
      )}
    </Card>
  );
}
