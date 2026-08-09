/* ==========================================================================
   ProjectPulse — app.js
   Bootstraps chrome shared by every page (sidebar, dropdowns, dark mode)
   and dispatches to the right page-specific init function.
   ========================================================================== */

const AppSettings = {
  KEY: 'pt_settings',
  defaults: { darkMode: false, language: 'en', notifTaskAssigned: true, notifDeadline: true, notifFeedback: true },

  get() {
    try {
      return { ...this.defaults, ...JSON.parse(localStorage.getItem(this.KEY) || '{}') };
    } catch { return { ...this.defaults }; }
  },

  set(changes) {
    const next = { ...this.get(), ...changes };
    localStorage.setItem(this.KEY, JSON.stringify(next));
    return next;
  },

  applyDarkMode() {
    document.body.classList.toggle('dark-mode', this.get().darkMode);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  AppSettings.applyDarkMode();
  wireSidebarToggle();
  wireDropdowns();
  wireMobileLandingNav();
  if (window.AOS) AOS.init({ duration: 600, once: true, offset: 40 });

  const page = document.body.getAttribute('data-page');
  const initFnByPage = {
    dashboard: 'initDashboardPage',
    projects: 'initProjectsPage',
    'project-details': 'initProjectDetailsPage',
    tasks: 'initTasksPage',
    team: 'initTeamPage',
    feedback: 'initFeedbackPage',
    calendar: 'initCalendarPage',
    reports: 'initReportsPage',
    profile: 'initProfilePage',
    settings: 'initSettingsPage',
  };
  // Look up the init function by name (rather than referencing every page's
  // function directly in one object) since each page only loads the scripts
  // it needs — referencing an undefined function from an unloaded page's
  // script would throw and break the router for every page.
  const initFn = page && typeof window[initFnByPage[page]] === 'function' ? window[initFnByPage[page]] : null;
  if (initFn) {
    // Wait a tick so auth.js's requireAuth() (also on DOMContentLoaded) resolves first.
    setTimeout(() => { if (Auth.currentUser()) initFn(); }, 0);
  }
});

/* ---------------------------------------------------------------------- */
/* Shared chrome                                                          */
/* ---------------------------------------------------------------------- */
function wireSidebarToggle() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

function wireDropdowns() {
  const trigger = document.getElementById('profileTrigger');
  const dropdown = document.getElementById('profileDropdown');
  if (!trigger || !dropdown) return;
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = dropdown.hidden;
    closeAllDropdowns();
    dropdown.hidden = !willOpen;
  });
  document.addEventListener('click', () => { dropdown.hidden = true; });
  dropdown.addEventListener('click', (e) => e.stopPropagation());
}

function wireMobileLandingNav() {
  const toggle = document.getElementById('mobileNavToggle');
  const links = document.querySelector('.public-nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.display = open ? 'none' : 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '100%'; links.style.left = '0'; links.style.right = '0';
    links.style.background = 'rgba(8,28,58,0.97)';
    links.style.padding = '16px';
    toggle.setAttribute('aria-expanded', String(!open));
  });
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */
function initDashboardPage() {
  const user = Auth.currentUser();
  if (!user) return;

  document.getElementById('dashboardGreeting').textContent = `Welcome back, ${user.fullName.split(' ')[0]}`;
  document.getElementById('dashboardSubtitle').textContent = {
    teacher: "Here's how your students' projects are progressing.",
    leader: "Here's what's happening across your projects today.",
    member: "Here's what's on your plate today.",
  }[user.role];

  document.querySelectorAll('[data-role-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-role-panel') !== user.role;
  });

  if (user.role === 'teacher') renderTeacherDashboard(user);
  else if (user.role === 'leader') renderLeaderDashboard(user);
  else renderMemberDashboard(user);

  if (typeof initAnnouncementsWidget === 'function') initAnnouncementsWidget(user);

  // Quick create project (Leader)
  const modal = document.getElementById('createProjectModal');
  if (modal) {
    document.getElementById('quickCreateBtn')?.addEventListener('click', () => {
      const sel = document.getElementById('projMembers');
      const members = Storage.getAll('users').filter((u) => u.role === 'member');
      sel.innerHTML = members.map((m) => `<option value="${m.id}">${Utils.escapeHtml(Utils.memberOptionLabel(m))}</option>`).join('');
      modal.hidden = false;
    });
    wireModalClose('createProjectModal');
    document.getElementById('createProjectForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const memberIds = Array.from(document.getElementById('projMembers').selectedOptions).map((o) => o.value);
      if (!memberIds.includes(user.id)) memberIds.push(user.id);
      const created = Projects.create({
        title: document.getElementById('projTitle').value.trim(),
        description: document.getElementById('projDescription').value.trim(),
        courseName: document.getElementById('projCourse').value.trim(),
        deadline: document.getElementById('projDeadline').value,
        status: 'planning',
        leaderId: user.id,
        memberIds,
      });
      if (!created) {
        Utils.toast('Could not save the project — your browser storage may be full. See Settings for options.', 'error');
        return;
      }
      Utils.toast('Project created.');
      modal.hidden = true;
      window.location.href = 'projects.html';
    });
  }
}

