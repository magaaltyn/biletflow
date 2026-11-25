"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, PageTitle, Spinner, Stat, StatusBadge, Tabs } from "@/components/ui";
import { api, formatDate, kzt } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

const ROLES = ["platform_admin"];
type Tab = "search" | "activations" | "reports" | "monitoring" | "settings";

function SearchTab() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, loading, reload } = useApi<any>(`/admin/search?q=${encodeURIComponent(term)}`, [term]);
  const [err, setErr] = useState<unknown>(null);
  const post = async (path: string, body: object) => {
    await api(path, { body }).catch(setErr);
    void reload();
  };
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setTerm(q); }} className="flex gap-2">
        <Input placeholder="Search users, events, orders, payments" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <Button type="submit">Search</Button>
      </form>
      <ErrorBox error={err} />
      {loading || !data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-2 font-bold">Events</h3>
            {data.events.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-2 border-t border-line py-2 text-sm">
                <span><Link className="font-semibold text-brand" href={`/organizer/events/${e.id}`}>{e.title}</Link><span className="block text-xs text-muted">{e.organizer} · {formatDate(e.starts_at, { dateStyle: "medium" })}</span></span>
                <span className="flex flex-wrap items-center justify-end gap-1">
                  <StatusBadge status={e.status} />
                  {e.paid_sales_status !== "inactive" && <StatusBadge status={e.paid_sales_status} />}
                  <button className="text-xs font-semibold text-red-600" onClick={() => post(`/admin/events/${e.id}/suspend`, { suspended: !e.suspended_at, reason: "Platform review" })}>{e.suspended_at ? "Unsuspend" : "Suspend"}</button>
                  {e.paid_sales_status !== "inactive" && <button className="text-xs font-semibold text-red-600" onClick={() => post(`/admin/events/${e.id}/paid-sales`, { suspended: e.paid_sales_status !== "suspended" })}>{e.paid_sales_status === "suspended" ? "Restore paid sales" : "Stop paid sales"}</button>}
                </span>
              </div>
            ))}
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">Users</h3>
            {data.users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between border-t border-line py-2 text-sm">
                <span>{u.full_name}<span className="block text-xs text-muted">{u.email} · {u.role}</span></span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {u.suspended_at && <Badge tone="red">suspended</Badge>}
                  {u.role === "attendee" && <button className="text-xs font-semibold text-brand" onClick={() => post(`/admin/users/${u.id}/role`, { role: "organizer" })}>Make organizer</button>}
                  {u.role === "organizer" && <button className="text-xs font-semibold text-muted" onClick={() => post(`/admin/users/${u.id}/role`, { role: "attendee" })}>Remove organizer</button>}
                  <button className="text-xs font-semibold text-red-600" onClick={() => post(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended_at })}>{u.suspended_at ? "Unsuspend" : "Suspend"}</button>
                </span>
              </div>
            ))}
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">Orders</h3>
            {data.orders.map((o: any) => <div key={o.id} className="flex justify-between border-t border-line py-2 text-sm"><span className="font-mono text-xs">{o.code}<span className="block font-sans text-muted">{o.title} · {o.attendee_email}</span></span><span>{kzt(o.total_kzt)} <StatusBadge status={o.status} /></span></div>)}
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">Payments (DEMO)</h3>
            {data.payments.map((p: any) => <div key={p.id} className="flex justify-between border-t border-line py-2 text-sm"><span>{p.purpose.replace("_", " ")} · {p.provider}<span className="block text-xs text-muted">{p.title} · {p.provider_ref}</span></span><span>{kzt(p.amount_kzt)} <StatusBadge status={p.status} /></span></div>)}
          </Card>
        </div>
      )}
    </div>
  );
}

function ListTab({ path, render }: { path: string; render: (rows: any) => React.ReactNode }) {
  const { data, loading, error, reload } = useApi<any>(path);
  if (loading) return <Spinner />;
  return <><ErrorBox error={error} onRetry={reload} />{data && render({ data, reload })}</>;
}

function SettingsTab() {
  const { data, loading } = useApi<Record<string, string>>("/admin/settings");
  const [f, setF] = useState({ activation_fee_kzt: "", processing_fee_percent: "" });
  const [msg, setMsg] = useState<unknown>(null);
  useEffect(() => {
    if (data) setF({ activation_fee_kzt: data.activation_fee_kzt, processing_fee_percent: data.processing_fee_percent });
  }, [data]);
  if (loading) return <Spinner />;
  return (
    <Card className="max-w-lg space-y-3">
      <Field label="Paid Sales Activation Fee (KZT, per event)"><Input type="number" value={f.activation_fee_kzt} onChange={(e) => setF({ ...f, activation_fee_kzt: e.target.value })} /></Field>
      <Field label="Payment processing charge (%)"><Input type="number" step="0.1" value={f.processing_fee_percent} onChange={(e) => setF({ ...f, processing_fee_percent: e.target.value })} /></Field>
      <Button onClick={() => api("/admin/settings", { method: "PUT", body: f }).then(() => setMsg("Saved")).catch(setMsg)}>Save settings</Button>
      {msg !== null && (msg === "Saved" ? <p className="text-sm text-green-700">Saved.</p> : <ErrorBox error={msg} />)}
      <div className="border-t border-line pt-3 text-sm">
        <p className="font-semibold">Export reports (CSV)</p>
        <div className="mt-1 flex gap-3">{["orders", "events", "payments"].map((k) => <a key={k} className="text-brand" href={`/api/admin/export/${k}.csv`}>{k}</a>)}</div>
      </div>
    </Card>
  );
}

