/* ==========================================================================
   ProjectPulse — projects.js
   Project CRUD + rendering for projects.html, dashboard quick-create,
   and the project-details.html tabbed view.
   ========================================================================== */

const Projects = {
  STATUS_LABELS: { planning: 'Planning', development: 'Development', testing: 'Testing', completed: 'Completed' },

  all() { return Storage.getAll('projects'); },

  byId(id) { return Storage.getById('projects', id); },

  /** Projects visible to a given user, based on role. */
  forUser(user) {
    if (!user) return [];
    // Teachers oversee every project in this demo (single shared course).
    if (user.role === 'teacher') return this.all();
    if (user.role === 'leader') return this.all().filter((p) => p.leaderId === user.id);
    return this.all().filter((p) => (p.memberIds || []).includes(user.id));
  },

  tasksOf(projectId) { return Storage.getAll('tasks').filter((t) => t.projectId === projectId); },

  /** Average task progress = overall project progress (0-100, rounded). */
  progressOf(projectId) {
    const tasks = this.tasksOf(projectId);
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => acc + (t.progress || 0), 0);
    return Math.round(sum / tasks.length);
  },

  membersOf(project) {
    return (project.memberIds || []).map((id) => Storage.getById('users', id)).filter(Boolean);
  },

  create(data) {
    const project = Storage.save('projects', {
      title: data.title, description: data.description || '', courseName: data.courseName || '',
      teacherId: data.teacherId || Storage.getAll('users').find((u) => u.role === 'teacher')?.id || null,
      leaderId: data.leaderId, memberIds: data.memberIds || [],
      deadline: data.deadline, status: data.status || 'planning',
    });
    if (!project) return null; // storage write failed (e.g. quota) — caller should show an error
    (project.memberIds || []).forEach((uid) => {
      if (uid !== project.leaderId) Notifications.push(uid, 'member_joined', `You were added to "${project.title}"`, project.id);
    });
    return project;
  },

  update(id, changes) { return Storage.update('projects', id, changes); },

  archive(id) { return this.update(id, { status: 'completed', archived: true }); },

  remove(id) {
    Storage.remove('projects', id);
    Storage.getAll('tasks').filter((t) => t.projectId === id).forEach((t) => Storage.remove('tasks', t.id));
    Storage.getAll('feedback').filter((f) => f.projectId === id).forEach((f) => Storage.remove('feedback', f.id));
  },

  /** Fill a <select> with projects visible to the current user. */
  populateSelect(selectEl, { includeAllOption = false, selected = '' } = {}) {
    if (!selectEl) return;
    const user = Auth.currentUser();
    const projects = this.forUser(user);
    const options = projects.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.title)}</option>`).join('');
    selectEl.innerHTML = (includeAllOption ? selectEl.querySelector('option')?.outerHTML || '' : '') + options;
    if (selected) selectEl.value = selected;
  },
};

/* ---------------------------------------------------------------------- */
/* Projects list page                                                     */
/* ---------------------------------------------------------------------- */
function initProjectsPage() {
  const user = Auth.currentUser();
  if (!user) return;

  const grid = document.getElementById('projectGrid');
  const emptyState = document.getElementById('projectsEmptyState');
  const searchInput = document.getElementById('projectSearchInput');
  const statusFilter = document.getElementById('statusFilter');
  const sortSelect = document.getElementById('sortSelect');

  function renderList() {
    let list = Projects.forUser(user);

    const q = (searchInput.value || '').toLowerCase().trim();
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));

    if (statusFilter.value) list = list.filter((p) => p.status === statusFilter.value);

    if (sortSelect.value === 'deadline') list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    else if (sortSelect.value === 'progress') list.sort((a, b) => Projects.progressOf(b.id) - Projects.progressOf(a.id));
    else list.sort((a, b) => a.title.localeCompare(b.title));

    grid.innerHTML = '';
    emptyState.hidden = list.length > 0;
    if (list.length === 0) {
      document.getElementById('projectsEmptyText').textContent = user.role === 'leader'
        ? 'Create your first project to get started.'
        : "You're not part of any projects yet.";
      return;
    }

    list.forEach((p) => grid.appendChild(renderProjectCard(p)));
  }

  [searchInput, statusFilter, sortSelect].forEach((el) => el.addEventListener('input', renderList));

  const modal = document.getElementById('createProjectModal');
  const form = document.getElementById('createProjectForm');
  const heading = document.getElementById('projectModalHeading');
  const editingId = document.getElementById('editingProjectId');

  function openCreateModal(project = null) {
    populateMembersSelect();
    if (project) {
      heading.textContent = 'Edit Project';
      editingId.value = project.id;
      document.getElementById('projTitle').value = project.title;
      document.getElementById('projDescription').value = project.description || '';
      document.getElementById('projCourse').value = project.courseName || '';
      document.getElementById('projStatus').value = project.status;
      document.getElementById('projDeadline').value = project.deadline || '';
      Array.from(document.getElementById('projMembers').options).forEach((opt) => {
        opt.selected = (project.memberIds || []).includes(opt.value);
      });
    } else {
      heading.textContent = 'Create New Project';
      editingId.value = '';
      form.reset();
    }
    modal.hidden = false;
  }

  function populateMembersSelect() {
    const sel = document.getElementById('projMembers');
    const members = Storage.getAll('users').filter((u) => u.role === 'member');
    sel.innerHTML = members.map((m) => `<option value="${m.id}">${Utils.escapeHtml(Utils.memberOptionLabel(m))}</option>`).join('');
  }

  document.getElementById('openCreateProjectBtn')?.addEventListener('click', () => openCreateModal());
  document.getElementById('emptyCreateProjectBtn')?.addEventListener('click', () => openCreateModal());
  wireModalClose('createProjectModal');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const memberIds = Array.from(document.getElementById('projMembers').selectedOptions).map((o) => o.value);
    if (!memberIds.includes(user.id) && user.role === 'leader') memberIds.push(user.id);

    const data = {
      title: document.getElementById('projTitle').value.trim(),
      description: document.getElementById('projDescription').value.trim(),
      courseName: document.getElementById('projCourse').value.trim(),
      status: document.getElementById('projStatus').value,
      deadline: document.getElementById('projDeadline').value,
      leaderId: user.id,
      memberIds,
    };

    if (editingId.value) {
      const updated = Projects.update(editingId.value, data);
      if (!updated) { Utils.toast('Could not save changes — your browser storage may be full.', 'error'); return; }
      Utils.toast('Project updated.');
    } else {
      const created = Projects.create(data);
      if (!created) { Utils.toast('Could not save the project — your browser storage may be full.', 'error'); return; }
      Utils.toast('Project created.');
    }
    modal.hidden = true;
    renderList();
  });

  grid.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-project]');
    if (editBtn) {
      e.stopPropagation();
      openCreateModal(Projects.byId(editBtn.getAttribute('data-edit-project')));
      return;
    }
    const card = e.target.closest('.project-card');
    if (card) window.location.href = `project-details.html?id=${card.getAttribute('data-id')}`;
  });

  renderList();
}

function renderProjectCard(p) {
  const progress = Projects.progressOf(p.id);
  const members = Projects.membersOf(p);
  const el = document.createElement('article');
  el.className = 'glass-card project-card';
  el.setAttribute('data-id', p.id);
  el.setAttribute('data-status', p.status);
  el.innerHTML = `
    <div class="project-card-top">
      <span class="badge" data-status="${p.status}">${Projects.STATUS_LABELS[p.status] || p.status}</span>
      ${Auth.currentUser().role === 'leader' ? `<button class="icon-btn" data-edit-project="${p.id}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>` : ''}
    </div>
    <h3>${Utils.escapeHtml(p.title)}</h3>
    <p>${Utils.escapeHtml((p.description || '').slice(0, 90))}${(p.description || '').length > 90 ? '…' : ''}</p>
    <div class="progress-bar"><div class="progress-fill ${Utils.progressColorClass(progress)}" style="width:${progress}%"></div></div>
    <div class="project-card-footer">
      <div class="avatar-stack">
        ${members.slice(0, 4).map((m) => avatarChip(m)).join('')}
      </div>
      <span class="text-muted"><i class="fa-solid fa-calendar"></i> ${Utils.formatDate(p.deadline)}</span>
    </div>
  `;
  return el;
}

function avatarChip(user) {
  if (user.avatar) return `<img src="${user.avatar}" alt="${Utils.escapeHtml(user.fullName)}" title="${Utils.escapeHtml(user.fullName)}" />`;
  return `<span class="avatar-fallback" style="background:${Utils.colorFromString(user.fullName)}" title="${Utils.escapeHtml(user.fullName)}">${Utils.initials(user.fullName)}</span>`;
}

function wireModalClose(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => { modal.hidden = true; }));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
}

/* ---------------------------------------------------------------------- */
/* Notes (private + shared) — Optional feature, scoped to a project        */
/* ---------------------------------------------------------------------- */
const Notes = {
  all() { return Storage.getAll('notes'); },

  forProject(projectId, visibility, userId) {
    return this.all()
      .filter((n) => n.projectId === projectId && n.visibility === visibility && (visibility === 'shared' || n.userId === userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  create(projectId, userId, text, visibility) {
    return Storage.save('notes', { projectId, userId, text, visibility });
  },
};

/* ---------------------------------------------------------------------- */
/* Project details page                                                   */
/* ---------------------------------------------------------------------- */
function initProjectDetailsPage() {
  const user = Auth.currentUser();
  const id = Utils.getQueryParam('id');
  const project = id ? Projects.byId(id) : null;

  if (!project) {
    document.getElementById('projectDetailsTitle').textContent = 'Project not found';
    document.getElementById('projectDetailsDescription').textContent = 'It may have been deleted, or the link is incorrect.';
    return;
  }

  renderProjectHeader(project);
  wireTabs();
  renderOverviewTab(project);
  renderTasksTab(project);
  renderMembersTab(project);
  renderFeedbackTab(project);
  renderActivityTab(project);
  wireProjectActions(project, user);
  wireNotesTab(project, user);
}

function wireNotesTab(project, user) {
  let visibility = 'shared';

  function render() {
    const notes = Notes.forProject(project.id, visibility, user.id);
    document.getElementById('notesList').innerHTML = notes.map((n) => `
      <div class="glass-card feedback-item">
        <div class="feedback-item-header">
          <strong>${Utils.escapeHtml(Storage.getById('users', n.userId)?.fullName || 'You')}</strong>
          <span class="text-muted">${Utils.formatDateTime(n.createdAt)}</span>
        </div>
        <p>${Utils.escapeHtml(n.text)}</p>
      </div>
    `).join('') || `<p class="text-muted">No ${visibility} notes yet.</p>`;
  }

  document.getElementById('viewSharedNotesBtn').addEventListener('click', (e) => {
    visibility = 'shared';
    e.target.classList.add('active');
    document.getElementById('viewPrivateNotesBtn').classList.remove('active');
    render();
  });
  document.getElementById('viewPrivateNotesBtn').addEventListener('click', (e) => {
    visibility = 'private';
    e.target.classList.add('active');
    document.getElementById('viewSharedNotesBtn').classList.remove('active');
    render();
  });

  document.getElementById('addNoteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newNoteText');
    if (!input.value.trim()) return;
    Notes.create(project.id, user.id, input.value.trim(), visibility);
    input.value = '';
    render();
  });

  render();
}

function renderProjectHeader(project) {
  const progress = Projects.progressOf(project.id);
  document.getElementById('projectStatusBadge').textContent = Projects.STATUS_LABELS[project.status] || project.status;
  document.getElementById('projectStatusBadge').setAttribute('data-status', project.status);
  document.getElementById('projectDetailsTitle').textContent = project.title;
  document.getElementById('projectDetailsDescription').textContent = project.description || 'No description yet.';
  document.getElementById('projectDetailsDeadline').textContent = Utils.formatDate(project.deadline);
  document.getElementById('projectDetailsCourse').textContent = project.courseName || '—';
  const teacher = Storage.getById('users', project.teacherId);
  document.getElementById('projectDetailsTeacher').textContent = teacher ? teacher.fullName : '—';

  const ring = document.getElementById('projectProgressRing');
  ring.style.setProperty('--progress', progress);
  document.getElementById('projectProgressValue').textContent = `${progress}%`;

  const avatarsWrap = document.getElementById('projectMemberAvatars');
  avatarsWrap.innerHTML = Projects.membersOf(project).map((m) => avatarChip(m)).join('');
}

function wireTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((btn) => btn.addEventListener('click', () => {
    tabs.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
    document.getElementById(`tab-${btn.getAttribute('data-tab')}`).hidden = false;
  }));
}

function renderOverviewTab(project) {
  const timeline = document.getElementById('projectTimeline');
  const milestones = [
    { label: 'Project created', date: project.createdAt },
    { label: 'Deadline', date: project.deadline },
  ];
  timeline.innerHTML = milestones.map((m) => `<li><strong>${m.label}</strong> — ${Utils.formatDate(m.date)}</li>`).join('');

  const tasks = Projects.tasksOf(project.id);
  const counts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });

  if (window.Chart && document.getElementById('projectStatusChart')) {
    Charts.doughnut('projectStatusChart', ['To Do', 'In Progress', 'Review', 'Done'],
      [counts.todo, counts.in_progress, counts.review, counts.done]);
  }
}

function renderTasksTab(project) {
  const tbody = document.querySelector('#projectTasksTable tbody');
  const tasks = Projects.tasksOf(project.id);
  tbody.innerHTML = tasks.map((t) => `
    <tr>
      <td>${Utils.escapeHtml(t.title)}</td>
      <td>${assigneeNames(t)}</td>
      <td><span class="badge badge-priority-${t.priority}">${t.priority}</span></td>
      <td><span class="badge" data-status="${t.status}">${Tasks.STATUS_LABELS[t.status]}</span></td>
      <td><div class="progress-bar" style="width:80px"><div class="progress-fill ${Utils.progressColorClass(t.progress)}" style="width:${t.progress}%"></div></div></td>
      <td>${Utils.formatDate(t.dueDate)}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-muted">No tasks yet.</td></tr>`;
}

