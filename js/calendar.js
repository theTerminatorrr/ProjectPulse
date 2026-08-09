/* ==========================================================================
   ProjectPulse — calendar.js
   Monthly calendar built with vanilla JS. Merges project deadlines, task
   due dates, and user-created events (meetings/presentations/submissions).
   ========================================================================== */

const CalendarModule = {
  current: new Date(),

  customEvents() { return Storage.getAll('events'); },

  /** All calendar-worthy items for the signed-in user, normalized to {date, title, type, projectId}. */
  allEvents(user) {
    const items = [];
    Projects.forUser(user).forEach((p) => {
      if (p.deadline) items.push({ date: p.deadline, title: `${p.title} — Deadline`, type: 'deadline', projectId: p.id });
    });
    Tasks.forUser(user).forEach((t) => {
      if (t.dueDate && t.status !== 'done') items.push({ date: t.dueDate, title: t.title, type: 'deadline', projectId: t.projectId });
    });
    this.customEvents().forEach((e) => {
      const visible = !e.projectId || Projects.forUser(user).some((p) => p.id === e.projectId);
      if (visible) items.push({ date: e.date, title: e.title, type: e.type, projectId: e.projectId, id: e.id });
    });
    return items;
  },

  addEvent(data) {
    return Storage.save('events', { title: data.title, date: data.date, type: data.type, projectId: data.projectId || null });
  },
};

function initCalendarPage() {
  const user = Auth.currentUser();
  if (!user) return;

  function render() {
    renderMonthGrid(CalendarModule.current, CalendarModule.allEvents(user));
    renderUpcoming(CalendarModule.allEvents(user));
  }

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    CalendarModule.current.setMonth(CalendarModule.current.getMonth() - 1);
    render();
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    CalendarModule.current.setMonth(CalendarModule.current.getMonth() + 1);
    render();
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    CalendarModule.current = new Date();
    render();
  });

  // Repopulate the project list every time the modal opens (not just once at page
  // load) so a project created after this page loaded is still selectable.
  document.getElementById('openAddEventBtn').addEventListener('click', () => {
    Projects.populateSelect(document.getElementById('eventProject'), { includeAllOption: true });
    document.getElementById('addEventModal').hidden = false;
  });
  wireModalClose('addEventModal');
  document.getElementById('addEventForm').addEventListener('submit', (e) => {
    e.preventDefault();
    CalendarModule.addEvent({
      title: document.getElementById('eventTitle').value.trim(),
      date: document.getElementById('eventDate').value,
      type: document.getElementById('eventType').value,
      projectId: document.getElementById('eventProject').value || null,
    });
    Utils.toast('Event added.');
    document.getElementById('addEventModal').hidden = true;
    document.getElementById('addEventForm').reset();
    render();
  });

  render();
}

function renderMonthGrid(refDate, events) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  document.getElementById('calendarMonthLabel').textContent = refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = new Date().toISOString().slice(0, 10);
  const eventsByDate = {};
  events.forEach((e) => {
    if (!e.date) return;
    (eventsByDate[e.date] = eventsByDate[e.date] || []).push(e);
  });

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, otherMonth: true, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, otherMonth: false, dateStr });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - (startOffset + daysInMonth) + 1, otherMonth: true, dateStr: null });
  }

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = cells.map((c) => {
    const dayEvents = c.dateStr ? (eventsByDate[c.dateStr] || []) : [];
    return `
      <div class="calendar-day ${c.otherMonth ? 'other-month' : ''} ${c.dateStr === todayStr ? 'today' : ''}">
        <span class="day-num">${c.day}</span>
        ${dayEvents.slice(0, 3).map((e) => `<span class="calendar-event ${e.type}">${Utils.escapeHtml(e.title)}</span>`).join('')}
        ${dayEvents.length > 3 ? `<span class="text-muted" style="font-size:10px;">+${dayEvents.length - 3} more</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderUpcoming(events) {
  const list = document.getElementById('upcomingEventsList');
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8);

  list.innerHTML = upcoming.map((e) => `
    <li>
      <span class="calendar-event ${e.type}" style="flex-shrink:0;">${e.type}</span>
      <div><strong>${Utils.escapeHtml(e.title)}</strong><div class="text-muted">${Utils.formatDate(e.date)} · ${Utils.timeAgo(e.date)}</div></div>
    </li>
  `).join('') || `<li class="text-muted">Nothing coming up.</li>`;
}
