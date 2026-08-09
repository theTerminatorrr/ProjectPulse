# Local Storage Schema

All data lives in the browser's `localStorage`, one JSON array per entity, each under a
key prefixed `pt_` (e.g. `pt_projects`). Every module reads/writes through
`js/data/storage.js`'s `Storage` wrapper rather than touching `localStorage` directly —
see `docs/DEVELOPER_GUIDE.md` for why that matters.

A separate key, `pt_session`, holds the signed-in user's session (see **Session**, below)
and is the one piece of state that also uses `sessionStorage` when "Remember me" isn't checked.

`pt_seeded` is a plain flag (not JSON) marking that demo data has been seeded once.
`pt_schema_version` tracks the data model version for future migrations (see
`Storage._migrate()` in `storage.js`).

---

## `pt_users`
```js
{
  id: "u_leader1",
  fullName: "Ayesha Rahman",
  studentId: "0112410544",
  email: "leader@demo.com",
  department: "Computer Science",
  semester: "Summer 2026",
  password: "ZGVtbzEyMw==",     // base64 — demo-grade obfuscation, NOT real hashing
  role: "leader",                // "teacher" | "leader" | "member"
  avatar: "",                    // data: URL if uploaded, else falls back to ui-avatars.com initials
  bio: "",
  createdAt: "2026-08-01T12:00:00.000Z"
}
```

## `pt_projects`
```js
{
  id: "p_ecommerce",
  title: "E-Commerce Website",
  description: "...",
  courseName: "Web Programming",
  teacherId: "u_teacher1",
  leaderId: "u_leader1",
  memberIds: ["u_leader1", "u_member1", "u_member2"],
  deadline: "2026-08-26",
  status: "development",         // "planning" | "development" | "testing" | "completed"
  archived: false,                // set true by the Archive action
  createdAt: "...", updatedAt: "..."
}
```
Progress is **not stored** — it's always computed live as the average of that project's
task progress percentages (`Projects.progressOf()`).

## `pt_tasks`
```js
{
  id: "t_1",
  projectId: "p_ecommerce",
  title: "Design login page",
  description: "...",
  assigneeIds: ["u_member2"],
  priority: "high",               // "low" | "medium" | "high"
  status: "in_progress",          // "todo" | "in_progress" | "review" | "done"
  progress: 60,                    // 0-100
  dueDate: "2026-08-08",
  estimatedHours: 4,
  subtasks: [{ text: "Wireframe", done: true }],
  history: [{ userId: "u_member2", change: "Progress updated to 60%", date: "..." }],
  comments: [{ userId: "u_member2", text: "...", date: "..." }],
  attachments: [{ filename: "notes.pdf", date: "..." }],   // filename only — no file bytes stored
  createdAt: "...", updatedAt: "..."
}
```

## `pt_feedback`
```js
{
  id: "f_1",
  projectId: "p_ecommerce",
  taskId: "t_1",                  // null for project-level feedback
  teacherId: "u_teacher1",
  message: "...",
  category: "ui",                 // "general" | "ui" | "backend" | "documentation" | "presentation"
  priority: "normal",             // "normal" | "important" | "critical"
  rating: 4,                       // 0-5, 0 = no rating given
  resolved: false,
  replies: [{ userId: "u_leader1", text: "...", date: "..." }],
  createdAt: "..."
}
```

## `pt_notifications`
```js
{
  id: "n_1",
  userId: "u_member2",
  type: "feedback",                // "task_assigned" | "feedback" | "deadline" | "project_approved" | "announcement" | "member_joined"
  message: "You received feedback on Task: Design login page",
  relatedId: "f_1",                 // id of the related task/feedback/announcement
  read: false,
  createdAt: "..."
}
```

## `pt_announcements`
```js
{
  id: "a_1",
  authorId: "u_teacher1",
  title: "Sprint review this Friday",
  message: "...",
  type: "meeting",                  // "general" | "meeting" | "deadline" | "presentation" | "exam"
  projectId: null,                  // null = visible to all students
  createdAt: "..."
}
```

## `pt_notes`
```js
{
  id: "note_1",
  projectId: "p_ecommerce",
  userId: "u_leader1",
  text: "...",
  visibility: "shared",             // "shared" | "private"
  createdAt: "..."
}
```

## `pt_events` (calendar)
```js
{
  id: "e_1",
  title: "Sprint review meeting",
  date: "2026-08-10",
  type: "meeting",                  // "meeting" | "deadline" | "presentation" | "submission"
  projectId: "p_ecommerce"          // null = not tied to a specific project
}
```

## `pt_session` (sessionStorage, and localStorage if "Remember me" was checked)
```js
{ userId: "u_leader1", rememberMe: true }
```

## `pt_settings`
```js
{
  darkMode: false,
  language: "en",
  notifTaskAssigned: true,
  notifDeadline: true,
  notifFeedback: true
}
```

---

## Referential integrity

`Storage.runIntegrityCheck()` runs on every page load (via `auth.js`'s boot sequence) and
removes:
- tasks whose `projectId` no longer exists,
- feedback whose `projectId`/`taskId` no longer exists,
- notifications whose `userId` no longer exists,
- calendar events whose `projectId` no longer exists (if set).

This means the app self-heals from partial deletes or a stale import — you should never
see a task belonging to a deleted project, for example.

## Export / Import format

`Storage.exportAll()` (used by Settings → Export and Reports → Export JSON) produces:
```js
{
  schemaVersion: 1,
  exportedAt: "2026-08-05T12:00:00.000Z",
  users: [...], projects: [...], tasks: [...], feedback: [...],
  announcements: [...], notifications: [...], notes: [...], events: [...]
}
```
`Storage.importAll(dump)` overwrites each key present in the dump and re-runs the
integrity sweep afterward.
