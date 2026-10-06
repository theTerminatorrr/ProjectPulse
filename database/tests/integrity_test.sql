-- Integrity tests for database/schema.sql.
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/integrity_test.sql
-- Everything happens inside a transaction that is rolled back, so it is safe to
-- run against a database that already has data.  Output: one PASS/FAIL per rule.

BEGIN;

CREATE TEMP TABLE t_results (name text, ok boolean) ON COMMIT DROP;

-- helper: expect_fail('label', 'sql')  -> PASS if the statement raises an error
CREATE FUNCTION pg_temp.expect_fail(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO t_results VALUES (label, false);      -- statement succeeded -> rule NOT enforced
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_results VALUES (label, true);
  END;
END $$;

-- helper: expect_ok('label', 'sql')    -> PASS if the statement succeeds
CREATE FUNCTION pg_temp.expect_ok(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    INSERT INTO t_results VALUES (label, true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_results VALUES (label || '  [' || SQLERRM || ']', false);
  END;
END $$;

-- ---- fixtures (fixed uuids so the statements below stay readable) ----------
INSERT INTO users (id, full_name, email, password_hash, role, student_id) VALUES
 ('00000000-0000-0000-0000-0000000000a1','Admin',   'adm@t.io','x','admin',  NULL),
 ('00000000-0000-0000-0000-0000000000b1','Teacher', 'tch@t.io','x','teacher',NULL),
 ('00000000-0000-0000-0000-0000000000b2','Teacher2','tc2@t.io','x','teacher',NULL),
 ('00000000-0000-0000-0000-0000000000c1','Leader',  'led@t.io','x','leader', 'S1'),
 ('00000000-0000-0000-0000-0000000000d1','Member1', 'm1@t.io', 'x','member', 'S2'),
 ('00000000-0000-0000-0000-0000000000d2','Member2', 'm2@t.io', 'x','member', 'S3');

INSERT INTO projects (id, title, teacher_id, leader_id, deadline) VALUES
 ('00000000-0000-0000-0000-0000000000f1','P1',
  '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1', current_date + 10);

INSERT INTO project_members (project_id, user_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000d1');

INSERT INTO tasks (id, project_id, title) VALUES
 ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000f1','T1');

-- ---- USERS -----------------------------------------------------------------
SELECT pg_temp.expect_fail('users: duplicate email (case-insensitive) rejected',
 $$INSERT INTO users (full_name,email,password_hash,role,student_id) VALUES ('X','LED@T.IO','x','member','S9')$$);
SELECT pg_temp.expect_fail('users: duplicate student_id rejected',
 $$INSERT INTO users (full_name,email,password_hash,role,student_id) VALUES ('X','x1@t.io','x','member','S2')$$);
SELECT pg_temp.expect_fail('users: student without student_id rejected',
 $$INSERT INTO users (full_name,email,password_hash,role) VALUES ('X','x2@t.io','x','member')$$);
SELECT pg_temp.expect_fail('users: malformed email rejected',
 $$INSERT INTO users (full_name,email,password_hash,role) VALUES ('X','not-an-email','x','teacher')$$);
SELECT pg_temp.expect_fail('users: unknown role rejected',
 $$INSERT INTO users (full_name,email,password_hash,role) VALUES ('X','x3@t.io','x','superuser')$$);
SELECT pg_temp.expect_ok('users: teacher/admin need no student_id',
 $$INSERT INTO users (full_name,email,password_hash,role) VALUES ('Ok','ok1@t.io','x','teacher')$$);

-- ---- PROJECTS / MEMBERS ----------------------------------------------------
SELECT pg_temp.expect_fail('projects: teacher_id pointing at a member rejected',
 $$INSERT INTO projects (title,teacher_id,leader_id,deadline) VALUES ('Bad','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1',current_date)$$);
SELECT pg_temp.expect_fail('projects: leader_id pointing at a member rejected',
 $$INSERT INTO projects (title,teacher_id,leader_id,deadline) VALUES ('Bad','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1',current_date)$$);
SELECT pg_temp.expect_fail('projects: missing deadline rejected',
 $$INSERT INTO projects (title,teacher_id,leader_id) VALUES ('Bad','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1')$$);
INSERT INTO t_results SELECT 'projects: leader auto-added as member by trigger',
  EXISTS (SELECT 1 FROM project_members WHERE project_id='00000000-0000-0000-0000-0000000000f1' AND user_id='00000000-0000-0000-0000-0000000000c1');
SELECT pg_temp.expect_fail('members: teacher cannot join a team',
 $$INSERT INTO project_members VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1')$$);
SELECT pg_temp.expect_fail('members: admin cannot join a team',
 $$INSERT INTO project_members VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1')$$);
SELECT pg_temp.expect_fail('members: leader cannot be removed from own project',
 $$DELETE FROM project_members WHERE project_id='00000000-0000-0000-0000-0000000000f1' AND user_id='00000000-0000-0000-0000-0000000000c1'$$);
SELECT pg_temp.expect_fail('users: cannot delete a teacher who supervises a project (RESTRICT)',
 $$DELETE FROM users WHERE id='00000000-0000-0000-0000-0000000000b1'$$);

-- ---- TASKS -----------------------------------------------------------------
SELECT pg_temp.expect_fail('tasks: progress > 100 rejected',
 $$UPDATE tasks SET progress = 101 WHERE id='00000000-0000-0000-0000-000000000e01'$$);
SELECT pg_temp.expect_fail('tasks: negative progress rejected',
 $$UPDATE tasks SET progress = -1 WHERE id='00000000-0000-0000-0000-000000000e01'$$);
SELECT pg_temp.expect_fail('tasks: invalid status rejected',
 $$UPDATE tasks SET status = 'finished' WHERE id='00000000-0000-0000-0000-000000000e01'$$);
SELECT pg_temp.expect_fail('assignee: non-team user cannot be assigned',
 $$INSERT INTO task_assignees (task_id,user_id) VALUES ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000d2')$$);
SELECT pg_temp.expect_ok('assignee: team member can be assigned',
 $$INSERT INTO task_assignees (task_id,user_id) VALUES ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000d1')$$);
DELETE FROM project_members WHERE project_id='00000000-0000-0000-0000-0000000000f1' AND user_id='00000000-0000-0000-0000-0000000000d1';
INSERT INTO t_results SELECT 'assignee: removing member from team auto-unassigns their tasks',
  NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id='00000000-0000-0000-0000-000000000e01');

-- ---- FEEDBACK --------------------------------------------------------------
SELECT pg_temp.expect_fail('feedback: written by a teacher who does not supervise the project',
 $$INSERT INTO feedback (project_id,teacher_id,message) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2','hi')$$);
SELECT pg_temp.expect_fail('feedback: rating 6 rejected',
 $$INSERT INTO feedback (project_id,teacher_id,message,rating) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','hi',6)$$);
SELECT pg_temp.expect_ok('feedback: supervising teacher, project-level (no task)',
 $$INSERT INTO feedback (project_id,teacher_id,message,rating) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1','good',4)$$);
SELECT pg_temp.expect_ok('feedback: supervising teacher, on a task of that project',
 $$INSERT INTO feedback (project_id,task_id,teacher_id,message) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000b1','task fb')$$);
INSERT INTO projects (id, title, teacher_id, leader_id, deadline) VALUES
 ('00000000-0000-0000-0000-0000000000f2','P2','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c1', current_date);
SELECT pg_temp.expect_fail('feedback: task from a DIFFERENT project rejected',
 $$INSERT INTO feedback (project_id,task_id,teacher_id,message) VALUES ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000b2','x')$$);

-- ---- ANNOUNCEMENTS (admin-only global) ------------------------------------
SELECT pg_temp.expect_fail('announcement: global by a teacher rejected',
 $$INSERT INTO announcements (author_id,title,message) VALUES ('00000000-0000-0000-0000-0000000000b1','t','m')$$);
SELECT pg_temp.expect_fail('announcement: global by a leader rejected',
 $$INSERT INTO announcements (author_id,title,message) VALUES ('00000000-0000-0000-0000-0000000000c1','t','m')$$);
SELECT pg_temp.expect_ok('announcement: global by admin accepted',
 $$INSERT INTO announcements (author_id,title,message) VALUES ('00000000-0000-0000-0000-0000000000a1','t','m')$$);
SELECT pg_temp.expect_ok('announcement: project-level by that project''s teacher accepted',
 $$INSERT INTO announcements (author_id,project_id,title,message) VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000f1','t','m')$$);
SELECT pg_temp.expect_fail('announcement: project-level by another project''s teacher rejected',
 $$INSERT INTO announcements (author_id,project_id,title,message) VALUES ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000f1','t','m')$$);

-- ---- MESSAGES --------------------------------------------------------------
SELECT pg_temp.expect_fail('messages: sending to yourself rejected',
 $$INSERT INTO messages (sender_id,recipient_id,body) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1','hi')$$);
SELECT pg_temp.expect_fail('messages: empty body rejected',
 $$INSERT INTO messages (sender_id,recipient_id,body) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','   ')$$);
SELECT pg_temp.expect_ok('messages: admin -> student',
 $$INSERT INTO messages (sender_id,recipient_id,body) VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','hello')$$);
SELECT pg_temp.expect_ok('messages: student -> admin',
 $$INSERT INTO messages (sender_id,recipient_id,body) VALUES ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','hi admin')$$);
SELECT pg_temp.expect_ok('messages: student -> teacher with NO shared project',
 $$INSERT INTO messages (sender_id,recipient_id,body) VALUES ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b2','hi')$$);

-- ---- NOTIFICATIONS ---------------------------------------------------------
INSERT INTO notifications (user_id,type,message,related_id) VALUES
 ('00000000-0000-0000-0000-0000000000c1','deadline','due','00000000-0000-0000-0000-000000000e01');
SELECT pg_temp.expect_fail('notifications: duplicate deadline alert for same user+task rejected',
 $$INSERT INTO notifications (user_id,type,message,related_id) VALUES ('00000000-0000-0000-0000-0000000000c1','deadline','due again','00000000-0000-0000-0000-000000000e01')$$);

-- ---- CASCADES --------------------------------------------------------------
INSERT INTO task_comments (task_id,user_id,body) VALUES ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000c1','c');
INSERT INTO task_history  (task_id,user_id,change) VALUES ('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000c1','Task created');
INSERT INTO subtasks (task_id,text) VALUES ('00000000-0000-0000-0000-000000000e01','s');
DELETE FROM projects WHERE id='00000000-0000-0000-0000-0000000000f1';
INSERT INTO t_results SELECT 'cascade: deleting a project removes tasks, members, comments, history, subtasks, feedback, announcements',
  NOT EXISTS (SELECT 1 FROM tasks WHERE project_id='00000000-0000-0000-0000-0000000000f1')
  AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id='00000000-0000-0000-0000-0000000000f1')
  AND NOT EXISTS (SELECT 1 FROM task_comments WHERE task_id='00000000-0000-0000-0000-000000000e01')
  AND NOT EXISTS (SELECT 1 FROM task_history  WHERE task_id='00000000-0000-0000-0000-000000000e01')
  AND NOT EXISTS (SELECT 1 FROM subtasks      WHERE task_id='00000000-0000-0000-0000-000000000e01')
  AND NOT EXISTS (SELECT 1 FROM feedback      WHERE project_id='00000000-0000-0000-0000-0000000000f1')
  AND NOT EXISTS (SELECT 1 FROM announcements WHERE project_id='00000000-0000-0000-0000-0000000000f1');

-- ---- VIEWS -----------------------------------------------------------------
INSERT INTO tasks (project_id,title,status,progress,due_date) VALUES
 ('00000000-0000-0000-0000-0000000000f2','late',  'in_progress', 40, current_date - 3),
 ('00000000-0000-0000-0000-0000000000f2','done',  'done',       100, current_date - 3);
INSERT INTO t_results SELECT 'view v_project_progress = average task progress (40+100)/2 = 70',
  (SELECT progress_pct FROM v_project_progress WHERE project_id='00000000-0000-0000-0000-0000000000f2') = 70;
INSERT INTO t_results SELECT 'view v_admin_task_monitor flags exactly the overdue unfinished task',
  (SELECT count(*) FROM v_admin_task_monitor WHERE project_id='00000000-0000-0000-0000-0000000000f2' AND is_overdue) = 1;

-- ---- report ----------------------------------------------------------------
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name FROM t_results;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM t_results;

ROLLBACK;
