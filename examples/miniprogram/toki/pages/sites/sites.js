const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    active: 'sites',
    theme: 'theme-auto',
    cat: '全部',
    filters: [],
    groups: [],
    empty: false,
    total: 0,
  },

  onLoad() {
    app.ready().then(() => this.refresh());
  },

  onShow() {
    app.ready().then(() => this.refresh());
  },

  refresh() {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const vm = V.buildSites(state, prefs, this.data.cat);
    this.setData({
      theme: ui.themeClass(prefs),
      cat: (vm.filters.find(f => f.on) || { key: '全部' }).key,
      filters: vm.filters,
      groups: vm.groups,
      empty: !!vm.empty,
      total: vm.total || 0,
    });
    ui.applyNav(prefs);
  },

  onFilter(e) {
    this.setData({ cat: e.currentTarget.dataset.key }, () => this.refresh());
  },

  onItem(e) {
    ui.go(`/pages/account-edit/account-edit?id=${e.currentTarget.dataset.id}`);
  },

  onAdd() {
    ui.go('/pages/account-edit/account-edit');
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'sites') return;
    ui.goTab(`/pages/${tab}/${tab}`);
  },
});
