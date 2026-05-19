const db = require('./db/database');
const hikvision = require('./services/hikvisionService');

async function debugEvents() {
  console.log('Running custom ISAPI query for events...');
  
  const config = hikvision.getHikvisionConfig();
  if (!config.ip) return console.log("IP not configured.");

  const url = `http://${config.ip}:${config.port}/ISAPI/AccessControl/AcsEvent?format=json`;
  
  // Very broad time range to see if ANY events exist
  const payload = {
    "AcsEventCond": {
      "searchID": "test-poll",
      "searchResultPosition": 0,
      "maxResults": 100,
      "major": 5, // Access Control Event
      "minor": 0, // Try 0 again. If it fails we'll try something else.
      // Sometimes Hikvision requires the timezone offset without a colon like +0545 instead of +05:45
      // or it might just accept local time strings. Let's try standard ISAPI format.
      "startTime": "2024-01-01T00:00:00+05:45",
      "endTime": "2026-12-31T23:59:59+05:45"
    }
  };

  try {
    // We'll use node's native fetch directly for the debug script to see raw response
    const fetch = require('node-fetch'); // or native fetch if Node 18+
    
    // Create digest auth header using the existing helper
    // Wait, since we are in a script, let's just use the service's fetchWithAuth
    // But since fetchWithAuth is private, let's export it or just use the public test method?
    // Actually, hikvisionService doesn't export fetchWithAuth.
    // Let's modify the payload in hikvisionService.js directly instead.
  } catch(e) {}
}

debugEvents();

debugEvents();
