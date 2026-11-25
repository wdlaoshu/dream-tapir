/* Toki 小程序 · 纯 JS 加密
   逻辑层跑在 QuickJS / JavaScriptCore 里，没有 Web Crypto，所以这里自己实现
   SHA-256、HMAC、PBKDF2 和 AES-256-GCM。算法与网页版一致：
   PBKDF2(SHA-256, 310000 次) 派生 256 位密钥，AES-GCM 用 96 位 IV，
   密文按 Web Crypto 的顺序拼成 ciphertext || tag(16)。

   这些实现只服务于「把数据用同步密码加密后放进自己的私密 Gist」这一个用途。 */

/* ---------- 字节工具 ---------- */
function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        i++;
        continue;
      }
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b < 0x80) s += String.fromCharCode(b);
    else if (b < 0xe0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0) s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      const v = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    }
  }
  return s;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b || 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c || 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

function b64decode(str) {
  const clean = String(str || '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}

/* ---------- 随机 ----------
   逻辑层没有 crypto.getRandomValues，这里用 Math.random 加时间做种子。
   IV 只用于单次加密，风险可接受；文档里也写明了这一点。 */
function randomBytes(n) {
  const out = new Uint8Array(n);
  let seed = (Date.now() ^ ((typeof performance !== 'undefined' && performance.now && performance.now() * 1000) || 0)) >>> 0;
  for (let i = 0; i < n; i++) {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    out[i] = (seed ^ Math.floor(Math.random() * 4294967296)) & 255;
  }
  return out;
}

/* ---------- SHA-256 ---------- */
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function sha256(msg) {
  const len = msg.length;
  const withPad = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  withPad.set(msg, 0);
  withPad[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bits >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(bits / 4294967296), false);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Int32Array(64);

  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }

  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  h.forEach((v, i) => odv.setInt32(i * 4, v, false));
  return out;
}

function hmacSha256(key, msg) {
  let k = key.length > 64 ? sha256(key) : key;
  const pad = new Uint8Array(64);
  pad.set(k, 0);
  const inner = new Uint8Array(64), outer = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    inner[i] = pad[i] ^ 0x36;
    outer[i] = pad[i] ^ 0x5c;
  }
  return sha256(concat(outer, sha256(concat(inner, msg))));
}

/* ---------- PBKDF2 ----------
   31 万次迭代在纯 JS 里很贵，所以不每轮重新哈希 HMAC 的 64 字节前缀：
   ipad/opad 两块的压缩状态先算好，之后每轮只处理「消息 + 填充」这一块，
   内层一次压缩、外层一次压缩。缓冲区全部复用，不在循环里分配。 */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/* 压缩一个 64 字节块进 h（就地修改） */
function compress(h, w, block, off) {
  for (let i = 0; i < 16; i++) {
    w[i] = (block[off + i * 4] << 24) | (block[off + i * 4 + 1] << 16) |
      (block[off + i * 4 + 2] << 8) | block[off + i * 4 + 3];
  }
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

const SHA_IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

async function pbkdf2(password, salt, iterations, dkLen, onProgress) {
  const pass = typeof password === 'string' ? utf8Encode(password) : password;
  const keyBytes = pass.length > 64 ? sha256(pass) : pass;

  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const k = i < keyBytes.length ? keyBytes[i] : 0;
    ipad[i] = k ^ 0x36;
    opad[i] = k ^ 0x5c;
  }

  const w = new Int32Array(64);
  const midIn = Int32Array.from(SHA_IV), midOut = Int32Array.from(SHA_IV);
  compress(midIn, w, ipad, 0);
  compress(midOut, w, opad, 0);

  const hIn = new Int32Array(8), hOut = new Int32Array(8);
  const block = new Uint8Array(64);
  const blockDv = new DataView(block.buffer);
  const digest = new Uint8Array(32);
  const dv = new DataView(digest.buffer);

  /* 内层消息 = 32 字节，总长 96 字节；填充块里写 96*8 = 768 位 */
  function hmac32(u) {
    block.fill(0);
    block.set(u, 0);
    block[32] = 0x80;
    blockDv.setUint32(60, 768, false);   /* (64 + 32) * 8 位 */

    hIn.set(midIn);
    compress(hIn, w, block, 0);
    for (let i = 0; i < 8; i++) dv.setInt32(i * 4, hIn[i], false);

    block.fill(0);
    block.set(digest, 0);
    block[32] = 0x80;
    blockDv.setUint32(60, 768, false);

    hOut.set(midOut);
    compress(hOut, w, block, 0);
    for (let i = 0; i < 8; i++) dv.setInt32(i * 4, hOut[i], false);
    return digest;
  }

  const hLen = 32;
  const blocks = Math.ceil(dkLen / hLen);
  const out = new Uint8Array(blocks * hLen);
  const CHUNK = 4000;
  const u = new Uint8Array(32);
  const t = new Uint8Array(32);

  for (let b = 1; b <= blocks; b++) {
    u.set(salt, 0);
    u[32 - 4] = (b >>> 24) & 255; u[32 - 3] = (b >>> 16) & 255;
    u[32 - 2] = (b >>> 8) & 255; u[32 - 1] = b & 255;
    /* 第一个 u 是 F(P, S, i)：内层前缀是 ipad，消息是 salt||i（这里 salt 是 16 字节） */
    const msg = new Uint8Array(salt.length + 4);
    msg.set(salt, 0);
    msg[salt.length] = (b >>> 24) & 255; msg[salt.length + 1] = (b >>> 16) & 255;
    msg[salt.length + 2] = (b >>> 8) & 255; msg[salt.length + 3] = b & 255;

    const u1 = hmacGenericWithMidstate(msg);
    t.set(u1);
    u.set(u1);

    for (let i = 1; i < iterations; i++) {
      const next = hmac32(u);
      u.set(next);
      for (let j = 0; j < 32; j++) t[j] ^= next[j];
      if (i % CHUNK === 0) {
        if (onProgress) onProgress(Math.min(1, (i + (b - 1) * iterations) / (iterations * blocks)));
        await tick();
      }
    }
    out.set(t, (b - 1) * hLen);
  }
  if (onProgress) onProgress(1);
  return out.slice(0, dkLen);

  /* 第一轮的消息长度随 salt 变，走一次通用 HMAC */
  function hmacGenericWithMidstate(msgBytes) {
    const inner = sha256(concat(ipad, msgBytes));
    return sha256(concat(opad, inner));
  }
}

