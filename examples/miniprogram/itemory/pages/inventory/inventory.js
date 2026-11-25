/* Itemory 小程序 · 物品列表
   对应桌面版 InventoryPage：搜索、分类筛选、状态筛选、排序、两种布局（置物架 / 时间线）。 */

const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const M = require('../../utils/model.js');

const app = getApp();

const TAB_PATHS = {
  items: '/pages/inventory/inventory',
  review: '/pages/review/review',
  stats: '/pages/statistics/statistics',
  settings: '/pages/settings/settings',
};

Page({
  data: {
    active: 'items',
    theme: 'theme-auto',
    layout: 'shelf',
    keyword: '',
    categoryFilter: 'all',
    statusFilter: 'all',
    sortField: 'created',
    sortDirection: 'desc',
    categories: [],
    statusOptions: [],
    sortOptions: [],
    cards: [],
    overview: { itemCount: 0, activeCount: 0, totalExpenseText: '—', totalDailyText: '—' },
    isEmpty: true,
    filterOpen: false,
    sortTitle: '添加时间',
  },

  onLoad() {
    this.setData({
      statusOptions: [{ key: 'all', label: '全部' }].concat(
        M.EFFECTIVE_ITEM_STATUSES.map(key => ({ key, label: M.ITEM_STATUS_META[key].label }))
      ),
      sortOptions: Object.keys(V.SORT_FIELDS).map(key => ({ key, label: V.SORT_FIELDS[key] })),
    });
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      layout: prefs.layout || 'shelf',
      categoryFilter: prefs.categoryFilter || 'all',
      statusFilter: prefs.statusFilter || 'all',
      sortField: prefs.sortField || 'created',
      sortDirection: prefs.sortDirection || 'desc',
    });
    this.refresh();
  },

  refresh() {
    const state = store.getState();
    if (!state) return;
    const categories = store.categoriesSorted().map(c => ({
      id: c.id,
      name: c.name,
      emoji: M.categoryEmoji(c),
      isSystem: Boolean(c.isSystem),
    }));
    const cards = V.buildCards(state, {
      categoryId: this.data.categoryFilter,
      statusFilter: this.data.statusFilter,
      keyword: this.data.keyword,
      sortField: this.data.sortField,
      sortDirection: this.data.sortDirection,
    });
    const overview = V.buildOverview(state);
    const sortTitle = V.SORT_FIELDS[this.data.sortField] || '添加时间';
    this.setData({
      categories,
      cards,
      overview,
      isEmpty: store.getState().items.length === 0,
      sortTitle,
    });
  },

  /* ---------- 导航 ---------- */
  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.active) return;
    wx.reLaunch({ url: TAB_PATHS[tab] || TAB_PATHS.items });
  },

  openItem(e) {
    wx.navigateTo({ url: `/pages/item/item?id=${e.currentTarget.dataset.id}` });
  },

  addItem() {
    wx.navigateTo({ url: '/pages/item-edit/item-edit' });
  },

  /* ---------- 搜索 / 布局 ---------- */
  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' });
    this.refresh();
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.refresh();
  },

  async toggleLayout() {
    const next = this.data.layout === 'shelf' ? 'timeline' : 'shelf';
    this.setData({ layout: next });
    await app.setPrefs({ layout: next });
  },

  /* ---------- 筛选面板 ---------- */
  openFilter() { this.setData({ filterOpen: true }); },
  closeFilter() { this.setData({ filterOpen: false }); },

  async pickCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ categoryFilter: id });
    this.refresh();
    await app.setPrefs({ categoryFilter: id });
  },

  async pickStatus(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ statusFilter: key });
    this.refresh();
    await app.setPrefs({ statusFilter: key });
  },

  async pickSort(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.sortField) {
      const direction = this.data.sortDirection === 'desc' ? 'asc' : 'desc';
      this.setData({ sortDirection: direction });
      this.refresh();
      await app.setPrefs({ sortField: key, sortDirection: direction });
      return;
    }
    this.setData({ sortField: key });
    this.refresh();
    await app.setPrefs({ sortField: key });
  },

  resetFilter() {
    this.setData({ categoryFilter: 'all', statusFilter: 'all', sortField: 'created', sortDirection: 'desc' });
    this.refresh();
    app.setPrefs({ categoryFilter: 'all', statusFilter: 'all', sortField: 'created', sortDirection: 'desc' });
  },
});
