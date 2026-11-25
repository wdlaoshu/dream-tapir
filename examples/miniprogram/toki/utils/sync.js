/* Toki 小程序 · 端到端加密同步
   数据先用同步密码在本地加密（PBKDF2 → AES-256-GCM），再存进自己账号里的
   一个私密 Gist。云端只看到密文。格式与网页版 web/app.js 的 Sync 一致，
   所以两端可以共享同一个 Gist：

     { v: 1, salt: <base64>, iv: <base64>, ct: <base64(ciphertext||tag)>, at: <ms> }

   逻辑层没有 Web Crypto，加解密走 utils/crypto.js 的纯 JS 实现。 */

const C = require('./crypto.js');
const M = require('./model.js');
const store = require('./store.js');

const DATA_ARRAYS = M.DATA_ARRAYS;

const CONF = 'atlas.sync';
const FILE = 'atlas.enc.json';
const DESC = 'Toki · 加密数据（只有同步密码能解开）';
const ITERATIONS = 310000;
const DAY = 86400000;

const HOSTS = {
  gitee: { base: 'https://gitee.com/api/v5', name: 'Gitee' },
  github: { base: 'https://api.github.com', name: 'GitHub' },
};

let conf = null;
let keyBytes = null;
let timer = null;
let busy = false;
let again = false;
const status = { state: 'off', at: 0, err: '' };
const listeners = [];

function emit() {
  listeners.forEach(fn => { try { fn(status); } catch (e) { /* ignore */ } });
}

function on(fn) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

/* ---------- 本地配置 ---------- */
const confHasAsync = () => typeof wx !== 'undefined' && typeof wx.setStorage === 'function';

function readConf() {
  return new Promise(resolve => {
    if (confHasAsync()) {
      wx.getStorage({
        key: CONF,
        success: res => resolve(res.data && typeof res.data === 'object' ? res.data : null),
        fail: () => resolve(null),
      });
      return;
    }
    try { resolve(wx.getStorageSync(CONF) || null); } catch (e) { resolve(null); }
  });
}

function writeConf(value) {
  return new Promise((resolve, reject) => {
    if (confHasAsync()) {
      wx.setStorage({ key: CONF, data: value, success: () => resolve(), fail: reject });
      return;
    }
    try { wx.setStorageSync(CONF, value); resolve(); } catch (e) { reject(e); }
  });
}

function removeConf() {
  return new Promise(resolve => {
    if (confHasAsync()) {
      wx.removeStorage({ key: CONF, success: () => resolve(), fail: () => resolve() });
      return;
    }
    try { wx.removeStorageSync(CONF); } catch (e) { /* ignore */ }
    resolve();
  });
}

/* ---------- 请求 ---------- */
function request(url, opt) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: (opt && opt.method) || 'GET',
      header: (opt && opt.header) || {},
      data: opt && opt.body !== undefined ? opt.body : undefined,
      success: res => resolve(res),
      fail: err => reject(new Error((err && err.errMsg) || '网络请求失败')),
    });
  });
}

async function gh(path, opt = {}, token = conf && conf.token, prov = (conf && conf.provider) || 'github') {
  const host = HOSTS[prov];
  let url = host.base + path;
  const method = opt.method || 'GET';
  const header = {};

  if (prov === 'gitee') {
    if (method === 'GET') {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
    } else {
      header['Content-Type'] = 'application/json';
    }
  } else {
    header.Authorization = 'Bearer ' + token;
    header.Accept = 'application/vnd.github+json';
    if (opt.body) header['Content-Type'] = 'application/json';
  }

  let body;
  if (opt.body) {
    const parsed = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    body = prov === 'gitee'
      ? Object.assign({ access_token: token }, parsed)
      : parsed;
  }

  let res;
  try {
    res = await request(url, { method, header, body });
  } catch (e) {
    throw new Error(`连不上 ${host.name}` + (prov === 'github' ? '，国内网络建议改用 Gitee' : ''));
  }

  const code = res.statusCode;
  if (code === 401) throw new Error('令牌无效或已过期');
  if (code === 403 || code === 404) throw new Error(prov === 'gitee' ? '令牌没有 gists 权限' : '令牌没有 gist 权限');
  if (code < 200 || code >= 300) throw new Error(host.name + ' 返回 ' + code);
  return res.data;
}

async function readGist(id) {
  const g = await gh('/gists/' + id);
  const f = g && g.files && g.files[FILE];
  if (!f) return null;
  if (f.truncated || f.content == null) {
    if (!f.raw_url) return null;
    const res = await request(f.raw_url);
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }
  return f.content;
}

/* ---------- 加解密 ---------- */
async function derive(pass, salt, onProgress) {
  return C.pbkdf2(pass, salt, ITERATIONS, 32, onProgress);
}

function seal(obj) {
  const iv = C.randomBytes(12);
  const ct = C.aesGcmEncrypt(keyBytes, iv, C.utf8Encode(JSON.stringify(obj)));
  return JSON.stringify({
    v: 1,
    salt: conf.salt,
    iv: C.b64encode(iv),
    ct: C.b64encode(ct),
    at: Date.now(),
  });
}

function open(text, key = keyBytes) {
  const box = JSON.parse(text);
  const iv = C.b64decode(box.iv);
  const ct = C.b64decode(box.ct);
  const plain = C.aesGcmDecrypt(key, iv, ct);
  if (!plain) throw new Error('解不开：同步密码不对');
  return JSON.parse(C.utf8Decode(plain));
}

