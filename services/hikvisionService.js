const db = require('../db/database');

const crypto = require('crypto');

/**
 * Helper to fetch settings from DB.
 */
function getHikvisionConfig() {
  return {
    ip: db.getSetting('hikvision_ip', '192.168.1.182'),
    port: db.getSetting('hikvision_port', '80'),
    username: db.getSetting('hikvision_username', 'admin'),
    password: db.getSetting('hikvision_password', '@Fitness24')
  };
}

/**
 * Performs an HTTP fetch and automatically handles Digest Authentication if required
 * by the Hikvision device (which is typical).
 */
async function fetchWithAuth(url, options, config) {
  // First attempt, usually responds with 401 and WWW-Authenticate for Digest
  const initialResponse = await fetch(url, options);

  if (initialResponse.status === 401) {
    const wwwAuth = initialResponse.headers.get('www-authenticate');
    if (wwwAuth && wwwAuth.startsWith('Digest')) {
      const params = {};
      wwwAuth.replace(/(\w+)="([^"]+)"/g, (_, key, value) => { params[key] = value; });
      wwwAuth.replace(/(\w+)=([^",\s]+)/g, (_, key, value) => { if (!params[key]) params[key] = value; });

      const { realm, nonce, qop, opaque } = params;
      const method = options.method || 'GET';
      const uri = new URL(url).pathname + (new URL(url).search || '');
      const nc = '00000001';
      const cnonce = crypto.randomBytes(8).toString('hex');

      const ha1 = crypto.createHash('md5').update(`${config.username}:${realm}:${config.password}`).digest('hex');
      const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
      
      let responseHash;
      if (qop === 'auth' || qop === 'auth-int') {
        responseHash = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
      } else {
        responseHash = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
      }

      let authHeader = `Digest username="${config.username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseHash}"`;
      if (opaque) authHeader += `, opaque="${opaque}"`;
      if (qop) authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

      const newOptions = { ...options };
      newOptions.headers = { ...newOptions.headers, 'Authorization': authHeader };

      return await fetch(url, newOptions);
    }
  }

  return initialResponse;
}


/**
 * 1. testHikvisionConnection()
 * Tests connection to the Hikvision device using the provided config.
 */
async function testHikvisionConnection(ip, port, username, password) {
  try {
    const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
    
    const config = { username, password };
    const response = await fetchWithAuth(url, { method: 'GET' }, config);

    if (response.ok) {
      return { success: true, message: 'Connection successful!' };
    } else if (response.status === 401) {
      return { success: false, message: 'Authentication failed (check username/password).' };
    } else {
      return { success: false, message: `Connection failed with status ${response.status}` };
    }
  } catch (err) {
    return { success: false, message: `Connection error: ${err.message}` };
  }
}

/**
 * 2. fetchHikvisionEvents()
 * Can be used to pull logs/events from the Hikvision device manually or via cron.
 */
async function fetchHikvisionEvents() {
  try {
    const config = getHikvisionConfig();
    if (!config.ip) return { success: false, message: 'Hikvision IP not configured' };

    const url = `http://${config.ip}:${config.port}/ISAPI/AccessControl/AcsEvent?format=json`;
    
    // Payload for searching events (placeholder structure)
    const payload = {
      "AcsEventCond": {
        "searchID": "1",
        "searchResultPosition": 0,
        "maxResults": 10,
        "major": 5, // Access Control Event
        "minor": 75 // Fingerprint Comparison
      }
    };

    const response = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, config);

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    return { success: false, message: `Failed to fetch events: ${response.status}` };
  } catch (err) {
    console.error('Error fetching Hikvision events:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 3. handleFingerprintEvent()
 * This function handles an incoming event, checks the member's status, and opens the door if valid.
 * It is expected to be called when an event log is received (e.g., via webhook or polling).
 */
async function handleFingerprintEvent(employeeNo) {
  try {
    console.log(`[Hikvision] Received fingerprint event for employeeNo: ${employeeNo}`);
    
    const employeeNoStr = String(employeeNo).replace(/\D/g, ''); // Extract only digits
    
    // Get all members to filter through
    const allMembers = db.getAllMembers('', 'all'); 
    
    // Find match by stripping non-numeric chars from database phone numbers as well
    // This allows "+977-9867782924" in DB to match "9867782924" from Hikvision
    const member = allMembers.find(m => String(m.phone).replace(/\D/g, '') === employeeNoStr);

    if (!member) {
      console.log(`[Hikvision] Access Denied: Phone/Employee ID ${employeeNoStr} not found in database.`);
      await denyAccess(employeeNoStr, 'Member not found');
      return { success: false, message: 'Member not found', action: 'deny' };
    }

    // Check member payment/membership status
    if (member.status === 'active') {
      console.log(`[Hikvision] Access Granted for ${member.full_name} (${employeeNoStr}). Opening door...`);
      await openDoor();
      return { success: true, message: 'Access granted', action: 'open' };
    } else {
      console.log(`[Hikvision] Access Denied for ${member.full_name}. Status is ${member.status}.`);
      await denyAccess(employeeNoStr, 'Membership expired or inactive');
      return { success: false, message: 'Membership inactive', action: 'deny' };
    }
  } catch (err) {
    console.error('[Hikvision] Error handling fingerprint event:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 4. openDoor()
 * Sends the command to the Hikvision device to open the door.
 */
async function openDoor() {
  try {
    const config = getHikvisionConfig();
    if (!config.ip) return { success: false, message: 'Hikvision IP not configured' };

    const url = `http://${config.ip}:${config.port}/ISAPI/AccessControl/RemoteControl/door/1`;
    
    // Remote Control uses XML format
    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?><RemoteControlDoor xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0"><cmd>open</cmd></RemoteControlDoor>`;

    const response = await fetchWithAuth(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlPayload
    }, config);

    if (response.ok) {
      console.log('[Hikvision] Door opened successfully.');
      return { success: true };
    } else {
      console.error(`[Hikvision] Failed to open door. Status: ${response.status}`);
      return { success: false, status: response.status };
    }
  } catch (err) {
    console.error('[Hikvision] Error opening door:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 5. denyAccess()
 * Optional function to log or handle denied access.
 * The Hikvision device naturally denies access if the door open command is not sent,
 * but this can be used to send an alert or trigger a buzzer.
 */
async function denyAccess(employeeNo, reason) {
  try {
    console.log(`[Hikvision] Denying access to ${employeeNo}. Reason: ${reason}`);
    
    // If your device supports remote buzzer/alarm triggering, you can implement it here.
    
    return { success: true, message: 'Access denied logic executed' };
  } catch (err) {
    console.error('[Hikvision] Error denying access:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 6. setupLanConnection()
 * Configures the Hikvision device to push attendance events to the laptop over the LAN.
 */
async function setupLanConnection(laptopIp = '192.168.1.115') {
  try {
    const config = getHikvisionConfig();
    if (!config.ip) return { success: false, message: 'Hikvision IP not configured' };

    const url = `http://${config.ip}:${config.port}/ISAPI/Event/notification/httpHosts`;

    const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<HttpHostNotificationList xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0">
  <HttpHostNotification>
    <id>1</id>
    <url>/api/hikvision/event</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>${laptopIp}</ipAddress>
    <portNo>3000</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>`;

    const response = await fetchWithAuth(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlPayload
    }, config);

    if (response.ok) {
      console.log(`[Hikvision] LAN connection established. Device will push events to ${laptopIp}:3000`);
      return { success: true, message: 'LAN Connection established successfully!' };
    } else {
      console.error(`[Hikvision] Failed to setup LAN connection. Status: ${response.status}`);
      return { success: false, message: `Failed to configure device, status ${response.status}` };
    }
  } catch (err) {
    console.error('[Hikvision] Error setting up LAN connection:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 7. syncMemberToDevice()
 * Updates the user's Expiry Date directly on the Hikvision device.
 */
async function syncMemberToDevice(member) {
  try {
    const config = getHikvisionConfig();
    if (!config.ip) return { success: false, message: 'Hikvision IP not configured' };

    const rawPhone = String(member.phone);
    const digitsWithCode = rawPhone.replace(/\D/g, '');
    const digitsWithoutCode = digitsWithCode.startsWith('977') && digitsWithCode.length > 10
      ? digitsWithCode.slice(3)
      : digitsWithCode;

    // ── EXPIRED: DELETE from device so fingerprint cannot be recognised ──
    // NOTE: DS-K1T320EFWX ignores enable:false from ISAPI. Only full deletion works.
    if (member.status === 'expired') {
      async function tryDelete(employeeNo) {
        const payload = { "UserInfoDelCond": { "EmployeeNoList": [{ "employeeNo": employeeNo }] } };
        return fetchWithAuth(
          `http://${config.ip}:${config.port}/ISAPI/AccessControl/UserInfo/Delete?format=json`,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
          config
        );
      }

      let res = await tryDelete(digitsWithCode);
      if (!res.ok && digitsWithoutCode !== digitsWithCode) res = await tryDelete(digitsWithoutCode);

      if (res.ok) {
        console.log(`[Hikvision] DELETED ${member.full_name} → access denied. They must re-enroll fingerprint when renewed.`);
        return { success: true };
      }
      const err = await res.text();
      // noRecord means already deleted — treat as success
      if (err.includes('notFound') || err.includes('noRecord') || err.includes('No record')) {
        console.log(`[Hikvision] ${member.full_name} already removed from device → access denied.`);
        return { success: true };
      }
      console.error(`[Hikvision] Failed to delete ${member.full_name}: ${err}`);
      return { success: false, message: err };
    }

    // ── ACTIVE: Re-add to device using SetUp so they can re-enroll fingerprint ──
    const activeEndTime = member.expiry_date ? `${member.expiry_date}T23:59:59` : '2037-12-31T23:59:59';

    async function trySetUp(employeeNo) {
      const payload = {
        "UserInfo": {
          "employeeNo": employeeNo,
          "name": member.full_name.substring(0, 32),
          "userType": "normal",
          "Valid": {
            "enable": true,
            "beginTime": "2000-01-01T00:00:00",
            "endTime": activeEndTime,
            "timeType": "local"
          }
        }
      };
      return fetchWithAuth(
        `http://${config.ip}:${config.port}/ISAPI/AccessControl/UserInfo/SetUp?format=json`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
        config
      );
    }

    let res = await trySetUp(digitsWithCode);
    if (!res.ok && digitsWithoutCode !== digitsWithCode) res = await trySetUp(digitsWithoutCode);

    if (res.ok) {
      console.log(`[Hikvision] ENABLED ${member.full_name} record on device until ${member.expiry_date}. Ask them to re-enroll fingerprint/face on the Hikvision device.`);
      return { success: true };
    }
    const body = await res.text();
    console.log(`[Hikvision] Could not re-add ${member.full_name} (${res.status}). They must enroll fingerprint directly on device.`);
    return { success: false, message: body };
  } catch (err) {
    console.error('[Hikvision] Error syncing member:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  getHikvisionConfig,
  testHikvisionConnection,
  fetchHikvisionEvents,
  handleFingerprintEvent,
  openDoor,
  denyAccess,
  setupLanConnection,
  syncMemberToDevice
};
