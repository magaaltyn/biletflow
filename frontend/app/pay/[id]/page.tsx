"use client";
import {useT, translate} from "@/lib/i18n";
// DEMO payment page (SRS 3.2, 4.6): clearly labelled simulation. No card data is entered or stored.
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { api, kzt } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

export default function DemoPayPage() {
  useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useRequireUser();
  const { data: p, error, loading } = useApi<any>(user ? `/payments/${id}` : null);
  const [method, setMethod] = useState("kaspi");
  const [busy, setBusy] = useState<null | "ok" | "fail">(null);
  const [err, setErr] = useState<unknown>(null);

  if (loading || !user) return <Spinner />;
  if (error || !p) return <div className="mx-auto max-w-md px-4 py-16"><ErrorBox error={error} /></div>;

  const back = p.purpose === "activation_fee" ? `/organizer/events/${p.event_id}?tab=activation` : `/orders/${p.order_id}`;
  const finish = async (success: boolean) => {
    setBusy(success ? "ok" : "fail");
    setErr(null);
    try {
      await api(`/payments/${p.id}/demo`, { body: { success, method } });
      if (p.purpose === "activation_fee") await api(`/organizer/events/${p.event_id}/activation/check`, { method: "POST" }).catch(() => undefined);
      router.push(back);
    } catch (e) {
      setErr(e);
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="mb-4 rounded-xl bg-amber-400 px-4 py-2 text-center text-sm font-bold text-amber-950">{translate('DEMO PAYMENT — SIMULATION, NO REAL MONEY')}</div>
      <Card className="space-y-4">
        <div>
          <p className="text-sm text-muted">{p.purpose === "activation_fee" ? "Paid Sales Activation Fee" : `Order ${p.order_code}`}</p>
          <p className="text-lg font-bold">{p.title}</p>
          <p className="mt-2 text-3xl font-extrabold text-brand">{kzt(p.amount_kzt)}</p>
        </div>
        {p.status !== "pending" ? (
          <>
            <p className="text-sm">{translate('This payment is already')} <b>{p.status}</b>.</p>
            <Button onClick={() => router.push(back)}>{translate('Continue')}</Button>
          </>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{translate('Simulated method')}</legend>
              {[["kaspi", "Kaspi Pay (demo)"], ["card", "Visa / Mastercard (demo)"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm">
                  <input type="radio" checked={method === v} onChange={() => setMethod(v)} /> {l}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-muted">{translate('Choose the outcome to test both paths. Nothing is charged and no card details are collected.')}</p>
            <ErrorBox error={err} />
            <Button className="w-full" onClick={() => finish(true)} loading={busy === "ok"} disabled={busy !== null}>{translate('Simulate successful payment')}</Button>
            <Button className="w-full" variant="secondary" onClick={() => finish(false)} loading={busy === "fail"} disabled={busy !== null}>{translate('Simulate failed payment')}</Button>
          </>
        )}
      </Card>
    </div>
  );
}
