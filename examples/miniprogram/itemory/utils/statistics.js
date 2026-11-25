/* Itemory 小程序 · 统计报告
   逐条对应 Itemory/services/statistics.ts（MIT，Copyright (c) 2026 StarYunLee），
   只是把 SQL 换成了内存里的数组遍历，聚合口径、区间规则、排行规则保持一致。
   金额一律整数分；溢出时该指标记为 null，不用 0 或截断值冒充。 */

const {
  EFFECTIVE_ITEM_STATUSES, ITEM_STATUS_META, MONEY_KIND_META, HOLDING_BUCKET_LABELS,
  effectiveItemStatus, itemEmoji, categoryEmoji,
} = require('./model.js');
const { safeCostSummary } = require('./cost.js');
const { safeAddMinor, safeSubtractMinor } = require('./validate.js');
const { calendarHoldingDays, isValidYmd, todayYmd } = require('./format.js');

function ymdParts(value) {
  const [year, month, day] = value.split('-').map(Number);
  return [year, month, day];
}

function ymdFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(value, days) {
  const [year, month, day] = ymdParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return ymdFromDate(date);
}

function monthIndex(value) {
  const [year, month] = ymdParts(value);
  return year * 12 + month - 1;
}

function monthDistance(from, to) {
  return Math.max(0, monthIndex(to) - monthIndex(from));
}

function resolveRange(period, today) {
  if (period !== 'all' && /^\d{4}$/.test(String(period))) {
    const year = String(period);
    return {
      period: year,
      from: `${year}-01-01`,
      to: year === today.slice(0, 4) ? today : `${year}-12-31`,
      label: `${year} 年`,
    };
  }
  return { period: 'all', from: null, to: today, label: '全部' };
}

function isInRange(value, range) {
  return value <= range.to && (range.from === null || value >= range.from);
}

/* 物品在区间内的实际在持天数：[max(购入, from), min(退出|to, to)] */
function holdingDaysInRange(acquiredOn, exitedOn, range) {
  const start = range.from ? (acquiredOn > range.from ? acquiredOn : range.from) : acquiredOn;
  const rawEnd = exitedOn || range.to;
  const end = rawEnd < range.to ? rawEnd : range.to;
  if (start > end) return 0;
  return calendarHoldingDays(start, end);
}

function emptyStatusCounts() {
  return EFFECTIVE_ITEM_STATUSES.map(key => ({
    key,
    label: ITEM_STATUS_META[key].label,
    color: ITEM_STATUS_META[key].color,
    emoji: ITEM_STATUS_META[key].emoji,
    count: 0,
  }));
}

function makeHoldingBuckets() {
  return HOLDING_BUCKET_LABELS.map(label => ({ label, count: 0 }));
}

function addHoldingBucket(buckets, days) {
  if (days <= 30) buckets[0].count++;
  else if (days <= 180) buckets[1].count++;
  else if (days <= 365) buckets[2].count++;
  else if (days <= 1095) buckets[3].count++;
  else buckets[4].count++;
}

function createBucket(key, label) {
  return {
    key, label,
    expenseMinor: 0, incomeMinor: 0,
    acquisitionMinor: 0, extraExpenseMinor: 0, incomeEntryMinor: 0, recoveryMinor: 0,
  };
}

function bucketKeyFor(value, yearly) {
  return yearly ? value.slice(0, 4) : value.slice(0, 7);
}

function bucketLabelFor(key, yearly, spanMonths) {
  if (yearly) return `${key}年`;
  const [year, month] = key.split('-');
  return spanMonths > 12 ? `${year}年${Number(month)}月` : `${Number(month)}月`;
}

/* 聚合加法：任何一个操作数已溢出（null）就继续 null，并记录指标名 */
function makeAggregators() {
  const overflow = [];
  const add = (a, b, metric) => {
    if (a === null || b === null) { overflow.push(metric); return null; }
    try { return safeAddMinor(a, b, metric); } catch (e) { overflow.push(metric); return null; }
  };
  const subtract = (a, b, metric) => {
    if (a === null || b === null) { overflow.push(metric); return null; }
    try { return safeSubtractMinor(a, b, metric); } catch (e) { overflow.push(metric); return null; }
  };
  return { overflow, add, subtract };
}

