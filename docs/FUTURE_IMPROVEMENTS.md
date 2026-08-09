# Future Improvements

Things deliberately left out of this build, and why — plus genuine next steps if this
became a real product.

## Deliberately out of scope this round

**Real-time chat / messaging.** The SRS lists a "simple chat UI (Leader ↔ Member,
Teacher ↔ Leader)" as an Optional feature. It needs its own conversation data model
(threads, participants, read receipts) and a reasonable amount of new UI, and wasn't
flagged as a priority when the Optional tier was scoped in Phase 6. The Feedback
reply-thread pattern already in the app is the closest existing building block — a chat
feature could reuse its `replies: [{userId, text, date}]` shape.

**Admin panel.** Also Optional-tier in the spec (manage all users, all projects,
system-wide announcements, usage stats). Needs user-management screens (suspend/delete
accounts) that don't exist anywhere else in the app yet. Straightforward to add given the
existing `Storage` wrapper — mostly a matter of new UI, not new architecture.

**Two-factor / OTP simulation.** Low value for a client-side-only demo app with no real
security boundary to protect.

**Task dependencies** (Task B unlocks after Task A). Would need a `dependsOn: [taskId]`
field on tasks, plus UI to visualize the dependency chain and block status changes until
prerequisites are done. Skipped as Optional-tier per the spec.

**Recurring tasks / task templates.** Skipped as Optional-tier.

**CSV/PDF export.** JSON export/import covers the spec's "Export" requirement, and the
browser's native print-to-PDF (via the Print button on Reports) covers PDF. A dedicated
CSV export would be a small addition — `Utils` already has all the data formatting
helpers a CSV writer would need.

**True multi-language support.** Settings has a language selector and the preference
persists, but interface strings are hard-coded English throughout. Real i18n would mean
extracting every UI string into a JSON dictionary per language and swapping them at
render time — a mechanical but sizable refactor across every page's JS.

## If this became a real product

**A real backend.** The entire `Storage` object is the seam for this — see
`docs/DEVELOPER_GUIDE.md`. Swap its four methods for `fetch()` calls to a real API and
every feature module keeps working unmodified. Natural stack: Node/Express or a
Firebase/Supabase backend, JWT or session-cookie auth, Postgres/MongoDB for storage.

**Real-time updates.** Right now, if a Teacher leaves feedback, a Member has to reload
or open the notification bell to find out. A real backend with WebSockets (or
Firebase's realtime listeners) would let a badge count update live without any action.
The spec's "Optional: simulated real-time updates via BroadcastChannel" is a cheap
partial version of this achievable even without a backend — it'd sync state across
multiple tabs of the *same* browser, though not across different users/devices.

**Real password security.** Passwords are currently base64-encoded, not hashed — clearly
labeled as "demo-grade" in code comments and `docs/LOCAL_STORAGE_SCHEMA.md`. A real
deployment needs server-side bcrypt/argon2 hashing, which requires the backend above.

**File uploads that actually store files.** Attachments currently store a filename only.
A real backend would add actual file storage (S3-compatible object storage is the
standard choice) and the task detail panel's file-drop UI is already positioned to wire
up to that with minimal change.

**Mobile app.** The responsive web layout covers phone-sized browsers already; a true
native wrapper (React Native/Flutter, or just a PWA manifest + service worker for
"Add to Home Screen" + offline caching) would be the next step up.

**Accessibility audit.** Current accessibility work (semantic HTML, focus states, ARIA
labels on modals) was done via code review, not a real screen-reader pass or automated
tool like axe-core/Lighthouse — worth running before treating this as production-ready
for accessibility compliance.
