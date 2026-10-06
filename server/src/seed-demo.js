/* Loads the same demo data the old localStorage app seeded. Demo password for all: demo123
   Safe to re-run (does nothing if the demo accounts exist). NEVER use on a real production database. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { pool, tx } = require('./db');
const { initDb } = require('./init-db');
const { hashPassword } = require('./auth');

async function seedDemo() {
  await initDb();
  if ((await pool.query("SELECT 1 FROM users WHERE email = 'admin@demo.com'")).rowCount) { console.log('Demo data already present.'); return; }
  const hash = await hashPassword('demo123');
  await tx(async (c) => {
    const U = async (name, email, role, sid, dept, sem, bio) => (await c.query(
      `INSERT INTO users (full_name,email,password_hash,role,student_id,department,semester,bio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name, email, hash, role, sid, dept, sem, bio])).rows[0].id;
    const admin = await U('System Administrator', 'admin@demo.com', 'admin', null, 'IT Administration', '', 'Platform administrator.');
    const teacher = await U('Dr. Farah Chowdhury', 'teacher@demo.com', 'teacher', null, 'Computer Science', '', 'Course instructor for Web Programming.');
    const leader = await U('Ayesha Rahman', 'leader@demo.com', 'leader', '0112410544', 'Computer Science', 'Summer 2026', 'Team lead, front-end focused.');
    const m1 = await U('Tanvir Ahmed', 'member@demo.com', 'member', '0112410358', 'Computer Science', 'Summer 2026', 'Handles backend logic and data.');
    const m2 = await U('Nusrat Jahan', 'nusrat@demo.com', 'member', '0112330060', 'Computer Science', 'Summer 2026', 'UI/UX and documentation.');
    const m3 = await U('Rakib Hasan', 'rakib@demo.com', 'member', '0112410076', 'Computer Science', 'Summer 2026', 'Testing and QA.');

    const P = async (title, desc, status, days, members) => {
      const id = (await c.query(
        `INSERT INTO projects (title,description,course_name,teacher_id,leader_id,deadline,status)
         VALUES ($1,$2,'Web Programming',$3,$4,current_date + $5::int,$6) RETURNING id`, [title, desc, teacher, leader, days, status])).rows[0].id;
      for (const m of members) await c.query('INSERT INTO project_members (project_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, m]);
      return id;
    };
    const ecom = await P('E-Commerce Website', 'A responsive online store with cart, checkout simulation, and an admin product panel.', 'development', 21, [m1, m2]);
    const camp = await P('Campus Event Finder', 'A tool for students to browse and RSVP to campus events, with calendar sync.', 'planning', 45, [m3]);

    const T = async (pid, title, desc, assignee, pri, status, prog, days, hrs) => {
      const id = (await c.query(
        `INSERT INTO tasks (project_id,title,description,priority,status,progress,due_date,estimated_hours,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,current_date + $7::int,$8,$9) RETURNING id`, [pid, title, desc, pri, status, prog, days, hrs, leader])).rows[0].id;
      await c.query('INSERT INTO task_assignees (task_id,user_id) VALUES ($1,$2)', [id, assignee]);
      await c.query("INSERT INTO task_history (task_id,user_id,change) VALUES ($1,$2,'Task created')", [id, leader]);
      return id;
    };
    const t1 = await T(ecom, 'Design login page', 'Create the login/register UI following the navy gradient theme.', m2, 'high', 'in_progress', 60, 3, 4);
    await T(ecom, 'Build product listing grid', 'Responsive grid of product cards with filter/sort.', m1, 'medium', 'todo', 0, 7, 6);
    await T(ecom, 'Implement cart logic', 'Add/remove items, quantity, totals.', m1, 'high', 'todo', 0, 10, 8);
    await T(ecom, 'Write project README', 'Setup instructions, demo accounts, feature list.', m2, 'low', 'review', 90, 14, 2);
    await T(camp, 'Sketch app wireframes', 'Low-fidelity wireframes for the main screens.', m3, 'medium', 'done', 100, -2, 3);
    await c.query("INSERT INTO subtasks (task_id,text,is_done,position) VALUES ($1,'Wireframe',true,0),($1,'Build markup',true,1),($1,'Style form states',false,2)", [t1]);
    await c.query("INSERT INTO task_comments (task_id,user_id,body) VALUES ($1,$2,'Wireframe approved, moving to build.')", [t1, m2]);
    await c.query("INSERT INTO task_history (task_id,user_id,change) VALUES ($1,$2,'Progress updated to 60%')", [t1, m2]);

    await c.query(`INSERT INTO feedback (project_id,task_id,teacher_id,message,category,priority,rating)
                   VALUES ($1,$2,$3,'Great progress on the login page — refine the color contrast on the placeholder text before final submission.','ui','normal',4)`, [ecom, t1, teacher]);
    const f2 = (await c.query(`INSERT INTO feedback (project_id,teacher_id,message,category,priority)
                   VALUES ($1,$2,'Overall the project is on track. Make sure the README documents your data model clearly.','documentation','important') RETURNING id`, [ecom, teacher])).rows[0].id;
    await c.query("INSERT INTO feedback_replies (feedback_id,user_id,body) VALUES ($1,$2,'Will do — updating the README this week.')", [f2, leader]);

    await c.query(`INSERT INTO calendar_events (title,event_date,type,project_id,created_by) VALUES
      ('Sprint review meeting', current_date+5,'meeting',$1,$3),('Final submission', current_date+21,'submission',$1,$3),
      ('Progress presentation', current_date+12,'presentation',$2,$3)`, [ecom, camp, leader]);
    await c.query(`INSERT INTO messages (sender_id,recipient_id,body,is_read) VALUES
      ($1,$2,'Hey, how''s the login page coming along?',true),($2,$1,'Almost done — just styling the form states now.',true),($3,$1,'Good progress on the E-Commerce project so far.',false)`, [leader, m2, teacher]);
    await c.query(`INSERT INTO announcements (author_id,title,message,type) VALUES ($1,'Welcome to ProjectPulse','Platform-wide announcements from the administrator appear here.','general')`, [admin]);
    await c.query(`INSERT INTO notifications (user_id,type,message,related_id) VALUES
      ($1,'task_assigned','You were assigned "Build product listing grid"',NULL),($2,'feedback','New feedback on "E-Commerce Website"',$3)`, [m1, leader, f2]);
  });
  console.log('Demo data loaded. Logins: admin@/teacher@/leader@/member@demo.com  password: demo123');
}
module.exports = { seedDemo };
if (require.main === module) seedDemo().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