function renderTeacherDashboard(user) {
  const projects = Projects.forUser(user);
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));
  const feedback = Feedback.forUser(user);
  const students = new Set(projects.flatMap((p) => p.memberIds || []));

  document.getElementById('statTotalProjects').textContent = projects.length;
  document.getElementById('statActiveProjects').textContent = projects.filter((p) => p.status !== 'completed').length;
  document.getElementById('statPendingReviews').textContent = feedback.filter((f) => !f.resolved).length;
  document.getElementById('statStudentCount').textContent = students.size;

  document.getElementById('feedbackQueueList').innerHTML = feedback.filter((f) => !f.resolved).slice(0, 6).map((f) => `
    <li><i class="fa-solid fa-comment-dots"></i> <div>${Utils.escapeHtml(Projects.byId(f.projectId)?.title || '')}<div class="text-muted">${Utils.escapeHtml(f.message.slice(0, 60))}…</div></div></li>
  `).join('') || `<li class="text-muted">Nothing pending.</li>`;

  renderRecentActivity('teacherActivityList', tasks);
  renderTeacherCharts(user);
}

function renderLeaderDashboard(user) {
  const projects = Projects.forUser(user);
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));

  document.getElementById('statMyProjects').textContent = projects.length;
  document.getElementById('statMyTasks').textContent = tasks.length;
  document.getElementById('statCompletedTasks').textContent = tasks.filter((t) => t.status === 'done').length;
  document.getElementById('statPendingTasks').textContent = tasks.filter((t) => t.status !== 'done').length;

  const upcoming = tasks.filter((t) => t.status !== 'done' && t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 6);
  document.getElementById('leaderDeadlinesList').innerHTML = upcoming.map((t) => `
    <li><i class="fa-solid fa-calendar"></i> <div>${Utils.escapeHtml(t.title)}<div class="text-muted">${Utils.formatDate(t.dueDate)} · ${Utils.timeAgo(t.dueDate)}</div></div></li>
  `).join('') || `<li class="text-muted">No upcoming deadlines.</li>`;

  renderRecentActivity('leaderActivityList', tasks);
  renderLeaderCharts(user);
}

function renderMemberDashboard(user) {
  const tasks = Tasks.forUser(user);
  document.getElementById('statAssignedTasks').textContent = tasks.length;
  document.getElementById('statMemberCompleted').textContent = tasks.filter((t) => t.status === 'done').length;
  document.getElementById('statMemberPending').textContent = tasks.filter((t) => t.status !== 'done').length;
  document.getElementById('statMemberOverdue').textContent = tasks.filter((t) => Utils.isOverdue(t.dueDate) && t.status !== 'done').length;

  const fb = Feedback.forUser(user).slice(0, 6);
  document.getElementById('memberFeedbackList').innerHTML = fb.map((f) => `
    <li><i class="fa-solid fa-comment-dots"></i> <div>${Utils.escapeHtml(f.message.slice(0, 60))}…<div class="text-muted">${Utils.formatDate(f.createdAt)}</div></div></li>
  `).join('') || `<li class="text-muted">No feedback yet.</li>`;

  const upcoming = tasks.filter((t) => t.status !== 'done' && t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 6);
  document.getElementById('memberDeadlinesList').innerHTML = upcoming.map((t) => `
    <li><i class="fa-solid fa-calendar"></i> <div>${Utils.escapeHtml(t.title)}<div class="text-muted">${Utils.formatDate(t.dueDate)} · ${Utils.timeAgo(t.dueDate)}</div></div></li>
  `).join('') || `<li class="text-muted">Nothing due soon.</li>`;

  renderMemberCharts(user);
}

function renderRecentActivity(elId, tasks) {
  const entries = [];
  tasks.forEach((t) => (t.history || []).forEach((h) => entries.push({ ...h, taskTitle: t.title })));
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById(elId).innerHTML = entries.slice(0, 8).map((h) => `
    <li><i class="fa-solid fa-clock-rotate-left"></i> <div>${Utils.escapeHtml(Storage.getById('users', h.userId)?.fullName || 'Someone')} — ${Utils.escapeHtml(h.change)} <span class="notif-time">on "${Utils.escapeHtml(h.taskTitle)}"</span></div></li>
  `).join('') || `<li class="text-muted">No recent activity.</li>`;
}

