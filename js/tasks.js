/* ==========================================================================
   ProjectPulse — tasks.js
   Task CRUD, Kanban board (SortableJS drag-drop), table view, and the
   task detail side panel (progress, subtasks, comments, attachments, history).
   ========================================================================== */

const Tasks = {
  STATUS_LABELS: { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' },
  PRIORITY_LABELS: { low: 'Low', medium: 'Medium', high: 'High' },

  all() { return Storage.getAll('tasks'); },
  byId(id) { return Storage.getById('tasks', id); },

  /** Tasks visible to the current user, based on role. */
  forUser(user) {
    const all = this.all();
    if (!user) return [];
    if (user.role === 'teacher') return all;
    if (user.role === 'leader') {
      const myProjectIds = Projects.forUser(user).map((p) => p.id);
      return all.filter((t) => myProjectIds.includes(t.projectId));
    }
    return all.filter((t) => (t.assigneeIds || []).includes(user.id));
  },

  create(data) {
    const task = Storage.save('tasks', {
      projectId: data.projectId, title: data.title, description: data.description || '',
      assigneeIds: data.assigneeIds || [], priority: data.priority || 'medium', status: 'todo',
      progress: 0, dueDate: data.dueDate, estimatedHours: data.estimatedHours || null,
      subtasks: [], history: [{ userId: Auth.currentUser().id, change: 'Task created', date: new Date().toISOString() }],
      comments: [], attachments: [],
    });
    if (!task) return null; // storage write failed (e.g. quota) — caller should show an error
    (task.assigneeIds || []).forEach((uid) => Notifications.push(uid, 'task_assigned', `You were assigned "${task.title}"`, task.id));
    return task;
  },

  update(id, changes, historyNote) {
    const updated = Storage.update('tasks', id, changes);
    if (historyNote && updated) this.logHistory(id, historyNote);
    return updated;
  },

  remove(id) { Storage.remove('tasks', id); },

  logHistory(taskId, note) {
    const task = this.byId(taskId);
    if (!task) return;
    const history = [...(task.history || []), { userId: Auth.currentUser().id, change: note, date: new Date().toISOString() }];
    Storage.update('tasks', taskId, { history });
  },

  setStatus(taskId, status) {
    const task = this.byId(taskId);
    if (!task || task.status === status) return;
    Storage.update('tasks', taskId, { status });
    this.logHistory(taskId, `Status changed to "${Tasks.STATUS_LABELS[status]}"`);
  },

  setProgress(taskId, progress) {
    Storage.update('tasks', taskId, { progress });
    this.logHistory(taskId, `Progress updated to ${progress}%`);
  },

  addSubtask(taskId, text) {
    const task = this.byId(taskId);
    const subtasks = [...(task.subtasks || []), { text, done: false }];
    Storage.update('tasks', taskId, { subtasks });
  },

  toggleSubtask(taskId, index) {
    const task = this.byId(taskId);
    const subtasks = [...(task.subtasks || [])];
    subtasks[index].done = !subtasks[index].done;
    Storage.update('tasks', taskId, { subtasks });
  },

  addComment(taskId, text) {
    const task = this.byId(taskId);
    const comments = [...(task.comments || []), { userId: Auth.currentUser().id, text, date: new Date().toISOString() }];
    Storage.update('tasks', taskId, { comments });
  },

  addAttachment(taskId, filename) {
    const task = this.byId(taskId);
    const attachments = [...(task.attachments || []), { filename, date: new Date().toISOString() }];
    Storage.update('tasks', taskId, { attachments });
    this.logHistory(taskId, `Attached "${filename}"`);
  },
};

/* ---------------------------------------------------------------------- */
/* Tasks page (Kanban + table)                                            */
/* ---------------------------------------------------------------------- */
function initTasksPage() {
  const user = Auth.currentUser();
  if (!user) return;

  populateTaskFilters(user);

  const state = { view: 'kanban' };

  function getFiltered() {
    let list = Tasks.forUser(user);
    const q = (document.getElementById('taskSearchInput').value || '').toLowerCase().trim();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    const proj = document.getElementById('projectFilter').value;
    if (proj) list = list.filter((t) => t.projectId === proj);
    const pri = document.getElementById('priorityFilter').value;
    if (pri) list = list.filter((t) => t.priority === pri);
    const assignee = document.getElementById('assigneeFilter').value;
    if (assignee) list = list.filter((t) => (t.assigneeIds || []).includes(assignee));
    return list;
  }

  function renderAll() {
    const list = getFiltered();
    renderKanban(list, user);
    renderTaskTable(list);
    document.getElementById('tasksEmptyState').hidden = list.length > 0;
  }

  ['taskSearchInput', 'projectFilter', 'priorityFilter', 'assigneeFilter'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderAll);
  });

  document.getElementById('viewKanbanBtn').addEventListener('click', () => switchView('kanban'));
  document.getElementById('viewTableBtn').addEventListener('click', () => switchView('table'));

  function switchView(view) {
    state.view = view;
    document.getElementById('kanbanBoard').hidden = view !== 'kanban';
    document.getElementById('taskTableWrap').hidden = view !== 'table';
    document.getElementById('viewKanbanBtn').classList.toggle('active', view === 'kanban');
    document.getElementById('viewTableBtn').classList.toggle('active', view === 'table');
  }

  // Create task modal
  const modal = document.getElementById('createTaskModal');
  const form = document.getElementById('createTaskForm');
  const heading = document.getElementById('taskModalHeading');
  const editingId = document.getElementById('editingTaskId');

  function openTaskModal(task = null) {
    Projects.populateSelect(document.getElementById('taskProject'));
    populateAssigneeSelect(document.getElementById('taskProject').value);
    if (task) {
      heading.textContent = 'Edit Task';
      editingId.value = task.id;
      document.getElementById('taskProject').value = task.projectId;
      populateAssigneeSelect(task.projectId);
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskDescription').value = task.description || '';
      document.getElementById('taskPriority').value = task.priority;
      document.getElementById('taskDueDate').value = task.dueDate || '';
      document.getElementById('taskEstHours').value = task.estimatedHours || '';
      Array.from(document.getElementById('taskAssignee').options).forEach((opt) => {
        opt.selected = (task.assigneeIds || []).includes(opt.value);
      });
    } else {
      heading.textContent = 'New Task';
      editingId.value = '';
      form.reset();
    }
    modal.hidden = false;
  }

  document.getElementById('openCreateTaskBtn')?.addEventListener('click', () => openTaskModal());
  wireModalClose('createTaskModal');

  document.getElementById('taskProject').addEventListener('change', (e) => populateAssigneeSelect(e.target.value));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      projectId: document.getElementById('taskProject').value,
      title: document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      assigneeIds: Array.from(document.getElementById('taskAssignee').selectedOptions).map((o) => o.value),
      priority: document.getElementById('taskPriority').value,
      dueDate: document.getElementById('taskDueDate').value,
      estimatedHours: Number(document.getElementById('taskEstHours').value) || null,
    };
    if (editingId.value) {
      const updated = Tasks.update(editingId.value, data, 'Task details updated');
      if (!updated) { Utils.toast('Could not save changes — your browser storage may be full.', 'error'); return; }
      Utils.toast('Task updated.');
    } else {
      const created = Tasks.create(data);
      if (!created) { Utils.toast('Could not save the task — your browser storage may be full.', 'error'); return; }
      Utils.toast('Task created.');
    }
    modal.hidden = true;
    renderAll();
  });

  // Task card click -> detail panel; edit button -> edit modal
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-task]');
    if (editBtn) { e.stopPropagation(); openTaskModal(Tasks.byId(editBtn.getAttribute('data-edit-task'))); return; }
    // FIX: ignore clicks inside the detail panel itself (the overlay also carries
    // data-task-id, which used to make the X button reopen the panel immediately).
    if (e.target.closest('#taskDetailOverlay')) return;
    const card = e.target.closest('.task-card[data-task-id], tr[data-task-id]');
    if (card && !e.target.closest('.modal')) openTaskDetail(card.getAttribute('data-task-id'));
  });

  renderAll();
  initSortable(user, renderAll);
  window.refreshTasksView = renderAll;
}

