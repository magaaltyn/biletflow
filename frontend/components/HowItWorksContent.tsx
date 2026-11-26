"use client";
import { useT } from "@/lib/i18n";

export function HowItWorksContent() {
  const { t } = useT();
  const items = [
    [t("howFindTitle"), t("howFindText")],
    [t("howChooseTitle"), t("howChooseText")],
    [t("howPayTitle"), t("howPayText")],
    [t("howTicketTitle"), t("howTicketText")],
    [t("howEnterTitle"), t("howEnterText")],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">{t("howTitle")}</h1>
      <ol className="mt-8 space-y-4">
        {items.map(([heading, description], i) => (
          <li key={heading} className="flex gap-4 rounded-2xl border border-line bg-white p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-on-brand">{i + 1}</span>
            <div>
              <p className="font-semibold">{heading}</p>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
