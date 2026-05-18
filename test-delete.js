const crypto = require('crypto');
const HIK_IP   = '192.168.1.182';
const HIK_PORT = '80';
const HIK_USER = 'admin';
const HIK_PASS = '@Fitness24';

async function hikReq(path, method = 'GET', body = null) {
  const url = `http://${HIK_IP}:${HIK_PORT}${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.body = JSON.stringify(body);
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
  return { status: res.status, body: await res.text() };
}

async function testDelete() {
    console.log("Testing UserInfoDetail (often used for delete)");
    const payload1 = {
        "UserInfoDetail": {
            "mode": "byEmployeeNo",
            "EmployeeNoList": [{ "employeeNo": "9999" }]
        }
    };
    let res = await hikReq('/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', payload1);
    console.log("Payload1 Status:", res.status, res.body);

    console.log("Testing UserInfoDelCond (with capital E)");
    const payload2 = {
        "UserInfoDelCond": {
            "EmployeeNoList": [{ "employeeNo": "9999" }]
        }
    };
    res = await hikReq('/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', payload2);
    console.log("Payload2 Status:", res.status, res.body);

    console.log("Testing UserInfoDelCond (with lowercase e)");
    const payload3 = {
        "UserInfoDelCond": {
            "employeeNoList": [{ "employeeNo": "9999" }]
        }
    };
    res = await hikReq('/ISAPI/AccessControl/UserInfo/Delete?format=json', 'PUT', payload3);
    console.log("Payload3 Status:", res.status, res.body);
}

testDelete();
