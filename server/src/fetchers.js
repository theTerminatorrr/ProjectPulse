/* ---------------------------------------------------------------------------
   fetchers.js — every READ query lives here.

   Each fetcher returns rows already shaped like the objects the browser code
   used to keep in localStorage (camelCase, embedded arrays), so the front end
   needed no changes to how it reads data.

   VISIBILITY RULES (who can read what) are encoded once, in visibleProjectsSql():
     admin   -> every project            (monitors everything)
     teacher -> projects they supervise
     leader  -> projects they lead
     member  -> projects they belong to
   Tasks, feedback, notes, events and announcements are then scoped by project.

   Convention: $1 is always the viewing user's id. Extra params start after
   the ones each function documents.
   ------------------------------------------------------------------------- */

function visibleProjectsSql(role) {
  switch (role) {
    case 'admin':   return 'SELECT id FROM projects WHERE $1::uuid IS NOT NULL';
    case 'teacher': return 'SELECT id FROM projects WHERE teacher_id = $1';
    case 'leader':  return 'SELECT id FROM projects WHERE leader_id = $1';
    default:        return 'SELECT project_id AS id FROM project_members WHERE user_id = $1';
  }
}

/* ---------- users ($1 = viewer id, $2 = viewer role, extra params from $3) ---------- */
async function fetchUsers(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT u.id,
            u.full_name AS "fullName",
            CASE WHEN $2::text = 'member' AND u.id <> $1 THEN '' ELSE COALESCE(u.student_id, '') END AS "studentId",
            CASE WHEN $2::text = 'member' AND u.id <> $1 THEN '' ELSE u.email END AS email,
            u.department, u.semester, u.role, u.bio,
            u.is_suspended AS suspended,
            u.created_at AS "createdAt",
            CASE WHEN a.user_id IS NULL THEN ''
                 ELSE '/api/users/' || u.id || '/avatar?v=' || floor(extract(epoch FROM a.updated_at))::bigint END AS avatar
     FROM users u LEFT JOIN user_avatars a ON a.user_id = u.id
     WHERE ${where}
     ORDER BY u.full_name`,
    [viewer.id, viewer.role, ...params]);
  return rows;
}

/* ---------- projects ($1 = viewer id, extra params from $2) ---------- */
async function fetchProjects(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT p.id, p.title, p.description, p.course_name AS "courseName",
            p.teacher_id AS "teacherId", p.leader_id AS "leaderId",
            COALESCE((SELECT json_agg(pm.user_id ORDER BY pm.added_at, pm.user_id)
                      FROM project_members pm WHERE pm.project_id = p.id), '[]'::json) AS "memberIds",
            p.deadline, p.status, p.is_archived AS archived,
            p.created_at AS "createdAt", p.updated_at AS "updatedAt"
     FROM projects p
     WHERE p.id IN (${visibleProjectsSql(viewer.role)}) AND (${where})
     ORDER BY p.created_at`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- tasks (with subtasks / comments / attachments / history embedded) ---------- */
async function fetchTasks(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT t.id, t.project_id AS "projectId", t.title, t.description, t.priority, t.status, t.progress,
            t.due_date AS "dueDate", t.estimated_hours AS "estimatedHours",
            COALESCE((SELECT json_agg(ta.user_id ORDER BY ta.assigned_at, ta.user_id)
                      FROM task_assignees ta WHERE ta.task_id = t.id), '[]'::json) AS "assigneeIds",
            COALESCE((SELECT json_agg(json_build_object('id', s.id, 'text', s.text, 'done', s.is_done) ORDER BY s.position, s.created_at)
                      FROM subtasks s WHERE s.task_id = t.id), '[]'::json) AS subtasks,
            COALESCE((SELECT json_agg(json_build_object('userId', h.user_id, 'change', h.change, 'date', h.created_at) ORDER BY h.created_at, h.id)
                      FROM task_history h WHERE h.task_id = t.id), '[]'::json) AS history,
            COALESCE((SELECT json_agg(json_build_object('userId', c.user_id, 'text', c.body, 'date', c.created_at) ORDER BY c.created_at, c.id)
                      FROM task_comments c WHERE c.task_id = t.id), '[]'::json) AS comments,
            COALESCE((SELECT json_agg(json_build_object('filename', a.filename, 'date', a.created_at) ORDER BY a.created_at)
                      FROM task_attachments a WHERE a.task_id = t.id), '[]'::json) AS attachments,
            t.created_at AS "createdAt", t.updated_at AS "updatedAt"
     FROM tasks t
     WHERE t.project_id IN (${visibleProjectsSql(viewer.role)}) AND (${where})
     ORDER BY t.created_at, t.id`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- feedback (+ replies) ---------- */
async function fetchFeedback(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT f.id, f.project_id AS "projectId", f.task_id AS "taskId", f.teacher_id AS "teacherId",
            f.message, f.category, f.priority, f.rating, f.resolved,
            COALESCE((SELECT json_agg(json_build_object('userId', r.user_id, 'text', r.body, 'date', r.created_at) ORDER BY r.created_at, r.id)
                      FROM feedback_replies r WHERE r.feedback_id = f.id), '[]'::json) AS replies,
            f.created_at AS "createdAt"
     FROM feedback f
     WHERE f.project_id IN (${visibleProjectsSql(viewer.role)}) AND (${where})
     ORDER BY f.created_at, f.id`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- announcements: global ones + those for projects the viewer can see ---------- */
async function fetchAnnouncements(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT a.id, a.author_id AS "authorId", a.title, a.message, a.type,
            a.project_id AS "projectId", a.created_at AS "createdAt"
     FROM announcements a
     WHERE (a.project_id IS NULL OR a.project_id IN (${visibleProjectsSql(viewer.role)})) AND (${where})
     ORDER BY a.created_at, a.id`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- notes: shared notes of visible projects + the viewer's own private notes ---------- */
async function fetchNotes(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT n.id, n.project_id AS "projectId", n.user_id AS "userId", n.body AS text,
            n.visibility, n.created_at AS "createdAt"
     FROM notes n
     WHERE n.project_id IN (${visibleProjectsSql(viewer.role)})
       AND (n.visibility = 'shared' OR n.user_id = $1) AND (${where})
     ORDER BY n.created_at, n.id`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- calendar events ---------- */
async function fetchEvents(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT e.id, e.title, e.event_date AS date, e.type, e.project_id AS "projectId", e.created_by AS "createdBy"
     FROM calendar_events e
     WHERE (
         e.project_id IN (${visibleProjectsSql(viewer.role)})
         OR (e.project_id IS NULL AND (
               e.created_by = $1
               OR EXISTS (SELECT 1 FROM users c WHERE c.id = e.created_by AND c.role = 'admin')))
         OR $1::uuid IN (SELECT id FROM users WHERE role = 'admin')
       ) AND (${where})
     ORDER BY e.event_date, e.created_at`,
    [viewer.id, ...params]);
  return rows;
}

/* ---------- private to the viewer ---------- */
async function fetchNotifications(db, viewer) {
  const { rows } = await db.query(
    `SELECT id, user_id AS "userId", type, message, related_id AS "relatedId", is_read AS read, created_at AS "createdAt"
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [viewer.id]);
  return rows;
}

async function fetchMessages(db, viewer, where = 'TRUE', params = []) {
  const { rows } = await db.query(
    `SELECT id, sender_id AS "senderId", recipient_id AS "recipientId", body AS text, is_read AS read, created_at AS "createdAt"
     FROM messages WHERE (sender_id = $1 OR recipient_id = $1) AND (${where})
     ORDER BY created_at, id`, [viewer.id, ...params]);
  return rows;
}

async function fetchSettings(db, viewer) {
  const { rows } = await db.query(
    `SELECT dark_mode AS "darkMode", language, notify_task_assigned AS "notifTaskAssigned",
            notify_deadline AS "notifDeadline", notify_feedback AS "notifFeedback"
     FROM user_settings WHERE user_id = $1`, [viewer.id]);
  return rows[0] || { darkMode: false, language: 'en', notifTaskAssigned: true, notifDeadline: true, notifFeedback: true };
}

/** One call = everything this user is allowed to see (used by the browser on every page load). */
async function bootstrap(db, viewer) {
  const [users, projects, tasks, feedback, announcements, notifications, notes, events, messages, settings] = await Promise.all([
    fetchUsers(db, viewer), fetchProjects(db, viewer), fetchTasks(db, viewer), fetchFeedback(db, viewer),
    fetchAnnouncements(db, viewer), fetchNotifications(db, viewer), fetchNotes(db, viewer),
    fetchEvents(db, viewer), fetchMessages(db, viewer), fetchSettings(db, viewer),
  ]);
  return { me: viewer.id, users, projects, tasks, feedback, announcements, notifications, notes, events, messages, settings };
}

module.exports = {
  visibleProjectsSql, fetchUsers, fetchProjects, fetchTasks, fetchFeedback, fetchAnnouncements,
  fetchNotes, fetchEvents, fetchNotifications, fetchMessages, fetchSettings, bootstrap,
};
