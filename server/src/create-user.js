/* CLI: node src/create-user.js --role admin|teacher|leader|member --name "..." --email x@y.z --password "..." [--student-id 123] */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { pool } = require('./db');
const { initDb } = require('./init-db');
const { insertUser } = require('./routes/auth');
const a = process.argv.slice(2); const get = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
(async () => {
  await initDb();
  const id = await insertUser(pool, { role: get('role'), fullName: get('name'), email: get('email'), password: get('password'),
    studentId: get('student-id'), department: get('department') || '', semester: get('semester') || '' });
  console.log('Created', get('role'), get('email'), id);
})().catch((e) => { console.error('Failed:', e.message); process.exitCode = 1; }).finally(() => pool.end());