/* ---------------------------------------------------------------------- */
/* Profile page                                                           */
/* ---------------------------------------------------------------------- */
function initProfilePage() {
  const user = Auth.currentUser();
  if (!user) return;

  document.getElementById('profileAvatarPreview').src = user.avatar || Auth.avatarFallback(user);
  document.getElementById('profileCardName').textContent = user.fullName;
  document.getElementById('profileCardRole').textContent = Auth.ROLE_LABELS[user.role];
  document.getElementById('profileCardEmail').textContent = user.email;

  const myProjects = Projects.forUser(user);
  document.getElementById('profileStatProjects').textContent = myProjects.length;
  document.getElementById('profileStatTasks').textContent = Tasks.forUser(user).length;

  document.getElementById('profileFullName').value = user.fullName;
  document.getElementById('profileStudentId').value = user.studentId || '';
  document.getElementById('profileEmail').value = user.email;
  document.getElementById('profileDepartment').value = user.department || '';
  document.getElementById('profileSemester').value = user.semester || '';
  document.getElementById('profileBio').value = user.bio || '';

  document.getElementById('avatarUploadInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Base64-encoding inflates size by ~33%, and this one field has to fit
    // alongside every other user/project/task record in the same ~5-10MB
    // localStorage quota — a multi-MB phone photo can silently fail to save
    // (and previously did fail silently: the preview updated from the file
    // reader's in-memory result even when the write to storage was rejected,
    // so the photo looked "saved" but reverted on the next load). Cap the
    // source file well below the quota so this can't happen from normal use.
    const MAX_AVATAR_BYTES = 800 * 1024; // 800KB
    if (file.size > MAX_AVATAR_BYTES) {
      Utils.toast(`That image is too large (${Math.round(file.size / 1024)}KB). Please choose one under 800KB.`, 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const updated = Storage.update('users', user.id, { avatar: reader.result });
      if (!updated) {
        Utils.toast('Could not save your photo — your browser storage may be full. Try a smaller image or free up space in Settings.', 'error');
        e.target.value = '';
        return;
      }
      document.getElementById('profileAvatarPreview').src = reader.result;
      document.getElementById('topbarAvatar').src = reader.result;
      Utils.toast('Photo updated.');
    };
    reader.onerror = () => Utils.toast('Could not read that image file.', 'error');
    reader.readAsDataURL(file);
  });

  document.getElementById('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Storage.update('users', user.id, {
      fullName: document.getElementById('profileFullName').value.trim(),
      studentId: document.getElementById('profileStudentId').value.trim(),
      email: document.getElementById('profileEmail').value.trim(),
      department: document.getElementById('profileDepartment').value.trim(),
      semester: document.getElementById('profileSemester').value.trim(),
      bio: document.getElementById('profileBio').value.trim(),
    });
    document.getElementById('topbarUserName').textContent = document.getElementById('profileFullName').value.trim();
    document.getElementById('profileCardName').textContent = document.getElementById('profileFullName').value.trim();
    Utils.toast('Profile updated.');
  });

  document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const current = document.getElementById('currentPassword').value;
    const next = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmNewPassword').value;
    if (btoa(current) !== user.password) { Utils.toast('Current password is incorrect.', 'error'); return; }
    if (next !== confirm) { Utils.toast('New passwords do not match.', 'error'); return; }
    if (next.length < 6) { Utils.toast('Use at least 6 characters.', 'error'); return; }
    Storage.update('users', user.id, { password: btoa(next) });
    Utils.toast('Password updated.');
    e.target.reset();
  });
}

/* ---------------------------------------------------------------------- */
/* Settings page                                                          */
/* ---------------------------------------------------------------------- */
function initSettingsPage() {
  const settings = AppSettings.get();
  document.getElementById('darkModeToggle').checked = settings.darkMode;
  document.getElementById('languageSelect').value = settings.language;
  document.getElementById('notifTaskAssigned').checked = settings.notifTaskAssigned;
  document.getElementById('notifDeadline').checked = settings.notifDeadline;
  document.getElementById('notifFeedback').checked = settings.notifFeedback;

  document.getElementById('darkModeToggle').addEventListener('change', (e) => {
    AppSettings.set({ darkMode: e.target.checked });
    AppSettings.applyDarkMode();
  });
  document.getElementById('languageSelect').addEventListener('change', (e) => {
    AppSettings.set({ language: e.target.value });
    Utils.toast('Language preference saved (interface stays in English for this demo).', 'info');
  });
  ['notifTaskAssigned', 'notifDeadline', 'notifFeedback'].forEach((id) => {
    document.getElementById(id).addEventListener('change', (e) => AppSettings.set({ [id]: e.target.checked }));
  });

  document.getElementById('settingsExportBtn').addEventListener('click', () => {
    downloadJson(Storage.exportAll(), `projectpulse-export-${new Date().toISOString().slice(0, 10)}.json`);
    Utils.toast('Data exported.');
  });

  document.getElementById('settingsImportInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Storage.importAll(JSON.parse(reader.result));
        Utils.toast('Data imported. Reloading…');
        setTimeout(() => window.location.reload(), 800);
      } catch {
        Utils.toast('That file could not be read as valid export JSON.', 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('resetDataBtn').addEventListener('click', async () => {
    if (await Utils.confirm('Reset all demo data?', 'This clears everything and reseeds sample data. This cannot be undone.', 'Reset')) {
      Seed.reset();
      Utils.toast('Data reset.');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
    }
  });
}
