"use client";
import { useT } from "@/lib/i18n";

export function PricingContent() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">{t("pricingTitle")}</h1>
      <p className="mt-3 text-muted">{t("pricingIntro")}</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-bold uppercase text-green-700">{t("freeEvents")}</p>
          <p className="mt-2 text-4xl font-extrabold">0 ₸</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✓ {t("unlimitedFree")}</li>
            <li>✓ {t("qrPdfCalendar")}</li>
            <li>✓ {t("attendeeCheckin")}</li>
            <li>✓ {t("confirmationEmails")}</li>
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-brand bg-white p-6">
          <p className="text-sm font-bold uppercase text-brand">{t("paidEvents")}</p>
          <p className="mt-2 text-4xl font-extrabold">{t("oneTimeFee")}</p>
          <p className="text-sm text-muted">{t("perEventKzt")}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✓ {t("everythingFree")}</li>
            <li>✓ {t("paidTypesPromo")}</li>
            <li>✓ {t("processingCharge")}</li>
            <li>✓ {t("salesAnalytics")}</li>
          </ul>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">{t("academicMvp")}</p>
    </div>
  );
}
