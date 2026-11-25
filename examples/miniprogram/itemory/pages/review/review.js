/* Itemory 小程序 · 回顾
   对应桌面版 ReviewPage：按购入时间倒着（或顺着）翻一遍物品，
   年份筛选、顺序切换，跨年处打一个年份分组头。 */

const store = require('../../utils/store.js');
const V = require('../../utils/view.js');

const app = getApp();

const TAB_PATHS = {
  items: '/pages/inventory/inventory',
  review: '/pages/review/review',
  stats: '/pages/statistics/statistics',
  settings: '/pages/settings/settings',
};

Page({
  data: {
    active: 'review',
    theme: 'theme-auto',
    year: 'all',
    direction: 'desc',
    years: [],
    rows: [],
    totalCount: 0,
    isEmpty: false,
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({ theme: `theme-${prefs.theme || 'auto'}` });
    this.refresh();
  },

  refresh() {
    const state = store.getState();
    if (!state) return;
    const result = V.buildReview(state, { year: this.data.year, direction: this.data.direction });
    this.setData({
      years: result.years,
      rows: result.rows,
      totalCount: result.totalCount,
      isEmpty: state.items.length === 0,
    });
  },

  pickYear(e) {
    const year = e.currentTarget.dataset.year;
    this.setData({ year });
    this.refresh();
  },

  toggleDirection() {
    this.setData({ direction: this.data.direction === 'desc' ? 'asc' : 'desc' });
    this.refresh();
  },

  openItem(e) {
    wx.navigateTo({ url: `/pages/item/item?id=${e.currentTarget.dataset.id}` });
  },

  addItem() {
    wx.navigateTo({ url: '/pages/item-edit/item-edit' });
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.active) return;
    wx.reLaunch({ url: TAB_PATHS[tab] || TAB_PATHS.items });
  },
});
