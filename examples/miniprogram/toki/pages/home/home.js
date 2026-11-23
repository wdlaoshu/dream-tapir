const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const M = require('../../utils/model.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    active: 'home',
    theme: 'theme-auto',
    privacy: false,
    kind: 'email',
    kinds: [],
    cards: [],
    cardIndex: 0,
    hasIdentities: false,
    summary: '',
    gridTitle: '',
    gridSub: '',
    grid: [],
    moreCount: 0,
    empty: true,
    addOpen: false,
    menuOpen: false,
    themeText: '跟随系统',
    privacyText: '隐藏号码',
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
    const vm = V.buildHome(state, prefs);
    this.setData({
      theme: ui.themeClass(prefs),
      privacy: !!prefs.privacy,
      kind: vm.kind,
      kinds: vm.kinds,
      cards: vm.cards,
      cardIndex: vm.active,
      hasIdentities: vm.hasIdentities,
      summary: vm.summary,
      gridTitle: vm.gridTitle,
      gridSub: vm.gridSub,
      grid: vm.grid,
      moreCount: vm.moreCount,
      empty: vm.empty,
      themeText: { auto: '跟随系统', light: '浅色', dark: '深色' }[prefs.theme || 'auto'],
      privacyText: prefs.privacy ? '显示完整号码' : '隐藏号码',
    });
    ui.applyNav(prefs);
  },

  /* ---------- 导航 ---------- */
  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'home') return;
    ui.goTab(`/pages/${tab}/${tab}`);
  },

  /* ---------- 卡包 ---------- */
  onKind(e) {
    const kind = e.currentTarget.dataset.kind;
    if (kind === this.data.kind) return;
    app.setPrefs({ kind, active: 0 }).then(() => this.refresh());
  },

  onCardChange(e) {
    const idx = e.detail.current;
    app.setPrefs({ active: idx }).then(() => {
      const prefs = app.globalData.prefs;
      const vm = V.buildHome(store.getState(), prefs);
      this.setData({ cardIndex: idx, gridTitle: vm.gridTitle, gridSub: vm.gridSub, grid: vm.grid, moreCount: vm.moreCount });
    });
  },

  onCard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    ui.go(`/pages/identity-edit/identity-edit?id=${id}`);
  },

  onGridItem(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    ui.go(`/pages/account-edit/account-edit?id=${id}`);
  },

  onGridAdd() {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const deck = (state.identities || []).filter(i => i.type === prefs.kind);
    const cur = deck[Math.min(prefs.active || 0, Math.max(0, deck.length - 1))];
    ui.go(`/pages/account-edit/account-edit${cur ? `?identity=${cur.id}` : ''}`);
  },

  onMore() {
    ui.goTab('/pages/sites/sites');
  },

  /* ---------- 添加 / 菜单 ---------- */
  openAdd() { this.setData({ addOpen: true, menuOpen: false }); },
  closeAdd() { this.setData({ addOpen: false }); },
  openMenu() { this.setData({ menuOpen: true, addOpen: false }); },
  closeMenu() { this.setData({ menuOpen: false }); },

  onAddIdentity() {
    this.setData({ addOpen: false });
    ui.go(`/pages/identity-edit/identity-edit?type=${this.data.kind}`);
  },
  onAddAccount() {
    this.setData({ addOpen: false });
    ui.go('/pages/account-edit/account-edit');
  },
  onAddToken() {
    this.setData({ addOpen: false });
    ui.go('/pages/token-edit/token-edit');
  },

  onTogglePrivacy() {
    this.setData({ menuOpen: false });
    const prefs = app.globalData.prefs || {};
    app.setPrefs({ privacy: !prefs.privacy }).then(() => this.refresh());
  },

  onCycleTheme() {
    this.setData({ menuOpen: false });
    const order = ['auto', 'light', 'dark'];
    const prefs = app.globalData.prefs || {};
    const next = order[(order.indexOf(prefs.theme || 'auto') + 1) % order.length];
    app.setPrefs({ theme: next }).then(() => this.refresh());
  },

  onBackup() {
    this.setData({ menuOpen: false });
    ui.go('/pages/backup/backup');
  },

  onDemo() {
    this.setData({ menuOpen: false });
    ui.confirm('载入示例数据', '会用示例数据覆盖当前的全部数据，先导出备份更安全。', '载入').then(ok => {
      if (!ok) return;
      store.replaceState(M.demo()).then(() => {
        ui.toast('已载入示例数据');
        this.refresh();
      });
    });
  },

  onWipe() {
    this.setData({ menuOpen: false });
    ui.confirm('清空全部数据', '身份、网站与密钥都会删除，且无法恢复。', '清空').then(ok => {
      if (!ok) return;
      store.clearAll().then(() => {
        ui.toast('已清空');
        this.refresh();
      });
    });
  },

  onFirstAdd() {
    ui.go('/pages/identity-edit/identity-edit?type=email');
  },
});
