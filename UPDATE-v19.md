# Grooveville update v19

Released 2026-11-19.

## Grooveville Rentals + Grooveville Entertainment portals

**Do not merge this to production yet.** Upload it to a new branch (for example `portals-preview`), test with Stripe test cards, and merge into `cloudflare-migration` only once you approve. Everything ships switched off, in test mode.

Read **PORTALS-SETUP.md** first: create the D1 database, add the Stripe webhook events, and confirm your bank account in Stripe.

### What's new
- **Rentals portal** (`/rentals`): tenant dashboard, listings, requests with conflict-free reservations, one-time / weekly / biweekly / monthly billing, deposits, receipts and payment history. Personal-residence listings record the legal landlord and are tracked apart from Grooveville revenue.
- **Electronic signatures:** upload a PDF or build one from a template, place fields, set the signing order, and send. Signers type to sign (cursive plus printed legal name) with an unchecked consent box and the ESIGN/UETA disclosure. Countersignature works too. The completed PDF includes a certificate page and a SHA-256 fingerprint, and anyone can check a copy at `/#verify`.
- **Entertainment** (`/entertainment`):
  - host profiles and the Peach Verified badge (admins only);
  - events with public, unlisted, private or password visibility;
  - share links and QR codes;
  - guest checkout with ticket tiers, promo codes and capacity limits;
  - QR tickets and door check-in that catches duplicate and void tickets.
- **Locations & pricing:** owned, partner and external venues. Option A (flat rental) and Option B (revenue share with minimum guarantee and deposit) are shown side by side. Accepted terms are locked, and changes need an amendment.
- **Finance:**
  - Stripe Checkout and settlements, which the founder approves;
  - Stripe Connect payouts that wait for available funds;
  - refunds, and the effects of disputes;
  - CSV reports;
  - gross volume, Grooveville revenue and host payables shown separately.
- **Back Office › Rentals & Events:** approvals, agreements, billing, hosts, locations, events, finance, roles, the audit log and the founder switches.

### Tests
- Server: 141 automated checks pass (money math, overselling under concurrency, signatures, webhooks, settlements, payouts).
- Browser: 48 end-to-end checks pass in Chromium on desktop and iPhone size, covering the request → agreement → signature → payment flow and the event → ticket → check-in flow.

### Rentals look (updated)
- Tenant-facing pages (Rentals, Profile & Settings, agreement signing, Verify) use a light theme: warm cream background, white cards and dark text, with the peach accent and a daytime house illustration. Entertainment and the back office stay dark.
- The portal header uses the approved logo published on the website (Website Studio › Brands › Grooveville Rentals). If none is set, it uses the Grooveville LLC logo, and then `/logo.webp`.


## Changed files (6)
- `.assetsignore`
- `index.html`
- `scripts/sync-secrets.mjs`
- `worker/creative.js`
- `worker/index.js`
- `wrangler.jsonc`

## New files (20)
- `PORTALS-SETUP.md`
- `migrations/0001_portals.sql`
- `portal/portal.css`
- `portal/pv-admin.js`
- `portal/pv-core.js`
- `portal/pv-ent.js`
- `portal/pv-esign.js`
- `portal/pv-rentals.js`
- `portal/qr.js`
- `vendor/pdf-lib/LICENSE.md`
- `vendor/pdf-lib/pdf-lib.min.js`
- `worker/portal/admin.js`
- `worker/portal/api.js`
- `worker/portal/core.js`
- `worker/portal/docs.js`
- `worker/portal/ent.js`
- `worker/portal/finance.js`
- `worker/portal/pricing.js`
- `worker/portal/rentals.js`
- `worker/portal/settle.js`

## Delete these from the repo (0)
Nothing to delete.
