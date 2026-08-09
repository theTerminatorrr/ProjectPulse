# Folder & File Explanation

```
ProjectPulse/
├── index.html              Public landing page (hero, roles, features, CTA)
├── login.html               Login form, demo login buttons, forgot-password modal
├── register.html            Registration form with role selection
├── dashboard.html           Role-aware dashboard (Teacher/Leader/Member panels)
├── projects.html            Project list — cards, search/filter/sort, create modal
├── project-details.html     Tabbed project view (Overview/Tasks/Members/Feedback/Activity/Notes)
├── tasks.html                Kanban board + table view + task detail side panel
├── team.html                 Roster management + leaderboard (Leader only)
├── feedback.html             Feedback timeline + create modal (Teacher)
├── calendar.html             Monthly calendar + add-event modal
├── reports.html               5 report types, print + JSON export
├── profile.html               Avatar, personal info, change password
├── settings.html               Theme, notifications, data export/import/reset
│
├── css/
│   ├── variables.css         Design tokens: colors, spacing, fonts, motion, dark-mode overrides
│   ├── base.css                Reset, typography, buttons, focus states
│   ├── layout.css              Sidebar, topbar, app shell, landing page, auth pages, responsive breakpoints
│   ├── components.css          Cards, badges, forms, modals, tables, Kanban, calendar, everything reusable
│   └── pages.css                Small page-specific overrides
│
├── js/
│   ├── data/
│   │   ├── storage.js         localStorage wrapper: CRUD, schema versioning, quota handling, integrity sweep
│   │   └── seed.js             First-run demo data (users, projects, tasks, feedback, notifications, events)
│   ├── utils.js                 id generation, date formatting, toasts, HTML escaping, JSON download helper
│   ├── validation.js            Form validators, password strength meter
│   ├── auth.js                  Login/register/logout, session guard, role-based UI visibility, page router boot
│   ├── notifications.js         Notification center, deadline-approaching sweep
│   ├── projects.js              Project CRUD + project-details page + Notes
│   ├── tasks.js                 Task CRUD, Kanban rendering/drag-drop, task detail panel
│   ├── team.js                  Roster page, leaderboard, achievement badges
│   ├── feedback.js              Feedback CRUD + timeline rendering
│   ├── announcements.js         Announcements CRUD + dashboard widget
│   ├── calendar.js              Month-grid rendering, event CRUD
│   ├── charts.js                 Chart.js wrappers + dashboard chart builders
│   ├── reports.js                Report generation, print, JSON export
│   └── app.js                    Page router, shared chrome, dashboard/profile/settings page logic
│
├── images/                      (static image assets, if any are added)
├── icons/                        (static icon assets, if any are added — Font Awesome is loaded via CDN)
├── fonts/                         (static font files, if any are added — Poppins is loaded via Google Fonts CDN)
├── data/                          (reserved for static JSON fixtures, if needed later)
│
├── docs/                          This documentation set
│   ├── INSTALLATION.md
│   ├── USER_MANUAL.md
│   ├── DEVELOPER_GUIDE.md
│   ├── PROJECT_REPORT.md
│   ├── FEATURES.md
│   ├── FOLDER_STRUCTURE.md        (this file)
│   ├── LOCAL_STORAGE_SCHEMA.md
│   ├── TESTING_CHECKLIST.md
│   └── FUTURE_IMPROVEMENTS.md
│
├── README.md                    Project overview, quick start, demo credentials
├── TESTING_REPORT.md            Automated headless test results (Phase 7)
├── DEPLOYMENT.md                 GitHub Pages / Netlify / Vercel deployment guide
├── .gitignore
├── netlify.toml                  Netlify build/publish/header config
└── vercel.json                    Vercel header config
```

## Why some folders are empty

`images/`, `icons/`, and `fonts/` exist per the original spec's folder structure but are
empty in this build — icons come from the Font Awesome CDN, the Poppins font from Google
Fonts CDN, and no static images were needed beyond what's generated in CSS (gradients,
avatars via `ui-avatars.com` fallback). If you deploy in a fully offline environment, this
is where you'd put downloaded copies of those assets — see
`docs/DEVELOPER_GUIDE.md` → "Requirements" for the swap.

## Why HTML files aren't nested into subfolders

All 13 pages sit at the repo root rather than in e.g. `pages/`. This keeps every internal
link (`href="tasks.html"`) and every asset link (`src="css/variables.css"`) a simple,
uniform relative path with no `../` climbing — which is also what makes the whole app
safe to deploy at any subpath (see `DEPLOYMENT.md`'s note on GitHub Pages project sites).
