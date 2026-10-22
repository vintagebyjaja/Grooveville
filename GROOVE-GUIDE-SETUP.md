# Groove Guide setup (grooveville.org/guide)

Groove Guide is added on top of the existing site. Nothing in the main Grooveville site, DNS, wrangler.jsonc or existing secrets changes.

## 1. Browser key (the map, search and Explore)
Groove Guide now reads the browser key from Cloudflare at runtime, so you don't edit any file.
1. Cloudflare › **Workers & Pages › grooveville › Settings › Variables and Secrets › Add**
2. Type: **Secret** (or Text) · Name: **`GOOGLE_MAPS_BROWSER_KEY`** · Value: the **"Groove Guide – Website"** key → Save and deploy.
3. In Google Cloud › APIs & Services › Credentials › "Groove Guide – Website":
   - **Website restrictions:** `https://grooveville.org/*` (add your preview address too if you use one, e.g. `https://*.workers.dev/*`).
   - **API restrictions:** Maps JavaScript API, Places API (New). Map Tiles API is optional (photorealistic 3D in Immersive).
4. Check it: `https://grooveville.org/api/guide/config` should show `"browserKeySet": true`.
If anything is still wrong, the map shows the exact reason (invalid key, website not allowed, API not enabled, billing, quota, network) and the browser console logs a diagnostics line.

## 2. Server key (already done)
The Worker reads the Cloudflare secret **GOOGLE_ROUTES_API_KEY** (Routes API, Weather API, Time Zone API). It never reaches the browser.
Check: open `https://grooveville.org/api/guide/tz?lat=35.22&lng=-80.84`. If the secret is missing, it says so.

## 3. Optional: your own map style
Add Cloudflare variables `GUIDE_MAP_ID_DARK` / `GUIDE_MAP_ID_LIGHT` (or edit `guide-config.js`). They default to `DEMO_MAP_ID`. For the custom dark-peach / light-purple building look, create vector Map IDs in Google Cloud › Map Management and paste them in.

## 4. Firestore rules (for syncing to a Grooveville account)
Paste the new `firestore.rules` into Firebase › Firestore › Rules › Publish. It only adds `guide/{uid}` (each person's own Groove Guide data). Without it, Groove Guide still works and keeps data on the device.

## 5. Public sign-in (people keep their places, trips and walks)
Groove Guide has its own Sign in button for the public. In Firebase › Authentication › Sign-in method, turn on **Email/Password** (already on) and **Google** (optional, for "Continue with Google"). Under Authentication › Settings › Authorized domains, make sure `grooveville.org` is listed.
A Groove Guide account is a plain public account: it does not create a Groove Team record and cannot open the Back Office. Groove Team logins also work on Groove Guide.

## Links other Grooveville products can use
- `https://grooveville.org/guide/navigate/?to=35.2356,-80.8270&name=Optimist%20Hall`
- `https://grooveville.org/guide/navigate/?q=1115%20N%20Brevard%20St%20Charlotte`

## Honest limits
- Speed limits and lane-by-lane guidance need a verified lane data provider; until one is connected, Groove Guide shows the turn arrow and says lane data is unavailable.
- The driving view draws your real route ahead in 3D; it is not a camera feed.
- Phone browsers can pause GPS when the screen locks; keep Groove Guide open while navigating.
- Moving to its own domain later: change `base`, `apiBase` and `homeUrl` in `guide-config.js`.
