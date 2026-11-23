/* Toki 小程序 · 数据模型与纯函数
   这些函数与 toki 网页版 web/app.js 的同名逻辑保持一致，
   但不再操作 DOM，只返回数据，交给 WXML 渲染。
   源码 GPL-3.0。 */

const { PRESETS, TOKEN_PRESETS, TOKEN_CATS } = require('../data/presets.js');

const DAY = 86400000;
const KINDS = ['email', 'phone', 'login'];

/* 卡面色：色值 → [名字, 渐变色串] */
const SKINS = {
  '#0a84ff': ['深海', '#56c6ff 0%, #0a84ff 42%, #3b2fd0 100%'],
  '#30d158': ['青柠', '#d2f56a 0%, #30d158 48%, #0b7f6a 100%'],
  '#ff9f0a': ['落日', '#ffdf5c 0%, #ff9f0a 42%, #ff3d5a 100%'],
  '#ff375f': ['莓果', '#ff9bb8 0%, #ff375f 46%, #9e1470 100%'],
  '#bf5af2': ['极光', '#ff86dc 0%, #bf5af2 44%, #4636ee 100%'],
  '#64d2ff': ['冰川', '#9df0ff 0%, #4cc3fb 40%, #2a6cf0 100%'],
  '#ff453a': ['珊瑚', '#ffa36b 0%, #ff453a 46%, #c1185f 100%'],
  '#5e5ce6': ['靛蓝', '#9a98ff 0%, #5e5ce6 46%, #1f1b78 100%'],
  '#00c7be': ['海湾', '#8af5d6 0%, #00c7be 44%, #0a62b0 100%'],
  '#3a3a3c': ['曜石', '#76767c 0%, #3a3a3c 46%, #0d0d10 100%'],
  '#07c160': ['微信绿', '#7ee8a2 0%, #07c160 46%, #05785a 100%'],
  '#1d1d1f': ['石墨', '#c9ccd3 0%, #6e7079 34%, #2c2c30 68%, #111113 100%'],
};
const COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ff453a', '#5e5ce6', '#00c7be', '#3a3a3c'];

const LOGIN = {
  wechat: { name: '微信', short: '微信', color: '#07c160', field: '微信号', ph: 'wxid 或自定义微信号' },
  apple: { name: 'Apple 账户', short: 'Apple', color: '#1d1d1f', field: 'Apple ID', ph: 'name@icloud.com 或手机号' },
};

const CATS = ['社交', '购物', '支付金融', '开发', 'AI', '娱乐', '游戏', '出行', '工具', '加密', '其他'];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const provOf = i => (i && i.provider === 'apple' ? 'apple' : 'wechat');
const typeName = i => (i.type === 'login' ? LOGIN[provOf(i)].name : i.type === 'phone' ? '手机号' : '邮箱');
const isESim = i => i.type === 'phone' && i.esim === true;

/* 渐变；未知色值用同色深浅兜底 */
function grad(c) {
  if (SKINS[c]) return SKINS[c][1];
  return `${c} 0%, ${c} 48%, #0d0d10 100%`;
}
function skinName(c) {
  return SKINS[c] ? SKINS[c][0] : c;
}

const cleanDomain = d =>
  String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];

