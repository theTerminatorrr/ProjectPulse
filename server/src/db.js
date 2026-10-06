/* PostgreSQL connection pool + small helpers. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Pool, types } = require('pg');

// Return DATE as 'YYYY-MM-DD' text (the default JS Date would shift days across time zones).
types.setTypeParser(1082, (v) => v);
// NUMERIC -> number, BIGINT (count(*)) -> number
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  // Managed hosts (Neon, Supabase, Render ...) need TLS. Neon's URL already has ?sslmode=require.
  // Set DATABASE_SSL=true to force TLS for URLs without sslmode.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // generous: Neon wakes from scale-to-zero on first query
});
pool.on('error', (e) => console.error('Unexpected idle-client error', e.message));

const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside BEGIN/COMMIT; ROLLBACK on error. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
