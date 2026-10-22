# Groove Guide setup (grooveville.org/guide)

Groove Guide is added on top of the existing site. Nothing in the main Grooveville site, DNS, wrangler.jsonc or existing secrets changes.

## 1. Browser key (needed for the map, search and Explore)
Open `guide/guide-config.js` in GitHub and paste the **"Groove Guide – Website"** key between the quotes in `googleMapsKey: ""`. Commit.
In Google Cloud › Credentials, keep that key restricted to websites `https://grooveville.org/*`.
It needs: Maps JavaScript API and Places API (New). Immersive 3D also uses Map Tiles API (photorealistic 3D); without it Immersive falls back to 3D buildings.

## 2. Server key (already done)
The Worker reads the Cloudflare secret **GOOGLE_ROUTES_API_KEY** (Routes API, Weather API, Time Zone API). It never reaches the browser.
Check: open `https://grooveville.org/api/guide/tz?lat=35.22&lng=-80.84`. If the secret is missing, it says so.

## 3. Optional: your own map style
`mapIdDark` / `mapIdLight` in `guide-config.js` default to `DEMO_MAP_ID`. For the custom dark-peach / light-purple building look, create vector Map IDs in Google Cloud › Map Management and paste them in.

## 4. Firestore rules (for syncing to a Grooveville account)
Paste the new `firestore.rules` into Firebase › Firestore › Rules › Publish. It only adds `guide/{uid}` (each person's own Groove Guide data). Without it, Groove Guide still works and keeps data on the device.

## Links other Grooveville products can use
- `https://grooveville.org/guide/navigate/?to=35.2356,-80.8270&name=Optimist%20Hall`
- `https://grooveville.org/guide/navigate/?q=1115%20N%20Brevard%20St%20Charlotte`

## Honest limits
- Speed limits and lane-by-lane guidance need a verified lane data provider; until one is connected, Groove Guide shows the turn arrow and says lane data is unavailable.
- The driving view draws your real route ahead in 3D; it is not a camera feed.
- Phone browsers can pause GPS when the screen locks; keep Groove Guide open while navigating.
- Moving to its own domain later: change `base`, `apiBase` and `homeUrl` in `guide-config.js`.
