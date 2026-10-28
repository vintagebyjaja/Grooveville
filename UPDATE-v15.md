# Grooveville update v15

Released 2026-10-28. Upload these files into your repo **keeping the same folders**. Everything else stays as it is.

## Changed files (7)
- `firestore.rules`
- `index.html`
- `scripts/sync-secrets.mjs`
- `shadowcrown/sc.css`
- `shadowcrown/sc.js`
- `worker/content.js`
- `worker/index.js`

## New files (4)
- `CREATIVE-STUDIO-SETUP.md`
- `GROOVE-READS-SETUP.md`
- `SOUND-LAB-SETUP.md`
- `worker/creative.js`

## Delete these from the repo (0)
Nothing to delete.

`version.txt` is included every time so you can check what's live at grooveville.org/version.txt


## After you upload (one-time steps)
1. **Firebase › Firestore › Rules:** paste the new `firestore.rules` and click Publish. Creative Studio and Sound Lab stay blocked until you do.
2. **Stripe (only when you're ready to sell on Groove Reads):** add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the Cloudflare build variables and create the webhook. See `GROOVE-READS-SETUP.md`.
3. Nothing else changes: same domain, DNS, Firebase project, R2 bucket and existing keys.
