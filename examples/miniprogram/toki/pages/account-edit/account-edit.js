const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const ui = require('../../utils/ui.js');
const V = require('../../utils/view.js');
const { PRESETS } = require('../../data/presets.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    isNew: true,
    id: '',
    identity: '',
    name: '',
    handle: '',
    domain: '',
    category: '其他',
    notes: '',
    title: '新网站或 App',
    previewTile: { bgStyle: 'background:#8e8e93;', letter: '?', iconSrc: '', favClass: '', glyph: '', glyphClass: '', glyphStyle: '' },
    iconData: '',
    iconFile: '',
    iconMenuOpen: false,
    picks: [],
    cats: M.CATS,
    suggestions: [],
    deleteText: '',
  },

  onLoad(query) {
    app.ready().then(() => this.init(query || {}));
  },

  init(query) {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const existing = query.id ? (state.accounts || []).find(a => a.id === query.id) : null;
    const presetIdentity = query.identity ? M.idById(state, query.identity) : null;

    const selected = existing ? M.identityIdsOf(existing) : (presetIdentity ? [presetIdentity.id] : []);

    this.setData({
      theme: ui.themeClass(prefs),
      isNew: !existing,
      id: existing ? existing.id : '',
      identity: presetIdentity ? presetIdentity.id : '',
      name: existing ? existing.name : '',
      handle: existing ? existing.handle || '' : '',
      domain: existing ? existing.domain || '' : '',
      category: existing ? existing.category || '其他' : '其他',
      notes: existing ? existing.notes || '' : '',
      iconData: existing && typeof existing.icon === 'string' && /^data:image\//.test(existing.icon) ? existing.icon : '',
      iconFile: existing && existing.iconFile ? existing.iconFile : '',
      title: existing ? '编辑网站或 App' : '新网站或 App',
      deleteText: existing ? `删除 ${existing.name}` : '',
    }, () => {
      this.paintPicks(selected);
      this.paintPreview();
      this.suggest();
    });
    ui.applyNav(prefs);
  },

  paintPicks(selected) {
    const state = store.getState();
    const sel = selected || this.selectedIds || [];
    this.selectedIds = sel;
    const base = (state.identities || []).filter(i => i.type === 'email' || i.type === 'phone');
    const logins = (state.identities || []).filter(i => i.type === 'login');
    const cell = (i, group) => ({
      id: i.id,
      group,
      label: i.type === 'login'
        ? (i.label ? `${M.LOGIN[M.provOf(i)].name} · ${i.label}` : M.LOGIN[M.provOf(i)].name)
        : (i.label || M.display(i, false)),
      sub: (i.type === 'login' || i.label) ? M.display(i, false) : '',
      color: i.color,
      on: sel.indexOf(i.id) >= 0,
    });
    this.setData({
      picks: base.map(i => cell(i, 'base')).concat(logins.map(i => cell(i, 'login'))),
      noIdentities: base.length + logins.length === 0,
    });
  },

  paintPreview() {
    const name = String(this.data.name || '').trim();
    const domain = M.cleanDomain(this.data.domain);
    const tile = V.platformTile({ name, domain, icon: this.data.iconData, iconFile: this.data.iconFile });
    this.setData({ previewTile: tile });
  },

  suggest() {
    const q = String(this.data.name || '').trim().toLowerCase();
    if (!q) { this.setData({ suggestions: [] }); return; }
    const exact = PRESETS.find(p => p[0].toLowerCase() === q);
    const list = exact
      ? []
      : PRESETS.filter(p => p[0].toLowerCase().indexOf(q) >= 0 || p[1].indexOf(q) >= 0).slice(0, 6);
    this.setData({
      suggestions: list.map(p => ({
        name: p[0],
        domain: p[1],
        category: p[2],
        color: p[3],
        tile: V.platformTile({ name: p[0], domain: p[1] }),
      })),
    });
  },

  onName(e) {
    this.setData({ name: e.detail.value }, () => {
      this.applyExact();
      this.paintPreview();
      this.suggest();
    });
  },

  /* 名字正好是一个内置平台时，顺手把网址和分类补上（网址已经填了就不动） */
  applyExact() {
    const q = String(this.data.name || '').trim().toLowerCase();
    if (!q) return;
    const exact = PRESETS.find(p => p[0].toLowerCase() === q);
    if (exact && !M.cleanDomain(this.data.domain)) {
      this.setData({ domain: exact[1], category: exact[2] });
    }
  },

  onHandle(e) { this.setData({ handle: e.detail.value }); },

  onDomain(e) {
    this.setData({ domain: e.detail.value }, () => this.paintPreview());
  },

  onCategory(e) { this.setData({ category: e.detail.value }); },

  onCatChip(e) { this.setData({ category: e.currentTarget.dataset.cat }); },

  onNotes(e) { this.setData({ notes: e.detail.value }); },

  onSuggestion(e) {
    const i = Number(e.currentTarget.dataset.i);
    const s = this.data.suggestions[i];
    if (!s) return;
    this.setData({ name: s.name, domain: s.domain, category: s.category, suggestions: [] }, () => this.paintPreview());
  },

  onPick(e) {
    const id = e.currentTarget.dataset.id;
    const sel = (this.selectedIds || []).slice();
    const i = sel.indexOf(id);
    if (i >= 0) sel.splice(i, 1); else sel.push(id);
    this.paintPicks(sel);
  },

  toggleIconMenu() {
    this.setData({ iconMenuOpen: !this.data.iconMenuOpen });
  },

  /* 自定义图标：选图 → 存进小程序的用户目录，路径跟着记录走 */
  onPickIcon() {
    this.setData({ iconMenuOpen: false });
    if (typeof wx.chooseImage !== 'function') { ui.toast('当前容器不支持选图'); return; }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const temp = (res.tempFilePaths || [])[0];
        if (!temp) return;
        const fs = typeof wx.getFileSystemManager === 'function' ? wx.getFileSystemManager() : null;
        if (!fs || typeof fs.readFile !== 'function') { ui.toast('读不了这张图片'); return; }
        fs.readFile({
          filePath: temp,
          encoding: 'base64',
          success: r => {
            const mime = /\.png$/i.test(temp) ? 'png' : 'jpeg';
            const data = `data:image/${mime};base64,${r.data}`;
            /* 跟网页版一样，超过 400KB 的图标不存，免得拖垮同步 */
            if (data.length > 400000) { ui.toast('图片太大，换一张小一点的'); return; }
            this.setData({ iconData: data, iconFile: '' }, () => this.paintPreview());
          },
          fail: () => ui.toast('读不了这张图片'),
        });
      },
      fail: () => {},
    });
  },

  onResetIcon() {
    this.setData({ iconMenuOpen: false, iconFile: '', iconData: '' }, () => this.paintPreview());
  },

  onSave() {
    const name = String(this.data.name || '').trim();
    if (!name) { ui.toast('填一下名称'); return; }
    const state = store.getState();
    const data = {
      name,
      handle: String(this.data.handle || '').trim(),
      domain: M.cleanDomain(this.data.domain),
      category: String(this.data.category || '').trim() || '其他',
      identityIds: (this.selectedIds || []).slice(),
      notes: String(this.data.notes || '').trim(),
    };
    if (this.data.iconFile) data.iconFile = this.data.iconFile;
    if (this.data.iconData) data.icon = this.data.iconData;
    const existing = this.data.id ? (state.accounts || []).find(a => a.id === this.data.id) : null;
    if (existing) {
      Object.assign(existing, data);
      if (!data.iconFile) delete existing.iconFile;
    } else state.accounts.push(Object.assign({ id: M.uid(), createdAt: Date.now() }, data));

    store.save().then(() => {
      ui.toast(existing ? '已保存' : `已添加 ${name}`);
      ui.back();
    });
  },

  onDelete() {
    if (!this.data.id) return;
    const state = store.getState();
    const acc = (state.accounts || []).find(a => a.id === this.data.id);
    if (!acc) return;
    ui.confirm('删除网站', `「${acc.name}」会从列表里移除，关联的密钥不再指向它。`, '删除').then(ok => {
      if (!ok) return;
      state.accounts = (state.accounts || []).filter(a => a.id !== this.data.id);
      (state.tokens || []).forEach(t => { if (t.accountId === this.data.id) t.accountId = ''; });
      store.save().then(() => {
        ui.toast('已删除');
        ui.back();
      });
    });
  },

  onBack() { ui.back(); },
});
