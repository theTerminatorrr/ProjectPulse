/* /api/tasks  — Leaders create/assign; assignees report progress; everyone involved can comment.
   Admin has READ-ONLY access to every task (see fetchers.js) — no write route accepts role 'admin'.
   Every state change appends a row to task_history, written HERE (server-side), so history can't be forged. */
const express = require('express');
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { isUuid, str, oneOf, bad, forbidden, notFound, pickId, notify } = require('../util');
const { fetchTasks } = require('../fetchers');

const router = express.Router();
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['todo', 'in_progress', 'review', 'done'];
const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuidList = (v) => [...new Set((Array.isArray(v) ? v : []).filter(isUuid))];
const one = async (db, user, id) => (await fetchTasks(db, user, 't.id = $2', [id]))[0];
const hist = (c, taskId, userId, change) =>
  c.query('INSERT INTO task_history (task_id, user_id, change) VALUES ($1,$2,$3)', [taskId, userId, change]);

/** Who is this user relative to the task? (locks the task row when `lock` is true) */
async function access(c, taskId, user, lock = false) {
  if (!isUuid(taskId)) throw notFound('Task not found.');
  const { rows } = await c.query(
    `SELECT t.*, p.leader_id, p.teacher_id,
            EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $2) AS is_assignee,
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2) AS is_member
     FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1 ${lock ? 'FOR UPDATE OF t' : ''}`, [taskId, user.id]);
  const t = rows[0];
  if (!t) throw notFound('Task not found.');
  t.isLeader = t.leader_id === user.id;
  t.isTeacher = t.teacher_id === user.id;
  return t;
}

