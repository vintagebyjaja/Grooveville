/* Groove Guide settings. This file is public on purpose.
   googleMapsKey: paste the "Groove Guide – Website" BROWSER key here (starts with AIza).
     In Google Cloud › Credentials, keep it restricted to websites: https://grooveville.org/*  (and https://*.grooveville.org/* if you use them).
     The server key (GOOGLE_ROUTES_API_KEY) never goes here; it stays a Cloudflare secret.
   mapIdDark / mapIdLight: Map IDs from Google Cloud › Map Management (vector maps).
     "DEMO_MAP_ID" works for testing. For the custom dark peach / light purple building styles, create your own Map IDs and paste them here.
   base / apiBase / homeUrl: change these only when Groove Guide moves to its own domain. */
window.GG_CONFIG = {
  googleMapsKey: "",
  mapIdDark: "DEMO_MAP_ID",
  mapIdLight: "DEMO_MAP_ID",
  mapsVersion: "beta",
  base: "/guide",
  apiBase: "/api/guide",
  homeUrl: "/",
  signInUrl: "/#groove",
  defaultCenter: { lat: 35.2271, lng: -80.8431 }
};
