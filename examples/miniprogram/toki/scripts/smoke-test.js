/* 冒烟测试：把小程序运行时用最小桩模拟出来，验证数据层、页面逻辑和加密同步。
   用法：node scripts/smoke-test.js
   不需要 Dimina 容器，也不联网（wx.request 是内存里的假 Gist）。 */
const path = require('path');
const nodeCrypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

const storage = new Map();
let clipboard = '';
const gists = new Map();
let gistSeq = 0;
let lastToast = '';
let modalAnswer = true;
let navLog = [];

const wx = {
  setStorage({ key, data, success }) { storage.set(key, JSON.stringify(data)); success && success(); },
  getStorage({ key, success, fail }) {
    if (storage.has(key)) success && success({ data: JSON.parse(storage.get(key)) });
    else fail && fail({ errMsg: 'not found' });
  },
  getStorageSync(key) { return storage.has(key) ? JSON.parse(storage.get(key)) : ''; },
  setStorageSync(key, data) { storage.set(key, JSON.stringify(data)); },
  showToast({ title }) { lastToast = title; },
  showModal({ success }) { success && success({ confirm: modalAnswer, cancel: !modalAnswer }); },
  setClipboardData({ data, success }) { clipboard = data; success && success(); },
  getClipboardData({ success }) { success && success({ data: clipboard }); },
  removeStorage({ key, success }) { storage.delete(key); success && success(); },
  removeStorageSync(key) { storage.delete(key); },
  chooseImage({ success }) { success && success({ tempFilePaths: ['/tmp/fake.png'] }); },
  getFileSystemManager() {
    return {
      readFile({ filePath, encoding, success }) {
        if (encoding !== 'base64') return success && success({ data: '' });
        success && success({ data: 'iVBORw0KGgoAAAANSUhEUg==' });
      },
    };
  },
  setNavigationBarColor() {},

  /* 一个极简的 Gitee / GitHub gist 服务：只覆盖本项目用到的几个接口 */
  request({ url, method, header, data, success, fail }) {
    setTimeout(() => {
      const u0 = String(url);
      const u = u0.split('?')[0];
      const auth = (header && (header.Authorization || '')) || '';
      const token = auth.replace('Bearer ', '') || (u.match(/access_token=([^&]+)/) || [])[1] || '';
      try {
        if (/\/gists$/.test(u) && /per_page=100/.test(u0)) {
          return success({ statusCode: 200, data: Array.from(gists.values()) });
        }
        if (/\/gists\/NEW$/.test(u)) return success({ statusCode: 500, data: {} });
        const post = /\/gists$/.test(u) && method === 'POST';
        if (post) {
          const id = 'gist-' + (++gistSeq);
          const body = typeof data === 'string' ? JSON.parse(data) : data;
          const g = { id, files: body.files, description: body.description };
          gists.set(id, g);
          return success({ statusCode: 201, data: g });
        }
        const m = u.match(/\/gists\/([\w-]+)$/);
        if (m) {
          const id = m[1];
          if (!gists.has(id)) return success({ statusCode: 404, data: {} });
          const g = gists.get(id);
          if (method === 'PATCH') {
            const body = typeof data === 'string' ? JSON.parse(data) : data;
            g.files = body.files; g.description = body.description;
            return success({ statusCode: 200, data: g });
          }
          return success({ statusCode: 200, data: g });
        }
        return success({ statusCode: 404, data: {} });
      } catch (e) { return fail && fail({ errMsg: 'mock failed ' + e.message }); }
    }, 0);
  },
  navigateTo({ url }) { navLog.push(url); },
  redirectTo({ url }) { navLog.push(url); },
  navigateBack() { navLog.push('back'); },
};

let appConfig = null;
const pages = [];
global.wx = wx;
global.App = cfg => { appConfig = cfg; };
global.Page = cfg => { pages.push(cfg); };
global.getApp = () => appConfig;
global.getCurrentPages = () => [{}, {}];

require(path.join(ROOT, 'app.js'));
const app = appConfig;
global.getApp = () => app;

const wait = ms => new Promise(r => setTimeout(r, ms));

function makePage(file, query) {
  pages.length = 0;
  delete require.cache[require.resolve(path.join(ROOT, file))];
  require(path.join(ROOT, file));
  const cfg = pages[0];
  cfg.data = JSON.parse(JSON.stringify(cfg.data || {}));
  cfg.setData = function (patch, cb) {
    for (const k of Object.keys(patch)) this.data[k] = patch[k];
    if (cb) cb();
  };
  return cfg;
}

