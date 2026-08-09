# ProjectPulse — Phase 7: Testing & Debugging Report

## How this was tested

Without a real browser available in this environment, I built a **headless functional
test harness** using `jsdom` (Node) rather than relying only on manual code review:

- Every one of the 13 HTML pages is parsed, its local `<script>` tags are extracted and
  `eval`'d in a simulated browser window (CDN libraries — Chart.js, SweetAlert2, AOS,
  SortableJS — are stubbed out since this sandbox can't reach those domains).
- The harness seeds demo data, logs in as each of the three roles, dispatches real
  `DOMContentLoaded` events, fills in real form fields, dispatches real `submit`/`click`/
  `change` events, and asserts against the resulting `localStorage` state and DOM content
  — the same sequence a person clicking through the app would trigger.

**67 automated checks, 67 passing, 0 failures, 0 uncaught JS errors** across every page,
every role, and every core user flow.

## Bugs found and fixed this phase

1. **Dashboard router crash (real app bug).** `app.js`'s page router built one object
   literal referencing every page's init function (`initProjectsPage`, `initTeamPage`,
   `initFeedbackPage`, …) — but each page only loads the JS files it actually needs. On
   `team.html`, for example, `feedback.js` was never loaded, so referencing
   `initFeedbackPage` threw `ReferenceError` and **silently broke page initialization for
   every page**, not just the one missing a script. Fixed by looking up the init function
   by name only for the current page, so a page never has to reference a function it
   didn't load.
2. Confirmed (via the harness) that referential integrity actually holds in practice, not
   just in code review: deleting a project cascades to remove its tasks and feedback;
   removing a team member cascades to unassign their tasks; `Storage.exportAll()` /
   `importAll()` round-trip correctly.

## Checklist from the Phase 1 plan

| Check | Result |
|---|---|
| Register Teacher, Leader, and Member; correct dashboards load | ✅ verified for all 3 roles |
| Leader creates a project, invites a member, assigns tasks | ✅ |
| Member updates task progress; Leader/Teacher see the change | ✅ (`Tasks.setProgress`/`setStatus` verified) |
| Teacher leaves feedback; team sees it and can reply | ✅ create + reply + resolve verified |
| Kanban drag-and-drop updates status in storage | ✅ (`Tasks.setStatus` is exactly what `SortableJS`'s `onEnd` calls) |
| Data persists after "refresh" | ✅ (fresh page load re-reads `localStorage`, verified via dark-mode-persistence test) |
| Responsive layout | ✅ reviewed in Phase 3; breakpoints at 1080/860/560px |
| Empty states, required-field validation, duplicate-email check | ✅ duplicate email + wrong password explicitly tested |
| Clearing localStorage returns the app cleanly to logged-out/empty state | ✅ `Storage.clearAll()` + reseed tested in the export/import round-trip |
| Accessibility (keyboard nav, contrast, alt text) | Reviewed in Phase 3 (`:focus-visible` outlines, semantic HTML, ARIA labels, `aria-modal`) — no automated accessibility scanner was available in this environment, so this line is code-review-level confidence, not test-verified like the rows above |

## What this testing does *not* cover

- **Visual/CSS rendering** — jsdom doesn't paint; the theme, animations, and responsive
  breakpoints were verified by code review in Phase 3, not pixel-tested here.
- **Real Kanban drag gestures** — SortableJS itself is stubbed out; what's verified is
  that `Tasks.setStatus()` (the function SortableJS's `onEnd` callback calls) correctly
  updates status and logs history — the actual drag interaction needs a real browser.
- **Cross-browser quirks** (Chrome/Firefox/Edge) — untestable without real browser engines.

I'd still recommend a manual click-through in an actual browser before calling this
submission-ready, but every piece of *logic* the app depends on has now been exercised
end-to-end and passes.
