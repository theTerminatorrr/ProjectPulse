/* ==========================================================================
   ProjectPulse — feedback.js
   Teacher feedback: create, categorize, prioritize, rate, reply, resolve.
   Rendering is shared between feedback.html and the project-details.html tab.
   ========================================================================== */

const Feedback = {
  CATEGORY_LABELS: { general: 'General', ui: 'UI', backend: 'Backend', documentation: 'Documentation', presentation: 'Presentation' },
  PRIORITY_LABELS: { normal: 'Normal', important: 'Important', critical: 'Critical' },

  all() { return Storage.getAll('feedback'); },
  byId(id) { return Storage.getById('feedback', id); },
  forProject(projectId) { return this.all().filter((f) => f.projectId === projectId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },

  forUser(user) {
    if (!user) return [];
    if (user.role === 'teacher') return this.all().filter((f) => f.teacherId === user.id);
    const myProjectIds = Projects.forUser(user).map((p) => p.id);
    return this.all().filter((f) => myProjectIds.includes(f.projectId));
  },

  create(data) {
    const project = Projects.byId(data.projectId);
    const fb = Storage.save('feedback', {
      projectId: data.projectId, taskId: data.taskId || null, teacherId: Auth.currentUser().id,
      message: data.message, category: data.category, priority: data.priority,
      rating: data.rating || 0, resolved: false, replies: [],
    });
    if (project) {
      (project.memberIds || []).forEach((uid) => Notifications.push(uid, 'feedback', `New feedback on "${project.title}"`, fb.id));
    }
    return fb;
  },

  reply(feedbackId, text) {
    const fb = this.byId(feedbackId);
    const replies = [...(fb.replies || []), { userId: Auth.currentUser().id, text, date: new Date().toISOString() }];
    Storage.update('feedback', feedbackId, { replies });
    if (Auth.currentUser().id !== fb.teacherId) {
      Notifications.push(fb.teacherId, 'feedback', 'New reply to your feedback', feedbackId);
    }
  },

  toggleResolved(feedbackId) {
    const fb = this.byId(feedbackId);
    Storage.update('feedback', feedbackId, { resolved: !fb.resolved });
  },

  renderTimeline(list) {
    if (list.length === 0) return `<p class="text-muted">No feedback yet.</p>`;
    return list.map((f) => this.itemHtml(f)).join('');
  },

  itemHtml(f) {
    const project = Projects.byId(f.projectId);
    const task = f.taskId ? Tasks.byId(f.taskId) : null;
    const teacher = Storage.getById('users', f.teacherId);
    const user = Auth.currentUser();
    const canResolve = user.role === 'teacher';
    return `
      <div class="glass-card feedback-item priority-${f.priority} ${f.resolved ? 'resolved' : ''}" data-feedback-id="${f.id}">
        <div class="feedback-item-header">
          <strong>${Utils.escapeHtml(teacher?.fullName || 'Teacher')}</strong>
          <span class="badge">${this.CATEGORY_LABELS[f.category]}</span>
          <span class="badge badge-priority-${f.priority === 'critical' ? 'high' : f.priority === 'important' ? 'medium' : 'low'}">${this.PRIORITY_LABELS[f.priority]}</span>
          ${f.resolved ? '<span class="badge badge-success">Resolved</span>' : ''}
          <span class="text-muted">${project?.title || ''}${task ? ' · ' + task.title : ''}</span>
        </div>
        ${f.rating ? `<div class="feedback-stars">${'<i class="fa-solid fa-star"></i>'.repeat(f.rating)}${'<i class="fa-regular fa-star"></i>'.repeat(5 - f.rating)}</div>` : ''}
        <p>${Utils.escapeHtml(f.message)}</p>
        <span class="text-muted" style="font-size:11px;">${Utils.formatDateTime(f.createdAt)}</span>
        <div class="feedback-replies">
          ${(f.replies || []).map((r) => `<div><strong>${Utils.escapeHtml(Storage.getById('users', r.userId)?.fullName || 'User')}:</strong> ${Utils.escapeHtml(r.text)}</div>`).join('')}
        </div>
        <div class="inline-add-row">
          <input type="text" placeholder="Write a reply..." data-reply-input="${f.id}" />
          <button class="btn btn-outline btn-sm" data-reply-btn="${f.id}"><i class="fa-solid fa-paper-plane"></i></button>
          ${canResolve ? `<button class="btn ${f.resolved ? 'btn-outline' : 'btn-primary'} btn-sm" data-resolve-btn="${f.id}">${f.resolved ? 'Reopen' : 'Resolve'}</button>` : ''}
        </div>
      </div>
    `;
  },
};

/* ---------------------------------------------------------------------- */
/* Feedback page                                                          */
/* ---------------------------------------------------------------------- */
function initFeedbackPage() {
  const user = Auth.currentUser();
  if (!user) return;

  Projects.populateSelect(document.getElementById('feedbackProjectFilter'), { includeAllOption: true });

  const wrap = document.getElementById('feedbackTimelineFull');
  const emptyState = document.getElementById('feedbackEmptyState');

  function render() {
    let list = Feedback.forUser(user);
    const q = (document.getElementById('feedbackSearchInput').value || '').toLowerCase().trim();
    if (q) list = list.filter((f) => f.message.toLowerCase().includes(q));
    const proj = document.getElementById('feedbackProjectFilter').value;
    if (proj) list = list.filter((f) => f.projectId === proj);
    const cat = document.getElementById('feedbackCategoryFilter').value;
    if (cat) list = list.filter((f) => f.category === cat);
    const pri = document.getElementById('feedbackPriorityFilter').value;
    if (pri) list = list.filter((f) => f.priority === pri);
    const status = document.getElementById('feedbackStatusFilter').value;
    if (status === 'open') list = list.filter((f) => !f.resolved);
    if (status === 'resolved') list = list.filter((f) => f.resolved);

    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    emptyState.hidden = list.length > 0;
    document.getElementById('feedbackEmptyText').textContent = user.role === 'teacher'
      ? 'Create feedback for a project to get started.'
      : 'Feedback from your teacher will show up here.';
    wrap.innerHTML = Feedback.renderTimeline(list);
  }

  ['feedbackSearchInput', 'feedbackProjectFilter', 'feedbackCategoryFilter', 'feedbackPriorityFilter', 'feedbackStatusFilter']
    .forEach((id) => document.getElementById(id).addEventListener('input', render));

  wireFeedbackTimelineEvents(wrap, render);

  // Create feedback modal
  const modal = document.getElementById('createFeedbackModal');
  document.getElementById('openCreateFeedbackBtn')?.addEventListener('click', () => {
    Projects.populateSelect(document.getElementById('fbProject'));
    populateTaskOptions(document.getElementById('fbProject').value);
    document.getElementById('createFeedbackForm').reset();
    resetStars();
    modal.hidden = false;
  });
  wireModalClose('createFeedbackModal');

  document.getElementById('fbProject').addEventListener('change', (e) => populateTaskOptions(e.target.value));

  wireStarRating();

  document.getElementById('createFeedbackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Feedback.create({
      projectId: document.getElementById('fbProject').value,
      taskId: document.getElementById('fbTask').value || null,
      message: document.getElementById('fbMessage').value.trim(),
      category: document.getElementById('fbCategory').value,
      priority: document.getElementById('fbPriority').value,
      rating: Number(document.getElementById('fbRatingValue').value) || 0,
    });
    Utils.toast('Feedback submitted.');
    modal.hidden = true;
    render();
  });

  render();
}

