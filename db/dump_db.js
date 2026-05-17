const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'gym.db');
const db = new Database(dbPath);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

let output = "# Database Content\n\n";

tables.forEach(t => {
  output += `## Table: ${t.name}\n\n`;
  const columns = db.prepare(`PRAGMA table_info(${t.name})`).all();
  
  // Create table header
  output += "| " + columns.map(c => c.name).join(" | ") + " |\n";
  output += "| " + columns.map(c => "---").join(" | ") + " |\n";
  
  // Get first 10 rows
  const rows = db.prepare(`SELECT * FROM ${t.name} LIMIT 10`).all();
  if (rows.length === 0) {
    output += `| No records found in ${t.name} ` + columns.slice(1).map(c => "").join(" | ") + " |\n";
  } else {
    rows.forEach(r => {
      output += "| " + columns.map(c => {
        let val = r[c.name];
        if (val === null) return "NULL";
        return String(val).replace(/\|/g, '\\|').replace(/\n/g, '\\n');
      }).join(" | ") + " |\n";
    });
  }
  output += "\n\n";
});

console.log(output);
