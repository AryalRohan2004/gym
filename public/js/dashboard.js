// ═══════════════════════════════════════════════
// GymPro Dashboard - Main Application Logic
// ═══════════════════════════════════════════════

// ─── Auth Check ────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    document.getElementById('adminName').textContent = data.admin.username;
    document.getElementById('adminAvatar').textContent = data.admin.username.charAt(0).toUpperCase();
  } catch { window.location.href = '/'; }
})();

// ─── Theme Toggle ──────────────────────────────
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');

function setTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    if (themeIcon) themeIcon.textContent = '🌙';
    if (themeText) themeText.textContent = 'Dark Mode';
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    if (themeIcon) themeIcon.textContent = '☀️';
    if (themeText) themeText.textContent = 'Light Mode';
    localStorage.setItem('theme', 'dark');
  }
}

// Initialize theme from local storage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
  setTheme(true);
} else {
  setTheme(false);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const isLightMode = document.body.classList.contains('light-mode');
    setTheme(!isLightMode);
  });
}

// ─── Toast Notifications ──────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── Navigation ───────────────────────────────
const navItems = document.querySelectorAll('.nav-item[data-page]');
const pages = document.querySelectorAll('.page-section');

function navigateTo(page) {
  navItems.forEach(n => n.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  const section = document.getElementById(`page-${page}`);
  if (nav) nav.classList.add('active');
  if (section) section.classList.add('active');
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  if (page === 'overview') loadDashboard();
  if (page === 'members') loadMembers();
  if (page === 'notifications') loadNotifications();
}

navItems.forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// Mobile toggle
document.getElementById('mobileToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Logout ───────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

// ═══════════════════════════════════════════════
// DASHBOARD / OVERVIEW
// ═══════════════════════════════════════════════

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const stats = await res.json();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statActive').textContent = stats.active;
    document.getElementById('statExpiring').textContent = stats.expiringSoon;
    document.getElementById('statExpired').textContent = stats.expired;

    // Load expiring soon list
    const expRes = await fetch('/api/members?status=active');
    const members = await expRes.json();
    const expiring = members.filter(m => m.days_remaining >= 0 && m.days_remaining <= 7);
    const container = document.getElementById('expiringList');

    if (expiring.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><h3>All good!</h3><p>No memberships expiring within 7 days</p></div>`;
      return;
    }

    container.innerHTML = expiring.map(m => `
      <div class="notif-item">
        <div class="notif-icon warning">⏰</div>
        <div class="notif-content">
          <div class="name">${escapeHtml(m.full_name)}</div>
          <div class="message">Membership expires on ${formatDate(m.expiry_date)} (${m.days_remaining} day${m.days_remaining !== 1 ? 's' : ''} remaining)</div>
          <div class="time">📱 ${m.phone}</div>
        </div>
        <button class="btn btn-success btn-sm" onclick="sendNotification(${m.id}, 'expiry_warning')">📨 Notify</button>
      </div>
    `).join('');
  } catch (err) {
    showToast('Failed to load dashboard', 'error');
  }
}

// ═══════════════════════════════════════════════
// MEMBERS CRUD
// ═══════════════════════════════════════════════

let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadMembers(), 300);
});
document.getElementById('statusFilter').addEventListener('change', () => loadMembers());

async function loadMembers() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  try {
    const res = await fetch(`/api/members?search=${encodeURIComponent(search)}&status=${status}`);
    const members = await res.json();
    renderMembers(members);
  } catch { showToast('Failed to load members', 'error'); }
}

function renderMembers(members) {
  const tbody = document.getElementById('membersBody');
  const empty = document.getElementById('emptyState');

  if (members.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    document.querySelector('#membersTableContainer').style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  document.querySelector('#membersTableContainer').style.display = 'block';

  tbody.innerHTML = members.map(m => {
    let statusClass = m.status;
    if (m.status === 'active' && m.days_remaining <= 7) statusClass = 'expiring';
    const statusLabel = statusClass === 'expiring' ? 'Expiring' : m.status;

    return `
    <tr>
      <td>
        <div class="member-name">${escapeHtml(m.full_name)}</div>
        ${m.email ? `<div class="member-phone">${escapeHtml(m.email)}</div>` : ''}
      </td>
      <td>${escapeHtml(m.phone)}</td>
      <td><span class="badge active">${m.plan_type}</span></td>
      <td>${formatDate(m.join_date)}</td>
      <td>${formatDate(m.expiry_date)}</td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="actions-cell">
          <button class="action-btn" title="Edit" onclick="editMember(${m.id})">✏️</button>
          <button class="action-btn notify" title="Send Notification" onclick="sendNotification(${m.id}, 'expiry_warning')">📨</button>
          <button class="action-btn delete" title="Delete" onclick="confirmDelete(${m.id}, '${escapeHtml(m.full_name)}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Add/Edit Modal ───────────────────────────
const modal = document.getElementById('memberModal');
const form = document.getElementById('memberForm');

document.getElementById('addMemberBtn').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'Add New Member';
  document.getElementById('modalSubmit').textContent = 'Add Member';
  form.reset();
  document.getElementById('memberId').value = '';
  document.getElementById('memberJoinDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('memberExpiryDate').value = '';
  modal.classList.add('active');
});

document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('modalCancel').addEventListener('click', () => modal.classList.remove('active'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

async function editMember(id) {
  try {
    const res = await fetch(`/api/members/${id}`);
    const m = await res.json();
    document.getElementById('modalTitle').textContent = 'Edit Member';
    document.getElementById('modalSubmit').textContent = 'Save Changes';
    document.getElementById('memberId').value = m.id;
    document.getElementById('memberName').value = m.full_name;
    document.getElementById('memberPhone').value = m.phone;
    document.getElementById('memberEmail').value = m.email || '';
    document.getElementById('memberAddress').value = m.address || '';
    document.getElementById('memberJoinDate').value = m.join_date;
    document.getElementById('memberDuration').value = m.duration_months;
    document.getElementById('memberExpiryDate').value = m.expiry_date || '';
    document.getElementById('memberPlan').value = m.plan_type;
    document.getElementById('memberNotes').value = m.notes || '';
    modal.classList.add('active');
  } catch { showToast('Failed to load member details', 'error'); }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('memberId').value;
  const body = {
    full_name: document.getElementById('memberName').value.trim(),
    phone: document.getElementById('memberPhone').value.trim(),
    email: document.getElementById('memberEmail').value.trim(),
    address: document.getElementById('memberAddress').value.trim(),
    join_date: document.getElementById('memberJoinDate').value,
    duration_months: parseInt(document.getElementById('memberDuration').value),
    expiry_date: document.getElementById('memberExpiryDate').value || undefined,
    plan_type: document.getElementById('memberPlan').value,
    notes: document.getElementById('memberNotes').value.trim()
  };

  try {
    const url = id ? `/api/members/${id}` : '/api/members';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(id ? 'Member updated successfully!' : 'New member added successfully!');
    modal.classList.remove('active');
    loadMembers();
    loadDashboard();
  } catch (err) { showToast(err.message || 'Failed to save member', 'error'); }
});

// ─── Delete Confirmation ──────────────────────
let deleteId = null;
const confirmDlg = document.getElementById('confirmDialog');

function confirmDelete(id, name) {
  deleteId = id;
  document.getElementById('confirmTitle').textContent = `Delete ${name}?`;
  document.getElementById('confirmMessage').textContent = 'This will permanently remove this member and their data.';
  confirmDlg.classList.add('active');
}

document.getElementById('confirmCancel').addEventListener('click', () => confirmDlg.classList.remove('active'));
confirmDlg.addEventListener('click', (e) => { if (e.target === confirmDlg) confirmDlg.classList.remove('active'); });

document.getElementById('confirmOk').addEventListener('click', async () => {
  if (!deleteId) return;
  try {
    const res = await fetch(`/api/members/${deleteId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Member deleted successfully');
    confirmDlg.classList.remove('active');
    deleteId = null;
    loadMembers();
    loadDashboard();
  } catch { showToast('Failed to delete member', 'error'); }
});

// ─── Send Notification ────────────────────────
async function sendNotification(id, type) {
  try {
    const res = await fetch(`/api/members/${id}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message || 'Notification sent!');
    loadNotifications();
  } catch (err) { showToast(err.message || 'Failed to send notification', 'error'); }
}

// ═══════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════

document.getElementById('notifFilter')?.addEventListener('change', () => loadNotifications());

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    let notifs = await res.json();
    const container = document.getElementById('notificationsList');
    const empty = document.getElementById('emptyNotifications');

    // Apply Filter
    const filter = document.getElementById('notifFilter').value;
    if (filter !== 'all') {
      notifs = notifs.filter(n => n.status === filter);
    }

    if (notifs.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = notifs.map(n => {
      // Determine styling based on type and status
      let iconClass = 'success';
      let iconEmoji = '📨';
      let typeClass = 'type-success';
      
      if (n.status === 'failed') {
        iconClass = 'expired';
        iconEmoji = '❌';
        typeClass = 'type-expired';
      } else if (n.type === 'expired') {
        iconClass = 'warning';
        iconEmoji = '⚠️';
        typeClass = 'type-warning';
      }

      // Calculate time ago
      const sentTime = new Date(n.sent_at);
      const now = new Date();
      const diffMs = now - sentTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      let timeStr = '';
      if (diffMins < 1) timeStr = 'Just now';
      else if (diffMins < 60) timeStr = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      else if (diffHours < 24) timeStr = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      else timeStr = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

      return `
      <div class="notif-item ${typeClass} slide-up">
        <div class="notif-icon ${iconClass}">${iconEmoji}</div>
        <div class="notif-content">
          <div class="header">
            <div class="name">${escapeHtml(n.full_name)} <span class="badge ${n.status}">${n.status}</span></div>
            <div style="display:flex; align-items:center; gap: 12px;">
              <div class="time">🕒 ${timeStr}</div>
              <button class="action-btn delete" style="width:28px; height:28px; font-size:12px;" onclick="deleteNotification(${n.id})" title="Delete Notification">🗑️</button>
            </div>
          </div>
          <div class="message">${escapeHtml(n.message)}</div>
          <div class="footer">
            <div class="phone">📱 ${n.phone}</div>
            <div class="time" style="font-size: 11px; color: var(--text-muted); border: none; padding: 0;">${sentTime.toLocaleString()}</div>
          </div>
        </div>
      </div>
      `;
    }).join('');
  } catch { showToast('Failed to load notifications', 'error'); }
}

async function deleteNotification(id) {
  if (!confirm('Are you sure you want to delete this notification?')) return;
  try {
    const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Notification deleted successfully');
    loadNotifications();
  } catch { showToast('Failed to delete notification', 'error'); }
}

// ═══════════════════════════════════════════════
// SETTINGS - Change Password
// ═══════════════════════════════════════════════

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Password updated successfully!');
    e.target.reset();
  } catch (err) { showToast(err.message || 'Failed to update password', 'error'); }
});

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Initial Load ─────────────────────────────
loadDashboard();
