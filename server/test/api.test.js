/* End-to-end API tests. Requires a database seeded with `npm run db:seed-demo`.
   Run: DATABASE_URL=... JWT_SECRET=... ENABLE_DEMO_LOGIN=true npm test */
process.env.ENABLE_DEMO_LOGIN = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start } = require('../src/index');
const { pool } = require('../src/db');

let base; let server;
const tokens = {}; const ids = {};
const uuid = () => crypto.randomUUID();
async function api(method, path, body, who) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + tokens[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}
const boot = async (who) => (await api('GET', '/api/bootstrap', null, who)).body;

test.before(async () => {
  server = await start(); base = `http://localhost:${server.address().port}`;
  for (const role of ['admin', 'teacher', 'leader', 'member']) {
    const r = await api('POST', '/api/auth/demo', { role });
    assert.equal(r.status, 200, 'demo login ' + role); tokens[role] = r.body.token; ids[role] = r.body.user.id;
  }
});
test.after(async () => { server.close(); await pool.end(); });

test('public registration is students-only; teacher/admin roles rejected', async () => {
  for (const role of ['teacher', 'admin']) {
    const r = await api('POST', '/api/auth/register', { fullName: 'X', studentId: '1', email: `x${Date.now()}@t.io`, department: 'd', semester: 's', password: 'password1', role });
    assert.equal(r.status, 403);
  }
});
test('registration: duplicate email -> 409 field=email; short password -> 400', async () => {
  const email = `dup${Date.now()}@t.io`;
  const f = { fullName: 'Dup', studentId: 'D' + Date.now(), email, department: 'CS', semester: 'S', password: 'password1', role: 'member' };
  assert.equal((await api('POST', '/api/auth/register', f)).status, 201);
  const again = await api('POST', '/api/auth/register', { ...f, studentId: 'D2' + Date.now() });
  assert.equal(again.status, 409); assert.equal(again.body.field, 'email');
  assert.equal((await api('POST', '/api/auth/register', { ...f, email: 'a' + email, studentId: 'Z', password: 'short' })).status, 400);
});
test('login: wrong password and unknown email give the same generic error; passwords are never returned', async () => {
  const a = await api('POST', '/api/auth/login', { email: 'leader@demo.com', password: 'nope' });
  const b = await api('POST', '/api/auth/login', { email: 'ghost@demo.com', password: 'nope' });
  assert.equal(a.status, 401); assert.deepEqual(a.body, b.body);
  const ok = await api('POST', '/api/auth/login', { email: 'LEADER@demo.com', password: 'demo123' });
  assert.equal(ok.status, 200); assert.ok(!JSON.stringify(ok.body).includes('password'));
});
test('no token -> 401', async () => assert.equal((await api('GET', '/api/bootstrap')).status, 401));

test('ADMIN monitors every task; others are scoped', async () => {
  const [a, t, l, m] = await Promise.all(['admin', 'teacher', 'leader', 'member'].map(boot));
  const total = Number((await pool.query('SELECT count(*) FROM tasks')).rows[0].count);
  assert.equal(a.tasks.length, total); assert.ok(total >= 5);
  assert.equal(a.projects.length, Number((await pool.query('SELECT count(*) FROM projects')).rows[0].count));
  assert.ok(l.tasks.length <= total && t.tasks.length <= total && m.tasks.length <= total);
  assert.ok(a.tasks.every((x) => Array.isArray(x.history) && Array.isArray(x.comments) && Array.isArray(x.subtasks)));
  assert.ok(a.users.some((u) => u.email), 'admin sees emails');
  const other = m.users.find((u) => u.id !== ids.member);
  assert.equal(other.email, '', 'members do not see other people\'s emails');
});