function addBucketValue(buckets, value, yearly, spanMonths, field, amount, add) {
  const key = bucketKeyFor(value, yearly);
  const bucket = buckets.get(key) || createBucket(key, bucketLabelFor(key, yearly, spanMonths));
  bucket[field] = add(bucket[field], amount, `bucket:${key}:${field}`);
  bucket.expenseMinor = add(bucket.expenseMinor, field === 'acquisitionMinor' || field === 'extraExpenseMinor' ? amount : 0, `bucket:${key}:expenseMinor`);
  bucket.incomeMinor = add(bucket.incomeMinor, field === 'incomeEntryMinor' || field === 'recoveryMinor' ? amount : 0, `bucket:${key}:incomeMinor`);
  buckets.set(key, bucket);
}

function fillCashFlowBuckets(buckets, range, yearly, allEventYears) {
  if (yearly) {
    const years = allEventYears.length > 0 ? allEventYears : [range.to.slice(0, 4)];
    const minYear = Number(years[0]);
    const maxYear = Number(years[years.length - 1]);
    for (let y = minYear; y <= maxYear; y++) {
      const key = String(y);
      if (!buckets.has(key)) buckets.set(key, createBucket(key, `${y}年`));
    }
  } else {
    const year = range.period;
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, createBucket(key, `${m}月`));
    }
  }
}

/* 一整套物品分析：物品 + 流水 + 退出 + 成本 + 分类 */
function analyse(state) {
  const categoryById = new Map((state.categories || []).map(c => [c.id, c]));
  const moneyByItem = new Map();
  for (const entry of state.moneyEntries || []) {
    const list = moneyByItem.get(entry.itemId) || [];
    list.push(entry);
    moneyByItem.set(entry.itemId, list);
  }
  const exitByItem = new Map((state.exits || []).map(e => [e.itemId, e]));

  return (state.items || []).map(item => ({
    item,
    money: moneyByItem.get(item.id) || [],
    exit: exitByItem.get(item.id) || null,
    category: item.categoryId ? (categoryById.get(item.categoryId) || null) : null,
    summary: safeCostSummary(item, moneyByItem.get(item.id) || [], exitByItem.get(item.id) || null),
  }));
}

function buildRankingItem(analysis, amountMinor, customDays) {
  return {
    itemId: analysis.item.id,
    name: analysis.item.name,
    emoji: itemEmoji(analysis.item, analysis.category),
    categoryEmoji: categoryEmoji(analysis.category),
    purchaseAmountMinor: analysis.item.acquisitionAmountMinor,
    status: effectiveItemStatus(analysis.item, analysis.exit),
    amountMinor,
    holdingDays: customDays === undefined ? analysis.summary.holdingDays : customDays,
    coverAssetId: analysis.item.coverAssetId,
  };
}

function clampList(list, n) {
  return list.slice(0, n || 10);
}

/**
 * 生成统计报告。
 * @param {object} state 完整数据
 * @param {string} period "all" 或 "2026" 这样的年份
 */
