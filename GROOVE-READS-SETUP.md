# Groove Reads — setup

Groove Reads is the public bookstore and reader at **grooveville.org/#reads**. Paid pages and audio are checked by the Worker on every request; the browser never receives pages a reader hasn’t unlocked.

## 1. Stripe (needed before anything can be sold)

1. Stripe Dashboard › Developers › **API keys**: copy the **Secret key** (`sk_live_…`, or `sk_test_…` while testing).
2. Stripe Dashboard › Developers › **Webhooks › Add endpoint**
   - URL: `https://grooveville.org/api/reads/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`
   - Copy the endpoint’s **Signing secret** (`whsec_…`).
3. Cloudflare › Workers & Pages › **grooveville** › Settings › Build › **Variables** (the same place as your other keys) add:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - optional `READS_SECRET` (any long random text; signs short-lived file links. If missing, another existing secret is used.)
4. Redeploy. The deploy command copies them into the Worker as encrypted secrets.

Until `STRIPE_SECRET_KEY` is set, Buy buttons say “Checkout isn’t connected yet”. Free previews still work.

## How it works

- Prices come from the published edition on the server, never from the browser.
- A purchase is granted only after a verified Stripe webhook, once per payment (repeat webhooks are ignored).
- Refunds remove access by default (Publishing › Refund policy). Disputes are recorded for you to review.
- Each book shows the first 5 pages (or the number you set). Page 6 onward returns “payment required” from the server.
- Digital book, audiobook (MP3) and bundle are separate products; a purchase unlocks only the formats set on that product. MP4 read-along video and PDF downloads are only offered if you turn them on per book.
- Staff access: Creative Studio dashboard › Who can use Creative Studio › tick “Grooveville staff books” or “Shadow Crown staff books”, then tick the staff grant on each book.

## Publishing a book

Book Studio › your book › **Publish**: set prices, formats, downloads and preview pages, then **Publish to Groove Reads**. Tick “Show on the Shadow Crown website” to list it on shadowcrown pages too.
