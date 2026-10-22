# Grooveville update v8

Released 2026-10-22. Upload these files into your repo **keeping the same folders**. Everything else stays as it is.

Copies the keys you saved under Build variables into the live site automatically after each deploy (scripts/sync-secrets.mjs). Change the Deploy command to: npx wrangler deploy && node scripts/sync-secrets.mjs

## Changed files (1)
- `.assetsignore`

## New files (1)
- `scripts/sync-secrets.mjs`

## Delete these from the repo (0)
Nothing to delete.

`version.txt` is included every time so you can check what's live at grooveville.org/version.txt
