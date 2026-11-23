/* Itemory 小程序 · 统计
   对应桌面版 StatisticsPage，聚合口径来自 utils/statistics.js。
   条形宽度、金额文案这类派生值在这里算好，WXML 只负责画。 */

const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const M = require('../../utils/model.js');
const { buildStatistics } = require('../../utils/statistics.js');

const app = getApp();

function barPercent(value, max) {
  if (!max || value === null || value === undefined) return 0;
  if (value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

function maxOf(list, pick) {
  return list.reduce((m, entry) => {
    const v = pick(entry);
    return typeof v === 'number' && v > m ? v : m;
  }, 0);
}

Page({
  data: {
    active: 'stats',
    theme: 'theme-auto',
    period: 'all',
    years: [],
    range: null,
    snapshot: null,
    statuses: [],
    cashFlow: [],
    maxCashFlow: 0,
    categories: [],
    maxCategory: 0,
    expenseKinds: [],
    maxExpenseKind: 0,
    lifecycle: null,
    holdingBars: [],
    maxHolding: 0,
    alerts: [],
    moneyUnknown: '未知',
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({ theme: `theme-${prefs.theme || 'auto'}` });
    this.refresh();
  },

  pickPeriod(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ period });
    this.refresh();
  },

  refresh() {
    const state = store.getState();
    if (!state) return;
    const report = buildStatistics(state, this.data.period);
    const snapshot = report.snapshot;

    const cashFlow = report.cashFlow.buckets.map(bucket => ({
      key: bucket.key,
      label: bucket.label,
      expenseText: V.money(bucket.expenseMinor, true),
      incomeText: bucket.incomeMinor ? V.money(bucket.incomeMinor, true) : '',
      width: barPercent(bucket.expenseMinor, maxOf(report.cashFlow.buckets, b => b.expenseMinor)),
      isCurrent: bucket.key === report.cashFlow.buckets[report.cashFlow.buckets.length - 1].key,
    }));

    const categories = report.categories.map(c => ({
      id: c.id || 'uncategorized',
      name: c.name,
      emoji: c.emoji,
      itemCount: c.itemCount,
      amountText: V.money(c.knownExpenseMinor, true),
      width: barPercent(c.knownExpenseMinor, maxOf(report.categories, x => x.knownExpenseMinor)),
    }));

    const expenseKinds = report.expenseKinds.map(kind => ({
      key: kind.key,
      label: kind.label,
      emoji: kind.emoji,
      color: kind.color,
      count: kind.count,
      amountText: V.money(kind.amountMinor, true),
      width: barPercent(kind.amountMinor, maxOf(report.expenseKinds, x => x.amountMinor)),
      colorStyle: `background:${kind.color}`,
    }));

    const holdingBars = report.lifecycle.holdingBuckets.map(bucket => ({
      label: bucket.label,
      count: bucket.count,
      width: barPercent(bucket.count, maxOf(report.lifecycle.holdingBuckets, x => x.count)),
    }));

    const alerts = [
      { key: 'warrantyExpiringSoon', label: '30 天内过保', count: report.alerts.warrantyExpiringSoon, tone: 'warn' },
      { key: 'warrantyExpired', label: '已过保', count: report.alerts.warrantyExpired, tone: 'bad' },
      { key: 'idleCount', label: '闲置', count: report.alerts.idleCount, tone: 'muted' },
      { key: 'damagedCount', label: '损坏', count: report.alerts.damagedCount, tone: 'warn' },
      { key: 'unknownAcquisitionCount', label: '购入价未知', count: report.alerts.unknownAcquisitionCount, tone: 'muted' },
      { key: 'missingValuationCount', label: '未填估值', count: report.alerts.missingValuationCount, tone: 'muted' },
      { key: 'missingSoldRecoveryCount', label: '已售未填回收', count: report.alerts.missingSoldRecoveryCount, tone: 'warn' },
      { key: 'uncategorizedCount', label: '未分类', count: report.alerts.uncategorizedCount, tone: 'muted' },
    ].filter(alert => alert.count > 0);

    const rankList = report.rankings.topDailyCost.slice(0, 5).map(entry => ({
      itemId: entry.itemId,
      name: entry.name,
      emoji: entry.emoji,
      dailyText: V.money(entry.amountMinor, true),
      daysText: entry.holdingDays ? `${entry.holdingDays} 天` : '',
    }));

    const holdList = report.rankings.topHoldingTime.slice(0, 5).map(entry => ({
      itemId: entry.itemId,
      name: entry.name,
      emoji: entry.emoji,
      daysText: V.daysText(entry.holdingDays),
    }));

    this.setData({
      years: report.availableYears,
      range: report.range,
      snapshot: {
        totalItemCount: snapshot.totalItemCount,
        activeCount: snapshot.activeCount,
        endedCount: snapshot.endedCount,
        addedCount: snapshot.addedCount,
        endedCountInPeriod: snapshot.endedCountInPeriod,
        totalExpenseText: V.money(snapshot.totalExpenseMinor, true),
        totalIncomeText: V.money(snapshot.totalIncomeMinor, true),
        netCostText: V.money(snapshot.netCostMinor, true),
        periodDailyText: V.money(snapshot.periodDailyExpenseMinor, true),
        currentDailyText: V.money(snapshot.currentDailyCostMinor, true),
        currentExpenseText: V.money(snapshot.currentExpenseMinor, true),
        valuationText: snapshot.valuationCount ? V.money(snapshot.currentValuationMinor, true) : '—',
        valuationCount: snapshot.valuationCount,
      },
      statuses: report.statuses.filter(s => s.count > 0).map(s => ({
        key: s.key, label: s.label, count: s.count, colorStyle: `background:${s.color}`,
      })),
      cashFlow,
      categories,
      expenseKinds,
      lifecycle: report.lifecycle,
      holdingBars,
      alerts,
      rankList,
      holdList,
      hasData: snapshot.totalItemCount > 0,
    });
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'stats') return;
    const paths = { items: '/pages/inventory/inventory', settings: '/pages/settings/settings' };
    wx.reLaunch({ url: paths[tab] || paths.items });
  },

  openItem(e) {
    wx.navigateTo({ url: `/pages/item/item?id=${e.currentTarget.dataset.id}` });
  },
});
