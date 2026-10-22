/* Grooveville Content Studio (Back office › Content Studio) — server side.
   - Only the founder / HNIC, or accounts the founder lists in contentRoles/{uid}, can call these endpoints.
   - OpenAI writes copy, plans campaigns, researches trends (with web sources) and paints BACKGROUNDS only.
     Official logos are never sent to the AI; the browser places the original logo file on top.
   - Files live in R2 under content/: brand/ (protected brand kits), tmp/ (fresh AI art, auto-deleted after 30 days),
     keep/ (art used by saved posts), final/ (finished graphics), proposals/ (weekly auto drafts), usage/ (cost ledger).
   - Every AI call is priced (estimate) and counted against the founder's monthly budget before it runs. */
import { serveR2 } from "./music.js";
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const TEXT_MODEL = env => env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const IMAGE_MODEL = env => env.OPENAI_IMAGE_MODEL || "gpt-image-1";
/* Price estimates in USD (check openai.com/pricing; adjust here if they change) */
export const PRICE = {
  text: { "gpt-5": [1.25, 10], "gpt-5-mini": [0.25, 2], "gpt-5-nano": [0.05, 0.4], "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4o-mini": [0.15, 0.6] },   // per 1M tokens in / out
  image: { low: { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 }, medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 }, high: { "1024x1024": 0.167, "1024x1536": 0.25, "1536x1024": 0.25 } },
  search: 0.01                                                                                                                                          // per web search call
};
const SAFE_KEY = /^content\/(brand|tmp|keep|final|upload)\/[A-Za-z0-9._\/-]{3,180}$/;
const IMG_TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
const month = () => new Date().toISOString().slice(0, 7);
async function readJson(env, key, dflt) { try { const o = await env.STUDIO_BUCKET.get(key); return o ? await o.json() : dflt } catch (e) { return dflt } }
const writeJson = (env, key, v) => env.STUDIO_BUCKET.put(key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });
async function usage(env) { return readJson(env, "content/usage/" + month() + ".json", { total: 0, count: 0, items: [] }) }
async function charge(env, kind, cost, by, note) {
  const u = await usage(env); u.total = Math.round((u.total + cost) * 10000) / 10000; u.count++; u.items.unshift({ t: new Date().toISOString(), kind, cost: Math.round(cost * 10000) / 10000, by: by || "", note: String(note || "").slice(0, 80) }); u.items = u.items.slice(0, 400);
  await writeJson(env, "content/usage/" + month() + ".json", u); return u;
}
async function budgetOk(env, est) { const cfg = await readJson(env, "content/config.json", {}); const lim = Number(cfg.monthlyLimit || 25); const u = await usage(env); return { ok: u.total + est <= lim, total: u.total, limit: lim } }
function textCost(env, usage, searches) { const p = PRICE.text[TEXT_MODEL(env)] || PRICE.text["gpt-5-mini"]; return ((usage && usage.input_tokens) || 0) / 1e6 * p[0] + ((usage && usage.output_tokens) || 0) / 1e6 * p[1] + (searches || 0) * PRICE.search }

