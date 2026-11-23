import { LinkButton } from "@/components/ui";

export const metadata = { title: "For organizers" };

const steps = [
  ["Create your event", "Title, venue, date, images and visibility (public, unlisted or private). Pick a venue with a seat map for assigned seating."],
  ["Add tickets", "Free and paid ticket types with prices, quantities, sale periods and per-order limits."],
  ["Publish and promote", "Share the page or print a Campaign QR code that applies a promo code automatically."],
  ["Check people in", "Assign Event Admins who scan QR tickets with the BiletFlow Scanner app or the website."],
];

export default function Organizers() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">Organize your event with BiletFlow</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">Creating events and giving out free tickets is free. Paid sales are switched on per event after a short activation checklist.</p>
      <div className="mt-6 flex gap-3">
        <LinkButton href="/register?organizer=1">Get started for free</LinkButton>
        <LinkButton href="/pricing" variant="secondary">See pricing</LinkButton>
      </div>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2">
        {steps.map(([h, p], i) => (
          <li key={h} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm font-bold text-brand">Step {i + 1}</p>
            <p className="mt-1 font-semibold">{h}</p>
            <p className="mt-1 text-sm text-muted">{p}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
