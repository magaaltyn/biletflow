export const metadata = { title: "How it works" };

const items = [
  ["Find an event", "Search by city, category, date or price. Event pages show the venue map and, for seated events, the view from each section."],
  ["Choose tickets or seats", "Pick ticket types, or choose seats on the interactive seat map. Seats are held for you while you check out."],
  ["Pay or register", "Free events need no payment. Each account can get one free ticket per event. Paid tickets use a DEMO payment in this version."],
  ["Get your QR ticket", "Tickets appear in My Orders and in your email. Download a print-ready PDF or add the event to your calendar."],
  ["Enter the event", "Show the QR code on your phone or on paper. Each ticket can be scanned once."],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold tracking-tight">How BiletFlow works</h1>
      <ol className="mt-8 space-y-4">
        {items.map(([h, p], i) => (
          <li key={h} className="flex gap-4 rounded-2xl border border-line bg-white p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">{i + 1}</span>
            <div>
              <p className="font-semibold">{h}</p>
              <p className="mt-1 text-sm text-muted">{p}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
