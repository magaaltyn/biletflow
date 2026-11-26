# BiletFlow frontend localization — completed source pass

## What changed

- Extended the existing localization layer for Kazakh (`kk`), Russian (`ru`) and English (`en`). The existing `bf_lang` preference and language switch are retained.
- Replaced the English-only How It Works and Pricing pages with localized client content components while keeping route-level metadata on the server pages.
- Localized shared navigation, footer, notification empty state, skip link, common UI controls, form labels, placeholders, buttons, badges, status labels, tabs, empty states and statistics.
- Localized customer-facing pages and flows: home/event discovery, event details, ticket and seat selection, orders, ticket details, payment simulation, account settings, sign-in/registration/password recovery, and email confirmation.
- Localized organizer workflows: dashboard, event creation/editing, venue/seating controls, ticket types, paid-sales activation, campaigns, attendees, orders/refunds, staff, history, analytics and organizer profile.
- Localized platform administration, check-in, support cases, event reports, Terms and Privacy pages.
- Added client-side legal page components with separate server route layouts so the pages retain their metadata.
- Preserved existing routes, API calls, form state, event behavior, design classes and component structure. No backend/API behavior was intentionally changed.

## Localization boundaries

The UI chrome and fixed interface copy are translated. User-authored event names/descriptions, organizer-entered content, notification content supplied by the backend, arbitrary server error messages, and other free-text API content remain in the language in which that content was created or returned. Those values should not be machine-translated automatically because doing so could change user-provided meaning or server diagnostics.

## Validation performed

- Transpiled all 51 TypeScript/TSX source files with the installed TypeScript transpiler: **0 syntax diagnostics**.
- Checked all literal calls to the shared `translate()` helper against the phrase dictionary or core dictionary: **0 unmapped literal keys**.
- Checked the phrase dictionary for duplicate keys: **0 duplicates**.
- `npm ci` timed out in this environment. As a result, a full dependency-backed TypeScript typecheck, `next build`, and browser/runtime regression test could not be completed. Do not treat the syntax transpilation check as a substitute for those tests.

## GitHub status

These edits are in this ZIP working copy. The GitHub integration returned HTTP 403 (Resource not accessible by integration) when attempting to write to the repository, so **the `main` branch on GitHub has not been updated**. Copy this `frontend` folder over the repository's `frontend` folder, run `npm ci`, `npm run typecheck`, and `npm run build`, then commit and push to `main` from your own GitHub/local Git access.
