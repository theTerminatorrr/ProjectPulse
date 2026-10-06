/* Announcements, notifications, messages, notes, events, settings, bootstrap/inbox. */
const express = require('express');
const { query, tx } = require('../db');
const { requireRole } = require('../auth');
const { isUuid, str, oneOf, bad, forbidden, notFound, pickId, notify, audit } = require('../util');
const F = require('../fetchers');

/* ---------------------------------------------------------------- announcements */
const announcements = express.Router();
const ANN_TYPES = ['general', 'meeting', 'deadline', 'presentation', 'exam'];

// Admin: global (no projectId) or to one project.  Teacher: only to a project they supervise.
announcements.post('/', requireRole('admin', 'teacher'), async (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 200); const message = str(b.message, 3000);
  if (!title || !message) throw bad('Title and message are required.');
  const projectId = isUuid(b.projectId) ? b.projectId : null;
  if (!projectId && req.user.role !== 'admin') throw forbidden('Only an administrator can publish a global announcement. Choose one of your projects.');

  const id = await tx(async (c) => {
    let recipients;
    if (projectId) {
      const p = (await c.query('SELECT teacher_id FROM projects WHERE id = $1', [projectId])).rows[0];
      if (!p) throw notFound('Project not found.');
      if (req.user.role === 'teacher' && p.teacher_id !== req.user.id) throw forbidden('You can only announce to projects you supervise.');
      recipients = (await c.query('SELECT user_id FROM project_members WHERE project_id = $1', [projectId])).rows.map((r) => r.user_id);
      recipients.push(p.teacher_id);
    } else {
      recipients = (await c.query('SELECT id FROM users WHERE NOT is_suspended')).rows.map((r) => r.id);
    }
    const { rows } = await c.query(
      `INSERT INTO announcements (id, author_id, project_id, title, message, type)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6) RETURNING id`,
      [pickId(b), req.user.id, projectId, title, message, oneOf(b.type, ANN_TYPES, 'general')]);
    await notify(c, recipients, 'announcement', `New announcement: ${title}`, rows[0].id, { skipUser: req.user.id });
    if (!projectId) await audit(c, req.user.id, 'announcement.global', 'announcement', rows[0].id, { title });
    return rows[0].id;
  });
  res.status(201).json((await F.fetchAnnouncements({ query }, req.user, 'a.id = $2', [id]))[0]);
});