let projectId; let taskId;
test('LEADER creates project + assigns task; member is notified; members/teacher cannot create', async () => {
  projectId = uuid(); taskId = uuid();
  assert.equal((await api('POST', '/api/projects', { id: projectId, title: 'API Test Project', deadline: '2030-01-01', memberIds: [ids.member] }, 'member')).status, 403);
  assert.equal((await api('POST', '/api/projects', { id: projectId, title: 'API Test Project', deadline: '2030-01-01' }, 'teacher')).status, 403);
  const p = await api('POST', '/api/projects', { id: projectId, title: 'API Test Project', deadline: '2030-01-01', memberIds: [ids.member] }, 'leader');
  assert.equal(p.status, 201); assert.equal(p.body.id, projectId, 'client-supplied id kept');
  assert.ok(p.body.memberIds.includes(ids.leader) && p.body.memberIds.includes(ids.member));
  assert.equal(p.body.teacherId, ids.teacher, 'single teacher auto-selected');
  const t = await api('POST', '/api/tasks', { id: taskId, projectId, title: 'Do the thing', assigneeIds: [ids.member], priority: 'high', dueDate: '2030-01-01' }, 'leader');
  assert.equal(t.status, 201); assert.equal(t.body.history[0].change, 'Task created');
  assert.ok((await boot('member')).notifications.some((n) => n.type === 'task_assigned' && n.relatedId === taskId));
  assert.equal((await api('POST', '/api/tasks', { projectId, title: 'x' }, 'member')).status, 403);
  assert.equal((await api('POST', '/api/tasks', { projectId, title: 'x' }, 'teacher')).status, 403);
  assert.equal((await api('POST', '/api/tasks', { projectId, title: 'x' }, 'admin')).status, 403);
});
test('assigning a non-team user is rejected by the database rule', async () => {
  const nus = (await pool.query("SELECT id FROM users WHERE email='nusrat@demo.com'")).rows[0].id;
  const r = await api('PATCH', `/api/tasks/${taskId}`, { assigneeIds: [ids.member, nus] }, 'leader');
  assert.equal(r.status, 400); assert.match(r.body.error, /member of the task/);
});
test('assignee can update status/progress (history written server-side) but not edit details', async () => {
  const r = await api('PATCH', `/api/tasks/${taskId}`, { status: 'in_progress', progress: 40 }, 'member');
  assert.equal(r.status, 200); assert.equal(r.body.progress, 40);
  const changes = r.body.history.map((h) => h.change);
  assert.ok(changes.includes('Status changed to "In Progress"') && changes.includes('Progress updated to 40%'));
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { title: 'hacked' }, 'member')).status, 403);
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { progress: 150 }, 'member')).status, 400);
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { progress: 90 }, 'admin')).status, 403, 'admin is read-only on tasks');
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { progress: 90 }, 'teacher')).status, 403);
});
test('comments, subtasks, attachments; admin cannot write; admin CAN read them', async () => {
  assert.equal((await api('POST', `/api/tasks/${taskId}/comments`, { text: 'on it' }, 'member')).status, 201);
  assert.equal((await api('POST', `/api/tasks/${taskId}/comments`, { text: 'looks good' }, 'teacher')).status, 201);
  assert.equal((await api('POST', `/api/tasks/${taskId}/comments`, { text: 'nope' }, 'admin')).status, 403);
  const s = await api('POST', `/api/tasks/${taskId}/subtasks`, { text: 'step 1' }, 'member');
  assert.equal(s.status, 201); const sid = s.body.subtasks[0].id;
  const tg = await api('PATCH', `/api/tasks/${taskId}/subtasks/${sid}`, { done: true }, 'member');
  assert.equal(tg.body.subtasks[0].done, true);
  assert.equal((await api('POST', `/api/tasks/${taskId}/attachments`, { filename: 'spec.pdf' }, 'member')).status, 201);
  const seen = (await boot('admin')).tasks.find((t) => t.id === taskId);
  assert.equal(seen.comments.length, 2); assert.equal(seen.attachments[0].filename, 'spec.pdf');
  assert.ok(seen.history.some((h) => h.change === 'Attached "spec.pdf"'));
});
test('a student outside the project cannot see or touch it', async () => {
  const rakib = (await api('POST', '/api/auth/login', { email: 'rakib@demo.com', password: 'demo123' })).body.token; tokens.rakib = rakib;
  assert.ok(!(await boot('rakib')).tasks.some((t) => t.id === taskId));
  assert.equal((await api('POST', `/api/tasks/${taskId}/comments`, { text: 'x' }, 'rakib')).status, 403);
  assert.equal((await api('PATCH', `/api/tasks/${taskId}`, { progress: 1 }, 'rakib')).status, 403);
});

