const cron = require('node-cron');
const db = require('../db/database');
const hikvision = require('../services/hikvisionService');

let twilioClient = null;
let twilioPhone = null;

// Initialize Twilio if credentials are available
function initTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (sid && token && twilioPhone) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(sid, token);
      console.log('📱 Twilio SMS initialized successfully.');
      return true;
    } catch (err) {
      console.log('⚠️  Twilio initialization failed:', err.message);
      return false;
    }
  } else {
    console.log('📱 Twilio not configured — SMS notifications will be logged to console.');
    return false;
  }
}

// Send SMS (or log to console if Twilio not configured)
async function sendSMS(phone, message) {
  if (twilioClient && twilioPhone) {
    try {
      const result = await twilioClient.messages.create({
        body: message,
        from: twilioPhone,
        to: phone
      });
      console.log(`📨 SMS sent to ${phone}: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (err) {
      console.error(`❌ SMS failed to ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  } else {
    console.log(`📨 [CONSOLE SMS] To: ${phone}`);
    console.log(`   Message: ${message}`);
    return { success: true, sid: 'console-log' };
  }
}

// Notify a single member
async function notifyMember(member, type) {
  // Check if we already notified recently
  if (db.hasRecentNotification(member.id, type)) {
    console.log(`⏭️  Skipping ${member.full_name} — already notified recently.`);
    return;
  }

  const expiryDate = new Date(member.expiry_date);
  const formattedDate = expiryDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  let message;
  if (type === 'expiry_warning') {
    message = `🏋️ Hi ${member.full_name}! Your gym membership is expiring on ${formattedDate}. Please renew to continue your fitness journey! - GymPro Management`;
  } else {
    message = `🏋️ Hi ${member.full_name}! Your gym membership has expired on ${formattedDate}. Visit us to renew and keep crushing your goals! - GymPro Management`;
  }

  const result = await sendSMS(member.phone, message);
  db.logNotification(
    member.id,
    type,
    message,
    result.success ? 'sent' : 'failed'
  );
}

// Run the daily check
async function runDailyCheck() {
  console.log('\n🔍 Running daily membership check...');

  // Update expired members in DB and sync to Hikvision
  const allActive = db.getAllMembers('', 'active');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const newlyExpired = [];
  for (const m of allActive) {
    const expiry = new Date(m.expiry_date);
    expiry.setHours(0, 0, 0, 0);
    if (expiry < now) newlyExpired.push(m);
  }

  const expiredCount = db.updateExpiredMembers();
  if (expiredCount > 0) {
    console.log(`📋 Marked ${expiredCount} member(s) as expired.`);
    // Sync each newly expired member to Hikvision
    for (const m of newlyExpired) {
      const expiredMember = { ...m, status: 'expired' };
      const result = await hikvision.syncMemberToDevice(expiredMember);
      if (result.success) {
        console.log(`🔒 [Hikvision] ${m.full_name} disabled on device — membership expired.`);
      } else {
        console.log(`⚠️  [Hikvision] Could not disable ${m.full_name} on device: ${result.message || ''}`);
      }
    }
  }

  const daysBeforeNotify = parseInt(process.env.NOTIFY_DAYS_BEFORE) || 3;

  // Notify members expiring soon (within N days)
  const expiringSoon = db.getMembersExpiringSoon(daysBeforeNotify);
  console.log(`⏰ ${expiringSoon.length} member(s) expiring within ${daysBeforeNotify} days.`);

  for (const member of expiringSoon) {
    const expiry = new Date(member.expiry_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      await notifyMember(member, 'expired');
    } else {
      await notifyMember(member, 'expiry_warning');
    }
  }

  console.log('✅ Daily check complete.\n');
}

// Start the cron scheduler
function startScheduler() {
  initTwilio();

  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    runDailyCheck();
  });

  console.log('⏰ Notification scheduler started (runs daily at 9:00 AM).');

  // Also run immediately on startup
  setTimeout(() => {
    runDailyCheck();
  }, 2000);
}

module.exports = { startScheduler, sendSMS, notifyMember, runDailyCheck };
