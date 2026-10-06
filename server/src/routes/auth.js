/* /api/auth/*  — registration, login, password change; /api/config */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, tx } = require('../db');
const { hashPassword, checkPassword, DUMMY_HASH, signToken, authenticate } = require('../auth');
const { str, bad, HttpError } = require('../util');
const { fetchUsers } = require('../fetchers');

const router = express.Router();
const DEMO_ENABLED = process.env.ENABLE_DEMO_LOGIN === 'true';
const MIN_PASSWORD = 8;

// Brute-force protection: 10 login attempts per 15 min per IP (only FAILED attempts count).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-ups from this address. Try again later.' },
});

router.get('/config', (req, res) => res.json({ demoLogin: DEMO_ENABLED }));

/** Insert a user row. Used by self-registration (students only) and by admins (any role). */
async function insertUser(db, f) {
  const fullName = str(f.fullName, 120);
  const email = str(f.email, 200).toLowerCase();
  if (!fullName) throw bad('Full name is required.', { field: 'fullName' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email.', { field: 'email' });
  if (typeof f.password !== 'string' || f.password.length < MIN_PASSWORD) {
    throw bad(`Use at least ${MIN_PASSWORD} characters for the password.`, { field: 'password' });
  }
  if (!['admin', 'teacher', 'leader', 'member'].includes(f.role)) throw bad('Choose a valid role.', { field: 'role' });
  const isStudent = f.role === 'leader' || f.role === 'member';
  const studentId = str(f.studentId, 40);
  if (isStudent && !studentId) throw bad('Student ID is required.', { field: 'studentId' });
  const hash = await hashPassword(f.password);
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, student_id, department, semester)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [fullName, email, hash, f.role, isStudent ? studentId : null, str(f.department, 120), str(f.semester, 60)]);
  return rows[0].id;
}

router.post('/auth/register', registerLimiter, async (req, res) => {
  const b = req.body || {};
  // Public sign-up is for students only. Teachers/admins are created by an administrator.
  if (b.role !== 'leader' && b.role !== 'member') throw new HttpError(403, 'Only Team Leader and Team Member accounts can be self-registered.');
  if (!str(b.department)) throw bad('Department is required.', { field: 'department' });
  if (!str(b.semester)) throw bad('Semester is required.', { field: 'semester' });
  const id = await tx((c) => insertUser(c, b));
  const user = (await fetchUsers({ query }, { id, role: b.role }, 'u.id = $3', [id]))[0];
  res.status(201).json({ token: signToken(id, false), user });
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = await query(
    'SELECT id, role, password_hash, is_suspended FROM users WHERE lower(email) = $1', [email]);
  const u = rows[0];
  const ok = await checkPassword(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Invalid email or password.');
  if (u.is_suspended) throw new HttpError(403, 'This account has been suspended. Contact an administrator.');
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  const user = (await fetchUsers({ query }, { id: u.id, role: u.role }, 'u.id = $3', [u.id]))[0];
  res.json({ token: signToken(u.id, !!req.body?.rememberMe), user });
});

// One-click demo accounts. OFF unless ENABLE_DEMO_LOGIN=true (they have a well-known password!).
router.post('/auth/demo', async (req, res) => {
  if (!DEMO_ENABLED) throw new HttpError(404, 'Demo login is disabled on this server.');
  const role = str(req.body?.role, 20);
  const { rows } = await query('SELECT id, role, is_suspended FROM users WHERE lower(email) = $1', [`${role}@demo.com`]);
  const u = rows[0];
  if (!u) throw new HttpError(404, 'Demo account not found. Run: npm run db:seed-demo');
  if (u.is_suspended) throw new HttpError(403, 'This demo account is currently suspended.');
  const user = (await fetchUsers({ query }, { id: u.id, role: u.role }, 'u.id = $3', [u.id]))[0];
  res.json({ token: signToken(u.id, false), user });
});

router.post('/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) throw bad(`Use at least ${MIN_PASSWORD} characters.`);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await checkPassword(String(currentPassword || ''), rows[0].password_hash))) throw bad('Current password is incorrect.');
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(newPassword)]);
  res.json({ ok: true });
});

module.exports = { router, insertUser, MIN_PASSWORD };
