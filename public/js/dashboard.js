// ═══════════════════════════════════════════════
// GymPro Dashboard - Main Application Logic
// ═══════════════════════════════════════════════

// ─── Auth Check ────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    if (data.admin.username === 'admin') {
      document.getElementById('adminName').textContent = 'Durga';
      document.getElementById('adminAvatar').innerHTML = '<img src="/images/durga.jpg" alt="Durga">';
    } else {
      document.getElementById('adminName').textContent = data.admin.username;
      document.getElementById('adminAvatar').textContent = data.admin.username.charAt(0).toUpperCase();
    }
  } catch { window.location.href = '/'; }
})();

// ─── Theme Toggle ──────────────────────────────
// Theme is locked to Light Mode with Dark Sidebar for premium visual balance.

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
  if (page === 'attendance') loadAttendancePage();
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
    document.getElementById('statTodayAttendance').textContent = stats.todayAttendance || 0;

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
  document.getElementById('memberDuration').value = '1';
  document.getElementById('memberPlan').value = 'Monthly';
  calculateExpiryDate();
  modal.classList.add('active');
});

document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('modalCancel').addEventListener('click', () => modal.classList.remove('active'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

// ─── Auto-calculate Expiry Date ───────────────────
function calculateExpiryDate() {
  const joinDateStr = document.getElementById('memberJoinDate').value;
  const durationStr = document.getElementById('memberDuration').value;
  
  if (durationStr === 'custom') {
    // Leave Expiry Date manual
    return;
  }
  
  if (joinDateStr && durationStr) {
    const joinDate = new Date(joinDateStr);
    const duration = parseInt(durationStr, 10);
    
    // Add months
    joinDate.setMonth(joinDate.getMonth() + duration);
    
    // Format to YYYY-MM-DD
    const expiryDateStr = joinDate.toISOString().split('T')[0];
    document.getElementById('memberExpiryDate').value = expiryDateStr;
    
    // Auto-select Plan Type based on duration
    const planSelect = document.getElementById('memberPlan');
    if (duration === 1) planSelect.value = 'Monthly';
    else if (duration === 3) planSelect.value = 'Quarterly';
    else if (duration === 6) planSelect.value = 'Half-Yearly';
    else if (duration === 12) planSelect.value = 'Yearly';
  }
}

function handleExpiryDateManualChange() {
  document.getElementById('memberDuration').value = 'custom';
}

document.getElementById('memberJoinDate').addEventListener('change', calculateExpiryDate);
document.getElementById('memberDuration').addEventListener('change', calculateExpiryDate);
document.getElementById('memberExpiryDate').addEventListener('change', handleExpiryDateManualChange);

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
  
  // Determine duration
  let durationVal = document.getElementById('memberDuration').value;
  let duration_months = 1;
  if (durationVal === 'custom') {
    const start = new Date(document.getElementById('memberJoinDate').value);
    const end = new Date(document.getElementById('memberExpiryDate').value);
    if (!isNaN(start) && !isNaN(end)) {
      duration_months = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30)));
    }
  } else {
    duration_months = parseInt(durationVal, 10);
  }

  const body = {
    full_name: document.getElementById('memberName').value.trim(),
    phone: document.getElementById('memberPhone').value.trim(),
    email: document.getElementById('memberEmail').value.trim(),
    address: document.getElementById('memberAddress').value.trim(),
    join_date: document.getElementById('memberJoinDate').value,
    duration_months: duration_months,
    expiry_date: document.getElementById('memberExpiryDate').value,
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
// ATTENDANCE
// ═══════════════════════════════════════════════

let currentAttendanceDate = new Date().toISOString().split('T')[0];
let currentShiftFilter = 'all';

async function loadAttendancePage() {
  await loadAttendanceSummary();
  await loadAttendance();
  setupCheckinSearch();
}

async function loadAttendanceSummary() {
  try {
    const res = await fetch('/api/attendance/summary');
    const summary = await res.json();
    const tabsContainer = document.getElementById('dateTabs');

    // Update today's mini stats
    if (summary.length > 0) {
      const today = summary[0];
      document.getElementById('attendMorning').textContent = today.morning;
      document.getElementById('attendDay').textContent = today.day;
      document.getElementById('attendTotal').textContent = today.total;
    }

    // Render date tabs
    tabsContainer.innerHTML = summary.map((s, i) => {
      const d = new Date(s.date + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const isActive = s.date === currentAttendanceDate;
      const isToday = i === 0;
      return `
        <button class="date-tab ${isActive ? 'active' : ''}" data-date="${s.date}">
          <span class="date-tab-day">${isToday ? 'Today' : dayName}</span>
          <span class="date-tab-num">${dayNum}</span>
          <span class="date-tab-month">${month}</span>
          <span class="date-tab-count">${s.total} ✓</span>
        </button>
      `;
    }).join('');

    // Attach click handlers
    tabsContainer.querySelectorAll('.date-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentAttendanceDate = tab.dataset.date;
        tabsContainer.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadAttendance();
      });
    });
  } catch { showToast('Failed to load attendance summary', 'error'); }
}

