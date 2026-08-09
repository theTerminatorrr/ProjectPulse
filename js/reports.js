/* ==========================================================================
   ProjectPulse — reports.js
   Generates Project / Member / Task / Feedback reports, with print and
   JSON export support.
   ========================================================================== */

function initReportsPage() {
  const user = Auth.currentUser();
  if (!user) return;

  Projects.populateSelect(document.getElementById('reportProjectSelect'), { includeAllOption: true });
  document.getElementById('reportGeneratedAt').textContent = `Generated ${Utils.formatDateTime(new Date().toISOString())} by ${user.fullName}`;

  function render() {
    // Refresh the project list on every render (cheap, and keeps the current
    // selection) so a project created after this page loaded is still filterable.
    Projects.populateSelect(document.getElementById('reportProjectSelect'), {
      includeAllOption: true,
      selected: document.getElementById('reportProjectSelect').value,
    });
    const type = document.getElementById('reportTypeSelect').value;
    const projectId = document.getElementById('reportProjectSelect').value;
    const headings = {
      project: 'Project Summary Report', member: 'Member Performance Report',
      task: 'Task Report', feedback: 'Teacher Feedback Report', activity: 'Activity Log',
    };
    document.getElementById('reportHeading').textContent = headings[type];

    if (type === 'project') renderProjectReport(user, projectId);
    else if (type === 'member') renderMemberReport(user, projectId);
    else if (type === 'task') renderTaskReport(user, projectId);
    else if (type === 'activity') renderActivityLogReport(user, projectId);
    else renderFeedbackReport(user, projectId);
  }

  document.getElementById('reportTypeSelect').addEventListener('change', render);
  document.getElementById('reportProjectSelect').addEventListener('change', render);

  document.getElementById('printReportBtn').addEventListener('click', () => window.print());
  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const dump = Storage.exportAll();
    downloadJson(dump, `projectpulse-export-${new Date().toISOString().slice(0, 10)}.json`);
    Utils.toast('Data exported as JSON.');
  });

  render();
}

function statGrid(items) {
  document.getElementById('reportStatGrid').innerHTML = items.map((s) => `
    <div class="glass-card stat-card"><i class="${s.icon}"></i><div><strong>${s.value}</strong><span>${s.label}</span></div></div>
  `).join('');
}

function reportTable(headers, rows) {
  document.querySelector('#reportTable thead tr').innerHTML = headers.map((h) => `<th>${h}</th>`).join('');
  document.querySelector('#reportTable tbody').innerHTML = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${headers.length}" class="text-muted">No data.</td></tr>`;
}

function projectsScope(user, projectId) {
  const scope = Projects.forUser(user);
  return projectId ? scope.filter((p) => p.id === projectId) : scope;
}

function renderProjectReport(user, projectId) {
  const projects = projectsScope(user, projectId);
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));
  statGrid([
    { icon: 'fa-solid fa-folder-open', value: projects.length, label: 'Projects' },
    { icon: 'fa-solid fa-list-check', value: tasks.length, label: 'Total Tasks' },
    { icon: 'fa-solid fa-circle-check', value: tasks.filter((t) => t.status === 'done').length, label: 'Completed' },
    { icon: 'fa-solid fa-triangle-exclamation', value: tasks.filter((t) => Utils.isOverdue(t.dueDate) && t.status !== 'done').length, label: 'Overdue' },
  ]);
  Charts.doughnut('reportStatusChart', ['To Do', 'In Progress', 'Review', 'Done'],
    ['todo', 'in_progress', 'review', 'done'].map((s) => tasks.filter((t) => t.status === s).length));
  const members = Array.from(new Map(projects.flatMap((p) => Projects.membersOf(p)).map((m) => [m.id, m])).values());
  Charts.bar('reportWorkloadChart', members.map((m) => m.fullName), members.map((m) => tasks.filter((t) => (t.assigneeIds || []).includes(m.id)).length), 'Tasks');
  reportTable(['Project', 'Status', 'Progress', 'Deadline', 'Members'],
    projects.map((p) => [Utils.escapeHtml(p.title), Projects.STATUS_LABELS[p.status], `${Projects.progressOf(p.id)}%`, Utils.formatDate(p.deadline), Projects.membersOf(p).length]));
}

function renderMemberReport(user, projectId) {
  const projects = projectsScope(user, projectId);
  const members = Array.from(new Map(projects.flatMap((p) => Projects.membersOf(p)).map((m) => [m.id, m])).values());
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));
  statGrid([
    { icon: 'fa-solid fa-users', value: members.length, label: 'Members' },
    { icon: 'fa-solid fa-list-check', value: tasks.length, label: 'Tasks Assigned' },
  ]);
  Charts.doughnut('reportStatusChart', members.map((m) => m.fullName), members.map((m) => tasks.filter((t) => (t.assigneeIds || []).includes(m.id) && t.status === 'done').length));
  Charts.bar('reportWorkloadChart', members.map((m) => m.fullName), members.map((m) => tasks.filter((t) => (t.assigneeIds || []).includes(m.id)).length), 'Assigned Tasks');
  reportTable(['Member', 'Assigned', 'Completed', 'In Progress', 'Avg. Progress'],
    members.map((m) => {
      const mine = tasks.filter((t) => (t.assigneeIds || []).includes(m.id));
      const avg = mine.length ? Math.round(mine.reduce((a, t) => a + t.progress, 0) / mine.length) : 0;
      return [Utils.escapeHtml(m.fullName), mine.length, mine.filter((t) => t.status === 'done').length, mine.filter((t) => t.status === 'in_progress').length, `${avg}%`];
    }));
}

