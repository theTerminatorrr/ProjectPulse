# Feature Documentation

Status legend: ✅ implemented and tested · 🚫 deliberately out of scope (see
`FUTURE_IMPROVEMENTS.md`)

## Authentication & User Management
| Feature | Status |
|---|---|
| Register with role selection (Leader/Member) | ✅ |
| Login / Logout | ✅ |
| Remember me | ✅ |
| Forgot password (UI simulation) | ✅ |
| Demo login (one click per role) | ✅ |
| Session persistence + route guarding | ✅ |
| Role-based access control | ✅ |
| Profile editing (name, ID, email, dept, semester, bio) | ✅ |
| Avatar upload (client-side, FileReader) | ✅ |
| Change password | ✅ |
| Password strength meter | ✅ |
| Two-factor / OTP simulation | 🚫 |

## Project Management
| Feature | Status |
|---|---|
| Create / edit / archive / delete project | ✅ |
| Search, filter (status), sort (name/deadline/progress) | ✅ |
| Project status (Planning/Development/Testing/Completed) | ✅ |
| Progress auto-calculated from task completion | ✅ |
| Project detail tabs (Overview/Tasks/Members/Feedback/Activity/Notes) | ✅ |
| Milestone timeline | ✅ |
| Duplicate/clone project as template | 🚫 |
| Project tags/cover image | 🚫 |

## Task Management
| Feature | Status |
|---|---|
| Create / edit / delete task | ✅ |
| Assign to one or more members | ✅ |
| Priority (Low/Medium/High) | ✅ |
| Status workflow (To Do → In Progress → Review → Done) | ✅ |
| Progress percentage (slider) | ✅ |
| Kanban board with real drag-and-drop | ✅ |
| Table view with filters | ✅ |
| Subtasks/checklist | ✅ |
| Comments | ✅ |
| Simulated file attachments (filename only) | ✅ |
| Full change history log | ✅ |
| Task dependencies (Task B unlocks after Task A) | 🚫 |
| Recurring tasks / templates | 🚫 |

## Team Management
| Feature | Status |
|---|---|
| Add / remove members (per project) | ✅ |
| Cascading cleanup (removing a member unassigns their tasks) | ✅ |
| Member profile (task stats) | ✅ |
| Simulated online status | ✅ |
| Leaderboard (ranked by tasks completed) | ✅ |
| Achievement badges (Top Contributor, Most Active, Fast Finisher) | ✅ |
| Leader reassignment | 🚫 (UI present, no-op — flagged as demo-only) |

## Teacher Feedback
| Feature | Status |
|---|---|
| Create feedback (project- or task-level) | ✅ |
| Category (General/UI/Backend/Documentation/Presentation) | ✅ |
| Priority (Normal/Important/Critical) | ✅ |
| Star rating | ✅ |
| Reply thread | ✅ |
| Resolve / reopen | ✅ |
| Feedback timeline | ✅ |
| Rubric-based structured feedback | 🚫 |

## Announcements
| Feature | Status |
|---|---|
| Teacher-authored announcements | ✅ |
| Global or project-scoped audience | ✅ |
| Type (General/Meeting/Deadline/Presentation/Exam) | ✅ |
| Dashboard widget per role | ✅ |
| Notification on post | ✅ |

## Notes
| Feature | Status |
|---|---|
| Private notes (per project, per user) | ✅ |
| Shared notes (visible to whole team) | ✅ |
| Meeting notes | ✅ (use shared notes for this) |

## Calendar
| Feature | Status |
|---|---|
| Monthly grid | ✅ |
| Auto-populated from project deadlines + task due dates | ✅ |
| Manually added events (meeting/deadline/presentation/submission) | ✅ |
| Upcoming events list | ✅ |

## Statistics & Reports
| Feature | Status |
|---|---|
| Doughnut / bar / line charts (Chart.js) | ✅ |
| Role-specific dashboard charts | ✅ |
| Project Summary report | ✅ |
| Member Performance report | ✅ |
| Task report | ✅ |
| Teacher Feedback report | ✅ |
| Activity Log report (cross-project audit trail) | ✅ |
| Printable layout | ✅ |
| Export to JSON | ✅ |
| Import from JSON | ✅ |
| Export to CSV/PDF | 🚫 (JSON export covers the spec's "Export" requirement; print-to-PDF via the browser's native print dialog covers PDF) |

## Notifications
| Feature | Status |
|---|---|
| Bell icon with unread badge | ✅ |
| Task assigned / feedback received / deadline approaching / member joined / announcement | ✅ |
| Mark as read (on open) / Clear all | ✅ |
| Automatic deadline-approaching sweep (2-day lookahead) | ✅ |
| Real-time push (would require a backend) | 🚫 |

## Search & Filters
| Feature | Status |
|---|---|
| Global search bar (topbar, present on every page) | ✅ (UI present; wired per-page search on Projects/Tasks/Team/Feedback) |
| Per-list filters (status, priority, date, project, assignee, category) | ✅ |

## Activity Log
| Feature | Status |
|---|---|
| Per-task history | ✅ |
| Per-project activity tab | ✅ |
| Cross-project Activity Log report | ✅ |

## Settings
| Feature | Status |
|---|---|
| Dark mode / Light mode | ✅ |
| Notification preference toggles | ✅ |
| Language selector | ✅ (UI + persisted preference; interface strings remain English — see Future Improvements) |

## Responsive Design
| Feature | Status |
|---|---|
| Desktop / laptop / tablet / mobile breakpoints | ✅ |
| Collapsible sidebar (off-canvas on mobile) | ✅ |
| Kanban board horizontal scroll on narrow screens | ✅ |

## Non-functional
| Feature | Status |
|---|---|
| Input validation + empty states everywhere | ✅ |
| Accessible markup (semantic HTML, ARIA, focus states) | ✅ |
| Data persists across reloads | ✅ (tested — see `TESTING_REPORT.md`) |
| Referential integrity self-healing | ✅ (orphan cleanup sweep on every load) |
| Admin panel | 🚫 |
| Real-time chat/messaging | 🚫 |
