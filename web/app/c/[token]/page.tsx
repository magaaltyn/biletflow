"use client";
// Campaign QR codes open /c/<token>. The token is opaque; the server validates it and the discount (SRS 4.14).
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export default function CampaignRedirect() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    api<{ slug: string; token: string }>(`/events/campaign/${encodeURIComponent(token)}`)
      .then((r) => router.replace(`/events/${r.slug}?c=${encodeURIComponent(r.token)}`))
      .catch(setErr);
  }, [token, router]);
  return <div className="mx-auto max-w-md px-4 py-16">{err ? <ErrorBox error={err} /> : <Spinner />}</div>;
}