/* ---------- 合并（与网页版同一套规则） ---------- */
function merge(a, b) {
  const del = Object.assign({}, a.deleted || {});
  for (const [id, t] of Object.entries(b.deleted || {})) del[id] = Math.max(del[id] || 0, t);

  const out = { identities: [], accounts: [], tokens: [], deleted: del };
  for (const k of DATA_ARRAYS) {
    const map = new Map();
    for (const x of [...(a[k] || []), ...(b[k] || [])]) {
      const cur = map.get(x.id);
      if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) map.set(x.id, x);
    }
    out[k] = Array.from(map.values()).filter(x => !(del[x.id] >= (x.updatedAt || 0)));
  }
  for (const id of Object.keys(del)) {
    if (DATA_ARRAYS.some(k => out[k].some(x => x.id === id))) delete del[id];
  }

  const ids = new Set(out.identities.map(i => i.id));
  out.accounts.forEach(x => { x.identityIds = M.identityIdsOf(x).filter(i => ids.has(i)); });
  M.repairTokenLinks(out, true);

  const old = Date.now() - 90 * DAY;
  for (const [id, t] of Object.entries(del)) if (t < old) delete del[id];
  return out;
}

const same = (a, b) =>
  JSON.stringify(DATA_ARRAYS.map(k => a[k] || [])) === JSON.stringify(DATA_ARRAYS.map(k => b[k] || []));

/* ---------- 同步 ---------- */
async function run() {
  if (!conf || !keyBytes) return;
  if (busy) { again = true; return; }
  busy = true;
  status.state = 'syncing';
  status.err = '';
  emit();

  try {
    const text = await readGist(conf.gistId);
    const remote = text ? open(text) : { identities: [], accounts: [], tokens: [], deleted: {} };
    const local = store.getState();
    const merged = merge(local, remote);

    if (!same(merged, local) || JSON.stringify(merged.deleted) !== JSON.stringify(local.deleted || {})) {
      await store.replaceState(merged);
    }
    if (!text || !same(merged, remote) || JSON.stringify(merged.deleted) !== JSON.stringify(remote.deleted || {})) {
      await gh('/gists/' + conf.gistId, {
        method: 'PATCH',
        body: JSON.stringify({ description: DESC, files: { [FILE]: { content: seal(merged) } } }),
      });
    }

    status.state = 'idle';
    status.at = Date.now();
    conf.at = status.at;
    await writeConf(conf);
  } catch (e) {
    status.state = 'error';
    status.err = (e && e.message) || '同步失败';
  }

  busy = false;
  emit();
  if (again) { again = false; run(); }
}

function schedule() {
  if (!conf || !keyBytes) return;
  clearTimeout(timer);
  timer = setTimeout(run, 1200);
}

/* ---------- 对外 ---------- */
async function init() {
  conf = await readConf();
  if (!conf || !conf.key) { status.state = 'off'; emit(); return; }
  try {
    keyBytes = C.b64decode(conf.key);
    status.state = 'idle';
    status.at = conf.at || 0;
    emit();
    run();
  } catch (e) {
    conf = null;
    keyBytes = null;
    status.state = 'error';
    status.err = '本机的同步信息损坏，请重新开启';
    emit();
  }
}

/* 开启：找同一个 Gist；找到就沿用它的 salt 和密码，找不到就新建一个 */
async function enable(token, pass, prov = 'gitee', onProgress) {
  token = String(token || '').trim();
  const gists = await gh('/gists?per_page=100', {}, token, prov);
  const list = Array.isArray(gists) ? gists : [];
  const found = list.find(x => x.files && x.files[FILE]);

  let salt, key, remote = null;
  if (found) {
    const text = await readGist(found.id);
    const box = JSON.parse(text);
    salt = box.salt;
    key = await derive(pass, C.b64decode(salt), onProgress);
    try { remote = open(text, key); } catch (e) { throw new Error('同步密码不对（和第一次设置的不一样）'); }
  } else {
    salt = C.b64encode(C.randomBytes(16));
    key = await derive(pass, C.b64decode(salt), onProgress);
  }

  keyBytes = key;
  conf = { provider: prov, token, salt, key: C.b64encode(key), gistId: found ? found.id : null, at: 0 };

  const local = store.getState();
  const empty = { identities: [], accounts: [], tokens: [], deleted: {} };
  const base = remote ? merge(local, remote) : (local.demo ? empty : local);

  if (!conf.gistId) {
    const made = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: DESC,
        public: false,
        files: { [FILE]: { content: seal(base) } },
      }),
    }, token, prov);
    conf.gistId = made.id;
  } else {
    await gh('/gists/' + conf.gistId, {
      method: 'PATCH',
      body: JSON.stringify({ description: DESC, files: { [FILE]: { content: seal(base) } } }),
    }, token, prov);
  }

  if (remote) await store.replaceState(base);
  await writeConf(conf);
  status.state = 'idle';
  status.at = conf.at = Date.now();
  emit();
  run();
  return !!found;
}

async function disable() {
  conf = null;
  keyBytes = null;
  clearTimeout(timer);
  await removeConf();
  status.state = 'off';
  status.err = '';
  emit();
}

module.exports = {
  status,
  on,
  init,
  enable,
  disable,
  run,
  schedule,
  get on() { return !!conf; },
  get provider() { return (conf && conf.provider) || 'github'; },
  get at() { return (conf && conf.at) || 0; },
};