const normPlatformName = v => String(v || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function sitePreset(a) {
  a = a || {};
  const d = cleanDomain(a.domain);
  if (d) {
    const matches = PRESETS.filter(p => {
      const pd = cleanDomain(p[1]);
      return pd && (d === pd || d.endsWith('.' + pd));
    });
    if (matches.length) return matches.sort((x, y) => cleanDomain(y[1]).length - cleanDomain(x[1]).length)[0];
    return null;
  }
  const n = normPlatformName(a.name);
  return n ? PRESETS.find(p => normPlatformName(p[0]) === n) || null : null;
}

function brand(a) {
  const p = sitePreset(a);
  if (p) return p[3];
  const d = cleanDomain(a && a.domain), n = normPlatformName(a && a.name);
  let h = 0;
  for (const ch of (d || n || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 62%, 48%)`;
}

/* 关系图/平台分组：同一预设域名视为同一个平台节点 */
function accountPlatform(a) {
  const d = cleanDomain(a.domain), n = normPlatformName(a.name), p = sitePreset(a);
  if (p) return { key: `preset:${cleanDomain(p[1])}`, name: p[0], domain: cleanDomain(p[1]) };
  if (d) return { key: `domain:${d}`, name: a.name || d, domain: d };
  return { key: `name:${n || a.id}`, name: a.name || '未命名平台', domain: '' };
}

const identityIdsOf = a =>
  Array.isArray(a && a.identityIds) ? Array.from(new Set(a.identityIds.filter(id => typeof id === 'string' && id))) : [];

const idById = (state, id) => (state.identities || []).find(i => i.id === id);
const accById = (state, id) => (state.accounts || []).find(a => a.id === id);

const accountsOf = (state, id) =>
  (state.accounts || []).filter(a => identityIdsOf(a).includes(id)).sort((a, b) => zh(a.name, b.name));

const viaOf = (state, i) => {
  if (!i || i.type !== 'login' || !i.via) return null;
  const v = idById(state, i.via);
  return v && (v.type === 'email' || v.type === 'phone') ? v : null;
};

const boundTo = (state, id) =>
  (state.identities || []).filter(i => i.type === 'login' && i.via === id && viaOf(state, i));

const zh = (a, b) => String(a).localeCompare(String(b), 'zh-CN');

/* 隐私模式：号码、邮箱、账号名打码 */
function maskHandle(h) {
  return Array.from(String(h || '')).slice(0, 1).join('') + '•••';
}

function display(i, privacy) {
  const v = String((i && i.value) || '');
  if (!privacy) return v;
  if (i.type === 'email' || (i.type === 'login' && v.includes('@'))) {
    const [u, d = ''] = v.split('@');
    return u.slice(0, 2) + '•••' + (d ? '@' + d : '');
  }
  if (i.type === 'login' && provOf(i) === 'wechat') return Array.from(v).slice(0, 2).join('') + '•••';
  if (i.type !== 'phone' && i.type !== 'login') return v.slice(0, 2) + '•••';
  const digits = v.replace(/\D/g, '');
  return digits.length > 7 ? '••• •••• ' + digits.slice(-4) : '••••';
}

/* 中国大陆号段 → 运营商 */
function carrier(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^0086|^86(?=1\d{10}$)/, '');
  if (!/^1\d{10}$/.test(d)) {
    const m = String(v || '').trim().match(/^\+(\d{1,3})/);
    return m && m[1] !== '86' ? `+${m[1]}` : '';
  }
  const p3 = d.slice(0, 3), p4 = d.slice(0, 4);
  if (/^(13[4-9]|147|148|15[0-27-9]|172|178|18[2-478]|195|197|198)$/.test(p3) && p4 !== '1349') return '中国移动';
  if (/^(13[0-2]|145|146|15[56]|16[67]|17[156]|18[56]|196)$/.test(p3)) return '中国联通';
  if (/^(133|1349|149|153|17[347]|18[019]|19[0139])$/.test(p3) || p4 === '1349') return '中国电信';
  if (p3 === '192') return '中国广电';
  return '';
}

/* ---------- 密钥 ---------- */
const maskValue = v => {
  const s = String(v || '');
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
};

function expiryInfo(t) {
  if (!t.expiresAt) return { text: '无限期', cls: '' };
  const d = t.expiresAt - Date.now();
  if (d < 0) return { text: '已过期', cls: 'expired' };
  if (d < 7 * DAY) return { text: `${Math.ceil(d / DAY)} 天后到期`, cls: 'soon' };
  return { text: dateText(t.expiresAt), cls: '' };
}

function dateText(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const pad = n => (n < 10 ? '0' + n : String(n));

const normKey = s => cleanDomain(s).replace(/^www\./, '');

function presetForToken(t) {
  t = t || {};
  const platform = String(t.platform || '').trim().toLowerCase();
  const domain = normKey(t.domain);
  const oldName = String(t.name || '').trim().toLowerCase();
  return TOKEN_PRESETS.find(p =>
    (platform && p[0].toLowerCase() === platform) ||
    (domain && normKey(p[1]) === domain) ||
    (!platform && oldName && p[0].toLowerCase() === oldName));
}

const platformOfToken = t => String((t && t.platform) || (presetForToken(t) || [])[0] || '').trim();

function tokenVisual(t) {
  const p = presetForToken(t);
  return {
    name: platformOfToken(t) || (t && t.name) || '自定义平台',
    domain: (t && t.domain) || (p ? p[1] : ''),
    color: (t && t.color) || (p ? p[3] : '#0a84ff'),
    category: (t && t.category) || (p ? p[2] : '其他'),
  };
}

/* 密钥关联到同平台的具体账号：按域名和平台名做宽松匹配 */
function platformAccountsFor(state, t) {
  t = t || {};
  const platform = platformOfToken(t), p = presetForToken(t);
  const words = platform.toLowerCase().split(/[\/·（）()\-]+/).map(x => x.trim())
    .filter(x => x.length > 2 && x !== 'api' && x !== 'cloud');
  const domains = new Set([normKey(t.domain || (p ? p[1] : ''))].filter(Boolean));
  for (const ap of PRESETS) {
    const an = String(ap[0] || '').toLowerCase();
    if (words.some(w => an.includes(w) || w.includes(an))) domains.add(normKey(ap[1]));
  }
  return (state.accounts || []).filter(a => {
    const ad = normKey(a.domain), an = String(a.name || '').toLowerCase();
    return (ad && Array.from(domains).some(d => ad === d || ad.endsWith('.' + d) || d.endsWith('.' + ad))) ||
      words.some(w => an.includes(w) || w.includes(an));
  }).sort((a, b) => zh(a.name, b.name));
}

/* ---------- 规范化 / 修复 ---------- */
const DATA_ARRAYS = ['identities', 'accounts', 'tokens'];

function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = {
    identities: Array.isArray(s.identities) ? s.identities.filter(x => x && typeof x === 'object') : [],
    accounts: Array.isArray(s.accounts) ? s.accounts.filter(x => x && typeof x === 'object') : [],
    tokens: Array.isArray(s.tokens) ? s.tokens.filter(x => x && typeof x === 'object') : [],
    deleted: s.deleted && typeof s.deleted === 'object' ? s.deleted : {},
  };
  out.identities.forEach(i => {
    if (!i.id) i.id = uid();
    if (!KINDS.includes(i.type)) i.type = 'email';
    i.value = String(i.value || '');
    if (!i.color) i.color = i.type === 'login' ? LOGIN[provOf(i)].color : COLORS[0];
  });
  out.accounts.forEach(a => {
    if (!a.id) a.id = uid();
    a.name = String(a.name || '').trim() || '未命名平台';
    a.identityIds = identityIdsOf(a);
    if (!a.category) a.category = '其他';
    if (!a.createdAt) a.createdAt = Date.now();
  });
  out.tokens.forEach(t => {
    if (!t.id) t.id = uid();
    t.value = String(t.value || '');
    t.expiresAt = Number(t.expiresAt) || 0;
    if (!t.category) t.category = tokenVisual(t).category;
  });
  return out;
}

/* 删除账号后，密钥不能继续指向已经不存在的账号 */
function repairTokenLinks(state, touch) {
  const accountIds = new Set((state.accounts || []).map(a => a.id));
  let changed = false;
  const now = Date.now();
  for (const token of (state.tokens || [])) {
    if (token.accountId && !accountIds.has(token.accountId)) {
      token.accountId = '';
      if (touch) token.updatedAt = now;
      changed = true;
    }
  }
  return changed;
}

/* ---------- 示例数据（首次打开，与网页版一致） ---------- */
function demo() {
  const ids = [
    { id: uid(), type: 'email', value: 'me@gmail.com', label: '主力邮箱', color: COLORS[0], notes: '' },
    { id: uid(), type: 'phone', value: '+86 138 0000 1234', label: '主力手机号', color: COLORS[1], notes: '移动，已实名' },
    { id: uid(), type: 'email', value: 'shopping.fun@qq.com', label: '购物小号', color: COLORS[3], notes: '' },
    { id: uid(), type: 'email', value: 'dev@outlook.com', label: '开发专用', color: COLORS[4], notes: '' },
    { id: uid(), type: 'phone', value: '+86 170 0000 5678', label: '副卡', color: COLORS[2], notes: '', esim: true },
  ];
  ids.push({ id: uid(), type: 'login', provider: 'wechat', value: 'atlas_demo', label: '', color: LOGIN.wechat.color, notes: '', via: ids[1].id });
  ids.push({ id: uid(), type: 'login', provider: 'apple', value: 'me@icloud.com', label: '', color: LOGIN.apple.color, notes: '', via: ids[1].id });
  const [g, p1, q, o, p2, wx, ap] = ids.map(i => i.id);
  const now = Date.now();
  const mk = (name, domain, category, identityIds, ago, notes = '') =>
    ({ id: uid(), name, domain, category, identityIds, notes, createdAt: now - ago * DAY - Math.random() * 3e6 });
  return {
    demo: true,
    identities: ids,
    tokens: [],
    accounts: [
      mk('GitHub', 'github.com', '开发', [o, p1], 0, '已开两步验证'), mk('Claude', 'claude.ai', 'AI', [g], 0),
      mk('Cloudflare', 'cloudflare.com', '开发', [o], 1), mk('ChatGPT', 'chatgpt.com', 'AI', [g], 1),
      mk('小红书', 'xiaohongshu.com', '社交', [p2, wx], 3), mk('美团', 'meituan.com', '出行', [wx], 5),
      mk('拼多多', 'pinduoduo.com', '购物', [wx], 7), mk('Binance', 'binance.com', '加密', [o, p1], 3, '已完成 KYC'),
      mk('淘宝', 'taobao.com', '购物', [q, p1], 9), mk('京东', 'jd.com', '购物', [q, p2], 12),
      mk('微信', 'weixin.qq.com', '社交', [p1], 30), mk('支付宝', 'alipay.com', '支付金融', [p1], 30),
      mk('哔哩哔哩', 'bilibili.com', '娱乐', [p2], 40), mk('Steam', 'steampowered.com', '游戏', [q], 60, '令牌在主力手机上'),
      mk('Apple ID', 'apple.com', '工具', [g, p1], 90), mk('Notion', 'notion.so', '工具', [g], 120),
      mk('网易云音乐', 'music.163.com', '娱乐', [p2], 150), mk('Spotify', 'spotify.com', '娱乐', [ap], 20),
    ],
  };
}

module.exports = {
  DAY, KINDS, SKINS, COLORS, LOGIN, CATS, TOKEN_CATS, DATA_ARRAYS,
  uid, provOf, typeName, isESim, grad, skinName,
  cleanDomain, normPlatformName, sitePreset, brand, accountPlatform,
  identityIdsOf, idById, accById, accountsOf, viaOf, boundTo, zh,
  maskHandle, display, carrier,
  maskValue, expiryInfo, dateText, pad, normKey, presetForToken, platformOfToken, tokenVisual, platformAccountsFor,
  normalizeState, repairTokenLinks, demo,
};
