# Grooveville: The Creative House

The website for **Grooveville LLC** and the nine companies on the Groove Vine: Grooveville Entertainment (with Grooveville Music and Grooveville Radio), AELIO, Vybr8, Pathd, DrawUp AEC, Shadow Crown Universe, What If Tomorrow, Grooveville Rentals and W4W.

- **Hosting:** Cloudflare (Workers static assets) at **grooveville.org**. No build step.
- **Logins and data:** Firebase (free Spark plan): Authentication + Firestore.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | The whole Grooveville site: cinematic entry, home, company pages, Entertainment › Music & Radio, AELIO, calendar, collaborate, Groove Team sign in and the Back office |
| `media/` | Default photos used by the site. Replace any of them from **Back office › Website › Media library** (no code changes needed) |
| `shadowcrown/` | The Shadow Crown Universe site and the **Living World** game (see `shadowcrown/README.md`) |
| `firebase-config.js` | Your public Firebase web config |
| `firestore.rules` | Security rules. **Publish these in Firebase every time they change** |
| `_headers` | Security and cache headers for Cloudflare |
| `worker/`, `wrangler.jsonc` | Cloudflare Worker: YouTube live/archive sync and private Studio file links |
| `STUDIO-SETUP.md` | Step-by-step setup for Grooveville LIVE and the Studio |
| `clip-worker/` | Notes for the future AI clip processing computer |

## 1. Update the site on GitHub

Replace the files in your repository with the files in this folder (keep the same folder structure) and commit. Cloudflare redeploys automatically. Delete old leftovers if they're still in the repo (`netlify.toml`, `shadowcrown/source/`, `shadowcrown/styles.css`, `shadowcrown/app.js`, `part*.js`, `build.py`, `grooveville.html`).

## 2. Publish the new Firebase rules (required for this update)

Firebase console › **Firestore Database** › **Rules** › replace everything with `firestore.rules` › **Publish**.
This update adds three collections: `media` (website images, founder/HNIC only can change), `scsave` and `scplayers` (Shadow Crown saves and player cards; each player only writes their own).

Without this step, **Back office › Website** can't save images and Shadow Crown can't sync progress.

## 3. Cloudflare and domain

Already set up: the Worker serves this repository's files at grooveville.org and www.grooveville.org (Workers & Pages › grooveville › Settings › Domains & Routes). If the site ever stops loading, check that both custom domains are listed there; Cloudflare creates the DNS records for you.

In Firebase: **Authentication › Settings › Authorized domains** should list `grooveville.org`, `www.grooveville.org` and `grooveville.jaja-a20.workers.dev`.

## 4. What's new

