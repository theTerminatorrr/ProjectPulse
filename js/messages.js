/* ==========================================================================
   ProjectPulse — messages.js
   Simple direct-messaging chat between people who share a project — the
   spec's "Leader <-> Member, Teacher <-> Leader" chat, generalized to any
   pair of project collaborators rather than a hard-coded role pairing.
   ========================================================================== */

const Messages = {
  all() { return Storage.getAll('messages'); },

  forUser(userId) {
    return this.all().filter((m) => m.senderId === userId || m.recipientId === userId);
  },

  /** Everyone the user shares at least one project with (teammates, their leader, their teacher). */
  reachableUsers(user) {
    if (!user) return [];
    if (user.role === 'teacher') {
      // Teachers can message any Leader across every project they oversee.
      const leaderIds = new Set(Projects.all().map((p) => p.leaderId).filter(Boolean));
      return Storage.getAll('users').filter((u) => leaderIds.has(u.id));
    }
    const myProjects = Projects.forUser(user);
    const ids = new Set();
    myProjects.forEach((p) => {
      if (p.leaderId) ids.add(p.leaderId);
      if (p.teacherId) ids.add(p.teacherId);
      (p.memberIds || []).forEach((id) => ids.add(id));
    });
    ids.delete(user.id);
    return Array.from(ids).map((id) => Storage.getById('users', id)).filter(Boolean);
  },

  /** One row per conversation partner: { user, lastMessage, unreadCount }, newest first. */
  conversations(user) {
    const mine = this.forUser(user.id);
    const byPartner = new Map();
    mine.forEach((m) => {
      const partnerId = m.senderId === user.id ? m.recipientId : m.senderId;
      if (!byPartner.has(partnerId)) byPartner.set(partnerId, []);
      byPartner.get(partnerId).push(m);
    });
    const rows = [];
    byPartner.forEach((msgs, partnerId) => {
      const partner = Storage.getById('users', partnerId);
      if (!partner) return; // orphaned by a deleted user — integrity sweep will clean this up
      msgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const unreadCount = msgs.filter((m) => m.recipientId === user.id && !m.read).length;
      rows.push({ user: partner, lastMessage: msgs[0], unreadCount });
    });
    rows.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
    return rows;
  },

  thread(userId, partnerId) {
    return this.all()
      .filter((m) => (m.senderId === userId && m.recipientId === partnerId) || (m.senderId === partnerId && m.recipientId === userId))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  send(senderId, recipientId, text) {
    const msg = Storage.save('messages', { senderId, recipientId, text, read: false });
    if (!msg) return null; // storage write failed (e.g. quota)
    const sender = Storage.getById('users', senderId);
    Notifications.push(recipientId, 'announcement', `New message from ${sender?.fullName || 'someone'}`, msg.id);
    return msg;
  },

  markThreadRead(userId, partnerId) {
    this.all().forEach((m) => {
      if (m.senderId === partnerId && m.recipientId === userId && !m.read) {
        Storage.update('messages', m.id, { read: true });
      }
    });
  },

  unreadTotal(userId) {
    return this.all().filter((m) => m.recipientId === userId && !m.read).length;
  },
};

/* ---------------------------------------------------------------------- */
/* Messages page                                                          */
/* ---------------------------------------------------------------------- */
function initMessagesPage() {
  const user = Auth.currentUser();
  if (!user) return;

  let activePartnerId = null;

  function renderConversationList() {
    const rows = Messages.conversations(user);
    const q = (document.getElementById('conversationSearch').value || '').toLowerCase().trim();
    const filtered = q ? rows.filter((r) => r.user.fullName.toLowerCase().includes(q)) : rows;

    document.getElementById('conversationsEmptyState').hidden = rows.length > 0;
    const list = document.getElementById('conversationList');
    list.innerHTML = filtered.map((r) => `
      <li class="conversation-item ${r.user.id === activePartnerId ? 'active' : ''}" data-partner-id="${r.user.id}">
        <img src="${r.user.avatar || Auth.avatarFallback(r.user)}" alt="" class="avatar-sm" />
        <div class="conversation-item-body">
          <strong>${Utils.escapeHtml(r.user.fullName)}</strong>
          <span class="text-muted">${Utils.escapeHtml((r.lastMessage.senderId === user.id ? 'You: ' : '') + r.lastMessage.text.slice(0, 42))}${r.lastMessage.text.length > 42 ? '…' : ''}</span>
        </div>
        ${r.unreadCount > 0 ? `<span class="badge-dot" style="position:static;">${r.unreadCount}</span>` : ''}
      </li>
    `).join('');
  }

  function openThread(partnerId) {
    activePartnerId = partnerId;
    const partner = Storage.getById('users', partnerId);
    if (!partner) return;

    Messages.markThreadRead(user.id, partnerId);
    document.getElementById('chatThreadEmpty').hidden = true;
    document.getElementById('chatThreadActive').hidden = false;
    document.getElementById('chatThreadAvatar').src = partner.avatar || Auth.avatarFallback(partner);
    document.getElementById('chatThreadName').textContent = partner.fullName;
    document.getElementById('chatThreadRole').textContent = Auth.ROLE_LABELS[partner.role] || '';

    renderThreadMessages();
    renderConversationList();
    if (typeof Notifications !== 'undefined') Notifications.render();
  }

  function renderThreadMessages() {
    const msgs = Messages.thread(user.id, activePartnerId);
    const wrap = document.getElementById('chatMessages');
    wrap.innerHTML = msgs.map((m) => `
      <div class="chat-bubble-row ${m.senderId === user.id ? 'mine' : ''}">
        <div class="chat-bubble">
          <p>${Utils.escapeHtml(m.text)}</p>
          <span class="chat-bubble-time">${Utils.formatDateTime(m.createdAt)}</span>
        </div>
      </div>
    `).join('') || `<p class="text-muted" style="text-align:center;">No messages yet — say hello.</p>`;
    wrap.scrollTop = wrap.scrollHeight;
  }

  document.getElementById('conversationSearch').addEventListener('input', renderConversationList);
  document.getElementById('conversationList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-partner-id]');
    if (item) openThread(item.getAttribute('data-partner-id'));
  });

  document.getElementById('chatComposeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chatComposeInput');
    if (!input.value.trim() || !activePartnerId) return;
    Messages.send(user.id, activePartnerId, input.value.trim());
    input.value = '';
    renderThreadMessages();
    renderConversationList();
  });

  // New message modal
  const modal = document.getElementById('newMessageModal');
  document.getElementById('newMessageBtn').addEventListener('click', () => {
    const sel = document.getElementById('newMessageRecipient');
    const people = Messages.reachableUsers(user);
    sel.innerHTML = people.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.fullName)} (${Auth.ROLE_LABELS[p.role]})</option>`).join('')
      || `<option value="">No collaborators yet — join a project first</option>`;
    modal.hidden = false;
  });
  wireModalClose('newMessageModal');
  document.getElementById('startConversationBtn').addEventListener('click', () => {
    const partnerId = document.getElementById('newMessageRecipient').value;
    if (!partnerId) return;
    modal.hidden = true;
    openThread(partnerId);
  });

  renderConversationList();

  // Deep-link support: messages.html?to=<userId> opens straight into that thread.
  const preselect = Utils.getQueryParam('to');
  if (preselect) openThread(preselect);
}