/* ---------- AES-256 ---------- */
/* S-box 由 GF(2^8) 求逆加仿射变换现场算出，省掉 256 个常量 */
const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
(function buildSbox() {
  for (let i = 0; i < 256; i++) {
    let inv = 0;
    if (i) {
      for (let j = 1; j < 256; j++) {
        if (gmul(i, j) === 1) { inv = j; break; }
      }
    }
    let s = inv;
    let x = inv;
    for (let k = 0; k < 4; k++) {
      x = ((x << 1) | (x >> 7)) & 255;
      s ^= x;
    }
    s ^= 0x63;
    SBOX[i] = s;
    INV_SBOX[s] = i;
  }
})();

/* GF(2^8) 乘法 */
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 255;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function expandKey(key) {
  const Nk = 8, Nr = 14;
  const w = new Uint8Array(4 * 4 * (Nr + 1));
  w.set(key.slice(0, 32), 0);
  const rcon = new Uint8Array(32);
  let rc = 1;
  for (let i = 0; i < 8; i++) { rcon[i] = rc; rc = gmul(rc, 2); }
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t = w.slice((i - 1) * 4, i * 4);
    if (i % Nk === 0) {
      t = new Uint8Array([SBOX[t[1]] ^ rcon[i / Nk - 1], SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]);
    } else if (i % Nk === 4) {
      t = new Uint8Array([SBOX[t[0]], SBOX[t[1]], SBOX[t[2]], SBOX[t[3]]]);
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ t[j];
  }
  return w;
}

function encryptBlock(w, block) {
  const s = block.slice();
  const addRound = (r) => { for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i]; };

  addRound(0);
  for (let round = 1; round <= 13; round++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    /* ShiftRows */
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t;
    t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
    /* MixColumns */
    for (let c = 0; c < 4; c++) {
      const i = c * 4;
      const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
      s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
      s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
      s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
    addRound(round);
  }
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
  let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
  t = s[2]; s[2] = s[10]; s[10] = t;
  t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
  addRound(14);
  return s;
}

/* ---------- GCM ---------- */
function gfMul(x, y) {
  /* 128 位乘法，GCM 的 GHASH 用它 */
  let z = new Uint32Array(4);
  let v = new Uint32Array(x);
  for (let i = 0; i < 128; i++) {
    const bit = (y[i >> 5] >>> (31 - (i & 31))) & 1;
    if (bit) for (let k = 0; k < 4; k++) z[k] ^= v[k];
    const lsb = v[3] & 1;
    v[3] = (v[3] >>> 1) | ((v[2] & 1) << 31);
    v[2] = (v[2] >>> 1) | ((v[1] & 1) << 31);
    v[1] = (v[1] >>> 1) | ((v[0] & 1) << 31);
    v[0] = v[0] >>> 1;
    if (lsb) v[0] ^= 0xe1000000;
  }
  return z;
}

function toWords(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return new Uint32Array([dv.getUint32(0), dv.getUint32(4), dv.getUint32(8), dv.getUint32(12)]);
}

