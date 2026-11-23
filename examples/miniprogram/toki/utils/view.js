/* Toki 小程序 · 视图模型
   把 state 变成 WXML 能直接渲染的数组，页面里不再拼字符串。 */

const M = require('./model.js');

const KIND_LABEL = { email: '邮箱', phone: '手机号', login: '登录' };

/* 首字母块：平台图标一期用首字母 + 品牌色（网页版的 letter 兜底样式） */
function letterTile(name, color) {
  const letter = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
  return { letter, bg: color || '#8e8e93' };
}

function accountTile(a) {
  const t = letterTile(a.name, M.brand(a));
  return { id: a.id, name: a.name, letter: t.letter, bg: t.bg };
}

/* ---------- 首页 ---------- */
function buildHome(state, prefs) {
  const privacy = !!prefs.privacy;
  const kind = M.KINDS.includes(prefs.kind) ? prefs.kind : 'email';
  const counts = {};
  M.KINDS.forEach(k => { counts[k] = 0; });
  (state.identities || []).forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });

  const deck = (state.identities || []).filter(i => i.type === kind);
  const cards = deck.map(i => {
    const accs = M.accountsOf(state, i.id);
    const via = M.viaOf(state, i);
    const sim = i.type === 'phone';
    const lg = i.type === 'login';
    const car = sim ? M.carrier(i.value) : '';
    let title;
    if (lg) title = M.LOGIN[M.provOf(i)].name + (i.label ? ' · ' + i.label : '');
    else title = i.label || (sim ? '手机号' : '邮箱');
    let note;
    if (lg) note = via ? '绑定 ' + M.display(via, privacy) : (i.notes || M.LOGIN[M.provOf(i)].name);
    else if (sim) note = [car && !String(i.notes || '').includes(car.slice(2)) ? car : '', i.notes].filter(Boolean).join(' · ') || '手机号';
    else note = i.notes || '邮箱';
    return {
      id: i.id,
      type: i.type,
      title,
      value: M.display(i, privacy),
      note,
      color: i.color,
      cardStyle: `background-image:linear-gradient(145deg, ${M.grad(i.color)});`,
      count: accs.length,
      stack: accs.slice(0, 4).map(accountTile),
      more: accs.length > 4 ? accs.length - 4 : 0,
      esim: M.isESim(i),
      login: lg ? M.provOf(i) : '',
    };
  });

  const activeIdx = Math.min(prefs.active || 0, Math.max(0, cards.length - 1));
  const cur = deck[activeIdx];
  const gridList = cur ? M.accountsOf(state, cur.id) : (state.accounts || []).slice().sort((a, b) => M.zh(a.name, b.name));
  const grid = gridList.slice(0, 11).map(a => {
    const t = accountTile(a);
    return {
      id: a.id,
      name: a.handle ? (privacy ? M.maskHandle(a.handle) : a.handle) : a.name,
      letter: t.letter,
      bg: t.bg,
    };
  });

  const e = counts.email, p = counts.phone, l = counts.login, a = (state.accounts || []).length;
  const summary = (state.identities || []).length || a
    ? `${e} 个邮箱、${p} 个手机号${l ? `、${l} 个登录账号` : ''}，关联着 ${a} 个网站与 App`
    : '先添加一个邮箱或手机号';

  return {
    kind,
    kinds: M.KINDS.map(k => ({ key: k, label: KIND_LABEL[k], count: counts[k], on: k === kind })),
    cards,
    active: activeIdx,
    hasIdentities: (state.identities || []).length > 0,
    summary,
    gridTitle: cur ? (cur.label || M.display(cur, privacy)) : '全部网站与 App',
    gridSub: cur
      ? `${cur.type === 'login' ? '用它登录的' : '用它注册或绑定的'} ${M.accountsOf(state, cur.id).length} 个网站与 App`
      : '',
    grid,
    moreCount: gridList.length > 11 ? gridList.length - 11 : 0,
    empty: !cur && !(state.accounts || []).length,
  };
}