(async () => {
  let fails = 0;
  const ok = (cond, label) => {
    if (!cond) { console.log('FAIL', label); fails++; } else console.log('ok  ', label);
  };

  /* ---- 加密模块：与 Node 自带的 crypto 对拍 ---- */
  const cryptoLib = require(path.join(ROOT, 'utils/crypto.js'));
  const hex = u8 => Buffer.from(u8).toString('hex');
  for (const text of ['', 'abc', '中文测试 ¥€', 'a'.repeat(1000)]) {
    ok(hex(cryptoLib.sha256(cryptoLib.utf8Encode(text))) === nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex'),
      `SHA-256 ${JSON.stringify(text.slice(0, 8))}`);
  }
  {
    const salt = nodeCrypto.randomBytes(16);
    const mine = hex(await cryptoLib.pbkdf2('pw', new Uint8Array(salt), 2500, 32));
    const ref = nodeCrypto.pbkdf2Sync('pw', salt, 2500, 32, 'sha256').toString('hex');
    ok(mine === ref, 'PBKDF2-SHA256 与 Node 一致');
  }
  {
    const subtle = nodeCrypto.webcrypto.subtle;
    let same = true, round = true;
    for (const len of [1, 15, 16, 17, 100]) {
      const key = nodeCrypto.randomBytes(32), iv = nodeCrypto.randomBytes(12), pt = nodeCrypto.randomBytes(len);
      const mine = cryptoLib.aesGcmEncrypt(new Uint8Array(key), new Uint8Array(iv), new Uint8Array(pt));
      const ck = await subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
      const ref = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, ck, pt));
      if (hex(mine) !== hex(ref)) same = false;
      const back = cryptoLib.aesGcmDecrypt(new Uint8Array(key), new Uint8Array(iv), mine);
      if (!back || hex(back) !== hex(new Uint8Array(pt))) round = false;
    }
    ok(same, 'AES-256-GCM 密文与 WebCrypto 逐字节一致');
    ok(round, 'AES-256-GCM 往返正确');
  }

  app.onLaunch();
  await app.ready();
  await wait(30);
  const store = require(path.join(ROOT, 'utils/store.js'));
  const M = require(path.join(ROOT, 'utils/model.js'));
  const cryptoMod = require(path.join(ROOT, 'utils/crypto.js'));
  const realPbkdf2 = cryptoMod.pbkdf2;
  cryptoMod.pbkdf2 = (p, s2, it, len, cb) => realPbkdf2(p, s2, 10, len, cb);   // 测试里只跑 10 轮

  let st = store.getState();
  ok(st.identities.length === 7 && st.accounts.length === 18, `示例数据 ${st.identities.length}/${st.accounts.length}`);

  /* --- 首页 --- */
  const home = makePage('pages/home/home.js', {});
  home.onLoad();
  await wait(30);
  home.refresh();
  ok(home.data.cards.length === 3, `首页邮箱卡 ${home.data.cards.length}`);
  ok(home.data.grid.length > 0, `首页网格 ${home.data.grid.length}`);
  ok(home.data.summary.includes('网站与 App'), '首页摘要');

  home.onKind({ currentTarget: { dataset: { kind: 'phone' } } });
  await wait(20);
  ok(home.data.kind === 'phone' && home.data.cards.length === 2, `切到手机号 ${home.data.cards.length}`);

  home.onTogglePrivacy();
  await wait(20);
  ok(home.data.privacy === true, '隐私模式打开');
  home.onTogglePrivacy();
  await wait(20);

  /* --- 新增身份 --- */
  const idPage = makePage('pages/identity-edit/identity-edit.js', { type: 'email' });
  idPage.onLoad({ type: 'email' });
  await wait(30);
  idPage.onValue({ detail: { value: 'smoke@test.com' } });
  idPage.onLabel({ detail: { value: '测试邮箱' } });
  idPage.onColor({ currentTarget: { dataset: { color: '#bf5af2' } } });
  idPage.onSave();
  await wait(50);
  st = store.getState();
  const added = st.identities.find(i => i.value === 'smoke@test.com');
  ok(!!added, '新增邮箱身份');
  ok(added && added.label === '测试邮箱', '标签写入');
  ok(lastToast === '已添加', `提示: ${lastToast}`);

  /* --- 重复校验 --- */
  const dupPage = makePage('pages/identity-edit/identity-edit.js', { type: 'email' });
  dupPage.onLoad({ type: 'email' });
  await wait(20);
  dupPage.onValue({ detail: { value: 'smoke@test.com' } });
  dupPage.onSave();
  await wait(20);
  ok(lastToast === '这个身份已经添加过了', `重复拦截: ${lastToast}`);

  /* --- 新增网站，关联新身份 --- */
  const accPage = makePage('pages/account-edit/account-edit.js', {});
  accPage.onLoad({});
  await wait(30);
  accPage.onName({ detail: { value: 'Notion' } });
  accPage.onSuggestion({ currentTarget: { dataset: { i: 0 } } });
  ok(accPage.data.domain === 'notion.so', `预设补全域名: ${accPage.data.domain}`);
  accPage.onPick({ currentTarget: { dataset: { id: added.id } } });
  accPage.onHandle({ detail: { value: 'smoke' } });
  accPage.onSave();
  await wait(50);
  st = store.getState();
  const acc = st.accounts.find(a => a.handle === 'smoke');
  ok(!!acc, '新增网站账号');
  ok(acc && acc.identityIds.includes(added.id), '关联身份');
  ok(acc && acc.category === '工具', `预设分类 ${acc && acc.category}`);

  /* --- 新增密钥，关联账号 --- */
  const tokPage = makePage('pages/token-edit/token-edit.js', {});
  tokPage.onLoad({});
  await wait(30);
  tokPage.openPlatform();
  tokPage.onPlatformQuery({ detail: { value: 'GitHub' } });
  tokPage.onPickPlatform({ currentTarget: { dataset: { i: 0 } } });
  await wait(20);
  ok(tokPage.data.platform === 'GitHub', `选平台 ${tokPage.data.platform}`);
  tokPage.onName({ detail: { value: '博客部署 PAT' } });
  tokPage.onValue({ detail: { value: 'ghp_1234567890abcdef' } });
  tokPage.onExpiryMode({ currentTarget: { dataset: { mode: 'date' } } });
  tokPage.onExpiryDate({ detail: { value: '2027-01-01' } });
  tokPage.onSave();
  await wait(50);
  st = store.getState();
  const tok = st.tokens.find(t => t.name === '博客部署 PAT');
  ok(!!tok, '新增密钥');
  ok(tok && tok.expiresAt > 0, '有效期写入');
  ok(tok && tok.platform === 'GitHub', '平台写入');

  /* --- 密钥页 --- */
  const tokList = makePage('pages/tokens/tokens.js', {});
  tokList.onLoad();
  await wait(30);
  tokList.refresh();
  ok(tokList.data.list.length === 1, `密钥列表 ${tokList.data.list.length}`);
  ok(tokList.data.list[0].value.includes('••••'), '密钥默认打码');
  tokList.onReveal({ currentTarget: { dataset: { id: tok.id } } });
  await wait(20);
  ok(tokList.data.list[0].revealed === true && tokList.data.list[0].value === 'ghp_1234567890abcdef', '展开密钥');
  tokList.onCopy({ currentTarget: { dataset: { id: tok.id } } });
  await wait(10);
  ok(clipboard === 'ghp_1234567890abcdef', '复制到剪贴板');

  /* --- 网站页 --- */
  const sites = makePage('pages/sites/sites.js', {});
  sites.onLoad();
  await wait(30);
  sites.refresh();
  ok(sites.data.groups.length > 0, `网站分组 ${sites.data.groups.length}`);
  const catKey = sites.data.groups[0].title;
  sites.onFilter({ currentTarget: { dataset: { key: catKey } } });
  await wait(20);
  ok(sites.data.groups.length === 1, `分类筛选 ${sites.data.cat}`);

  /* --- 关系图 --- */
  const graph = makePage('pages/graph/graph.js', {});
  graph.onLoad();
  await wait(30);
  graph.refresh();
  ok(graph.data.nodes.length > 0, `关系图节点 ${graph.data.nodes.length}`);
  ok(String(graph.data.edgesUrl || '').indexOf('svg') >= 0, '关系图是 SVG 连线');
  ok(!graph.data.empty, '关系图非空');

  /* --- 备份：导出 / 导入 --- */
  const backup = makePage('pages/backup/backup.js', {});
  backup.onLoad();
  await wait(30);
  backup.refresh();
  const exported = backup.data.json;
  ok(exported.includes('"app": "toki"'), '导出格式');
  backup.onCopy();
  await wait(10);
  ok(clipboard === exported, '备份复制');

  clipboard = exported;
  backup.onReadClipboard();
  await wait(10);
  ok(backup.data.canImport === true, '从剪贴板识别备份');
  backup.onMode({ currentTarget: { dataset: { mode: 'replace' } } });
  backup.onImport();
  await wait(80);
  st = store.getState();
  ok(st.identities.length === 8, `覆盖导入后身份数 ${st.identities.length}`);
  ok(st.tokens.length === 1, `覆盖导入后密钥数 ${st.tokens.length}`);

  /* --- 删除网站：密钥断链修复 --- */
  const delPage = makePage('pages/account-edit/account-edit.js', { id: acc.id });
  delPage.onLoad({ id: acc.id });
  await wait(30);
  delPage.onDelete();
  await wait(60);
  st = store.getState();
  ok(!st.accounts.find(a => a.id === acc.id), '删除网站');

  /* --- 加密同步 --- */
  const Sync = require(path.join(ROOT, 'utils/sync.js'));
  const crypto2 = require(path.join(ROOT, 'utils/crypto.js'));
  await Sync.enable('a'.repeat(32), 'password123', 'gitee');
  await wait(60);
  const conf = JSON.parse(storage.get('atlas.sync'));
  ok(!!conf && !!conf.gistId, '开启同步并创建 Gist');
  ok(gists.size === 1, '云端有一个私密 Gist');
  const remoteText = Array.from(gists.values())[0].files['atlas.enc.json'].content;
  ok(remoteText.indexOf('"ct"') > 0 && remoteText.indexOf('smoke@test.com') < 0, '云端的正文是密文');

  const keyBytes = crypto2.b64decode(conf.key);
  const box = JSON.parse(remoteText);
  const plain = JSON.parse(crypto2.utf8Decode(
    crypto2.aesGcmDecrypt(keyBytes, crypto2.b64decode(box.iv), crypto2.b64decode(box.ct))
  ));
  ok(plain.identities.length === store.getState().identities.length, `解密后身份数一致 ${plain.identities.length}`);

  // 本机改动 → 自动同步到云端
  const before = plain.identities.length;
  const st2 = store.getState();
  st2.identities.push({ id: 'sync-test-1', type: 'email', value: 'sync@test.com', label: '同步测试', color: '#ff375f', notes: '' });
  await store.save();
  await Sync.run();
  await wait(80);

  const remote2 = JSON.parse(Array.from(gists.values())[0].files['atlas.enc.json'].content);
  const plain2 = JSON.parse(crypto2.utf8Decode(
    crypto2.aesGcmDecrypt(keyBytes, crypto2.b64decode(remote2.iv), crypto2.b64decode(remote2.ct))
  ));
  ok(plain2.identities.length === before + 1, `本机新增已同步到云端 ${plain2.identities.length}`);

  // 云端多一条 → 合并回本机
  plain2.identities.push({ id: 'sync-test-2', type: 'email', value: 'remote@test.com', label: '云端新增', color: '#30d158', notes: '' });
  const iv2 = crypto2.randomBytes(12);
  const sealed2 = crypto2.aesGcmEncrypt(keyBytes, iv2, crypto2.utf8Encode(JSON.stringify(plain2)));
  const g = Array.from(gists.values())[0];
  g.files['atlas.enc.json'].content = JSON.stringify({ v: 1, salt: conf.salt, iv: crypto2.b64encode(iv2), ct: crypto2.b64encode(sealed2), at: Date.now() });
  await Sync.run();
  await wait(120);
  ok(store.getState().identities.some(i => i.id === 'sync-test-2'), '云端新增合并回本机');

  /* --- 自定义图标 --- */
  const liveAcc = store.getState().accounts.find(a => a.name === 'Claude');
  const iconPage = makePage('pages/account-edit/account-edit.js', { id: liveAcc.id });
  iconPage.onLoad({ id: liveAcc.id });
  await wait(30);
  iconPage.onPickIcon();
  await wait(40);
  ok(String(iconPage.data.iconData).indexOf('data:image/') === 0, '自定义图标转成 data URL');
  ok(iconPage.data.previewTile.iconSrc === iconPage.data.iconData, '图标进入预览');
  iconPage.onSave();
  await wait(60);
  ok(String(store.getState().accounts.find(a => a.id === liveAcc.id).icon).indexOf('data:image/') === 0, '图标写入记录');

  console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('harness error', e); process.exit(1); });
