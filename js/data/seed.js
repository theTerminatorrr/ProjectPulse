/* ==========================================================================
   ProjectPulse — seed.js
   Populates localStorage with demo users/projects/tasks/feedback the first
   time the app runs, so Demo Login buttons and empty-state-free browsing
   work immediately. Never overwrites data that already exists.
   ========================================================================== */

const Seed = {
  SEED_FLAG: 'pt_seeded',

  run() {
    if (localStorage.getItem(this.SEED_FLAG)) return;

    const now = new Date().toISOString();

    const users = [
      { id: 'u_teacher1', fullName: 'Dr. Farah Chowdhury', studentId: '', email: 'teacher@demo.com', department: 'Computer Science', semester: '', password: btoa('demo123'), role: 'teacher', avatar: '', bio: 'Course instructor for Web Programming.', suspended: false, createdAt: now },
      { id: 'u_admin1', fullName: 'System Administrator', studentId: '', email: 'admin@demo.com', department: 'IT Administration', semester: '', password: btoa('demo123'), role: 'admin', avatar: '', bio: 'Platform administrator.', suspended: false, createdAt: now },
      { id: 'u_leader1', fullName: 'Ayesha Rahman', studentId: '0112410544', email: 'leader@demo.com', department: 'Computer Science', semester: 'Summer 2026', password: btoa('demo123'), role: 'leader', avatar: '', bio: 'Team lead, front-end focused.', suspended: false, createdAt: now },
      { id: 'u_member1', fullName: 'Tanvir Ahmed', studentId: '0112410358', email: 'member@demo.com', department: 'Computer Science', semester: 'Summer 2026', password: btoa('demo123'), role: 'member', avatar: '', bio: 'Handles backend logic and data.', suspended: false, createdAt: now },
      { id: 'u_member2', fullName: 'Nusrat Jahan', studentId: '0112330060', email: 'nusrat@demo.com', department: 'Computer Science', semester: 'Summer 2026', password: btoa('demo123'), role: 'member', avatar: '', bio: 'UI/UX and documentation.', suspended: false, createdAt: now },
      { id: 'u_member3', fullName: 'Rakib Hasan', studentId: '0112410076', email: 'rakib@demo.com', department: 'Computer Science', semester: 'Summer 2026', password: btoa('demo123'), role: 'member', avatar: '', bio: 'Testing and QA.', suspended: false, createdAt: now },
    ];

    const projects = [
      {
        id: 'p_ecommerce', title: 'E-Commerce Website', description: 'A responsive online store with cart, checkout simulation, and an admin product panel.',
        courseName: 'Web Programming', teacherId: 'u_teacher1', leaderId: 'u_leader1',
        memberIds: ['u_leader1', 'u_member1', 'u_member2'],
        deadline: addDays(21), status: 'development', createdAt: now,
      },
      {
        id: 'p_campusapp', title: 'Campus Event Finder', description: 'A tool for students to browse and RSVP to campus events, with calendar sync.',
        courseName: 'Web Programming', teacherId: 'u_teacher1', leaderId: 'u_leader1',
        memberIds: ['u_leader1', 'u_member3'],
        deadline: addDays(45), status: 'planning', createdAt: now,
      },
    ];

    const tasks = [
      { id: 't_1', projectId: 'p_ecommerce', title: 'Design login page', description: 'Create the login/register UI following the navy gradient theme.', assigneeIds: ['u_member2'], priority: 'high', status: 'in_progress', progress: 60, dueDate: addDays(3), estimatedHours: 4, subtasks: [{ text: 'Wireframe', done: true }, { text: 'Build markup', done: true }, { text: 'Style form states', done: false }], history: [{ userId: 'u_member2', change: 'Progress updated to 60%', date: now }], comments: [{ userId: 'u_member2', text: 'Wireframe approved, moving to build.', date: now }], attachments: [] },
      { id: 't_2', projectId: 'p_ecommerce', title: 'Build product listing grid', description: 'Responsive grid of product cards with filter/sort.', assigneeIds: ['u_member1'], priority: 'medium', status: 'todo', progress: 0, dueDate: addDays(7), estimatedHours: 6, subtasks: [], history: [], comments: [], attachments: [] },
      { id: 't_3', projectId: 'p_ecommerce', title: 'Implement cart logic', description: 'Add/remove items, quantity, totals — persisted in localStorage.', assigneeIds: ['u_member1'], priority: 'high', status: 'todo', progress: 0, dueDate: addDays(10), estimatedHours: 8, subtasks: [], history: [], comments: [], attachments: [] },
      { id: 't_4', projectId: 'p_ecommerce', title: 'Write project README', description: 'Setup instructions, demo accounts, feature list.', assigneeIds: ['u_member2'], priority: 'low', status: 'review', progress: 90, dueDate: addDays(14), estimatedHours: 2, subtasks: [], history: [], comments: [], attachments: [] },
      { id: 't_5', projectId: 'p_campusapp', title: 'Sketch app wireframes', description: 'Low-fidelity wireframes for the main screens.', assigneeIds: ['u_member3'], priority: 'medium', status: 'done', progress: 100, dueDate: addDays(-2), estimatedHours: 3, subtasks: [], history: [], comments: [], attachments: [] },
    ];

    const feedback = [
      { id: 'f_1', projectId: 'p_ecommerce', taskId: 't_1', teacherId: 'u_teacher1', message: 'Great progress on the login page — refine the color contrast on the placeholder text before final submission.', category: 'ui', priority: 'normal', rating: 4, resolved: false, replies: [], createdAt: now },
      { id: 'f_2', projectId: 'p_ecommerce', taskId: null, teacherId: 'u_teacher1', message: 'Overall the project is on track. Make sure the README documents your data model clearly.', category: 'documentation', priority: 'important', rating: 0, resolved: false, replies: [{ userId: 'u_leader1', text: 'Will do — updating the README this week.', date: now }], createdAt: now },
    ];

    const notifications = [
      { id: 'n_1', userId: 'u_member2', type: 'feedback', message: 'You received feedback on "Design login page"', relatedId: 'f_1', read: false, createdAt: now },
      { id: 'n_2', userId: 'u_leader1', type: 'feedback', message: 'New feedback on E-Commerce Website', relatedId: 'f_2', read: false, createdAt: now },
      { id: 'n_3', userId: 'u_member1', type: 'task_assigned', message: 'You were assigned "Build product listing grid"', relatedId: 't_2', read: true, createdAt: now },
    ];

    const events = [
      { id: 'e_1', title: 'Sprint review meeting', date: addDays(5), type: 'meeting', projectId: 'p_ecommerce' },
      { id: 'e_2', title: 'Final submission', date: addDays(21), type: 'submission', projectId: 'p_ecommerce' },
      { id: 'e_3', title: 'Progress presentation', date: addDays(12), type: 'presentation', projectId: 'p_campusapp' },
    ];

    const messages = [
      { id: 'm_1', senderId: 'u_leader1', recipientId: 'u_member2', text: 'Hey, how\'s the login page coming along?', read: true, createdAt: now },
      { id: 'm_2', senderId: 'u_member2', recipientId: 'u_leader1', text: 'Almost done — just styling the form states now.', read: true, createdAt: now },
      { id: 'm_3', senderId: 'u_teacher1', recipientId: 'u_leader1', text: 'Good progress on the E-Commerce project so far.', read: false, createdAt: now },
    ];

    Storage.setAll('users', users);
    Storage.setAll('projects', projects);
    Storage.setAll('tasks', tasks);
    Storage.setAll('feedback', feedback);
    Storage.setAll('notifications', notifications);
    Storage.setAll('events', events);
    Storage.setAll('announcements', []);
    Storage.setAll('notes', []);
    Storage.setAll('messages', messages);

    localStorage.setItem(this.SEED_FLAG, '1');
  },

  /** Used by Settings > Reset demo data. */
  reset() {
    Storage.clearAll();
    localStorage.removeItem(this.SEED_FLAG);
    this.run();
  },
};

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
