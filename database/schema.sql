-- =============================================================================
-- ProjectPulse — PostgreSQL schema  (v1.0, requires PostgreSQL 13+)
--
-- Roles:  admin | teacher | leader (Team Leader) | member (Team Member)
--
-- Run once on an empty database:
--     psql "$DATABASE_URL" -f database/schema.sql
-- (The Node server also runs this automatically on first start if the
--  `users` table does not exist — see server/src/init-db.js.)
--
-- Conventions
--   * Primary keys are UUIDs. The browser may generate them (crypto.randomUUID)
--     so the UI can show a new record instantly, before the server replies.
--   * Timestamps are timestamptz (stored UTC). Calendar dates are `date`.
--   * Integrity rules that must hold no matter which client writes the data
--     live HERE (FKs, CHECKs, triggers). Who-may-do-what lives in the API.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
CREATE TYPE user_role         AS ENUM ('admin', 'teacher', 'leader', 'member');
CREATE TYPE project_status    AS ENUM ('planning', 'development', 'testing', 'completed');
CREATE TYPE task_status       AS ENUM ('todo', 'in_progress', 'review', 'done');
CREATE TYPE task_priority     AS ENUM ('low', 'medium', 'high');
CREATE TYPE feedback_category AS ENUM ('general', 'ui', 'backend', 'documentation', 'presentation');
CREATE TYPE feedback_priority AS ENUM ('normal', 'important', 'critical');
CREATE TYPE announcement_type AS ENUM ('general', 'meeting', 'deadline', 'presentation', 'exam');
CREATE TYPE notification_type AS ENUM ('task_assigned', 'feedback', 'deadline', 'project_approved',
                                       'announcement', 'member_joined', 'message');
CREATE TYPE event_type        AS ENUM ('meeting', 'deadline', 'presentation', 'submission');
CREATE TYPE note_visibility   AS ENUM ('shared', 'private');

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at fresh
-- ---------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ===========================================================================
-- 1. USERS  (all four roles live in one table; `role` decides the privileges)
-- ===========================================================================
CREATE TABLE users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      text        NOT NULL CHECK (btrim(full_name) <> ''),
  email          text        NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash  text        NOT NULL,                 -- bcrypt, never plain text
  role           user_role   NOT NULL,
  student_id     text,                                  -- students only
  department     text        NOT NULL DEFAULT '',
  semester       text        NOT NULL DEFAULT '',
  bio            text        NOT NULL DEFAULT '',
  is_suspended   boolean     NOT NULL DEFAULT false,    -- admin can suspend
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- students (leader/member) must have a student id; admin/teacher need not
  CONSTRAINT users_student_id_required
    CHECK (role IN ('admin', 'teacher') OR btrim(coalesce(student_id, '')) <> '')
);
CREATE UNIQUE INDEX users_email_uq      ON users (lower(email));
CREATE UNIQUE INDEX users_student_id_uq ON users (student_id) WHERE btrim(coalesce(student_id, '')) <> '';
CREATE INDEX        users_role_idx      ON users (role);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Profile pictures kept out of `users` so list queries stay small.
CREATE TABLE user_avatars (
  user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime_type  text        NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  data       bytea       NOT NULL CHECK (octet_length(data) <= 1048576),   -- 1 MB cap
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user preferences (Settings page)
CREATE TABLE user_settings (
  user_id               uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dark_mode             boolean     NOT NULL DEFAULT false,
  language              text        NOT NULL DEFAULT 'en',
  notify_task_assigned  boolean     NOT NULL DEFAULT true,
  notify_deadline       boolean     NOT NULL DEFAULT true,
  notify_feedback       boolean     NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER user_settings_updated BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 2. PROJECTS  (+ team membership)
-- ===========================================================================
CREATE TABLE projects (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text           NOT NULL CHECK (btrim(title) <> ''),
  description  text           NOT NULL DEFAULT '',
  course_name  text           NOT NULL DEFAULT '',
  teacher_id   uuid           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- supervising teacher
  leader_id    uuid           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- creating team leader
  deadline     date           NOT NULL,
  status       project_status NOT NULL DEFAULT 'planning',
  is_archived  boolean        NOT NULL DEFAULT false,
  created_at   timestamptz    NOT NULL DEFAULT now(),
  updated_at   timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX projects_teacher_idx ON projects (teacher_id);
CREATE INDEX projects_leader_idx  ON projects (leader_id);
CREATE TRIGGER projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- teacher_id must be a teacher; leader_id must be a leader
CREATE FUNCTION projects_check_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.teacher_id AND role = 'teacher') THEN
    RAISE EXCEPTION 'projects.teacher_id must reference a user with role teacher';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.leader_id AND role = 'leader') THEN
    RAISE EXCEPTION 'projects.leader_id must reference a user with role leader';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_roles BEFORE INSERT OR UPDATE OF teacher_id, leader_id ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_check_roles();

CREATE TABLE project_members (
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

-- The leader is always a member of their own project.
CREATE FUNCTION projects_add_leader_as_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id) VALUES (NEW.id, NEW.leader_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER projects_leader_member AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION projects_add_leader_as_member();

-- Only students (leader/member) can be project members; the leader can't be removed.
CREATE FUNCTION project_members_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role IN ('leader', 'member')) THEN
      RAISE EXCEPTION 'Only team leaders and team members can join a project team';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE: allowed when the whole project/user is being removed (parent row already gone)
  IF EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id AND leader_id = OLD.user_id) THEN
    RAISE EXCEPTION 'The project leader cannot be removed from their own project';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER project_members_guard_ins BEFORE INSERT ON project_members
  FOR EACH ROW EXECUTE FUNCTION project_members_guard();
