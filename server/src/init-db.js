/* Creates the schema if (and only if) the database is still empty. Safe to call on every start. */
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initDb({ force = false } = {}) {
  const { rows } = await pool.query("SELECT to_regclass('public.users') AS t");
  if (rows[0].t && !force) return false; // already initialised
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  await pool.query(sql); // schema.sql wraps itself in BEGIN/COMMIT
  console.log('[db] schema created');
  return true;
}

module.exports = { initDb };

if (require.main === module) {
  initDb().then((created) => { console.log(created ? 'Schema applied.' : 'Schema already present — nothing to do.'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
