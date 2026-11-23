/* Itemory 小程序 · 封面图片
   桌面版把封面存成 SQLite 里的 PNG blob；小程序里没有 SQLite，也没有 Keychain，
   所以封面存成 USER_DATA_PATH 下的真实文件，物品记录里只留 assetId。

   注意：chooseImage 只有 Android / iOS / Harmony 有实现，Web 容器没有；
   Web 运行时里的 USER_DATA_PATH 也只是本会话临时文件。所以封面功能在 Web 上会
   明确提示不支持，其余功能（图标用 Emoji）不受影响。 */

const COVER_DIR_NAME = 'covers';
const COVER_LIMIT_BYTES = 4 * 1024 * 1024;

function fs() {
  return wx.getFileSystemManager();
}

function userDataPath() {
  return (wx.env && wx.env.USER_DATA_PATH) || 'difile://usr';
}

function coverDir() {
  return `${userDataPath()}/${COVER_DIR_NAME}`;
}

function coverPath(assetId) {
  return `${coverDir()}/${assetId}.png`;
}

function call(api, options) {
  return new Promise((resolve, reject) => {
    api(Object.assign({}, options, {
      success: resolve,
      fail: err => reject(new Error((err && err.errMsg) || '文件操作失败')),
    }));
  });
}

async function ensureDir() {
  const dir = coverDir();
  try {
    const res = await fs().stat({ path: dir });
    const stats = res && res.stats;
    if (stats && stats.isFile && stats.isFile()) throw new Error('封面目录被同名文件占用');
    return dir;
  } catch (e) {
    try {
      await fs().mkdir({ dirPath: dir, recursive: true });
    } catch (err) {
      /* 目录已存在时 mkdir 也会报错，下面再确认一次 */
      try {
        await fs().stat({ path: dir });
      } catch (e2) {
        throw new Error('无法创建封面目录');
      }
    }
    return dir;
  }
}

/* ---------- base64（逻辑层没有 atob/btoa，自己算） ---------- */

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(base64) {
  const clean = String(base64).replace(/^data:[^;]+;base64,/, '').replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4) - pad);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    if (p < bytes.length) bytes[p++] = (n >> 16) & 255;
    if (p < bytes.length) bytes[p++] = (n >> 8) & 255;
    if (p < bytes.length) bytes[p++] = n & 255;
  }
  return bytes;
}

/* ---------- 读写 ---------- */

async function readFileBase64(path) {
  if (!path) return null;
  const res = await call(fs().readFile, { filePath: path });
  const data = res && res.data;
  if (!data) return null;
  if (typeof data === 'string') return data; // 某些平台直接给 base64
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
  return bytesToBase64(bytes);
}

async function writeCoverFile(base64, assetId) {
  await ensureDir();
  const path = coverPath(assetId);
  const bytes = base64ToBytes(base64);
  await call(fs().writeFile, { filePath: path, data: bytes.buffer });
  return path;
}

async function removeFileIfExists(path) {
  if (!path) return;
  try { await call(fs().unlink, { filePath: path }); } catch (e) { /* 不存在就算了 */ }
}

/* 删掉不再被任何 asset 引用的封面文件 */
async function pruneCovers(assets) {
  const keep = new Set((assets || []).map(a => a.path));
  let names = [];
  try {
    const res = await call(fs().readdir, { dirPath: coverDir() });
    names = (res && res.files) || [];
  } catch (e) {
    return;
  }
  for (const name of names) {
    const full = `${coverDir()}/${name}`;
    if (!keep.has(full)) await removeFileIfExists(full);
  }
}

/* ---------- 选图 ---------- */

/* 只选图、不落盘：给裁剪页当输入 */
async function chooseTempImage() {
  if (!canPickImage()) throw new Error('当前平台不支持选择图片');
  const chosen = await new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: err => reject(new Error((err && err.errMsg) || '没有选择图片')),
    });
  });
  const tempFilePath = (chosen.tempFilePaths || [])[0];
  if (!tempFilePath) throw new Error('没有选择图片');
  return tempFilePath;
}

function canPickImage() {
  return typeof wx.chooseImage === 'function';
}

/**
 * 选一张图并持久化为封面。
 * @returns {Promise<{id:string,path:string,mime:string,byteSize:number,createdAt:number}>}
 */
async function pickCover() {
  if (!canPickImage()) throw new Error('当前平台不支持选择图片');
  const chosen = await new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: err => reject(new Error((err && err.errMsg) || '没有选择图片')),
    });
  });
  const tempFilePath = (chosen.tempFilePaths || [])[0];
  if (!tempFilePath) throw new Error('没有选择图片');

  let byteSize = 0;
  try {
    const info = await call(fs().stat, { path: tempFilePath });
    byteSize = (info && info.stats && info.stats.size) || 0;
  } catch (e) { byteSize = 0; }
  if (byteSize > COVER_LIMIT_BYTES) throw new Error('图片太大，请选 4MB 以内的图');

  await ensureDir();
  const id = `cover_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const target = coverPath(id);
  const saved = await call(fs().saveFile, { tempFilePath, filePath: target });
  const path = (saved && saved.savedFilePath) || target;
  return {
    id,
    path,
    mime: 'image/png',
    byteSize,
    createdAt: Date.now(),
  };
}

/* 把一个临时文件持久化成封面资源（裁剪页与直接选图都用它） */
async function persistFromTemp(tempPath, byteSize) {
  if (!tempPath) throw new Error('没有可保存的图片');
  await ensureDir();
  const id = `cover_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const target = coverPath(id);
  const saved = await call(fs().saveFile, { tempFilePath: tempPath, filePath: target });
  const path = (saved && saved.savedFilePath) || target;
  let size = byteSize || 0;
  if (!size) {
    try {
      const info = await call(fs().stat, { path });
      size = (info && info.stats && info.stats.size) || 0;
    } catch (e) { size = 0; }
  }
  return { id, path, mime: 'image/png', byteSize: size, createdAt: Date.now() };
}

async function fileExists(path) {
  if (!path) return false;
  try {
    const res = await call(fs().stat, { path });
    const stats = res && res.stats;
    return !stats || !stats.isFile || stats.isFile();
  } catch (e) {
    return false;
  }
}

module.exports = {
  COVER_DIR_NAME,
  COVER_LIMIT_BYTES,
  coverDir,
  coverPath,
  bytesToBase64,
  base64ToBytes,
  readFileBase64,
  writeCoverFile,
  removeFileIfExists,
  pruneCovers,
  canPickImage,
  chooseTempImage,
  pickCover,
  persistFromTemp,
  fileExists,
};
