const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const ui = require('../../utils/ui.js');
const { TOKEN_PRESETS } = require('../../data/presets.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    isNew: true,
    id: '',
    title: '新密钥',
    platform: '',
    name: '',
    domain: '',
    category: '其他',
    value: '',
    notes: '',
    accountId: '',
    color: '#0a84ff',
    expiryMode: 'never',
    expiryDate: '',
    cats: M.TOKEN_CATS,
    accounts: [],
    accountName: '',
    platformOpen: false,
    platformQuery: '',
    platformList: [],
    previewLetter: 'K',
    previewBg: '#0a84ff',
    maskPreview: '••••••••',
    deleteText: '',
  },

  onLoad(query) {
    app.ready().then(() => this.init(query || {}));
  },

  init(query) {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const existing = query.id ? (state.tokens || []).find(t => t.id === query.id) : null;
    const base = existing || {};
    const v = M.tokenVisual(base);

    this.setData({
      theme: ui.themeClass(prefs),
      isNew: !existing,
      id: existing ? existing.id : '',
      title: existing ? '编辑密钥' : '新密钥',
      platform: M.platformOfToken(base) || '',
      name: base.name || '',
      domain: base.domain || v.domain || '',
      category: base.category || v.category || '其他',
      value: base.value || '',
      notes: base.notes || '',
      accountId: base.accountId || '',
      color: base.color || v.color || '#0a84ff',
      expiryMode: base.expiresAt ? 'date' : 'never',
      expiryDate: base.expiresAt ? M.dateText(base.expiresAt) : M.dateText(Date.now() + 90 * M.DAY),
      deleteText: existing ? '删除这条密钥' : '',
    }, () => {
      this.paintPreview();
      this.paintAccounts();
    });
    ui.applyNav(prefs);
  },

  paintPreview() {
    const name = this.data.platform || this.data.name || '新密钥';
    this.setData({
      previewLetter: String(name).slice(0, 1).toUpperCase(),
      previewBg: this.data.color || '#0a84ff',
      maskPreview: M.maskValue(this.data.value),
    });
  },

  paintAccounts() {
    const state = store.getState();
    const list = M.platformAccountsFor(state, {
      platform: this.data.platform,
      domain: this.data.domain,
      name: this.data.name,
    });
    const sel = this.data.accountId ? M.accById(state, this.data.accountId) : null;
    if (sel && !list.some(a => a.id === sel.id)) list.push(sel);
    this.setData({
      accounts: list.map(a => ({
        id: a.id,
        name: a.name + (a.handle ? ' · ' + a.handle : ''),
        on: a.id === this.data.accountId,
      })),
      accountName: sel ? (sel.name + (sel.handle ? ' · ' + sel.handle : '')) : '',
    });
  },

  /* ---------- 平台选择 ---------- */
  openPlatform() {
    this.setData({ platformOpen: true, platformQuery: '' }, () => this.filterPlatform());
  },
  closePlatform() { this.setData({ platformOpen: false }); },

  onPlatformQuery(e) {
    this.setData({ platformQuery: e.detail.value }, () => this.filterPlatform());
  },

  filterPlatform() {
    const q = String(this.data.platformQuery || '').trim().toLowerCase();
    const list = TOKEN_PRESETS
      .filter(p => !q || p[0].toLowerCase().indexOf(q) >= 0 || p[1].indexOf(q) >= 0 || p[2].indexOf(q) >= 0)
      .map(p => ({ name: p[0], domain: p[1], category: p[2], color: p[3], letter: p[0].slice(0, 1).toUpperCase() }));
    this.setData({ platformList: list });
  },

  onPickPlatform(e) {
    const i = Number(e.currentTarget.dataset.i);
    const p = this.data.platformList[i];
    if (!p) return;
    this.setData({
      platform: p.name,
      domain: p.domain,
      category: p.category,
      color: p.color,
      platformOpen: false,
    }, () => { this.paintPreview(); this.paintAccounts(); });
  },

  onUseCustom() {
    this.setData({ platformOpen: false, platform: this.data.platformQuery.trim() || this.data.platform }, () => {
      this.paintPreview();
      this.paintAccounts();
    });
  },

  /* ---------- 字段 ---------- */
  onName(e) { this.setData({ name: e.detail.value }, () => this.paintPreview()); },
  onDomain(e) { this.setData({ domain: e.detail.value }, () => this.paintAccounts()); },
  onCategory(e) { this.setData({ category: e.detail.value }); },
  onCatChip(e) { this.setData({ category: e.currentTarget.dataset.cat }); },
  onValue(e) { this.setData({ value: e.detail.value }, () => this.paintPreview()); },
  onNotes(e) { this.setData({ notes: e.detail.value }); },

  onExpiryMode(e) { this.setData({ expiryMode: e.currentTarget.dataset.mode }); },

  onExpiryDate(e) { this.setData({ expiryDate: e.detail.value }); },

  onPickAccount(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ accountId: this.data.accountId === id ? '' : id }, () => this.paintAccounts());
  },

  /* ---------- 保存 / 删除 ---------- */
  onSave() {
    const value = String(this.data.value || '').trim();
    if (!value) { ui.toast('填一下密钥内容'); return; }
    const state = store.getState();
    const now = Date.now();
    const data = {
      platform: String(this.data.platform || '').trim(),
      name: String(this.data.name || '').trim() || (this.data.platform ? this.data.platform + ' 密钥' : '未命名密钥'),
      domain: M.cleanDomain(this.data.domain),
      category: String(this.data.category || '').trim() || '其他',
      color: this.data.color || '#0a84ff',
      value,
      notes: String(this.data.notes || '').trim(),
      accountId: this.data.accountId || '',
      expiresAt: this.data.expiryMode === 'date' && this.data.expiryDate
        ? new Date(this.data.expiryDate + 'T23:59:59').getTime()
        : 0,
      updatedAt: now,
    };

    const existing = this.data.id ? (state.tokens || []).find(t => t.id === this.data.id) : null;
    if (existing) Object.assign(existing, data);
    else state.tokens.push(Object.assign({ id: M.uid(), createdAt: now }, data));

    store.save().then(() => {
      ui.toast(existing ? '已保存' : '已添加');
      ui.back();
    });
  },

  onDelete() {
    if (!this.data.id) return;
    ui.confirm('删除密钥', '这条密钥会从本机删除，无法恢复。', '删除').then(ok => {
      if (!ok) return;
      const state = store.getState();
      state.tokens = (state.tokens || []).filter(t => t.id !== this.data.id);
      store.save().then(() => {
        ui.toast('已删除');
        ui.back();
      });
    });
  },

  onBack() { ui.back(); },
});
