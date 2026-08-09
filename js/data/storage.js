/* ==========================================================================
   ProjectPulse — storage.js
   Generic localStorage wrapper. Every feature module goes through this
   instead of touching localStorage directly, so a real backend could be
   swapped in later without touching feature code.

   Phase 5 additions: a schema version + migration hook, quota-exceeded
   handling, and a startup integrity sweep that removes orphaned records
   (e.g. a task left behind after its project was deleted by another tab).
   ========================================================================== */

const DB_PREFIX = 'pt_';
const DB_VERSION = 1; // bump this and add a case in Storage._migrate() when the schema changes

const Storage = {
  /** Read the full array stored under `key`. Returns [] if nothing there or if the data is corrupt. */
  getAll(key) {
    try {
      const raw = localStorage.getItem(DB_PREFIX + key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error(`Storage.getAll(${key}) failed — data may be corrupt, treating as empty:`, e);
      return [];
    }
  },

  /** Overwrite the full array stored under `key`. */
  setAll(key, arr) {
    try {
      localStorage.setItem(DB_PREFIX + key, JSON.stringify(arr));
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.error(`Storage.setAll(${key}) failed — localStorage quota exceeded.`, e);
        if (window.Utils) Utils.toast('Your browser storage is full. Try exporting and clearing old data in Settings.', 'error');
      } else {
        console.error(`Storage.setAll(${key}) failed:`, e);
      }
      return false;
    }
  },

  /** Find a single item by id. */
  getById(key, id) {
    return this.getAll(key).find((item) => item.id === id) || null;
  },

  /** Append a new item (auto id/createdAt if missing). Returns the saved item. */
  /** Append a new item (auto id/createdAt if missing). Returns the saved item, or
   *  null if the write didn't actually persist (e.g. localStorage quota exceeded) —
   *  callers should check for null rather than assume a save always succeeds. */
  save(key, item) {
    const all = this.getAll(key);
    if (!item.id) item.id = Utils.generateId(key);
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    all.push(item);
    if (!this.setAll(key, all)) return null;
    return item;
  },

  /** Merge `changes` into the item with this id. Returns the updated item, or null
   *  if the id wasn't found OR the write didn't actually persist. */
  update(key, id, changes) {
    const all = this.getAll(key);
    const idx = all.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    const updated = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
    all[idx] = updated;
    if (!this.setAll(key, all)) return null;
    return updated;
  },

  /** Remove the item with this id. Returns true if something was removed. */
  remove(key, id) {
    const all = this.getAll(key);
    const next = all.filter((item) => item.id !== id);
    this.setAll(key, next);
    return next.length !== all.length;
  },

  /** Wipe a single entity's array. */
  clear(key) {
    localStorage.removeItem(DB_PREFIX + key);
  },

  /** Wipe every ProjectPulse key (used by Settings > Reset demo data). */
  clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(DB_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  },

  /** Export every entity as one JSON object (Settings/Reports > Export). */
  exportAll() {
    const keys = ['users', 'projects', 'tasks', 'feedback', 'announcements', 'notifications', 'notes', 'events', 'messages'];
    const dump = { schemaVersion: DB_VERSION, exportedAt: new Date().toISOString() };
    keys.forEach((k) => { dump[k] = this.getAll(k); });
    return dump;
  },

  /** Import a previously exported JSON object, overwriting current data. */
  /** Import a previously exported JSON object. Merges by id rather than replacing
   *  outright — an item present in the dump is added (new id) or updated (existing
   *  id), but anything already in local storage that isn't in the dump is kept. This
   *  is what makes Export/Import usable as a manual cross-device sync: importing a
   *  teammate's export won't wipe out projects/tasks you already have locally. */
  importAll(dump) {
    const keys = ['users', 'projects', 'tasks', 'feedback', 'announcements', 'notifications', 'notes', 'events', 'messages'];
    keys.forEach((k) => {
      if (!Array.isArray(dump[k])) return;
      const existing = this.getAll(k);
      const byId = new Map(existing.map((item) => [item.id, item]));
      dump[k].forEach((item) => { if (item && item.id) byId.set(item.id, item); }); // incoming record wins on a same-id conflict
      this.setAll(k, Array.from(byId.values()));
    });
    this.runIntegrityCheck();
  },

  /* ---------------------------------------------------------------------- */
  /* Schema versioning                                                      */
  /* ---------------------------------------------------------------------- */

  /** Runs once per load. Placeholder for future migrations between DB_VERSION bumps. */
  _migrate() {
    const storedVersion = Number(localStorage.getItem(DB_PREFIX + 'schema_version') || 0);
    if (storedVersion === DB_VERSION) return;

    // Example shape for a future migration:
    // if (storedVersion < 2) { /* transform old records to the new shape */ }

    localStorage.setItem(DB_PREFIX + 'schema_version', String(DB_VERSION));
  },

  /* ---------------------------------------------------------------------- */
  /* Referential integrity                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Removes records that point at a parent which no longer exists — e.g. a
   * task whose project was deleted in another tab, or a notification for a
   * user account that no longer exists. Safe to run on every page load.
   */
  runIntegrityCheck() {
    const projectIds = new Set(this.getAll('projects').map((p) => p.id));
    const userIds = new Set(this.getAll('users').map((u) => u.id));

    const tasks = this.getAll('tasks');
    const cleanTasks = tasks.filter((t) => projectIds.has(t.projectId));
    if (cleanTasks.length !== tasks.length) this.setAll('tasks', cleanTasks);
    const taskIds = new Set(cleanTasks.map((t) => t.id));

    const feedback = this.getAll('feedback');
    const cleanFeedback = feedback.filter((f) => projectIds.has(f.projectId) && (!f.taskId || taskIds.has(f.taskId)));
    if (cleanFeedback.length !== feedback.length) this.setAll('feedback', cleanFeedback);

    const notifications = this.getAll('notifications');
    const cleanNotifications = notifications.filter((n) => userIds.has(n.userId));
    if (cleanNotifications.length !== notifications.length) this.setAll('notifications', cleanNotifications);

    const events = this.getAll('events');
    const cleanEvents = events.filter((e) => !e.projectId || projectIds.has(e.projectId));
    if (cleanEvents.length !== events.length) this.setAll('events', cleanEvents);

    const messages = this.getAll('messages');
    const cleanMessages = messages.filter((m) => userIds.has(m.senderId) && userIds.has(m.recipientId));
    if (cleanMessages.length !== messages.length) this.setAll('messages', cleanMessages);
  },
};

Storage._migrate();

/* Session lives in sessionStorage so it feels like a real auth session,
   separate from the persisted app data. */
const Session = {
  KEY: 'pt_session',

  set(userId, rememberMe) {
    const payload = { userId, rememberMe: !!rememberMe };
    sessionStorage.setItem(this.KEY, JSON.stringify(payload));
    if (rememberMe) {
      localStorage.setItem(this.KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(this.KEY);
    }
  },

  get() {
    const raw = sessionStorage.getItem(this.KEY) || localStorage.getItem(this.KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clear() {
    sessionStorage.removeItem(this.KEY);
    localStorage.removeItem(this.KEY);
  },

  currentUser() {
    const s = this.get();
    if (!s) return null;
    return Storage.getById('users', s.userId);
  },
};
