/* Itemory 小程序 · 视图数据
   把 store 里的记录变成 WXML 能直接渲染的扁平数组。
   WXML 不能调用函数、也不能做复杂表达式，所以金额文案、状态文案、
   陪伴天数这类派生值都在这里算好。 */

const {
  ITEM_STATUS_META, MONEY_KIND_META, TIMELINE_TYPE_META, EXIT_REASON_LABELS,
  effectiveItemStatus, itemEmoji, categoryEmoji,
} = require('./model.js');
const { safeCostSummary } = require('./cost.js');
const { buildTimeline } = require('./timeline.js');
const { formatMinorMoney, formatYmdZh, formatHoldingDuration, isValidYmd } = require('./format.js');

function money(minor, compact) {
  if (minor === null || minor === undefined) return '未知';
  try { return formatMinorMoney(minor, compact); } catch (e) { return '未知'; }
}

function signedMoney(minor, direction) {
  const text = money(minor, false);
  if (text === '未知') return text;
  return direction === 'income' ? `+${text}` : `-${text}`;
}

function daysText(days) {
  if (days === null || days === undefined) return '天数未知';
  try { return formatHoldingDuration(days); } catch (e) { return `${days} 天`; }
}

function dateText(ymd) {
  return isValidYmd(ymd) ? formatYmdZh(ymd) : (ymd || '');
}

function statusOf(item, exit) {
  const key = effectiveItemStatus(item, exit);
  const meta = ITEM_STATUS_META[key] || ITEM_STATUS_META.idle;
  return { key, label: meta.label, color: meta.color, emoji: meta.emoji };
}

/* 一组物品的原始分析结果（卡片、详情、统计都用它） */
function analyses(state) {
  const categoryById = new Map((state.categories || []).map(c => [c.id, c]));
  const exitByItem = new Map((state.exits || []).map(e => [e.itemId, e]));
  const moneyByItem = new Map();
  for (const entry of state.moneyEntries || []) {
    const list = moneyByItem.get(entry.itemId) || [];
    list.push(entry);
    moneyByItem.set(entry.itemId, list);
  }
  return (state.items || []).map(item => {
    const money = moneyByItem.get(item.id) || [];
    const exit = exitByItem.get(item.id) || null;
    const category = item.categoryId ? (categoryById.get(item.categoryId) || null) : null;
    return {
      item, money, exit, category,
      summary: safeCostSummary(item, money, exit),
    };
  });
}

function tagChipsOf(state, itemId) {
  const tagIds = new Set((state.itemTags || []).filter(l => l.itemId === itemId).map(l => l.tagId));
  return (state.tags || [])
    .filter(t => tagIds.has(t.id))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(t => ({ id: t.id, name: t.name, color: t.color }));
}

function coverPathOf(state, item) {
  if (!item.coverAssetId) return '';
  const asset = (state.assets || []).find(a => a.id === item.coverAssetId);
  return asset ? asset.path : '';
}

/* ---------- 列表 ---------- */

const SORT_FIELDS = {
  created: '添加时间',
  expense: '累计投入',
  days: '陪伴时间',
  daily: '日均成本',
};

function matchKeyword(analysis, keyword, tagNames) {
  if (!keyword) return true;
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  const item = analysis.item;
  if (String(item.name).toLowerCase().indexOf(needle) >= 0) return true;
  if (item.notes && String(item.notes).toLowerCase().indexOf(needle) >= 0) return true;
  if (item.channel && String(item.channel).toLowerCase().indexOf(needle) >= 0) return true;
  if (analysis.category && String(analysis.category.name).toLowerCase().indexOf(needle) >= 0) return true;
  if (tagNames && tagNames.some(name => String(name).toLowerCase().indexOf(needle) >= 0)) return true;
  return false;
}

