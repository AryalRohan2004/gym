const crypto = require('crypto');
const db = require('./db/database');

function getHikvisionConfig() {
  return {
    ip: db.getSetting('hikvision_ip', ''),
    port: db.getSetting('hikvision_port', '80'),
    username: db.getSetting('hikvision_username', 'admin'),
    password: db.getSetting('hikvision_password', '')
  };
}

async function fetchWithAuth(url, options = {}, config) {
  const method = options.method || 'GET';
  
  // First request to get the authenticate header
  const firstRes = await fetch(url, options);
  if (firstRes.status !== 401) return firstRes;

  const authHeader = firstRes.headers.get('www-authenticate');
  if (!authHeader) return firstRes;

  const authParams = {};
  authHeader.replace(/(\w+)="([^"]+)"/g, (_, k, v) => authParams[k] = v);

  const ha1 = crypto.createHash('md5').update(`${config.username}:${authParams.realm}:${config.password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${new URL(url).pathname}`).digest('hex');
  
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';
  
  const responseStr = crypto.createHash('md5')
    .update(`${ha1}:${authParams.nonce}:${nc}:${cnonce}:${authParams.qop}:${ha2}`)
    .digest('hex');

  const digestHeader = `Digest username="${config.username}", realm="${authParams.realm}", nonce="${authParams.nonce}", uri="${new URL(url).pathname}", response="${responseStr}", qop=${authParams.qop}, nc=${nc}, cnonce="${cnonce}"`;

  const newHeaders = new Headers(options.headers || {});
  newHeaders.set('Authorization', digestHeader);

  return fetch(url, { ...options, headers: newHeaders });
}

async function scanEvents() {
  const config = getHikvisionConfig();
  if (!config.ip) return console.log("IP not configured.");

  const url = `http://${config.ip}:${config.port}/ISAPI/AccessControl/AcsEvent?format=json`;
  
  const startTime = "2024-01-01T00:00:00+05:45";
  const endTime = "2026-12-31T23:59:59+05:45";

  const minorCodes = [0, 1, 5, 75, 76];
  
  console.log('Scanning Hikvision device for ALL past and present events to find the correct format...');

  for (const minor of minorCodes) {
    console.log(`\\n--- Testing minor code: ${minor} ---`);
    const payload = {
      "AcsEventCond": {
        "searchID": `test-${minor}`,
        "searchResultPosition": 0,
        "maxResults": 5,
        "major": 5,
        "minor": minor,
        "startTime": startTime,
        "endTime": endTime
      }
    };

    try {
      const response = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, config);

      if (response.ok) {
        const data = await response.json();
        const events = data.AcsEvent?.InfoList || [];
        console.log(`Found ${events.length} events for minor code ${minor}.`);
        if (events.length > 0) {
          console.log('Sample event:', JSON.stringify(events[0], null, 2));
        }
      } else {
        console.log(`Error: ${response.status} - Request rejected by device.`);
      }
    } catch (e) {
      console.log(`Failed request: ${e.message}`);
    }
  }
}

scanEvents();
