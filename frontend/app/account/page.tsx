"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, PageTitle, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";
import {LANGS, useT, translate} from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useTheme } from "@/components/ThemeToggle";

export default function Account() {
  const { user } = useRequireUser();
  const { refresh } = useSession();
  const {lang, setLang, t, tx} = useT();
  const { mode, setMode } = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setPhone(user.phone ?? "");
    }
  }, [user]);
  if (!user) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      await refresh();
      setMsg(done);
    } catch (e) {
      setErr(e);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <PageTitle title={translate('Profile')} subtitle={<>{user.email} · <Badge>{user.role.replace("_", " ")}</Badge> {user.email_verified ? <Badge tone="green">{translate('email verified')}</Badge> : <Badge tone="amber">{translate('email not verified')}</Badge>} {user.google_linked && <Badge tone="blue">{translate('Google linked')}</Badge>}</>} />
      {msg && <Notice tone="green">{msg}</Notice>}
      <ErrorBox error={err} />
      {!user.email_verified && (
        <Notice tone="amber">
          {translate("Please confirm your email address.")} <button className="font-semibold underline" onClick={() => run(() => api("/auth/resend-verification", { method: "POST" }), "Confirmation email sent.")}>{translate('Send the link again')}</button>
        </Notice>
      )}
      <Card className="space-y-3">
        <h2 className="font-bold">{translate('Personal information')}</h2>
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 7xx xxx xx xx" /></Field>
        <Button onClick={() => run(() => api("/auth/me", { method: "PATCH", body: { fullName: name, phone: phone || null } }), "Profile saved.")}>{translate('Save')}</Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">{translate('Theme')}</h2>
        <div className="flex flex-wrap gap-2">
          {(["light", "dark", "system"] as const).map((m) => (
            <Button key={m} variant={mode === m ? "primary" : "secondary"} onClick={() => setMode(m)} aria-pressed={mode === m}>
              {t(m === "light" ? "themeLight" : m === "dark" ? "themeDark" : "themeSystem")}
            </Button>
          ))}
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">{translate('Language')}</h2>
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <Button key={l.code} variant={lang === l.code ? "primary" : "secondary"} onClick={() => setLang(l.code)}>{l.label}</Button>
          ))}
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">{user.has_password ? translate("Change password") : translate("Set a password")}</h2>
        {user.has_password && <Field label="Current password"><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>}
        <Field label="New password" hint="At least 8 characters"><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        <Button onClick={() => run(() => api("/auth/change-password", { body: pw }), "Password updated.")}>{translate('Save password')}</Button>
      </Card>
    </div>
  );
}
