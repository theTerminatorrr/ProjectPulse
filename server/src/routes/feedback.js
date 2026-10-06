/* /api/feedback — the project's own Teacher writes; the team replies; only the author resolves. */
const express = require('express');
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { isUuid, str, oneOf, bad, forbidden, notFound, pickId, notify } = require('../util');
const { fetchFeedback } = require('../fetchers');

const router = express.Router();
const CATEGORIES = ['general', 'ui', 'backend', 'documentation', 'presentation'];
const PRIORITIES = ['normal', 'important', 'critical'];
const one = async (db, user, id) => (await fetchFeedback(db, user, 'f.id = $2', [id]))[0];

router.post('/', requireRole('teacher'), async (req, res) => {
  const b = req.body || {};
  const message = str(b.message, 3000);
  if (!message) throw bad('Write your feedback first.');
  if (!isUuid(b.projectId)) throw bad('Choose a project.');
  const rating = Number(b.rating) || 0;
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw bad('Rating must be 0–5.');

  const id = await tx(async (c) => {
    const p = (await c.query('SELECT title, teacher_id FROM projects WHERE id = $1', [b.projectId])).rows[0];
    if (!p) throw notFound('Project not found.');
    if (p.teacher_id !== req.user.id) throw forbidden('You can only give feedback on projects you supervise.');
    const { rows } = await c.query(
      `INSERT INTO feedback (id, project_id, task_id, teacher_id, message, category, priority, rating)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [pickId(b), b.projectId, isUuid(b.taskId) ? b.taskId : null, req.user.id, message,
       oneOf(b.category, CATEGORIES, 'general'), oneOf(b.priority, PRIORITIES, 'normal'), rating]);
    const members = (await c.query('SELECT user_id FROM project_members WHERE project_id = $1', [b.projectId])).rows.map((r) => r.user_id);
    await notify(c, members, 'feedback', `New feedback on "${p.title}"`, rows[0].id);
    return rows[0].id;
  });
  res.status(201).json(await one({ query }, req.user, id));
});

router.post('/:id/replies', requireRole('teacher', 'leader', 'member'), async (req, res) => {
  const text = str(req.body?.text, 2000);
  if (!text) throw bad('Write a reply first.');
  const fb = req.params.id && isUuid(req.params.id) ? await one({ query }, req.user, req.params.id) : null;
  if (!fb) throw notFound('Feedback not found.'); // not visible to this user = does not exist for them
  await tx(async (c) => {
    await c.query('INSERT INTO feedback_replies (feedback_id, user_id, body) VALUES ($1,$2,$3)', [fb.id, req.user.id, text]);
    if (req.user.id !== fb.teacherId) await notify(c, [fb.teacherId], 'feedback', 'New reply to your feedback', fb.id);
  });
  res.status(201).json(await one({ query }, req.user, fb.id));
});

router.patch('/:id', requireRole('teacher'), async (req, res) => {
  const fb = isUuid(req.params.id) ? await one({ query }, req.user, req.params.id) : null;
  if (!fb) throw notFound('Feedback not found.');
  if (fb.teacherId !== req.user.id) throw forbidden('Only the teacher who wrote this feedback can resolve or reopen it.');
  await query('UPDATE feedback SET resolved = $2 WHERE id = $1', [fb.id, !!req.body?.resolved]);
  res.json(await one({ query }, req.user, fb.id));
});

module.exports = router;
