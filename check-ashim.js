const db = require('./db/database');

function dumpAllMembers() {
  const members = db.getAllMembers('', 'all');
  console.log('--- ALL MEMBERS IN DB ---');
  members.forEach(m => {
    console.log(`ID: ${m.id} | Name: ${m.full_name} | Phone: ${m.phone} | Status: ${m.status}`);
  });
}

dumpAllMembers();
