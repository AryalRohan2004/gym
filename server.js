require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db/database');
const { requireAuth, requirePageAuth } = require('./middleware/auth');
const { startScheduler, sendSMS, notifyMember } = require('./cron/notifier');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gym-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Block direct access to dashboard.html to enforce authentication via /dashboard route
app.use((req, res, next) => {
  if (req.path === '/dashboard.html') {
    return res.redirect('/dashboard');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Seed Admin ─────────────────────────────────────────────
db.seedAdmin(
  process.env.ADMIN_USERNAME || 'admin',
  process.env.ADMIN_PASSWORD || 'admin123'
);

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.getAdminByUsername(username);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.admin = { id: admin.id, username: admin.username };
  res.json({ success: true, admin: { id: admin.id, username: admin.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ admin: req.session.admin });
});

// ═══════════════════════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/members', requireAuth, (req, res) => {
  const { search, status } = req.query;
  const members = db.getAllMembers(search || '', status || '');

  // Add computed remaining days to each member
  const membersWithExpiry = members.map(m => {
    const expiry = new Date(m.expiry_date);
    const now = new Date();
    expiry.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return {
      ...m,
      days_remaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
    };
  });

  res.json(membersWithExpiry);
});

app.get('/api/members/expiring', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || parseInt(process.env.NOTIFY_DAYS_BEFORE) || 3;
  const members = db.getMembersExpiringSoon(days);
  res.json(members);
});

app.get('/api/members/:id', requireAuth, (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  res.json(member);
});

app.post('/api/members', requireAuth, (req, res) => {
  const { full_name, phone, email, address, join_date, duration_months, expiry_date, plan_type, notes } = req.body;

  if (!full_name || !phone || !join_date || !duration_months) {
    return res.status(400).json({ error: 'Name, phone, join date, and duration are required.' });
  }

  const computedExpiry = db.getExpiryDate(join_date, duration_months).toISOString().split('T')[0];
  const finalExpiry = expiry_date || computedExpiry;

  const member = db.addMember({
    full_name, phone, email, address, join_date,
    duration_months: parseInt(duration_months),
    expiry_date: finalExpiry,
    plan_type: plan_type || 'Monthly',
    notes
  });

  res.status(201).json(member);
});

app.put('/api/members/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getMemberById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const { full_name, phone, email, address, join_date, duration_months, expiry_date, plan_type, status, notes } = req.body;

  const updatedJoinDate = join_date || existing.join_date;
  const updatedDuration = duration_months ? parseInt(duration_months) : existing.duration_months;

  let finalExpiry = existing.expiry_date;
  if (expiry_date) {
    finalExpiry = expiry_date;
  } else if (join_date || duration_months) {
    finalExpiry = db.getExpiryDate(updatedJoinDate, updatedDuration).toISOString().split('T')[0];
  }

  let finalStatus = status || existing.status;
  if (finalExpiry) {
    const expiryObj = new Date(finalExpiry);
    expiryObj.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    if (expiryObj >= now) {
      finalStatus = 'active';
    } else {
      finalStatus = 'expired';
    }
  }

  const member = db.updateMember(id, {
    full_name: full_name || existing.full_name,
    phone: phone || existing.phone,
    email: email !== undefined ? email : existing.email,
    address: address !== undefined ? address : existing.address,
    join_date: updatedJoinDate,
    duration_months: updatedDuration,
    expiry_date: finalExpiry,
    plan_type: plan_type || existing.plan_type,
    status: finalStatus,
    notes: notes !== undefined ? notes : existing.notes
  });

  res.json(member);
});

app.delete('/api/members/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getMemberById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  db.deleteMember(id);
  res.json({ success: true, message: 'Member deleted.' });
});

// ═══════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/members/:id/notify', requireAuth, async (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  try {
    await notifyMember(member, req.body.type || 'expiry_warning');
    res.json({ success: true, message: `Notification sent to ${member.full_name}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send notification: ' + err.message });
  }
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.getNotifications(parseInt(req.query.limit) || 50);
  res.json(notifications);
});

app.delete('/api/notifications/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  db.deleteNotification(id);
  res.json({ success: true, message: 'Notification deleted.' });
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const stats = db.getDashboardStats();
  res.json(stats);
});

// ═══════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════

app.put('/api/admin/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.getAdminByUsername(req.session.admin.username);

  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.updateAdminPassword(admin.id, hash);
  res.json({ success: true, message: 'Password updated successfully.' });
});

// ─── Serve Pages ────────────────────────────────────────────
app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏋️  GymPro Management System`);
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  console.log(`👤 Default login: admin / admin123\n`);

  // Start notification scheduler
  startScheduler();
});
