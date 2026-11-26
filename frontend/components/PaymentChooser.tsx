"use client";
import { useState } from "react";
import { startPayment } from "@/lib/pay";
import {useT, translate} from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Button, ErrorBox, Notice } from "./ui";

/** Payment method picker: DEMO (Kaspi / card simulation) or Halyk ePay test environment when enabled. */
export function PaymentChooser({ path, amountLabel }: { path: string; amountLabel: string }) {
  const { t } = useT();
  const { config } = useSession();
  const [provider, setProvider] = useState<"demo" | "halyk">("demo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const options = [
    { value: "demo" as const, label: translate("Kaspi Pay / Visa / Mastercard"), note: translate("DEMO simulation — no real money") },
    ...(config.halykEnabled ? [{ value: "halyk" as const, label: translate("Halyk ePay (bank test environment)"), note: translate("Opens Halyk Bank's test payment page; use a test card") }] : []),
  ];
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await startPayment(path, provider);
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{t("paymentMethod")}</p>
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${provider === o.value ? "border-brand bg-brand-soft" : "border-line"}`}>
          <input type="radio" name="provider" checked={provider === o.value} onChange={() => setProvider(o.value)} />
          <span>
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className="block text-xs text-muted">{o.note}</span>
          </span>
        </label>
      ))}
      <Notice tone="amber">{t("demoNotice")}</Notice>
      <ErrorBox error={err} />
      <Button className="w-full" onClick={go} loading={busy}>
        {t("pay")} {amountLabel} 🔒
      </Button>
    </div>
  );
}