function populateTaskFilters(user) {
  Projects.populateSelect(document.getElementById('projectFilter'), { includeAllOption: true });
  const assigneeSel = document.getElementById('assigneeFilter');
  const members = Storage.getAll('users').filter((u) => u.role === 'member');
  members.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.fullName;
    assigneeSel.appendChild(opt);
  });
}

function populateAssigneeSelect(projectId) {
  const sel = document.getElementById('taskAssignee');
  const project = Projects.byId(projectId);
  const members = project ? Projects.membersOf(project) : [];
  sel.innerHTML = members.map((m) => `<option value="${m.id}">${Utils.escapeHtml(Utils.memberOptionLabel(m))}</option>`).join('');
}

function renderKanban(list, user) {
  const cols = { todo: [], in_progress: [], review: [], done: [] };
  list.forEach((t) => { (cols[t.status] || cols.todo).push(t); });

  Object.keys(cols).forEach((status) => {
    const body = document.getElementById(`col-${status}`);
    body.innerHTML = cols[status].map((t) => taskCardHtml(t)).join('');
  });

  document.getElementById('countTodo').textContent = cols.todo.length;
  document.getElementById('countInProgress').textContent = cols.in_progress.length;
  document.getElementById('countReview').textContent = cols.review.length;
  document.getElementById('countDone').textContent = cols.done.length;
}

