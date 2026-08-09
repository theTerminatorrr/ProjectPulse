/* ==========================================================================
   ProjectPulse — auth.js
   Login, registration, logout, session persistence, and role-based
   route guarding / UI visibility.
   ========================================================================== */

const Auth = {
  ROLE_LABELS: { teacher: 'Teacher', leader: 'Team Leader', member: 'Team Member', admin: 'Administrator' },

  currentUser() {
    return Session.currentUser();
  },

  logout() {
    Session.clear();
    window.location.href = 'login.html';
  },

  /** Call at the top of every authenticated page. Redirects to login if not signed in. */
  requireAuth() {
    const user = this.currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    this.populateChrome(user);
    return user;
  },

  /** Fill topbar avatar/name + hide/show sidebar & page items by role. */
  populateChrome(user) {
    const nameEl = document.getElementById('topbarUserName');
    const avatarEl = document.getElementById('topbarAvatar');
    if (nameEl) nameEl.textContent = user.fullName;
    if (avatarEl && user.avatar) avatarEl.src = user.avatar;
    if (avatarEl && !user.avatar) avatarEl.src = this.avatarFallback(user);

    document.querySelectorAll('[data-role-visible]').forEach((el) => {
      const allowed = el.getAttribute('data-role-visible').split(',').map((r) => r.trim());
      el.style.display = allowed.includes(user.role) ? '' : 'none';
    });

    // Redirect Members/Teachers away from Leader-only pages if they land there directly.
    const page = document.body.getAttribute('data-page');
    const leaderOnlyPages = ['team'];
    if (leaderOnlyPages.includes(page) && user.role !== 'leader') {
      window.location.href = 'dashboard.html';
    }
    const adminOnlyPages = ['admin'];
    if (adminOnlyPages.includes(page) && user.role !== 'admin') {
      window.location.href = 'dashboard.html';
    }
    // Admins don't have a role-specific dashboard panel — their home is the Admin Panel.
    if (page === 'dashboard' && user.role === 'admin') {
      window.location.href = 'admin.html';
    }
  },

  avatarFallback(user) {
    const initials = Utils.initials(user.fullName);
    const color = Utils.colorFromString(user.fullName).replace('#', '');
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&bold=true`;
  },

  register({ fullName, studentId, email, department, semester, password, role }) {
    const user = Storage.save('users', {
      fullName, studentId, email: email.trim().toLowerCase(), department, semester,
      password: btoa(password), role, avatar: '', bio: '',
    });
    if (!user) return null; // storage write failed (e.g. quota) — caller should show an error
    Session.set(user.id, false);
    return user;
  },

  login(emailOrName, password, rememberMe) {
    const users = Storage.getAll('users');
    const user = users.find((u) =>
      u.email.toLowerCase() === emailOrName.trim().toLowerCase() ||
      u.fullName.toLowerCase() === emailOrName.trim().toLowerCase()
    );
    if (!user) return { ok: false, reason: 'No account found with that email.' };
    if (user.suspended) return { ok: false, reason: 'This account has been suspended. Contact an administrator.' };
    if (user.password !== btoa(password)) return { ok: false, reason: 'Incorrect password.' };
    Session.set(user.id, rememberMe);
    return { ok: true, user };
  },

  loginAsDemo(role) {
    const map = { teacher: 'teacher@demo.com', leader: 'leader@demo.com', member: 'member@demo.com', admin: 'admin@demo.com' };
    const email = map[role];
    const user = Storage.getAll('users').find((u) => u.email === email);
    if (!user) return { ok: false, reason: 'Demo account not found.' };
    if (user.suspended) return { ok: false, reason: 'This demo account is currently suspended.' };
    Session.set(user.id, false);
    return { ok: true, user };
  },
};

/* ---------------------------------------------------------------------- */
/* Page wiring                                                            */
/* ---------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  Seed.run();
  Storage.runIntegrityCheck();

  const page = document.body.getAttribute('data-page');

  wireLogoutButtons();

  if (document.getElementById('loginForm')) initLoginPage();
  if (document.getElementById('registerForm')) initRegisterPage();

  // Authenticated pages guard themselves + populate topbar chrome.
  if (page && document.querySelector('.sidebar')) {
    Auth.requireAuth();
  }
});

function wireLogoutButtons() {
  ['logoutBtn', 'profileLogoutBtn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => Auth.logout());
  });
}

function initLoginPage() {
  // If already logged in, skip straight to dashboard.
  if (Auth.currentUser()) { window.location.href = 'dashboard.html'; return; }

  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Validate.setError(document.getElementById('loginEmailError'), '');
    Validate.setError(document.getElementById('loginPasswordError'), '');

    let valid = true;
    if (!Validate.isRequired(emailInput.value)) {
      Validate.setError(document.getElementById('loginEmailError'), 'Enter your email or username.');
      valid = false;
    }
    if (!Validate.isRequired(passInput.value)) {
      Validate.setError(document.getElementById('loginPasswordError'), 'Enter your password.');
      valid = false;
    }
    if (!valid) return;

    const remember = document.getElementById('rememberMe').checked;
    const result = Auth.login(emailInput.value, passInput.value, remember);
    if (!result.ok) {
      Validate.setError(document.getElementById('loginPasswordError'), result.reason);
      Utils.toast(result.reason, 'error');
      return;
    }
    Utils.toast(`Welcome back, ${result.user.fullName.split(' ')[0]}!`);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
  });

  document.querySelectorAll('[data-demo-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = Auth.loginAsDemo(btn.getAttribute('data-demo-role'));
      if (!result.ok) { Utils.toast(result.reason, 'error'); return; }
      Utils.toast(`Logged in as ${result.user.fullName}`);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
    });
  });

  const toggleBtn = document.getElementById('toggleLoginPassword');
  if (toggleBtn) toggleBtn.addEventListener('click', () => togglePasswordVisibility(passInput, toggleBtn));

  // Forgot password modal (UI simulation only)
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  const forgotModal = document.getElementById('forgotPasswordModal');
  const closeForgot = document.getElementById('closeForgotModal');
  if (forgotBtn) forgotBtn.addEventListener('click', () => { forgotModal.hidden = false; });
  if (closeForgot) closeForgot.addEventListener('click', () => { forgotModal.hidden = true; });
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (forgotForm) forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    forgotModal.hidden = true;
    Utils.toast('If that email exists, a reset link has been "sent" (demo only).');
  });
}

function initRegisterPage() {
  if (Auth.currentUser()) { window.location.href = 'dashboard.html'; return; }

  const form = document.getElementById('registerForm');
  const passInput = document.getElementById('regPassword');
  const strengthContainer = document.getElementById('passwordStrength');
  Validate.applyPasswordStrengthUI(passInput, strengthContainer);

  const toggleBtn = document.getElementById('toggleRegPassword');
  if (toggleBtn) toggleBtn.addEventListener('click', () => togglePasswordVisibility(passInput, toggleBtn));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = {
      role: form.querySelector('input[name="role"]:checked')?.value,
      fullName: document.getElementById('fullName').value,
      studentId: document.getElementById('studentId').value,
      email: document.getElementById('regEmail').value,
      department: document.getElementById('department').value,
      semester: document.getElementById('semester').value,
      password: passInput.value,
      confirmPassword: document.getElementById('confirmPassword').value,
      agree: document.getElementById('agreeTerms').checked,
    };

    ['roleError', 'fullNameError', 'studentIdError', 'regEmailError', 'departmentError', 'semesterError', 'regPasswordError', 'confirmPasswordError', 'agreeTermsError']
      .forEach((id) => Validate.setError(document.getElementById(id), ''));

    let valid = true;
    if (!fields.role) { Validate.setError(document.getElementById('roleError'), 'Choose a role.'); valid = false; }
    if (!Validate.isRequired(fields.fullName)) { Validate.setError(document.getElementById('fullNameError'), 'Full name is required.'); valid = false; }
    if (!Validate.isRequired(fields.studentId)) { Validate.setError(document.getElementById('studentIdError'), 'Student ID is required.'); valid = false; }
    if (!Validate.isEmail(fields.email)) { Validate.setError(document.getElementById('regEmailError'), 'Enter a valid email.'); valid = false; }
    else if (Validate.emailExists(fields.email)) { Validate.setError(document.getElementById('regEmailError'), 'An account with this email already exists.'); valid = false; }
    if (!Validate.isRequired(fields.department)) { Validate.setError(document.getElementById('departmentError'), 'Department is required.'); valid = false; }
    if (!Validate.isRequired(fields.semester)) { Validate.setError(document.getElementById('semesterError'), 'Semester is required.'); valid = false; }
    if (!Validate.minLength(fields.password, 6)) { Validate.setError(document.getElementById('regPasswordError'), 'Use at least 6 characters.'); valid = false; }
    if (fields.password !== fields.confirmPassword) { Validate.setError(document.getElementById('confirmPasswordError'), 'Passwords do not match.'); valid = false; }
    if (!fields.agree) { Validate.setError(document.getElementById('agreeTermsError'), 'Please confirm to continue.'); valid = false; }

    if (!valid) return;

    const user = Auth.register(fields);
    if (!user) {
      Utils.toast('Could not save your account — your browser storage may be full. Try Settings → Export on another account to free up space, or use a different browser.', 'error');
      return;
    }
    Utils.toast(`Account created — welcome, ${user.fullName.split(' ')[0]}!`);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
  });
}

function togglePasswordVisibility(input, btn) {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
}
