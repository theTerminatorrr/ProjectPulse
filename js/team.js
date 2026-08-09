/* ==========================================================================
   ProjectPulse — team.js
   Team roster page: view members across a Leader's projects, add/remove
   members, promote a member to leader.
   ========================================================================== */

function initTeamPage() {
  const user = Auth.currentUser();
  if (!user) return;

  Projects.populateSelect(document.getElementById('teamProjectFilter'), { includeAllOption: true });
  Projects.populateSelect(document.getElementById('addMemberProject'));
  populateAvailableUsers();

  const grid = document.getElementById('teamMemberGrid');
  const emptyState = document.getElementById('teamEmptyState');
  const searchInput = document.getElementById('memberSearchInput');
  const projectFilter = document.getElementById('teamProjectFilter');

  function getRoster() {
    const projects = projectFilter.value ? [Projects.byId(projectFilter.value)] : Projects.forUser(user);
    const map = new Map();
    projects.forEach((p) => {
      if (!p) return;
      Projects.membersOf(p).forEach((m) => {
        if (!map.has(m.id)) map.set(m.id, { member: m, projects: [] });
        map.get(m.id).projects.push(p);
      });
    });
    let list = Array.from(map.values());
    const q = (searchInput.value || '').toLowerCase().trim();
    if (q) list = list.filter((r) => r.member.fullName.toLowerCase().includes(q));
    return list;
  }

  function render() {
    const roster = getRoster();
    emptyState.hidden = roster.length > 0;
    grid.innerHTML = roster.map((r) => memberCardHtml(r)).join('');
  }

  [searchInput, projectFilter].forEach((el) => el.addEventListener('input', render));

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-member-id]');
    if (card) openMemberProfile(card.getAttribute('data-member-id'));
  });

  // Add member modal — repopulate the project/user lists on every open, not just
  // once at page load, so anyone who registered while this page was already open
  // still shows up without needing a full page refresh.
  document.getElementById('openAddMemberBtn').addEventListener('click', () => {
    Projects.populateSelect(document.getElementById('addMemberProject'));
    populateAvailableUsers();
    document.getElementById('addMemberModal').hidden = false;
  });
  wireModalClose('addMemberModal');
  document.getElementById('addMemberForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const projectId = document.getElementById('addMemberProject').value;
    const userId = document.getElementById('addMemberUser').value;
    const project = Projects.byId(projectId);
    if (!project) return;
    if ((project.memberIds || []).includes(userId)) {
      Utils.toast('That member is already on this project.', 'info');
      return;
    }
    Projects.update(projectId, { memberIds: [...(project.memberIds || []), userId] });
    Notifications.push(userId, 'member_joined', `You were added to "${project.title}"`, projectId);
    Utils.toast('Member added to project.');
    document.getElementById('addMemberModal').hidden = true;
    render();
  });

  // Member profile modal actions
  wireModalClose('memberProfileModal');
  document.getElementById('removeMemberBtn').addEventListener('click', async () => {
    const modal = document.getElementById('memberProfileModal');
    const memberId = modal.getAttribute('data-member-id');
    const projectId = modal.getAttribute('data-project-id');
    const project = Projects.byId(projectId);
    if (!project) return;
    if (await Utils.confirm('Remove this member?', `They will be removed from "${project.title}" and unassigned from its tasks.`, 'Remove')) {
      Projects.update(projectId, { memberIds: (project.memberIds || []).filter((id) => id !== memberId) });
      // Referential integrity: strip the removed member from any tasks in this project.
      Projects.tasksOf(projectId).forEach((t) => {
        if ((t.assigneeIds || []).includes(memberId)) {
          Tasks.update(t.id, { assigneeIds: t.assigneeIds.filter((id) => id !== memberId) }, 'Unassigned — removed from project');
        }
      });
      Utils.toast('Member removed.');
      modal.hidden = true;
      render();
    }
  });
  document.getElementById('makeLeaderBtn').addEventListener('click', () => {
    Utils.toast('Leader reassignment is a demo action — no change was made.', 'info');
  });

  render();
  renderLeaderboard(user);
}

