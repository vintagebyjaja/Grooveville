# Grooveville update v6

Released 2026-10-22. Upload these files into your repo **keeping the same folders**. Everything else stays as it is.

Groove Guide added at /guide (navigation app: map, search, real routes, turn-by-turn with voice, driving view, weather, time zones, arrive-by planning, saved places, vehicle, walks). New Worker endpoints /api/guide/* use the existing GOOGLE_ROUTES_API_KEY secret. Firestore rules add guide/{uid}. Main site: Groove Guide tile in the phone menu and a footer link. Nothing removed.

## Changed files (3)
- `firestore.rules`
- `index.html`
- `worker/index.js`

## New files (12)
- `GROOVE-GUIDE-SETUP.md`
- `guide/explore/index.html`
- `guide/guide-config.js`
- `guide/guide.css`
- `guide/guide.js`
- `guide/immersive/index.html`
- `guide/index.html`
- `guide/navigate/index.html`
- `guide/saved/index.html`
- `guide/settings/index.html`
- `guide/trips/index.html`
- `worker/guide.js`

## Delete these from the repo (0)
Nothing to delete.

`version.txt` is included every time so you can check what's live at grooveville.org/version.txt
