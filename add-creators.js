const db = require('./db/database');

const creators = [
  {
    full_name: 'Saurav Kunwar',
    phone: '9869948065',
    email: '',
    address: 'Kathmandu',
    join_date: '2026-04-22',
    duration_months: 1200, // 100 years
    expiry_date: '2099-12-31',
    plan_type: 'Active',
    notes: 'Active Member'
  },
  {
    full_name: 'Ashim Pandey',
    phone: '9748788827',
    email: '',
    address: 'Kathmandu',
    join_date: '2026-04-22',
    duration_months: 1200, // 100 years
    expiry_date: '2099-12-31',
    plan_type: 'Active',
    notes: 'Active Member'
  }
];

console.log('Adding active creator accounts...');

try {
  for (const creator of creators) {
    // Check if they already exist based on phone number to avoid duplicates
    const allMembers = db.getAllMembers();
    const exists = allMembers.find(m => m.phone === creator.phone);
    
    if (exists) {
      console.log(`Creator ${creator.full_name} already exists. Updating to active access...`);
      db.updateMember(exists.id, { ...exists, ...creator });
    } else {
      console.log(`Adding ${creator.full_name}...`);
      db.addMember(creator);
    }
  }
  console.log('✅ Creators added successfully with Active Access (Expires 2099-12-31).');
} catch (error) {
  console.error('Error adding creators:', error);
}
