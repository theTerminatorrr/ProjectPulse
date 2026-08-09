/* ==========================================================================
   ProjectPulse — utils.js
   Small shared helpers used across every page.
   ========================================================================== */

const Utils = {
  /** Simple unique id: prefix + timestamp + random chars. */
  generateId(prefix = 'id') {
    return `${prefix.slice(0, 3)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  },

  /** "2026-08-10" -> "Aug 10, 2026" */
  formatDate(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  /** "2026-08-10T14:00:00Z" -> "Aug 10, 2:00 PM" */
  formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },

  /** Human "3 days ago" / "in 2 days" relative to now. */
  timeAgo(iso) {
    if (!iso) return '';
    const diffMs = new Date(iso) - new Date();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    if (diffDays > 1) return `in ${diffDays} days`;
    return `${Math.abs(diffDays)} days ago`;
  },

  isOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
  },

  /** Two initials from a full name, for avatar fallbacks. */
  initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
  },

  /** Deterministic-ish pastel-on-navy color for an avatar fallback, from a string. */
  colorFromString(str) {
    const palette = ['#1D5EA8', '#4DA8FF', '#2ecc71', '#f5a623', '#9b59b6', '#e74c3c', '#123C69'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  },

  /** Escape user text before injecting into innerHTML. */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /** Toast notification (SweetAlert2 if present, else a console fallback). */
  toast(message, icon = 'success') {
    if (window.Swal) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon,
        title: message,
        showConfirmButton: false,
        timer: 2600,
        timerProgressBar: true,
      });
    } else {
      console.log(`[${icon}]`, message);
    }
  },

  /** Confirmation dialog wrapper. Returns a Promise<boolean>. */
  async confirm(title, text, confirmText = 'Yes, continue') {
    if (window.Swal) {
      const result = await Swal.fire({
        title, text, icon: 'warning',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#e74c3c',
      });
      return result.isConfirmed;
    }
    return window.confirm(`${title}\n${text}`);
  },

  /** Read the ?id=... (or any) query param from the current URL. */
  getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  },

  /** Debounce helper for search inputs. */
  debounce(fn, delay = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  },

  /** Progress color class based on percentage (matches CSS .progress-fill modifiers). */
  progressColorClass(pct) {
    if (pct >= 80) return 'success';
    if (pct >= 40) return 'warning';
    return 'danger';
  },

  /** "Full Name (Student ID)" for <option> labels — falls back to just the name if
   *  no ID is on file (e.g. Teacher/Admin accounts don't collect one). */
  memberOptionLabel(user) {
    return user.studentId ? `${user.fullName} (${user.studentId})` : user.fullName;
  },
};

/** Trigger a browser download of `obj` as a formatted JSON file. Global helper
 *  (not namespaced under Utils) so every page that needs export/import can
 *  call it without also loading reports.js. */
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
