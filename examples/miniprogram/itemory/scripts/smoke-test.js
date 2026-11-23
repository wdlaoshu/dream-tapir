/* Itemory 小程序 · 冒烟测试
   用法：node scripts/smoke-test.js
   把小程序运行时用最小桩模拟出来（storage / 文件 / 剪贴板 / 弹窗 / 导航），
   跑数据层、成本口径、统计、导出导入和六个页面的逻辑，不联网、不依赖 Dimina。
   另外做两项静态检查：WXML 标签是否闭合、绑定的事件处理函数是否真的存在。 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

/* ---------- 运行时桩 ---------- */

const storage = new Map();
const files = new Map();
let clipboard = '';
let lastToast = '';
let lastModal = null;
let modalAnswer = true;
let navLog = [];
const toasts = [];

function safeJson(text) {
  try { return JSON.parse(text); } catch (e) { return text; }
}

global.wx = {
  env: { USER_DATA_PATH: 'difile://usr' },
  setStorage({ key, data, success }) { storage.set(key, JSON.stringify(data)); success && success(); },
  getStorage({ key, success, fail }) {
    if (storage.has(key)) success && success({ data: JSON.parse(storage.get(key)) });
    else fail && fail({ errMsg: 'not found' });
  },
  removeStorage({ key, success }) { storage.delete(key); success && success(); },
  setClipboardData({ data, success }) { clipboard = data; success && success(); },
  getClipboardData({ success }) { success && success({ data: clipboard }); },
  showToast({ title }) { lastToast = title; toasts.push(title); },
  showModal(options) {
    lastModal = options;
    if (options && options.success) options.success({ confirm: modalAnswer, cancel: !modalAnswer, content: modalContent });
  },
  showActionSheet(options) { if (options && options.success) options.success({ tapIndex: 0 }); },
  showLoading() {},
  hideLoading() {},
  navigateTo({ url }) { navLog.push(url); },
  navigateBack() { navLog.push('back'); },
  reLaunch({ url }) { navLog.push(url); },
  chooseImage({ success }) {
    files.set('difile://tmp/pick.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    success && success({ tempFilePaths: ['difile://tmp/pick.png'] });
  },
  previewImage({ success }) { success && success(); },
  getImageInfo({ success }) { success && success({ width: 800, height: 600 }); },
  createCanvasContext() {
    const ctx = {
      drawImage() {},
      draw(next, cb) { cb && cb(); },
    };
    return ctx;
  },
  canvasToTempFilePath({ success }) { success && success({ tempFilePath: 'difile://tmp/cropped.png' }); },
  createSelectorQuery() {
    return {
      select() {
        return {
          boundingClientRect(cb) { if (cb) cb({ width: 300, height: 300 }); return this; },
        };
      },
      exec() {},
    };
  },
  request(options) {
    const url = String(options.url || '');
    aiCalls.push({ url, method: options.method || 'GET', header: options.header || {}, data: options.data });
    setTimeout(() => {
      if (/\/models$/.test(url)) {
        return options.success({ statusCode: 200, data: { data: [{ id: 'gpt-4.1-mini' }, { id: 'o4-mini' }] } });
      }
      if (/\/chat\/completions$|\/responses$/.test(url)) {
        const body = typeof options.data === 'string' ? JSON.parse(options.data) : (options.data || {});
        if (aiRejectJson && (body.response_format || (body.text && body.text.format))) {
          return options.success({
            statusCode: 400,
            data: { error: { code: 'unsupported_parameter', message: 'response_format is not supported' } },
          });
        }
        const payload = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(AI_ANSWER) } }] };
        return options.success({ statusCode: 200, data: payload });
      }
      return options.success({ statusCode: 404, data: {} });
    }, 0);
  },
  getFileSystemManager() {
    return {
      stat({ path, success, fail }) {
        if (files.has(path) || path === 'difile://usr/covers' || path === 'difile://tmp/pick.png') {
          success && success({ stats: { size: files.has(path) ? files.get(path).length : 0, isFile: () => files.has(path), isDirectory: () => !files.has(path) } });
        } else fail && fail({ errMsg: 'no such file' });
      },
      mkdir({ dirPath, success }) { success && success({}); },
      readFile({ filePath, success, fail }) {
        if (files.has(filePath)) success && success({ data: files.get(filePath) });
        else fail && fail({ errMsg: 'no such file' });
      },
      writeFile({ filePath, data, success }) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
        files.set(filePath, bytes);
        success && success({});
      },
      saveFile({ tempFilePath, filePath, success }) {
        files.set(filePath, new Uint8Array([137, 80, 78, 71]));
        success && success({ savedFilePath: filePath });
      },
      unlink({ filePath, success }) { files.delete(filePath); success && success({}); },
      readdir({ dirPath, success }) {
        const prefix = `${dirPath}/`;
        const names = Array.from(files.keys()).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
        success && success({ files: names });
      },
    };
  },
};

let appPrefs = {};
const appObject = {
  globalData: { prefs: appPrefs, aiItemDraft: null, coverCropResult: null },
  ready: () => Promise.resolve({ prefs: appPrefs }),
  setPrefs: patch => { appPrefs = Object.assign({}, appPrefs, patch); appObject.globalData.prefs = appPrefs; return Promise.resolve(appPrefs); },
};
global.getApp = () => appObject;

/* 假的 OpenAI 兼容服务：用来验证请求形状与降级重试 */
let aiRejectJson = false;
const aiCalls = [];
const AI_ANSWER = {
  name: 'Sony WH-1000XM5',
  categoryHint: '数码电子',
  price: 1899.5,
  acquiredOn: '2025-11-02',
  channel: '京东',
  warrantyUntil: '2027-11-02',
  imageType: 'order_receipt',
  notes: '黑色；订单编号 123456；收件人 张三；商品全新',
  targetStatus: 'single',
  priceScope: 'item',
  currency: 'CNY',
  itemCount: 1,
};

let modalContent = '';

/* ---------- 断言工具 ---------- */

