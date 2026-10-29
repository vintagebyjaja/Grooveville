// Copies Grooveville's keys from Cloudflare's BUILD variables into the live Worker as encrypted secrets.
// Runs after `npx wrangler deploy` (Settings › Build › Deploy command). Values are never printed or saved in the repo.
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const NAMES = ["GOOGLE_MAPS_BROWSER_KEY", "GOOGLE_ROUTES_API_KEY", "YOUTUBE_API_KEY", "OPENAI_API_KEY", "CF_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SITE_PREVIEW_SECRET", "OPENAI_TEXT_MODEL", "OPENAI_IMAGE_MODEL", "GUIDE_MAP_ID_DARK", "GUIDE_MAP_ID_LIGHT", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "READS_SECRET", "FIREBASE_SERVICE_ACCOUNT", "CONTENT_RENDER", "GEN_WORKER_URL", "GEN_WORKER_TOKEN", "GEN_MONTHLY_LIMIT_USD", "GEN_GPU_USD_PER_HOUR", "GEN_DAILY_JOBS"];
const found = {}, missing = [];
for (const n of NAMES) { const v = (process.env[n] || "").trim(); if (v) found[n] = v; else missing.push(n) }
if (!Object.keys(found).length) { console.log("[sync-secrets] No keys found in the build variables. Nothing to copy."); process.exit(0) }
const dir = mkdtempSync(join(tmpdir(), "gv-")), file = join(dir, "s.json");
writeFileSync(file, JSON.stringify(found), { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "secret", "bulk", file], { stdio: ["ignore", "ignore", "inherit"] });
  console.log("[sync-secrets] Copied to the live Worker: " + Object.keys(found).join(", "));
  if (missing.length) console.log("[sync-secrets] Not in build variables (skipped): " + missing.join(", "));
} catch (e) {
  console.log("[sync-secrets] Couldn't copy the keys (the site itself deployed fine). Add them under Settings › Variables and Secrets instead.");
} finally { try { unlinkSync(file) } catch (e) { } }
