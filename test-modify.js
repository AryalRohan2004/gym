const crypto = require('crypto');

const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';

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
  console.log(' 🔍 TRYING TO FETCH USER INFO');
  console.log('====================================================\n');

  // Let's fetch all users or a specific user to see how the device formats them.
  const searchPayload = {
    "UserInfoSearchCond": {
      "searchID": "1",
      "searchResultPosition": 0,
      "maxResults": 10,
      "EmployeeNoList": []
    }
  };

  console.log('Fetching users from device...');
  const res = await hikReq('/ISAPI/AccessControl/UserInfo/Search?format=json', 'POST', searchPayload);
  console.log(`Status: ${res.status}`);
  if (res.ok) {
      console.log('Users found on device:');
      console.log(JSON.stringify(JSON.parse(res.body), null, 2));
      
      const data = JSON.parse(res.body);
      if (data.UserInfoSearch && data.UserInfoSearch.UserInfo && data.UserInfoSearch.UserInfo.length > 0) {
          const firstUser = data.UserInfoSearch.UserInfo[0];
          console.log('\nTrying to modify this exact user (changing name slightly to see if Modify works)...');
          
          firstUser.name = firstUser.name + " Test";
          const modifyPayload = {
              "UserInfoDetail": {
                  "mode": "byEmployeeNo",
                  "UserInfo": [firstUser]
              }
          };
          
          const modRes = await hikReq('/ISAPI/AccessControl/UserInfo/Modify?format=json', 'PUT', modifyPayload);
          console.log(`Modify Status: ${modRes.status}`);
          console.log(`Modify Body: ${modRes.body}`);
      }
  } else {
      console.log(`Error body: ${res.body}`);
  }
  
  console.log('\n====================================================');
}

main().catch(e => console.error(e));
