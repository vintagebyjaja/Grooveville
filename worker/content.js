/* Grooveville Content Studio (Back office › Content Studio) — server side.
   - Only the founder / HNIC, or accounts the founder lists in contentRoles/{uid}, can call these endpoints.
   - OpenAI writes copy, plans campaigns, researches trends (with web sources) and paints BACKGROUNDS only.
     Official logos are never sent to the AI; the browser places the original logo file on top.
   - Files live in R2 under content/: brand/ (protected brand kits), tmp/ (fresh AI art, auto-deleted after 30 days),
     keep/ (art used by saved posts), final/ (finished graphics), proposals/ (weekly auto drafts), usage/ (cost ledger).
   - Every AI call is priced (estimate) and counted against the founder's monthly budget before it runs. */
import { serveR2 } from "./music.js";
import { autopilotApi, autopilotCron, apConfig } from "./autopilot.js";
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
/* model names from Cloudflare are trimmed (a pasted space or line break makes OpenAI reject them); if a model isn't available
   to this OpenAI account (unknown name, no access, or organization not verified for gpt-image-1) the next one is tried */
const cleanModel = v => { v = String(v || "").trim().replace(/^["']|["']$/g, ""); return /^[a-z0-9][a-z0-9._:-]{1,60}$/i.test(v) ? v : "" };
const TEXT_MODEL = env => cleanModel(env.OPENAI_TEXT_MODEL) || "gpt-5-mini";
const IMAGE_MODEL = env => cleanModel(env.OPENAI_IMAGE_MODEL) || "gpt-image-1";
const TEXT_MODELS = env => [...new Set([TEXT_MODEL(env), "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"])];
export const IMAGE_MODELS = env => [...new Set([IMAGE_MODEL(env), "gpt-image-1", "gpt-image-1-mini", "dall-e-3"])];
export const modelProblem = (status, j) => { const e = (j && j.error) || {}, m = String(e.message || "") + " " + String(e.code || "") + " " + String(e.param || "");
  return (status === 400 || status === 403 || status === 404) && /model|verif|does not exist|not found|access|unsupported|not supported/i.test(m) && !/safety|policy|moderation/i.test(m) };
/* Price estimates in USD (check openai.com/pricing; adjust here if they change) */
export const PRICE = {
  text: { "gpt-5": [1.25, 10], "gpt-5-mini": [0.25, 2], "gpt-5-nano": [0.05, 0.4], "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4o-mini": [0.15, 0.6] },   // per 1M tokens in / out
  image: { low: { "1024x1024": 0.011, "1024x1536": 0.016, "1536x1024": 0.016 }, medium: { "1024x1024": 0.042, "1024x1536": 0.063, "1536x1024": 0.063 }, high: { "1024x1024": 0.167, "1024x1536": 0.25, "1536x1024": 0.25 } },
  search: 0.01                                                                                                                                          // per web search call
};
const SAFE_KEY = /^content\/(brand|tmp|keep|final|upload|refs)\/[A-Za-z0-9._\/-]{3,180}$/;
const IMG_TYPES = /^image\/(png|jpeg|webp|svg\+xml)$/;
const month = () => new Date().toISOString().slice(0, 7);
export async function readJson(env, key, dflt) { try { const o = await env.STUDIO_BUCKET.get(key); return o ? await o.json() : dflt } catch (e) { return dflt } }
export const writeJson = (env, key, v) => env.STUDIO_BUCKET.put(key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });
async function usage(env) { return readJson(env, "content/usage/" + month() + ".json", { total: 0, count: 0, items: [] }) }
export async function charge(env, kind, cost, by, note) {
  const u = await usage(env); u.total = Math.round((u.total + cost) * 10000) / 10000; u.count++; u.items.unshift({ t: new Date().toISOString(), kind, cost: Math.round(cost * 10000) / 10000, by: by || "", note: String(note || "").slice(0, 80) }); u.items = u.items.slice(0, 400);
  await writeJson(env, "content/usage/" + month() + ".json", u); return u;
}
export async function budgetOk(env, est) { const cfg = await readJson(env, "content/config.json", {}); const lim = Number(cfg.monthlyLimit || 25); const u = await usage(env); return { ok: u.total + est <= lim, total: u.total, limit: lim } }
function textCost(env, usage, searches, model) { const p = PRICE.text[model || TEXT_MODEL(env)] || PRICE.text["gpt-5-mini"]; return ((usage && usage.input_tokens) || 0) / 1e6 * p[0] + ((usage && usage.output_tokens) || 0) / 1e6 * p[1] + (searches || 0) * PRICE.search }

/* ---------- OpenAI ---------- */
/* one Responses API call, trying the next model if this account can't use the configured one */
export async function respond(env, body, fetcher) {
  let r, j, used = "";
  for (const model of TEXT_MODELS(env)) {
    r = await (fetcher || fetch)("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(Object.assign({ model }, body)) });
    j = await r.json().catch(() => ({})); used = model;
    if (r.ok || !modelProblem(r.status, j)) break;
  }
  if (!r.ok) throw Object.assign(new Error(openaiErr(r.status, j)), { status: r.status });
  let text = "", cites = [], searches = 0;
  for (const it of j.output || []) {
    if (it.type === "web_search_call") searches++;
    if (it.type === "message") for (const c of it.content || []) if (c.type === "output_text") { text += c.text || ""; for (const a of c.annotations || []) if (a.type === "url_citation" && a.url) cites.push({ url: a.url, title: a.title || "" }) }
  }
  if (!text && typeof j.output_text === "string") text = j.output_text;
  return { text, cites, searches, usage: j.usage || {}, model: used, cost: textCost(env, j.usage, searches, used) };
}
function parseJSON(text) { try { return JSON.parse(text) } catch (e) { const m = /\{[\s\S]*\}/.exec(text || ""); try { return m ? JSON.parse(m[0]) : null } catch (e2) { return null } } }
/* Web search can't be combined with JSON mode, so searching is two steps:
   1) research with web search, answered as plain-text notes that keep every source URL and date;
   2) a separate JSON-mode request turns only those notes into the requested structure (no new facts allowed). */
export async function openaiJSON(env, sys, user, opts, fetcher) {
  if (opts && opts.search) {
    const a = await respond(env, { input: [{ role: "system", content: sys + " Answer as plain-text research notes, one item per paragraph. For every item give the exact source page URL and that page's publication date. Do not include anything you could not find a source for." }, { role: "user", content: user }], tools: [{ type: "web_search" }], tool_choice: "auto" }, fetcher);
    if (!a.text.trim()) throw new Error("The web search came back empty. Try again later.");
    const src = a.cites.map(c => "- " + c.url + (c.title ? " (" + c.title + ")" : "")).join("\n") || "(none)";
    const b = await respond(env, { input: [{ role: "system", content: "You convert research notes into JSON exactly in the requested shape. Use only facts, URLs and dates that appear in the notes or the source list. Never add items, dates or numbers that are not there. Answer in JSON." }, { role: "user", content: "Requested output (follow its JSON shape):\n" + user + "\n\nResearch notes:\n" + a.text.slice(0, 60000) + "\n\nSource pages the search actually returned:\n" + src }], text: { format: { type: "json_object" } } }, fetcher);
    const data = parseJSON(b.text); if (!data) throw new Error("The research results couldn't be read. Try again.");
    return { data, cites: a.cites, cost: a.cost + b.cost, usage: { input_tokens: (a.usage.input_tokens || 0) + (b.usage.input_tokens || 0), output_tokens: (a.usage.output_tokens || 0) + (b.usage.output_tokens || 0) }, model: b.model, notes: a.text };
  }
  const r = await respond(env, { input: [{ role: "system", content: sys + " Answer in JSON." }, { role: "user", content: user }], text: { format: { type: "json_object" } } }, fetcher);
  const data = parseJSON(r.text); if (!data) throw new Error("The AI answer couldn't be read. Try again.");
  return { data, cites: r.cites, cost: r.cost, usage: r.usage, model: r.model };
}
/* ---------- poster artwork: one shared pipeline for Generate Post and Autopilot ----------
   The image model paints the photograph and (optionally) the stylized title lettering. A vision check then reads the
   picture back: if the title isn't spelled exactly, or any other text/logo appeared, it tries once more and finally
   falls back to a clean photo with the title set in real type. Logos, dates, times and venues are never painted. */
export const LETTER_STYLES = { trending: "bold glowing peach-gold metallic lettering", halloween: "molten fiery orange horror lettering with subtle drips and embers", homecoming: "polished gold metallic varsity lettering with an elegant script accent", voting: "bold patriotic brush lettering in cream and red", concert: "huge gold stage-lit lettering with lens flare", newmusic: "electric neon-blue chrome lettering", party: "hot-pink neon tube lettering with glow", brunch: "warm retro lettering in peach and coral", birthday: "gold balloon-foil lettering with sparkle", motivation: "bold carved cream lettering with warm rim light", holiday: "elegant festive gold and red lettering" };
const REF_MODES = { close: "Follow the reference images closely for typography style, lighting, color grading, composition and visual treatment, but create completely new, original artwork: a new scene, new people and a new title. Never copy the reference's text, logos, people or exact layout.",
  inspired: "Use the reference images as inspiration for the overall aesthetic, mood, lighting and production quality, with creative freedom in the composition. Create new, original artwork; never copy the reference's text, logos, people or exact layout.",
  remix: "Blend the visual languages of the reference images into a fresh new direction that still feels on-brand. Create new, original artwork; never copy any reference's text, logos, people or exact layout." };
export function artPrompt(o, lettered) {
  const L = (o.letter && o.letter.lines || []).map(s => String(s).toUpperCase().trim()).filter(Boolean).slice(0, 3), sc = o.letter && String(o.letter.script || "").trim();
  const refs = (o.refs || []).length;
  return (refs ? "Create a NEW promotional poster artwork. " + (REF_MODES[o.refMode] || REF_MODES.inspired) + (refs > 1 ? " Reference image 1 has the highest priority; later references matter less." : "") + (o.variant ? " This is variation " + o.variant + ": use a clearly different composition, camera angle and scene from the other variations." : "") + " " : "") +
    (o.styleText ? "Visual style to follow: " + String(o.styleText).slice(0, 700) + ". " : "") +
    "Photorealistic, cinematic promotional poster artwork for a premium social media flyer. Scene: " + String(o.scene || "").slice(0, 1200) +
    (o.visual ? " Visual direction for this brand: " + String(o.visual).slice(0, 400) + "." : "") + (o.palette ? " Color palette and lighting accents: " + String(o.palette).slice(0, 200) + "." : "") +
    " Dramatic lighting, rich depth of field, high-end advertising photography, sharp focus, real people and places look natural." +
    (lettered && L.length ? " Render ONLY this title, spelled exactly, letter for letter: \"" + L.join(" / ") + "\"" + (sc ? " with the word \"" + sc + "\" in a flowing script beneath it" : "") +
      ", as large premium 3D " + (o.letter.style || "bold cinematic") + ", centered horizontally between 25% and 60% of the image height, integrated with the scene. The top 15% of the image must stay dark and empty (a logo goes there). The bottom 35% must be darker, calm and completely free of text (event details go there). No other words, letters, numbers, signs, logos, watermarks or brand names anywhere."
      : " Leave the top 15% and the bottom 35% darker and calm for text overlays. Absolutely no text, letters, numbers, signs, logos, watermarks, brand names or readable screens anywhere.");
}
async function checkArt(env, b64, o, lettered, fetcher) {
  const want = (o.letter && o.letter.lines || []).map(s => String(s).toUpperCase().trim()).filter(Boolean).join(" ") + (lettered && o.letter.script ? " " + o.letter.script : "");
  const r = await respond(env, { input: [{ role: "user", content: [{ type: "input_text", text: "You are a strict print proofreader. Look at this poster artwork. " + (lettered ? "The ONLY text allowed is the title \"" + want + "\" (case and line breaks don't matter)." : "No text of any kind is allowed.") + " Answer in JSON: {\"title_read\": exactly what the title says or \"\", \"title_exact\": true only if every letter matches, \"other_text\": true if any other letters/numbers/signs are visible, \"logo\": true if any logo or brand mark is visible, \"problems\": [short notes about distorted faces, hands or obvious artifacts]}." }, { type: "input_image", image_url: "data:image/" + (o.format === "jpeg" ? "jpeg" : "png") + ";base64," + b64, detail: "low" }] }], text: { format: { type: "json_object" } } }, fetcher);
  let j = {}; try { j = JSON.parse(r.text) } catch (e) { }
  const ok = (lettered ? !!j.title_exact : true) && !j.other_text && !j.logo;
  return { ok, read: String(j.title_read || ""), otherText: !!j.other_text, logo: !!j.logo, problems: (j.problems || []).map(String).slice(0, 5), cost: r.cost };
}
export async function paintArt(env, o, fetcher) {
  const size = ["1024x1024", "1024x1536", "1536x1024"].includes(o.size) ? o.size : "1024x1536", q = ["low", "medium", "high"].includes(o.quality) ? o.quality : "medium";
  const wantLetters = !!(o.letter && (o.letter.lines || []).filter(Boolean).length && o.lettering !== false), log = [];
  let cost = 0, last = null, usedRefs = false; const refBlobs = [], missing = [];
  for (const k of (o.refs || []).slice(0, 6)) { if (!/^content\/(refs|final|keep|brand)\/[A-Za-z0-9._\/-]{3,180}$/.test(String(k)) || String(k).includes("..")) continue; const ob = await env.STUDIO_BUCKET.get(k); if (!ob) { missing.push(k); continue }
    const ct = (ob.httpMetadata && ob.httpMetadata.contentType) || (/\.png$/.test(k) ? "image/png" : "image/jpeg"); if (!/^image\/(png|jpeg|webp)$/.test(ct)) { missing.push(k); continue } refBlobs.push({ blob: new Blob([await ob.arrayBuffer()], { type: ct }), ext: ct.split("/")[1] === "jpeg" ? "jpg" : ct.split("/")[1], key: k }) }
  const attempts = wantLetters ? [true, true, false] : [false, false];
  for (let i = 0; i < attempts.length; i++) {
    const lettered = attempts[i]; if (i && !(await budgetOk(env, PRICE.image[q][size])).ok) break;
    const prompt = artPrompt(Object.assign({}, o, { refs: refBlobs.length ? refBlobs : [] }), lettered); let r, j, used = "";
    for (const model of IMAGE_MODELS(env).filter(m => !/^dall-e/.test(m))) {
      const fmt = o.format === "jpeg" ? { output_format: "jpeg", output_compression: 88 } : {};
      if (refBlobs.length && /^gpt-image/.test(model)) { const fd = new FormData(); fd.append("model", model); fd.append("prompt", prompt); fd.append("size", size); fd.append("quality", q); fd.append("n", "1"); if (/^gpt-image-1$/.test(model)) fd.append("input_fidelity", o.refMode === "close" ? "high" : "low"); if (fmt.output_format) { fd.append("output_format", "jpeg"); fd.append("output_compression", "88") }
        refBlobs.forEach((x, k) => fd.append("image[]", x.blob, "ref" + (k + 1) + "." + x.ext));
        r = await (fetcher || fetch)("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: "Bearer " + env.OPENAI_API_KEY }, body: fd }); usedRefs = true }
      else r = await (fetcher || fetch)("https://api.openai.com/v1/images/generations", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(Object.assign({ model, prompt, size, quality: q, n: 1 }, fmt)) });
      j = await r.json().catch(() => ({})); used = model; if (r.ok || !modelProblem(r.status, j)) break;
    }
    if (!r.ok) throw Object.assign(new Error(openaiErr(r.status, j)), { status: r.status });
    const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error("The image model returned no picture");
    cost += (/mini/.test(used) ? PRICE.image[q][size] * .3 : PRICE.image[q][size]) + (usedRefs ? refBlobs.length * (o.refMode === "close" ? .03 : .01) : 0);
    let qc = { ok: true, skipped: true }; if (o.check !== false) { try { qc = await checkArt(env, b64, o, lettered, fetcher); cost += qc.cost } catch (e) { qc = { ok: true, skipped: true, note: "Proofread unavailable: " + e.message } } }
    log.push({ lettered, ok: qc.ok, read: qc.read || "", otherText: !!qc.otherText, logo: !!qc.logo });
    last = { b64, lettered, model: used, qc };
    if (qc.ok) break;
  }
  if (!last) throw new Error("Monthly AI budget reached");
  const key = "content/tmp/" + (o.id ? String(o.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) + "-" : "") + Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 6) + (o.format === "jpeg" ? ".jpg" : "") + ".b64";
  await env.STUDIO_BUCKET.put(key, last.b64, { httpMetadata: { contentType: "text/plain" }, customMetadata: { by: o.by || "", at: new Date().toISOString() } });
  return { key, cost: Math.round(cost * 10000) / 10000, model: last.model, lettered: last.lettered && last.qc.ok, qc: last.qc, attempts: log, size, quality: q, refsUsed: usedRefs ? refBlobs.map(x => x.key) : [], refsMissing: missing };
}
/* display fonts for posters (SIL Open Font License / Apache, from Google Fonts' public repository), cached in R2 */
export const POSTER_FONTS = { anton: "ofl/anton/Anton-Regular.ttf", bebas: "ofl/bebasneue/BebasNeue-Regular.ttf", kaushan: "ofl/kaushanscript/KaushanScript-Regular.ttf", marker: "apache/permanentmarker/PermanentMarker-Regular.ttf", creepster: "ofl/creepster/Creepster-Regular.ttf", greatvibes: "ofl/greatvibes/GreatVibes-Regular.ttf", abril: "ofl/abrilfatface/AbrilFatface-Regular.ttf", archivo: "ofl/archivoblack/ArchivoBlack-Regular.ttf", pacifico: "ofl/pacifico/Pacifico-Regular.ttf", alfa: "ofl/alfaslabone/AlfaSlabOne-Regular.ttf" };
export async function posterFont(env, id, fetcher) {
  const path = POSTER_FONTS[id]; if (!path) return null; const key = "content/fonts/" + id + ".ttf";
  const o = await env.STUDIO_BUCKET.get(key); if (o) return new Uint8Array(await o.arrayBuffer());
  for (const base of ["https://raw.githubusercontent.com/google/fonts/main/", "https://cdn.jsdelivr.net/gh/google/fonts@main/", "https://github.com/google/fonts/raw/main/"]) {
    try { const r = await (fetcher || fetch)(base + path); if (!r.ok) continue; const u = new Uint8Array(await r.arrayBuffer()); const sig = (u[0] << 24 | u[1] << 16 | u[2] << 8 | u[3]) >>> 0; if (u.length < 5000 || (sig !== 0x00010000 && sig !== 0x74727565)) continue;
      await env.STUDIO_BUCKET.put(key, u, { httpMetadata: { contentType: "font/ttf" } }); return u } catch (e) { }
  }
  return null;
}
export function openaiErr(status, j) {
  const m = (j && j.error && (j.error.message || j.error.code)) || "";
  if (status === 401) return "OpenAI rejected the key (OPENAI_API_KEY). Check it in Cloudflare.";
  if (status === 429) return /quota|billing/i.test(m) ? "OpenAI says the account is out of credit or over quota." : "OpenAI is busy (rate limit). Try again in a minute.";
  if (/verif/i.test(m)) return "OpenAI needs your organization verified before it allows this image model (platform.openai.com › Settings › Organization › General › Verify). OpenAI said: " + String(m).slice(0, 200);
  if ((status === 400 || status === 404) && /model/i.test(m)) return "OpenAI couldn't use the model. OpenAI said: " + String(m).slice(0, 220) + " (Check OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL in Cloudflare, or delete them to use the defaults.)";
  if (/safety|policy|moderation/i.test(m)) return "OpenAI declined that request (content policy). Rephrase the brief.";
  return "OpenAI error" + (m ? ": " + String(m).slice(0, 160) : " (" + status + ")");
}

/* ---------- prompts ---------- */
const FEATURE_ICONS = "navigate,pin,cloud,car,food,drink,music,heart,users,home,building,briefcase,dollar,target,cube,doc,layers,ruler,star,play,mic,ticket,calendar,sparkle,shield,chart,camera,book,crown,game,search,bolt,globe,phone,gift";
export function brandBrief(b) {
  b = b || {};
  return ["Brand: " + (b.name || "Grooveville"), b.tagline ? "Tagline: " + b.tagline : "", b.voice ? "Voice: " + b.voice : "", b.audience ? "Audience: " + b.audience : "",
    b.parentName ? "Part of: " + b.parentName + " (keep this project's own identity)" : "", b.about ? "Mission / what it stands for: " + b.about : "",
    (b.locations || []).length ? "Usual locations: " + b.locations.slice(0, 6).map(l => [l.name, l.address, l.website].filter(Boolean).join(", ")).join(" | ") : "",
    b.location ? "This post's location: " + [b.location.name, b.location.address, b.location.website].filter(Boolean).join(", ") : "", b.website ? "Website: " + b.website : "", (b.hashtags || []).length ? "Default hashtags: " + b.hashtags.join(" ") : "",
    (b.ctas || []).length ? "Preferred calls to action: " + b.ctas.join(" | ") : "", b.restrictions ? "Never do: " + b.restrictions : "", b.guidelines ? "Guidelines: " + b.guidelines : "",
    ...(b.intel ? [b.intel.purpose ? "Purpose: " + b.intel.purpose : "", b.intel.industry ? "Industry: " + b.intel.industry : "", (b.intel.markets || []).length ? "Markets: " + b.intel.markets.join(", ") : "", b.intel.personality ? "Personality: " + b.intel.personality : "",
      (b.intel.products || []).length ? "Products, services and features (only these exist): " + b.intel.products.join("; ") : "", (b.intel.avoid || []).length ? "Topics to avoid completely: " + b.intel.avoid.join(", ") : "", b.intel.rules ? "Brand rules: " + b.intel.rules : "", b.intel.visual ? "Visual direction for imagery: " + b.intel.visual : ""] : [])].filter(Boolean).join("\n");
}
const POST_SHAPE = `Each post object: {"angle": short label, "kicker": up to 3 short lines for the top-right corner joined with \\n (e.g. "REAL JOBS.\\nREAL PEOPLE."), "tagline": spaced-caps line under the logo like "FOOD • FRIENDS • PLANS • VIBES",
"headline": array of 2-4 SHORT punchy lines (max 14 characters each, the last one is the accent line), "subline": 1-3 short lines in caps, "features": array of 3-5 {"icon": one of [${FEATURE_ICONS}], "title": max 22 chars, "text": max 40 chars},
"cta": button text max 18 chars, "url": short web address to show, "caption": the social caption (no hashtags inside), "hashtags": array of 3-8, "variants": {"instagram","facebook","tiktok","youtube","linkedin","x"} platform-tuned captions (x under 260 chars),
"imagePrompt": a specific photorealistic, cinematic scene for the background that shows what this brand actually does (following its visual direction): subject, setting, lighting, mood, camera angle; absolutely no text, letters, logos or brand names, "suggestedDate": YYYY-MM-DD or ""}`;
const POSTER_SHAPE = `Each post object: {"angle": short label for this concept, "title": array of 1-3 SHORT poster title lines (max 14 characters each, punchy, e.g. ["TRICK OR","TEMPTATIONS"]), "script": optional short accent word in script under the title (max 12 chars, e.g. "Weekend") or "",
"kicker": host/venue line for the top ONLY if given in the brief, else "", "when": [] (dates are filled in from the planner; only add a time line like "9PM – 2AM" if the brief states it), "lineup": performers ONLY if named in the brief (joined with " | "), else "", "where": venue/address ONLY if given, else "", "details": one short extra line only from the brief (e.g. "21+", "Free before 11") or "",
"cta": max 18 chars, "url": short web address (the brand's own), "caption": social caption (no hashtags inside), "hashtags": array of 3-8, "variants": {"instagram","facebook","tiktok","youtube","x"} platform-tuned captions (x under 260 chars),
"imagePrompt": one vivid photorealistic, cinematic scene for the poster photo that fits the theme and the brand's visual direction (subjects, setting, wardrobe, lighting, color, camera); stylish Black American nightlife and culture where it fits the brand; no text, letters or logos, "palette": 2-3 color words or hex values for lighting accents, "titleStyle": 4-10 words describing premium lettering that fits (e.g. "molten orange horror lettering with embers")}`;
const RULES = `Rules: write in the brand's voice. Use only facts given to you; never invent dates, prices, statistics, partners, quotes or announcements. If something isn't confirmed, keep it general ("coming soon"). Keep it fresh: don't repeat the avoided headlines. Return JSON only.`;

export async function contentApi(req, env, ctx, h) {
  const { p, url, verifyIdToken, fsField } = h, fetcher = h.fetcher || fetch;
  if (!env.STUDIO_BUCKET) return J({ error: "The STUDIO_BUCKET R2 binding is missing" }, 503);
  const fontM = /^\/api\/content\/font\/([a-z]+)\.ttf$/.exec(p);
  if (fontM && req.method === "GET") { const u = await posterFont(env, fontM[1], fetcher); if (!u) return J({ error: "Font unavailable" }, 404); return new Response(u, { headers: { "content-type": "font/ttf", "cache-control": "public, max-age=2592000", "access-control-allow-origin": "*" } }) }
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
    let n = 0; for (const k of keys) { if (k.startsWith("content/brand/") && !(founder && b.brandKit === true)) continue; if (k.startsWith("content/refs/") && !founder) continue; await env.STUDIO_BUCKET.delete(k); n++ }
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
    let r, j, used = "", cost = est;
    for (const model of IMAGE_MODELS(env)) {
      const d3 = /^dall-e-3/.test(model), sz = d3 ? ({ "1024x1536": "1024x1792", "1536x1024": "1792x1024" })[size] || "1024x1024" : size;
      const body = d3 ? { model, prompt: prompt.slice(0, 3900), size: sz, quality: q === "high" ? "hd" : "standard", response_format: "b64_json", n: 1 } : { model, prompt, size, quality: q, n: 1 };
      r = await fetcher("https://api.openai.com/v1/images/generations", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(body) });
      j = await r.json().catch(() => ({})); used = model;
      cost = d3 ? (q === "high" ? (sz === "1024x1024" ? .08 : .12) : (sz === "1024x1024" ? .04 : .08)) : /mini/.test(model) ? est * .3 : est;
      if (r.ok || !modelProblem(r.status, j)) break;
    }
    if (!r.ok) return J({ error: openaiErr(r.status, j) }, r.status === 429 ? 429 : 502);
    const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) return J({ error: "OpenAI returned no image" }, 502);
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), key = "content/tmp/" + Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8) + ".png";
    await env.STUDIO_BUCKET.put(key, bin, { httpMetadata: { contentType: "image/png" }, customMetadata: { by, at: new Date().toISOString() } });
    await charge(env, "image", cost, by, used + " " + size + " " + q);
    return J({ key, cost, size, quality: q, model: used });
  }
  if (p === "/api/content/style/analyze" && req.method === "POST") {
    const na = needAI(); if (na) return na; const bud = await budgetOk(env, 0.02); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
    const imgs = (Array.isArray(b.images) ? b.images : []).filter(u => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(String(u)) && u.length < 400000).slice(0, 8); if (!imgs.length) return J({ error: "Add at least one reference image" }, 400);
    try { const r = await respond(env, { input: [{ role: "user", content: [{ type: "input_text", text: "You are a senior art director. Study these " + imgs.length + " reference graphics" + (b.brand ? " for the brand " + String(b.brand).slice(0, 80) : "") + (b.name ? " (style collection: " + String(b.name).slice(0, 80) + ")" : "") + ". Describe only their shared VISUAL LANGUAGE so a designer can make new, original graphics in the same direction (never describe the specific text, people or logos). Answer in JSON: {\"profile\": 1-2 sentences summarizing the visual style, \"palette\": [3-6 hex colors], \"typography\": string, \"hierarchy\": string, \"composition\": string, \"lighting\": string, \"photography\": string, \"subject\": string (subject placement), \"depth\": string, \"background\": string, \"logo\": string (logo positioning), \"effects\": string (effects and textures), \"aesthetic\": string, \"tags\": [3-8 short lowercase tags], \"category\": one of [nightlife, live music, new music, homecoming, holiday, brunch, birthday, civic, motivation, food, travel, tech, books, general]}." }].concat(imgs.map(u => ({ type: "input_image", image_url: u, detail: "low" }))) }], text: { format: { type: "json_object" } } }, fetcher);
      let a = {}; try { a = JSON.parse(r.text) } catch (e) { } await charge(env, "style analysis", r.cost, by, String(b.name || "").slice(0, 60));
      return J({ analysis: { profile: String(a.profile || "").slice(0, 600), palette: (a.palette || []).map(String).filter(c => /^#?[0-9a-f]{6}$/i.test(c)).slice(0, 6), typography: String(a.typography || ""), hierarchy: String(a.hierarchy || ""), composition: String(a.composition || ""), lighting: String(a.lighting || ""), photography: String(a.photography || ""), subject: String(a.subject || ""), depth: String(a.depth || ""), background: String(a.background || ""), logo: String(a.logo || ""), effects: String(a.effects || ""), aesthetic: String(a.aesthetic || ""), tags: (a.tags || []).map(t => String(t).toLowerCase().slice(0, 24)).slice(0, 8), category: String(a.category || "general") }, cost: r.cost }) }
    catch (e) { return J({ error: e.message }, 502) }
  }
  if (p === "/api/content/art" && req.method === "POST") {
    const na = needAI(); if (na) return na;
    const size = ["1024x1024", "1024x1536", "1536x1024"].includes(b.size) ? b.size : "1024x1536", cfg = await readJson(env, "content/config.json", {}), q = ["low", "medium", "high"].includes(b.quality) ? b.quality : (cfg.imageQuality || "medium");
    const bud = await budgetOk(env, PRICE.image[q][size] + 0.01); if (!bud.ok) return J({ error: "Monthly AI budget reached ($" + bud.total.toFixed(2) + " of $" + bud.limit + "). Raise it in Content Studio › Settings." }, 402);
    try { const r = await paintArt(env, { scene: b.scene, visual: b.visual, palette: b.palette, size, quality: q, letter: b.letter, lettering: b.lettering !== false, by, id: b.id, refs: Array.isArray(b.refs) ? b.refs.slice(0, 6) : [], refMode: ["close", "inspired", "remix"].includes(b.refMode) ? b.refMode : "inspired", styleText: String(b.styleText || "").slice(0, 700), variant: Number(b.variant) || 0 }, fetcher); await charge(env, "poster art", r.cost, by, r.model + " " + size + " " + q + (r.lettered ? " lettered" : "")); return J(r) }
    catch (e) { return J({ error: e.message }, e.status === 429 ? 429 : 502) }
  }
  if (p.startsWith("/api/content/autopilot/")) return autopilotApi(req, env, ctx, { p, url, founder, by, b, fetcher });
  return J({ error: "Not found" }, 404);
}
export async function genPosts(env, b, fetcher) {
  const poster = b.layout === "poster", n = Math.max(1, Math.min(poster ? 10 : 4, Number(b.count) || 1));
  if (poster) {
    const r = await openaiJSON(env, "You are Grooveville's in-house creative agency making premium promotional flyers and social posts. " + RULES,
      brandBrief(b.brand) + "\n\nContent type: " + (b.kind || "flyer") + "\nTopic / event: " + String(b.brief || "Evergreen brand post").slice(0, 1500) + (b.direction ? "\nStyle / vibe: " + String(b.direction).slice(0, 300) : "") +
      (b.theme ? "\nTheme: " + String(b.theme).slice(0, 80) : "") + (b.holiday ? "\nHoliday to reference: " + String(b.holiday).slice(0, 80) : "") + (b.date ? "\nPlanned date: " + b.date : "") + "\nPlatforms: " + (b.platforms || ["instagram"]).join(", ") +
      ((b.events || []).length ? "\nConfirmed upcoming events you may reference: " + JSON.stringify(b.events).slice(0, 1500) : "") + ((b.avoid || []).length ? "\nAvoid repeating these recent titles: " + b.avoid.slice(0, 40).join(" | ") : "") +
      "\n\nWrite " + n + " clearly different concepts (different titles, scenes and angles). Return JSON {\"posts\":[...]}.\n" + POSTER_SHAPE, null, fetcher);
    const posts = ((r.data && r.data.posts) || []).slice(0, n); if (!posts.length) throw new Error("The AI didn't return any concepts. Try again.");
    return { posts, cost: r.cost };
  }
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
  /* Autopilot replaces the old weekly copy-only proposals when it is on */
  const ap = await apConfig(env); if (ap.on) { await autopilotCron(env, fetcher); return }
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
