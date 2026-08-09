# Developer Guide

## Architecture in one paragraph

Every page is a standalone HTML file that loads a shared set of CSS files and only the
JS files it actually needs (see `docs/FOLDER_STRUCTURE.md` for exactly which). Each JS
"module" is a single `const` object (`Storage`, `Auth`, `Projects`, `Tasks`, `Feedback`,
etc.) with methods on it, plus a small number of `initXPage()` functions that wire up
that page's DOM once it's loaded. There's no bundler, no framework, no virtual DOM —
just direct `document.getElementById` / `querySelector` calls and `innerHTML` re-renders
triggered after every state change.

## Module map

| File | Exposes | Responsibility |
|---|---|---|
| `js/data/storage.js` | `Storage`, `Session` | Generic localStorage CRUD wrapper, schema versioning, quota handling, referential-integrity sweep |
| `js/data/seed.js` | `Seed` | First-run demo data |
| `js/utils.js` | `Utils`, `downloadJson()` | id gen, date formatting, toasts, escaping, misc helpers |
| `js/validation.js` | `Validate` | Form validators, password strength meter |
| `js/auth.js` | `Auth` | Login/register/logout, session guard, role-based UI visibility |
| `js/notifications.js` | `Notifications` | Notification center, deadline sweep |
| `js/projects.js` | `Projects`, `Notes` | Project CRUD, project-details page, notes |
| `js/tasks.js` | `Tasks` | Task CRUD, Kanban rendering, task detail panel |
| `js/team.js` | (page functions) | Roster page, leaderboard, badges |
| `js/feedback.js` | `Feedback` | Feedback CRUD, timeline rendering (shared by feedback.html and project-details.html) |
| `js/announcements.js` | `Announcements` | Announcements CRUD + dashboard widget |
| `js/calendar.js` | `CalendarModule` | Month-grid rendering, event CRUD |
| `js/charts.js` | `Charts` | Chart.js wrappers + dashboard chart builders |
| `js/reports.js` | (page functions) | Report generation, print, JSON export |
| `js/app.js` | `AppSettings` | Page router, shared chrome (sidebar/dropdowns/dark mode), dashboard/profile/settings logic |

**The rule every module follows:** feature modules never touch `localStorage` directly —
everything goes through `Storage.getAll/save/update/remove`. This is what makes the
Phase 5 integrity sweep and the export/import round-trip possible without every module
needing to know about it.

## How a page boots

1. `<script>` tags load in dependency order (data layer → utils → auth → feature
   modules → `app.js` last).
2. `auth.js`'s `DOMContentLoaded` listener runs first: seeds demo data if needed, runs
   the integrity sweep, and — on any authenticated page — calls `Auth.requireAuth()`,
   which redirects to `login.html` if there's no session, or populates the topbar/sidebar
   chrome if there is.
3. `app.js`'s `DOMContentLoaded` listener runs next: applies dark mode, wires the
   sidebar toggle and dropdowns, then looks up `document.body.dataset.page` and calls
   that page's `initXPage()` function (deferred one tick via `setTimeout(fn, 0)` so step
   2 has definitely finished first).

**Important:** each page's `initXPage()` function is only ever referenced by name for
*that* page — `app.js`'s router looks it up dynamically (`window[functionName]`) rather
than holding a static reference to every page's function, specifically because not every
page loads every module. See `TESTING_REPORT.md` for the bug this avoids.

## How to extend common things

**Add a field to Task:** update the `create()`/`update()` calls in `tasks.js`, add the
input to the modal in `tasks.html`, and add it to `seed.js`'s example tasks if you want
demo data to show it. No schema migration needed for a purely additive field — undefined
fields are just falsy until set. For a field that needs a default backfilled onto
*existing* records, bump `DB_VERSION` in `storage.js` and add a case to
`Storage._migrate()`.

**Add a new page:** copy the sidebar/topbar markup block from an existing authenticated
page (they're identical across all of them by design — see `dashboard.html`), add your
`<main class="page-content">` content, list it in the sidebar `<nav>` on every other
page, add its script tags (only the modules it actually needs), and register its
`data-page` value + init function name in `app.js`'s `initFnByPage` map.

**Add a new entity (like Notes/Announcements were added in Phase 6):** add a
`Storage.getAll('yourEntity')` — no schema declaration needed, arrays are created
lazily. Add the key to `Storage.exportAll()`'s key list so it's included in
export/import. If it references a project or user, add a cleanup rule to
`Storage.runIntegrityCheck()`.

**Swap in a real backend later:** the `Storage` object is the entire seam. Every other
module calls `Storage.getAll/save/update/remove` and nothing else — replace those four
methods with `fetch()` calls to a real API and the rest of the app doesn't change.

## Conventions

- Every feature module is a single `const OBJECT = { ...methods }` — no classes, no
  `this` outside of that object's own methods.
- Every rendered list is a full `innerHTML =` replace, not incremental DOM patching —
  simple and fast enough at this data scale, but don't reach for this pattern if you're
  rendering thousands of rows.
- `Utils.escapeHtml()` wraps every piece of user-entered text before it goes into
  `innerHTML` — don't skip this when adding new rendering code, or you've opened an XSS
  hole (low-stakes in a localStorage-only demo app, but it's a habit worth keeping).
- Modals are opened/closed via a `hidden` attribute toggle, closed via
  `wireModalClose(modalId)` (in `projects.js`) which every page that uses modals loads.
