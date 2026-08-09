# User Manual

A walkthrough of every page, organized by what each role can do there. If a page isn't
listed under a role, that role either can't see it or sees a read-only version.

---

## Getting started

**Registering.** Go to `register.html`, pick **Team Leader** or **Team Member**, fill in
your name, student ID, email, department, and semester, set a password, and submit.
Teacher accounts are pre-seeded demo accounts in this version (see
`docs/FUTURE_IMPROVEMENTS.md` for why), so Teachers should use the demo login rather than
registering.

**Logging in.** Enter your email/password, or use a **Demo Login** button. Check
**Remember me** to stay signed in after closing the tab (uses `localStorage`; unchecked
sessions use `sessionStorage` and end when the tab closes).

**The app shell.** Every page after login shares the same layout: a navy sidebar on the
left (Dashboard, Projects, Tasks, Team*, Feedback, Calendar, Reports, Settings), a top
bar with global search, the notification bell, and your profile menu. *Team is only
visible to Team Leaders.

---

## Dashboard (`dashboard.html`)

**All roles** land here after login. The content is entirely different per role:

- **Teacher:** total/active project counts, pending feedback reviews, student count,
  a progress-by-project chart, a feedback-category chart, the feedback queue, recent
  activity across all projects, and an announcements widget with a **Post** button.
- **Team Leader:** your project/task counts, a project-completion chart, upcoming
  deadlines, recent activity, and announcements (view-only) — plus a **New Project**
  button in the page header.
- **Team Member:** your assigned/completed/pending/overdue task counts, a status
  breakdown chart, recent feedback you've received, your own upcoming deadlines, and announcements.

---

## Projects (`projects.html`) — all roles view, Leaders manage

- Search, filter by status, and sort by name/deadline/progress.
- **Team Leaders:** **New Project** button opens a modal (name, description, course,
  status, deadline, team members). Each project card has an edit (pencil) icon.
- Click any project card to open **Project Details**.

## Project Details (`project-details.html`)

Six tabs:
- **Overview** — milestone timeline, task status chart.
- **Tasks** — a read-only table of every task in the project.
- **Members** — avatars and roles of everyone on the team.
- **Feedback** — the full feedback timeline for this project.
- **Activity** — a chronological log of every task change.
- **Notes** — toggle between **Shared** (whole team sees it) and **Private** (only you)
  notes; add a note with the form at the top.

Leaders also get **Edit / Archive / Delete** buttons in the header.

---

## Tasks (`tasks.html`)

- **Board view** (default): drag task cards between **To Do / In Progress / Review /
  Done** columns — dropping a card updates its status immediately.
- **Table view**: toggle via the view switcher; sortable/filterable list instead of cards.
- Filter by project, priority, or assignee; search by title.
- **Team Leaders:** **New Task** button (project, title, description, assignees,
  priority, due date, estimated hours).
- Click any task card/row to open the **task detail panel**: adjust the progress slider,
  change status, add/check off subtasks, add a comment, attach a file (stores the
  filename only — this is a simulated upload, per the no-backend spec), and see the full
  change history.

---

## Team (`team.html`) — Team Leaders only

- Roster of everyone across your projects, with a search box and project filter.
- **Add Member** button to add an existing registered user to a project.
- Click a member card to see their profile (task stats), and to remove them from the
  project (this also unassigns them from that project's tasks automatically).
- **Leaderboard** table below the roster: ranks members by tasks completed, with
  **Top Contributor**, **Most Active**, and **Fast Finisher** badges.

---

## Feedback (`feedback.html`)

- **Teachers:** **New Feedback** button — pick a project (and optionally a specific
  task), write the message, set category/priority/star rating, submit.
- **Everyone:** filter by project/category/priority/resolved-status; reply to any
  feedback item inline.
- **Teachers:** **Resolve/Reopen** button on each item.

---

## Calendar (`calendar.html`)

- Monthly grid combining project deadlines, task due dates, and manually added events.
- **Add Event** button (title, date, type — meeting/deadline/presentation/submission,
  optional linked project).
- **Upcoming** list below the grid shows the next 8 events regardless of month view.

---

## Reports (`reports.html`)

- Choose a report type: **Project Summary**, **Member Performance**, **Task Report**,
  **Teacher Feedback**, or **Activity Log** — each renders stat cards, two charts, and a
  data table.
- Filter to a single project or leave it on "All projects."
- **Print** button uses your browser's print dialog with a print-optimized layout
  (sidebar/topbar hidden automatically).
- **Export JSON** downloads your entire dataset as a `.json` file.

---

## Profile (`profile.html`)

- Upload an avatar (click your photo — stored as a data URL, no server upload).
- Edit name, student ID, email, department, semester, bio.
- Change your password (requires your current password).

## Settings (`settings.html`)

- **Dark mode** toggle (persists across sessions).
- **Language** selector (interface stays in English in this version — see
  `docs/FUTURE_IMPROVEMENTS.md`).
- Notification preferences (task assigned / deadline approaching / feedback received).
- **Export** / **Import** your full dataset as JSON.
- **Reset demo data** — wipes everything and reseeds the original demo dataset.

---

## Notifications

Click the bell icon (top right, any page) to see your notification history — task
assignments, feedback received, deadlines approaching, team changes, announcements.
Opening the dropdown marks everything read; **Clear all** empties the list.
