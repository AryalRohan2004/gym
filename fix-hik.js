const db = require('./db/database');
const crypto = require('crypto');

const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';
const LAPTOP_IP = '192.168.1.115';
const SERVER_PORT = 3000;

// ─── Digest Auth Helper ─────────────────────────────────────
async function hikReq(path, method = 'GET', body = null, contentType = 'application/json') {
  const url = `http://${HIK_IP}:${HIK_PORT}${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    opts.headers['Content-Type'] = contentType;
  }

  let res = await fetch(url, opts);
  if (res.status === 401) {
    const wwwAuth = res.headers.get('www-authenticate') || '';
    const params = {};
    wwwAuth.replace(/(\w+)="([^"]+)"/g, (_, k, v) => { params[k] = v; });
    wwwAuth.replace(/(\w+)=([^",\s]+)/g, (_, k, v) => { if (!params[k]) params[k] = v; });

    const { realm, nonce, qop, opaque } = params;
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const uri = new URL(url).pathname + (new URL(url).search || '');
    const ha1 = crypto.createHash('md5').update(`${HIK_USER}:${realm}:${HIK_PASS}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    const responseHash = qop
      ? crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
      : crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

    let auth = `Digest username="${HIK_USER}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${responseHash}"`;
    if (opaque) auth += `, opaque="${opaque}"`;
    if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    opts.headers['Authorization'] = auth;
    res = await fetch(url, opts);
  }
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

// ─── Try to modify user's validity period with multiple Employee ID formats ─────
async function modifyUserValidity(employeeNo, name, endTime, enable) {
  // Date format: device uses space separator (2026-06-12 23:59:59), not T
  const beginTime = '2020-01-01 00:00:00';

  const payload = {
    UserInfoDetail: {
      mode: 'byEmployeeNo',
      UserInfo: [{
        employeeNo: employeeNo,
        name: name.substring(0, 32),
        userType: 'normal',
        Valid: {
          enable: enable,
          beginTime: beginTime,
          endTime: endTime,
          timeType: 'local'
        }
      }]
    }
  };

  // Try Modify first
  let res = await hikReq('/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', payload);
  if (res.ok) return { success: true, method: 'Modify' };

  // Try Record (upsert) 
  res = await hikReq('/ISAPI/AccessControl/UserInfo/Record?format=json', 'PUT', payload);
  if (res.ok) return { success: true, method: 'Record' };

  return { success: false, status: res.status, error: res.body };
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('\n====================================================');
  console.log(' 🔧 HIKVISION SYNC - VALIDITY PERIOD APPROACH');
  console.log('====================================================\n');

  // Save credentials
  db.setSetting('hikvision_ip', HIK_IP);
  db.setSetting('hikvision_port', HIK_PORT);
  db.setSetting('hikvision_username', HIK_USER);
  db.setSetting('hikvision_password', HIK_PASS);

  // Test connection
  console.log('📡 Testing connection...');
  const test = await hikReq('/ISAPI/System/deviceInfo');
  if (!test.ok) {
    console.log(`❌ Cannot connect! Status: ${test.status}`);
    return;
  }
  console.log('✅ Connected to Hikvision!\n');

  // Setup Webhook
  console.log('📡 Setting up event webhook...');
  const xmlWebhook = `<?xml version="1.0" encoding="utf-8"?>
<HttpHostNotificationList xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0">
  <HttpHostNotification>
    <id>1</id>
    <url>/api/hikvision/event</url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>${LAPTOP_IP}</ipAddress>
    <portNo>${SERVER_PORT}</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>`;
  const wh = await hikReq('/ISAPI/Event/notification/httpHosts', 'PUT', xmlWebhook, 'application/xml');
  console.log(wh.ok ? `✅ Webhook set → http://${LAPTOP_IP}:${SERVER_PORT}/api/hikvision/event\n` : `⚠️  Webhook: ${wh.status}\n`);

  // Process members
  console.log('👥 Processing all members...');
  const members = db.getAllMembers('', 'all');
  console.log(`   Found ${members.length} members.\n`);

  for (const member of members) {
    const rawPhone = String(member.phone);
    // Generate possible Employee ID formats
    const digitsWithCode = rawPhone.replace(/\D/g, ''); // e.g. 9779867782924
    // If starts with country code 977, also try without it
    const digitsWithoutCode = digitsWithCode.startsWith('977') && digitsWithCode.length > 10
      ? digitsWithCode.slice(3)
      : digitsWithCode;

    const isActive = member.status === 'active';
    // Device uses space format: "2026-06-12 23:59:59"
    const endTime = isActive && member.expiry_date
      ? `${member.expiry_date} 23:59:59`
      : '2000-01-01 00:00:01'; // Past date = denied by device

    const icon = isActive ? '🟢' : '🔴';
    const action = isActive ? `ACTIVE until ${member.expiry_date}` : 'EXPIRED → DISABLING';
    console.log(`   ${icon} ${member.full_name} → ${action}`);

    // Try with full number first, then without country code
    let result = await modifyUserValidity(digitsWithCode, member.full_name, endTime, isActive);

    if (!result.success && digitsWithoutCode !== digitsWithCode) {
      console.log(`      ↩️  Retrying with ${digitsWithoutCode} (without country code)...`);
      result = await modifyUserValidity(digitsWithoutCode, member.full_name, endTime, isActive);
    }

    if (result.success) {
      console.log(`      ✅ Success via ${result.method}!`);
    } else {
      console.log(`      ❌ Failed (${result.status}): ${result.error?.substring(0, 150)}`);
    }
  }

  console.log('\n====================================================');
  console.log(' ✅ Sync complete! Restart server: npm start');
  console.log('====================================================\n');
}

main().catch(e => console.error('Fatal error:', e));
