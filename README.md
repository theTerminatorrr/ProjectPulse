# ProjectPulse

**Student Project Management & Teacher Feedback System**

A complete web platform for academic project teams — Team Leaders create projects and
assign tasks, Team Members execute and report progress, and Teachers monitor everything
and leave structured feedback. Built entirely with **HTML5, CSS3, and vanilla JavaScript
(ES6+)** — no frameworks, no backend, no database. All data lives in the browser via
`localStorage`.

![Theme](https://img.shields.io/badge/theme-navy%20blue%20gradient-1D5EA8)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-4DA8FF)
![Backend](https://img.shields.io/badge/backend-none%20%28localStorage%29-0B1C56)

---

## Quick start

No install, no build step — open it and go.

1. Download/clone this repository.
2. Open `index.html` in a browser (or serve it locally — see
   [`docs/INSTALLATION.md`](docs/INSTALLATION.md)).
3. Click **Log in**, then use one of the **Demo Login** buttons to try each role instantly:

| Role | Email | Password |
|---|---|---|
| Teacher | `teacher@demo.com` | `demo123` |
| Team Leader | `leader@demo.com` | `demo123` |
| Team Member | `member@demo.com` | `demo123` |

Demo data (2 projects, 5 tasks, feedback, notifications) is seeded automatically on
first run.

---

## What's inside

- **Three roles, three dashboards** — Teacher (oversight + feedback), Team Leader
  (project/task management), Team Member (assigned work + progress).
- **Kanban board** with real drag-and-drop (SortableJS), task detail panel with
  subtasks, comments, simulated attachments, and a full history log.
- **Teacher feedback system** — category, priority, star rating, reply threads, resolve/reopen.
- **Charts & reports** (Chart.js) — dashboards per role, plus 5 printable/exportable
  report types including a cross-project Activity Log.
- **Calendar**, **notifications center**, **announcements**, **notes** (private/shared),
  **team leaderboard with achievement badges**, **dark mode**, **JSON export/import**.

See [`docs/FEATURES.md`](docs/FEATURES.md) for the complete list.

## Documentation

| Doc | What it covers |
|---|---|
| [`docs/INSTALLATION.md`](docs/INSTALLATION.md) | Running it locally, no-install setup |
| [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) | How to use every page, per role |
| [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) | Architecture, module map, how to extend it |
| [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md) | Objectives, scope, design decisions |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Full feature list, Core/Advanced/Optional |
| [`docs/FOLDER_STRUCTURE.md`](docs/FOLDER_STRUCTURE.md) | What every file/folder is for |
| [`docs/LOCAL_STORAGE_SCHEMA.md`](docs/LOCAL_STORAGE_SCHEMA.md) | The full data model |
| [`docs/TESTING_CHECKLIST.md`](docs/TESTING_CHECKLIST.md) | Manual pre-submission checklist |
| [`docs/FUTURE_IMPROVEMENTS.md`](docs/FUTURE_IMPROVEMENTS.md) | What's deliberately out of scope, and why |
| [`TESTING_REPORT.md`](TESTING_REPORT.md) | Automated headless test results (67/67 passing) |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | GitHub Pages / Netlify / Vercel deployment steps |

## Tech stack

| Layer | Technology |
|---|---|
| Structure | HTML5, semantic markup |
| Styling | CSS3 (custom properties, Flexbox, Grid) — Navy Blue Gradient design system |
| Logic | Vanilla JavaScript ES6+ |
| Persistence | `localStorage`, via a single wrapper module (`js/data/storage.js`) |
| Charts | Chart.js (CDN) |
| Icons | Font Awesome (CDN) |
| Animation | AOS, CSS transitions |
| Kanban drag-drop | SortableJS (CDN) |
| Dialogs/toasts | SweetAlert2 (CDN) |

## License

This is a course project template — use and adapt freely for your own coursework.