function populateTaskOptions(projectId) {
  const sel = document.getElementById('fbTask');
  const tasks = projectId ? Projects.tasksOf(projectId) : [];
  sel.innerHTML = `<option value="">— Project-level feedback —</option>` +
    tasks.map((t) => `<option value="${t.id}">${Utils.escapeHtml(t.title)}</option>`).join('');
}

function wireStarRating() {
  const stars = document.querySelectorAll('#fbStarRating i');
  stars.forEach((star) => star.addEventListener('click', () => {
    const value = Number(star.getAttribute('data-star'));
    document.getElementById('fbRatingValue').value = value;
    stars.forEach((s) => {
      const active = Number(s.getAttribute('data-star')) <= value;
      s.className = active ? 'fa-solid fa-star active' : 'fa-regular fa-star';
    });
  }));
}
function resetStars() {
  document.getElementById('fbRatingValue').value = 0;
  document.querySelectorAll('#fbStarRating i').forEach((s) => { s.className = 'fa-regular fa-star'; });
}

function wireFeedbackTimelineEvents(container, onChange) {
  container.addEventListener('click', (e) => {
    const replyBtn = e.target.closest('[data-reply-btn]');
    if (replyBtn) {
      const id = replyBtn.getAttribute('data-reply-btn');
      const input = container.querySelector(`[data-reply-input="${id}"]`);
      if (input.value.trim()) {
        Feedback.reply(id, input.value.trim());
        onChange();
      }
      return;
    }
    const resolveBtn = e.target.closest('[data-resolve-btn]');
    if (resolveBtn) {
      Feedback.toggleResolved(resolveBtn.getAttribute('data-resolve-btn'));
      onChange();
    }
  });
}
