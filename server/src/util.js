/* Small shared helpers: validation, errors, notifications, audit. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);
const forbidden = (msg = 'You are not allowed to do this.') => new HttpError(403, msg);
const notFound = (msg = 'Not found.') => new HttpError(404, msg);

/** Use the client-supplied id only if it is a valid uuid (lets the UI render optimistically). */
const pickId = (body) => (isUuid(body && body.id) ? body.id : null);

/** Insert notifications, honouring each user's notification preferences. `client` may be pool or tx client. */
async function notify(client, userIds, type, message, relatedId = null, { skipUser = null } = {}) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== skipUser);
  if (!ids.length) return;
  const prefCol = { task_assigned: 'notify_task_assigned', feedback: 'notify_feedback', deadline: 'notify_deadline' }[type];
  await client.query(
    `INSERT INTO notifications (user_id, type, message, related_id)
     SELECT u.id, $2::notification_type, $3, $4
     FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE u.id = ANY($1::uuid[]) ${prefCol ? `AND COALESCE(s.${prefCol}, true)` : ''}
     ON CONFLICT DO NOTHING`,
    [ids, type, message, relatedId]);
}

async function audit(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    'INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
    [actorId, action, targetType, targetId || null, JSON.stringify(details)]);
}

module.exports = { isUuid, str, oneOf, HttpError, bad, forbidden, notFound, pickId, notify, audit };
