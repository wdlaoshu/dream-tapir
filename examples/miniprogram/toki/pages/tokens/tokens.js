const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const M = require('../../utils/model.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    active: 'tokens',
    theme: 'theme-auto',
    cat: '全部',
    filters: [],
    list: [],
    summary: '',
    empty: false,
    noneInCat: false,
    revealed: [],
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
    const vm = V.buildTokens(state, prefs, this.data.cat, this.data.revealed);
    this.setData({
      theme: ui.themeClass(prefs),
      cat: (vm.filters.find(f => f.on) || { key: '全部' }).key,
      filters: vm.filters,
      list: vm.list,
      summary: vm.summary,
      empty: vm.empty,
      noneInCat: vm.noneInCat,
    });
    ui.applyNav(prefs);
  },

  onFilter(e) {
    this.setData({ cat: e.currentTarget.dataset.key }, () => this.refresh());
  },

  onReveal(e) {
    const id = e.currentTarget.dataset.id;
    const revealed = this.data.revealed.slice();
    const i = revealed.indexOf(id);
    if (i >= 0) revealed.splice(i, 1);
    else revealed.push(id);
    this.setData({ revealed }, () => this.refresh());
  },

  onCopy(e) {
    const id = e.currentTarget.dataset.id;
    const token = (store.getState().tokens || []).find(t => t.id === id);
    if (!token || !token.value) { ui.toast('这条密钥没有内容'); return; }
    wx.setClipboardData({
      data: token.value,
      success: () => { wx.showToast({ title: '已复制密钥', icon: 'none' }); },
      fail: () => ui.toast('复制失败'),
    });
  },

  onEdit(e) {
    ui.go(`/pages/token-edit/token-edit?id=${e.currentTarget.dataset.id}`);
  },

  onAdd() {
    ui.go('/pages/token-edit/token-edit');
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'tokens') return;
    ui.goTab(`/pages/${tab}/${tab}`);
  },
});