announcements.delete('/:id', requireRole('admin', 'teacher'), async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const r = await query(
    `DELETE FROM announcements WHERE id = $1 AND ($2 = 'admin' OR author_id = $3)`, [req.params.id, req.user.role, req.user.id]);
  if (!r.rowCount) throw notFound('Announcement not found, or it is not yours to delete.');
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- notifications */
const notifications = express.Router();

// The ONLY client-originated notification: a "due soon" reminder for yourself.
// Everything else (assigned, feedback, announcement, message…) is created by the server as a side effect.
notifications.post('/', async (req, res) => {
  const b = req.body || {};
  if (b.type !== 'deadline') throw forbidden('Notifications are created by the server.');
  const message = str(b.message, 300);
  if (!message || !isUuid(b.relatedId)) throw bad('Invalid reminder.');
  const task = (await F.fetchTasks({ query }, req.user, 't.id = $2', [b.relatedId]))[0];
  if (!task) throw notFound('Task not found.');
  const r = await query(
    `INSERT INTO notifications (id, user_id, type, message, related_id)
     SELECT COALESCE($1::uuid, gen_random_uuid()), $2, 'deadline', $3, $4
     WHERE COALESCE((SELECT notify_deadline FROM user_settings WHERE user_id = $2), true)
     ON CONFLICT DO NOTHING RETURNING id`, [pickId(b), req.user.id, message, task.id]);
  res.status(r.rowCount ? 201 : 200).json({ ok: true });
});
notifications.post('/read-all', async (req, res) => {
  await query('UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read', [req.user.id]);
  res.json({ ok: true });
});
notifications.delete('/', async (req, res) => {
  await query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- messages */
const messages = express.Router();

// Everyone (admin, teacher, leader, member) may message every other active user.
messages.post('/', async (req, res) => {
  const text = str(req.body?.text, 2000);
  const to = req.body?.recipientId;
  if (!text) throw bad('Write a message first.');
  if (!isUuid(to)) throw bad('Choose who to message.');
  if (to === req.user.id) throw bad('You cannot message yourself.');
  const id = await tx(async (c) => {
    const rcpt = (await c.query('SELECT 1 FROM users WHERE id = $1 AND NOT is_suspended', [to])).rowCount;
    if (!rcpt) throw notFound('That person does not exist or is suspended.');
    const { rows } = await c.query(
      `INSERT INTO messages (id, sender_id, recipient_id, body)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4) RETURNING id`, [pickId(req.body), req.user.id, to, text]);
    await notify(c, [to], 'message', `New message from ${req.user.fullName}`, rows[0].id);
    return rows[0].id;
  });
  res.status(201).json((await F.fetchMessages({ query }, req.user, 'id = $2', [id]))[0]);
});
messages.post('/read', async (req, res) => {
  if (!isUuid(req.body?.partnerId)) throw bad('Invalid conversation.');
  await query(
    `UPDATE messages SET is_read = true, read_at = now()
     WHERE recipient_id = $1 AND sender_id = $2 AND NOT is_read`, [req.user.id, req.body.partnerId]);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- notes */
const notes = express.Router();
notes.post('/', requireRole('teacher', 'leader', 'member'), async (req, res) => {
  const b = req.body || {};
  const text = str(b.text, 3000);
  if (!text) throw bad('Write a note first.');
  if (!isUuid(b.projectId)) throw bad('Choose a project.');
  const ok = await query(`SELECT 1 WHERE $2::uuid IN (${F.visibleProjectsSql(req.user.role)})`, [req.user.id, b.projectId]);
  if (!ok.rowCount) throw forbidden('You are not part of this project.');
  const { rows } = await query(
    `INSERT INTO notes (id, project_id, user_id, body, visibility)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5) RETURNING id`,
    [pickId(b), b.projectId, req.user.id, text, oneOf(b.visibility, ['shared', 'private'], 'shared')]);
  res.status(201).json((await F.fetchNotes({ query }, req.user, 'n.id = $2', [rows[0].id]))[0]);
});

/* ---------------------------------------------------------------- calendar events */
const events = express.Router();
const EV_TYPES = ['meeting', 'deadline', 'presentation', 'submission'];
events.post('/', async (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 200);
  if (!title) throw bad('Event title is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw bad('Pick a date.');
  const projectId = isUuid(b.projectId) ? b.projectId : null;
  if (projectId) {
    const ok = await query(`SELECT 1 WHERE $2::uuid IN (${F.visibleProjectsSql(req.user.role)})`, [req.user.id, projectId]);
    if (!ok.rowCount) throw forbidden('You are not part of this project.');
  }
  const { rows } = await query(
    `INSERT INTO calendar_events (id, title, event_date, type, project_id, created_by)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2,$3,$4,$5,$6) RETURNING id`,
    [pickId(b), title, b.date, oneOf(b.type, EV_TYPES, 'meeting'), projectId, req.user.id]);
  res.status(201).json((await F.fetchEvents({ query }, req.user, 'e.id = $2', [rows[0].id]))[0]);
});

/* ---------------------------------------------------------------- settings */
const settings = express.Router();
settings.put('/', async (req, res) => {
  const b = req.body || {};
  const cur = await F.fetchSettings({ query }, req.user);
  const v = {
    darkMode: 'darkMode' in b ? !!b.darkMode : cur.darkMode,
    language: 'language' in b ? str(b.language, 10) || 'en' : cur.language,
    notifTaskAssigned: 'notifTaskAssigned' in b ? !!b.notifTaskAssigned : cur.notifTaskAssigned,
    notifDeadline: 'notifDeadline' in b ? !!b.notifDeadline : cur.notifDeadline,
    notifFeedback: 'notifFeedback' in b ? !!b.notifFeedback : cur.notifFeedback,
  };
  await query(
    `INSERT INTO user_settings (user_id, dark_mode, language, notify_task_assigned, notify_deadline, notify_feedback)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET dark_mode = EXCLUDED.dark_mode, language = EXCLUDED.language,
       notify_task_assigned = EXCLUDED.notify_task_assigned, notify_deadline = EXCLUDED.notify_deadline,
       notify_feedback = EXCLUDED.notify_feedback`,
    [req.user.id, v.darkMode, v.language, v.notifTaskAssigned, v.notifDeadline, v.notifFeedback]);
  res.json(v);
});

/* ---------------------------------------------------------------- bootstrap + inbox */
const sync = express.Router();
sync.get('/bootstrap', async (req, res) => res.json(await F.bootstrap({ query }, req.user)));
// Lightweight poll for the chat page: new messages, notifications and any newly registered people.
sync.get('/inbox', async (req, res) => {
  const [messagesRows, notificationRows, users] = await Promise.all([
    F.fetchMessages({ query }, req.user), F.fetchNotifications({ query }, req.user), F.fetchUsers({ query }, req.user)]);
  res.json({ messages: messagesRows, notifications: notificationRows, users });
});

module.exports = { announcements, notifications, messages, notes, events, settings, sync };
