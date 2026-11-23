/* Itemory 小程序 · 本机密钥存储
   桌面版把 API Key 放 Keychain；小程序没有 Keychain，只能落到本机 storage。
   为了不把明文长期留在这份 JSON 旁边，这里提供两种模式：

   - plain：直接存（方便，首次配好就能用，UI 会明确写清是明文）
   - sealed：用本地口令 PBKDF2(SHA-256) 派生密钥 + AES-256-GCM 加密后存，
     每次冷启动第一次用 AI 时输一次口令解锁；解锁后只在内存里留明文

   这不是 Keychain 的等价物：口令强度决定安全性，忘了口令只能重新填 Key。 */

const crypto = require('./crypto.js');

const KEY_RECORD = 'itemory.aiKey.v1';
const ITERATIONS = 100000;

let unlockedKey = '';

function getStorage(key) {
  return new Promise(resolve => {
    wx.getStorage({ key, success: res => resolve(res && res.data), fail: () => resolve(null) });
  });
}

function setStorage(key, data) {
  return new Promise((resolve, reject) => {
    wx.setStorage({ key, data, success: () => resolve(), fail: err => reject(new Error((err && err.errMsg) || '写入失败')) });
  });
}

function removeStorage(key) {
  return new Promise(resolve => {
    wx.removeStorage({ key, success: () => resolve(), fail: () => resolve() });
  });
}

async function readRecord() {
  const raw = await getStorage(KEY_RECORD);
  if (!raw || typeof raw !== 'object') return { mode: 'none' };
  if (raw.mode === 'sealed' && raw.salt && raw.iv && raw.ct) {
    return {
      mode: 'sealed',
      salt: raw.salt, iv: raw.iv, ct: raw.ct,
      iterations: raw.iterations || ITERATIONS,
    };
  }
  if (raw.mode === 'plain' && typeof raw.value === 'string') {
    return { mode: 'plain', value: raw.value };
  }
  return { mode: 'none' };
}

/* 冷启动后第一次需要 Key 时调用：明文模式直接返回，加密模式需要口令 */
async function currentKey() {
  if (unlockedKey) return unlockedKey;
  const record = await readRecord();
  if (record.mode === 'plain') {
    unlockedKey = record.value;
    return unlockedKey;
  }
  return '';
}

async function hasKey() {
  const record = await readRecord();
  return record.mode !== 'none';
}

async function isSealed() {
  const record = await readRecord();
  return record.mode === 'sealed';
}

/**
 * 保存 API Key。
 * @param {string} value 明文 Key
 * @param {string|null} passphrase 传口令即以加密模式保存；空则明文保存
 */
async function saveKey(value, passphrase) {
  const key = String(value || '').trim();
  if (!key) throw new Error('API Key 不能为空');
  if (passphrase) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const derived = await crypto.pbkdf2(crypto.utf8Encode(passphrase), salt, ITERATIONS, 32);
    const sealed = crypto.aesGcmEncrypt(derived, iv, crypto.utf8Encode(key), new Uint8Array(0));
    await setStorage(KEY_RECORD, {
      v: 1,
      mode: 'sealed',
      salt: crypto.b64encode(salt),
      iv: crypto.b64encode(iv),
      ct: crypto.b64encode(sealed),
      iterations: ITERATIONS,
    });
    unlockedKey = key;
    return { mode: 'sealed' };
  }
  await setStorage(KEY_RECORD, { v: 1, mode: 'plain', value: key });
  unlockedKey = key;
  return { mode: 'plain' };
}

/* 口令解锁；口令错误返回 false，不做重试限制（本地一次性操作） */
async function unlockKey(passphrase) {
  const record = await readRecord();
  if (record.mode === 'plain') {
    unlockedKey = record.value;
    return true;
  }
  if (record.mode !== 'sealed') return false;
  const derived = await crypto.pbkdf2(
    crypto.utf8Encode(passphrase || ''),
    crypto.b64decode(record.salt),
    record.iterations,
    32
  );
  const plain = crypto.aesGcmDecrypt(
    derived,
    crypto.b64decode(record.iv),
    crypto.b64decode(record.ct),
    new Uint8Array(0)
  );
  if (!plain) return false;
  unlockedKey = crypto.utf8Decode(plain);
  return true;
}

async function clearKey() {
  unlockedKey = '';
  await removeStorage(KEY_RECORD);
}

/* 退出应用/切后台时可主动锁上，内存里不长期留明文 */
function lock() {
  unlockedKey = '';
}

function peekUnlocked() {
  return unlockedKey;
}

/* 是否需要用户先输口令解锁（加密模式且本次会话还没解开） */
async function needsUnlock() {
  const sealed = await isSealed();
  if (!sealed) return false;
  return !unlockedKey;
}

/* 只给 UI 显示用：Key 末四位 */
function maskKey(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

module.exports = {
  KEY_RECORD,
  ITERATIONS,
  readRecord,
  currentKey,
  hasKey,
  isSealed,
  saveKey,
  unlockKey,
  clearKey,
  lock,
  peekUnlocked,
  needsUnlock,
  maskKey,
};
