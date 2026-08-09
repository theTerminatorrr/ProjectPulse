/* ==========================================================================
   ProjectPulse — notifications.js
   In-app notification center: bell icon, unread badge, dropdown list.
   Other modules call Notifications.push(...) whenever something notable
   happens (task assigned, feedback received, deadline approaching).

   Phase 5 addition: sweepDeadlines() scans the signed-in user's tasks for
   anything due within 2 days and pushes a one-time "deadline approaching"
   notification, so the feature works without a real server-side cron.
   ========================================================================== */

const Notifications = {
  ICONS: {
    task_assigned: 'fa-solid fa-list-check',
    feedback: 'fa-solid fa-comment-dots',
    deadline: 'fa-solid fa-triangle-exclamation',
    project_approved: 'fa-solid fa-circle-check',
    announcement: 'fa-solid fa-bullhorn',
    member_joined: 'fa-solid fa-user-plus',
  },

  push(userId, type, message, relatedId = null) {
    if (!userId) return;
    Storage.save('notifications', { userId, type, message, relatedId, read: false });
    if (Auth.currentUser()?.id === userId) this.render();
  },

  forUser(userId) {
    return Storage.getAll('notifications')
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markAllRead(userId) {
    Storage.getAll('notifications').forEach((n) => {
      if (n.userId === userId && !n.read) Storage.update('notifications', n.id, { read: true });
    });
  },

  clearAll(userId) {
    const remaining = Storage.getAll('notifications').filter((n) => n.userId !== userId);
    Storage.setAll('notifications', remaining);
  },

  /**
   * Push a "deadline approaching" notification for any of the user's tasks
   * due within 2 days, skipping tasks that already have one so refreshing
   * the page doesn't spam duplicates.
   */
  sweepDeadlines(user) {
    if (!user || typeof Tasks === 'undefined') return;
    const settings = window.AppSettings ? AppSettings.get() : { notifDeadline: true };
    if (!settings.notifDeadline) return;

    const existing = new Set(
      this.forUser(user.id).filter((n) => n.type === 'deadline').map((n) => n.relatedId)
    );
    const soonCutoff = new Date();
    soonCutoff.setDate(soonCutoff.getDate() + 2);

    Tasks.forUser(user).forEach((t) => {
      if (t.status === 'done' || !t.dueDate) return;
      if (existing.has(t.id)) return;
      const due = new Date(t.dueDate);
      if (due <= soonCutoff) {
        this.push(user.id, 'deadline', `"${t.title}" is due ${Utils.timeAgo(t.dueDate)}`, t.id);
      }
    });
  },

  render() {
    const user = Auth.currentUser();
    if (!user) return;
    const list = this.forUser(user.id);
    const unreadCount = list.filter((n) => !n.read).length;

    const countEl = document.getElementById('notifCount');
    if (countEl) {
      countEl.textContent = unreadCount;
      countEl.setAttribute('data-count', unreadCount);
    }

    const listEl = document.getElementById('notifList');
    if (!listEl) return;

    if (list.length === 0) {
      listEl.innerHTML = `<li style="justify-content:center; color:var(--text-body-muted);">You're all caught up.</li>`;
      return;
    }

    listEl.innerHTML = list.slice(0, 20).map((n) => `
      <li class="${n.read ? '' : 'unread'}">
        <i class="${this.ICONS[n.type] || 'fa-solid fa-bell'}"></i>
        <div>
          <span>${Utils.escapeHtml(n.message)}</span>
          <span class="notif-time">${Utils.timeAgo(n.createdAt) || Utils.formatDateTime(n.createdAt)}</span>
        </div>
      </li>
    `).join('');
  },

  init() {
    const user = Auth.currentUser();
    if (user) this.sweepDeadlines(user);
    this.render();

    const bell = document.getElementById('notifBell');
    const dropdown = document.getElementById('notifDropdown');
    const clearBtn = document.getElementById('clearAllNotifs');
    if (!bell || !dropdown) return;

    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = dropdown.hidden;
      closeAllDropdowns();
      dropdown.hidden = !willOpen;
      if (willOpen) {
        const u = Auth.currentUser();
        if (u) { this.markAllRead(u.id); this.render(); }
      }
    });

    if (clearBtn) clearBtn.addEventListener('click', () => {
      const u = Auth.currentUser();
      if (u) { this.clearAll(u.id); this.render(); }
    });

    document.addEventListener('click', () => { dropdown.hidden = true; });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
  },
};

function closeAllDropdowns() {
  document.querySelectorAll('.notif-dropdown, .profile-dropdown').forEach((el) => { el.hidden = true; });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('notifBell')) Notifications.init();
});
