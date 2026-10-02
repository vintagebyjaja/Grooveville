# Grooveville

The website for **Grooveville LLC**, the DrawUp Headquarters, and the companies on the Groove Vine:
Grooveville Entertainment, Grooveville Music, Vybr8, Pathd, Grooveville Rentals, W4W, DrawUp AEC,
Shadow Crown Universe and What If Tomorrow.

It's a single static page (`index.html`) with:

- **Public site:** home page with the Groove Vine, a page for every company, a public calendar, and an official collaboration request form.
- **Sign in portal:**
  - **Founder:** full back office with the dashboard (hours, money spent and money in for every company), timesheet, private/public calendar, reminders, collabs, team access, private notes and site settings.
  - **Team members:** a private timesheet for only the companies you assign them.

Logins and private data use **Firebase** (free Spark plan). Hosting is **Netlify** with your **grooveville.org** domain.

---

## 1. Put it on GitHub

1. Create a new repository on GitHub (for example `grooveville-site`). Make it **private** if you like. The site works either way.
2. Upload every file in this folder: `index.html`, `logo.webp`, `firebase-config.js`, `firestore.rules`, `firebase.json`, `netlify.toml`, `README.md`, `.gitignore`.

## 2. Set up Firebase (logins + database)

1. Go to https://console.firebase.google.com and click **Add project**. Name it `grooveville`. You can turn off Google Analytics.
2. **Authentication** > Get started > **Email/Password** > Enable > Save.
3. **Firestore Database** > Create database > choose a location near you > start in **production mode**.
4. In Firestore, open the **Rules** tab, delete what's there, paste everything from `firestore.rules`, and click **Publish**.
5. **Project settings** (gear icon) > **Your apps** > click the web icon `</>` > register the app. Firebase shows a `firebaseConfig` block. Copy those values into `firebase-config.js` and commit the change on GitHub.

The values in `firebase-config.js` are meant to be public. Your data is protected by the rules from step 4.

## 3. Put it on Netlify

1. Go to https://app.netlify.com > **Add new site** > **Import an existing project** > GitHub > pick the repository.
2. Leave the build command empty. The publish directory is `.` (already set in `netlify.toml`). Click **Deploy**.
3. **Domain management** > **Add a domain** > `grooveville.org`. Follow Netlify's DNS steps at the place you bought the domain. Netlify adds free HTTPS on its own.
4. Back in Firebase: **Authentication** > **Settings** > **Authorized domains** > add `grooveville.org`, `www.grooveville.org` and your `*.netlify.app` address.

Every time you change a file on GitHub, Netlify republishes the site automatically.

## 4. Make yourself the founder

1. Open your site, click **Sign in** > **Create team account** with your email and a strong password.
2. In Firebase: **Authentication** > **Users**, copy your **User UID**.
3. **Firestore Database** > **Start collection** > Collection ID `access` > Document ID = your UID > add a field `role` (string) = `founder` > Save.
4. Reload the site and sign in. You now see **Back office** with everything.

## 5. Teams, company heads and join requests

1. A new person opens the site > **Sign in** > **Create team account**, then picks the company team(s) they want to join and clicks **Ask to join**.
2. **You (founder)** see every request in **Back office > Teams**. Click **Approve** or **Decline**, or use **Add a person** to put someone on a team directly.
3. **Company heads:** in **Back office > Teams**, use **Make head** under a company to pick its head (they must have an account first). A head gets a **My team** tab where they approve or decline people asking to join *their* company and add or remove members. Heads can't touch other companies.
4. Approved people sign in and see **My timesheet**. They can log meetings, work hours, money spent, receipts (with a photo) and money in (payments, donations, sponsorships and more) for their company. They never see the back office, other people's entries, private events, reminders, collabs or private notes. Heads can join more teams the same way.

## Private notes

**Back office > Private notes** is for passwords, log ins and account details. Notes are encrypted in your browser with a passphrase you choose before anything is saved, so not even Firebase can read them.
**If you forget the passphrase, the notes can't be recovered.**

## Editing company pages

**Back office > Site settings** lets you change each company's tagline, description, website, social link and logo. On this version, changes show on the public site as soon as you save.
Default text and links live near the top of the script in `index.html` (search for `const BRANDS`).

## Costs

The Firebase Spark plan and Netlify's free plan are enough for a small team. Firebase only asks for a card if you upgrade.