/* ---------- 网站与 App ---------- */
function buildSites(state, prefs, cat) {
  const privacy = !!prefs.privacy;
  const accounts = state.accounts || [];
  if (!accounts.length) return { empty: true, filters: [], groups: [] };
  const counts = {};
  accounts.forEach(a => { const c = a.category || '其他'; counts[c] = (counts[c] || 0) + 1; });
  const cats = [
    ...M.CATS.filter(c => counts[c]),
    ...Object.keys(counts).filter(c => !M.CATS.includes(c)).sort(M.zh),
  ];
  const active = cat && counts[cat] ? cat : '全部';
  const filters = ['全部', ...cats].map(c => ({ key: c, label: c, on: c === active }));
  const shown = active === '全部' ? cats : [active];
  const groups = shown.map(c => {
    const list = accounts.filter(a => (a.category || '其他') === c).sort((a, b) => M.zh(a.name, b.name));
    return {
      title: c,
      count: list.length,
      items: list.map(a => {
        const t = accountTile(a);
        const caps = M.identityIdsOf(a).map(id => M.idById(state, id)).filter(Boolean).slice(0, 3).map(i => ({
          key: i.id,
          label: i.label || (i.type === 'login' ? M.LOGIN[M.provOf(i)].short : M.display(i, privacy)),
          color: i.color,
        }));
        return {
          id: a.id,
          name: a.name,
          letter: t.letter,
          bg: t.bg,
          handle: a.handle ? (privacy ? M.maskHandle(a.handle) : a.handle) : '',
          caps,
          loose: caps.length === 0,
        };
      }),
    };
  });
  return { empty: false, filters, groups, total: accounts.length };
}

/* ---------- 密钥 ---------- */
function buildTokens(state, prefs, cat, revealedIds) {
  const tokens = (state.tokens || []).slice();
  const counts = {};
  tokens.forEach(t => { const c = t.category || '其他'; counts[c] = (counts[c] || 0) + 1; });
  const cats = [...M.TOKEN_CATS.filter(c => counts[c]), ...Object.keys(counts).filter(c => !M.TOKEN_CATS.includes(c)).sort(M.zh)];
  const active = cat && counts[cat] ? cat : '全部';
  const filters = ['全部', ...cats].map(c => ({ key: c, label: c, count: c === '全部' ? tokens.length : counts[c], on: c === active }));
  const shown = (active === '全部' ? tokens : tokens.filter(t => (t.category || '其他') === active)).sort((a, b) => M.zh(a.name, b.name));
  const soon = tokens.filter(t => t.expiresAt && t.expiresAt < Date.now() + 7 * M.DAY).length;

  const list = shown.map(t => {
    const v = M.tokenVisual(t);
    const ex = M.expiryInfo(t);
    const acc = t.accountId ? M.accById(state, t.accountId) : null;
    const revealed = !!(revealedIds && revealedIds.includes(t.id));
    const tile = letterTile(v.name, v.color);
    return {
      id: t.id,
      name: t.name || `${M.platformOfToken(t) || '平台'} 密钥`,
      platform: M.platformOfToken(t) || '自定义平台',
      category: t.category || '其他',
      value: revealed ? t.value : M.maskValue(t.value),
      revealed,
      letter: tile.letter,
      bg: tile.bg,
      color: v.color,
      expText: ex.text,
      expCls: ex.cls,
      accountName: acc ? (acc.name + (acc.handle ? ' · ' + acc.handle : '')) : '',
      notes: t.notes ? String(t.notes).slice(0, 24) : '',
    };
  });

  return {
    empty: tokens.length === 0,
    noneInCat: list.length === 0,
    filters,
    list,
    summary: tokens.length ? `${tokens.length} 条密钥 · ${soon ? `${soon} 条即将到期` : '暂无临期'}` : 'API Key、Access Token、Gist Token 都存在这里',
  };
}

