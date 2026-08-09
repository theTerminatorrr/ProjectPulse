# Project Report

## 1. Overview

**ProjectPulse** is a web-based project and task management system built for academic
teams, developed as a semester Web Programming project per the supplied SRS and Master
Prompt specifications. It supports three roles — Teacher, Team Leader, Team Member —
across a complete project lifecycle: creation, task breakdown, assignment, progress
tracking, and structured teacher feedback.

## 2. Objectives (from the original spec) and how they were met

| Objective | Met by |
|---|---|
| Centralized workspace for student project teams | Role-based dashboards, shared project/task/feedback data model |
| Clear task ownership, deadlines, progress visibility | Kanban board, task detail panel, progress bars/rings, calendar |
| Teacher oversight and timely feedback loops | Feedback module with category/priority/rating/reply/resolve |
| Demonstrate strong front-end skills, pure HTML/CSS/JS | No frameworks, no backend, no build step — see `docs/DEVELOPER_GUIDE.md` |
| Polished, consistent Navy Blue Gradient UI | Full design system in `css/variables.css`, applied via `css/components.css` |
| Client-side persistence without a backend | `localStorage` wrapper (`js/data/storage.js`) with schema versioning and integrity checks |

## 3. Technology stack

HTML5, CSS3 (custom properties, Flexbox, Grid), vanilla JavaScript ES6+, `localStorage`.
CDN libraries: Chart.js (charts), Font Awesome (icons), AOS (scroll animation),
SortableJS (Kanban drag-drop), SweetAlert2 (dialogs/toasts). No React/Vue/Angular,
no Bootstrap/Tailwind, no jQuery, no server-side language — per the spec's constraints.

## 4. Development process

Built in 9 phases, each reviewed and confirmed before the next began:

1. **Requirements & architecture** — reconciled two source documents (a Master Prompt
   and an SRS) that specified slightly different color palettes and folder layouts into
   one canonical spec.
2. **HTML** — all 13 pages, semantic markup, consistent shell across authenticated pages.
3. **CSS** — 5 stylesheets (~1,100 lines): design tokens, base/reset, layout, components,
   page overrides. Fully responsive (breakpoints at 1080/860/560px).
4. **JavaScript** — 14 modules (~2,500 lines): full CRUD for every entity, Kanban
   drag-drop, charts, calendar, notifications, dark mode, reports.
5. **Local Storage data layer hardening** — schema versioning scaffold, quota-exceeded
   handling, corruption recovery, and an automatic referential-integrity sweep.
6. **Advanced/Optional features** — announcements, private/shared notes, a leaderboard
   with achievement badges, and a cross-project activity log report.
7. **Testing & debugging** — a headless functional test harness (67 automated checks,
   see `TESTING_REPORT.md`) that found and fixed one real bug in the page router.
8. **Deployment preparation** — verified relative-path safety, wrote deployment guides
   for GitHub Pages / Netlify / Vercel, added host config files.
9. **Documentation** — this set of documents.

## 5. Design decisions worth noting

- **Multi-page over single-page-app.** The spec's folder structure names 13 separate
  HTML files rather than one `dashboard.html` shell with client-side routing — this was
  followed as the canonical structure (see Phase 1's reconciliation note), which keeps
  each page's JS payload smaller (a page only loads the modules it needs) at the cost of
  some duplicated shell markup across files.
- **One localStorage wrapper, zero direct localStorage calls elsewhere.** Every feature
  module goes through `Storage.getAll/save/update/remove`. This single decision is what
  made the Phase 5 integrity sweep, the JSON export/import round-trip, and (per
  `docs/DEVELOPER_GUIDE.md`) a future real-backend swap all straightforward.
- **Teachers as pre-seeded accounts rather than self-registered.** The registration
  form only offers Team Leader / Team Member — matching a real classroom's trust model
  where the instructor account is set up in advance, not self-signed-up. Documented as a
  deliberate choice in Phase 1's "Open Questions."
- **Simulated file attachments store filenames only**, per the spec's "(simulation)"
  language for file upload — no actual file bytes are persisted, avoiding blowing the
  `localStorage` quota on binary data.

## 6. Evaluation against the SRS's own evaluation criteria

| Criterion | Status |
|---|---|
| Visual polish, consistent Navy Blue Gradient theme | ✅ Complete design system |
| Working end-to-end flows (create → assign → update → feedback) | ✅ Verified via automated testing, not just code review |
| Clean, readable, well-commented code | ✅ Every file has section-header comments; module responsibilities documented in `docs/DEVELOPER_GUIDE.md` |
| Clear README with demo accounts, how-to-run | ✅ `README.md` |
| Responsive design and basic accessibility | ✅ Responsive breakpoints; semantic HTML, focus states, ARIA labels on modals |
| Seed data + demo login buttons | ✅ Auto-seeded on first run, one-click demo login for all 3 roles |
| Documented extra libraries with justification | ✅ Listed in README and Developer Guide |

## 7. Known limitations

See `docs/FUTURE_IMPROVEMENTS.md` for the full list; the two largest deliberate scope
cuts were a real-time chat/messaging system and an admin panel, both left out as
Optional-tier features that weren't prioritized (see Phase 6 discussion) but are natural
next additions.
