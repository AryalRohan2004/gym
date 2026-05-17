const crypto = require('crypto');

const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';
const LAPTOP_IP = '192.168.1.115';
const SERVER_PORT = 3000;

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
    const nc = '00000001', cnonce = crypto.randomBytes(8).toString('hex');
    const uri = new URL(url).pathname + (new URL(url).search || '');
    const ha1 = crypto.createHash('md5').update(`${HIK_USER}:${realm}:${HIK_PASS}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    const rh = qop
      ? crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
      : crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    let auth = `Digest username="${HIK_USER}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${rh}"`;
    if (opaque) auth += `, opaque="${opaque}"`;
    if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    opts.headers['Authorization'] = auth;
    res = await fetch(url, opts);
  }
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

async function main() {
  console.log('\n====================================================');
  console.log(' 🔍 CHECKING THIRD-PARTY AUTH SUPPORT');
  console.log('====================================================\n');

  // Test 1: Check ThirdPartyAuth endpoint
  console.log('Test 1: /ISAPI/AccessControl/ThirdPartyAuth ...');
  let r = await hikReq('/ISAPI/AccessControl/ThirdPartyAuth?format=json');
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  // Test 2: Check Arming endpoint  
  console.log('Test 2: /ISAPI/AccessControl/RemoteCheck ...');
  r = await hikReq('/ISAPI/AccessControl/RemoteCheck?format=json');
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  // Test 3: Check ACS capabilities
  console.log('Test 3: /ISAPI/AccessControl/AcsWorkMode ...');
  r = await hikReq('/ISAPI/AccessControl/AcsWorkMode?format=json');
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  // Test 4: Try to configure ThirdPartyAuth  
  console.log('Test 4: Attempting to ENABLE ThirdPartyAuth...');
  const authConfig = {
    ThirdPartyAuth: {
      enable: true,
      authUrl: `http://${LAPTOP_IP}:${SERVER_PORT}/api/hikvision/auth`,
      timeoutHandling: "deny"
    }
  };
  r = await hikReq('/ISAPI/AccessControl/ThirdPartyAuth?format=json', 'PUT', authConfig);
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  // Test 5: Check Platform configuration
  console.log('Test 5: /ISAPI/System/Network/platform ...');
  r = await hikReq('/ISAPI/System/Network/platform?format=json');
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  // Test 6: eHome/ISUP protocol config (some devices use this for platform auth)
  console.log('Test 6: /ISAPI/AccessControl/RemoteVerification ...');
  r = await hikReq('/ISAPI/AccessControl/RemoteVerification?format=json');
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${r.body.substring(0, 300)}\n`);

  console.log('====================================================');
  console.log(' Paste this output and I will configure it!');
  console.log('====================================================\n');
}

main().catch(e => console.error(e));
