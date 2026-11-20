# Content Autopilot — setup

Autopilot lives in **Content Studio › Autopilot**. It runs on the Worker's existing cron (every 2 minutes, one small step at a time), so it keeps working with the Back Office closed.

**What it does each week, per brand:**
1. Researches sourced, dated news, events and trends with OpenAI web search. Anything without a real source page and publication date is dropped.
2. Scores each topic (brand 35%, audience 20%, timeliness 20%, local 10%, value 10%, source 5%):
   - 85 and up is high priority.
   - 70–84 goes on the calendar.
   - 50–69 is kept as an idea.
   - Under 50 is never generated.
3. Checks holidays 30 days ahead, and plans them into the week they fall in when they suit the brand.
4. Checks official election offices weekly for civic reminders. These stay nonpartisan.
5. Plans the week using each brand's posts-per-week setting (default 2).
6. Writes the copy, paints the background art, places the brand's real logo file, renders the PNG and sends it to **Approvals**.
7. Learns from what you approve, edit, download, schedule or reject.

Nothing is ever published automatically.

## Turn it on
1. **Content Studio › Autopilot:** switch it on, then set posts per week, sizes and budgets for each brand under *Brands & budgets*.
2. **Brand Kits › Research profile:** check each brand's research directions. They start from the Grooveville defaults.
3. Press **Generate My Week** to start right away.

## Runs on Cloudflare, with your computer off
Everything runs inside the existing **grooveville** Worker. There is no GitHub runner and no runner token.

- **Cron trigger** (the existing 2-minute schedule): when Autopilot is on and work is due, it puts a job on the queue.
- **Cloudflare Queue `grooveville-autopilot`**: each message does one step (research, plan, copy, paint art, finish the graphic, deliver), then queues the next one. Long image jobs are spread across many short invocations, so no single run has to do everything.
- **A lock and fixed draft ids**: a step is never done twice, and a replayed message changes nothing.
- **Finishing the graphic:**
  - On the **Workers Paid** plan, the full renderer draws it, exactly like Generate Post.
  - On the **Free** plan, Cloudflare stops that (CPU limit). Autopilot notices automatically and switches to **Cloudflare Images**, which assembles the AI photo, your official logo file and the exact text. Free accounts get 5,000 image transformations a month at no cost.
  - If Images isn't available either, the graphic waits and is finished the next time Content Studio opens.
- **Delivery:** with `FIREBASE_SERVICE_ACCOUNT` set, finished graphics go straight into Firestore → Approvals.
- **Budgets:** the monthly AI budget and the per-brand budgets stop paid steps when they run out. Nothing is ever published.

### One-time setup
1. **Create the queue before uploading this update.** Cloudflare dashboard › Storage & Databases › Queues › **Create queue** › name it `grooveville-autopilot`. Leave the other settings as they are. The deploy fails with "queue not found" until it exists. If that happens, create it and press Retry deployment.
2. **`FIREBASE_SERVICE_ACCOUNT`** (skip if you already added it). This lets the server write finished graphics into Approvals while your computer is off.
   1. Firebase console › Project settings › Service accounts › **Generate new private key**.
   2. Paste the whole JSON as a Cloudflare secret named `FIREBASE_SERVICE_ACCOUNT` (Workers & Pages › grooveville › Settings › Variables and secrets).
   3. Without it, graphics are still made on the server, but they wait on the server and drop into Approvals the next time you open Content Studio.
3. Turn Autopilot on in **Content Studio › Autopilot**. The first job is queued right away.

Nothing else is needed:
- `OPENAI_API_KEY` is reused.
- The Images binding and `SITE_URL` (used for the font addresses) are already in `wrangler.jsonc`.
- If you added `AUTOPILOT_RUNNER_TOKEN`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN` or the GitHub Actions secrets for an earlier draft, you can delete them. Nothing reads them any more.

**Notifications with your computer off** aren't built yet. You see the "ready for approval" notice the next time you open Content Studio.

## Approved Content Styles
**Where to find it:** Brand Kits › **Approved Styles** on any brand.
- **Upload:** drop in reference flyers, posts, photos or type samples, as many as you like.
- **Organize:** group them into style collections (Nightlife, Live Music, Homecoming…).
- **Analyze:** press **Analyze with AI** to get an editable Visual Style Profile.

**How the styles are used:**
- **Generate Post:** the **Visual Direction** setting chooses which style each graphic follows.
- **Autopilot:** picks the best-matching collection for each topic and flags the choice for review when nothing matched.
- **Influence, not copying:** references are sent to the image model as style references, never pasted into the new graphic.

**How Autopilot learns your taste:**
- Approvals raise a collection's priority; rejections, with the reasons you tick, lower it.
- You can override the priority by hand.
- No model is retrained.

**Storage:** reference images are stored in the same private R2 bucket as all Content Studio files, and their records live on the brand kit in Firestore. No new Firebase product or rules change is needed.

## Poster graphics
Autopilot and Generate Post share one pipeline:
1. The AI writes the concept.
2. The image model paints a cinematic photo, usually with the title lettered into it.
3. A vision check proofreads that lettering. If the spelling is wrong, or any other text or logo appears, it repaints once. If that also fails, it uses a clean photo and sets the title in type.
4. Your official logo file, the date, time, venue, lineup and web address are laid on top by the renderer. They are always spelled exactly as entered.

Display fonts (Anton, Bebas Neue, Creepster and others, all free licenses) are fetched once from Google Fonts' public repository and cached in R2. If that fetch fails, Poppins is used.

## Budgets
- Every AI call counts against Content Studio's monthly budget (Settings).
- Each brand also has its own art budget and research budget.
- Paid steps stop when a budget runs out. Research already found stays visible.
- The daily brief costs nothing (it's compiled from saved results).
