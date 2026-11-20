export const metadata = { title: "Terms & privacy" };

export default function Terms() {
  return (
    <div className="prose mx-auto max-w-3xl px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-extrabold text-ink">Terms & privacy</h1>
      <p className="mt-4">BiletFlow is an academic prototype. Payments, activation fees and payouts are clearly labelled simulations; no real money is charged.</p>
      <h2 className="mt-6 text-xl font-bold text-ink">Organizers</h2>
      <p>Organizers are responsible for the legality and description of their events and for their refund policy. Paid sales require a completed activation checklist and can be suspended by platform admins.</p>
      <h2 className="mt-6 text-xl font-bold text-ink">Your data</h2>
      <p>We store your name, email and orders to issue tickets. Passwords are stored as secure hashes. Card data is never stored by BiletFlow. Printed tickets contain only the event, ticket and attendee name.</p>
      <h2 className="mt-6 text-xl font-bold text-ink">Free tickets</h2>
      <p>Each account can hold one free ticket per event.</p>
    </div>
  );
}
