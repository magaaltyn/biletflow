"use client";
import { Suspense } from "react";
import { LoginForm } from "@/components/AuthForms";
import { Spinner } from "@/components/ui";

export default function Page() {
  return <div className="px-4 py-12"><Suspense fallback={<Spinner />}><LoginForm /></Suspense></div>;
}
