const hikvision = require('./services/hikvisionService');

async function run() {
  console.log('Establishing LAN connection to Hikvision device (192.168.1.182)...');
  console.log('Setting webhook destination to laptop IP (192.168.1.115)...');
  
  const result = await hikvision.setupLanConnection('192.168.1.115');
  
  console.log('\n--- Result ---');
  if (result.success) {
    console.log('✅ ' + result.message);
  } else {
    console.log('❌ ' + result.message);
  }
}

run();