/* ---------- OpenAI ---------- */
export async function openaiJSON(env, sys, user, opts, fetcher) {
  const body = { model: TEXT_MODEL(env), input: [{ role: "system", content: sys }, { role: "user", content: user }], text: { format: { type: "json_object" } } };
  if (opts && opts.search) { body.tools = [{ type: "web_search" }]; body.tool_choice = "auto" }
  const r = await (fetcher || fetch)("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(openaiErr(r.status, j)), { status: r.status });
  let text = "", cites = [], searches = 0;
  for (const it of j.output || []) {
    if (it.type === "web_search_call") searches++;
    if (it.type === "message") for (const c of it.content || []) if (c.type === "output_text") { text += c.text || ""; for (const a of c.annotations || []) if (a.type === "url_citation" && a.url) cites.push({ url: a.url, title: a.title || "" }) }
  }
  if (!text && typeof j.output_text === "string") text = j.output_text;
  let data; try { data = JSON.parse(text) } catch (e) { const m = /\{[\s\S]*\}/.exec(text); try { data = m ? JSON.parse(m[0]) : null } catch (e2) { data = null } }
  if (!data) throw new Error("The AI answer couldn't be read. Try again.");
  return { data, cites, cost: textCost(env, j.usage, searches), usage: j.usage || {} };
}
function openaiErr(status, j) {
  const m = (j && j.error && (j.error.message || j.error.code)) || "";
  if (status === 401) return "OpenAI rejected the key (OPENAI_API_KEY). Check it in Cloudflare.";
  if (status === 429) return /quota|billing/i.test(m) ? "OpenAI says the account is out of credit or over quota." : "OpenAI is busy (rate limit). Try again in a minute.";
  if (status === 400 && /model/i.test(m)) return "OpenAI doesn't recognize the model. Set OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL in Cloudflare.";
  if (/safety|policy|moderation/i.test(m)) return "OpenAI declined that request (content policy). Rephrase the brief.";
  return "OpenAI error" + (m ? ": " + String(m).slice(0, 160) : " (" + status + ")");
}

/* ---------- prompts ---------- */
const FEATURE_ICONS = "navigate,pin,cloud,car,food,drink,music,heart,users,home,building,briefcase,dollar,target,cube,doc,layers,ruler,star,play,mic,ticket,calendar,sparkle,shield,chart,camera,book,crown,game,search,bolt,globe,phone,gift";
function brandBrief(b) {
  b = b || {};
  return ["Brand: " + (b.name || "Grooveville"), b.tagline ? "Tagline: " + b.tagline : "", b.voice ? "Voice: " + b.voice : "", b.audience ? "Audience: " + b.audience : "",
    b.parentName ? "Part of: " + b.parentName + " (keep this project's own identity)" : "", b.about ? "Mission / what it stands for: " + b.about : "",
    (b.locations || []).length ? "Usual locations: " + b.locations.slice(0, 6).map(l => [l.name, l.address, l.website].filter(Boolean).join(", ")).join(" | ") : "",
    b.location ? "This post's location: " + [b.location.name, b.location.address, b.location.website].filter(Boolean).join(", ") : "", b.website ? "Website: " + b.website : "", (b.hashtags || []).length ? "Default hashtags: " + b.hashtags.join(" ") : "",
    (b.ctas || []).length ? "Preferred calls to action: " + b.ctas.join(" | ") : "", b.restrictions ? "Never do: " + b.restrictions : "", b.guidelines ? "Guidelines: " + b.guidelines : ""].filter(Boolean).join("\n");
}
const POST_SHAPE = `Each post object: {"angle": short label, "kicker": up to 3 short lines for the top-right corner joined with \\n (e.g. "REAL JOBS.\\nREAL PEOPLE."), "tagline": spaced-caps line under the logo like "FOOD • FRIENDS • PLANS • VIBES",
"headline": array of 2-4 SHORT punchy lines (max 14 characters each, the last one is the accent line), "subline": 1-3 short lines in caps, "features": array of 3-5 {"icon": one of [${FEATURE_ICONS}], "title": max 22 chars, "text": max 40 chars},
"cta": button text max 18 chars, "url": short web address to show, "caption": the social caption (no hashtags inside), "hashtags": array of 3-8, "variants": {"instagram","facebook","tiktok","youtube","linkedin","x"} platform-tuned captions (x under 260 chars),
"imagePrompt": a vivid description of a BACKGROUND photo/illustration for the graphic (scene, lighting, mood, colors) with absolutely no text, letters, logos or brand names, "suggestedDate": YYYY-MM-DD or ""}`;
const RULES = `Rules: write in the brand's voice. Use only facts given to you; never invent dates, prices, statistics, partners, quotes or announcements. If something isn't confirmed, keep it general ("coming soon"). Keep it fresh: don't repeat the avoided headlines. Return JSON only.`;

export async function contentApi(req, env, ctx, h) {
  const { p, url, verifyIdToken, fsField } = h, fetcher = h.fetcher || fetch;
  if (!env.STUDIO_BUCKET) return J({ error: "The STUDIO_BUCKET R2 binding is missing" }, 503);
  let user;
  try { user = await verifyIdToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.FIREBASE_PROJECT_ID) } catch (e) { return J({ error: "Sign in again" }, 401) }
  const role = String(await fsField(env, "access/" + user.uid, user, "role", fetcher) || "").toLowerCase().trim();
  const founder = role === "founder" || role === "hnic";
  const member = founder || ["editor", "manager"].includes(String(await fsField(env, "contentRoles/" + user.uid, user, "role", fetcher) || ""));
  if (!member) return J({ error: "Content Studio is limited to the founder and approved accounts" }, 403);
  const by = user.uid;
  let b = {}; if (req.method === "POST") { try { b = await req.json() } catch (e) { b = {} } }
  const needAI = () => env.OPENAI_API_KEY ? null : J({ error: "Add the Cloudflare secret OPENAI_API_KEY to turn on AI generation", setup: true }, 503);

  if (p === "/api/content/status") {
    const u = await usage(env), cfg = await readJson(env, "content/config.json", {});
    return J({ ai: !!env.OPENAI_API_KEY, textModel: TEXT_MODEL(env), imageModel: IMAGE_MODEL(env), month: month(), spent: u.total, calls: u.count, limit: Number(cfg.monthlyLimit || 25), recent: u.items.slice(0, 20), founder, prices: PRICE });
  }
  /* ---------- files ---------- */
  if (p === "/api/content/put" && req.method === "PUT") {
    const key = url.searchParams.get("key") || "", type = (req.headers.get("content-type") || "").split(";")[0], len = Number(req.headers.get("content-length") || 0);
    if (!SAFE_KEY.test(key) || key.includes("..")) return J({ error: "Bad file address" }, 400);
    if (!IMG_TYPES.test(type)) return J({ error: "Use PNG, JPG, WebP or SVG" }, 415);
    if (!len || len > 15 * 1024 * 1024) return J({ error: "Files can be up to 15 MB" }, 413);
    if (key.startsWith("content/brand/") && !founder) return J({ error: "Only the founder changes brand kits" }, 403);
    await env.STUDIO_BUCKET.put(key, req.body, { httpMetadata: { contentType: type }, customMetadata: { by, at: new Date().toISOString() } });
    return J({ ok: true, key });
  }
  const fm = /^\/api\/content\/f\/(content\/.+)$/.exec(p);
  if (fm && req.method === "GET") { const key = decodeURIComponent(fm[1]); if (!SAFE_KEY.test(key) || key.includes("..")) return J({ error: "Bad file" }, 400); return serveR2(env, key, req, null, "private, max-age=3600") }
  if (p === "/api/content/keep" && req.method === "POST") {
    const src = String(b.key || ""); if (!/^content\/tmp\/[A-Za-z0-9._-]+$/.test(src)) return J({ error: "Bad file" }, 400);
    const o = await env.STUDIO_BUCKET.get(src); if (!o) return J({ error: "That artwork expired. Generate a new one." }, 404);
    const dst = src.replace("content/tmp/", "content/keep/"); await env.STUDIO_BUCKET.put(dst, o.body, { httpMetadata: o.httpMetadata, customMetadata: { by, at: new Date().toISOString() } });
    return J({ ok: true, key: dst });
  }
  if (p === "/api/content/delete" && req.method === "POST") {
    const keys = (Array.isArray(b.keys) ? b.keys : []).filter(k => SAFE_KEY.test(k) && !k.includes("..")).slice(0, 200);
    let n = 0; for (const k of keys) { if (k.startsWith("content/brand/") && !(founder && b.brandKit === true)) continue; await env.STUDIO_BUCKET.delete(k); n++ }
    return J({ ok: true, deleted: n });
  }
  if (p === "/api/content/storage") {
    const out = {}; let cursor;
    do { const l = await env.STUDIO_BUCKET.list({ prefix: "content/", cursor, limit: 1000 }); for (const o of l.objects) { const k = o.key.split("/")[1] || "other"; const s = out[k] || (out[k] = { files: 0, bytes: 0, oldest: "" }); s.files++; s.bytes += o.size || 0; const up = o.uploaded ? new Date(o.uploaded).toISOString() : ""; if (up && (!s.oldest || up < s.oldest)) s.oldest = up } cursor = l.truncated ? l.cursor : null } while (cursor);
    const bytes = Object.values(out).reduce((a, s) => a + s.bytes, 0);
    return J({ prefixes: out, bytes, estMonthlyUSD: Math.round(bytes / 1e9 * 0.015 * 1000) / 1000, note: "R2 storage is about $0.015 per GB-month; the first 10 GB each month are free.", cleanup: await readJson(env, "content/cleanup-log.json", []) });
  }
  if (p === "/api/content/files") {
    const pre = String(url.searchParams.get("prefix") || ""); if (!/^content\/(keep|final|tmp|upload)\/$/.test(pre)) return J({ error: "Bad prefix" }, 400);
    const files = []; let cursor; do { const l = await env.STUDIO_BUCKET.list({ prefix: pre, cursor, limit: 1000 }); l.objects.forEach(o => files.push({ key: o.key, size: o.size, uploaded: o.uploaded })); cursor = l.truncated ? l.cursor : null } while (cursor && files.length < 5000);
    return J({ files });
  }
  if (p === "/api/content/cleanup-log" && req.method === "POST") { const log = await readJson(env, "content/cleanup-log.json", []); log.unshift(Object.assign({ at: new Date().toISOString(), by }, b.entry || {})); await writeJson(env, "content/cleanup-log.json", log.slice(0, 100)); return J({ ok: true }) }
  /* settings the scheduled job needs (brand voice, frequency, events, campaigns). No secrets. Founder only. */
  if (p === "/api/content/config" && req.method === "POST") {
    if (!founder) return J({ error: "Founder only" }, 403);
    const c = { monthlyLimit: Math.max(0, Math.min(1000, Number(b.monthlyLimit) || 25)), weekly: b.weekly !== false, imageQuality: ["low", "medium", "high"].includes(b.imageQuality) ? b.imageQuality : "medium",
      brands: (b.brands || []).slice(0, 40), events: (b.events || []).slice(0, 60), campaignWeeks: b.campaignWeeks || {}, recent: (b.recent || []).slice(0, 120), savedAt: new Date().toISOString() };
    await writeJson(env, "content/config.json", c); return J({ ok: true });
  }
  if (p === "/api/content/proposals") {
    const l = await env.STUDIO_BUCKET.list({ prefix: "content/proposals/" }), out = [];
    for (const o of l.objects.slice(0, 40)) { const v = await readJson(env, o.key, null); if (v) out.push(Object.assign({ key: o.key }, v)) }
    return J({ proposals: out });
  }
  if (p === "/api/content/proposals/ack" && req.method === "POST") { for (const k of (b.keys || []).slice(0, 40)) if (/^content\/proposals\/[A-Za-z0-9._-]+\.json$/.test(k)) await env.STUDIO_BUCKET.delete(k); return J({ ok: true }) }

  /* ---------- AI ---------- */
  if (p === "/api/content/generate" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const bud = await budgetOk(env, 0.02); if (!bud.ok) return J({ error: "Monthly AI budget reached ($" + bud.total.toFixed(2) + " of $" + bud.limit + "). Raise it in Content Studio › Settings." }, 402);
    try { const r = await genPosts(env, b, fetcher); await charge(env, "posts", r.cost, by, b.brand && b.brand.name); return J(r) } catch (e) { return J({ error: e.message }, e.status === 429 ? 429 : 502) }
  }
  if (p === "/api/content/part" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const part = ["caption", "headline", "features", "hashtags", "kicker", "cta"].includes(b.part) ? b.part : "caption";
    const bud = await budgetOk(env, 0.01); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
    try {
      const r = await openaiJSON(env, "You are Grooveville's in-house creative team. " + RULES,
        brandBrief(b.brand) + "\n\nCurrent post:\n" + JSON.stringify(b.post || {}).slice(0, 3000) + "\n\nWrite a NEW, different " + part + " for this same post. Return JSON {\"" + part + "\": ...} using the same type as in the post." + (part === "caption" ? " Also include \"variants\" with platform captions." : ""), null, fetcher);
      await charge(env, "part:" + part, r.cost, by); return J({ data: r.data, cost: r.cost });
    } catch (e) { return J({ error: e.message }, 502) }
  }
  if (p === "/api/content/campaign" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const bud = await budgetOk(env, 0.08); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
    try {
      const brands = (b.brands || []).slice(0, 8);
      const r = await openaiJSON(env, "You are the campaign strategist for Grooveville LLC's in-house creative agency. Plan coordinated, brand-appropriate campaigns. " + RULES,
        "Campaign request:\n" + JSON.stringify({ name: b.name, objective: b.objective, audience: b.audience, start: b.start, launch: b.launch, end: b.end, launchDateConfirmed: !!b.confirmed, platforms: b.platforms, postsPerWeek: b.frequency, direction: b.direction, budget: b.budget }) +
        "\n\nParticipating brands (keep each one's own identity; never post identical graphics to every account):\n" + brands.map(x => "- id " + x.id + ":\n" + brandBrief(x)).join("\n") +
        "\n\nPlan four phases: awareness, teasers, launch, followup. Spread dated posts between start and end (" + (b.frequency || 2) + " per week overall), include countdown posts before the launch date, launch-day posts and reminders, and follow-up recaps/thank-yous. " +
        (b.confirmed ? "The launch/event date is confirmed; you may name it." : "The launch/event date is NOT confirmed: do not state it publicly; say 'coming soon' and treat dates as internal targets.") +
        "\nReturn JSON {\"theme\": string, \"messaging\": string (key message and pillars), \"strategy\": string (channel and cadence strategy), \"phases\": [{\"key\":\"awareness|teasers|launch|followup\",\"name\":string,\"goal\":string,\"start\":YYYY-MM-DD,\"end\":YYYY-MM-DD}], \"posts\": [ {\"date\":YYYY-MM-DD,\"brandId\": one of the ids,\"phase\":key,\"format\":\"portrait|square|story|thumb|landscape\",\"platforms\":[...], ...post fields} ]}.\n" + POST_SHAPE, null, fetcher);
      await charge(env, "campaign", r.cost, by, b.name); return J({ data: r.data, cost: r.cost });
    } catch (e) { return J({ error: e.message }, 502) }
  }
  if (p === "/api/content/trends" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const bud = await budgetOk(env, 0.1); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await openaiJSON(env, "You research current, verifiable topics for a brand's social content. Use web search. Only include topics you found in sources published recently (ideally the last 30 days). Never invent events, numbers or quotes. Return JSON only.",
        "Today is " + today + ".\n" + brandBrief(b.brand) + "\nAreas: " + (b.areas || []).join(", ") + (b.focus ? "\nFocus: " + b.focus : "") +
        "\nFind 5-8 timely topics this brand could post about. Return JSON {\"topics\":[{\"title\":string,\"summary\":string (2 sentences, facts from the sources),\"angle\":string (how this brand could talk about it),\"published\":YYYY-MM-DD or \"\",\"sources\":[{\"title\":string,\"url\":string}]}]}.", { search: true }, fetcher);
      const allowed = new Set(r.cites.map(c => c.url.split("#")[0]));
      const topics = ((r.data && r.data.topics) || []).map(t => Object.assign({}, t, { sources: (t.sources || []).filter(s => s && /^https?:\/\//.test(s.url || "") && (!allowed.size || allowed.has(String(s.url).split("#")[0]))) }))
        .filter(t => t.title && t.sources.length);
      await charge(env, "trends", r.cost, by, b.brand && b.brand.name); return J({ topics, checkedAt: new Date().toISOString(), cost: r.cost });
    } catch (e) { return J({ error: e.message }, 502) }
  }
  if (p === "/api/content/image" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const size = ["1024x1024", "1024x1536", "1536x1024"].includes(b.size) ? b.size : "1024x1536";
    const cfg = await readJson(env, "content/config.json", {}); const q = ["low", "medium", "high"].includes(b.quality) ? b.quality : (cfg.imageQuality || "medium");
    const est = PRICE.image[q][size]; const bud = await budgetOk(env, est); if (!bud.ok) return J({ error: "Monthly AI budget reached ($" + bud.total.toFixed(2) + " of $" + bud.limit + ")." }, 402);
    const prompt = "Background artwork for a premium social media graphic. " + String(b.prompt || "").slice(0, 1600) + (b.style ? " Style and palette: " + String(b.style).slice(0, 300) + "." : "") +
      " Cinematic, high-end, photographic quality, rich lighting, leave calm negative space on the left and top for text. Absolutely no text, no letters, no numbers, no logos, no watermarks, no brand names, no UI screens with readable words.";
    const r = await fetcher("https://api.openai.com/v1/images/generations", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify({ model: IMAGE_MODEL(env), prompt, size, quality: q, n: 1 }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return J({ error: openaiErr(r.status, j) }, r.status === 429 ? 429 : 502);
    const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) return J({ error: "OpenAI returned no image" }, 502);
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), key = "content/tmp/" + Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8) + ".png";
    await env.STUDIO_BUCKET.put(key, bin, { httpMetadata: { contentType: "image/png" }, customMetadata: { by, at: new Date().toISOString() } });
    await charge(env, "image", est, by, size + " " + q);
    return J({ key, cost: est, size, quality: q });
  }
  return J({ error: "Not found" }, 404);
}
async function genPosts(env, b, fetcher) {
  const n = Math.max(1, Math.min(4, Number(b.count) || 1));
  const r = await openaiJSON(env, "You are Grooveville's in-house creative agency writing branded social media posts and flyer copy. " + RULES,
    brandBrief(b.brand) + "\n\nBrief: " + String(b.brief || "Evergreen brand post").slice(0, 2000) + (b.direction ? "\nCreative direction: " + String(b.direction).slice(0, 500) : "") +
    "\nPlatforms: " + (b.platforms || ["instagram"]).join(", ") + "\nFormat: " + (b.format || "portrait") + (b.date ? "\nPlanned date: " + b.date : "") +
    ((b.events || []).length ? "\nConfirmed upcoming events you may reference: " + JSON.stringify(b.events).slice(0, 1500) : "") +
    ((b.avoid || []).length ? "\nAvoid repeating these recent headlines: " + b.avoid.slice(0, 40).join(" | ") : "") +
    "\n\nWrite " + n + " clearly different post option(s). Return JSON {\"posts\":[...]}.\n" + POST_SHAPE, null, fetcher);
  const posts = ((r.data && r.data.posts) || []).slice(0, n);
  if (!posts.length) throw new Error("The AI didn't return any posts. Try again.");
  return { posts, cost: r.cost };
}
/* ---------- scheduled: daily cleanup of expired temporary art, weekly proposals ---------- */
const isoWeek = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return t.getUTCFullYear() + "-W" + String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, "0") };
export async function contentCron(env, fetcher) {
  if (!env.STUDIO_BUCKET) return;
  const st = await readJson(env, "content/state.json", {}), now = new Date(), today = now.toISOString().slice(0, 10);
  if (st.cleanDay !== today) {
    st.cleanDay = today; let n = 0, bytes = 0, cursor; const cut = Date.now() - 30 * 86400000;
    do { const l = await env.STUDIO_BUCKET.list({ prefix: "content/tmp/", cursor, limit: 1000 }); for (const o of l.objects) if (o.uploaded && new Date(o.uploaded).getTime() < cut) { await env.STUDIO_BUCKET.delete(o.key); n++; bytes += o.size || 0 } cursor = l.truncated ? l.cursor : null } while (cursor);
    if (n) { const log = await readJson(env, "content/cleanup-log.json", []); log.unshift({ at: now.toISOString(), by: "scheduled", kind: "expired temporary art (30 days)", files: n, bytes }); await writeJson(env, "content/cleanup-log.json", log.slice(0, 100)) }
    await writeJson(env, "content/state.json", st);
  }
  const wk = isoWeek(now);
  if (st.week !== wk && now.getUTCDay() === 1 && now.getUTCHours() >= 12 && env.OPENAI_API_KEY) {
    st.week = wk; await writeJson(env, "content/state.json", st);
    const cfg = await readJson(env, "content/config.json", null); if (!cfg || cfg.weekly === false) return;
    for (const br of cfg.brands || []) {
      if (!br.enabled || !(br.freq > 0) || (cfg.campaignWeeks[wk] || []).includes(br.id)) continue;
      const bud = await budgetOk(env, 0.02); if (!bud.ok) break;
      try {
        const r = await genPosts(env, { brand: br, brief: "This week's posts for " + br.name + ". Mix evergreen brand value, any confirmed upcoming events, and educational or community angles.", count: Math.min(4, br.freq), events: (cfg.events || []).filter(e => !e.brand || e.brand === br.id).slice(0, 10), avoid: cfg.recent, platforms: br.platforms || ["instagram", "facebook"] }, fetcher);
        await charge(env, "weekly", r.cost, "scheduled", br.name);
        await writeJson(env, "content/proposals/" + wk + "-" + br.id + ".json", { week: wk, brandId: br.id, posts: r.posts, cost: r.cost, at: new Date().toISOString() });
      } catch (e) { }
    }
  }
}
