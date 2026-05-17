const db = require('./db/database');
const hikvision = require('./services/hikvisionService');

async function debugHikvision() {
  console.log('\n======================================');
  console.log('🔍 HIKVISION DIAGNOSTIC TOOL 🔍');
  console.log('======================================\n');

  const config = hikvision.getHikvisionConfig();
  console.log('1. Checking current database settings:');
  console.log(`   - IP: ${config.ip}`);
  console.log(`   - Port: ${config.port}`);
  console.log(`   - Username: ${config.username}`);
  console.log(`   - Password: ${config.password ? '******** (Set)' : 'EMPTY - THIS WILL CAUSE FAILURES'}`);

  if (!config.password) {
    console.log('\n❌ ERROR: Your Hikvision password is not set in the database!');
    console.log('You must set it in the web dashboard before the system can communicate with the device.');
    return;
  }

  console.log('\n2. Testing connection to device...');
  const testResult = await hikvision.testHikvisionConnection(config.ip, config.port, config.username, config.password);
  
  if (!testResult.success) {
    console.log(`\n❌ CONNECTION FAILED!`);
    console.log(`Reason: ${testResult.message}`);
    console.log(`\nPlease verify your IP (192.168.1.182) and the admin password for your Hikvision device.`);
    return;
  }

  console.log('\n✅ CONNECTION SUCCESSFUL!');

  console.log('\n3. Establishing LAN Webhook (Telling Hikvision to talk to laptop)...');
  const lanResult = await hikvision.setupLanConnection('192.168.1.115');
  if (lanResult.success) {
    console.log('✅ Webhook setup successful!');
  } else {
    console.log(`❌ Webhook setup failed: ${lanResult.message}`);
  }

  console.log('\n4. Force Syncing ALL Expired Members to Device...');
  const members = db.getAllMembers('', 'all');
  let syncCount = 0;
  for (const m of members) {
    if (m.status === 'expired') {
      const syncRes = await hikvision.syncMemberToDevice(m);
      if (syncRes.success) {
        console.log(`   ✅ Synced EXPIRED status for ${m.full_name} (${m.phone}) to lock them out.`);
        syncCount++;
      } else {
        console.log(`   ❌ Failed to sync ${m.full_name}: ${syncRes.status || syncRes.message}`);
      }
    }
  }

  console.log(`\n🎉 Diagnostics complete! Synced ${syncCount} expired members.`);
  console.log('======================================\n');
}

debugHikvision();