function taskCardHtml(t) {
  const project = Projects.byId(t.projectId);
  const overdue = Utils.isOverdue(t.dueDate) && t.status !== 'done';
  return `
    <div class="task-card priority-${t.priority}" data-task-id="${t.id}">
      <div class="task-card-top">
        <span class="text-muted" style="font-size:11px;">${Utils.escapeHtml(project?.title || '')}</span>
      </div>
      <h4>${Utils.escapeHtml(t.title)}</h4>
      <div class="progress-bar"><div class="progress-fill ${Utils.progressColorClass(t.progress)}" style="width:${t.progress}%"></div></div>
      <div class="task-card-footer">
        <span class="badge badge-priority-${t.priority}">${Tasks.PRIORITY_LABELS[t.priority]}</span>
        <span class="text-muted" style="${overdue ? 'color:var(--danger);font-weight:600;' : ''}">
          <i class="fa-solid fa-calendar"></i> ${Utils.formatDate(t.dueDate)}
        </span>
      </div>
    </div>
  `;
}

function renderTaskTable(list) {
  const tbody = document.getElementById('taskTableBody');
  const user = Auth.currentUser();
  tbody.innerHTML = list.map((t) => {
    const project = Projects.byId(t.projectId);
    return `
    <tr data-task-id="${t.id}" style="cursor:pointer">
      <td>${Utils.escapeHtml(t.title)}</td>
      <td>${Utils.escapeHtml(project?.title || '—')}</td>
      <td>${assigneeNames(t)}</td>
      <td><span class="badge badge-priority-${t.priority}">${Tasks.PRIORITY_LABELS[t.priority]}</span></td>
      <td><span class="badge" data-status="${t.status}">${Tasks.STATUS_LABELS[t.status]}</span></td>
      <td>${t.progress}%</td>
      <td>${Utils.formatDate(t.dueDate)}</td>
      <td>${user.role === 'leader' ? `<button class="icon-btn" data-edit-task="${t.id}"><i class="fa-solid fa-pen"></i></button>` : ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="text-muted">No tasks found.</td></tr>`;
}

function initSortable(user, onChange) {
  if (!window.Sortable) return;
  document.querySelectorAll('.kanban-column-body').forEach((col) => {
    new Sortable(col, {
      group: 'kanban',
      animation: 180,
      onEnd(evt) {
        const taskId = evt.item.getAttribute('data-task-id');
        const newStatus = evt.to.id.replace('col-', '');
        Tasks.setStatus(taskId, newStatus);
        onChange();
      },
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Task detail side panel                                                 */
/* ---------------------------------------------------------------------- */
function openTaskDetail(taskId) {
  const task = Tasks.byId(taskId);
  if (!task) return;
  const overlay = document.getElementById('taskDetailOverlay');
  const project = Projects.byId(task.projectId);

  document.getElementById('taskDetailPriority').textContent = Tasks.PRIORITY_LABELS[task.priority];
  document.getElementById('taskDetailPriority').className = `badge badge-priority-${task.priority}`;
  document.getElementById('taskDetailTitle').textContent = task.title;
  document.getElementById('taskDetailProject').textContent = project?.title || '';
  document.getElementById('taskDetailDescription').textContent = task.description || 'No description.';
  document.getElementById('taskProgressSlider').value = task.progress;
  document.getElementById('taskProgressValue').textContent = task.progress;
  document.getElementById('taskStatusSelect').value = task.status;

  renderSubtasks(task);
  renderAttachments(task);
  renderComments(task);
  renderHistory(task);

  overlay.hidden = false;
  overlay.setAttribute('data-task-id', taskId);
}

function renderSubtasks(task) {
  const list = document.getElementById('taskSubtasksList');
  list.innerHTML = (task.subtasks || []).map((s, i) => `
    <li class="${s.done ? 'done' : ''}">
      <input type="checkbox" data-subtask-index="${i}" ${s.done ? 'checked' : ''} />
      <span>${Utils.escapeHtml(s.text)}</span>
    </li>
  `).join('') || `<li class="text-muted">No subtasks yet.</li>`;
}

function renderAttachments(task) {
  const list = document.getElementById('taskAttachmentsList');
  list.innerHTML = (task.attachments || []).map((a) => `<li><i class="fa-solid fa-paperclip"></i> ${Utils.escapeHtml(a.filename)}</li>`).join('');
}

function renderComments(task) {
  const list = document.getElementById('taskCommentsList');
  list.innerHTML = (task.comments || []).map((c) => `
    <li><strong>${Utils.escapeHtml(Storage.getById('users', c.userId)?.fullName || 'Someone')}</strong> ${Utils.escapeHtml(c.text)}<div class="notif-time">${Utils.formatDateTime(c.date)}</div></li>
  `).join('') || `<li class="text-muted">No comments yet.</li>`;
}

function renderHistory(task) {
  const list = document.getElementById('taskHistoryList');
  list.innerHTML = [...(task.history || [])].reverse().map((h) => `
    <li><i class="fa-solid fa-clock-rotate-left"></i> <div>${Utils.escapeHtml(h.change)} <span class="notif-time">${Utils.formatDateTime(h.date)}</span></div></li>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('taskDetailOverlay');
  if (!overlay) return;

  document.getElementById('closeTaskDetail').addEventListener('click', () => { overlay.hidden = true; });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });

  document.getElementById('taskProgressSlider').addEventListener('input', (e) => {
    document.getElementById('taskProgressValue').textContent = e.target.value;
  });
  document.getElementById('taskProgressSlider').addEventListener('change', (e) => {
    const taskId = overlay.getAttribute('data-task-id');
    Tasks.setProgress(taskId, Number(e.target.value));
    if (typeof refreshTasksView === 'function') refreshTasksView();
  });

  document.getElementById('taskStatusSelect').addEventListener('change', (e) => {
    const taskId = overlay.getAttribute('data-task-id');
    Tasks.setStatus(taskId, e.target.value);
    if (typeof refreshTasksView === 'function') refreshTasksView();
  });

  document.getElementById('addSubtaskBtn').addEventListener('click', () => {
    const input = document.getElementById('newSubtaskInput');
    if (!input.value.trim()) return;
    const taskId = overlay.getAttribute('data-task-id');
    Tasks.addSubtask(taskId, input.value.trim());
    input.value = '';
    renderSubtasks(Tasks.byId(taskId));
  });

  document.getElementById('taskSubtasksList').addEventListener('change', (e) => {
    if (e.target.matches('[data-subtask-index]')) {
      const taskId = overlay.getAttribute('data-task-id');
      Tasks.toggleSubtask(taskId, Number(e.target.getAttribute('data-subtask-index')));
      renderSubtasks(Tasks.byId(taskId));
    }
  });

  document.getElementById('addCommentBtn').addEventListener('click', () => {
    const input = document.getElementById('newCommentInput');
    if (!input.value.trim()) return;
    const taskId = overlay.getAttribute('data-task-id');
    Tasks.addComment(taskId, input.value.trim());
    input.value = '';
    renderComments(Tasks.byId(taskId));
  });

  document.getElementById('taskFileDrop').addEventListener('click', () => document.getElementById('taskFileInput').click());
  document.getElementById('taskFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const taskId = overlay.getAttribute('data-task-id');
    Tasks.addAttachment(taskId, file.name);
    renderAttachments(Tasks.byId(taskId));
    Utils.toast(`"${file.name}" attached (simulated — filename only).`);
  });
});