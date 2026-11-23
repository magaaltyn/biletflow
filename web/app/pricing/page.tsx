export const metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">Simple pricing</h1>
      <p className="mt-3 text-muted">You only pay when you sell tickets.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="text-sm font-bold uppercase text-green-700">Free events</p>
          <p className="mt-2 text-4xl font-extrabold">0 ₸</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✓ Unlimited events and free tickets</li>
            <li>✓ QR tickets, PDF printing, calendar export</li>
            <li>✓ Attendee list and check-in app</li>
            <li>✓ Confirmation emails</li>
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-brand bg-white p-6">
          <p className="text-sm font-bold uppercase text-brand">Paid events</p>
          <p className="mt-2 text-4xl font-extrabold">One-time fee</p>
          <p className="text-sm text-muted">per event, in KZT (set by the platform; 5 000 ₸ in the demo)</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>✓ Everything in Free</li>
            <li>✓ Paid ticket types and promo codes</li>
            <li>✓ Payment processing charge per order (3% in the demo)</li>
            <li>✓ Sales, campaign and attendance analytics</li>
          </ul>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">Academic MVP: activation fees, ticket payments and payouts are simulations. No real money is moved.</p>
    </div>
  );
}
