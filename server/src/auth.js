/* Password hashing, JWT issue/verify and the request guards. */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (use 32+ random characters). See server/.env.example');
  process.exit(1);
}

const hashPassword = (pw) => bcrypt.hash(pw, 10);
const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
// A real hash of a random string, compared against when the e-mail is unknown, so
// "unknown e-mail" and "wrong password" take the same time (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-' + Math.random(), 10);

const signToken = (userId, remember) =>
  jwt.sign({ sub: userId }, SECRET, { expiresIn: remember ? '30d' : '12h' });

/** Loads the user from the DB on EVERY request, so a suspended/deleted account is locked out immediately. */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  let payload;
  try { payload = jwt.verify(token, SECRET); } catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
  const { rows } = await query(
    'SELECT id, full_name, email, role, is_suspended FROM users WHERE id = $1', [payload.sub]);
  const u = rows[0];
  if (!u) return res.status(401).json({ error: 'Account no longer exists.' });
  if (u.is_suspended) return res.status(403).json({ error: 'This account has been suspended. Contact an administrator.', suspended: true });
  req.user = { id: u.id, role: u.role, fullName: u.full_name, email: u.email };
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your role is not allowed to do this.' });

module.exports = { hashPassword, checkPassword, DUMMY_HASH, signToken, authenticate, requireRole };