async function loadAttendance() {
  try {
    const res = await fetch(`/api/attendance?date=${currentAttendanceDate}&shift=${currentShiftFilter}`);
    const records = await res.json();
    const tbody = document.getElementById('attendanceBody');
    const empty = document.getElementById('emptyAttendance');
    const tableContainer = document.getElementById('attendanceTableContainer');

    if (records.length === 0) {
      tbody.innerHTML = '';
      tableContainer.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    tableContainer.style.display = 'block';

    tbody.innerHTML = records.map((r, idx) => {
      const time = new Date(r.check_in_time.replace(' ', 'T'));
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const shiftClass = r.shift === 'morning' ? 'shift-morning' : 'shift-day';
      const shiftLabel = r.shift === 'morning' ? '🌅 Morning' : '☀️ Day';

      return `
        <tr class="fade-in" style="animation-delay:${idx * 0.03}s">
          <td>${idx + 1}</td>
          <td><div class="member-name">${escapeHtml(r.full_name)}</div></td>
          <td>${escapeHtml(r.phone)}</td>
          <td>${timeStr}</td>
          <td><span class="badge ${shiftClass}">${shiftLabel}</span></td>
          <td class="actions-cell">
            <button class="action-btn delete btn-delete-attendance" data-id="${r.id}" title="Remove Record">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach delete handlers
    tbody.querySelectorAll('.btn-delete-attendance').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to remove this attendance record?')) {
          try {
            const res = await fetch(`/api/attendance/${btn.dataset.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
              showToast('Attendance record removed', 'success');
              loadAttendanceSummary(); // Reload to update counts and table
            } else {
              showToast(data.message || 'Failed to remove record', 'error');
            }
          } catch (err) {
            showToast('Failed to connect to server', 'error');
          }
        }
      });
    });
  } catch { showToast('Failed to load attendance', 'error'); }
}

// Shift filter buttons
document.querySelectorAll('.shift-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shift-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentShiftFilter = btn.dataset.shift;
    loadAttendance();
  });
});

// Check-in search with autocomplete
let checkinSearchTimeout;
let allMembersCache = [];