CREATE TRIGGER project_members_guard_del BEFORE DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION project_members_guard();

-- ===========================================================================
-- 3. TASKS  (+ assignees, subtasks, comments, attachments, history)
-- ===========================================================================
CREATE TABLE tasks (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            text          NOT NULL CHECK (btrim(title) <> ''),
  description      text          NOT NULL DEFAULT '',
  priority         task_priority NOT NULL DEFAULT 'medium',
  status           task_status   NOT NULL DEFAULT 'todo',
  progress         smallint      NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_date         date,
  estimated_hours  numeric(6,2)  CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  created_by       uuid          REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (id, project_id)                    -- lets feedback prove task ∈ project
);
CREATE INDEX tasks_project_idx ON tasks (project_id);
CREATE INDEX tasks_status_idx  ON tasks (status);
CREATE INDEX tasks_due_idx     ON tasks (due_date) WHERE status <> 'done';
CREATE TRIGGER tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_assignees (
  task_id      uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignees_user_idx ON task_assignees (user_id);

-- An assignee must belong to the task's project team.
CREATE FUNCTION task_assignees_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tasks t JOIN project_members pm ON pm.project_id = t.project_id
    WHERE t.id = NEW.task_id AND pm.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Task assignee must be a member of the task''s project';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_assignees_guard_trg BEFORE INSERT ON task_assignees
  FOR EACH ROW EXECUTE FUNCTION task_assignees_guard();

-- Removing someone from a project team un-assigns them from that project's tasks.
CREATE FUNCTION project_members_unassign() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM task_assignees ta USING tasks t
  WHERE ta.task_id = t.id AND t.project_id = OLD.project_id AND ta.user_id = OLD.user_id;
  RETURN OLD;
END $$;
CREATE TRIGGER project_members_unassign_trg AFTER DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION project_members_unassign();

CREATE TABLE subtasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text        text        NOT NULL CHECK (btrim(text) <> ''),
  is_done     boolean     NOT NULL DEFAULT false,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subtasks_task_idx ON subtasks (task_id, position);

CREATE TABLE task_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  body        text        NOT NULL CHECK (btrim(body) <> ''),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

-- The current app records only the file NAME (uploads are simulated).
-- storage_key / mime_type / size_bytes are here so real uploads can be added later.
CREATE TABLE task_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename     text        NOT NULL CHECK (btrim(filename) <> ''),
  mime_type    text,
  size_bytes   bigint,
  storage_key  text,
  uploaded_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_attachments_task_idx ON task_attachments (task_id);

-- Append-only audit trail of everything that happens to a task.
-- This is what the Admin "monitoring" views and the Activity Log report read.
CREATE TABLE task_history (
  id          bigserial   PRIMARY KEY,
  task_id     uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  change      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_history_task_idx ON task_history (task_id, created_at);
CREATE INDEX task_history_time_idx ON task_history (created_at DESC);

-- ===========================================================================
-- 4. TEACHER FEEDBACK
-- ===========================================================================
CREATE TABLE feedback (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid              NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id     uuid,                                             -- NULL = project-level feedback
  teacher_id  uuid              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message     text              NOT NULL CHECK (btrim(message) <> ''),
  category    feedback_category NOT NULL DEFAULT 'general',
  priority    feedback_priority NOT NULL DEFAULT 'normal',
  rating      smallint          NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),   -- 0 = not rated
  resolved    boolean           NOT NULL DEFAULT false,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now(),
  -- the task (if any) must belong to the same project (not enforced when task_id IS NULL)
  FOREIGN KEY (task_id, project_id) REFERENCES tasks (id, project_id) ON DELETE CASCADE
);
CREATE INDEX feedback_project_idx ON feedback (project_id, created_at DESC);
CREATE INDEX feedback_teacher_idx ON feedback (teacher_id);
CREATE TRIGGER feedback_updated BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only the project's own teacher can write feedback on it.
CREATE FUNCTION feedback_check_teacher() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND teacher_id = NEW.teacher_id) THEN
    RAISE EXCEPTION 'Feedback must be written by the project''s supervising teacher';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feedback_teacher_trg BEFORE INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION feedback_check_teacher();