function renderTaskReport(user, projectId) {
  const projects = projectsScope(user, projectId);
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));
  statGrid([
    { icon: 'fa-solid fa-list-check', value: tasks.length, label: 'Total Tasks' },
    { icon: 'fa-solid fa-hourglass-half', value: tasks.filter((t) => t.status !== 'done').length, label: 'Open' },
    { icon: 'fa-solid fa-circle-check', value: tasks.filter((t) => t.status === 'done').length, label: 'Done' },
    { icon: 'fa-solid fa-triangle-exclamation', value: tasks.filter((t) => Utils.isOverdue(t.dueDate) && t.status !== 'done').length, label: 'Overdue' },
  ]);
  Charts.doughnut('reportStatusChart', ['Low', 'Medium', 'High'], ['low', 'medium', 'high'].map((p) => tasks.filter((t) => t.priority === p).length));
  Charts.bar('reportWorkloadChart', ['To Do', 'In Progress', 'Review', 'Done'], ['todo', 'in_progress', 'review', 'done'].map((s) => tasks.filter((t) => t.status === s).length), 'Tasks');
  reportTable(['Task', 'Project', 'Priority', 'Status', 'Progress', 'Due'],
    tasks.map((t) => [Utils.escapeHtml(t.title), Utils.escapeHtml(Projects.byId(t.projectId)?.title || ''), Tasks.PRIORITY_LABELS[t.priority], Tasks.STATUS_LABELS[t.status], `${t.progress}%`, Utils.formatDate(t.dueDate)]));
}

function renderFeedbackReport(user, projectId) {
  const projects = projectsScope(user, projectId);
  const projectIds = projects.map((p) => p.id);
  const fb = Feedback.all().filter((f) => projectIds.includes(f.projectId));
  statGrid([
    { icon: 'fa-solid fa-comments', value: fb.length, label: 'Total Feedback' },
    { icon: 'fa-solid fa-circle-check', value: fb.filter((f) => f.resolved).length, label: 'Resolved' },
    { icon: 'fa-solid fa-triangle-exclamation', value: fb.filter((f) => f.priority === 'critical').length, label: 'Critical' },
  ]);
  Charts.doughnut('reportStatusChart', Object.values(Feedback.CATEGORY_LABELS), Object.keys(Feedback.CATEGORY_LABELS).map((c) => fb.filter((f) => f.category === c).length));
  Charts.bar('reportWorkloadChart', projects.map((p) => p.title), projects.map((p) => fb.filter((f) => f.projectId === p.id).length), 'Feedback Count');
  reportTable(['Project', 'Category', 'Priority', 'Rating', 'Resolved', 'Date'],
    fb.map((f) => [Utils.escapeHtml(Projects.byId(f.projectId)?.title || ''), Feedback.CATEGORY_LABELS[f.category], Feedback.PRIORITY_LABELS[f.priority], f.rating ? `${f.rating}/5` : '—', f.resolved ? 'Yes' : 'No', Utils.formatDate(f.createdAt)]));
}

function renderActivityLogReport(user, projectId) {
  const projects = projectsScope(user, projectId);
  const tasks = projects.flatMap((p) => Projects.tasksOf(p.id));
  const entries = [];
  tasks.forEach((t) => (t.history || []).forEach((h) => entries.push({
    ...h, taskTitle: t.title, projectTitle: Projects.byId(t.projectId)?.title || '',
  })));
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  statGrid([
    { icon: 'fa-solid fa-clock-rotate-left', value: entries.length, label: 'Logged Actions' },
    { icon: 'fa-solid fa-folder-open', value: projects.length, label: 'Projects Covered' },
    { icon: 'fa-solid fa-users', value: new Set(entries.map((e) => e.userId)).size, label: 'Contributors' },
  ]);

  const byUser = {};
  entries.forEach((e) => {
    const name = Storage.getById('users', e.userId)?.fullName || 'Unknown';
    byUser[name] = (byUser[name] || 0) + 1;
  });
  Charts.bar('reportWorkloadChart', Object.keys(byUser), Object.values(byUser), 'Actions logged');

  const byDay = {};
  entries.forEach((e) => {
    const day = (e.date || '').slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const days = Object.keys(byDay).sort();
  Charts.line('reportStatusChart', days.map((d) => Utils.formatDate(d)), days.map((d) => byDay[d]), 'Actions per day');

  reportTable(['Who', 'Action', 'Task', 'Project', 'When'],
    entries.slice(0, 100).map((e) => [
      Utils.escapeHtml(Storage.getById('users', e.userId)?.fullName || 'Unknown'),
      Utils.escapeHtml(e.change), Utils.escapeHtml(e.taskTitle), Utils.escapeHtml(e.projectTitle),
      Utils.formatDateTime(e.date),
    ]));
}

