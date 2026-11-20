/* Groove Guide server endpoints (/api/guide/*).
   The Google key lives only in the Cloudflare secret GOOGLE_ROUTES_API_KEY and never reaches the browser.
   - POST /api/guide/route   Routes API (driving or walking), returns a trimmed route list
   - GET  /api/guide/intel   Weather API (now, 48 h, sunrise/sunset) + Time Zone API for one place
   - GET  /api/guide/tz      Time Zone API only (cheap; used for departure / arrival clocks)
   Only pages on grooveville.org may call these (browser fetch metadata), each visitor is rate limited,
   and weather / time zone answers are cached briefly to keep Google costs down. */
const J = (o, s, extra) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra || {}) });
const LIMITS = { route: 40, intel: 90, tz: 120, limit: 240, scene: 300 };          // requests per visitor per 10 minutes, per server instance
const hits = new Map();
function limited(ip, kind) {
  const k = kind + ":" + ip, now = Date.now(), w = 600000;
  let h = hits.get(k); if (!h || now - h.t > w) { h = { t: now, n: 0 }; hits.set(k, h) }
  h.n++; if (hits.size > 5000) hits.clear();
  return h.n > LIMITS[kind];
}
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null };
const ll = o => o && num(o.lat, -90, 90) !== null && num(o.lng, -180, 180) !== null ? { lat: Number(o.lat), lng: Number(o.lng) } : null;
const secs = d => d ? Number(String(d).replace(/s$/, "")) || 0 : 0;
export function allowedCaller(req) {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return true;
  if (site === "cross-site") return false;
  const o = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!o) return site === "none" ? false : true;          // old browsers without fetch metadata
  try { const h = new URL(o).hostname; return h === "grooveville.org" || h.endsWith(".grooveville.org") || h === "localhost" } catch (e) { return false }
}
function waypoint(w) {
  if (!w) return null;
  if (typeof w.placeId === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(w.placeId)) return { placeId: w.placeId };
  const p = ll(w); return p ? { location: { latLng: { latitude: p.lat, longitude: p.lng } } } : null;
}
const FIELDS = ["routes.duration", "routes.staticDuration", "routes.distanceMeters", "routes.polyline.encodedPolyline", "routes.description", "routes.routeLabels", "routes.warnings",
  "routes.travelAdvisory.speedReadingIntervals", "routes.travelAdvisory.tollInfo",
  "routes.legs.duration", "routes.legs.staticDuration", "routes.legs.distanceMeters", "routes.legs.startLocation", "routes.legs.endLocation",
  "routes.legs.steps.distanceMeters", "routes.legs.steps.staticDuration", "routes.legs.steps.polyline.encodedPolyline", "routes.legs.steps.startLocation", "routes.legs.steps.endLocation",
  "routes.legs.steps.navigationInstruction", "routes.legs.steps.travelMode"].join(",");
const loc = l => l && l.latLng ? { lat: l.latLng.latitude, lng: l.latLng.longitude } : null;
export function trimRoute(r) {
  const steps = [];
  (r.legs || []).forEach((lg, li) => (lg.steps || []).forEach(s => steps.push({
    leg: li, instr: (s.navigationInstruction || {}).instructions || "", maneuver: (s.navigationInstruction || {}).maneuver || "",
    distanceM: s.distanceMeters || 0, durationSec: secs(s.staticDuration), polyline: (s.polyline || {}).encodedPolyline || "", start: loc(s.startLocation), end: loc(s.endLocation)
  })));
  return {
    durationSec: secs(r.duration), staticSec: secs(r.staticDuration), distanceM: r.distanceMeters || 0, polyline: (r.polyline || {}).encodedPolyline || "",
    description: r.description || "", labels: r.routeLabels || [], warnings: r.warnings || [], toll: !!((r.travelAdvisory || {}).tollInfo),
    traffic: ((r.travelAdvisory || {}).speedReadingIntervals || []).map(i => ({ s: i.startPolylinePointIndex || 0, e: i.endPolylinePointIndex || 0, speed: i.speed || "NORMAL" })),
    legs: (r.legs || []).map(lg => ({ durationSec: secs(lg.duration), staticSec: secs(lg.staticDuration), distanceM: lg.distanceMeters || 0, start: loc(lg.startLocation), end: loc(lg.endLocation) })),
    steps
  };
}
async function cached(ctx, key, ttl, make) {
  const c = typeof caches !== "undefined" ? caches.default : null, ck = new Request("https://guide-cache.grooveville.org/" + key);
  if (c) { const hit = await c.match(ck); if (hit) return hit.json() }
  const v = await make();
  if (c && v && !v.error) { const resp = new Response(JSON.stringify(v), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + ttl } }); ctx && ctx.waitUntil ? ctx.waitUntil(c.put(ck, resp)) : await c.put(ck, resp) }
  return v;
}
/* Posted speed limits come from OpenStreetMap (maxspeed tags), because Google's speed-limit data is only sold to fleet-tracking customers.
   Coverage depends on the road: when a road has no tag we return limit:null and the app simply hides the sign. */