/* ---------- 关系图 ----------
   三列：身份 → 平台 → 密钥。同平台只出现一个节点。
   连线点位在页面里按列宽算出，这里只给出节点与边的组合关系。 */
function buildGraph(state, prefs) {
  const privacy = !!prefs.privacy;
  const identities = (state.identities || [])
    .filter(i => M.KINDS.includes(i.type))
    .sort((a, b) => M.KINDS.indexOf(a.type) - M.KINDS.indexOf(b.type));
  const accounts = state.accounts || [];
  if (!identities.length && !accounts.length) return { empty: true, ids: [], plats: [], toks: [], links: [] };

  const rank = new Map(identities.map((i, k) => [i.id, k]));
  const accountById = new Map();
  accounts.forEach(a => { if (a.id && !accountById.has(a.id)) accountById.set(a.id, a); });

  const accountToGroup = new Map();
  const groups = new Map();
  accounts.forEach(a => {
    const meta = M.accountPlatform(a);
    let g = groups.get(meta.key);
    if (!g) {
      g = { key: meta.key, name: meta.name, domain: meta.domain, accounts: [], identityIds: [], tokens: [] };
      groups.set(meta.key, g);
    }
    g.accounts.push(a);
    accountToGroup.set(a, g);
  });
  groups.forEach(g => {
    const seen = new Set();
    g.accounts.forEach(a => {
      M.identityIdsOf(a).forEach(id => {
        if (rank.has(id) && !seen.has(id)) { seen.add(id); g.identityIds.push(id); }
      });
    });
    g.identityIds.sort((a, b) => rank.get(a) - rank.get(b));
  });

  (state.tokens || []).forEach(t => {
    if (!t || !t.accountId) return;
    const a = accountById.get(t.accountId);
    const g = a && accountToGroup.get(a);
    if (g && !g.tokens.some(x => x.id === t.id)) g.tokens.push(t);
  });

  const sortedGroups = Array.from(groups.values()).sort((a, b) => M.zh(a.name, b.name));
  const groupIndex = new Map(sortedGroups.map((g, k) => [g.key, k]));

  const ids = identities.map((i, k) => ({
    key: i.id,
    index: k,
    title: i.label || M.display(i, privacy),
    sub: i.type === 'login' ? M.LOGIN[M.provOf(i)].short : (i.label ? M.display(i, privacy) : ''),
    kindLabel: i.type === 'phone' ? '手机号' : i.type === 'login' ? '登录' : '邮箱',
    newKind: k === 0 || identities[k - 1].type !== i.type,
    count: sortedGroups.filter(g => g.identityIds.includes(i.id)).length,
    color: i.color,
    style: `background-image:linear-gradient(145deg, ${M.grad(i.color)});`,
  }));

  const plats = sortedGroups.map((g, k) => {
    const rep = g.accounts[0];
    const tile = letterTile(g.name, M.brand(Object.assign({}, rep, { name: g.name, domain: g.domain })));
    return {
      key: g.key,
      index: k,
      name: g.name,
      letter: tile.letter,
      bg: tile.bg,
      count: g.accounts.length,
      loose: g.identityIds.length === 0,
    };
  });

  const toks = [];
  sortedGroups.forEach((g, gi) => {
    g.tokens.forEach(t => {
      const v = M.tokenVisual(t);
      const tile = letterTile(v.name, v.color);
      toks.push({
        id: t.id,
        groupIndex: gi,
        name: t.name || '未命名密钥',
        letter: tile.letter,
        bg: tile.bg,
        color: v.color,
        state: t.expiresAt && t.expiresAt < Date.now() ? 'expired' : 'ok',
      });
    });
  });

  const links = [];
  sortedGroups.forEach(g => {
    g.identityIds.forEach(id => {
      if (rank.has(id)) links.push({ from: id, to: groupIndex.get(g.key), color: (M.idById(state, id) || {}).color || '#8e8e93' });
    });
  });

  return { empty: false, ids, plats, toks, links };
}

module.exports = { buildHome, buildSites, buildTokens, buildGraph, letterTile };