function buildStatistics(state, period) {
  const today = todayYmd();
  const range = resolveRange(period || 'all', today);
  const { overflow, add, subtract } = makeAggregators();
  const analyses = analyse(state);

  const statusCounts = emptyStatusCounts();
  const statusMap = new Map(statusCounts.map(entry => [entry.key, entry]));
  const categoryMap = new Map();
  const expenseMap = new Map();
  const holdingBuckets = makeHoldingBuckets();

  let currentExpenseMinor = 0;
  let currentDailyCostMinor = 0;
  let currentValuationMinor = 0;
  let valuationCount = 0;
  let valuationComparableGapMinor = 0;
  let valuationComparableCount = 0;
  let activeHoldingDays = 0;
  let activeHoldingCount = 0;
  let longestCurrentHoldingDays = 0;

  for (const analysis of analyses) {
    const { item, exit, summary } = analysis;
    const status = statusMap.get(effectiveItemStatus(item, exit));
    if (status) status.count++;

    const holdingDays = summary.holdingDays;
    if (!exit && holdingDays !== null) {
      addHoldingBucket(holdingBuckets, holdingDays);
      activeHoldingDays += holdingDays;
      activeHoldingCount++;
      longestCurrentHoldingDays = Math.max(longestCurrentHoldingDays, holdingDays);
    }
    if (!exit && summary.available) {
      currentExpenseMinor = add(currentExpenseMinor, summary.totalExpenseMinor, 'currentExpenseMinor');
      currentDailyCostMinor = add(currentDailyCostMinor, summary.dailyCostMinor, 'currentDailyCostMinor');
      if (item.valuationMinor !== null && item.valuationMinor !== undefined) {
        currentValuationMinor = add(currentValuationMinor, item.valuationMinor, 'currentValuationMinor');
        valuationCount++;
        if (summary.isAcquisitionPriceKnown) {
          valuationComparableGapMinor = add(valuationComparableGapMinor, item.valuationMinor - summary.totalExpenseMinor, 'valuationComparableGapMinor');
          valuationComparableCount++;
        }
      }
    }
  }

  const allRawDates = []
    .concat(analyses.map(a => a.item.acquiredOn))
    .concat((state.moneyEntries || []).map(e => e.occurredOn))
    .concat((state.exits || []).map(e => e.exitedOn))
    .filter(d => Boolean(d) && isValidYmd(d) && d <= today);

  const yearSet = new Set();
  for (const d of allRawDates) if (d && d.length >= 4) yearSet.add(d.slice(0, 4));
  yearSet.add(today.slice(0, 4));
  const sortedYearsAsc = Array.from(yearSet).sort();
  const availableYears = Array.from(yearSet).sort().reverse();

  const eventDates = allRawDates.filter(d => isInRange(d, range));
  const firstEvent = eventDates.sort()[0] || range.from || today;
  const spanStart = range.from || firstEvent;
  const spanMonths = monthDistance(spanStart, range.to);
  const yearlyBuckets = (period || 'all') === 'all';
  const bucketMap = new Map();
  let acquisitionMinor = 0;
  let extraExpenseMinor = 0;
  let incomeEntryMinor = 0;
  let recoveryMinor = 0;
  let addedCount = 0;
  let endedCountInPeriod = 0;
  const periodExpenseByItem = new Map();

  for (const analysis of analyses) {
    const { item, money, exit } = analysis;
    let itemPeriodExpense = 0;
    if (isValidYmd(item.acquiredOn) && item.acquiredOn <= today && isInRange(item.acquiredOn, range)) addedCount++;
    if (exit && isValidYmd(exit.exitedOn) && exit.exitedOn <= today && isInRange(exit.exitedOn, range)) endedCountInPeriod++;
    if (!analysis.summary.available) continue;

    if (isInRange(item.acquiredOn, range) && item.acquisitionAmountMinor !== null) {
      acquisitionMinor = add(acquisitionMinor, item.acquisitionAmountMinor, 'acquisitionMinor');
      itemPeriodExpense = safeAddMinor(itemPeriodExpense, item.acquisitionAmountMinor, '物品期间购入');
      addBucketValue(bucketMap, item.acquiredOn, yearlyBuckets, spanMonths, 'acquisitionMinor', item.acquisitionAmountMinor, add);
    }

    for (const entry of money) {
      if (!isInRange(entry.occurredOn, range)) continue;
      if (entry.direction === 'expense') {
        extraExpenseMinor = add(extraExpenseMinor, entry.amountMinor, 'extraExpenseMinor');
        itemPeriodExpense = safeAddMinor(itemPeriodExpense, entry.amountMinor, '物品期间支出');
        addBucketValue(bucketMap, entry.occurredOn, yearlyBuckets, spanMonths, 'extraExpenseMinor', entry.amountMinor, add);
        const meta = MONEY_KIND_META[entry.kind] || MONEY_KIND_META.other;
        const expense = expenseMap.get(entry.kind) || {
          key: entry.kind, label: meta.label, color: meta.color, emoji: meta.emoji, amountMinor: 0, count: 0,
        };
        expense.amountMinor = add(expense.amountMinor, entry.amountMinor, `expenseKind:${entry.kind}`);
        expense.count++;
        expenseMap.set(entry.kind, expense);
      } else {
        incomeEntryMinor = add(incomeEntryMinor, entry.amountMinor, 'incomeEntryMinor');
        addBucketValue(bucketMap, entry.occurredOn, yearlyBuckets, spanMonths, 'incomeEntryMinor', entry.amountMinor, add);
      }
    }

    if (exit && isInRange(exit.exitedOn, range) && exit.recoveryAmountMinor !== null && exit.recoveryAmountMinor !== undefined) {
      recoveryMinor = add(recoveryMinor, exit.recoveryAmountMinor, 'recoveryMinor');
      addBucketValue(bucketMap, exit.exitedOn, yearlyBuckets, spanMonths, 'recoveryMinor', exit.recoveryAmountMinor, add);
    }

    periodExpenseByItem.set(item.id, itemPeriodExpense);

    if (itemPeriodExpense > 0) {
      const categoryKey = item.categoryId || '__uncategorized__';
      const category = categoryMap.get(categoryKey) || {
        id: analysis.category ? analysis.category.id : null,
        name: analysis.category ? analysis.category.name : '未分类',
        emoji: categoryEmoji(analysis.category),
        itemCount: 0,
        knownExpenseMinor: 0,
      };
      category.itemCount++;
      category.knownExpenseMinor = add(category.knownExpenseMinor, itemPeriodExpense, `category:${categoryKey}:knownExpenseMinor`);
      categoryMap.set(categoryKey, category);
    }
  }

  fillCashFlowBuckets(bucketMap, range, yearlyBuckets, sortedYearsAsc);

  const periodExpenseMinor = add(acquisitionMinor, extraExpenseMinor, 'totalExpenseMinor');
  const periodIncomeMinor = add(incomeEntryMinor, recoveryMinor, 'totalIncomeMinor');
  const netCostMinor = subtract(periodExpenseMinor, periodIncomeMinor, 'netCostMinor');

  const cashFlow = {
    buckets: Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    expenseMinor: periodExpenseMinor,
    incomeMinor: periodIncomeMinor,
    netMinor: subtract(periodIncomeMinor, periodExpenseMinor, 'cashFlow.netMinor'),
    acquisitionMinor,
    extraExpenseMinor,
    incomeEntryMinor,
    recoveryMinor,
  };

  const totalItemCount = analyses.length;
  const activeCount = (statusMap.get('in_use') || {}).count + (statusMap.get('idle') || {}).count + (statusMap.get('damaged') || {}).count;
  const endedCount = (statusMap.get('sold') || {}).count + (statusMap.get('gifted') || {}).count + (statusMap.get('discarded') || {}).count + (statusMap.get('lost') || {}).count;

  const categoriesResult = Array.from(categoryMap.values()).sort((a, b) => {
    if (b.knownExpenseMinor !== a.knownExpenseMinor) return (b.knownExpenseMinor === null ? -1 : b.knownExpenseMinor) - (a.knownExpenseMinor === null ? -1 : a.knownExpenseMinor);
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
  const expenseKinds = Array.from(expenseMap.values()).sort((a, b) => (b.amountMinor === null ? -1 : b.amountMinor) - (a.amountMinor === null ? -1 : a.amountMinor));

  /* 排行：期间投入 / 日均 / 陪伴 */
  const rankingItems = analyses.map(a => ({ analysis: a, amountMinor: periodExpenseByItem.get(a.item.id) || 0 })).filter(x => x.amountMinor > 0);
  rankingItems.sort((a, b) => b.amountMinor - a.amountMinor);

  const dailyList = [];
  const holdingList = [];
  for (const analysis of analyses) {
    if (analysis.summary.holdingDays === null) continue;
    if ((period || 'all') === 'all') {
      if (!analysis.exit) {
        dailyList.push({ analysis, dailyCostMinor: analysis.summary.dailyCostMinor, days: analysis.summary.holdingDays });
      }
      holdingList.push({ analysis, days: analysis.summary.holdingDays });
    } else {
      const days = holdingDaysInRange(analysis.item.acquiredOn, analysis.exit && analysis.exit.exitedOn, range);
      if (days > 0) {
        let yearExpense = 0;
        let yearIncome = 0;
        if (isInRange(analysis.item.acquiredOn, range) && analysis.item.acquisitionAmountMinor !== null) {
          yearExpense = safeAddMinor(yearExpense, analysis.item.acquisitionAmountMinor, '年度物品购入');
        }
        for (const entry of analysis.money) {
          if (!isInRange(entry.occurredOn, range)) continue;
          if (entry.direction === 'expense') yearExpense = safeAddMinor(yearExpense, entry.amountMinor, '年度物品支出');
          else yearIncome = safeAddMinor(yearIncome, entry.amountMinor, '年度物品收入');
        }
        if (analysis.exit && isInRange(analysis.exit.exitedOn, range) && analysis.exit.recoveryAmountMinor !== null) {
          yearIncome = safeAddMinor(yearIncome, analysis.exit.recoveryAmountMinor, '年度物品回收');
        }
        dailyList.push({ analysis, dailyCostMinor: Math.round((yearExpense - yearIncome) / days), days });
        holdingList.push({ analysis, days });
      }
    }
  }
  dailyList.sort((a, b) => b.dailyCostMinor - a.dailyCostMinor);
  holdingList.sort((a, b) => b.days - a.days || String(a.analysis.item.name).localeCompare(String(b.analysis.item.name), 'zh-CN'));

  const rankings = {
    topExpense: clampList(rankingItems).map(x => buildRankingItem(x.analysis, x.amountMinor)),
    bottomExpense: clampList(rankingItems.slice().reverse()).map(x => buildRankingItem(x.analysis, x.amountMinor)),
    topDailyCost: clampList(dailyList).map(x => buildRankingItem(x.analysis, x.dailyCostMinor, x.days)),
    bottomDailyCost: clampList(dailyList.slice().reverse()).map(x => buildRankingItem(x.analysis, x.dailyCostMinor, x.days)),
    topHoldingTime: clampList(holdingList).map(x => buildRankingItem(x.analysis, 0, x.days)),
    bottomHoldingTime: clampList(holdingList.slice().sort((a, b) => a.days - b.days || String(a.analysis.item.name).localeCompare(String(b.analysis.item.name), 'zh-CN'))).map(x => buildRankingItem(x.analysis, 0, x.days)),
  };

  const expiringSoonDate = addDays(today, 30);
  const alerts = {
    warrantyExpired: analyses.filter(a => !a.exit && a.item.warrantyUntil !== null && a.item.warrantyUntil < today).length,
    warrantyExpiringSoon: analyses.filter(a => !a.exit && a.item.warrantyUntil !== null && a.item.warrantyUntil >= today && a.item.warrantyUntil <= expiringSoonDate).length,
    idleCount: (statusMap.get('idle') || {}).count,
    damagedCount: (statusMap.get('damaged') || {}).count,
    unknownAcquisitionCount: analyses.filter(a => a.item.acquisitionAmountMinor === null).length,
    missingValuationCount: analyses.filter(a => !a.exit && a.item.valuationMinor === null).length,
    missingSoldRecoveryCount: analyses.filter(a => a.exit && a.exit.reason === 'sold' && a.exit.recoveryAmountMinor === null).length,
    uncategorizedCount: analyses.filter(a => a.item.categoryId === null).length,
  };

  /* 状态分布：具体年份统计该年购入物品的当前去向；全部时间统计全量 */
  const activeStatusCounts = emptyStatusCounts();
  const activeStatusMap = new Map(activeStatusCounts.map(entry => [entry.key, entry]));
  for (const analysis of analyses) {
    if ((period || 'all') !== 'all') {
      const item = analysis.item;
      if (!isValidYmd(item.acquiredOn) || item.acquiredOn > today || !isInRange(item.acquiredOn, range)) continue;
    }
    const status = activeStatusMap.get(effectiveItemStatus(analysis.item, analysis.exit));
    if (status) status.count++;
  }

  /* 期间日均花销 = 期间总支出 / 期间在账天数 */
  const periodDays = range.from ? calendarHoldingDays(range.from, range.to) : calendarHoldingDays(firstEvent, range.to);
  const periodDailyExpenseMinor = periodExpenseMinor === null ? null : Math.round(periodExpenseMinor / periodDays);
  if (periodDailyExpenseMinor === null) overflow.push('periodDailyExpenseMinor');

  return {
    overflowMetrics: Array.from(new Set(overflow)).sort(),
    range,
    availableYears,
    snapshot: {
      amountStatus: periodExpenseMinor === null || periodIncomeMinor === null || netCostMinor === null
        ? 'unavailable' : 'valid',
      totalItemCount,
      activeCount,
      endedCount,
      addedCount,
      endedCountInPeriod,
      totalExpenseMinor: periodExpenseMinor,
      totalIncomeMinor: periodIncomeMinor,
      netCostMinor,
      currentExpenseMinor,
      currentDailyCostMinor,
      periodDailyExpenseMinor,
      currentValuationMinor,
      valuationCount,
      valuationTotalCount: activeCount,
      valuationComparableGapMinor,
      valuationComparableCount,
    },
    statuses: activeStatusCounts,
    categories: categoriesResult,
    expenseKinds,
    cashFlow,
    lifecycle: {
      averageCurrentHoldingDays: activeHoldingCount > 0 ? Math.round(activeHoldingDays / activeHoldingCount) : null,
      longestCurrentHoldingDays: activeHoldingCount > 0 ? longestCurrentHoldingDays : null,
      knownHoldingCount: activeHoldingCount,
      unavailableHoldingCount: analyses.filter(a => !a.exit && a.summary.holdingDays === null).length,
      holdingBuckets,
    },
    rankings,
    alerts,
  };
}

module.exports = {
  buildStatistics,
  resolveRange,
  isInRange,
  holdingDaysInRange,
  analyse,
};
