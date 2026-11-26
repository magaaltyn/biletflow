"use client";
import {useT, translate} from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, ErrorBox, Field, Input, Notice, PageTitle, Select, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";

const CATEGORIES = [
  ["ticket_delivery", "Ticket delivery"],
  ["payment", "Payment"],
  ["refund", "Refund"],
  ["seating", "Seating"],
  ["event_info", "Event information"],
  ["check_in", "Check-in"],
  ["account", "Account"],
  ["activation", "Paid sales activation (organizers)"],
  ["technical", "Technical problem"],
];

function NewCase() {
  useT();
  const { user } = useRequireUser();
  const sp = useSearchParams();
  const router = useRouter();
  const ctx = { eventId: sp.get("eventId"), orderId: sp.get("orderId"), ticketId: sp.get("ticketId") };
  const [f, setF] = useState({ category: ctx.ticketId ? "ticket_delivery" : ctx.orderId ? "payment" : "event_info", subject: "", message: "" });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return <Spinner />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api<{ id: number }>("/support", { body: { ...f, eventId: ctx.eventId ?? undefined, orderId: ctx.orderId ?? undefined, ticketId: ctx.ticketId ?? undefined } });
      router.push(`/support/${c.id}`);
    } catch (x) {
      setErr(x);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageTitle title={translate('New support case')} />
      {(ctx.eventId || ctx.orderId || ctx.ticketId) && <Notice>{translate(ctx.ticketId ? "Your ticket details are attached automatically." : ctx.orderId ? "Your order details are attached automatically." : "Your event details are attached automatically.")}</Notice>}
      <Card className="mt-4">
        <form onSubmit={submit} className="space-y-3">
          <Field label={translate('Category')}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{translate(l)}</option>)}</Select></Field>
          <Field label="Subject"><Input required minLength={3} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Message"><Textarea required minLength={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <ErrorBox error={err} />
          <Button type="submit" loading={busy}>{translate('Send')}</Button>
        </form>
      </Card>
    </div>
  );
}

export default function Page() {
  useT();
  return <Suspense fallback={<Spinner />}><NewCase /></Suspense>;
}