- **Cinematic entry:** first visit each session opens a letterboxed, game-style title sequence on the Charlotte drive picture (bars open, light and motion effects, GROOVEVILLE title card, then **LET'S GROOVE**). **Skip intro** and **SOUND ON/OFF** (starts off) are always there. Replace the picture or add a licensed film in **Back office › Website › Media library › Cinematic entry**.
- **Separate pages instead of one long scroll:** Home (hero), Companies (the original **Groove Vine**; hover a grape cluster for details, tap twice on phones) › Explore the brands, Calendar (upcoming events, then the calendar), Collaborate (photo + request form), Our Story. The Grooveville LLC page's website button returns to the home page.
- **AELIO** replaces MUSIC on the vine (same spot, same lime color) and has its own page with the six personalities and a link to https://aelio.live/.
- **Entertainment** now has **Overview · Music · Grooveville Radio · Featured Artists · Events**. Old Music links (`#b-music`) forward to Entertainment › Music. Music's timesheet slot and data are unchanged.
- **Grooveville Radio:** a mini-player that stays open while you move around the site. Set a Spotify playlist link (or a stream you own or license) in **Back office › Website › Music & Radio**.
- **Back office › Website:** Media library (replace any image, focal point, zoom, alt text, publish/unpublish, restore previous, back to default), Companies (order, featured, published), AELIO page text and personalities, Music & Radio lists (featured, trending with source labels, artists, playlists, releases).

**Image storage:** images are resized in the browser and stored in Firestore (the free plan has no file storage). Videos and audio are added as links to files you host (for example a `media/` folder in this repo, or Cloudflare R2).


## Grooveville LIVE + Entertainment Studio

**Set up first:** follow `STUDIO-SETUP.md` (R2 bucket, YouTube API key, Worker secrets) **before** uploading this version.

- **Watch Live** (`#live`): The Unc & Neph Show's live YouTube stream plays on Grooveville automatically, with a LIVE badge only when YouTube confirms it. When off air it shows the next scheduled show. Below it: **Watch & follow us everywhere** (YouTube, Twitch, Instagram, Facebook, TikTok) and **Previous episodes** (every completed livestream, newest first, each card opens that episode on YouTube, Load more).
- **Radio hand-off:** starting the live player pauses Grooveville Radio; stopping it resumes the radio only if it was playing and you didn't pause it yourself.
- **Back Office › Ent. Studio** (also **Studio** in the menu for invited team members): Live Control, AI Clip Studio, Episode Library, Content Calendar, Publishing Queue, Team Management, Analytics, Show Settings. Add more shows with **+ New show**; each show has its own YouTube channel and social links.
- **Server code:** `worker/index.js` + `wrangler.jsonc` (Cloudflare Worker). It checks YouTube every 2 minutes and keeps the API key secret.
- **AI clipping** needs a processing computer later: see `clip-worker/README.md`. Jobs wait safely in the queue until then.

## 5. Make yourself the founder

1. Open your site, click **Sign in** > **Create team account** with your email and a strong password.
2. In Firebase: **Authentication** > **Users**, copy your **User UID**.
3. **Firestore Database** > **Start collection** > Collection ID `access` > Document ID = your UID > add a field `role` (string) = `founder` > Save.
4. Reload the site and sign in. You now see **Back office** with everything.

**Backup admin (HNIC):** to give a second account the same full access, have it create an account on the site, copy its User ID from **My portal → Your account**, then add another document in the `access` collection with that User ID as the Document ID and the field `role` (string) = `hnic`. Use it if your main founder account ever has trouble signing in.

## 6. Teams, company heads and join requests

1. A new person opens the site > **Sign in** > **Create team account**, then picks the company team(s) they want to join and clicks **Ask to join**.
2. **You (founder)** see every request in **Back office > Teams**. Click **Approve** or **Decline**, or use **Add a person** to put someone on a team directly.
3. **Company heads:** in **Back office > Teams**, use **Make head** under a company to pick its head (they must have an account first). A head gets a **My team** tab where they approve or decline people asking to join *their* company and add or remove members. Heads can't touch other companies.
4. Approved people sign in and see **My timesheet**. They can log meetings, work hours, money spent, receipts (with a photo) and money in (payments, donations, sponsorships and more) for their company. They never see the back office, other people's entries, private events, reminders, collabs or private notes. Heads can join more teams the same way.

## Private notes

**Back office > Private notes** is for passwords, log ins and account details. Notes are encrypted in your browser before anything is saved, so not even Firebase can read them.

When you set it up you choose a passphrase and enter your recovery emails and mobile number. The site then shows a **one-time recovery code** with buttons to email it to both addresses and text it to your phone. (Those buttons open your own email or messages app; press send there.)
Forgot the passphrase? Click **Forgot passphrase?**, enter the recovery code from your email or text, and choose a new one. Your notes stay intact. **Recovery settings** lets you change the contacts, make a new code (the old one stops working) or change the passphrase.

## Documents

**Back office > Documents** stores receipts, invoices, contracts, tax forms and other files (up to 10 MB each). Drag files onto the page or use **+ Upload documents**, tag them by company, type and date, then filter or search. Only the founder can see them. Files are stored inside Firestore, so they count toward the free 1 GB limit.

## Converter

**Back office > Converter** (Founder and HNIC only) turns paperwork into timesheet entries:

- **Bank statement:** drop in a PDF or CSV statement. Every transaction is read and split out, marked money in or money out, and matched to a company using **Matching rules** (for example, text containing `vybr8` goes to Vybr8). Review the table, fix anything, then click **Add to team timesheets**. The statement is saved to Documents too. Transactions already logged are flagged and skipped, so re-uploading a statement won't double count.
- **Event:** paste event details or upload a flyer PDF. It picks out the title, date, times, place and link. Convert to add it to the calendar (private or public) and log it on that team's timesheet.
- **Email or complaint:** paste an email. It picks out who it's from, the subject and the type (complaint, question, booking, collab). Convert to log it on the team's timesheet, create a follow-up reminder, and optionally save it to Collabs or the calendar.

Scanned (photo) statements have no readable text. Download a text PDF or CSV from your bank's website instead, or paste the text.

## Reports

**Back office > Reports** shows each year (2026, 2027, 2028 and on, added automatically) with totals for hours, money spent, money in (payments and donations) and net, month by month and by company. Export a single month's log, a year summary, or the full year log as CSV files that open in Excel or Google Sheets.

## Editing company pages

**Back office > Site settings** lets you change each company's tagline, description, website, social link and logo. On this version, changes show on the public site as soon as you save.
Default text and links live near the top of the script in `index.html` (search for `const BRANDS`).

## Costs

The Firebase Spark plan and Netlify's free plan are enough for a small team. Firebase only asks for a card if you upgrade.
