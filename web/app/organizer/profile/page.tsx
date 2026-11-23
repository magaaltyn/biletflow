"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Notice, PageTitle, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

const ROLES = ["organizer", "platform_admin"];

export default function OrganizerProfile() {
  const { user } = useRequireUser(ROLES);
  const { data, reload } = useApi<any>(user ? "/organizer/profile" : null);
  const [p, setP] = useState({ displayName: "", contactEmail: "", contactPhone: "", bio: "" });
  const [id, setId] = useState({ fullLegalName: "", documentLast4: "" });
  const [payout, setPayout] = useState({ bankName: "", holderName: "", iban: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    if (data?.profile) setP({ displayName: data.profile.display_name ?? "", contactEmail: data.profile.contact_email ?? "", contactPhone: data.profile.contact_phone ?? "", bio: data.profile.bio ?? "" });
  }, [data]);
  if (!user || !data) return <Spinner />;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      void reload();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <PageTitle title="Organizer profile" />
      {msg && <Notice tone="green">{msg}</Notice>}
      <ErrorBox error={err} />
      <Card className="space-y-3">
        <h2 className="font-bold">Public profile & contacts</h2>
        <Field label="Organizer name"><Input value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact email"><Input value={p.contactEmail} onChange={(e) => setP({ ...p, contactEmail: e.target.value })} /></Field>
          <Field label="Contact phone"><Input value={p.contactPhone} onChange={(e) => setP({ ...p, contactPhone: e.target.value })} /></Field>
        </div>
        <Field label="About"><Textarea value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Field>
        <Button onClick={() => run(() => api("/organizer/profile", { method: "PUT", body: { ...p, contactEmail: p.contactEmail || null } }), "Profile saved.")}>Save</Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">Identity verification <Badge tone={data.profile?.identity_status === "verified" ? "green" : "amber"}>{data.profile?.identity_status ?? "none"}</Badge></h2>
        <Notice>Simulation for the academic MVP: no documents are uploaded and no real KYC check runs. Only the last 4 digits are entered.</Notice>
        {data.profile?.identity_status !== "verified" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full legal name"><Input value={id.fullLegalName} onChange={(e) => setId({ ...id, fullLegalName: e.target.value })} /></Field>
              <Field label="ID document — last 4 digits"><Input inputMode="numeric" maxLength={4} value={id.documentLast4} onChange={(e) => setId({ ...id, documentLast4: e.target.value })} /></Field>
            </div>
            <Button onClick={() => run(() => api("/organizer/verify-identity", { body: id }), "Identity verified (simulation).")}>Verify (simulation)</Button>
          </>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">Payout account (demo)</h2>
        {data.payout && <p className="text-sm">Connected: <b>{data.payout.bank_name}</b>, {data.payout.holder_name}, IBAN ••{data.payout.iban_last4}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bank"><Input placeholder="Halyk Bank" value={payout.bankName} onChange={(e) => setPayout({ ...payout, bankName: e.target.value })} /></Field>
          <Field label="Account holder"><Input value={payout.holderName} onChange={(e) => setPayout({ ...payout, holderName: e.target.value })} /></Field>
          <Field label="IBAN" hint="Only the last 4 characters are stored"><Input placeholder="KZ…" value={payout.iban} onChange={(e) => setPayout({ ...payout, iban: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Button onClick={() => run(() => api("/organizer/payout-account", { method: "PUT", body: payout }), "Payout account saved (demo).")}>{data.payout ? "Replace account" : "Connect account"}</Button>
        <p className="text-xs text-muted">Real payouts are not part of the MVP. This only completes the activation checklist.</p>
      </Card>
    </div>
  );
}
