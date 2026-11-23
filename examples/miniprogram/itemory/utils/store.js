/* Itemory 小程序 · 数据层
   桌面版用 SQLite（需要 Scripting Pro）；小程序里没有 SQLite，改成一份 JSON
   存在 wx storage 里，封面图片走本地文件。表结构、字段名、枚举值保持与桌面版一致，
   导出格式也按同样的记录形状给出去，将来要接桌面版数据不用改字段。

   存储主键：itemory.v1（数据）、itemory.prefs.v1（偏好）。 */

const { DEFAULT_CATEGORIES, TAG_COLORS } = require('./model.js');
const { normalizeEntityName, assertItemRecord, assertMoneyRecord, assertExitRecord, assertSafeMinor } = require('./validate.js');

const KEY = 'itemory.v1';
const PREFS_KEY = 'itemory.prefs.v1';
const SCHEMA_VERSION = 1;

let state = null;
let prefs = null;
let loading = null;
const listeners = [];

function uid(prefix) {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  return `${prefix || 'id'}_${t}${r}`;
}

function now() { return Date.now(); }

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---------- 存储读写 ---------- */

function getStorage(key) {
  return new Promise(resolve => {
    wx.getStorage({
      key,
      success: res => resolve(res && res.data),
      fail: () => resolve(null),
    });
  });
}

function setStorage(key, data) {
  return new Promise((resolve, reject) => {
    wx.setStorage({
      key,
      data,
      success: () => resolve(),
      fail: err => reject(new Error((err && err.errMsg) || '写入本机存储失败')),
    });
  });
}

function removeStorage(key) {
  return new Promise(resolve => {
    wx.removeStorage({ key, success: () => resolve(), fail: () => resolve() });
  });
}

function notify() {
  for (const fn of listeners.slice()) {
    try { fn(state); } catch (e) { /* 单个订阅者出错不影响其他人 */ }
  }
}

function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emptyState() {
  const ts = now();
  return {
    version: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    categories: DEFAULT_CATEGORIES.map(c => ({
      id: c.id,
      name: c.name,
      normalizedName: c.name.toLowerCase(),
      icon: c.icon,
      sortOrder: c.sortOrder,
      isSystem: true,
      createdAt: ts,
      updatedAt: ts,
    })),
    tags: [],
    items: [],
    itemTags: [],
    moneyEntries: [],
    exits: [],
    assets: [],
  };
}

/* 读出来的数据可能缺表、缺字段；补齐后返回，坏记录不丢但会被容错处理 */
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = now();
  const out = {
    version: raw.version || SCHEMA_VERSION,
    createdAt: raw.createdAt || ts,
    updatedAt: raw.updatedAt || ts,
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    items: Array.isArray(raw.items) ? raw.items : [],
    itemTags: Array.isArray(raw.itemTags) ? raw.itemTags : [],
    moneyEntries: Array.isArray(raw.moneyEntries) ? raw.moneyEntries : [],
    exits: Array.isArray(raw.exits) ? raw.exits : [],
    assets: Array.isArray(raw.assets) ? raw.assets : [],
  };
  /* 首次出现在旧数据里的默认分类补齐 */
  for (const d of DEFAULT_CATEGORIES) {
    if (!out.categories.some(c => c.id === d.id)) {
      out.categories.push({
        id: d.id, name: d.name, normalizedName: d.name.toLowerCase(),
        icon: d.icon, sortOrder: d.sortOrder, isSystem: true, createdAt: ts, updatedAt: ts,
      });
    }
  }
  return out;
}

async function load() {
  if (loading) return loading;
  loading = getStorage(KEY).then(raw => {
    state = normalizeState(raw);
    if (state) notify();
    return state;
  });
  return loading;
}

async function ensure() {
  await load();
  if (!state) {
    state = emptyState();
    await persist();
  }
  return state;
}

async function persist() {
  if (!state) return;
  state.updatedAt = now();
  await setStorage(KEY, clone(state));
  notify();
}

function getState() { return state; }