function assigneeNames(task) {
  return (task.assigneeIds || []).map((id) => Storage.getById('users', id)?.fullName).filter(Boolean).join(', ') || '—';
}

function renderMembersTab(project) {
  const grid = document.getElementById('projectMembersGrid');
  const members = Projects.membersOf(project);
  grid.innerHTML = members.map((m) => `
    <div class="glass-card member-card">
      <img src="${m.avatar || Auth.avatarFallback(m)}" alt="" class="avatar-lg" />
      <strong>${Utils.escapeHtml(m.fullName)}</strong>
      <span class="text-muted">${m.id === project.leaderId ? 'Team Leader' : 'Member'}</span>
    </div>
  `).join('') || `<p class="text-muted">No members yet.</p>`;
}

function renderFeedbackTab(project) {
  const wrap = document.getElementById('projectFeedbackTimeline');
  wrap.innerHTML = Feedback.renderTimeline(Feedback.forProject(project.id));
}

function renderActivityTab(project) {
  const list = document.getElementById('projectActivityLog');
  const tasks = Projects.tasksOf(project.id);
  const entries = [];
  tasks.forEach((t) => (t.history || []).forEach((h) => entries.push({ ...h, taskTitle: t.title })));
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = entries.map((h) => `
    <li><i class="fa-solid fa-clock-rotate-left"></i>
      <div><strong>${Storage.getById('users', h.userId)?.fullName || 'Someone'}</strong> — ${Utils.escapeHtml(h.change)} on "${Utils.escapeHtml(h.taskTitle)}"
      <span class="notif-time">${Utils.formatDateTime(h.date)}</span></div>
    </li>
  `).join('') || `<li class="text-muted">No activity recorded yet.</li>`;
}

function wireProjectActions(project, user) {
  document.getElementById('editProjectBtn')?.addEventListener('click', () => {
    window.location.href = `projects.html?edit=${project.id}`;
  });
  document.getElementById('archiveProjectBtn')?.addEventListener('click', async () => {
    if (await Utils.confirm('Archive this project?', 'It will be marked completed and archived.')) {
      Projects.archive(project.id);
      Utils.toast('Project archived.');
      renderProjectHeader(Projects.byId(project.id));
    }
  });
  document.getElementById('deleteProjectBtn')?.addEventListener('click', async () => {
    if (await Utils.confirm('Delete this project?', 'This removes all its tasks and feedback permanently.', 'Delete')) {
      Projects.remove(project.id);
      Utils.toast('Project deleted.');
      window.location.href = 'projects.html';
    }
  });
}
