const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const EventEmitter = require('events');

const dbEvents = new EventEmitter();

// In a packaged Electron app, we cannot write to the .asar archive. 
// We use an environment variable to set a writable directory (e.g., AppData).
const dbDir = process.env.GYMPRO_DB_DIR || __dirname;
const dbPath = path.join(dbDir, 'gym.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ─── Create Tables ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    join_date DATE NOT NULL,
    duration_months INTEGER NOT NULL,
    expiry_date DATE,
    plan_type TEXT NOT NULL DEFAULT 'Monthly',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    check_in_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date DATE NOT NULL,
    shift TEXT NOT NULL CHECK(shift IN ('morning', 'day')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );
`);

// ─── Migration for expiry_date ──────────────────────────────
try {
  db.exec('ALTER TABLE members ADD COLUMN expiry_date DATE;');
  // Initialize expiry_date for existing rows using JS logic to be safe since SQLite dates can be tricky
  const members = db.prepare('SELECT id, join_date, duration_months FROM members WHERE expiry_date IS NULL').all();
  for (const m of members) {
    const date = new Date(m.join_date);
    date.setMonth(date.getMonth() + m.duration_months);
    const expiry = date.toISOString().split('T')[0];
    db.prepare('UPDATE members SET expiry_date = ? WHERE id = ?').run(expiry, m.id);
  }
} catch (e) {
  // Column already exists or error
}

// ─── Seed Default Admin ─────────────────────────────────────
function seedAdmin(username, password) {
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`✅ Default admin "${username}" created.`);
  }
}

// ─── Admin Queries ──────────────────────────────────────────
function getAdminByUsername(username) {
  return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
}

function updateAdminPassword(id, newPasswordHash) {
  return db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newPasswordHash, id);
}

// ─── Member Queries ─────────────────────────────────────────
function getAllMembers(search = '', statusFilter = '') {
  let query = 'SELECT * FROM members WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (statusFilter && statusFilter !== 'all') {
    query += ' AND status = ?';
    params.push(statusFilter);
  }

  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all(...params);
}

function getMemberById(id) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(id);
}

function addMember(member) {
  const stmt = db.prepare(`
    INSERT INTO members (full_name, phone, email, address, join_date, duration_months, expiry_date, plan_type, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `);
  const result = stmt.run(
    member.full_name,
    member.phone,
    member.email || '',
    member.address || '',
    member.join_date,
    member.duration_months,
    member.expiry_date,
    member.plan_type,
    member.notes || ''
  );
  return getMemberById(result.lastInsertRowid);
}

function updateMember(id, member) {
  const protectedNames = ['saurav kunwar', 'ashim pandey'];
  let status = member.status || 'active';
  if (protectedNames.includes(member.full_name.toLowerCase())) {
    status = 'active';
  }

  const stmt = db.prepare(`
    UPDATE members SET
      full_name = ?, phone = ?, email = ?, address = ?,
      join_date = ?, duration_months = ?, expiry_date = ?, plan_type = ?,
      status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(
    member.full_name,
    member.phone,
    member.email || '',
    member.address || '',
    member.join_date,
    member.duration_months,
    member.expiry_date,
    member.plan_type,
    status,
    member.notes || '',
    id
  );
  return getMemberById(id);
}

function deleteMember(id) {
  const existing = getMemberById(id);
  if (existing) {
    const protectedNames = ['saurav kunwar', 'ashim pandey'];
    if (protectedNames.includes(existing.full_name.toLowerCase())) {
      throw new Error('Protected members cannot be deleted.');
    }
  }
  return db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

// ─── Expiry Calculation ─────────────────────────────────────
function getExpiryDate(joinDate, durationMonths) {
  const date = new Date(joinDate);
  date.setMonth(date.getMonth() + durationMonths);
  return date;
}

function getMembersExpiringOn(targetDate) {
  const allActive = db.prepare("SELECT * FROM members WHERE status = 'active'").all();
  return allActive.filter(m => {
    const expiry = new Date(m.expiry_date);
    const target = new Date(targetDate);
    return (
      expiry.getFullYear() === target.getFullYear() &&
      expiry.getMonth() === target.getMonth() &&
      expiry.getDate() === target.getDate()
    );
  });
}

function getMembersExpiringSoon(days) {
  const allActive = db.prepare("SELECT * FROM members WHERE status = 'active'").all();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return allActive.filter(m => {
    const expiry = new Date(m.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
  });
}

function updateExpiredMembers() {
  const allActive = db.prepare("SELECT * FROM members WHERE status = 'active'").all();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let count = 0;

  const protectedNames = ['saurav kunwar', 'ashim pandey'];

  for (const m of allActive) {
    if (protectedNames.includes(m.full_name.toLowerCase())) {
      continue;
    }
    const expiry = new Date(m.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    if (expiry < now) {
      db.prepare("UPDATE members SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(m.id);
      count++;
    }
  }
  return count;
}

// ─── Dashboard Stats ────────────────────────────────────────
function getDashboardStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM members').get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'active'").get().count;
  const expired = db.prepare("SELECT COUNT(*) as count FROM members WHERE status = 'expired'").get().count;
  const expiringSoon = getMembersExpiringSoon(parseInt(process.env.NOTIFY_DAYS_BEFORE) || 3).length;

  return { total, active, expired, expiringSoon };
}

// ─── Notification Queries ───────────────────────────────────
function logNotification(memberId, type, message, status = 'sent') {
  return db.prepare(
    'INSERT INTO notifications (member_id, type, message, status) VALUES (?, ?, ?, ?)'
  ).run(memberId, type, message, status);
}

function getNotifications(limit = 50) {
  const notifs = db.prepare(`
    SELECT n.*, m.full_name, m.phone
    FROM notifications n
    JOIN members m ON n.member_id = m.id
    ORDER BY n.sent_at DESC
    LIMIT ?
  `).all(limit);
  
  // Append Z to sent_at so the browser parses the SQLite UTC timestamp correctly
  return notifs.map(n => {
    if (n.sent_at && !n.sent_at.endsWith('Z')) {
      n.sent_at = n.sent_at.replace(' ', 'T') + 'Z';
    }
    return n;
  });
}

function hasRecentNotification(memberId, type, hoursAgo = 20) {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE member_id = ? AND type = ? AND sent_at > datetime('now', '-' || ? || ' hours')
  `).get(memberId, type, hoursAgo);
  return result.count > 0;
}

function deleteNotification(id) {
  return db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
}

// ─── Settings Queries ───────────────────────────────────────
function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// ─── Attendance Queries ─────────────────────────────────────

// Helper: get local date string (YYYY-MM-DD) avoiding UTC offset issues
function getLocalDateStr(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTimeStr(date) {
  const d = date || new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${getLocalDateStr(d)} ${hours}:${mins}:${secs}`;
}

function recordAttendance(memberId, timestamp = null) {
  // Always use the computer's local system time to avoid timezone/clock mismatches from the device
  const now = new Date();
  const date = getLocalDateStr(now);
  const hour = now.getHours();
  const shift = hour < 12 ? 'morning' : 'day';

  // Check for duplicate check-in (same member, same date, same shift)
  const existing = db.prepare(
    'SELECT id FROM attendance WHERE member_id = ? AND date = ? AND shift = ?'
  ).get(memberId, date, shift);

  if (existing) {
    const resultObj = { duplicate: true, shift, date };
    // Do not emit event for duplicates to prevent spam during background polling
    return resultObj;
  }

  const checkInTime = getLocalTimeStr(now);
  const result = db.prepare(
    'INSERT INTO attendance (member_id, check_in_time, date, shift) VALUES (?, ?, ?, ?)'
  ).run(memberId, checkInTime, date, shift);

  const resultObj = { id: result.lastInsertRowid, shift, date, check_in_time: checkInTime, duplicate: false };
  dbEvents.emit('attendance', { ...resultObj, memberId });
  return resultObj;
}

function deleteAttendance(id) {
  const result = db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
  return result.changes > 0;
}

function getAttendanceByDate(date, shift = '') {
  let query = `
    SELECT a.*, m.full_name, m.phone, m.status as member_status
    FROM attendance a
    JOIN members m ON a.member_id = m.id
    WHERE a.date = ?
  `;
  const params = [date];

  if (shift && shift !== 'all') {
    query += ' AND a.shift = ?';
    params.push(shift);
  }

  query += ' ORDER BY a.check_in_time DESC';
  return db.prepare(query).all(...params);
}

function getAttendanceSummary(days = 7) {
  const results = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = getLocalDateStr(d);

    const morning = db.prepare(
      "SELECT COUNT(*) as count FROM attendance WHERE date = ? AND shift = 'morning'"
    ).get(dateStr).count;

    const day = db.prepare(
      "SELECT COUNT(*) as count FROM attendance WHERE date = ? AND shift = 'day'"
    ).get(dateStr).count;

    results.push({
      date: dateStr,
      morning,
      day,
      total: morning + day
    });
  }

  return results;
}

function getTodayAttendanceCount() {
  const today = getLocalDateStr();
  return db.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ?').get(today).count;
}

module.exports = {
  db,
  dbEvents,
  seedAdmin,
  getAdminByUsername,
  updateAdminPassword,
  getAllMembers,
  getMemberById,
  addMember,
  updateMember,
  deleteMember,
  getExpiryDate,
  getMembersExpiringOn,
  getMembersExpiringSoon,
  updateExpiredMembers,
  getDashboardStats,
  logNotification,
  getNotifications,
  deleteNotification,
  hasRecentNotification,
  getSetting,
  setSetting,
  recordAttendance,
  deleteAttendance,
  getAttendanceByDate,
  getAttendanceSummary,
  getTodayAttendanceCount
};
