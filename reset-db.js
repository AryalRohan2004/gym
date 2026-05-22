const db = require('./db/database');
const hikvisionService = require('./services/hikvisionService');

async function resetAll() {
  console.log('Fetching all members from database...');
  const members = db.getAllMembers('', 'all');
  
  if (members.length === 0) {
    console.log('No members found in database.');
  } else {
    console.log(`Found ${members.length} members. Deleting from Hikvision and database...`);
    for (const member of members) {
      console.log(`Deleting ${member.full_name} from Hikvision...`);
      
      // We trick the Hikvision service into permanently deleting them 
      // by temporarily marking their status as 'expired' before running the sync
      member.status = 'expired';
      await hikvisionService.syncMemberToDevice(member);
      
      console.log(`Deleting ${member.full_name} from Database...`);
      db.deleteMember(member.id);
    }
  }

  console.log('Clearing attendance and notifications tables...');
  db.db.prepare('DELETE FROM attendance').run();
  db.db.prepare('DELETE FROM notifications').run();
  
  // Reset the SQLite auto-increment counters so the next member is ID 1 again
  db.db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('members', 'attendance', 'notifications')").run();
  
  console.log('✅ All members, attendance, and notifications have been completely wiped from the software and Hikvision device.');
  process.exit(0);
}

resetAll();