function parseMax(v) {
  v = String(v || "").trim().toLowerCase(); let m;
  if ((m = v.match(/^(\d{1,3})\s*mph$/))) return { value: +m[1], unit: "mph" };
  if ((m = v.match(/^(\d{1,3})(\s*km\/h)?$/))) return { value: +m[1], unit: "km/h" };
  return null;
}
function segDist(p, a, b) {
  const k = Math.cos(p.lat * Math.PI / 180) * 111320, ax = (a.lon - p.lng) * k, ay = (a.lat - p.lat) * 110540, bx = (b.lon - p.lng) * k, by = (b.lat - p.lat) * 110540;
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
async function limitLookup(pt, fetcher) {
  const q = "[out:json][timeout:8];way(around:25," + pt.lat + "," + pt.lng + ")[highway][maxspeed];out tags geom;";
  let j;
  try {
    const r = await fetcher("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "GrooveGuide/1.0 (grooveville.org)" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) return { error: "Speed limit lookup unavailable (" + r.status + ")" };
    j = await r.json();
  } catch (e) { return { error: "Speed limit lookup unavailable" } }
  let best = null, bd = 1e9;
  for (const w of (j.elements || [])) {
    const lim = parseMax(w.tags && w.tags.maxspeed); if (!lim || !w.geometry) continue;
    for (let i = 1; i < w.geometry.length; i++) { const d = segDist(pt, w.geometry[i - 1], w.geometry[i]); if (d < bd) { bd = d; best = { limit: lim, road: (w.tags.name || w.tags.ref || "") } } }
  }
  return best && bd < 30 ? Object.assign(best, { source: "OpenStreetMap" }) : { limit: null, source: "OpenStreetMap" };
}
/* Driving-view scene: real road shapes, lane counts and turn lanes, buildings and street lamps from OpenStreetMap
   for one ~300 m grid cell (plus a margin). Only what OSM has mapped is returned; the app draws nothing it doesn't know. */
const ROADS = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|footway|pedestrian|path|cycleway";
const r6 = v => Math.round(v * 1e6) / 1e6;
async function sceneLookup(c, fetcher) {
  const m = 0.0022, b = [c.lat - m, c.lng - m * 1.25, c.lat + m, c.lng + m * 1.25].map(r6).join(",");
  const q = "[out:json][timeout:20];(way[\"highway\"~\"^(" + ROADS + ")$\"](" + b + ");way[\"building\"](" + b + ");node[\"highway\"=\"street_lamp\"](" + b + ");node[\"highway\"=\"traffic_signals\"](" + b + "););out tags geom qt;";
  let j;
  try {
    const r = await fetcher("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "GrooveGuide/1.0 (grooveville.org)" }, body: "data=" + encodeURIComponent(q) });
    if (!r.ok) return { error: "Map scene unavailable (" + r.status + ")" };
    j = await r.json();
  } catch (e) { return { error: "Map scene unavailable" } }
  const out = { roads: [], buildings: [], lamps: [], signals: [], source: "OpenStreetMap contributors" };
  for (const e of (j.elements || [])) {
    const t = e.tags || {};
    if (e.type === "node") { (t.highway === "street_lamp" ? out.lamps : out.signals).push([r6(e.lat), r6(e.lon)]); continue }
    if (!e.geometry || e.geometry.length < 2) continue;
    const g = e.geometry.map(p => [r6(p.lat), r6(p.lon)]);
    if (t.building) {
      if (out.buildings.length >= 700) continue;
      let h = parseFloat(t.height); if (!(h > 0)) { const lv = parseFloat(t["building:levels"]); h = lv > 0 ? lv * 3.2 : 0 }
      out.buildings.push({ g, h: h > 0 ? Math.min(h, 320) : 0 });
    } else {
      const o = { id: e.id, t: t.highway, g };
      for (const [k, v] of [["lanes", "ln"], ["lanes:forward", "lf"], ["lanes:backward", "lb"], ["oneway", "ow"], ["turn:lanes", "tl"], ["turn:lanes:forward", "tlf"], ["turn:lanes:backward", "tlb"], ["width", "w"], ["sidewalk", "sw"], ["name", "n"], ["ref", "rf"], ["maxspeed", "ms"], ["footway", "fw"], ["bridge", "br"], ["tunnel", "tu"], ["layer", "ly"]]) if (t[k]) o[v] = String(t[k]).slice(0, 80);
      out.roads.push(o);
    }
  }
  return out;
}
async function tzLookup(key, p, ts, fetcher) {
  const r = await fetcher("https://maps.googleapis.com/maps/api/timezone/json?location=" + p.lat + "," + p.lng + "&timestamp=" + ts + "&key=" + encodeURIComponent(key));
  const j = await r.json().catch(() => ({}));
  if (j.status !== "OK") return { error: "Time zone unavailable" + (j.status ? " (" + j.status + ")" : "") };
  return { id: j.timeZoneId, name: j.timeZoneName, rawOffset: j.rawOffset, dstOffset: j.dstOffset, offsetSec: (j.rawOffset || 0) + (j.dstOffset || 0), at: ts };
}
const pickW = w => w ? {
  temp: w.temperature ? Math.round(w.temperature.degrees) : null, feels: w.feelsLikeTemperature ? Math.round(w.feelsLikeTemperature.degrees) : null,
  text: ((w.weatherCondition || {}).description || {}).text || "", type: (w.weatherCondition || {}).type || "", icon: (w.weatherCondition || {}).iconBaseUri || "",
  rain: (((w.precipitation || {}).probability) || {}).percent ?? null, wind: ((w.wind || {}).speed || {}).value ?? null, windDir: ((w.wind || {}).direction || {}).cardinal || "",
  humidity: w.relativeHumidity ?? null, day: w.isDaytime ?? null
} : null;
async function weatherLookup(key, p, fetcher) {
  const q = "key=" + encodeURIComponent(key) + "&location.latitude=" + p.lat + "&location.longitude=" + p.lng + "&unitsSystem=IMPERIAL";
  const [a, b, c] = await Promise.all([
    fetcher("https://weather.googleapis.com/v1/currentConditions:lookup?" + q).then(r => r.ok ? r.json() : null).catch(() => null),
    fetcher("https://weather.googleapis.com/v1/forecast/hours:lookup?" + q + "&hours=48&pageSize=48").then(r => r.ok ? r.json() : null).catch(() => null),
    fetcher("https://weather.googleapis.com/v1/forecast/days:lookup?" + q + "&days=2&pageSize=2").then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (!a && !b) return { error: "Weather unavailable for this place" };
  return {
    now: pickW(a),
    hours: ((b || {}).forecastHours || []).map(h => Object.assign({ t: (h.interval || {}).startTime || "" }, pickW(h))),
    sun: ((c || {}).forecastDays || []).map(d => ({ rise: ((d.sunEvents || {}).sunriseTime) || "", set: ((d.sunEvents || {}).sunsetTime) || "" }))
  };
}
export async function guideApi(req, env, ctx, h) {
  const { p, url } = h, fetcher = h.fetcher || fetch;
  if (!allowedCaller(req)) return J({ error: "Groove Guide data is only available on grooveville.org" }, 403);
  /* Browser settings delivered at runtime, so the public map key lives in Cloudflare (GOOGLE_MAPS_BROWSER_KEY), not in a file.
     The browser key is public by design and must be restricted to grooveville.org in Google Cloud. The server key is never sent. */
  if (p === "/api/guide/config" && req.method === "GET") {
    const k = String(env.GOOGLE_MAPS_BROWSER_KEY || "").trim();
    return J({ googleMapsKey: k, mapIdDark: String(env.GUIDE_MAP_ID_DARK || "").trim(), mapIdLight: String(env.GUIDE_MAP_ID_LIGHT || "").trim(),
      serverRoutes: !!env.GOOGLE_ROUTES_API_KEY, browserKeySet: !!k, sameAsServerKey: !!k && k === env.GOOGLE_ROUTES_API_KEY }, 200, { "cache-control": "private, max-age=60" });
  }
  if (p === "/api/guide/scene" && req.method === "GET") {
    const ip1 = req.headers.get("cf-connecting-ip") || "0";
    if (limited(ip1, "scene")) return J({ error: "Too many requests. Wait a few minutes." }, 429);
    const pt = ll({ lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
    if (!pt) return J({ error: "Bad location" }, 400);
    const c = { lat: Math.round(pt.lat / 0.003) * 0.003, lng: Math.round(pt.lng / 0.003) * 0.003 };      // same cell for everyone → shared cache
    const v = await cached(ctx, "scene2/" + c.lat.toFixed(3) + "/" + c.lng.toFixed(3), 1209600, () => sceneLookup(c, fetcher));
    return J(v, v.error ? 502 : 200, v.error ? {} : { "cache-control": "public, max-age=86400" });
  }
  if (p === "/api/guide/limit" && req.method === "GET") {
    const ip0 = req.headers.get("cf-connecting-ip") || "0";
    if (limited(ip0, "limit")) return J({ error: "Too many requests. Wait a few minutes." }, 429);
    const pt = ll({ lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
    if (!pt) return J({ error: "Bad location" }, 400);
    const g = { lat: Math.round(pt.lat * 5000) / 5000, lng: Math.round(pt.lng * 5000) / 5000 };   // ~20 m grid
    const v = await cached(ctx, "lim/" + g.lat + "/" + g.lng, 604800, () => limitLookup(g, fetcher));
    return J(v, v.error ? 502 : 200);
  }
  const key = env.GOOGLE_ROUTES_API_KEY;
  if (!key) return J({ error: "The Cloudflare secret GOOGLE_ROUTES_API_KEY isn't set yet", setup: true }, 503);
  const ip = req.headers.get("cf-connecting-ip") || "0";
  if (p === "/api/guide/route" && req.method === "POST") {
    if (limited(ip, "route")) return J({ error: "Too many route requests. Wait a few minutes and try again." }, 429);
    let b = {}; try { b = await req.json() } catch (e) { return J({ error: "Bad request" }, 400) }
    const origin = waypoint(b.origin), dest = waypoint(b.destination), mode = b.mode === "WALK" ? "WALK" : "DRIVE";
    if (!origin || !dest) return J({ error: "A start and a destination are needed" }, 400);
    const stops = (Array.isArray(b.stops) ? b.stops : []).slice(0, 5).map(waypoint).filter(Boolean);
    const body = { origin, destination: dest, travelMode: mode, computeAlternativeRoutes: b.alternatives !== false && !stops.length, languageCode: "en-US", units: "IMPERIAL" };
    if (stops.length) body.intermediates = stops;
    if (mode === "DRIVE") {
      body.routingPreference = "TRAFFIC_AWARE";
      body.extraComputations = ["TRAFFIC_ON_POLYLINE"];
      const a = b.avoid || {}; body.routeModifiers = { avoidTolls: !!a.tolls, avoidHighways: !!a.highways, avoidFerries: !!a.ferries };
      if (b.departAt) { const t = Date.parse(b.departAt); if (t && t > Date.now() + 30000 && t < Date.now() + 100 * 86400000) body.departureTime = new Date(t).toISOString() }
    }
    const r = await fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return J({ error: "Google couldn't plan that route" + (j.error && j.error.status ? " (" + j.error.status + ")" : ""), detail: j.error && j.error.message ? String(j.error.message).slice(0, 200) : "" }, r.status === 429 ? 429 : 502);
    const routes = (j.routes || []).map(trimRoute);
    if (!routes.length) return J({ error: "No route found between those places" }, 404);
    return J({ routes, mode, departAt: body.departureTime || "", via: "Google Routes API" });
  }
  if ((p === "/api/guide/intel" || p === "/api/guide/tz") && req.method === "GET") {
    const kind = p.endsWith("tz") ? "tz" : "intel";
    if (limited(ip, kind)) return J({ error: "Too many requests. Wait a few minutes." }, 429);
    const pt = ll({ lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
    if (!pt) return J({ error: "Bad location" }, 400);
    let ts = Math.floor(Number(url.searchParams.get("ts")) || Date.now() / 1000); if (ts < 0 || ts > 4102444800) ts = Math.floor(Date.now() / 1000);
    const g = { lat: Math.round(pt.lat * 100) / 100, lng: Math.round(pt.lng * 100) / 100 };      // ~1 km grid keeps the cache useful
    const tsH = Math.floor(ts / 3600) * 3600;
    const tz = await cached(ctx, "tz/" + g.lat + "/" + g.lng + "/" + tsH, 86400, () => tzLookup(key, pt, tsH, fetcher));
    if (kind === "tz") return J({ tz });
    const weather = await cached(ctx, "wx/" + g.lat + "/" + g.lng + "/" + Math.floor(Date.now() / 600000), 600, () => weatherLookup(key, pt, fetcher));
    return J({ tz, weather, attribution: "Weather and time zone data: Google" });
  }
  return J({ error: "Not found" }, 404);
}
