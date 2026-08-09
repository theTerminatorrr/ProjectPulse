# Installation Guide

ProjectPulse has no dependencies to install and no build step. "Installing" it just
means getting the files onto your machine and opening them in a browser.

## 1. Get the files

Either download the ZIP and extract it, or clone the repository:

```bash
git clone https://github.com/<your-username>/ProjectPulse.git
cd ProjectPulse
```

## 2. Run it

**Simplest — just open the file:**
Double-click `index.html`. It opens in your default browser and works fully, including
data persistence (`localStorage` works fine under a `file://` URL in every modern browser).

**Recommended — run a tiny local server** (closer to how it'll behave once deployed,
and avoids a couple of browsers' stricter `file://` security settings):

```bash
# Python 3 (already installed on most systems)
python3 -m http.server 8080
# then visit http://localhost:8080

# Node.js, if you have it installed
npx serve .

# VS Code
# Install the "Live Server" extension, right-click index.html → "Open with Live Server"
```

## 3. Log in

Go to the login page and either:
- Click a **Demo Login** button (Teacher / Team Leader / Team Member) for instant access, or
- Register your own account via **Create one**.

Demo credentials, if you'd rather type them in:

| Role | Email | Password |
|---|---|---|
| Teacher | `teacher@demo.com` | `demo123` |
| Team Leader | `leader@demo.com` | `demo123` |
| Team Member | `member@demo.com` | `demo123` |

## Requirements

- Any modern browser (Chrome, Firefox, Edge, Safari — released in the last ~3 years).
- JavaScript enabled (it's a JS-driven app — nothing renders meaningfully without it).
- No internet connection is required for the app to run, **except** the first load of
  each page, since fonts/icons/chart libraries load from CDNs. If you need a fully
  offline environment, download those libraries and swap the CDN `<script>`/`<link>`
  tags for local copies (see `docs/DEVELOPER_GUIDE.md`).

## Resetting your data

Data is stored per-browser in `localStorage` under keys prefixed `pt_`. To start over:
- In-app: **Settings → Reset demo data**, or
- Manually: open DevTools → Application/Storage tab → clear localStorage for the site,
  then refresh (the demo data reseeds automatically).

## Troubleshooting installation issues

See the **Troubleshooting** section of [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — it
covers both local and deployed scenarios (blank page, unstyled page, scripts not
running, etc.).
