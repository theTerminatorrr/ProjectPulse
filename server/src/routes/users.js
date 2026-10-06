/* /api/users/*  — profile edits, admin user management, avatars */
const express = require('express');
const { query, tx } = require('../db');
const { authenticate, requireRole, hashPassword } = require('../auth');
const { isUuid, str, bad, forbidden, notFound, HttpError, audit } = require('../util');
const { fetchUsers } = require('../fetchers');
const { insertUser, MIN_PASSWORD } = require('./auth');

const router = express.Router();

// (mounted at /api/users)
// Public on purpose: <img src> tags cannot send an Authorization header. Ids are random UUIDs.
router.get('/:id/avatar', async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const { rows } = await query('SELECT mime_type, data FROM user_avatars WHERE user_id = $1', [req.params.id]);
  if (!rows[0]) throw notFound();
  res.set({ 'Content-Type': rows[0].mime_type, 'Cache-Control': 'public, max-age=86400', 'Content-Disposition': 'inline' });
  res.send(rows[0].data);
});

router.use(authenticate);
const asUser = (db, req, id) => fetchUsers(db, req.user, 'u.id = $3', [id]).then((r) => r[0]);

/** Admin creates any account (this is how Teacher and Admin accounts come into existence). */
router.post('/', requireRole('admin'), async (req, res) => {
  const id = await tx(async (c) => {
    const newId = await insertUser(c, req.body || {});
    await audit(c, req.user.id, 'user.create', 'user', newId, { role: req.body.role });
    return newId;
  });
  res.status(201).json(await asUser({ query }, req, id));
});

/** Profile edit (self) or suspend/unsuspend (admin, never on yourself). */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound();
  const b = req.body || {};
  const isSelf = id === req.user.id;
  const sets = []; const vals = []; const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

  if ('suspended' in b) {
    if (req.user.role !== 'admin') throw forbidden('Only an administrator can suspend accounts.');
    if (isSelf) throw forbidden('You cannot suspend your own account.');
    add('is_suspended', !!b.suspended);
  }
  const profileKeys = ['fullName', 'studentId', 'email', 'department', 'semester', 'bio', 'avatar'];
  if (profileKeys.some((k) => k in b)) {
    if (!isSelf) throw forbidden('You can only edit your own profile.');
    if ('fullName' in b) { if (!str(b.fullName)) throw bad('Full name is required.'); add('full_name', str(b.fullName, 120)); }
    if ('email' in b) {
      const e = str(b.email, 200).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Enter a valid email.', { field: 'email' });
      add('email', e);
    }
    if ('studentId' in b && ['leader', 'member'].includes(req.user.role)) add('student_id', str(b.studentId, 40) || null);
    if ('department' in b) add('department', str(b.department, 120));
    if ('semester' in b) add('semester', str(b.semester, 60));
    if ('bio' in b) add('bio', str(b.bio, 1000));
  }

  await tx(async (c) => {
    if (sets.length) {
      vals.push(id);
      const r = await c.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      if (!r.rowCount) throw notFound('User not found.');
      if ('suspended' in b) await audit(c, req.user.id, b.suspended ? 'user.suspend' : 'user.unsuspend', 'user', id);
    }
    if (isSelf && 'avatar' in b) {
      if (b.avatar === '' || b.avatar === null) {
        await c.query('DELETE FROM user_avatars WHERE user_id = $1', [id]);
      } else if (typeof b.avatar === 'string' && b.avatar.startsWith('data:')) {
        const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(b.avatar);
        if (!m) throw bad('Profile photo must be a PNG, JPEG, WebP or GIF image.');
        const data = Buffer.from(m[2], 'base64');
        if (data.length > 1048576) throw bad('Profile photo must be under 1 MB.');
        await c.query(
          `INSERT INTO user_avatars (user_id, mime_type, data) VALUES ($1,$2,$3)
           ON CONFLICT (user_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, updated_at = now()`,
          [id, m[1], data]);
      } // anything else (e.g. the existing /api/... url echoed back) = leave the photo alone
    }
  });
  const user = await asUser({ query }, req, id);
  if (!user) throw notFound('User not found.');
  res.json(user);
});

/** Admin deletes a student account. Teachers/admins and project leaders are protected (same rules as the old UI). */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw notFound();
  if (id === req.user.id) throw forbidden('You cannot delete your own account.');
  const { rows } = await query('SELECT role, full_name FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('User not found.');
  if (['admin', 'teacher'].includes(rows[0].role)) throw forbidden('Teacher and Administrator accounts cannot be deleted here.');
  const led = await query('SELECT 1 FROM projects WHERE leader_id = $1 LIMIT 1', [id]);
  if (led.rowCount) throw new HttpError(409, 'This user leads a project. Delete or reassign that project first.');
  await tx(async (c) => {
    await c.query(
      `INSERT INTO task_history (task_id, user_id, change)
       SELECT task_id, $2, 'Unassigned — account removed by admin' FROM task_assignees WHERE user_id = $1`, [id, req.user.id]);
    await audit(c, req.user.id, 'user.delete', 'user', id, { name: rows[0].full_name, role: rows[0].role });
    await c.query('DELETE FROM users WHERE id = $1', [id]);
  });
  res.json({ ok: true });
});

/** There is no e-mail service yet, so an admin resets forgotten passwords. */
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const pw = req.body?.newPassword;
  if (!isUuid(id)) throw notFound();
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw bad(`Use at least ${MIN_PASSWORD} characters.`);
  await tx(async (c) => {
    const r = await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, await hashPassword(pw)]);
    if (!r.rowCount) throw notFound('User not found.');
    await audit(c, req.user.id, 'user.reset_password', 'user', id);
  });
  res.json({ ok: true });
});

module.exports = router;
