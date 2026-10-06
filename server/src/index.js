/* ProjectPulse server: REST API under /api + the static front end (same origin, no CORS needed). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { pool, query } = require('./db');
const { authenticate } = require('./auth');
const { initDb } = require('./init-db');
const { HttpError } = require('./util');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const projectsRoutes = require('./routes/projects');
const tasksRoutes = require('./routes/tasks');
const feedbackRoutes = require('./routes/feedback');
const misc = require('./routes/misc');

const ROOT = path.join(__dirname, '..', '..'); // repo root = the front-end files
const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1); // Render/Heroku-style single proxy hop
// CSP is left off: the pages load Chart.js/Font Awesome/etc. from CDNs. See DEPLOYMENT_GUIDE.md "Hardening".
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (process.env.CORS_ORIGIN) { // only needed if the front end is hosted on a DIFFERENT origin
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()), allowedHeaders: ['Content-Type', 'Authorization'] }));
}
app.use(express.json({ limit: '2mb' }));

/* ---------------- API ---------------- */
app.get('/api/health', async (req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api', authRoutes.router);                       // /config, /auth/*   (public + own guards)
app.use('/api/users', usersRoutes);                       // avatar is public, the rest guarded inside
const guarded = (p, r) => app.use(`/api/${p}`, authenticate, r);
guarded('projects', projectsRoutes);
guarded('tasks', tasksRoutes);
guarded('feedback', feedbackRoutes);
guarded('announcements', misc.announcements);
guarded('notifications', misc.notifications);
guarded('messages', misc.messages);
guarded('notes', misc.notes);
guarded('events', misc.events);
guarded('settings', misc.settings);
app.use('/api', authenticate, misc.sync);                 // /bootstrap, /inbox
app.use('/api', (req, res) => res.status(404).json({ error: 'No such API route.' }));

/* ---------------- static front end (explicit allow-list: never serves server/, database/, .env, .git …) ---------------- */
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/images', express.static(path.join(ROOT, 'images'))); // optional folder
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get(/^\/([a-z-]+)\.html$/, (req, res, next) => res.sendFile(path.join(ROOT, `${req.params[0]}.html`), (e) => e && next()));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'index.html')));

/* ---------------- errors ---------------- */
const PG_FRIENDLY = {
  users_email_uq: ['An account with this email already exists.', 'email'],
  users_student_id_uq: ['This student ID is already registered.', 'studentId'],
  users_student_id_required: ['Student ID is required.', 'studentId'],
};
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  if (err.code === '23505') { const f = PG_FRIENDLY[err.constraint]; return res.status(409).json({ error: f ? f[0] : 'That record already exists.', field: f && f[1] }); }
  if (err.code === 'P0001') return res.status(400).json({ error: err.message });          // a rule raised by a DB trigger
  if (err.code === '23514') { const f = PG_FRIENDLY[err.constraint]; return res.status(400).json({ error: f ? f[0] : 'Some of the values are not allowed.', field: f && f[1] }); }
  if (err.code === '23503') return res.status(409).json({ error: 'This record is still referenced by other data.' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid value.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------------- start ---------------- */
async function ensureFirstAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) return;
  if ((await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1")).rowCount) return;
  const { insertUser } = authRoutes;
  await insertUser(pool, { fullName: process.env.ADMIN_NAME || 'System Administrator', email, password, role: 'admin', department: 'IT Administration' });
  console.log(`[setup] first administrator created: ${email}`);
}

async function start() {
  if (process.env.AUTO_INIT_DB !== 'false') await initDb();
  await ensureFirstAdmin();
  const port = Number(process.env.PORT || 3000);
  return app.listen(port, () => console.log(`ProjectPulse listening on http://localhost:${port}`));
}

if (require.main === module) start().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
module.exports = { app, start };