function cardOf(analysis, state) {
  const { item, exit, category, summary } = analysis;
  const status = statusOf(item, exit);
  const knownPrice = item.acquisitionAmountMinor === null ? '' : money(item.acquisitionAmountMinor, true);
  return {
    id: item.id,
    name: item.name,
    emoji: itemEmoji(item, category),
    coverPath: coverPathOf(state, item),
    categoryId: category ? category.id : '',
    categoryName: category ? category.name : '未分类',
    statusKey: status.key,
    statusLabel: status.label,
    statusColor: status.color,
    tags: tagChipsOf(state, item.id),
    knownPriceText: knownPrice,
    acquiredText: dateText(item.acquiredOn),
    holdingText: summary.holdingDays === null ? '天数未知' : `陪伴 ${daysText(summary.holdingDays)}`,
    dailyCostText: summary.available ? `日均 ${money(summary.dailyCostMinor, true)}` : '日均未知',
    totalExpenseText: summary.available ? money(summary.totalExpenseMinor, true) : '未知',
    netCostText: summary.available ? money(summary.netCostMinor, true) : '未知',
    isExited: Boolean(exit),
    exitReasonText: exit ? (EXIT_REASON_LABELS[exit.reason] || '结束持有') : '',
    isWarrantySoon: !exit && item.warrantyUntil !== null && item.warrantyUntil >= item.acquiredOn,
    warrantyText: item.warrantyUntil ? `保修至 ${item.warrantyUntil}` : '',
    sortCreated: item.createdAt || 0,
    sortExpense: summary.available ? summary.totalExpenseMinor : -1,
    sortDays: summary.holdingDays === null ? -1 : summary.holdingDays,
    sortDaily: summary.available ? summary.dailyCostMinor : -1,
  };
}

/**
 * 生成列表卡片。
 * @param {object} state
 * @param {object} query {categoryId,statusFilter,keyword,sortField,sortDirection}
 */
function buildCards(state, query) {
  const q = Object.assign({ categoryId: 'all', statusFilter: 'all', keyword: '', sortField: 'created', sortDirection: 'desc' }, query || {});
  const all = analyses(state);
  const cards = [];
  for (const analysis of all) {
    const { item, exit } = analysis;
    if (q.categoryId !== 'all') {
      if (q.categoryId === 'uncategorized') {
        if (item.categoryId) continue;
      } else if (item.categoryId !== q.categoryId) continue;
    }
    if (q.statusFilter !== 'all' && effectiveItemStatus(item, exit) !== q.statusFilter) continue;
    if (!matchKeyword(analysis, q.keyword, tagChipsOf(state, item.id).map(t => t.name))) continue;
    cards.push(cardOf(analysis, state));
  }

  const fieldKey = q.sortField === 'expense' ? 'sortExpense'
    : q.sortField === 'days' ? 'sortDays'
      : q.sortField === 'daily' ? 'sortDaily'
        : 'sortCreated';
  const dir = q.sortDirection === 'asc' ? 1 : -1;
  cards.sort((a, b) => {
    const diff = (a[fieldKey] - b[fieldKey]) * dir;
    if (diff !== 0) return diff;
    return (b.sortCreated - a.sortCreated);
  });
  return cards;
}

/* ---------- 详情 ---------- */

function buildDetail(state, itemId) {
  const analysis = analyses(state).find(a => a.item.id === itemId);
  if (!analysis) return null;
  const { item, money: entries, exit, summary } = analysis;
  const status = statusOf(item, exit);
  const timeline = buildTimeline(item, entries, exit).map(node => {
    const meta = TIMELINE_TYPE_META[node.type] || TIMELINE_TYPE_META.purchase;
    const kindMeta = node.kind ? (MONEY_KIND_META[node.kind] || MONEY_KIND_META.other) : null;
    return {
      id: node.id,
      type: node.type,
      emoji: meta.emoji,
      typeLabel: meta.label,
      title: node.title,
      subtitle: node.subtitle || '',
      kindLabel: kindMeta ? kindMeta.label : '',
      dateText: dateText(node.date),
      amountText: node.amountMinor === null || node.amountMinor === undefined
        ? '' : signedMoney(node.amountMinor, node.direction),
      isIncome: node.direction === 'income',
      isPostExitSettlement: Boolean(node.isPostExitSettlement),
      canEdit: Boolean(node.canEdit),
      canDelete: Boolean(node.canDelete),
      moneyEntryId: node.type === 'money_expense' || node.type === 'money_income' ? node.id : '',
    };
  });

  return {
    id: item.id,
    name: item.name,
    emoji: itemEmoji(item, analysis.category),
    coverPath: coverPathOf(state, item),
    category: analysis.category ? { id: analysis.category.id, name: analysis.category.name, emoji: categoryEmoji(analysis.category) } : null,
    tags: tagChipsOf(state, item.id),
    statusKey: status.key,
    statusLabel: status.label,
    statusColor: status.color,
    statusEmoji: status.emoji,
    isExited: Boolean(exit),
    exitReasonText: exit ? (EXIT_REASON_LABELS[exit.reason] || '结束持有') : '',
    exitDateText: exit ? dateText(exit.exitedOn) : '',
    exitNote: exit && exit.note ? exit.note : '',
    acquiredText: dateText(item.acquiredOn),
    channel: item.channel || '',
    warrantyText: item.warrantyUntil ? `保修至 ${dateText(item.warrantyUntil)}` : '',
    notes: item.notes || '',
    knownPriceText: item.acquisitionAmountMinor === null ? '购入价未知' : money(item.acquisitionAmountMinor),
    valuationText: item.valuationMinor === null ? '' : money(item.valuationMinor),
    holdingText: summary.holdingDays === null ? '陪伴天数未知' : formatHoldingDuration(summary.holdingDays),
    totalExpenseText: money(summary.totalExpenseMinor),
    totalIncomeText: money(summary.totalIncomeMinor),
    netCostText: money(summary.netCostMinor),
    dailyCostText: money(summary.dailyCostMinor),
    costAvailable: summary.available,
    costUnavailableReason: summary.unavailableReason || '',
    isAcquisitionPriceKnown: summary.isAcquisitionPriceKnown,
    isExitPriceKnown: summary.isExitPriceKnown,
    timeline,
  };
}

