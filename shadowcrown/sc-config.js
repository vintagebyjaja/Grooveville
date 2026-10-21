/* Shadow Crown settings. These values are public (they ship to the browser), so never put secret keys here.
   mapboxToken: your Mapbox PUBLIC token (starts with "pk."). Restrict it to grooveville.org in your Mapbox account.
                Leave it empty to use the built-in illustrated Charlotte map.
   trailers:    YouTube videos for the Watch page, e.g. [{ title: "Book 1 trailer", youtube: "VIDEO_ID" }]
   sampleUrl:   link to a reading sample (PDF or page), or "" to show "coming soon".
   redeemCodes: codes printed in the book that unlock the reader bonus collectible. */
window.SC_CONFIG = {
  mapboxToken: "",
  mapboxStyle: "mapbox://styles/mapbox/dark-v11",
  trailers: [],
  sampleUrl: "",
  redeemCodes: []
};
