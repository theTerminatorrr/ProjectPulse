/* ==========================================================================
   ProjectPulse — validation.js
   Reusable field validators + password strength meter shared by
   login/register/profile forms.
   ========================================================================== */

const Validate = {
  isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  },

  isRequired(value) {
    return value !== null && value !== undefined && String(value).trim().length > 0;
  },

  minLength(value, n) {
    return String(value || '').trim().length >= n;
  },

  emailExists(email) {
    return Storage.getAll('users').some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  },

  /** Show/clear an inline error under a field. errorEl may be null. */
  setError(errorEl, message) {
    if (!errorEl) return;
    errorEl.textContent = message || '';
  },

  /** 0-4 strength score based on length + character variety. */
  passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0 weak .. 4 very strong
  },

  applyPasswordStrengthUI(inputEl, containerEl) {
    if (!inputEl || !containerEl) return;
    const bar = containerEl.querySelector('.strength-bar');
    const label = containerEl.querySelector('.strength-label');
    const labels = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'];
    const classes = ['', 'weak', 'medium', 'strong', 'very-strong'];

    inputEl.addEventListener('input', () => {
      const score = this.passwordStrength(inputEl.value);
      bar.className = 'strength-bar ' + (classes[score] || '');
      label.textContent = inputEl.value ? labels[score] : 'Password strength';
    });
  },
};