router.post('/', requireRole('leader'), async (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 200);
  if (!title) throw bad('Task title is required.');
  if (!isUuid(b.projectId)) throw bad('Choose a project.');
  const due = DATE_RE.test(b.dueDate || '') ? b.dueDate : null;
  const hours = b.estimatedHours === null || b.estimatedHours === undefined || b.estimatedHours === '' ? null : Number(b.estimatedHours);
  if (hours !== null && (!(hours >= 0) || hours > 9999)) throw bad('Estimated hours must be a positive number.');
  const assignees = uuidList(b.assigneeIds);

  const id = await tx(async (c) => {
    const proj = (await c.query('SELECT leader_id FROM projects WHERE id = $1', [b.projectId])).rows[0];
    if (!proj) throw notFound('Project not found.');
    if (proj.leader_id !== req.user.id) throw forbidden('You can only add tasks to projects you lead.');
    const { rows } = await c.query(
      `INSERT INTO tasks (id, project_id, title, description, priority, due_date, estimated_hours, created_by)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [pickId(b), b.projectId, title, str(b.description), oneOf(b.priority, PRIORITIES, 'medium'), due, hours, req.user.id]);
    const tid = rows[0].id;
    if (assignees.length) await c.query('INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])', [tid, assignees]);
    await hist(c, tid, req.user.id, 'Task created');
    await notify(c, assignees, 'task_assigned', `You were assigned "${title}"`, tid, { skipUser: req.user.id });
    return tid;
  });
  res.status(201).json(await one({ query }, req.user, id));
});

router.patch('/:id', async (req, res) => {
  const b = req.body || {};
  const id = await tx(async (c) => {
    const t = await access(c, req.params.id, req.user, true);
    if (!t.isLeader && !t.is_assignee) throw forbidden('Only the team leader or an assigned member can update this task.');
    const keys = Object.keys(b).filter((k) => !['id', 'createdAt', 'updatedAt', 'subtasks', 'comments', 'history', 'attachments'].includes(k));
    if (!t.isLeader && keys.some((k) => !['status', 'progress'].includes(k))) {
      throw forbidden('Assigned members can only change a task\'s status and progress.');
    }
    if ('projectId' in b && b.projectId !== t.project_id) throw bad('A task cannot be moved to another project.');

    const sets = []; const vals = []; const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    const notes = [];
    if ('status' in b && b.status !== t.status) {
      if (!STATUSES.includes(b.status)) throw bad('Invalid status.');
      add('status', b.status); notes.push(`Status changed to "${STATUS_LABEL[b.status]}"`);
    }
    if ('progress' in b && Number(b.progress) !== t.progress) {
      const p = Number(b.progress);
      if (!Number.isInteger(p) || p < 0 || p > 100) throw bad('Progress must be a whole number from 0 to 100.');
      add('progress', p); notes.push(`Progress updated to ${p}%`);
    }
    let detailsChanged = false;
    if ('title' in b && str(b.title, 200) !== t.title) { if (!str(b.title)) throw bad('Task title is required.'); add('title', str(b.title, 200)); detailsChanged = true; }
    if ('description' in b && str(b.description) !== t.description) { add('description', str(b.description)); detailsChanged = true; }
    if ('priority' in b && b.priority !== t.priority) { if (!PRIORITIES.includes(b.priority)) throw bad('Invalid priority.'); add('priority', b.priority); detailsChanged = true; }
    if ('dueDate' in b) {
      const d = DATE_RE.test(b.dueDate || '') ? b.dueDate : null;
      if (d !== t.due_date) { add('due_date', d); detailsChanged = true; }
    }
    if ('estimatedHours' in b) {
      const h = b.estimatedHours === null || b.estimatedHours === '' ? null : Number(b.estimatedHours);
      if (h !== null && !(h >= 0)) throw bad('Estimated hours must be a positive number.');
      if (h !== (t.estimated_hours === null ? null : Number(t.estimated_hours))) { add('estimated_hours', h); detailsChanged = true; }
    }
    if (sets.length) { vals.push(t.id); await c.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals); }

    if ('assigneeIds' in b) {
      const want = uuidList(b.assigneeIds);
      const have = (await c.query('SELECT user_id FROM task_assignees WHERE task_id = $1', [t.id])).rows.map((r) => r.user_id);
      const added = want.filter((u) => !have.includes(u));
      const removed = have.filter((u) => !want.includes(u));
      if (removed.length) await c.query('DELETE FROM task_assignees WHERE task_id = $1 AND user_id = ANY($2::uuid[])', [t.id, removed]);
      if (added.length) {
        await c.query('INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])', [t.id, added]);
        await notify(c, added, 'task_assigned', `You were assigned "${t.title}"`, t.id, { skipUser: req.user.id });
      }
      if (added.length || removed.length) detailsChanged = true;
    }
    if (detailsChanged) notes.push('Task details updated');
    for (const n of notes) await hist(c, t.id, req.user.id, n);
    return t.id;
  });
  res.json(await one({ query }, req.user, id));
});

router.delete('/:id', requireRole('leader'), async (req, res) => {
  await tx(async (c) => {
    const t = await access(c, req.params.id, req.user, true);
    if (!t.isLeader) throw forbidden('Only the project\'s team leader can delete its tasks.');
    await c.query('DELETE FROM tasks WHERE id = $1', [t.id]);
  });
  res.json({ ok: true });
});

/* ---- sub-resources: each returns the refreshed task ---- */

router.post('/:id/comments', async (req, res) => {
  const text = str(req.body?.text, 2000);
  if (!text) throw bad('Write a comment first.');
  await tx(async (c) => {
    const t = await access(c, req.params.id, req.user);
    if (!(t.isLeader || t.is_member || t.isTeacher)) throw forbidden('Only people on this project can comment.');
    await c.query('INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,$2,$3)', [t.id, req.user.id, text]);
  });
  res.status(201).json(await one({ query }, req.user, req.params.id));
});

router.post('/:id/subtasks', async (req, res) => {
  const text = str(req.body?.text, 300);
  if (!text) throw bad('Subtask text is required.');
  await tx(async (c) => {
    const t = await access(c, req.params.id, req.user, true);
    if (!(t.isLeader || t.is_assignee)) throw forbidden('Only the team leader or an assigned member can edit subtasks.');
    await c.query(
      `INSERT INTO subtasks (id, task_id, text, position)
       VALUES (COALESCE($3::uuid, gen_random_uuid()), $1, $2, COALESCE((SELECT max(position) + 1 FROM subtasks WHERE task_id = $1), 0))`,
      [t.id, text, pickId(req.body)]);
  });
  res.status(201).json(await one({ query }, req.user, req.params.id));
});

router.patch('/:id/subtasks/:sid', async (req, res) => {
  if (!isUuid(req.params.sid)) throw notFound();
  await tx(async (c) => {
    const t = await access(c, req.params.id, req.user);
    if (!(t.isLeader || t.is_assignee)) throw forbidden('Only the team leader or an assigned member can edit subtasks.');
    const r = await c.query('UPDATE subtasks SET is_done = $3 WHERE id = $1 AND task_id = $2', [req.params.sid, t.id, !!req.body?.done]);
    if (!r.rowCount) throw notFound('Subtask not found.');
  });
  res.json(await one({ query }, req.user, req.params.id));
});

// The app records only the file NAME (uploads are simulated). Real file storage = future work.
router.post('/:id/attachments', async (req, res) => {
  const filename = str(req.body?.filename, 255);
  if (!filename) throw bad('File name is required.');
  await tx(async (c) => {
    const t = await access(c, req.params.id, req.user);
    if (!(t.isLeader || t.is_assignee)) throw forbidden('Only the team leader or an assigned member can attach files.');
    await c.query('INSERT INTO task_attachments (task_id, filename, uploaded_by) VALUES ($1,$2,$3)', [t.id, filename, req.user.id]);
    await hist(c, t.id, req.user.id, `Attached "${filename}"`);
  });
  res.status(201).json(await one({ query }, req.user, req.params.id));
});

module.exports = router;
