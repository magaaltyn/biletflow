# BiletFlow Frontend Prototype

Responsive event ticketing UI built with React, TypeScript, Vite and Tailwind CSS. Based on the supplied BiletFlow SRS and screenshot.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually http://localhost:5173).

## Production build

```bash
npm run build
npm run preview
```

## Implemented prototype screens

- Event discovery with live text search and city/category/price filters
- Event details and ticket type/quantity selection
- Interactive seat map with available, selected, premium, and sold seat states
- Checkout form and clearly labelled simulated payment methods
- Ticket preview with print/save-as-PDF browser action and illustrative QR placeholder
- Organizer dashboard with sample sales charts, ticket mix and orders
- My orders screen
- Responsive desktop/mobile navigation

## Important integration notes

All content is mock data. There is no backend/API integration yet. Do not treat the frontend as an authority for price, seat availability, payment state, discounts, ticket validity or check-in. The Node.js API and PostgreSQL database must validate these on the server. The QR displayed on the demo ticket is illustrative only and must be replaced by a server-generated signed/opaque ticket token. Browser print is a temporary placeholder for the server-generated canonical ticket PDF required by the SRS.

Suggested next step: agree API contracts for `auth`, `events`, `ticket-types`, `seat-holds`, `orders`, `payments`, `tickets`, `organizer analytics`, and `support` before connecting screens.
