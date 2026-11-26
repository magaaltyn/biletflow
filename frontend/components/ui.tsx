"use client";
import Link from "next/link";
import { translate, useT } from "@/lib/i18n";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-dark disabled:bg-slate-300",
  secondary: "border border-line bg-white text-ink hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-red-600 text-on-brand hover:bg-red-700 disabled:bg-slate-300",
};

export function Button({ variant = "primary", className, loading, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  useT();
  const content = typeof children === "string" ? translate(children) : children;
  return (
    <button
      {...props}
      aria-label={props["aria-label"] ? translate(props["aria-label"]) : undefined}
      title={props.title ? translate(props.title) : undefined}
      disabled={props.disabled || loading}
      className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed", variants[variant], className)}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {content}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  useT();
  const content = typeof children === "string" ? translate(children) : children;
  return (
    <Link href={href} className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition", variants[variant], className)}>
      {content}
    </Link>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  useT();
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{translate(label)}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{translate(hint)}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => { useT(); return <input {...p} placeholder={p.placeholder ? translate(p.placeholder) : undefined} aria-label={p["aria-label"] ? translate(p["aria-label"]) : undefined} className={cx(inputCls, p.className)} />; };
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => { useT(); return <textarea {...p} placeholder={p.placeholder ? translate(p.placeholder) : undefined} aria-label={p["aria-label"] ? translate(p["aria-label"]) : undefined} className={cx(inputCls, "min-h-24", p.className)} />; };
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => { useT(); return <select {...p} aria-label={p["aria-label"] ? translate(p["aria-label"]) : undefined} className={cx(inputCls, p.className)} />; };

const tones = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-800",
  purple: "bg-violet-50 text-violet-700",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  useT();
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{typeof children === "string" ? translate(children) : children}</span>;
}

const statusTone: Record<string, keyof typeof tones> = {
  paid: "green", valid: "green", active: "green", published: "green", succeeded: "green", resolved: "green", verified: "green", upcoming: "blue",
  pending: "amber", held: "amber", in_progress: "amber", waiting_for_customer: "purple", open: "blue", draft: "gray", inactive: "gray", completed: "gray",
  checked_in: "blue", failed: "red", expired: "gray", cancelled: "red", refunded: "red", suspended: "red",
};
export const StatusBadge = ({ status }: { status: string }) => { useT(); return <Badge tone={statusTone[status] ?? "gray"}>{translate(status.replace(/_/g, " "))}</Badge>; };

export const Spinner = () => {
  useT();
  return (
  <div className="flex justify-center py-12" role="status" aria-label={translate('Loading')}>
    <span className="size-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
  </div>
  );
};

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  useT();
  if (!error) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      {error instanceof Error ? error.message : String(error)}
      {onRetry && (
        <button onClick={onRetry} className="ml-3 font-semibold underline">
          {translate("Retry")}
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "green"; children: ReactNode }) {
  useT();
  const content = typeof children === "string" ? translate(children) : children;
  const c = { blue: "border-blue-200 bg-blue-50 text-blue-900", amber: "border-amber-200 bg-amber-50 text-amber-900", green: "border-green-200 bg-green-50 text-green-900" }[tone];
  return <div className={cx("rounded-xl border p-3 text-sm", c)}>{content}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  useT();
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-semibold">{translate(title)}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  useT();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold", value === i.value ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}
        >
          {translate(i.label)}
          {i.count !== undefined && <span className="ml-1 text-xs text-muted">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  useT();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{translate(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{typeof subtitle === "string" ? translate(subtitle) : subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  useT();
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{translate(label)}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{translate(hint)}</p>}
    </Card>
  );
}

export { cx };
