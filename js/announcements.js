/* ==========================================================================
   ProjectPulse — announcements.js
   Teacher/project announcements (meetings, deadlines, presentations, exams)
   surfaced as a dashboard widget with unread-style highlighting.
   ========================================================================== */

const Announcements = {
  TYPE_ICONS: {
    meeting: 'fa-solid fa-people-arrows',
    deadline: 'fa-solid fa-hourglass-half',
    presentation: 'fa-solid fa-display',
    exam: 'fa-solid fa-file-pen',
    general: 'fa-solid fa-bullhorn',
  },

  all() { return Storage.getAll('announcements'); },

  /** Global announcements (projectId null) + announcements scoped to the user's own projects. */
  forUser(user) {
    if (!user) return [];
    const myProjectIds = new Set(Projects.forUser(user).map((p) => p.id));
    return this.all()
      .filter((a) => !a.projectId || myProjectIds.has(a.projectId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  create(data) {
    const ann = Storage.save('announcements', {
      authorId: Auth.currentUser().id, title: data.title, message: data.message,
      type: data.type || 'general', projectId: data.projectId || null,
    });
    if (!ann) return null; // storage write failed (e.g. quota)
    // Notify everyone who'd see it: project members, or every non-teacher user for a global post.
    const targets = ann.projectId
      ? Projects.byId(ann.projectId)?.memberIds || []
      : Storage.getAll('users').filter((u) => u.role !== 'teacher').map((u) => u.id);
    targets.forEach((uid) => Notifications.push(uid, 'announcement', `New announcement: ${ann.title}`, ann.id));
    return ann;
  },

  renderWidget(elId, user) {
    const el = document.getElementById(elId);
    if (!el) return;
    const list = this.forUser(user).slice(0, 5);
    el.innerHTML = list.map((a) => `
      <li>
        <i class="${this.TYPE_ICONS[a.type] || this.TYPE_ICONS.general}"></i>
        <div>
          <strong>${Utils.escapeHtml(a.title)}</strong>
          <div class="text-muted">${Utils.escapeHtml(a.message)}</div>
          <span class="notif-time">${Utils.timeAgo(a.createdAt) || Utils.formatDate(a.createdAt)}</span>
        </div>
      </li>
    `).join('') || `<li class="text-muted">No announcements yet.</li>`;
  },
};

/** Wired from dashboard.html — Teacher-only "New Announcement" trigger + modal.
 *  The dashboard renders a separate list per role panel (only one is visible
 *  at a time), so the widget id is derived from the signed-in user's role. */
function widgetIdForRole(role) {
  return `announcementsList${role.charAt(0).toUpperCase()}${role.slice(1)}`;
}

function initAnnouncementsWidget(user) {
  Announcements.renderWidget(widgetIdForRole(user.role), user);

  const modal = document.getElementById('createAnnouncementModal');
  if (!modal) return;

  Projects.populateSelect(document.getElementById('annProject'), { includeAllOption: true });

  document.getElementById('openAnnouncementBtn')?.addEventListener('click', () => {
    document.getElementById('createAnnouncementForm').reset();
    modal.hidden = false;
  });
  wireModalClose('createAnnouncementModal');

  document.getElementById('createAnnouncementForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Announcements.create({
      title: document.getElementById('annTitle').value.trim(),
      message: document.getElementById('annMessage').value.trim(),
      type: document.getElementById('annType').value,
      projectId: document.getElementById('annProject').value || null,
    });
    Utils.toast('Announcement posted.');
    modal.hidden = true;
    Announcements.renderWidget(widgetIdForRole(user.role), user);
  });
}
