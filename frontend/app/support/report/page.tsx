"use client";
import {useT, translate} from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, ErrorBox, Field, Notice, PageTitle, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";

function Report() {
  useT();
  const { user } = useRequireUser();
  const sp = useSearchParams();
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageTitle title={translate('Report an event')} subtitle={translate('Platform admins review every report.')} />
      <Card>
        {done ? (
          <Notice tone="green">{translate('Thank you. Our team will review this event.')}</Notice>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/events/${sp.get("eventId")}/report`, { body: { reason } });
                setDone(true);
              } catch (x) {
                setErr(x);
              }
            }}
          >
            <Field label={translate('What is wrong with this event?')}><Textarea required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <ErrorBox error={err} />
            <Button type="submit">{translate('Send report')}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  useT();
  return <Suspense fallback={<Spinner />}><Report /></Suspense>;
}
