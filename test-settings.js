const db = require('./db/database');

console.log('Testing settings...');
console.log('1. Setting laptop_ip to "192.168.1.99"');
db.setSetting('laptop_ip', '192.168.1.99');

console.log('2. Getting laptop_ip from DB:');
const val = db.getSetting('laptop_ip');
console.log(`laptop_ip = ${val}`);

if (val === '192.168.1.99') {
  console.log('✅ Setting saved and retrieved successfully!');
} else {
  console.log('❌ Failed to retrieve setting!');
}
