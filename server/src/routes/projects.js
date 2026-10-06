/* /api/projects  — Team Leaders create/manage; Admin may delete (mounted behind authenticate) */
const express = require('express');
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { isUuid, str, oneOf, bad, forbidden, notFound, pickId, notify, audit } = require('../util');
const { fetchProjects } = require('../fetchers');

const router = express.Router();
const STATUSES = ['planning', 'development', 'testing', 'completed'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuidList = (v) => [...new Set((Array.isArray(v) ? v : []).filter(isUuid))];
const one = async (db, user, id) => (await fetchProjects(db, user, 'p.id = $2', [id]))[0];

router.post('/', requireRole('leader'), async (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 200);
  if (!title) throw bad('Project name is required.');
  if (!DATE_RE.test(b.deadline || '')) throw bad('A deadline date is required.');

  let teacherId = isUuid(b.teacherId) ? b.teacherId : null;
  if (!teacherId) {
    const t = await query("SELECT id FROM users WHERE role = 'teacher' AND NOT is_suspended");
    if (t.rowCount === 1) teacherId = t.rows[0].id;
    else throw bad(t.rowCount === 0
      ? 'There is no teacher account yet. Ask an administrator to create one.'
      : 'Please choose the supervising teacher.');
  }
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO projects (id, title, description, course_name, teacher_id, leader_id, deadline, status)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [pickId(b), title, str(b.description), str(b.courseName, 200), teacherId, req.user.id, b.deadline,
       oneOf(b.status, STATUSES, 'planning')]);
    const pid = rows[0].id;
    const added = await c.query(
      `INSERT INTO project_members (project_id, user_id)
       SELECT $1, u.id FROM users u WHERE u.id = ANY($2::uuid[]) AND u.role = 'member' AND NOT u.is_suspended
       ON CONFLICT DO NOTHING RETURNING user_id`, [pid, uuidList(b.memberIds)]);
    await notify(c, added.rows.map((r) => r.user_id), 'member_joined', `You were added to "${title}"`, pid);
    return pid;
  });
  res.status(201).json(await one({ query }, req.user, id));
});

router.patch('/:id', requireRole('leader'), async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound();
  const b = req.body || {};
  await tx(async (c) => {
    const cur = (await c.query('SELECT leader_id, title FROM projects WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Project not found.');
    if (cur.leader_id !== req.user.id) throw forbidden('Only the project\'s team leader can change it.');

    const sets = []; const vals = []; const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if ('title' in b) { if (!str(b.title)) throw bad('Project name is required.'); add('title', str(b.title, 200)); }
    if ('description' in b) add('description', str(b.description));
    if ('courseName' in b) add('course_name', str(b.courseName, 200));
    if ('status' in b) { if (!STATUSES.includes(b.status)) throw bad('Invalid project status.'); add('status', b.status); }
    if ('deadline' in b) { if (!DATE_RE.test(b.deadline || '')) throw bad('A deadline date is required.'); add('deadline', b.deadline); }
    if ('archived' in b) add('is_archived', !!b.archived);
    if ('teacherId' in b && isUuid(b.teacherId)) add('teacher_id', b.teacherId);
    if (sets.length) { vals.push(id); await c.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals); }

    if ('memberIds' in b) {
      const desired = new Set(uuidList(b.memberIds)); desired.add(cur.leader_id);
      const current = (await c.query('SELECT user_id FROM project_members WHERE project_id = $1', [id])).rows.map((r) => r.user_id);
      const removed = current.filter((u) => !desired.has(u));
      const toAdd = [...desired].filter((u) => !current.includes(u));
      if (removed.length) {
        await c.query(
          `INSERT INTO task_history (task_id, user_id, change)
           SELECT ta.task_id, $3, 'Unassigned — removed from project'
           FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id
           WHERE t.project_id = $1 AND ta.user_id = ANY($2::uuid[])`, [id, removed, req.user.id]);
        await c.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = ANY($2::uuid[])', [id, removed]);
      }
      if (toAdd.length) {
        const added = await c.query(
          `INSERT INTO project_members (project_id, user_id)
           SELECT $1, u.id FROM users u WHERE u.id = ANY($2::uuid[]) AND u.role = 'member' AND NOT u.is_suspended
           ON CONFLICT DO NOTHING RETURNING user_id`, [id, toAdd]);
        await notify(c, added.rows.map((r) => r.user_id), 'member_joined', `You were added to "${cur.title}"`, id);
      }
    }
  });
  res.json(await one({ query }, req.user, id));
});

// Leader deletes own project; Admin may delete any project (and it is audit-logged).
router.delete('/:id', requireRole('leader', 'admin'), async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound();
  await tx(async (c) => {
    const cur = (await c.query('SELECT leader_id, title FROM projects WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Project not found.');
    if (req.user.role === 'leader' && cur.leader_id !== req.user.id) throw forbidden('Only the project\'s team leader can delete it.');
    if (req.user.role === 'admin') await audit(c, req.user.id, 'project.delete', 'project', id, { title: cur.title });
    await c.query('DELETE FROM projects WHERE id = $1', [id]); // FK cascades remove tasks, feedback, notes, events…
  });
  res.json({ ok: true });
});

module.exports = router;