/* ---------------------------------------------------------------------- */
/* Leaderboard + achievement badges (Optional feature)                    */
/* ---------------------------------------------------------------------- */
function renderLeaderboard(user) {
  const projects = Projects.forUser(user);
  const memberMap = new Map();
  projects.forEach((p) => Projects.membersOf(p).forEach((m) => memberMap.set(m.id, m)));
  const members = Array.from(memberMap.values());

  const rows = members.map((m) => {
    const tasks = Tasks.all().filter((t) => (t.assigneeIds || []).includes(m.id) && projects.some((p) => p.id === t.projectId));
    const completed = tasks.filter((t) => t.status === 'done').length;
    return { member: m, completed, assigned: tasks.length };
  }).sort((a, b) => b.completed - a.completed);

  const topCompleted = rows[0]?.completed || 0;
  const mostAssigned = Math.max(0, ...rows.map((r) => r.assigned));

  const tbody = document.querySelector('#leaderboardTable tbody');
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${Utils.escapeHtml(r.member.fullName)}</td>
      <td>${r.completed}</td>
      <td>${r.assigned}</td>
      <td>${badgesFor(r, topCompleted, mostAssigned).join(' ')}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="text-muted">No task data yet.</td></tr>`;
}

function badgesFor(row, topCompleted, mostAssigned) {
  const badges = [];
  if (row.completed > 0 && row.completed === topCompleted) badges.push('<span class="badge badge-success"><i class="fa-solid fa-star"></i> Top Contributor</span>');
  if (row.assigned > 0 && row.assigned === mostAssigned) badges.push('<span class="badge"><i class="fa-solid fa-bolt"></i> Most Active</span>');
  if (row.assigned > 0 && row.completed === row.assigned) badges.push('<span class="badge badge-warning"><i class="fa-solid fa-bullseye"></i> Fast Finisher</span>');
  return badges;
}

function populateAvailableUsers() {
  const sel = document.getElementById('addMemberUser');
  const members = Storage.getAll('users').filter((u) => u.role === 'member');
  sel.innerHTML = members.map((m) => `<option value="${m.id}">${Utils.escapeHtml(m.fullName)} — ${Utils.escapeHtml(m.email)}</option>`).join('');
}

function memberCardHtml(r) {
  const m = r.member;
  const online = Math.random() > 0.4; // simulated presence
  return `
    <div class="glass-card member-card" data-member-id="${m.id}" data-project-id="${r.projects[0]?.id || ''}">
      <img src="${m.avatar || Auth.avatarFallback(m)}" alt="" class="avatar-lg" />
      <strong>${Utils.escapeHtml(m.fullName)}</strong>
      <span class="online-dot ${online ? 'online' : 'offline'}">${online ? 'Online' : 'Offline'}</span>
      <span class="text-muted">${r.projects.length} project${r.projects.length !== 1 ? 's' : ''}</span>
    </div>
  `;
}

function openMemberProfile(memberId) {
  const member = Storage.getById('users', memberId);
  if (!member) return;
  const modal = document.getElementById('memberProfileModal');
  modal.setAttribute('data-member-id', memberId);

  const card = document.querySelector(`[data-member-id="${memberId}"]`);
  modal.setAttribute('data-project-id', card?.getAttribute('data-project-id') || '');

  document.getElementById('memberProfileAvatar').src = member.avatar || Auth.avatarFallback(member);
  document.getElementById('memberProfileName').textContent = member.fullName;
  document.getElementById('memberProfileEmail').textContent = member.email;

  const tasks = Tasks.all().filter((t) => (t.assigneeIds || []).includes(memberId));
  document.getElementById('memberProfileTasks').textContent = tasks.length;
  document.getElementById('memberProfileCompleted').textContent = tasks.filter((t) => t.status === 'done').length;

  modal.hidden = false;
}
