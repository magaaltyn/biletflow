"use client";
import {useT, translate} from "@/lib/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Card, ErrorBox, Notice, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

function Verify() {
  const sp = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | unknown>("loading");
  useEffect(() => {
    api("/auth/verify-email", { body: { token: sp.get("token") } }).then(() => setState("ok")).catch(setState);
  }, [sp]);
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <h1 className="text-2xl font-bold">{translate('Email confirmation')}</h1>
      {state === "loading" ? <Spinner /> : state === "ok" ? <Notice tone="green">{translate('Your email is confirmed.')} <Link className="font-semibold underline" href="/">{translate('Continue')}</Link></Notice> : <ErrorBox error={state} />}
    </Card>
  );
}

export default function Page() {
  useT();
  return <div className="px-4 py-12"><Suspense fallback={<Spinner />}><Verify /></Suspense></div>;
}
