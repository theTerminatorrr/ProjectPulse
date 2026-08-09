# Testing Checklist

A manual pre-submission checklist. Every item below has already been verified via the
automated headless test suite described in `../TESTING_REPORT.md` (67/67 passing) — this
list is for a **human click-through in a real browser**, since the automated suite
can't check visual rendering, real drag gestures, or cross-browser behavior.

## Setup
- [ ] Open `index.html` (or a locally served copy — see `INSTALLATION.md`)
- [ ] Confirm the landing page renders with the navy gradient theme, Poppins font, and
      no visibly broken layout

## Authentication
- [ ] Register a new Team Leader account — confirm redirect to dashboard
- [ ] Log out, register a new Team Member account
- [ ] Log out, use the **Demo Teacher** login button
- [ ] Try registering with an email that already exists — confirm it's blocked with a
      clear error message
- [ ] Try logging in with a wrong password — confirm it's rejected
- [ ] Check **Remember me**, close and reopen the tab — confirm still logged in
- [ ] Log out — confirm redirect to login and that visiting `dashboard.html` directly
      afterward redirects back to login

## Role-specific dashboards
- [ ] Log in as Teacher — confirm the Teacher-specific cards/charts appear
- [ ] Log in as Team Leader — confirm the Leader-specific cards/charts appear
- [ ] Log in as Team Member — confirm the Member-specific cards/charts appear
- [ ] Confirm the sidebar only shows **Team** for the Leader

## Project CRUD (as Team Leader)
- [ ] Create a new project via Dashboard's "New Project" button
- [ ] Create a project via the Projects page modal, including selecting members
- [ ] Edit a project (pencil icon on its card)
- [ ] Open a project's details page — click through all 6 tabs
- [ ] Archive a project — confirm its status updates
- [ ] Delete a project — confirm its tasks and feedback are also gone (check as Member/Teacher)

## Task management
- [ ] Create a task from the Tasks page, assign it to a member
- [ ] Drag a task card from To Do → In Progress → Review → Done — confirm status updates
      and the column counts update
- [ ] Switch to table view — confirm the same tasks appear
- [ ] Open a task's detail panel — move the progress slider, change status via dropdown
- [ ] Add a subtask, check it off
- [ ] Add a comment
- [ ] Attach a "file" (any file — confirm only the filename is stored/shown)
- [ ] Scroll down to History — confirm every action you just took is logged with a timestamp

## Feedback (as Teacher)
- [ ] Create project-level feedback with a category, priority, and star rating
- [ ] Create task-level feedback
- [ ] Log in as the Leader/Member on that project — confirm the feedback is visible and
      a notification appeared
- [ ] Reply to feedback as the Leader
- [ ] Log back in as Teacher, resolve the feedback — confirm the "Resolved" badge appears

## Team (as Leader)
- [ ] Add a member to a project who wasn't already on it
- [ ] Open their profile modal — confirm task stats show
- [ ] Remove them — confirm they disappear from the roster AND from any task they were
      assigned to on that project
- [ ] Check the Leaderboard table updates and badges make sense

## Calendar
- [ ] Confirm project deadlines and task due dates already appear on the calendar
      without adding anything manually
- [ ] Add a custom event, confirm it appears on the correct day and in "Upcoming"
- [ ] Navigate to the next/previous month and back to Today

## Reports
- [ ] Generate each of the 5 report types, confirm charts and tables populate
- [ ] Filter to a single project, confirm the numbers change accordingly
- [ ] Click Print — confirm the sidebar/topbar disappear in the print preview
- [ ] Click Export JSON — confirm a file downloads and contains your data

## Notifications
- [ ] Trigger a few notifications (assign a task, leave feedback) and confirm the bell
      badge count updates
- [ ] Open the bell dropdown — confirm items are marked read
- [ ] Click Clear all — confirm the list empties

## Profile & Settings
- [ ] Upload an avatar image, confirm it appears in the topbar and profile card
- [ ] Edit your name/bio, save, confirm the topbar name updates immediately
- [ ] Change your password, log out, log back in with the new password
- [ ] Toggle Dark Mode — confirm it applies immediately and survives a page reload
- [ ] Export your data, then use Reset demo data, then Import the file you just
      exported — confirm your data is back

## Cross-cutting
- [ ] Refresh the browser on any page mid-session — confirm you're still logged in and
      all data is exactly as it was
- [ ] Resize the browser window down to a phone width — confirm the sidebar collapses
      into a toggleable drawer and the Kanban board scrolls horizontally instead of
      squeezing
- [ ] Open DevTools console on a few pages — confirm no red errors
- [ ] Test in at least two different browsers (e.g. Chrome and Firefox)

## Final check
- [ ] Clear all site data (or use "Reset demo data") — confirm the app returns cleanly
      to a fresh, working state rather than a broken one
