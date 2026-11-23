"use client";
import { useRouter } from "next/navigation";
import { EventForm } from "@/components/organizer/EventForm";
import { Card, PageTitle, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/hooks";

const ROLES = ["organizer", "platform_admin"];

export default function NewEvent() {
  const { user } = useRequireUser(ROLES);
  const router = useRouter();
  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageTitle title="Create event" subtitle="It starts as a draft. Add ticket types, preview, then publish." />
      <Card>
        <EventForm
          submitLabel="Create draft"
          onSubmit={async (v) => {
            const e = await api<{ id: number }>("/organizer/events", { body: v });
            router.push(`/organizer/events/${e.id}?tab=tickets`);
          }}
        />
      </Card>
    </div>
  );
}
