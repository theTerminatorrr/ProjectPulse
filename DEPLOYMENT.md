# ProjectPulse — Deployment Guide

ProjectPulse is a pure static site (HTML/CSS/vanilla JS, no backend, no build step),
so deployment is just "put the files on a static host." This guide covers the three
hosts named in the spec — GitHub Pages, Netlify, Vercel — plus local testing and a
troubleshooting section.

---

## 0. Before you deploy

**Folder check.** Your repo root should look like this (already matches — nothing to
rearrange):

```
ProjectPulse/
├── index.html, login.html, register.html, dashboard.html, ...
├── css/
├── js/
├── images/ icons/ fonts/ data/
├── .gitignore
├── netlify.toml
├── vercel.json
└── README.md
```

**Path check.** Every `<script src="...">`, `<link href="...">`, and internal `<a href="...">`
in this project uses a **relative** path (`css/variables.css`, `js/app.js`, `dashboard.html`) —
never a leading `/`. This matters because GitHub Pages project sites are served from a
subpath (`https://username.github.io/ProjectPulse/`), not the domain root — an absolute
path like `/css/variables.css` would 404 there. This project was already built relative
throughout, so no changes are needed before deploying to any of the three hosts.

**No build step.** There's no `npm install`, no bundler, nothing to compile. Whatever's
in the folder is exactly what gets served.

**Data lives in the visitor's browser.** Because everything is stored in `localStorage`,
every visitor gets their own empty (auto-seeded with demo data) copy of the app. Nothing
is shared between visitors, and nothing you do locally needs to be "uploaded" — the code
is static, the data is per-browser.

---

## 1. GitHub Pages

**Option A — via the GitHub web UI (no git CLI needed):**
1. Create a new repository on GitHub (e.g. `ProjectPulse`).
2. Upload every file/folder from this project into it (drag-and-drop works for the
   initial commit, or use "Add file → Upload files").
3. Go to **Settings → Pages**.
4. Under "Build and deployment," set **Source: Deploy from a branch**.
5. Set **Branch: main**, folder **/ (root)** → **Save**.
6. Wait ~1 minute, then your site is live at `https://<username>.github.io/<repo-name>/`.

**Option B — via git CLI:**
```bash
cd ProjectPulse
git init
git add .
git commit -m "Initial commit — ProjectPulse"
git branch -M main
git remote add origin https://github.com/<username>/<repo-name>.git
git push -u origin main
```
Then follow steps 3–6 above.

**Note on repo name:** if your repo is named `<username>.github.io` exactly, the site
deploys to the domain root instead of a subpath — both work fine here since the project
uses relative paths either way.

---

## 2. Netlify

**Option A — Drag-and-drop (fastest, no git required):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the `ProjectPulse` folder onto the page.
3. Netlify uploads it and gives you a live URL (e.g. `random-name-123.netlify.app`)
   within seconds.
4. Optional: claim/rename the site and add a custom domain under **Site settings → Domain management**.

**Option B — Git-based continuous deployment (auto-redeploys on every push):**
1. Push the project to a GitHub/GitLab/Bitbucket repo (see GitHub steps above if needed).
2. In Netlify: **Add new site → Import an existing project** → pick your repo.
3. Build settings: leave **Build command** blank and **Publish directory** as `.` (the
   included `netlify.toml` already sets this, so Netlify should detect it automatically).
4. **Deploy site.**

The included `netlify.toml` also sets a few safe security headers (`X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`) and a friendly 404 fallback — nothing you
need to configure manually.

---

## 3. Vercel

**Option A — Vercel CLI:**
```bash
npm install -g vercel   # one-time
cd ProjectPulse
vercel                  # follow the prompts; accept defaults (no build command needed)
vercel --prod           # promote to your production URL
```

**Option B — Git-based (dashboard):**
1. Push the project to a GitHub/GitLab/Bitbucket repo.
2. In Vercel: **Add New → Project** → import the repo.
3. Framework preset: choose **"Other"** (static site, no framework). Leave the build
   command empty and the output directory as `.` — the included `vercel.json` handles
   the rest.