function setupCheckinSearch() {
  const input = document.getElementById('checkinSearch');
  const suggestions = document.getElementById('checkinSuggestions');

  input.addEventListener('input', () => {
    clearTimeout(checkinSearchTimeout);
    const query = input.value.trim();
    document.getElementById('checkinMemberId').value = '';

    if (query.length < 2) {
      suggestions.innerHTML = '';
      suggestions.style.display = 'none';
      return;
    }

    checkinSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members?search=${encodeURIComponent(query)}&status=all`);
        allMembersCache = await res.json();

        if (allMembersCache.length === 0) {
          suggestions.innerHTML = '<div class="suggestion-item no-result">No members found</div>';
          suggestions.style.display = 'block';
          return;
        }

        suggestions.innerHTML = allMembersCache.slice(0, 8).map(m => `
          <div class="suggestion-item" data-id="${m.id}" data-name="${escapeHtml(m.full_name)}">
            <span class="suggestion-name">${escapeHtml(m.full_name)}</span>
            <span class="suggestion-phone">${m.phone}</span>
            <span class="badge ${m.status}" style="font-size:10px;">${m.status}</span>
          </div>
        `).join('');
        suggestions.style.display = 'block';

        suggestions.querySelectorAll('.suggestion-item[data-id]').forEach(item => {
          item.addEventListener('click', () => {
            input.value = item.dataset.name;
            document.getElementById('checkinMemberId').value = item.dataset.id;
            suggestions.style.display = 'none';
          });
        });
      } catch { suggestions.style.display = 'none'; }
    }, 250);
  });

  // Hide suggestions on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.checkin-form')) {
      suggestions.style.display = 'none';
    }
  });
}

// Sync Device button
document.getElementById('syncHikvisionBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncHikvisionBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Syncing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/hikvision/sync');
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Successfully synced attendance from device', 'success');
      loadAttendanceSummary(); // Reload to show new entries
    } else {
      showToast(data.message || 'Failed to sync device', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

// Check-in button
document.getElementById('checkinBtn').addEventListener('click', async () => {
  const memberId = document.getElementById('checkinMemberId').value;
  const searchVal = document.getElementById('checkinSearch').value.trim();

  if (!memberId && !searchVal) {
    showToast('Please search and select a member first', 'error');
    return;
  }

  const body = memberId ? { member_id: parseInt(memberId) } : { phone: searchVal };

  try {
    const res = await fetch('/api/attendance/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Check-in failed', res.status === 409 ? 'info' : 'error');
      return;
    }

    showToast(data.message || 'Checked in successfully!');
    document.getElementById('checkinSearch').value = '';
    document.getElementById('checkinMemberId').value = '';
    document.getElementById('checkinSuggestions').style.display = 'none';

    // Refresh attendance data
    await loadAttendanceSummary();
    await loadAttendance();
  } catch { showToast('Failed to check in member', 'error'); }
});

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
// SETTINGS - Hikvision Hardware
// ═══════════════════════════════════════════════

async function loadHikvisionSettings() {
  try {
    const res = await fetch('/api/hikvision/settings');
    const config = await res.json();
    if (config.ip) document.getElementById('hikIp').value = config.ip;
    if (config.port) document.getElementById('hikPort').value = config.port;
    if (config.username) document.getElementById('hikUsername').value = config.username;
    if (config.password) document.getElementById('hikPassword').value = config.password;
  } catch (err) {
    console.error('Failed to load Hikvision settings', err);
  }
}

// Load settings when the settings page is opened
document.getElementById('nav-settings').addEventListener('click', loadHikvisionSettings);

document.getElementById('hikvisionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ip = document.getElementById('hikIp').value.trim();
  const port = document.getElementById('hikPort').value.trim();
  const username = document.getElementById('hikUsername').value.trim();
  const password = document.getElementById('hikPassword').value;

  try {
    const res = await fetch('/api/hikvision/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message);
    showToast('Hikvision settings saved successfully!');
  } catch (err) {
    showToast(err.message || 'Failed to save settings', 'error');
  }
});

document.getElementById('hikTestBtn').addEventListener('click', async () => {
  const ip = document.getElementById('hikIp').value.trim();
  const port = document.getElementById('hikPort').value.trim();
  const username = document.getElementById('hikUsername').value.trim();
  const password = document.getElementById('hikPassword').value;

  if (!ip) return showToast('Device IP is required to test connection', 'error');

  const btn = document.getElementById('hikTestBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Testing...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/hikvision/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, username, password })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Connection successful!', 'success');
    } else {
      showToast(data.message || 'Connection failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

document.getElementById('hikSetupLanBtn').addEventListener('click', async () => {
  const laptopIp = document.getElementById('laptopIp').value.trim();
  
  if (!laptopIp) return showToast('Please enter the IP address of this computer', 'error');

  const btn = document.getElementById('hikSetupLanBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Setting up...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/hikvision/setup-lan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ laptopIp })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'LAN Setup successful!', 'success');
    } else {
      showToast(data.message || 'LAN Setup failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
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

function toTitleCase(str) {
  if (!str) return '';
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ─── Real-Time Attendance via SSE ──────────────
const evtSource = new EventSource('/api/attendance/stream');
evtSource.onmessage = function(event) {
  try {
    const data = JSON.parse(event.data);
    const memberName = toTitleCase(data.member_name);
    if (data.duplicate) {
      showToast(`${memberName} already checked in for ${data.shift} shift`, 'info');
    } else {
      showToast(`${memberName} checked in! (${data.shift} shift)`, 'success');
      
      // If we are on the attendance page, refresh the list
      const attendancePage = document.getElementById('page-attendance');
      if (attendancePage && attendancePage.classList.contains('active')) {
        loadAttendanceSummary();
        loadAttendance();
      }
      
      // If on overview page, refresh dashboard stats
      const overviewPage = document.getElementById('page-overview');
      if (overviewPage && overviewPage.classList.contains('active')) {
        loadDashboard();
      }
    }
  } catch (err) {
    console.error('Error parsing SSE data:', err);
  }
};

// ─── Initial Load ─────────────────────────────
loadDashboard();
