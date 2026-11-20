"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, ErrorBox, Field, Notice, PageTitle, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";

function Report() {
  const { user } = useRequireUser();
  const sp = useSearchParams();
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <PageTitle title="Report an event" subtitle="Platform admins review every report." />
      <Card>
        {done ? (
          <Notice tone="green">Thank you. Our team will review this event.</Notice>
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
            <Field label="What is wrong with this event?"><Textarea required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <ErrorBox error={err} />
            <Button type="submit">Send report</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Spinner />}><Report /></Suspense>;
}