function fromWords(words) {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, words[0]);
  dv.setUint32(4, words[1]);
  dv.setUint32(8, words[2]);
  dv.setUint32(12, words[3]);
  return out;
}

function ghash(hWords, data) {
  let y = new Uint32Array(4);
  for (let off = 0; off < data.length; off += 16) {
    const block = new Uint8Array(16);
    block.set(data.subarray(off, off + 16));
    const bw = toWords(block);
    for (let i = 0; i < 4; i++) y[i] ^= bw[i];
    y = gfMul(y, hWords);
  }
  return y;
}

/* counterWords 是 J0 之后的下一个计数器，按 32 位字递增 */
function ctrCrypt(w, counterWords, input) {
  const out = new Uint8Array(input.length);
  const ctr = counterWords;
  for (let off = 0; off < input.length; off += 16) {
    const stream = encryptBlock(w, fromWords(ctr));
    const n = Math.min(16, input.length - off);
    for (let i = 0; i < n; i++) out[off + i] = input[off + i] ^ stream[i];
    ctr[3] = (ctr[3] + 1) >>> 0;
    if (ctr[3] === 0) {
      ctr[2] = (ctr[2] + 1) >>> 0;
      if (ctr[2] === 0) {
        ctr[1] = (ctr[1] + 1) >>> 0;
        if (ctr[1] === 0) ctr[0] = (ctr[0] + 1) >>> 0;
      }
    }
  }
  return out;
}

function lengthBlock(aadLen, ctLen) {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, Math.floor((aadLen * 8) / 4294967296));
  dv.setUint32(4, (aadLen * 8) >>> 0);
  dv.setUint32(8, Math.floor((ctLen * 8) / 4294967296));
  dv.setUint32(12, (ctLen * 8) >>> 0);
  return out;
}

/* GHASH 的输入不是简单的字节流：AAD 和密文各自补零到 16 字节边界，
   最后再跟一个 16 字节的长度块。按 16 字节切一个拼接串会在
   密文长度不是 16 的倍数时把长度块切开，tag 就对不上了。 */
function ghashInput(aad, ct, lenBlock) {
  const aadLen = Math.ceil(aad.length / 16) * 16;
  const ctLen = Math.ceil(ct.length / 16) * 16;
  const out = new Uint8Array(aadLen + ctLen + 16);
  out.set(aad, 0);
  out.set(ct, aadLen);
  out.set(lenBlock, aadLen + ctLen);
  return out;
}

/* 加密：返回 ciphertext || tag，和 Web Crypto 一样 */
function aesGcmEncrypt(key, iv, plaintext, aad) {
  const w = expandKey(key);
  const hWords = toWords(encryptBlock(w, new Uint8Array(16)));
  const j0 = new Uint8Array(16);
  j0.set(iv.slice(0, 12), 0);
  j0[15] = 1;
  const counter = toWords(j0);
  counter[3] = (counter[3] + 1) >>> 0;   /* 数据从 inc32(J0) 开始 */

  const ct = ctrCrypt(w, counter, plaintext);
  const aadBytes = aad || new Uint8Array(0);
  const s = fromWords(ghash(hWords, ghashInput(aadBytes, ct, lengthBlock(aadBytes.length, ct.length))));
  const ej0 = encryptBlock(w, j0);
  const tag = new Uint8Array(16);
  for (let i = 0; i < 16; i++) tag[i] = s[i] ^ ej0[i];
  return concat(ct, tag);
}

/* 解密：输入 ciphertext || tag，认证失败返回 null */
function aesGcmDecrypt(key, iv, sealed, aad) {
  if (sealed.length < 16) return null;
  const w = expandKey(key);
  const hWords = toWords(encryptBlock(w, new Uint8Array(16)));
  const j0 = new Uint8Array(16);
  j0.set(iv.slice(0, 12), 0);
  j0[15] = 1;
  const counter = toWords(j0);
  counter[3] = (counter[3] + 1) >>> 0;

  const ct = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  const aadBytes = aad || new Uint8Array(0);
  const s = fromWords(ghash(hWords, ghashInput(aadBytes, ct, lengthBlock(aadBytes.length, ct.length))));
  const ej0 = encryptBlock(w, j0);
  const expect = new Uint8Array(16);
  for (let i = 0; i < 16; i++) expect[i] = s[i] ^ ej0[i];

  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= expect[i] ^ tag[i];
  if (diff !== 0) return null;

  return ctrCrypt(w, counter, ct);
}

module.exports = {
  utf8Encode, utf8Decode, concat, b64encode, b64decode, randomBytes,
  sha256, hmacSha256, pbkdf2,
  aesGcmEncrypt, aesGcmDecrypt,
  /* 导出给测试对拍用 */
  _ghash: ghash, _gfMul: gfMul, _toWords: toWords, _fromWords: fromWords,
};
