"use client";
import {useT, translate} from "@/lib/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { api, formatDate } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

export default function SupportCase() {
  useT();
  const { id } = useParams<{ id: string }>();
  const { user } = useRequireUser();
  const { data: c, error, loading, reload } = useApi<any>(user ? `/support/${id}` : null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    // Lightweight polling instead of WebSockets (SRS 4.13).
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [reload]);
  if (!user || (loading && !c)) return <Spinner />;
  if (error || !c) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorBox error={error} /></div>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await api(`/support/${c.id}/messages`, { body: { body } });
      setBody("");
      void reload();
    } catch (x) {
      setErr(x);
    }
  };
  const update = async (patch: object) => {
    await api(`/support/${c.id}`, { method: "PATCH", body: patch }).catch(setErr);
    void reload();
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_280px]">
      <div>
        <Link href="/support" className="text-sm text-muted">{translate('← Support')}</Link>
        <h1 className="mt-1 text-2xl font-bold">{c.subject}</h1>
        <p className="text-sm text-muted">#{c.code} · {translate(c.category.replace(/_/g, " "))} · <StatusBadge status={c.status} /></p>
        <div className="mt-6 space-y-3" aria-live="polite">
          {c.messages.map((m: any) => {
            const mine = m.author_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${mine ? "bg-brand text-on-brand" : "border border-line bg-white"}`}>
                  <p className={`text-xs ${mine ? "text-on-brand/70" : "text-muted"}`}>{m.author_name}{m.author_role !== "attendee" && !mine ? ` · ${translate(m.author_role.replace(/_/g, " "))}` : ""} · {formatDate(m.created_at)}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={send} className="mt-4 space-y-2">
          <Textarea aria-label="Message" placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} />
          <ErrorBox error={err} />
          <Button type="submit" disabled={!body.trim()}>{translate('Send')}</Button>
        </form>
      </div>
      <aside className="space-y-4">
        <Card className="space-y-2 text-sm">
          <p className="font-bold">{translate('Context')}</p>
          <p>{translate("From:")} {c.context.requester.full_name}</p>
          {c.context.event && <p>{translate('Event:')} <Link className="text-brand" href={`/events/${c.context.event.slug}`}>{c.context.event.title}</Link></p>}
          {c.context.order && <p>{translate('Order:')} <Link className="text-brand" href={`/orders/${c.context.order.id}`}>{c.context.order.code}</Link> <StatusBadge status={c.context.order.status} /></p>}
          {c.context.ticket && <p>{translate("Ticket:")} {c.context.ticket.code} <StatusBadge status={c.context.ticket.status} /></p>}
          <p>{translate("Assigned:")} {c.context.assignee?.full_name ?? "—"}</p>
          {c.escalated && <Badge tone="purple">{translate('escalated to platform')}</Badge>}
        </Card>
        {c.canManage ? (
          <Card className="space-y-2">
            <p className="text-sm font-bold">{translate('Manage case')}</p>
            <Select aria-label={translate('Status')} value={c.status} onChange={(e) => update({ status: e.target.value })}>
              {["open", "in_progress", "waiting_for_customer", "resolved"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            <Button variant="secondary" className="w-full" onClick={() => update({ assignToMe: true })}>{translate('Assign to me')}</Button>
            {!c.escalated && user.role !== "platform_admin" && <Button variant="secondary" className="w-full" onClick={() => update({ escalate: true })}>{translate('Escalate to platform')}</Button>}
          </Card>
        ) : (
          c.status !== "resolved" && <Button variant="secondary" className="w-full" onClick={() => update({ status: "resolved" })}>{translate('Mark as resolved')}</Button>
        )}
      </aside>
    </div>
  );
}
