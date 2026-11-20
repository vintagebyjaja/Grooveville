# Content Studio setup (Back office › Content Studio)

## 1. OpenAI key
Cloudflare › Workers & Pages › grooveville › Settings › Variables and Secrets › Add
- Type **Secret**, name **`OPENAI_API_KEY`**, value: your OpenAI API key → Save and deploy.
- Optional: `OPENAI_TEXT_MODEL` (default `gpt-5-mini`) and `OPENAI_IMAGE_MODEL` (default `gpt-image-1`).
Without the key, brand kits, the calendar, approvals and flyer design still work; the AI buttons stay off.

## 2. Firestore rules
Publish the new `firestore.rules`. It adds founder-only Content Studio collections (contentBrands, contentPosts, contentCampaigns, contentTrends, contentRoles, contentLog) and `guide/{uid}`. Nothing existing changes.

## 3. First run
Content Studio › Brand Kits › **Load Grooveville brands**, then upload each **official logo** (PNG with transparency or SVG). Logos are protected files: the AI never sees or redraws them.
Back office › Entertainment › **Projects & orgs** holds projects like The Unc & Neph Show, Groove Phi Groove, Game Night, 4wardsociety and Lounge Rent, each with its own logo, mission and usual locations.

## Costs (estimates, set a monthly budget in Settings; default $25)
- Copy for a post (2–3 options): about $0.003–0.01
- Campaign plan: about $0.02–0.06
- Trend research with web search: about $0.05–0.15
- AI background: about $0.02 (low), $0.06 (medium, default), $0.25 (high)
- Weekly proposals: 2 posts per brand per week by default (copy only, ~$0.01 per brand). Backgrounds are only made when you ask.
The server refuses AI calls once the monthly budget is reached.

## Storage
Files sit in your R2 bucket under `content/`. Temporary AI art not used in a saved post is deleted after 30 days automatically. Rejected drafts, old published images (captions stay) and unused graphics are removed on the schedule in Content Studio › Storage. Logos, brand photos and ★ protected posts are never auto-deleted.

## Publishing
Export-ready: approve → schedule → on the day download the graphic and copy the platform caption → mark published. Direct posting to each platform can be connected later (each needs its own developer approval). Nothing posts without your approval.