test('MESSAGES: everyone can message everyone (incl. admin and teacher with no shared project)', async () => {
  const pairs = [['admin', 'member'], ['member', 'admin'], ['member', 'teacher'], ['teacher', 'leader'], ['leader', 'admin'], ['admin', 'teacher']];
  for (const [from, to] of pairs) assert.equal((await api('POST', '/api/messages', { recipientId: ids[to], text: `${from}->${to}` }, from)).status, 201, `${from}->${to}`);
  assert.equal((await api('POST', '/api/messages', { recipientId: ids.admin, text: 'self' }, 'admin')).status, 400);
  const inbox = await api('GET', '/api/inbox', null, 'member');
  assert.ok(inbox.body.messages.some((m) => m.text === 'admin->member' && m.recipientId === ids.member));
  assert.ok(inbox.body.notifications.some((n) => n.type === 'message'));
  assert.ok(!(await boot('rakib')).messages.some((m) => m.text === 'admin->member'), 'DMs are private');
  assert.equal((await api('POST', '/api/messages/read', { partnerId: ids.admin }, 'member')).status, 200);
  assert.ok((await boot('member')).messages.filter((m) => m.senderId === ids.admin).every((m) => m.read));
});

test('ANNOUNCEMENTS: only admin is global; teacher only for own project; students cannot', async () => {
  assert.equal((await api('POST', '/api/announcements', { title: 't', message: 'm' }, 'leader')).status, 403);
  assert.equal((await api('POST', '/api/announcements', { title: 't', message: 'm' }, 'member')).status, 403);
  assert.equal((await api('POST', '/api/announcements', { title: 't', message: 'm' }, 'teacher')).status, 403, 'teacher cannot go global');
  const g = await api('POST', '/api/announcements', { title: 'Global notice', message: 'Holiday Friday', type: 'general' }, 'admin');
  assert.equal(g.status, 201); assert.equal(g.body.projectId, null);
  for (const who of ['teacher', 'leader', 'member', 'rakib']) {
    const b = await boot(who);
    assert.ok(b.announcements.some((a) => a.id === g.body.id), who + ' sees global announcement');
    assert.ok(b.notifications.some((n) => n.type === 'announcement' && n.relatedId === g.body.id), who + ' notified');
  }
  assert.equal((await api('POST', '/api/announcements', { title: 'p', message: 'm', projectId }, 'teacher')).status, 201);
  assert.ok((await boot('member')).announcements.some((a) => a.projectId === projectId));
  assert.ok(!(await boot('rakib')).announcements.some((a) => a.projectId === projectId), 'project announcement not visible outside project');
  assert.equal((await api('DELETE', `/api/announcements/${g.body.id}`, null, 'teacher')).status, 404, 'teacher cannot delete admin post');
  assert.equal((await api('DELETE', `/api/announcements/${g.body.id}`, null, 'admin')).status, 200);
});

test('FEEDBACK: teacher writes, team replies, only author resolves', async () => {
  assert.equal((await api('POST', '/api/feedback', { projectId, message: 'x' }, 'member')).status, 403);
  const f = await api('POST', '/api/feedback', { projectId, taskId, message: 'Nice work', rating: 5, category: 'ui' }, 'teacher');
  assert.equal(f.status, 201);
  assert.ok((await boot('member')).notifications.some((n) => n.type === 'feedback' && n.relatedId === f.body.id));
  assert.equal((await api('POST', `/api/feedback/${f.body.id}/replies`, { text: 'thanks' }, 'member')).status, 201);
  assert.equal((await api('POST', `/api/feedback/${f.body.id}/replies`, { text: 'x' }, 'admin')).status, 403);
  assert.equal((await api('POST', `/api/feedback/${f.body.id}/replies`, { text: 'x' }, 'rakib')).status, 404);
  assert.equal((await api('PATCH', `/api/feedback/${f.body.id}`, { resolved: true }, 'member')).status, 403);
  assert.equal((await api('PATCH', `/api/feedback/${f.body.id}`, { resolved: true }, 'teacher')).body.resolved, true);
  assert.ok((await boot('admin')).feedback.some((x) => x.id === f.body.id && x.replies.length === 1), 'admin can monitor feedback');
});

test('removing a member un-assigns them and logs it; leader cannot be removed', async () => {
  const r = await api('PATCH', `/api/projects/${projectId}`, { memberIds: [ids.leader] }, 'leader');
  assert.equal(r.status, 200); assert.deepEqual(r.body.memberIds, [ids.leader]);
  const t = (await boot('admin')).tasks.find((x) => x.id === taskId);
  assert.deepEqual(t.assigneeIds, []); assert.ok(t.history.some((h) => h.change === 'Unassigned — removed from project'));
  const r2 = await api('PATCH', `/api/projects/${projectId}`, { memberIds: [] }, 'leader');
  assert.deepEqual(r2.body.memberIds, [ids.leader], 'leader is always kept');
});

