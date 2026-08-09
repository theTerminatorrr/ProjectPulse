/* ==========================================================================
   ProjectPulse — admin.js
   Platform-wide administration: manage all users, all projects, and post
   global announcements. Optional/bonus scope per the SRS, restricted to
   the "admin" role (pre-seeded demo account, not self-registrable — same
   reasoning as Teacher accounts, see docs/PROJECT_REPORT.md).
   ========================================================================== */

const Admin = {
  /** A user can be deleted only if they're not a Teacher/Admin and don't lead a project
   *  (deleting a project leader would orphan the project — reassign or delete the
   *  project first). This keeps cascade logic simple and non-destructive by default. */
  canDelete(user) {
    if (user.role === 'teacher' || user.role === 'admin') return false;
    const leadsAProject = Projects.all().some((p) => p.leaderId === user.id);
    return !leadsAProject;
  },

  toggleSuspend(userId) {
    const user = Storage.getById('users', userId);
    if (!user) return;
    Storage.update('users', userId, { suspended: !user.suspended });
  },

  deleteUser(userId) {
    // Referential integrity: strip the user from every project's member list and
    // unassign them from any tasks before removing the account itself.
    Projects.all().forEach((p) => {
      if ((p.memberIds || []).includes(userId)) {
        Projects.update(p.id, { memberIds: p.memberIds.filter((id) => id !== userId) });
      }
    });
    Tasks.all().forEach((t) => {
      if ((t.assigneeIds || []).includes(userId)) {
        Tasks.update(t.id, { assigneeIds: t.assigneeIds.filter((id) => id !== userId) }, 'Unassigned — account removed by admin');
      }
    });
    Storage.remove('users', userId);
    Storage.runIntegrityCheck();
  },

  platformStats() {
    const users = Storage.getAll('users');
    const projects = Projects.all();
    const tasks = Tasks.all();
    const completed = tasks.filter((t) => t.status === 'done').length;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    return { userCount: users.length, projectCount: projects.length, taskCount: tasks.length, completionRate };
  },
};

function initAdminPage() {
  const admin = Auth.currentUser();
  if (!admin || admin.role !== 'admin') return;

  renderStats();
  wireTabs();
  renderUsersTable();
  renderProjectsTable();
  renderAnnouncements();
  wireGlobalAnnouncement();

  document.getElementById('adminUserSearch').addEventListener('input', renderUsersTable);
  document.getElementById('adminRoleFilter').addEventListener('input', renderUsersTable);

  document.getElementById('adminUsersTable').addEventListener('click', async (e) => {
    const suspendBtn = e.target.closest('[data-suspend-user]');
    if (suspendBtn) {
      Admin.toggleSuspend(suspendBtn.getAttribute('data-suspend-user'));
      renderUsersTable();
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-user]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-user');
      const user = Storage.getById('users', id);
      if (await Utils.confirm('Delete this account?', `"${user.fullName}" will be removed and unassigned from all tasks/projects.`, 'Delete')) {
        Admin.deleteUser(id);
        Utils.toast('Account deleted.');
        renderUsersTable();
        renderStats();
      }
    }
  });

  document.getElementById('adminProjectsTable').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-delete-project]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-project');
      const project = Projects.byId(id);
      if (await Utils.confirm('Delete this project?', `"${project.title}" and all its tasks/feedback will be removed.`, 'Delete')) {
        Projects.remove(id);
        Utils.toast('Project deleted.');
        renderProjectsTable();
        renderStats();
      }
    }
  });
}

function renderStats() {
  const s = Admin.platformStats();
  document.getElementById('statTotalUsers').textContent = s.userCount;
  document.getElementById('statTotalProjectsAdmin').textContent = s.projectCount;
  document.getElementById('statTotalTasksAdmin').textContent = s.taskCount;
  document.getElementById('statCompletionRate').textContent = `${s.completionRate}%`;
}

function renderUsersTable() {
  const q = (document.getElementById('adminUserSearch').value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('adminRoleFilter').value;
  let users = Storage.getAll('users');
  if (q) users = users.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (roleFilter) users = users.filter((u) => u.role === roleFilter);

  document.querySelector('#adminUsersTable tbody').innerHTML = users.map((u) => `
    <tr>
      <td>${Utils.escapeHtml(u.fullName)}</td>
      <td>${Utils.escapeHtml(u.email)}</td>
      <td><span class="badge">${Auth.ROLE_LABELS[u.role] || u.role}</span></td>
      <td>${u.suspended ? '<span class="badge badge-danger">Suspended</span>' : '<span class="badge badge-success">Active</span>'}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-suspend-user="${u.id}">${u.suspended ? 'Unsuspend' : 'Suspend'}</button>
        ${Admin.canDelete(u) ? `<button class="btn btn-danger-outline btn-sm" data-delete-user="${u.id}">Delete</button>` : ''}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-muted">No users found.</td></tr>`;
}

function renderProjectsTable() {
  const projects = Projects.all();
  document.querySelector('#adminProjectsTable tbody').innerHTML = projects.map((p) => `
    <tr>
      <td>${Utils.escapeHtml(p.title)}</td>
      <td>${Utils.escapeHtml(Storage.getById('users', p.leaderId)?.fullName || '—')}</td>
      <td><span class="badge" data-status="${p.status}">${Projects.STATUS_LABELS[p.status] || p.status}</span></td>
      <td>${Utils.formatDate(p.deadline)}</td>
      <td>${(p.memberIds || []).length}</td>
      <td><button class="btn btn-danger-outline btn-sm" data-delete-project="${p.id}">Delete</button></td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="text-muted">No projects yet.</td></tr>`;
}

function renderAnnouncements() {
  const list = Announcements.all().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  document.getElementById('adminAnnouncementsList').innerHTML = list.map((a) => `
    <div class="glass-card feedback-item">
      <div class="feedback-item-header">
        <strong>${Utils.escapeHtml(a.title)}</strong>
        <span class="badge">${a.type}</span>
        <span class="text-muted">${a.projectId ? (Projects.byId(a.projectId)?.title || 'a project') : 'Everyone'}</span>
      </div>
      <p>${Utils.escapeHtml(a.message)}</p>
      <span class="text-muted" style="font-size:11px;">${Utils.formatDateTime(a.createdAt)}</span>
    </div>
  `).join('') || `<p class="text-muted">No announcements yet.</p>`;
}

function wireGlobalAnnouncement() {
  const modal = document.getElementById('globalAnnouncementModal');
  document.getElementById('openGlobalAnnouncementBtn').addEventListener('click', () => {
    document.getElementById('globalAnnouncementForm').reset();
    modal.hidden = false;
  });
  wireModalClose('globalAnnouncementModal');
  document.getElementById('globalAnnouncementForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Announcements.create({
      title: document.getElementById('gaTitle').value.trim(),
      message: document.getElementById('gaMessage').value.trim(),
      type: 'general',
      projectId: null,
    });
    Utils.toast('Announcement posted to everyone.');
    modal.hidden = true;
    renderAnnouncements();
  });
}
// Note: wireTabs() is shared from projects.js (already loaded on this page) —
// admin.html's tab markup uses the same .tab-btn/.tab-panel convention.
