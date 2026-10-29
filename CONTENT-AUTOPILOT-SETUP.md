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

## Two optional settings that remove the "Back Office must be open" steps
| Setting | What it does | Cost |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` (build variable, the JSON key of a Firebase service account with Firestore access) | Drafts appear in Approvals the moment they're ready. Without it, they wait in an inbox and are added the next time Content Studio opens. | Free |
| `CONTENT_RENDER=worker` | The finished PNG is drawn on the server. Drawing takes about 1 second of CPU, which only the **Cloudflare Workers Paid** plan allows on cron. Without it, waiting graphics are finished automatically when Content Studio is opened. | Workers Paid is about $5/month. Your approval is needed; nothing has been bought. |

## Budgets
- Every AI call counts against Content Studio's monthly budget (Settings).
- Each brand also has its own art budget and research budget.
- Paid steps stop when a budget runs out. Research already found stays visible.
- The daily brief costs nothing (it's compiled from saved results).
