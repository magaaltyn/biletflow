# Paying from a bank wallet — research and what is implemented

Question: can attendees pay through a Kazakh bank or payment app instead of the demo payment?

## Options checked (November 2026)

| Provider | Public developer docs | Test environment without a contract | Fit for the academic MVP |
|---|---|---|---|
| **Halyk ePay** (Halyk Bank) | Yes — [epayment.kz/en-US/docs](https://epayment.kz/en-US/docs) | **Yes.** Public test merchant, terminal and test cards ([Test credentials](https://epayment.kz/en-US/docs/Test-credentials)) | **Best fit — implemented** |
| **Freedom Pay** | Yes — [freedompay.kz/docs-en/merchant-api/intro](https://freedompay.kz/docs-en/merchant-api/intro) | Partly. New merchants start in test mode, but you first need a merchant account from Freedom Pay | Possible later |
| **Kaspi Pay** | No public payment API for third-party merchants. Kaspi's public API ([guide.kaspi.kz](https://guide.kaspi.kz/partner/ru/shop/api)) covers the Kaspi.kz marketplace | No | Only through an aggregator (e.g. Craftgate, Antom) or a direct agreement with Kaspi |

Notes:
- Halyk requires PCI DSS certification only for card-data-by-API integrations. The **payment page** flow used here keeps card data on Halyk's page, so BiletFlow never sees or stores card numbers (SRS 7).
- Real money needs a merchant contract with the bank and a registered business; that is outside the MVP (SRS 8, "Excluded").

## What BiletFlow does

Two payment providers, chosen on the payment screen:

1. **DEMO** (default, always on) — BiletFlow's own simulated payment page, clearly labelled "no real money". The attendee chooses success or failure, so both paths can be demonstrated.
2. **Halyk ePay test environment** (when `HALYK_ENABLED=true`):
   1. The API gets an OAuth token from Halyk for the invoice (`services/halyk.ts`).
   2. The browser loads Halyk's `payment-api.js` and calls `halyk.pay(...)`, which opens the bank's page.
   3. The attendee pays with a **test card** and returns to the order page.
   4. The API asks Halyk's status API for the real result before issuing tickets; the server-to-server `postLink` callback does the same. The browser's word is never trusted.

Both providers go through the same code (`completePayment` in `api/src/services/orders.ts`), so reservations, ticket issuing, failures and audit logging behave identically. All payment records are stored with `is_demo = true`.

### Turning on Halyk test payments

```
HALYK_ENABLED=true
HALYK_CLIENT_ID=<test ClientID from the Halyk test-credentials page>
HALYK_CLIENT_SECRET=<test ClientSecret>
HALYK_TERMINAL=<test TerminalID>
```

The `postLink` callback needs a public HTTPS address, so on `localhost` the result is confirmed when the attendee returns to the order page. The flow has not yet been run against Halyk's live test servers from this project; test it once before relying on it in the demo.
