# Creative Studio — setup

Creative Studio lives in the Back Office (**Back office › Creative Studio**). It uses the Firebase project and the R2 bucket you already have. Nothing new to sign up for.

## 1. Publish the Firestore rules (required)

Firebase console › Firestore Database › **Rules**. Paste the whole `firestore.rules` file from this release and click **Publish**.

The new parts are additive:

| Collection | Who can read | Who can write |
|---|---|---|
| `creativeRoles/{uid}` | that person, founder | founder only |
| `readsStaff/{uid}` | that person, founder | founder only |
| `creative*` (universes, characters, lore, books, chapters, templates, assets, animation, games, adaptations) | founder + anyone with a Creative Studio role | founder + admin, writer, illustrator, animator, game developer, editor (viewers read only). Deleting: founder or admin |
| `soundlab*` (projects, DNA, voices) | founder, admin, producer | same, except only the founder can mark a voice consent **verified**. `soundlabReleases` is founder only |
| `grooveReadsProgress/{uid}` | that reader only | that reader only |

Until you publish, Creative Studio shows “Firebase blocked Creative Studio”.

## 2. Give people roles

Creative Studio dashboard › **Who can use Creative Studio**. Choose Administrator, Writer, Illustrator, Animator, Game developer, Editor, Producer (Sound Lab) or Viewer. Roles never give access to the rest of the Back Office, and Groove Reads customer accounts never get a role.

## 3. Shadow Crown

On the dashboard, **Set up Shadow Crown** imports the characters and lore from the Shadow Crown website. Portraits become locked master references (IDs `SC-0001`…).

## What’s connected and what isn’t

- Text help (outlines, rewrites, reviews), images and narration use your existing `OPENAI_API_KEY` and the Content Studio monthly budget.
- **Video generation: not connected.** Animation Studio makes storyboards, scratch voices and animatic videos (images + audio) in the browser.
- Kindle Direct Publishing: Creative Studio prepares files and checks them against KDP’s published rules. It does not upload to KDP or promise approval; upload the files at kdp.amazon.com yourself. Hardcover cover sizes come from KDP’s cover calculator.
