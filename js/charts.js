/* ==========================================================================
   ProjectPulse — charts.js
   Thin Chart.js wrappers + the role-specific dashboard chart builders.
   ========================================================================== */

const Charts = {
  _instances: {},

  _palette: ['#1D5EA8', '#4DA8FF', '#2ecc71', '#f5a623', '#e74c3c', '#123C69'],

  _destroy(canvasId) {
    if (this._instances[canvasId]) { this._instances[canvasId].destroy(); delete this._instances[canvasId]; }
  },

  doughnut(canvasId, labels, data) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: this._palette, borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Poppins', size: 11 } } } }, cutout: '65%' },
    });
  },

  bar(canvasId, labels, data, label = '') {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: '#4DA8FF', borderRadius: 6, maxBarThickness: 36 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  },

  line(canvasId, labels, data, label = '') {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(el, {
      type: 'line',
      data: { labels, datasets: [{ label, data, borderColor: '#1D5EA8', backgroundColor: 'rgba(77,168,255,0.15)', fill: true, tension: 0.35 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } },
    });
  },
};

/* ---------------------------------------------------------------------- */
/* Dashboard chart builders, called from app.js per role                  */
/* ---------------------------------------------------------------------- */
function renderTeacherCharts(user) {
  const projects = Projects.forUser(user);
  Charts.bar('teacherProgressChart', projects.map((p) => p.title), projects.map((p) => Projects.progressOf(p.id)), 'Progress %');

  const fb = Feedback.forUser(user);
  const counts = { general: 0, ui: 0, backend: 0, documentation: 0, presentation: 0 };
  fb.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });
  Charts.doughnut('teacherFeedbackChart', Object.keys(Feedback.CATEGORY_LABELS).map((k) => Feedback.CATEGORY_LABELS[k]), Object.values(counts));
}

function renderLeaderCharts(user) {
  const projects = Projects.forUser(user);
  Charts.doughnut('leaderCompletionChart', projects.map((p) => p.title), projects.map((p) => Projects.progressOf(p.id)));
}

function renderMemberCharts(user) {
  const tasks = Tasks.forUser(user);
  const statuses = ['todo', 'in_progress', 'review', 'done'];
  const counts = statuses.map((s) => tasks.filter((t) => t.status === s).length);
  Charts.doughnut('memberProgressChart', statuses.map((s) => Tasks.STATUS_LABELS[s]), counts);
}