export default function Admin() {
  const { user } = useRequireUser(ROLES);
  const { data: o } = useApi<any>(user ? "/admin/overview" : null);
  const [tab, setTab] = useState<Tab>("search");
  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <PageTitle title="Platform admin" actions={<Link className="text-sm font-semibold text-brand" href="/support">Support inbox →</Link>} />
      {o && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Users" value={o.users} />
          <Stat label="Published events" value={o.published_events} />
          <Stat label="Active tickets" value={o.active_tickets} />
          <Stat label="Gross (DEMO)" value={kzt(o.demo_gross_kzt)} />
          <Stat label="Open reports" value={o.open_reports} />
          <Stat label="Open support cases" value={o.open_cases} />
          <Stat label="Refunds" value={o.refunds} />
          <Stat label="Failed payments" value={o.failed_payments} />
        </div>
      )}
      <div className="mt-6">
        <Tabs<Tab> value={tab} onChange={setTab} items={[{ value: "search", label: "Search & moderation" }, { value: "activations", label: "Paid-sales activations" }, { value: "reports", label: "Reported events" }, { value: "monitoring", label: "Refunds, failures & promos" }, { value: "settings", label: "Settings & exports" }]} />
        <div className="mt-5">
          {tab === "search" && <SearchTab />}
          {tab === "activations" && (
            <ListTab path="/admin/activations" render={({ data }) => (
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="p-3">Event</th><th className="p-3">Organizer</th><th className="p-3">Identity</th><th className="p-3">Payout</th><th className="p-3">Fee</th><th className="p-3">Terms</th><th className="p-3">Status</th></tr></thead>
                  <tbody>{data.map((a: any) => <tr key={a.event_id} className="border-t border-line"><td className="p-3"><Link className="text-brand" href={`/organizer/events/${a.event_id}`}>{a.title}</Link></td><td className="p-3">{a.organizer}</td><td className="p-3"><StatusBadge status={a.identity_status} /></td><td className="p-3">{a.payout ?? "—"}</td><td className="p-3">{a.fee_paid_at ? `${kzt(a.fee_kzt)} paid` : "unpaid"}</td><td className="p-3">{a.terms_accepted_at ? "✓" : "—"}</td><td className="p-3"><StatusBadge status={a.paid_sales_status} /></td></tr>)}</tbody>
                </table>
              </Card>
            )} />
          )}
          {tab === "reports" && (
            <ListTab path="/admin/reports" render={({ data, reload }) => (
              <div className="space-y-3">
                {data.length === 0 && <p className="text-sm text-muted">No reports.</p>}
                {data.map((r: any) => (
                  <Card key={r.id} className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{r.title} {r.suspended_at && <Badge tone="red">suspended</Badge>}</p><p className="text-sm">{r.reason}</p><p className="text-xs text-muted">{r.reporter} · {formatDate(r.created_at)}</p></div>
                    <div className="flex flex-col gap-2">
                      {!r.suspended_at && <Button variant="danger" onClick={() => api(`/admin/events/${r.event_id}/suspend`, { body: { suspended: true, reason: r.reason } }).then(reload)}>Suspend event</Button>}
                      {!r.resolved_at && <Button variant="secondary" onClick={() => api(`/admin/reports/${r.id}/resolve`, { method: "POST" }).then(reload)}>Mark resolved</Button>}
                    </div>
                  </Card>
                ))}
              </div>
            )} />
          )}
          {tab === "monitoring" && (
            <ListTab path="/admin/monitoring" render={({ data }) => (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card><h3 className="mb-2 font-bold">Refunds</h3>{data.refunds.map((r: any) => <p key={r.id} className="border-t border-line py-2 text-sm">{r.code} · {kzt(r.amount_kzt)}<span className="block text-xs text-muted">{r.title} · {r.reason}</span></p>)}</Card>
                <Card><h3 className="mb-2 font-bold">Failed payments</h3>{data.failedPayments.map((p: any) => <p key={p.id} className="border-t border-line py-2 text-sm">{p.title} · {kzt(p.amount_kzt)}<span className="block text-xs text-muted">{p.provider} · {formatDate(p.created_at)}</span></p>)}</Card>
                <Card><h3 className="mb-2 font-bold">Promo code activity</h3>{data.promoActivity.map((c: any) => <p key={c.code + c.title} className="border-t border-line py-2 text-sm"><span className="font-mono">{c.code}</span> · {c.redemptions}{c.max_redemptions ? `/${c.max_redemptions}` : ""}<span className="block text-xs text-muted">{c.title}{!c.active ? " · disabled" : ""}</span></p>)}</Card>
              </div>
            )} />
          )}
          {tab === "settings" && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}
