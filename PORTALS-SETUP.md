# Grooveville Rentals + Entertainment portals: setup

Everything ships **switched off**. Payments run in Stripe **test mode** until you turn on live payments yourself. Nothing here changes your DNS, domains or existing secrets.

## 1. Database (Cloudflare D1)

The portals keep their records in a D1 database bound as `PORTAL_DB` (see `wrangler.jsonc`).

- **Safest:** Cloudflare dashboard › Storage & Databases › D1 › Create › name it `grooveville-portal`. Copy its **Database ID** into `wrangler.jsonc` as `"database_id": "…"` next to `"database_name"`.
- If you skip this, current Wrangler versions create the database on the first deploy. If the deploy log says it couldn't, do the step above.
- The Worker creates its own tables the first time it runs. `migrations/0001_portals.sql` is the same schema, for reference.

## 2. Stripe (your existing account)

Your `STRIPE_SECRET_KEY` is already in Cloudflare, so checkout works as soon as the code deploys. A `sk_test_…` key means test mode; a `sk_live_…` key is **blocked** until you turn on **Live payments** in Back Office › Rentals & Events.

**Webhook.** In Stripe › Developers › Webhooks, open the endpoint you already have (`https://grooveville.org/api/reads/stripe`) and add these events:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`
- `transfer.reversed`

The existing handler forwards portal events, so no new secret is needed. (You can instead add a separate endpoint at `/api/p/stripe` and save its signing secret as `STRIPE_PORTAL_WEBHOOK_SECRET`.)

**Getting money to your bank.** Stripe pays your balance to the bank account set in Stripe › Settings › Payouts (Business settings › Bank accounts and scheduling). Add or confirm your bank account there and choose the payout schedule. Grooveville never sees or stores bank details. Rent paid to a personal-residence listing still lands in the Grooveville Stripe account. It's tracked separately as personal residence income in reports, so ask your accountant how to move and record it.

**Manual host settlements.** Paid tickets use Grooveville’s Stripe account. Free events and zero-dollar RSVPs issue tickets without a Stripe charge. Hosts can review their event earnings. In **Finance & settlements**, the founder approves the contractual amount, pays the host externally, and records the date, amount, method, and optional reference. Recording the payment creates a ledger entry and audit record. Legacy transfers remain in the history. Review pending legacy records against Stripe before recording an external payment for the same obligation.

Confirm that Grooveville’s Stripe agreement and each host agreement permit this collection and external settlement model, including the seller shown to ticket buyers and who handles refunds and disputes. Stripe lists certain third-party payment aggregation as restricted. See https://stripe.com/legal/restricted-businesses.

## 3. Optional

- `RESEND_API_KEY` + `MAIL_FROM` (e.g. `Grooveville <tickets@grooveville.org>`): emails tickets, signature requests and receipts. Without them, notifications show in the portal, and buyers see their tickets on the confirmation page.
- `PORTAL_SECRET`: signing key for private file links. If it isn't set, an existing secret is used.

Add these in Cloudflare › Workers › grooveville › Settings › Variables and secrets, or in the GitHub build secrets that `scripts/sync-secrets.mjs` already copies.

## 4. Switches (Back Office › Rentals & Events › Overview, founder only)

| Switch | What it does |
|---|---|
| Rentals portal open | Customers can browse and request rentals |
| Entertainment open | Public event pages and ticket sales for published events |
| Live payments | Allows real charges with a live Stripe key |
| Production e-signing | Lets customers sign when live keys are in use (testers and admins can always sign) |

Add testers in Settings › People & roles. They can preview closed portals.

## 5. Before going live: things to confirm

- **Agreement templates** are starting points. Have a lawyer licensed in your state review them, especially the residential template (landlord-tenant law varies by state).
- **Vehicle rentals** stay blocked until you confirm insurance and compliance on each vehicle listing.
- **Sales tax** isn't collected. Ask your accountant whether any rentals or tickets need it.
- **Credit reporting:** the portal does not report rent to credit bureaus. The Self card links to Self's own service.
- **E-signatures** are ESIGN/UETA electronic signatures with an audit trail and SHA-256 fingerprints. They aren't cryptographic certificate signatures.

## 6. Safe rollout

1. Upload this update to a new branch (for example `portals-preview`). Cloudflare builds a preview URL for it.
2. Test there in Stripe test mode: card `4242 4242 4242 4242`, any future date, any CVC.
3. When you're happy, merge into `cloudflare-migration` to deploy. Then turn the switches on one at a time.


## Special Invites on a branch preview

Set Stripe test credentials on that preview and provision an isolated D1 database. The collection uses the existing Stripe portal webhook. Subscribe to Checkout completion, async success/failure, expiry, and charge refund events. Stripe confirmation of exactly USD $5 unlocks one event. A partial refund reduces upgrade revenue and retains access. A full refund revokes premium access and disables its premium links. The free Private Letter stays available. A new verified purchase unlocks the collection again, including prior premium links the host has not revoked.

A personalized link for a private event grants access to someone who holds the link. Hosts can revoke it. Password-protected events retain the standard password flow. Opens and reveals are engagement counts rather than RSVPs. Ticket revenue and RSVPs are attributed only after a linked order completes. The visitor estimate uses a separate random ID for each browser and invitation. If an upgrade remains pending after a network failure, the host can resume the same Stripe checkout. Review a stuck upgrade in Back Office and Stripe before starting a replacement.

Confirm in Stripe test mode before offering the $5 upgrade to customers. This upgrade has its own revenue report under **Special Invites**.