/* 顶部小结：物品数、累计投入、当前日均 */
function buildOverview(state) {
  const all = analyses(state);
  let activeCount = 0;
  let totalExpense = 0;
  let totalDaily = 0;
  let knownExpenseCount = 0;
  for (const analysis of all) {
    if (analysis.exit) continue;
    activeCount++;
    if (analysis.summary.available) {
      totalExpense += analysis.summary.totalExpenseMinor;
      totalDaily += analysis.summary.dailyCostMinor;
      knownExpenseCount++;
    }
  }
  return {
    itemCount: all.length,
    activeCount,
    totalExpenseText: knownExpenseCount ? money(totalExpense, true) : '—',
    totalDailyText: knownExpenseCount ? money(totalDaily, true) : '—',
  };
}

/* ---------- 回顾（按购入时间浏览） ---------- */

function reviewYears(state) {
  const set = new Set();
  for (const item of state.items || []) {
    if (typeof item.acquiredOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.acquiredOn)) {
      set.add(item.acquiredOn.slice(0, 4));
    }
  }
  return Array.from(set).sort().reverse();
}

/**
 * 回顾列表：不分页，直接按年份筛选 + 购入日期排序，并在跨年处标记分组头。
 * 副标题口径与桌面版 reviewItemSubtitle 一致。
 */
function buildReview(state, query) {
  const q = Object.assign({ year: 'all', direction: 'desc' }, query || {});
  const categoryById = new Map((state.categories || []).map(c => [c.id, c]));
  const exitByItem = new Map((state.exits || []).map(e => [e.itemId, e]));
  const years = reviewYears(state);
  const items = (state.items || []).filter(item =>
    q.year === 'all' || (typeof item.acquiredOn === 'string' && item.acquiredOn.slice(0, 4) === q.year)
  );
  const dir = q.direction === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    if (a.acquiredOn !== b.acquiredOn) return a.acquiredOn < b.acquiredOn ? -dir : dir;
    return String(a.id) < String(b.id) ? -dir : dir;
  });

  const rows = [];
  let lastYear = '';
  for (const item of items) {
    const exit = exitByItem.get(item.id) || null;
    const category = item.categoryId ? (categoryById.get(item.categoryId) || null) : null;
    const parts = item.acquiredOn.split('-');
    const price = item.acquisitionAmountMinor === null ? '' : money(item.acquisitionAmountMinor, true);
    let subtitle = '';
    if (exit) {
      const exitLabel = EXIT_REASON_LABELS[exit.reason] || '结束持有';
      subtitle = [price, `${dateText(exit.exitedOn)}${exitLabel}`].filter(Boolean).join(' · ');
    } else {
      const channel = item.channel ? String(item.channel).trim() : '';
      subtitle = price && channel ? `${price} · ${channel}` : (price || channel);
    }
    const year = parts[0] || '';
    rows.push({
      id: item.id,
      name: item.name,
      emoji: itemEmoji(item, category),
      coverPath: coverPathOf(state, item),
      day: parts[2] || '',
      month: parts[1] ? `${parts[1]}月` : '',
      year,
      yearHead: year !== lastYear,
      subtitle,
      exited: Boolean(exit),
      statusColor: exit ? (ITEM_STATUS_META[exit.reason] || {}).color || '#8E8E93' : '',
    });
    lastYear = year;
  }
  return { rows, years, totalCount: items.length };
}

module.exports = {
  SORT_FIELDS,
  analyses,
  tagChipsOf,
  coverPathOf,
  buildCards,
  buildDetail,
  buildOverview,
  buildReview,
  reviewYears,
  money,
  signedMoney,
  daysText,
  dateText,
  statusOf,
};