CREATE TABLE feedback_replies (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id  uuid        NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES users(id) ON DELETE SET NULL,
  body         text        NOT NULL CHECK (btrim(body) <> ''),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_replies_idx ON feedback_replies (feedback_id, created_at);

-- ===========================================================================
-- 5. ANNOUNCEMENTS   (project_id NULL  =  global / platform-wide)
-- ===========================================================================
CREATE TABLE announcements (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid              REFERENCES users(id) ON DELETE SET NULL,
  project_id  uuid              REFERENCES projects(id) ON DELETE CASCADE,
  title       text              NOT NULL CHECK (btrim(title) <> ''),
  message     text              NOT NULL CHECK (btrim(message) <> ''),
  type        announcement_type NOT NULL DEFAULT 'general',
  created_at  timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX announcements_project_idx ON announcements (project_id, created_at DESC);
CREATE INDEX announcements_time_idx    ON announcements (created_at DESC);

-- Global announcements: admin only.  Project announcements: admin or that project's teacher.
CREATE FUNCTION announcements_check_author() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE author_role user_role;
BEGIN
  SELECT role INTO author_role FROM users WHERE id = NEW.author_id;
  IF NEW.project_id IS NULL THEN
    IF author_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only an administrator can publish a global announcement';
    END IF;
  ELSIF author_role IS DISTINCT FROM 'admin'
        AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND teacher_id = NEW.author_id) THEN
    RAISE EXCEPTION 'Only an administrator or the project''s teacher can announce to a project';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER announcements_author_trg BEFORE INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION announcements_check_author();

-- ===========================================================================
-- 6. NOTIFICATIONS, MESSAGES, NOTES, CALENDAR
-- ===========================================================================
CREATE TABLE notifications (
  id          uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  message     text              NOT NULL,
  related_id  uuid,                                  -- task / feedback / project / announcement / message id
  is_read     boolean           NOT NULL DEFAULT false,
  created_at  timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);
-- one "deadline approaching" alert per user per task, even if two tabs race
CREATE UNIQUE INDEX notifications_deadline_uq ON notifications (user_id, related_id) WHERE type = 'deadline';

-- Direct messages: any user can write to any other user.
CREATE TABLE messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          text        NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
  is_read       boolean     NOT NULL DEFAULT false,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX messages_inbox_idx  ON messages (recipient_id, is_read);
CREATE INDEX messages_sender_idx ON messages (sender_id, created_at DESC);
CREATE INDEX messages_pair_idx   ON messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);

