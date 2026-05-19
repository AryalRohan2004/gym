const db = require('./db/database').db;

function debugDB() {
  const records = db.prepare('SELECT * FROM attendance ORDER BY id DESC LIMIT 10').all();
  console.log('--- LAST 10 ATTENDANCE RECORDS ---');
  console.log(records);
}

debugDB();