let passed = 0;
const failures = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; })
    .catch(err => {
      failures.push(`${name}: ${err.message}`);
      console.log(`✗ ${name}\n    ${err.message}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}（实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}）`);
}

function near(actual, expected, message) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message}（实际 ${actual}，期望 ${expected}）`);
}

/* ---------- 加载被测模块 ---------- */

function fresh(name) {
  const full = path.join(ROOT, name);
  delete require.cache[require.resolve(full)];
  return require(full);
}

const F = require('./../utils/format.js');
const M = require('./../utils/model.js');
const Vd = require('./../utils/validate.js');
const Cost = require('./../utils/cost.js');
const TL = require('./../utils/timeline.js');
const store = require('./../utils/store.js');
const V = require('./../utils/view.js');
const Stats = require('./../utils/statistics.js');
const covers = require('./../utils/covers.js');
const ai = require('./../utils/ai.js');
const secret = require('./../utils/secret.js');

/* ---------- 页面实例化 ---------- */

function loadPage(relPath) {
  let def = null;
  global.Page = options => { def = options; };
  const full = path.join(ROOT, relPath);
  delete require.cache[require.resolve(full)];
  require(full);
  if (!def) throw new Error(`页面没有调用 Page(): ${relPath}`);
  const page = Object.assign({}, def);
  page.data = JSON.parse(JSON.stringify(def.data || {}));
  page.setData = patch => { page.data = Object.assign({}, page.data, patch); };
  return page;
}

/* ---------- 用例 ---------- */

async function main() {
  /* 1. 日期与金额 */
  await check('日期校验与日历天数', () => {
    assert(F.isValidYmd('2024-02-29'), '闰年 2 月 29 日应合法');
    assert(!F.isValidYmd('2023-02-29'), '平年 2 月 29 日应非法');
    eq(F.calendarHoldingDays('2024-01-01', '2024-01-01'), 1, '同一天应算 1 天');
    eq(F.calendarHoldingDays('2024-01-01', '2024-01-31'), 31, '一月整月应为 31 天');
    eq(F.addYearsYmd('2024-02-29', 1), '2025-02-28', '闰日加一年应压到 2 月 28 日');
  });

  await check('金额元→分与格式化', () => {
    eq(F.parseYuanToMinor(''), null, '空金额应为 null');
    eq(F.parseYuanToMinor('0'), 0, '0 元应为 0 分');
    eq(F.parseYuanToMinor('¥1,234.5'), 123450, '千分位与一位小数');
    eq(F.parseYuanToMinor('12.34'), 1234, '两位小数');
    eq(F.formatMinorMoney(1234), '¥12.34', '完整格式');
    eq(F.formatMinorMoney(1200, true), '¥12', '紧凑格式去掉 .00');
    eq(F.formatMinorMoney(-1234), '¥-12.34', '负数与桌面版一致，符号跟在货币号后面');
    let threw = false;
    try { F.parseYuanToMinor('12.345'); } catch (e) { threw = true; }
    assert(threw, '超过两位小数应报错');
  });

  /* 2. 成本口径 */
  await check('成本口径：购入 + 支出 - 收入', () => {
    const item = {
      id: 'i1', name: '相机', categoryId: 'digital', acquiredOn: '2024-01-01',
      acquisitionAmountMinor: 100000, holdingCondition: 'in_use', iconSymbol: null,
      coverAssetId: null, channel: null, warrantyUntil: null, valuationMinor: null,
      notes: null, revision: 1, createdAt: 1, updatedAt: 1,
    };
    const summary = Cost.calculateCostSummary(item, [
      { id: 'm1', itemId: 'i1', direction: 'expense', kind: 'accessory', amountMinor: 5000, occurredOn: '2024-02-01', title: '买配件', note: null, createdAt: 2, updatedAt: 2 },
      { id: 'm2', itemId: 'i1', direction: 'income', kind: 'other', amountMinor: 3000, occurredOn: '2024-03-01', title: '卖旧件', note: null, createdAt: 3, updatedAt: 3 },
    ], null);
    eq(summary.totalExpenseMinor, 105000, '累计投入');
    eq(summary.totalIncomeMinor, 3000, '累计回收');
    eq(summary.netCostMinor, 102000, '净支出');
    eq(summary.holdingDays, F.calendarHoldingDays('2024-01-01', null), '陪伴天数');
    eq(summary.dailyCostMinor, Math.round(102000 / summary.holdingDays), '日均成本');
    assert(summary.isAcquisitionPriceKnown, '购入价已知');
  });

  await check('成本口径：出售回收计入收入', () => {
    const item = {
      id: 'i2', name: '耳机', categoryId: null, acquiredOn: '2024-01-01',
      acquisitionAmountMinor: 50000, holdingCondition: 'in_use', iconSymbol: null,
      coverAssetId: null, channel: null, warrantyUntil: null, valuationMinor: null,
      notes: null, revision: 1, createdAt: 1, updatedAt: 1,
    };
    const exit = { itemId: 'i2', reason: 'sold', exitedOn: '2024-06-01', recoveryAmountMinor: 20000, note: null, createdAt: 4, updatedAt: 4 };
    const summary = Cost.calculateCostSummary(item, [], exit);
    eq(summary.totalIncomeMinor, 20000, '转手金额计入回收');
    eq(summary.netCostMinor, 30000, '净支出 = 购入 - 回收');
    eq(summary.holdingDays, F.calendarHoldingDays('2024-01-01', '2024-06-01'), '按结束日期算陪伴天数');
  });

  await check('坏数据不冒充 0 天', () => {
    const item = {
      id: 'bad', name: '坏记录', categoryId: null, acquiredOn: '2020-13-01',
      acquisitionAmountMinor: 100, holdingCondition: 'in_use', iconSymbol: null,
      coverAssetId: null, channel: null, warrantyUntil: null, valuationMinor: null,
      notes: null, revision: 1, createdAt: 1, updatedAt: 1,
    };
    const summary = Cost.safeCostSummary(item, [], null);
    eq(summary.available, false, '应标记为不可用');
    eq(summary.holdingDays, null, '天数必须是 null');
    eq(summary.totalExpenseMinor, 0, '金额降级为 0 但不参与聚合');
    assert(summary.unavailableReason, '应带不可用原因');
  });

  /* 3. 时间线 */
  await check('时间线按日期降序，购入节点不可删', () => {
    const item = { id: 't1', name: '桌子', acquiredOn: '2024-01-01', acquisitionAmountMinor: 20000, createdAt: 1 };
    const nodes = TL.buildTimeline(item, [
      { id: 'm1', itemId: 't1', direction: 'expense', kind: 'repair', amountMinor: 500, occurredOn: '2024-05-01', title: '修腿', note: null, createdAt: 5 },
    ], { itemId: 't1', reason: 'sold', exitedOn: '2024-06-01', recoveryAmountMinor: 8000, note: null, createdAt: 6 });
    eq(nodes.length, 3, '三个节点');
    eq(nodes[0].type, 'exit', '最新的是结束持有');
    eq(nodes[nodes.length - 1].type, 'purchase', '最早的是购入');
    const purchase = nodes.find(n => n.type === 'purchase');
    eq(purchase.canDelete, false, '购入节点不能单独删');
  });

  /* 4. 存储层 */
  await check('首次启动写入默认分类', async () => {
    await store.load();
    const state = await store.ensure();
    eq(state.categories.length, M.DEFAULT_CATEGORIES.length, '默认分类数量');
    assert(state.categories.every(c => c.isSystem), '默认分类标记为系统分类');
  });

  await check('物品新增/编辑/删除与标签关联', async () => {
    const tag = await store.saveTag({ name: '通勤', color: '#007AFF' });
    const tagId = tag.tags[tag.tags.length - 1].id;
    const item = await store.saveItem({
      name: '通勤耳机', categoryId: 'digital', acquiredOn: '2024-03-01',
      acquisitionAmountMinor: 89900, holdingCondition: 'in_use', iconSymbol: '🎧',
    });
    await store.setItemTags(item.id, [tagId]);
    eq(store.tagIdsOf(item.id).length, 1, '标签关联写入');

    await store.saveItem({ id: item.id, name: '通勤耳机 2', acquiredOn: '2024-03-01' });
    eq(store.findItem(item.id).name, '通勤耳机 2', '编辑生效');
    eq(store.findItem(item.id).revision, 2, '修订号递增');

    await store.deleteItem(item.id);
    eq(store.findItem(item.id), null, '删除生效');
    eq(store.tagIdsOf(item.id).length, 0, '关联一起清除');
  });

  await check('重复分类名称被拦住', async () => {
    let threw = false;
    try { await store.saveCategory({ name: '数码电子' }); } catch (e) { threw = true; }
    assert(threw, '同名分类应报错');
  });

  await check('删除分类把物品置为未分类', async () => {
    const created = await store.saveCategory({ name: '临时分类', icon: '🧊' });
    const cat = created.categories.find(c => c.name === '临时分类');
    const item = await store.saveItem({ name: '临时物品', categoryId: cat.id, acquiredOn: '2024-04-01', acquisitionAmountMinor: 100 });
    await store.deleteCategory(cat.id);
    eq(store.findItem(item.id).categoryId, null, '物品变成未分类');
    await store.deleteItem(item.id);
  });

  await check('流水金额必须大于 0', async () => {
    const item = await store.saveItem({ name: '流水测试', acquiredOn: '2024-05-01', acquisitionAmountMinor: 1000 });
    let threw = false;
    try {
      await store.saveMoneyEntry({ itemId: item.id, direction: 'expense', kind: 'repair', amountMinor: 0, occurredOn: '2024-05-02', title: '零元' });
    } catch (e) { threw = true; }
    assert(threw, '0 元流水应被拒绝');
    await store.deleteItem(item.id);
  });

  await check('结束持有：非出售不能填回收金额', async () => {
    const item = await store.saveItem({ name: '赠送测试', acquiredOn: '2024-05-01', acquisitionAmountMinor: 1000 });
    const exit = await store.setExit(item.id, { reason: 'gifted', exitedOn: '2024-06-01', recoveryAmountMinor: 500 });
    eq(exit.recoveryAmountMinor, null, '赠送应清空回收金额');
    await store.clearExit(item.id);
    eq(store.findExit(item.id), null, '撤销生效');
    await store.deleteItem(item.id);
  });

  await check('结束日期早于购入日期被拒绝', async () => {
    const item = await store.saveItem({ name: '日期测试', acquiredOn: '2024-05-10', acquisitionAmountMinor: 100 });
    let threw = false;
    try { await store.setExit(item.id, { reason: 'sold', exitedOn: '2024-05-01', recoveryAmountMinor: null }); } catch (e) { threw = true; }
    assert(threw, '结束日期早于购入应报错');
    await store.deleteItem(item.id);
  });

  /* 5. 视图层 */
  await check('列表筛选、搜索与排序', async () => {
    await store.reset();
    const a = await store.saveItem({ name: 'MacBook', categoryId: 'digital', acquiredOn: '2023-01-01', acquisitionAmountMinor: 1500000 });
    const b = await store.saveItem({ name: '雨伞', categoryId: 'home', acquiredOn: '2024-01-01', acquisitionAmountMinor: 3000 });
    await store.saveMoneyEntry({ itemId: b.id, direction: 'expense', kind: 'other', amountMinor: 100, occurredOn: '2024-02-01', title: '补胶' });

    const state = store.getState();
    eq(V.buildCards(state, { keyword: 'mac' }).length, 1, '关键词忽略大小写');
    eq(V.buildCards(state, { keyword: '补胶' }).length, 0, '流水标题不参与物品搜索');
    eq(V.buildCards(state, { categoryId: 'home' }).length, 1, '分类筛选');
    eq(V.buildCards(state, { statusFilter: 'sold' }).length, 0, '状态筛选');

    const byExpense = V.buildCards(state, { sortField: 'expense', sortDirection: 'desc' });
    eq(byExpense[0].id, a.id, '按累计投入倒序');
    const asc = V.buildCards(state, { sortField: 'expense', sortDirection: 'asc' });
    eq(asc[0].id, b.id, '正序');
    await store.deleteItem(a.id);
    await store.deleteItem(b.id);
  });

  await check('详情页时间线与成本文案', async () => {
    await store.reset();
    const item = await store.saveItem({ name: '机械键盘', categoryId: 'digital', acquiredOn: '2024-01-01', acquisitionAmountMinor: 60000, iconSymbol: '⌨️' });
    await store.saveMoneyEntry({ itemId: item.id, direction: 'expense', kind: 'upgrade', amountMinor: 2000, occurredOn: '2024-03-01', title: '换轴' });
    const detail = V.buildDetail(store.getState(), item.id);
    eq(detail.emoji, '⌨️', '物品自己的图标优先');
    eq(detail.timeline.length, 2, '购入 + 一笔支出');
    assert(detail.dailyCostText.indexOf('¥') === 0, '日均带货币符号');
    assert(detail.timeline[0].amountText.indexOf('-') === 0, '支出显示负号');
    await store.deleteItem(item.id);
  });

  /* 6. 统计 */
  await check('统计报告：期间投入与分类', async () => {
    await store.reset();
    const item = await store.saveItem({ name: '统计相机', categoryId: 'digital', acquiredOn: '2024-01-01', acquisitionAmountMinor: 500000 });
    await store.saveMoneyEntry({ itemId: item.id, direction: 'expense', kind: 'repair', amountMinor: 30000, occurredOn: '2024-02-01', title: '修快门' });
    const report = Stats.buildStatistics(store.getState(), '2024');
    eq(report.snapshot.totalExpenseMinor, 530000, '期间投入');
    eq(report.snapshot.addedCount, 1, '期间新增件数');
    assert(report.categories.some(c => c.name === '数码电子' && c.knownExpenseMinor === 530000), '分类投入归到数码电子');
    eq(report.expenseKinds[0].key, 'repair', '支出构成');
    eq(report.alerts.unknownAcquisitionCount, 0, '购入价已知');
    await store.deleteItem(item.id);
  });

  await check('统计报告：空数据不炸', () => {
    const report = Stats.buildStatistics({ items: [], categories: [], tags: [], moneyEntries: [], exits: [], itemTags: [], assets: [] }, 'all');
    eq(report.snapshot.totalItemCount, 0, '空数据件数');
    eq(report.snapshot.totalExpenseMinor, 0, '空数据投入为 0');
    assert(Array.isArray(report.cashFlow.buckets), '现金流桶是数组');
  });

  /* 7. 导出导入 */
  await check('导出 JSON 形状', async () => {
    await store.reset();
    const item = await store.saveItem({ name: '导出测试', categoryId: 'digital', acquiredOn: '2024-01-01', acquisitionAmountMinor: 1000 });
    await store.setExit(item.id, { reason: 'sold', exitedOn: '2024-02-01', recoveryAmountMinor: 400 });
    const doc = await store.exportJSON({ includeCovers: false });
    eq(doc.app, 'itemory', 'app 标识');
    eq(doc.counts.items, 1, '物品数');
    eq(doc.counts.exits, 1, '退出数');
    eq(doc.data.items[0].name, '导出测试', '物品名称');
    assert(Array.isArray(doc.covers), '封面数组');
  });

  await check('替换导入还原全部数据', async () => {
    await store.reset();
    const item = await store.saveItem({ name: '备份源', categoryId: 'home', acquiredOn: '2023-06-01', acquisitionAmountMinor: 8000 });
    await store.saveMoneyEntry({ itemId: item.id, direction: 'expense', kind: 'maintenance', amountMinor: 500, occurredOn: '2023-07-01', title: '保养' });
    const tag = await store.saveTag({ name: '旧物' });
    const tagId = tag.tags[tag.tags.length - 1].id;
    await store.setItemTags(item.id, [tagId]);
    const doc = JSON.parse(JSON.stringify(await store.exportJSON({ includeCovers: false })));

    await store.reset();
    const summary = await store.importJSON(doc, 'replace');
    eq(summary.totalItems, 1, '替换后物品数');
    const restored = store.getState().items[0];
    eq(restored.name, '备份源', '名称还原');
    eq(store.getState().moneyEntries.length, 1, '流水还原');
    eq(store.tagIdsOf(restored.id).length, 1, '标签关联还原');
  });

  await check('合并导入跳过重复物品', async () => {
    await store.reset();
    await store.saveItem({ name: '重复品', acquiredOn: '2024-01-01', acquisitionAmountMinor: 100 });
    const doc = {
      app: 'itemory', format: 'itemory-miniprogram-json', version: 1,
      data: {
        categories: [], tags: [], itemTags: [], moneyEntries: [], exits: [], assets: [],
        items: [
          { id: 'x1', name: '重复品', acquiredOn: '2024-01-01', acquisitionAmountMinor: 100, holdingCondition: 'in_use', revision: 1 },
          { id: 'x2', name: '新东西', acquiredOn: '2024-02-01', acquisitionAmountMinor: 200, holdingCondition: 'in_use', revision: 1 },
        ],
      },
      covers: [],
    };
    const summary = await store.importJSON(doc, 'merge');
    eq(summary.addedItems, 1, '只加一件');
    eq(summary.skippedItems, 1, '跳过重复');
    eq(summary.totalItems, 2, '总数');
  });

  await check('坏备份被拦住', async () => {
    let threw = false;
    try { await store.importJSON({ app: 'other' }, 'merge'); } catch (e) { threw = true; }
    assert(threw, '非 Itemory 备份应报错');
    threw = false;
    try { store.validateImported({ app: 'itemory', data: { items: [{ name: '无 ID' }] } }); } catch (e) { threw = true; }
    assert(threw, '缺 ID 的记录应报错');
  });

  /* 8. 封面 base64 */
  await check('base64 编解码自洽', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 10, 20, 30, 40]);
    const encoded = covers.bytesToBase64(bytes);
    const back = covers.base64ToBytes(encoded);
    eq(back.length, bytes.length, '长度一致');
    for (let i = 0; i < bytes.length; i++) eq(back[i], bytes[i], `第 ${i} 字节`);
  });

  /* 9. 页面 */
  await check('物品列表页：渲染与筛选', async () => {
    await store.reset();
    await store.saveItem({ name: '页面测试', categoryId: 'digital', acquiredOn: '2024-01-01', acquisitionAmountMinor: 2000, iconSymbol: '📱' });
    const page = loadPage('pages/inventory/inventory.js');
    await page.onLoad();
    await page.onShow();
    eq(page.data.cards.length, 1, '卡片渲染');
    eq(page.data.active, 'items', 'tab 高亮');
    eq(page.data.cards[0].name, '页面测试', '卡片名称');
    page.onSearch({ detail: { value: '不存在' } });
    eq(page.data.cards.length, 0, '搜索过滤生效');
    page.clearSearch();
    eq(page.data.cards.length, 1, '清空搜索恢复');
    page.openFilter();
    eq(page.data.filterOpen, true, '筛选面板打开');
    await page.pickCategory({ currentTarget: { dataset: { id: 'home' } } });
    eq(page.data.cards.length, 0, '切分类后无结果');
    page.resetFilter();
    eq(page.data.cards.length, 1, '恢复默认后回来');
  });

  await check('物品列表页：布局切换与导航', async () => {
    const page = loadPage('pages/inventory/inventory.js');
    await page.onShow();
    navLog = [];
    page.openItem({ currentTarget: { dataset: { id: 'abc' } } });
    eq(navLog[0], '/pages/item/item?id=abc', '跳详情');
    page.addItem();
    eq(navLog[1], '/pages/item-edit/item-edit', '跳新增');
    navLog = [];
    await page.toggleLayout();
    eq(page.data.layout, 'timeline', '布局切到时间线');
    eq(appPrefs.layout, 'timeline', '偏好已保存');
    page.onTab({ currentTarget: { dataset: { tab: 'stats' } } });
    eq(navLog[0], '/pages/statistics/statistics', '切到统计');
  });

  await check('物品详情页：动作与时间线交互', async () => {
    await store.reset();
    const item = await store.saveItem({ name: '详情测试', categoryId: 'digital', acquiredOn: '2024-01-01', acquisitionAmountMinor: 1000 });
    await store.saveMoneyEntry({ itemId: item.id, direction: 'expense', kind: 'repair', amountMinor: 100, occurredOn: '2024-02-01', title: '维修' });
    const page = loadPage('pages/item/item.js');
    page.onLoad({ id: item.id });
    await page.onShow();
    eq(page.data.detail.name, '详情测试', '详情渲染');
    eq(page.data.missing, false, '存在');
    navLog = [];
    page.addExpense();
    assert(navLog[0].indexOf('/pages/money-edit/money-edit') === 0, '跳记支出');
    page.endHolding();
    assert(navLog[1].indexOf('/pages/exit-edit/exit-edit') === 0, '跳结束持有');

    /* 点时间线上的流水 → 编辑 */
    navLog = [];
    page.onTimelineTap({ currentTarget: { dataset: { index: 0 } } });
    assert(navLog[0].indexOf('/pages/money-edit/money-edit?id=') === 0, '点流水跳编辑');

    /* 删除物品 */
    modalAnswer = true;
    navLog = [];
    page.deleteItem();
    await new Promise(r => setTimeout(r, 10));
    eq(store.findItem(item.id), null, '物品已删除');
    eq(navLog[0], 'back', '删除后返回');
  });

  await check('物品编辑页：新增校验与保存', async () => {
    await store.reset();
    const page = loadPage('pages/item-edit/item-edit.js');
    await page.onLoad({});
    eq(page.data.isEditing, false, '新增模式');
    lastToast = '';
    await page.save();
    eq(lastToast, '请填写物品名称', '空名称被拦');

    page.onName({ detail: { value: '编辑页测试' } });
    page.onPrice({ detail: { value: '99.9' } });
    page.pickCategory({ currentTarget: { dataset: { id: 'digital' } } });
    page.toggleTag({ currentTarget: { dataset: { id: 'none' } } });
    navLog = [];
    await page.save();
    eq(navLog[0], 'back', '保存后返回');
    const saved = store.getState().items.find(i => i.name === '编辑页测试');
    assert(saved, '物品已写入');
    eq(saved.acquisitionAmountMinor, 9990, '99.9 元 → 9990 分');
    eq(saved.categoryId, 'digital', '分类写入');
  });

  await check('物品编辑页：编辑已有物品回填', async () => {
    const item = store.getState().items.find(i => i.name === '编辑页测试');
    const page = loadPage('pages/item-edit/item-edit.js');
    await page.onLoad({ id: item.id });
    eq(page.data.isEditing, true, '编辑模式');
    eq(page.data.name, '编辑页测试', '名称回填');
    eq(page.data.priceText, '99.90', '金额回填');
    page.onPrice({ detail: { value: '' } });
    await page.save();
    const after = store.findItem(item.id);
    eq(after.acquisitionAmountMinor, null, '清空价格后为未知');
  });

  await check('记一笔页：金额校验', async () => {
    const item = store.getState().items[0];
    const page = loadPage('pages/money-edit/money-edit.js');
    await page.onLoad({ itemId: item.id, direction: 'expense' });
    eq(page.data.direction, 'expense', '方向');
    lastToast = '';
    await page.save();
    eq(lastToast, '请填写事项标题', '标题必填');
    page.onTitle({ detail: { value: '买套' } });
    page.onAmount({ detail: { value: '0' } });
    lastToast = '';
    await page.save();
    eq(lastToast, '金额要大于 0', '零金额被拦');
    page.onAmount({ detail: { value: '25.5' } });
    navLog = [];
    await page.save();
    eq(navLog[0], 'back', '保存返回');
    const entry = store.getState().moneyEntries.find(e => e.title === '买套');
    eq(entry.amountMinor, 2550, '25.5 元 → 2550 分');
  });

  await check('结束持有页：出售回收与撤销', async () => {
    const item = store.getState().items[0];
    const page = loadPage('pages/exit-edit/exit-edit.js');
    await page.onLoad({ id: item.id });
    eq(page.data.reason, 'sold', '默认出售');
    page.onRecovery({ detail: { value: '30' } });
    navLog = [];
    await page.save();
    eq(navLog[0], 'back', '保存返回');
    const exit = store.findExit(item.id);
    eq(exit.recoveryAmountMinor, 3000, '回收 30 元');
    eq(exit.reason, 'sold', '原因');
  });

  await check('统计页：条形宽度与文案', async () => {
    const page = loadPage('pages/statistics/statistics.js');
    await page.onShow();
    eq(page.data.hasData, true, '有数据');
    assert(page.data.snapshot.netCostText.indexOf('¥') === 0, '净支出带符号');
    assert(page.data.cashFlow.length >= 1, '现金流桶');
    const widths = page.data.cashFlow.map(b => b.width);
    assert(widths.every(w => w >= 0 && w <= 100), '宽度必须在 0~100');
    page.pickPeriod({ currentTarget: { dataset: { period: '2023' } } });
    eq(page.data.period, '2023', '切换年份');
  });

  await check('设置页：分类与标签增删', async () => {
    const page = loadPage('pages/settings/settings.js');
    await page.onShow();
    eq(page.data.active, 'settings', 'tab');
    page.newCategory();
    page.onCatName({ detail: { value: '摄影器材' } });
    page.pickCatEmoji({ currentTarget: { dataset: { emoji: '📷' } } });
    await page.saveCategory();
    const created = store.categoriesSorted().find(c => c.name === '摄影器材');
    assert(created, '分类已创建');
    eq(M.categoryEmoji(created), '📷', '分类图标');

    page.newTag();
    page.onTagName({ detail: { value: '出差' } });
    page.pickTagColor({ currentTarget: { dataset: { color: '#FF9500' } } });
    await page.saveTag();
    assert(store.tagsSorted().some(t => t.name === '出差'), '标签已创建');

    /* 系统分类不能删 */
    const systemCategory = page.data.categories.find(c => c.isSystem);
    page.editCategory({ currentTarget: { dataset: { id: systemCategory.id } } });
    lastToast = '';
    await page.deleteCategory();
    eq(lastToast, '系统分类不能删除', '系统分类保护');
    page.closeCategory();
  });

  await check('备份页：导出到剪贴板并粘回导入', async () => {
    const stateBefore = store.getState().items.length;
    const page = loadPage('pages/backup/backup.js');
    await page.onShow();
    eq(page.data.counts.items, stateBefore, '计数');
    clipboard = '';
    await page.exportAll();
    assert(clipboard.length > 10, '剪贴板有内容');
    const doc = JSON.parse(clipboard);
    eq(doc.app, 'itemory', '导出的 app 标识');

    await store.reset();
    const backupPage = loadPage('pages/backup/backup.js');
    await backupPage.onShow();
    await backupPage.pasteFromClipboard();
    eq(backupPage.data.importOpen, true, '导入面板打开');
    modalAnswer = true;
    await backupPage.doImport();
    eq(store.getState().items.length, stateBefore, '数据已还原');
  });

  await check('备份页：拒绝坏 JSON', async () => {
    const page = loadPage('pages/backup/backup.js');
    await page.onShow();
    page.onImportText({ detail: { value: '{不是 json' } });
    lastToast = '';
    await page.doImport();
    assert(lastToast.indexOf('JSON') >= 0 || lastToast.indexOf('Unexpected') >= 0 || lastToast.length > 0, '给出错误提示');
  });

  /* 9b. AI 协议层 */
  await check('接口地址规范化', () => {
    eq(ai.resolveRoot('https://api.openai.com/v1'), 'https://api.openai.com/v1', '根地址保持');
    eq(ai.resolveRoot('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1', '去掉端点后缀');
    eq(ai.resolveRoot('https://relay.example.com'), 'https://relay.example.com/v1', '补 /v1');
    let threw = false;
    try { ai.resolveRoot('http://api.openai.com/v1'); } catch (e) { threw = true; }
    assert(threw, 'HTTP 应被拒绝');
    threw = false;
    try { ai.resolveRoot('https://api.openai.com/v1?x=1'); } catch (e) { threw = true; }
    assert(threw, '查询参数应被拒绝');
  });

  await check('模型列表解析', () => {
    eq(ai.parseModelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }).join(','), 'a,b', '去重排序');
    let threw = false;
    try { ai.parseModelIds({ nope: 1 }); } catch (e) { threw = true; }
    assert(threw, '非兼容格式应报错');
  });

  await check('提示词包含分类与输出契约', () => {
    const prompt = ai.buildPrompt(['"数码电子"', '"家具家居"']);
    assert(prompt.indexOf('"数码电子"') >= 0, '分类注入');
    assert(prompt.indexOf('Mandatory output contract') >= 0, '契约固定追加');
    const custom = ai.buildPrompt(['"X"'], '只看{{categories}}');
    assert(custom.indexOf('只看"X"') >= 0, '自定义模板替换占位');
    assert(custom.indexOf('Mandatory output contract') >= 0, '自定义模板也保留契约');
  });

  await check('识别结果解析：隐私过滤与金额归属', () => {
    const parsed = ai.parseExtraction(AI_ANSWER);
    eq(parsed.name, 'Sony WH-1000XM5', '名称');
    eq(parsed.price, 1899.5, '金额');
    eq(parsed.currency, 'CNY', '币种');
    assert(!/订单编号|张三/.test(parsed.notes || ''), '备注里的订单号与姓名应被过滤');
    assert(parsed.warnings.some(w => w.indexOf('个人信息') >= 0), '应提示已过滤');

    const orderTotal = ai.parseExtraction(Object.assign({}, AI_ANSWER, { priceScope: 'order', price: 999 }));
    eq(orderTotal.price, null, '订单总额不能当成单件价格');

    const legacy = ai.parseExtraction({
      name: '旧格式物品', price: 88, categoryHint: null, acquiredOn: null,
      channel: null, warrantyUntil: null, imageType: 'physical_item', notes: null,
    });
    eq(legacy.priceNeedsConfirmation, true, '旧格式金额需要确认');

    let threw = false;
    try {
      ai.parseExtraction(Object.assign({}, AI_ANSWER, { targetStatus: 'ambiguous', itemCount: 3 }));
    } catch (e) { threw = true; }
    assert(threw, '多候选物品应被拒绝');
  });

  await check('不支持参数分类', () => {
    const text = JSON.stringify({ error: { code: 'unsupported_parameter', param: 'response_format', message: 'x' } });
    eq(ai.classifyUnsupportedParameter(400, text), 'json', 'response_format');
    eq(ai.classifyUnsupportedParameter(400, JSON.stringify({ error: { message: 'temperature is not supported' } })), 'temperature', 'temperature');
    eq(ai.classifyUnsupportedParameter(500, text), null, '非 400/422 不重试');
  });

  await check('识图请求形状与降级重试', async () => {
    aiCalls.length = 0;
    aiRejectJson = false;
    const outcome = await ai.extractItemFromImage({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4.1-mini',
      endpointKind: 'chat_completions',
      candidateCategories: ['"数码电子"'],
      imageDataUrl: 'data:image/png;base64,iVBORw==',
    });
    eq(aiCalls.length, 1, '一次请求');
    assert(aiCalls[0].url === 'https://api.example.com/v1/chat/completions', '端点');
    eq(aiCalls[0].header.Authorization, 'Bearer sk-test', '鉴权头');
    eq(aiCalls[0].data.response_format.type, 'json_object', '带响应格式');
    eq(aiCalls[0].data.temperature, 0, '温度');
    eq(outcome.extraction.name, 'Sony WH-1000XM5', '解析结果');
    eq(outcome.attempts.length, 1, '尝试次数');

    aiCalls.length = 0;
    aiRejectJson = true;
    const retried = await ai.extractItemFromImage({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4.1-mini',
      imageDataUrl: 'data:image/png;base64,iVBORw==',
    });
    eq(aiCalls.length, 2, '拒绝 response_format 后重试一次');
    assert(!aiCalls[1].data.response_format, '第二次不带 response_format');
    eq(retried.attempts[0].removed, 'json', '记录被去掉的参数');
    eq(retried.extraction.name, 'Sony WH-1000XM5', '重试后成功');
    aiRejectJson = false;
  });

  await check('密钥：明文与口令加密', async () => {
    await secret.clearKey();
    eq(await secret.currentKey(), '', '清空后没有 Key');
    await secret.saveKey('sk-plain-12345678', null);
    eq(await secret.currentKey(), 'sk-plain-12345678', '明文模式可直接读');
    eq(secret.maskKey('sk-plain-12345678'), 'sk-••••5678', '掩码');
    eq(await secret.isSealed(), false, '不是加密模式');

    await secret.saveKey('sk-sealed-abcdefgh', 'p@ssw0rd');
    secret.lock();
    eq(await secret.currentKey(), '', '加密模式冷启动拿到空');
    eq(await secret.isSealed(), true, '标记为加密');
    eq(await secret.unlockKey('wrong'), false, '错误口令解不开');
    eq(await secret.unlockKey('p@ssw0rd'), true, '正确口令解开');
    eq(await secret.currentKey(), 'sk-sealed-abcdefgh', '解出原文');

    /* 解锁后不需要再问口令 */
    eq(await secret.needsUnlock(), false, '已解锁时不需要再问');

    await secret.clearKey();
    eq(await secret.hasKey(), false, '清除生效');
  });

  /* 9c. 二期页面 */
  await check('AI 设置页：保存配置与拉取模型', async () => {
    const page = loadPage('pages/ai-settings/ai-settings.js');
    await page.onLoad();
    eq(page.data.enabled, false, '默认关闭');

    page.pickConsent({ detail: { value: true } });
    page.onEnabled({ detail: { value: true } });
    page.onBaseURL({ detail: { value: 'https://api.example.com/v1' } });
    page.pickEndpoint({ currentTarget: { dataset: { kind: 'responses' } } });
    page.pickEffort({ currentTarget: { dataset: { effort: 'high' } } });
    page.onModel({ detail: { value: 'gpt-4.1-mini' } });
    await page.saveProfile();

    const profile = await ai.readProfile();
    eq(profile.baseURL, 'https://api.example.com/v1', '地址已存');
    eq(profile.endpointKind, 'responses', '接口形态');
    eq(profile.reasoningEffort, 'high', '推理强度');
    eq(profile.model, 'gpt-4.1-mini', '模型');
    assert(profile.consentAt, '记录同意时间');

    await secret.saveKey('sk-page-12345678', null);
    await page.refreshModels();
    eq(page.data.modelOptions.length, 2, '拉到两个模型');
    eq(page.data.model, 'gpt-4.1-mini', '保留原选择');
  });

  await check('AI 设置：加密 Key 走页内口令解锁', async () => {
    await secret.clearKey();
    await secret.saveKey('sk-sealed-page-9999', 'page-pass');
    secret.lock();
    const page = loadPage('pages/ai-settings/ai-settings.js');
    await page.onLoad();
    eq(page.data.keySaved, true, '显示已保存');
    eq(page.data.keySealed, true, '标记加密');
    await page.refreshModels();
    eq(page.data.unlockOpen, true, '打开口令面板');
    page.onUnlockInput({ detail: { value: 'bad' } });
    lastToast = '';
    await page.submitUnlock();
    eq(lastToast, '口令不对', '错误口令有提示');
    eq(page.data.unlockOpen, true, '面板不关');

    page.onUnlockInput({ detail: { value: 'page-pass' } });
    await page.submitUnlock();
    eq(page.data.unlockOpen, false, '解锁后面板关闭');
    eq(page.data.modelOptions.length, 2, '继续完成了拉取');
  });

  await check('AI 设置：不勾选说明不能启用', async () => {
    const page = loadPage('pages/ai-settings/ai-settings.js');
    await page.onLoad();
    page.pickConsent({ detail: { value: false } });
    page.setData({ enabled: false });
    lastToast = '';
    page.onEnabled({ detail: { value: true } });
    eq(lastToast, '先阅读并勾选数据外发说明', '拦住未同意');
    eq(page.data.enabled, false, '没有真的打开');
  });

  await check('识图录入页：识别 → 草稿带进编辑', async () => {
    await store.reset();
    await secret.saveKey('sk-page-12345678', null);
    const page = loadPage('pages/ai-import/ai-import.js');
    await page.onShow();
    eq(page.data.configured, true, '配置就绪');
    eq(page.data.canPick, true, '可以选图');

    await page.choose();
    eq(page.data.busy, false, '识别结束');
    eq(page.data.error, '', '没有错误');
    assert(page.data.result, '有结果');
    eq(page.data.result.name, 'Sony WH-1000XM5', '结果名称');
    eq(page.data.result.priceText, '1899.50', '金额写成元');
    eq(page.data.result.categoryName, '数码电子', '分类建议匹配到现有分类');
    assert(page.data.warnings.length >= 1, '有核对提示');

    appObject.globalData.aiItemDraft = null;
    navLog = [];
    page.toEditor();
    assert(appObject.globalData.aiItemDraft, '草稿放进 globalData');
    eq(navLog[0], '/pages/item-edit/item-edit', '跳编辑页');
  });

  await check('编辑页：AI 草稿预填', async () => {
    const page = loadPage('pages/item-edit/item-edit.js');
    await page.onLoad({});
    eq(page.data.name, 'Sony WH-1000XM5', '名称预填');
    eq(page.data.priceText, '1899.50', '价格预填');
    eq(page.data.acquiredOn, '2025-11-02', '日期预填');
    eq(page.data.categoryId, 'digital', '分类预填');
    eq(page.data.channel, '京东', '渠道预填');
    assert(page.data.sourceNotice.indexOf('AI') >= 0, '来源提示');
    eq(appObject.globalData.aiItemDraft, null, '草稿只消费一次');
  });

  await check('回顾页：年份筛选与顺序', async () => {
    await store.reset();
    const a = await store.saveItem({ name: '2023 的物品', categoryId: 'digital', acquiredOn: '2023-05-06', acquisitionAmountMinor: 100 });
    const b = await store.saveItem({ name: '2025 的物品', acquiredOn: '2025-01-02', acquisitionAmountMinor: 200, channel: '官网' });
    const page = loadPage('pages/review/review.js');
    await page.onShow();
    eq(page.data.totalCount, 2, '全部件数');
    eq(page.data.years.join(','), '2025,2023', '年份倒序');
    eq(page.data.rows[0].name, '2025 的物品', '默认从近到远');
    eq(page.data.rows[0].subtitle, '¥2 · 官网', '副标题价格与渠道');
    page.toggleDirection();
    eq(page.data.rows[0].name, '2023 的物品', '切换后从远到近');
    page.pickYear({ currentTarget: { dataset: { year: '2025' } } });
    eq(page.data.totalCount, 1, '年份筛选');
    navLog = [];
    page.openItem({ currentTarget: { dataset: { id: b.id } } });
    eq(navLog[0], `/pages/item/item?id=${b.id}`, '跳详情');
    await store.deleteItem(a.id);
    await store.deleteItem(b.id);
  });

  await check('回顾页：年分组头只在换年时出现', async () => {
    await store.reset();
    await store.saveItem({ name: 'A', acquiredOn: '2024-03-01', acquisitionAmountMinor: 100 });
    await store.saveItem({ name: 'B', acquiredOn: '2024-08-01', acquisitionAmountMinor: 100 });
    await store.saveItem({ name: 'C', acquiredOn: '2023-01-01', acquisitionAmountMinor: 100 });
    const page = loadPage('pages/review/review.js');
    await page.onShow();
    const heads = page.data.rows.filter(r => r.yearHead).map(r => r.year);
    eq(heads.length, 2, '两个年份分组头');
    eq(heads.join(','), '2024,2023', '分组顺序');
  });

  await check('封面裁剪页：拖拽缩放并导出封面', async () => {
    const page = loadPage('pages/cover-crop/cover-crop.js');
    page.onLoad({ src: encodeURIComponent('difile://tmp/pick.png') });
    eq(page.data.theme, 'theme-auto', '主题');
    await page.onReady();
    eq(page.data.ready, true, '初始化完成');
    eq(page.data.areaSize, 300, '区域宽度');
    eq(page.data.baseW, 400, '800×600 cover 到 300 正方形 → 宽 400');
    eq(page.data.baseH, 300, '高正好铺满');

    page.onScale({ detail: { value: 2 } });
    eq(page.data.imgW, 800, '放大两倍');
    assert(page.data.x <= 0 && page.data.y <= 0, '缩放后仍在框内');

    appObject.globalData.coverCropResult = null;
    navLog = [];
    await page.save();
    assert(appObject.globalData.coverCropResult, '裁剪结果放回 globalData');
    eq(navLog[0], 'back', '保存后返回');
    const asset = store.findAsset(appObject.globalData.coverCropResult.assetId);
    assert(asset, '封面资源已登记');
  });

  await check('编辑页：接收裁剪结果并替换旧封面', async () => {
    const pending = appObject.globalData.coverCropResult;
    assert(pending, '上一步留下了待接收的裁剪结果');
    const oldAsset = await covers.persistFromTemp('difile://tmp/old.png');
    await store.registerAsset(oldAsset);
    const page = loadPage('pages/item-edit/item-edit.js');
    await page.onLoad({});
    page.setData({ coverAssetId: oldAsset.id, coverPath: oldAsset.path });
    await page.onShow();
    eq(page.data.coverAssetId, pending.assetId, '封面已替换');
    assert(page.data.coverPath.indexOf('covers/') >= 0, '新封面路径');
    eq(appObject.globalData.coverCropResult, null, '结果只消费一次');
    assert(store.findAsset(oldAsset.id), '取消前旧封面不能被删');

    /* 保存后才清理旧封面 */
    page.onName({ detail: { value: '封面物品' } });
    navLog = [];
    await page.save();
    eq(navLog[0], 'back', '保存返回');
    eq(store.findAsset(oldAsset.id), null, '保存后旧封面记录已清理');
  });

  /* 10. 静态检查：WXML 闭合与事件处理函数 */
  await check('WXML 标签闭合、事件处理函数存在', () => {
    const files = listFiles(ROOT).filter(f => f.endsWith('.wxml'));
    assert(files.length >= 8, `WXML 文件数量异常：${files.length}`);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      checkTags(file, source);
      const handlers = new Set();
      const re = /\b(?:bind|catch|capture-bind|capture-catch)[a-z-]*\s*=\s*"([^"{}]+)"/g;
      let m;
      while ((m = re.exec(source))) handlers.add(m[1]);
      const rel = path.relative(ROOT, file).replace(/\.wxml$/, '.js');
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      const page = loadPage(rel);
      for (const handler of handlers) {
        if (handler === 'noop') continue;
        assert(typeof page[handler] === 'function', `${path.basename(file)} 绑定的 ${handler} 不存在于 ${path.basename(rel)}`);
      }
    }
  });

  /* 11. 打包体积 */
  await check('主包体积在 2MB 以内', () => {
    const files = listFiles(ROOT).filter(f => !f.includes(`${path.sep}scripts${path.sep}`));
    let total = 0;
    for (const file of files) total += fs.statSync(file).size;
    console.log(`   主包文件 ${files.length} 个，约 ${(total / 1024).toFixed(0)} KB`);
    assert(total < 2 * 1024 * 1024, `主包超 2MB：${(total / 1024).toFixed(0)} KB`);
  });

  /* ---------- 结果 ---------- */
  console.log('');
  if (failures.length) {
    console.log(`${passed} 项通过，${failures.length} 项失败`);
    process.exitCode = 1;
    return;
  }
  console.log(`全部通过：${passed} 项`);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const VOID_TAGS = new Set(['import', 'include', 'input', 'image', 'textarea', 'switch']);

function checkTags(file, source) {
  /* 先把 {{ ... }} 去掉：表达式里可能出现 >= 这类字符，会让朴素的标签正则断错位 */
  const cleaned = source.replace(/\{\{[\s\S]*?\}\}/g, '');
  const stack = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  let line = 1;
  let lastIndex = 0;
  while ((m = tagRe.exec(cleaned))) {
    line += (cleaned.slice(lastIndex, m.index).match(/\n/g) || []).length;
    lastIndex = m.index;
    const closing = m[0].startsWith('</');
    const name = m[1];
    const selfClosing = m[3] === '/';
    if (closing) {
      const top = stack.pop();
      if (!top || top.name !== name) {
        throw new Error(`${path.basename(file)}:${line} 标签不匹配，</${name}> 对应的是 ${top ? `<${top.name}>` : '空栈'}`);
      }
    } else if (!selfClosing && !VOID_TAGS.has(name)) {
      stack.push({ name, line });
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    throw new Error(`${path.basename(file)}:${top.line} <${top.name}> 没有闭合`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
