const crypto = require('crypto');

const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';

async function hikReq(path, method = 'GET', body = null) {
  const url = `http://${HIK_IP}:${HIK_PORT}${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
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

async function listAllHikvisionUsers() {
  console.log('\n====================================================');
  console.log(' 🔍 READING ALL USERS DIRECTLY FROM HIKVISION DEVICE');
  console.log('====================================================\n');

  const searchPayload = {
    "UserInfoSearchCond": {
      "searchID": "1",
      "searchResultPosition": 0,
      "maxResults": 1000,
      "EmployeeNoList": []
    }
  };

  const res = await hikReq('/ISAPI/AccessControl/UserInfo/Search?format=json', 'POST', searchPayload);
  
  if (res.ok) {
      try {
          const data = JSON.parse(res.body);
          if (data.UserInfoSearch && data.UserInfoSearch.UserInfo) {
              const users = data.UserInfoSearch.UserInfo;
              console.log(`Found ${users.length} users physically stored on the device:\n`);
              for (const u of users) {
                 console.log(`- Name: ${u.name}`);
                 console.log(`  Employee ID (Device): ${u.employeeNo}`);
                 console.log(`  Enabled: ${u.Valid.enable}`);
                 console.log(`  Valid Until: ${u.Valid.endTime}`);
                 if (u.RightPlan && u.RightPlan.length > 0) {
                     console.log(`  Door Access: ${JSON.stringify(u.RightPlan)}`);
                 } else {
                     console.log(`  Door Access: NONE (No Permission)`);
                 }
                 console.log('-----------------------------------');
              }
          } else {
              console.log("No users found on the device.");
          }
      } catch (e) {
          console.log("Failed to parse JSON response:", res.body);
      }
  } else {
      console.log(`Failed to fetch users. Status: ${res.status}`);
      console.log(`Response: ${res.body}`);
  }
}

listAllHikvisionUsers().catch(e => console.error(e));
