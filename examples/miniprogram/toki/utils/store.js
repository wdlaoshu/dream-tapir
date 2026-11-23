/* Toki 小程序 · 本地存储与状态
   storage key 沿用网页版的 atlas.v1，导出的 JSON 与网页版互通。
   一期不做加密同步，所以这里只有本机读写。 */

const { normalizeState, repairTokenLinks, DATA_ARRAYS } = require('./model.js');

const KEY = 'atlas.v1';
const PREFS = 'toki.prefs';

let state = null;
let seen = new Map();

/* ---------- 存储适配 ----------
   wx.setStorageSync 在 Web 容器里没有实现，所以优先用异步版本；
   异步不可用时退回同步版本。两者都没有就直接报错。 */
const hasAsync = () => typeof wx !== 'undefined' && typeof wx.setStorage === 'function';
const hasSync = () => typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';

function readRaw(key) {
  return new Promise((resolve) => {
    if (hasAsync() && typeof wx.getStorage === 'function') {
      wx.getStorage({
        key,
        success: res => resolve(res.data === undefined ? null : res.data),
        fail: () => resolve(null),
      });
      return;
    }
    if (hasSync()) {
      try { resolve(wx.getStorageSync(key) || null); } catch (e) { resolve(null); }
      return;
    }
    resolve(null);
  });
}

function writeRaw(key, value) {
  return new Promise((resolve, reject) => {
    if (hasAsync()) {
      wx.setStorage({ key, data: value, success: () => resolve(), fail: e => reject(e) });
      return;
    }
    if (hasSync()) {
      try { wx.setStorageSync(key, value); resolve(); } catch (e) { reject(e); }
      return;
    }
    reject(new Error('没有可用的本地存储'));
  });
}

/* ---------- 状态 ---------- */
const strip = x => JSON.stringify(x);

function remember() {
  seen = new Map();
  if (!state) return;
  for (const k of DATA_ARRAYS) for (const x of (state[k] || [])) seen.set(x.id, strip(x));
}

function getState() {
  return state || normalizeState({ identities: [], accounts: [], tokens: [] });
}

async function load() {
  const raw = await readRaw(KEY);
  if (raw && typeof raw === 'object') state = normalizeState(raw);
  else state = null;
  if (state) {
    remember();
    if (repairTokenLinks(state, true)) await save();
  }
  return state;
}

async function save() {
  if (!state) return;
  const now = Date.now();
  state.deleted = state.deleted || {};
  const live = new Set();
  for (const k of DATA_ARRAYS) for (const x of (state[k] || [])) {
    live.add(x.id);
    if (seen.get(x.id) !== strip(x) || !x.updatedAt) x.updatedAt = now;
    delete state.deleted[x.id];
  }
  for (const id of seen.keys()) if (!live.has(id)) state.deleted[id] = now;
  remember();
  await writeRaw(KEY, state);
}

async function replaceState(next) {
  state = normalizeState(next);
  remember();
  repairTokenLinks(state, true);
  await save();
  return state;
}

async function clearAll() {
  state = normalizeState({ identities: [], accounts: [], tokens: [] });
  seen = new Map();
  await save();
  return state;
}

/* 导入：merge 按 id 合并（远端没有的保留本地），replace 整体替换 */
async function importState(payload, mode) {
  const incoming = normalizeState(payload);
  if (mode === 'replace') return replaceState(incoming);
  const cur = getState();
  const out = {
    identities: (cur.identities || []).slice(),
    accounts: (cur.accounts || []).slice(),
    tokens: (cur.tokens || []).slice(),
    deleted: Object.assign({}, cur.deleted || {}, incoming.deleted || {}),
  };
  for (const k of DATA_ARRAYS) {
    const byId = new Map(out[k].map(x => [x.id, x]));
    for (const x of (incoming[k] || [])) {
      const old = byId.get(x.id);
      if (!old) { out[k].push(x); byId.set(x.id, x); continue; }
      if ((x.updatedAt || 0) >= (old.updatedAt || 0)) Object.assign(old, x);
    }
  }
  return replaceState(out);
}

/* ---------- 偏好 ---------- */
const DEFAULT_PREFS = { theme: 'auto', privacy: false, kind: 'email' };

async function loadPrefs() {
  const raw = await readRaw(PREFS);
  const p = raw && typeof raw === 'object' ? raw : {};
  return Object.assign({}, DEFAULT_PREFS, p);
}

async function savePrefs(prefs) {
  await writeRaw(PREFS, Object.assign({}, DEFAULT_PREFS, prefs || {}));
}

/* 导出的 JSON 与网页版同构 */
function exportPayload() {
  const s = getState();
  return {
    app: 'toki',
    version: 3,
    identities: s.identities || [],
    accounts: s.accounts || [],
    tokens: s.tokens || [],
  };
}

module.exports = {
  KEY, getState, load, save, replaceState, clearAll, importState, exportPayload,
  loadPrefs, savePrefs, DEFAULT_PREFS,
};
