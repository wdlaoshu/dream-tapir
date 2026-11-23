const store = require('../../utils/store.js');
const ui = require('../../utils/ui.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    counts: { identities: 0, accounts: 0, tokens: 0 },
    json: '',
    jsonPreview: '',
    importText: '',
    mode: 'merge',
    canImport: false,
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
    const payload = store.exportPayload();
    const json = JSON.stringify(payload, null, 2);
    this.setData({
      theme: ui.themeClass(prefs),
      counts: {
        identities: (state.identities || []).length,
        accounts: (state.accounts || []).length,
        tokens: (state.tokens || []).length,
      },
      json,
      jsonPreview: json.slice(0, 240) + (json.length > 240 ? '\n…' : ''),
    });
    ui.applyNav(prefs);
  },

  onCopy() {
    wx.setClipboardData({
      data: this.data.json,
      success: () => wx.showToast({ title: '备份已复制到剪贴板', icon: 'none' }),
      fail: () => ui.toast('复制失败'),
    });
  },

  onReadClipboard() {
    wx.getClipboardData({
      success: res => this.setImport(res.data || ''),
      fail: () => ui.toast('读不到剪贴板'),
    });
  },

  onImportInput(e) { this.setImport(e.detail.value); },

  setImport(text) {
    this.setData({ importText: text, canImport: !!this.parse(text) });
  },

  /* 返回解析后的数据，格式不对返回 null */
  parse(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    const ok = ['identities', 'accounts', 'tokens'].some(k => Array.isArray(data[k]));
    return ok ? data : null;
  },

  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onImport() {
    const data = this.parse(this.data.importText);
    if (!data) { ui.toast('这段内容不是 Toki 的备份'); return; }
    const n = (a) => (Array.isArray(a) ? a.length : 0);
    const tip = this.data.mode === 'replace'
      ? '会覆盖这台设备上的全部数据。'
      : `导入 ${n(data.identities)} 个身份、${n(data.accounts)} 个网站、${n(data.tokens)} 条密钥，同 id 的记录按较新的保留。`;
    ui.confirm('导入备份', tip, '导入').then(ok => {
      if (!ok) return;
      store.importState(data, this.data.mode).then(() => {
        ui.toast('导入完成');
        this.setData({ importText: '', canImport: false }, () => this.refresh());
      }).catch(() => ui.toast('导入失败'));
    });
  },

  onBack() { ui.back(); },
});