CREATE TABLE notes (
  id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid            NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  body        text            NOT NULL CHECK (btrim(body) <> ''),
  visibility  note_visibility NOT NULL DEFAULT 'shared',
  created_at  timestamptz     NOT NULL DEFAULT now()
);
CREATE INDEX notes_project_idx ON notes (project_id, created_at DESC);

-- project_id NULL = personal event (visible to its creator; admin-created ones are visible to all)
CREATE TABLE calendar_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL CHECK (btrim(title) <> ''),
  event_date  date        NOT NULL,
  type        event_type  NOT NULL DEFAULT 'meeting',
  project_id  uuid        REFERENCES projects(id) ON DELETE CASCADE,
  created_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_events_date_idx ON calendar_events (event_date);
CREATE INDEX calendar_events_proj_idx ON calendar_events (project_id);

-- ===========================================================================
-- 7. ADMIN AUDIT LOG  (new — the old localStorage app had nothing like it)
-- ===========================================================================
CREATE TABLE audit_log (
  id           bigserial   PRIMARY KEY,
  actor_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  action       text        NOT NULL,          -- e.g. user.suspend, user.delete, project.delete, announcement.global
  target_type  text,
  target_id    uuid,
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time_idx ON audit_log (created_at DESC);

-- ===========================================================================
-- 8. VIEWS  (read-only helpers; the Admin "monitor every task" screen uses #2)
-- ===========================================================================

-- Project progress = average progress of its tasks (0 when it has none).
-- Mirrors Projects.progressOf() in the front end.
CREATE VIEW v_project_progress AS
SELECT p.id AS project_id,
       count(t.id)                                         AS task_count,
       count(t.id) FILTER (WHERE t.status = 'done')        AS done_count,
       COALESCE(round(avg(t.progress))::int, 0)            AS progress_pct
FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id;

-- One row per task across the whole platform, with who/where/overdue.
CREATE VIEW v_admin_task_monitor AS
SELECT t.id                AS task_id,
       t.title,
       t.status,
       t.priority,
       t.progress,
       t.due_date,
       (t.due_date IS NOT NULL AND t.due_date < current_date AND t.status <> 'done') AS is_overdue,
       p.id                AS project_id,
       p.title             AS project_title,
       lead.full_name      AS leader_name,
       tch.full_name       AS teacher_name,
       COALESCE((SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
                 FROM task_assignees ta JOIN users u ON u.id = ta.user_id
                 WHERE ta.task_id = t.id), '')                                       AS assignees,
       (SELECT max(h.created_at) FROM task_history h WHERE h.task_id = t.id)          AS last_activity,
       t.created_at,
       t.updated_at
FROM tasks t
JOIN projects p    ON p.id = t.project_id
JOIN users   lead  ON lead.id = p.leader_id
JOIN users   tch   ON tch.id = p.teacher_id;

-- Per-student workload (feeds the leaderboard / member report).
CREATE VIEW v_member_stats AS
SELECT u.id AS user_id, u.full_name,
       count(ta.task_id)                                   AS assigned,
       count(t.id) FILTER (WHERE t.status = 'done')        AS completed
FROM users u
LEFT JOIN task_assignees ta ON ta.user_id = u.id
LEFT JOIN tasks t           ON t.id = ta.task_id
WHERE u.role IN ('leader', 'member')
GROUP BY u.id, u.full_name;

-- Platform-wide numbers for the Admin dashboard cards.
CREATE VIEW v_platform_stats AS
SELECT (SELECT count(*) FROM users)                                               AS users,
       (SELECT count(*) FROM projects)                                            AS projects,
       (SELECT count(*) FROM tasks)                                               AS tasks,
       (SELECT count(*) FROM tasks WHERE status = 'done')                         AS tasks_done,
       (SELECT count(*) FROM tasks WHERE due_date < current_date AND status <> 'done') AS tasks_overdue;

COMMIT;