async function replaceState(next) {
  state = normalizeState(next) || emptyState();
  await persist();
  return state;
}

async function reset() {
  state = emptyState();
  await persist();
  return state;
}

/* ---------- 偏好 ---------- */

const DEFAULT_PREFS = {
  theme: 'auto',            // auto | light | dark
  layout: 'shelf',          // shelf（置物架网格） | timeline（时间线列表）
  sortField: 'created',     // created | expense | days | daily
  sortDirection: 'desc',
  categoryFilter: 'all',
  statusFilter: 'all',
};

async function loadPrefs() {
  if (prefs) return prefs;
  const raw = await getStorage(PREFS_KEY);
  prefs = Object.assign({}, DEFAULT_PREFS, raw && typeof raw === 'object' ? raw : {});
  return prefs;
}

async function savePrefs(patch) {
  const current = await loadPrefs();
  prefs = Object.assign({}, current, patch);
  await setStorage(PREFS_KEY, prefs);
  return prefs;
}

/* ---------- 分类 ---------- */

function categoriesSorted() {
  return (state ? state.categories : []).slice().sort((a, b) => {
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
}

function findCategory(id) {
  if (!state || !id) return null;
  return state.categories.find(c => c.id === id) || null;
}

async function saveCategory(input) {
  await ensure();
  const { displayName, normalizedName } = normalizeEntityName(input.name);
  const dup = state.categories.find(c => c.normalizedName === normalizedName && c.id !== input.id);
  if (dup) throw new Error('已经有同名分类');
  const ts = now();
  if (input.id) {
    const existing = findCategory(input.id);
    if (!existing) throw new Error('分类不存在');
    existing.name = displayName;
    existing.normalizedName = normalizedName;
    if (input.icon !== undefined) existing.icon = input.icon;
    existing.updatedAt = ts;
  } else {
    state.categories.push({
      id: uid('cat'),
      name: displayName,
      normalizedName,
      icon: input.icon || 'shippingbox.fill',
      sortOrder: (state.categories.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0) || 0) + 1,
      isSystem: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  await persist();
  return state;
}

async function deleteCategory(id) {
  await ensure();
  const category = findCategory(id);
  if (!category) return state;
  if (category.isSystem) throw new Error('系统分类不能删除');
  state.categories = state.categories.filter(c => c.id !== id);
  /* 物品上的分类引用置空，与桌面版 ON DELETE SET NULL 一致 */
  state.items.forEach(item => {
    if (item.categoryId === id) { item.categoryId = null; item.updatedAt = now(); }
  });
  await persist();
  return state;
}

/* ---------- 标签 ---------- */

function tagsSorted() {
  return (state ? state.tags : []).slice().sort((a, b) => {
    if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
}

function findTag(id) {
  if (!state || !id) return null;
  return state.tags.find(t => t.id === id) || null;
}

async function saveTag(input) {
  await ensure();
  const { displayName, normalizedName } = normalizeEntityName(input.name);
  const dup = state.tags.find(t => t.normalizedName === normalizedName && t.id !== input.id);
  if (dup) throw new Error('已经有同名标签');
  const ts = now();
  if (input.id) {
    const existing = findTag(input.id);
    if (!existing) throw new Error('标签不存在');
    existing.name = displayName;
    existing.normalizedName = normalizedName;
    if (input.color) existing.color = input.color;
    existing.updatedAt = ts;
  } else {
    state.tags.push({
      id: uid('tag'),
      name: displayName,
      normalizedName,
      color: input.color || TAG_COLORS[state.tags.length % TAG_COLORS.length],
      sortOrder: (state.tags.reduce((m, t) => Math.max(m, t.sortOrder || 0), 0) || 0) + 1,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  await persist();
  return state;
}

async function deleteTag(id) {
  await ensure();
  state.tags = state.tags.filter(t => t.id !== id);
  state.itemTags = state.itemTags.filter(link => link.tagId !== id);
  await persist();
  return state;
}

function tagIdsOf(itemId) {
  if (!state) return [];
  return state.itemTags.filter(link => link.itemId === itemId).map(link => link.tagId);
}

function tagsOf(itemId) {
  const ids = tagIdsOf(itemId);
  return tagsSorted().filter(t => ids.indexOf(t.id) >= 0);
}

async function setItemTags(itemId, tagIds) {
  await ensure();
  const keep = new Set((tagIds || []).filter(id => findTag(id)));
  state.itemTags = state.itemTags.filter(link => link.itemId !== itemId);
  for (const tagId of keep) state.itemTags.push({ itemId, tagId });
  await persist();
  return state;
}

/* ---------- 物品 ---------- */

function findItem(id) {
  if (!state || !id) return null;
  return state.items.find(i => i.id === id) || null;
}

async function saveItem(input) {
  await ensure();
  const ts = now();
  const name = String(input.name || '').trim().normalize('NFC');
  if (!name) throw new Error('请填写物品名称');
  if (input.acquiredOn === undefined) throw new Error('请选择购入日期');

  let record;
  if (input.id) {
    const existing = findItem(input.id);
    if (!existing) throw new Error('物品不存在');
    record = existing;
    record.name = name;
    record.categoryId = input.categoryId || null;
    record.acquiredOn = input.acquiredOn;
    record.acquisitionAmountMinor = input.acquisitionAmountMinor === undefined ? record.acquisitionAmountMinor : input.acquisitionAmountMinor;
    record.holdingCondition = input.holdingCondition || record.holdingCondition;
    record.iconSymbol = input.iconSymbol === undefined ? record.iconSymbol : input.iconSymbol;
    record.coverAssetId = input.coverAssetId === undefined ? record.coverAssetId : input.coverAssetId;
    record.channel = input.channel === undefined ? record.channel : input.channel;
    record.warrantyUntil = input.warrantyUntil === undefined ? record.warrantyUntil : input.warrantyUntil;
    record.valuationMinor = input.valuationMinor === undefined ? record.valuationMinor : input.valuationMinor;
    record.notes = input.notes === undefined ? record.notes : input.notes;
    record.revision = (record.revision || 1) + 1;
    record.updatedAt = ts;
  } else {
    record = {
      id: uid('item'),
      name,
      categoryId: input.categoryId || null,
      acquiredOn: input.acquiredOn,
      acquisitionAmountMinor: input.acquisitionAmountMinor === undefined ? null : input.acquisitionAmountMinor,
      holdingCondition: input.holdingCondition || 'in_use',
      iconSymbol: input.iconSymbol || null,
      coverAssetId: input.coverAssetId || null,
      channel: input.channel || null,
      warrantyUntil: input.warrantyUntil || null,
      valuationMinor: input.valuationMinor === undefined ? null : input.valuationMinor,
      notes: input.notes || null,
      revision: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    state.items.push(record);
  }
  assertItemRecord(record);
  await persist();
  return record;
}

async function deleteItem(id) {
  await ensure();
  state.items = state.items.filter(i => i.id !== id);
  state.moneyEntries = state.moneyEntries.filter(e => e.itemId !== id);
  state.exits = state.exits.filter(e => e.itemId !== id);
  state.itemTags = state.itemTags.filter(link => link.itemId !== id);
  await persist();
  return state;
}

/* 物品是否已结束持有 */
function findExit(itemId) {
  if (!state || !itemId) return null;
  return state.exits.find(e => e.itemId === itemId) || null;
}

function aliveItems() {
  const exited = new Set((state ? state.exits : []).map(e => e.itemId));
  return (state ? state.items : []).filter(i => !exited.has(i.id));
}

async function setExit(itemId, input) {
  await ensure();
  const item = findItem(itemId);
  if (!item) throw new Error('物品不存在');
  const ts = now();
  const record = {
    itemId,
    reason: input.reason,
    exitedOn: input.exitedOn,
    recoveryAmountMinor: input.reason === 'sold'
      ? (input.recoveryAmountMinor === undefined ? null : input.recoveryAmountMinor)
      : null,
    note: input.note || null,
    createdAt: ts,
    updatedAt: ts,
  };
  assertExitRecord(record, item.acquiredOn);
  state.exits = state.exits.filter(e => e.itemId !== itemId);
  state.exits.push(record);
  item.updatedAt = ts;
  await persist();
  return record;
}

async function clearExit(itemId) {
  await ensure();
  state.exits = state.exits.filter(e => e.itemId !== itemId);
  const item = findItem(itemId);
  if (item) item.updatedAt = now();
  await persist();
  return state;
}

/* ---------- 资金流水 ---------- */

function moneyEntriesOf(itemId) {
  if (!state) return [];
  return state.moneyEntries
    .filter(e => e.itemId === itemId)
    .slice()
    .sort((a, b) => (a.occurredOn === b.occurredOn ? b.createdAt - a.createdAt : b.occurredOn.localeCompare(a.occurredOn)));
}

function findMoneyEntry(id) {
  if (!state || !id) return null;
  return state.moneyEntries.find(e => e.id === id) || null;
}

async function saveMoneyEntry(input) {
  await ensure();
  const item = findItem(input.itemId);
  if (!item) throw new Error('物品不存在');
  const amount = assertSafeMinor(input.amountMinor, '金额', { nullable: false, positive: true });
  const title = String(input.title || '').trim();
  if (!title) throw new Error('请填写事项标题');
  const ts = now();

  let record;
  if (input.id) {
    record = findMoneyEntry(input.id);
    if (!record) throw new Error('流水不存在');
    record.direction = input.direction;
    record.kind = input.kind;
    record.amountMinor = amount;
    record.occurredOn = input.occurredOn;
    record.title = title;
    record.note = input.note || null;
    record.updatedAt = ts;
  } else {
    record = {
      id: uid('money'),
      itemId: input.itemId,
      direction: input.direction,
      kind: input.kind,
      amountMinor: amount,
      occurredOn: input.occurredOn,
      title,
      note: input.note || null,
      createdAt: ts,
      updatedAt: ts,
    };
    state.moneyEntries.push(record);
  }
  assertMoneyRecord(record);
  item.updatedAt = ts;
  await persist();
  return record;
}

async function deleteMoneyEntry(id) {
  await ensure();
  state.moneyEntries = state.moneyEntries.filter(e => e.id !== id);
  await persist();
  return state;
}

/* ---------- 封面资源 ---------- */

function assetsList() {
  return state ? state.assets.slice() : [];
}

function findAsset(id) {
  if (!state || !id) return null;
  return state.assets.find(a => a.id === id) || null;
}

async function registerAsset(asset) {
  await ensure();
  state.assets = state.assets.filter(a => a.id !== asset.id);
  state.assets.push(asset);
  await persist();
  return asset;
}

async function dropAsset(id) {
  await ensure();
  state.assets = state.assets.filter(a => a.id !== id);
  state.items.forEach(item => {
    if (item.coverAssetId === id) { item.coverAssetId = null; item.updatedAt = now(); }
  });
  await persist();
  return state;
}

/* ---------- 导入导出 ---------- */

/**
 * 导出为纯 JSON。封面图片以 data URL 带出（桌面版是 SQLite 里的 blob，
 * 这里同样内嵌，保证单文件完整；超过上限的封面跳过并在 skippedCovers 里说明）。
 */
const EXPORT_COVER_LIMIT = 1200000;

async function exportJSON(opts) {
  await ensure();
  const options = opts || {};
  const covers = [];
  const skippedCovers = [];
  if (options.includeCovers !== false) {
    const readFileBase64 = require('./covers.js').readFileBase64;
    for (const asset of state.assets) {
      try {
        const base64 = await readFileBase64(asset.path);
        if (!base64) { skippedCovers.push({ id: asset.id, reason: '文件不可读' }); continue; }
        if (base64.length > EXPORT_COVER_LIMIT) { skippedCovers.push({ id: asset.id, reason: '封面过大' }); continue; }
        covers.push({ id: asset.id, mime: asset.mime || 'image/png', data: base64, byteSize: asset.byteSize || 0 });
      } catch (e) {
        skippedCovers.push({ id: asset.id, reason: '文件不可读' });
      }
    }
  }
  return {
    app: 'itemory',
    format: 'itemory-miniprogram-json',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      items: state.items.length,
      categories: state.categories.length,
      tags: state.tags.length,
      moneyEntries: state.moneyEntries.length,
      exits: state.exits.length,
      covers: covers.length,
    },
    skippedCovers,
    data: {
      categories: clone(state.categories),
      tags: clone(state.tags),
      items: clone(state.items),
      itemTags: clone(state.itemTags),
      moneyEntries: clone(state.moneyEntries),
      exits: clone(state.exits),
      assets: clone(state.assets),
    },
    covers,
  };
}

function validateImported(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('不是有效的备份文件');
  if (doc.app !== 'itemory') throw new Error('不是 Itemory 的备份');
  const data = doc.data;
  if (!data || typeof data !== 'object') throw new Error('备份里没有数据');
  for (const key of ['items', 'categories', 'tags', 'moneyEntries', 'exits']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`备份字段 ${key} 不是数组`);
  }
  const items = data.items || [];
  for (const item of items) {
    if (!item || typeof item !== 'object') throw new Error('物品记录格式错误');
    if (!item.id || !item.name) throw new Error('物品记录缺少 ID 或名称');
  }
  return {
    categories: data.categories || [],
    tags: data.tags || [],
    items,
    itemTags: data.itemTags || [],
    moneyEntries: data.moneyEntries || [],
    exits: data.exits || [],
    assets: data.assets || [],
    covers: Array.isArray(doc.covers) ? doc.covers : [],
  };
}

/**
 * 导入备份。
 * mode = "replace"：完全替换当前数据（先恢复封面文件，再落库，最后清理孤儿文件）
 * mode = "merge"：追加物品，分类/标签按名称复用，同 id 或同「名称+购入日期」的物品跳过
 */
async function importJSON(doc, mode) {
  await ensure();
  const incoming = validateImported(doc);
  const ts = now();
  const covers = require('./covers.js');

  /* 1. 先把封面写回本地文件，拿到新的 asset 记录 */
  const assetMap = new Map();
  for (const asset of incoming.assets) {
    let path = asset.path || null;
    const cover = incoming.covers.find(c => c.id === asset.id);
    if (cover && cover.data) {
      try {
        path = await covers.writeCoverFile(cover.data, asset.id);
      } catch (e) {
        path = null;
      }
    }
    if (!path) continue;
    assetMap.set(asset.id, {
      id: asset.id,
      path,
      mime: asset.mime || 'image/png',
      byteSize: asset.byteSize || 0,
      createdAt: asset.createdAt || ts,
    });
  }

  const remapItem = item => {
    const copy = clone(item);
    copy.createdAt = copy.createdAt || ts;
    copy.updatedAt = copy.updatedAt || ts;
    copy.revision = copy.revision || 1;
    copy.holdingCondition = copy.holdingCondition || 'in_use';
    if (copy.coverAssetId && !assetMap.has(copy.coverAssetId)) copy.coverAssetId = null;
    return copy;
  };

  if (mode === 'replace') {
    const next = emptyState();
    next.createdAt = ts;
    next.categories = incoming.categories.length
      ? incoming.categories.map(c => Object.assign({}, c, {
        normalizedName: c.normalizedName || String(c.name || '').toLowerCase(),
        createdAt: c.createdAt || ts,
        updatedAt: c.updatedAt || ts,
      }))
      : next.categories;
    /* 默认分类补齐（与 normalizeState 同规则） */
    for (const d of DEFAULT_CATEGORIES) {
      if (!next.categories.some(c => c.id === d.id)) {
        next.categories.push({
          id: d.id, name: d.name, normalizedName: d.name.toLowerCase(),
          icon: d.icon, sortOrder: d.sortOrder, isSystem: true, createdAt: ts, updatedAt: ts,
        });
      }
    }
    next.tags = incoming.tags.map(t => Object.assign({}, t, { createdAt: t.createdAt || ts, updatedAt: t.updatedAt || ts }));
    next.items = incoming.items.map(remapItem);
    next.itemTags = incoming.itemTags.filter(link => next.items.some(i => i.id === link.itemId) && next.tags.some(t => t.id === link.tagId));
    next.moneyEntries = incoming.moneyEntries.map(e => Object.assign({}, e, { createdAt: e.createdAt || ts, updatedAt: e.updatedAt || ts }))
      .filter(e => next.items.some(i => i.id === e.itemId));
    next.exits = incoming.exits.map(e => Object.assign({}, e, { createdAt: e.createdAt || ts, updatedAt: e.updatedAt || ts }))
      .filter(e => next.items.some(i => i.id === e.itemId));
    next.assets = Array.from(assetMap.values());
    state = next;
    await covers.pruneCovers(next.assets);
    await persist();
    return summarizeImport(next, 0, 0);
  }

  /* merge：分类、标签按 normalizedName 复用 */
  let addedCategories = 0;
  let addedTags = 0;
  const categoryByName = new Map(state.categories.map(c => [c.normalizedName, c]));
  for (const category of incoming.categories) {
    const normalized = category.normalizedName || String(category.name || '').toLowerCase();
    if (categoryByName.has(normalized)) continue;
    const copy = Object.assign({}, category, { normalizedName: normalized, isSystem: false, createdAt: ts, updatedAt: ts });
    state.categories.push(copy);
    categoryByName.set(normalized, copy);
    addedCategories++;
  }
  const tagByName = new Map(state.tags.map(t => [t.normalizedName, t]));
  for (const tag of incoming.tags) {
    const normalized = tag.normalizedName || String(tag.name || '').toLowerCase();
    if (tagByName.has(normalized)) continue;
    const copy = Object.assign({}, tag, { normalizedName: normalized, createdAt: ts, updatedAt: ts });
    state.tags.push(copy);
    tagByName.set(normalized, copy);
    addedTags++;
  }

  const existingIds = new Set(state.items.map(i => i.id));
  const existingKeys = new Set(state.items.map(i => `${String(i.name).trim().toLowerCase()}|${i.acquiredOn}`));
  const itemIdMap = new Map();
  let addedItems = 0;
  let skippedItems = 0;

  for (const raw of incoming.items) {
    const key = `${String(raw.name).trim().toLowerCase()}|${raw.acquiredOn}`;
    if (existingIds.has(raw.id) || existingKeys.has(key)) { skippedItems++; continue; }
    const copy = remapItem(raw);
    /* 分类/标签按名称映射到本机记录 */
    if (copy.categoryId) {
      const source = incoming.categories.find(c => c.id === copy.categoryId);
      const target = source ? categoryByName.get(source.normalizedName || String(source.name).toLowerCase()) : null;
      copy.categoryId = target ? target.id : null;
    }
    state.items.push(copy);
    existingIds.add(copy.id);
    existingKeys.add(key);
    itemIdMap.set(raw.id, copy.id);
    addedItems++;
  }

  for (const tag of incoming.tags) {
    const linkSource = tag.id;
    const target = tagByName.get(tag.normalizedName || String(tag.name).toLowerCase());
    if (!target) continue;
    for (const link of incoming.itemTags) {
      if (link.tagId !== linkSource) continue;
      const targetItem = itemIdMap.get(link.itemId);
      if (!targetItem) continue;
      if (state.itemTags.some(l => l.itemId === targetItem && l.tagId === target.id)) continue;
      state.itemTags.push({ itemId: targetItem, tagId: target.id });
    }
  }

  for (const entry of incoming.moneyEntries) {
    const targetItem = itemIdMap.get(entry.itemId);
    if (!targetItem) continue;
    state.moneyEntries.push(Object.assign({}, entry, {
      id: uid('money'), itemId: targetItem,
      createdAt: entry.createdAt || ts, updatedAt: ts,
    }));
  }
  for (const exit of incoming.exits) {
    const targetItem = itemIdMap.get(exit.itemId);
    if (!targetItem) continue;
    if (state.exits.some(e => e.itemId === targetItem)) continue;
    state.exits.push(Object.assign({}, exit, {
      itemId: targetItem, createdAt: exit.createdAt || ts, updatedAt: ts,
    }));
  }

  /* 合并进来的封面只保留被新物品引用的，其余清理 */
  const usedAssetIds = new Set();
  for (const item of state.items) {
    const sourceItem = incoming.items.find(i => itemIdMap.get(i.id) === item.id);
    if (sourceItem && sourceItem.coverAssetId && assetMap.has(sourceItem.coverAssetId)) {
      const asset = assetMap.get(sourceItem.coverAssetId);
      item.coverAssetId = asset.id;
      usedAssetIds.add(asset.id);
    }
  }
  for (const asset of Array.from(assetMap.values())) {
    if (usedAssetIds.has(asset.id)) state.assets.push(asset);
    else covers.removeFileIfExists(asset.path);
  }

  await persist();
  return summarizeImport(state, addedItems, skippedItems, addedCategories, addedTags);
}

function summarizeImport(next, addedItems, skippedItems, addedCategories, addedTags) {
  return {
    totalItems: next.items.length,
    totalCategories: next.categories.length,
    totalTags: next.tags.length,
    addedItems,
    skippedItems,
    addedCategories: addedCategories || 0,
    addedTags: addedTags || 0,
  };
}

/* 一份可直接抄进笔记的示例数据，第一次打开时用 */
function demoState() {
  const s = emptyState();
  const ts = now();
  const item = {
    id: 'item_demo_1',
    name: '降噪耳机',
    categoryId: 'digital',
    acquiredOn: (() => {
      const d = new Date(ts - 200 * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    acquisitionAmountMinor: 1999 * 100,
    holdingCondition: 'in_use',
    iconSymbol: '🎧',
    coverAssetId: null,
    channel: '官网',
    warrantyUntil: null,
    valuationMinor: null,
    notes: '每天通勤用',
    revision: 1,
    createdAt: ts,
    updatedAt: ts,
  };
  s.items.push(item);
  s.moneyEntries.push({
    id: 'money_demo_1',
    itemId: item.id,
    direction: 'expense',
    kind: 'accessory',
    amountMinor: 129 * 100,
    occurredOn: item.acquiredOn,
    title: '换耳罩',
    note: null,
    createdAt: ts,
    updatedAt: ts,
  });
  s.tags.push({
    id: 'tag_demo_1', name: '通勤', normalizedName: '通勤',
    color: TAG_COLORS[0], sortOrder: 1, createdAt: ts, updatedAt: ts,
  });
  s.itemTags.push({ itemId: item.id, tagId: 'tag_demo_1' });
  return s;
}

async function seedDemoIfEmpty() {
  const current = await ensure();
  if (!current || current.items.length === 0) {
    await replaceState(demoState());
  }
  return getState();
}

module.exports = {
  KEY,
  PREFS_KEY,
  DEFAULT_PREFS,
  SCHEMA_VERSION,
  uid,
  load,
  ensure,
  getState,
  replaceState,
  reset,
  persist,
  subscribe,
  emptyState,
  demoState,
  seedDemoIfEmpty,
  loadPrefs,
  savePrefs,
  categoriesSorted,
  findCategory,
  saveCategory,
  deleteCategory,
  tagsSorted,
  findTag,
  saveTag,
  deleteTag,
  tagIdsOf,
  tagsOf,
  setItemTags,
  findItem,
  saveItem,
  deleteItem,
  findExit,
  aliveItems,
  setExit,
  clearExit,
  moneyEntriesOf,
  findMoneyEntry,
  saveMoneyEntry,
  deleteMoneyEntry,
  assetsList,
  findAsset,
  registerAsset,
  dropAsset,
  exportJSON,
  importJSON,
  validateImported,
};