4. **Deploy.**

---

## 4. Testing locally before you deploy

Opening `index.html` directly by double-clicking it (a `file://` URL) mostly works for
this project since `localStorage` still functions under `file://` in every modern
browser — but it's safer and closer to production to run a tiny local server:

```bash
# Python 3 (built into most systems)
cd ProjectPulse
python3 -m http.server 8080
# then open http://localhost:8080

# OR Node, if you have it
npx serve .

# OR VS Code: install the "Live Server" extension, right-click index.html → "Open with Live Server"
```

---

## 5. Troubleshooting

**Blank page / nothing renders, no console errors mention a 404.**
Check the browser console (F12) for a red error first — almost always one of the issues below.

**Console shows 404s for `css/...` or `js/...` files.**
- Confirm the `css/` and `js/` folders were actually uploaded (drag-and-drop deployments
  sometimes miss empty-looking subfolders — `images/`, `icons/`, `fonts/`, `data/` are
  fine to be empty, but `css/` and `js/` must contain their files).
- Case sensitivity: GitHub Pages/Netlify/Vercel servers are case-sensitive Linux
  filesystems. If a filename was ever renamed with different casing on Windows/Mac, the
  local casing lie might not match what's referenced in the HTML. This project's
  filenames are already all-lowercase and consistent, so this shouldn't come up unless
  files are renamed later.

**Page loads but looks completely unstyled (no navy gradient, no fonts).**
- Usually a blocked CDN request (Google Fonts, Font Awesome). Check the Network tab —
  if requests to `fonts.googleapis.com` or `cdnjs.cloudflare.com` are blocked by a
  corporate network, ad-blocker, or browser privacy extension, the layout still works
  but falls back to system fonts/no icons. This is a client-side network restriction, not
  a deployment bug — test in a different network/browser to confirm.

**Buttons/forms don't do anything (Kanban doesn't drag, modals don't open).**
- Check the console for a JS error. The most common cause during development was a page
  referencing a script it didn't load (see `TESTING_REPORT.md` for the exact bug found
  and fixed in Phase 7) — if you've since edited any HTML file's `<script>` tags, make
  sure you didn't remove one a page's onclick handlers depend on.

**Changes I just deployed don't show up.**
- Browser cache. Hard-refresh (Ctrl/Cmd+Shift+R) or open in a private/incognito window.
  Netlify/Vercel deploys are near-instant; GitHub Pages can take up to a couple of
  minutes to propagate after a push.

**"Your browser storage is full" toast, or data stops saving.**
- `localStorage` has a ~5–10MB per-origin limit (varies by browser). This mostly comes
  up after heavy use with many file "attachments" (this app only stores filenames, not
  actual file bytes, so this is unlikely) or many avatar uploads (base64 images do count
  against the quota). Settings → Export lets a user back up their data as JSON before
  clearing space.

**Demo login buttons don't work after I edited `seed.js`.**
- The seed only runs once per browser (guarded by a `pt_seeded` flag in `localStorage`).
  If you change the seed data, existing visitors (and your own browser, if you tested
  before deploying) won't see the new seed until they clear site data, or you use
  Settings → Reset demo data.

**It works on desktop but the sidebar/Kanban look broken on mobile.**
- Confirm the viewport meta tag wasn't stripped by any tooling
  (`<meta name="viewport" content="width=device-width, initial-scale=1.0">` should be in
  every page's `<head>` — it is, by default, in every page in this project).

---

## 6. Custom domain (optional, any host)

All three hosts support free custom domains:
- **GitHub Pages:** Settings → Pages → Custom domain, then add a `CNAME` record at your
  DNS provider pointing to `<username>.github.io`.
- **Netlify:** Site settings → Domain management → Add a domain.
- **Vercel:** Project → Settings → Domains → Add.

All three also provide free HTTPS automatically once the domain is verified — no
certificate setup needed.