test('ADMIN user management: create teacher, suspend (instant lock-out), reset password, delete rules', async () => {
  const email = `t${Date.now()}@school.edu`;
  assert.equal((await api('POST', '/api/users', { fullName: 'New T', email, password: 'password1', role: 'teacher' }, 'leader')).status, 403);
  const c = await api('POST', '/api/users', { fullName: 'New Teacher', email, password: 'password1', role: 'teacher' }, 'admin');
  assert.equal(c.status, 201); assert.equal(c.body.role, 'teacher');
  const nt = (await api('POST', '/api/auth/login', { email, password: 'password1' })).body.token; tokens.nt = nt;
  assert.equal((await boot('nt')).projects.length, 0, 'new teacher supervises nothing yet');
  assert.equal((await api('PATCH', `/api/users/${c.body.id}`, { suspended: true }, 'member')).status, 403);
  assert.equal((await api('PATCH', `/api/users/${ids.admin}`, { suspended: true }, 'admin')).status, 403, 'cannot suspend self');
  assert.equal((await api('PATCH', `/api/users/${c.body.id}`, { suspended: true }, 'admin')).status, 200);
  assert.equal((await api('GET', '/api/bootstrap', null, 'nt')).status, 403, 'existing token dies immediately');
  assert.equal((await api('POST', '/api/auth/login', { email, password: 'password1' })).status, 403);
  await api('PATCH', `/api/users/${c.body.id}`, { suspended: false }, 'admin');
  assert.equal((await api('POST', `/api/users/${c.body.id}/reset-password`, { newPassword: 'brandnew99' }, 'admin')).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { email, password: 'brandnew99' })).status, 200);
  assert.equal((await api('DELETE', `/api/users/${c.body.id}`, null, 'admin')).status, 403, 'teachers protected');
  assert.equal((await api('DELETE', `/api/users/${ids.leader}`, null, 'admin')).status, 409, 'project leader protected');
  assert.equal((await api('DELETE', `/api/users/${ids.member}`, null, 'leader')).status, 403);
  const stu = await api('POST', '/api/auth/register', { fullName: 'Temp', studentId: 'TMP' + Date.now(), email: `tmp${Date.now()}@t.io`, department: 'd', semester: 's', password: 'password1', role: 'member' });
  assert.equal((await api('DELETE', `/api/users/${stu.body.user.id}`, null, 'admin')).status, 200);
  const log = (await pool.query("SELECT action FROM audit_log WHERE actor_id=$1", [ids.admin])).rows.map((r) => r.action);
  for (const a of ['user.create', 'user.suspend', 'user.unsuspend', 'user.reset_password', 'user.delete', 'announcement.global']) assert.ok(log.includes(a), 'audit has ' + a);
});

test('profile: self-edit only; avatar stored in DB and served; password change', async () => {
  assert.equal((await api('PATCH', `/api/users/${ids.leader}`, { bio: 'hijack' }, 'member')).status, 403);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const u = await api('PATCH', `/api/users/${ids.member}`, { bio: 'hello', avatar: png }, 'member');
  assert.equal(u.status, 200); assert.match(u.body.avatar, /^\/api\/users\/.+\/avatar\?v=\d+$/);
  const img = await fetch(base + u.body.avatar); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await api('PATCH', `/api/users/${ids.member}`, { avatar: 'data:text/html;base64,PHNjcmlwdD4=' }, 'member')).status, 400);
  assert.equal((await api('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'abcdefgh1' }, 'member')).status, 400);
});

test('static files: allow-list serves the app but never server code / secrets', async () => {
  assert.equal((await fetch(base + '/login.html')).status, 200);
  assert.equal((await fetch(base + '/js/app.js')).status, 200);
  for (const p of ['/server/.env', '/server/src/index.js', '/database/schema.sql', '/.git/config', '/package.json', '/js/../server/.env']) {
    const r = await fetch(base + p); const t = await r.text();
    assert.ok(!t.includes('JWT_SECRET') && !t.includes('CREATE TABLE'), p + ' must not leak');
  }
});
test('deleting a project (admin allowed) cascades everything', async () => {
  assert.equal((await api('DELETE', `/api/projects/${projectId}`, null, 'member')).status, 403);
  assert.equal((await api('DELETE', `/api/projects/${projectId}`, null, 'admin')).status, 200);
  assert.equal((await pool.query('SELECT count(*) FROM tasks WHERE project_id=$1', [projectId])).rows[0].count, 0);
});
