const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const ui = require('../../utils/ui.js');

const app = getApp();

const IN = { email: ['地址', 'name@example.com'], phone: ['号码', '+86 138 0000 0000'], login: ['', ''] };

Page({
  data: {
    theme: 'theme-auto',
    isNew: true,
    id: '',
    type: 'email',
    provider: 'wechat',
    value: '',
    label: '',
    notes: '',
    color: '#0a84ff',
    esim: false,
    via: '',
    colors: [],
    viaOptions: [],
    types: [],
    login: false,
    fieldLabel: '地址',
    placeholder: 'name@example.com',
    title: '新身份',
    deleteText: '',
  },

  onLoad(query) {
    app.ready().then(() => this.init(query || {}));
  },

  init(query) {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const existing = query.id ? (state.identities || []).find(i => i.id === query.id) : null;
    const type = existing ? existing.type : (M.KINDS.includes(query.type) ? query.type : 'email');
    const provider = existing && existing.type === 'login' ? M.provOf(existing) : 'wechat';
    const color = existing ? existing.color : (type === 'login' ? M.LOGIN[provider].color : M.COLORS[0]);

    this.setData({
      theme: ui.themeClass(prefs),
      isNew: !existing,
      id: existing ? existing.id : '',
      type,
      provider,
      value: existing ? existing.value : '',
      label: existing ? existing.label || '' : '',
      notes: existing ? existing.notes || '' : '',
      color,
      esim: existing ? M.isESim(existing) : false,
      via: existing ? existing.via || '' : '',
      title: existing ? '编辑身份' : '新身份',
      deleteText: existing ? `删除这个${M.typeName(existing)}` : '',
    }, () => this.paint());
    ui.applyNav(prefs);
  },

  paint() {
    const { type, provider } = this.data;
    const login = type === 'login';
    const field = login ? [M.LOGIN[provider].field, M.LOGIN[provider].ph] : IN[type];
    const palette = login
      ? [M.LOGIN.wechat.color, M.LOGIN.apple.color, ...M.COLORS]
      : M.COLORS.slice();
    const color = palette.indexOf(this.data.color) < 0 ? palette[0] : this.data.color;

    const state = store.getState();
    const viaOptions = (state.identities || [])
      .filter(i => (i.type === 'email' || i.type === 'phone') && i.id !== this.data.id)
      .map(i => ({
        id: i.id,
        label: i.label || M.display(i, false),
        sub: M.typeName(i) + (i.label ? ' · ' + M.display(i, false) : ''),
        color: i.color,
        on: i.id === this.data.via,
      }));

    this.setData({
      login,
      fieldLabel: field[0],
      placeholder: field[1],
      colors: palette.map(c => ({ c, on: c === color })),
      viaOptions: [{ id: '', label: '不绑定', sub: '', color: '', on: !this.data.via }].concat(viaOptions),
      type: type,
    });
  },

  onType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.type) return;
    const color = type === 'login' ? M.LOGIN[this.data.provider].color : M.COLORS[0];
    this.setData({ type, color }, () => this.paint());
  },

  onProvider(e) {
    const provider = e.currentTarget.dataset.provider;
    this.setData({ provider, color: M.LOGIN[provider].color }, () => this.paint());
  },

  onColor(e) {
    this.setData({ color: e.currentTarget.dataset.color }, () => this.paint());
  },

  onValue(e) { this.setData({ value: e.detail.value }); },
  onLabel(e) { this.setData({ label: e.detail.value }); },
  onNotes(e) { this.setData({ notes: e.detail.value }); },

  onEsim(e) { this.setData({ esim: !!e.detail.value }); },

  onVia(e) {
    this.setData({ via: e.currentTarget.dataset.id }, () => this.paint());
  },

  onSave() {
    const state = store.getState();
    const value = String(this.data.value || '').trim();
    const isMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const digits = v => v.replace(/\D/g, '').length >= 5;
    const { type, provider } = this.data;

    const ok = type === 'email' ? isMail(value)
      : type === 'phone' ? digits(value)
      : provider === 'wechat' ? value.length >= 1
      : (isMail(value) || digits(value));
    if (!ok) {
      ui.toast(type === 'email' ? '邮箱地址格式不对'
        : type === 'phone' ? '手机号至少要 5 位数字'
        : provider === 'wechat' ? '填一下微信号' : 'Apple ID 是邮箱或手机号');
      return;
    }

    const dup = (state.identities || []).some(x =>
      x.id !== this.data.id && x.type === type && (type !== 'login' || M.provOf(x) === provider) &&
      String(x.value || '').toLowerCase() === value.toLowerCase());
    if (dup) { ui.toast('这个身份已经添加过了'); return; }

    const data = {
      type,
      value,
      label: String(this.data.label || '').trim(),
      color: this.data.color,
      notes: String(this.data.notes || '').trim(),
    };
    if (type === 'phone' && this.data.esim) data.esim = true;
    if (type === 'login') {
      data.provider = provider;
      if (this.data.via && M.idById(state, this.data.via)) data.via = this.data.via;
    }

    let id = this.data.id;
    const existing = id ? (state.identities || []).find(i => i.id === id) : null;
    if (existing) {
      Object.assign(existing, data);
      if (!data.esim) delete existing.esim;
      if (!data.provider) delete existing.provider;
      if (!data.via) delete existing.via;
    } else {
      id = M.uid();
      state.identities.push(Object.assign({ id }, data));
    }

    const deck = state.identities.filter(i => i.type === type);
    const active = Math.max(0, deck.findIndex(i => i.id === id));

    store.save().then(() => app.setPrefs({ kind: type, active })).then(() => {
      ui.toast(existing ? '已保存' : '已添加');
      ui.back();
    });
  },

  onDelete() {
    if (!this.data.id) return;
    ui.confirm('删除身份', '它关联过的网站会保留，但不再显示这条身份。', '删除').then(ok => {
      if (!ok) return;
      const state = store.getState();
      state.identities = (state.identities || []).filter(i => i.id !== this.data.id);
      (state.accounts || []).forEach(a => {
        a.identityIds = M.identityIdsOf(a).filter(id => id !== this.data.id);
      });
      (state.identities || []).forEach(i => { if (i.via === this.data.id) delete i.via; });
      store.save().then(() => {
        ui.toast('已删除');
        ui.back();
      });
    });
  },

  onBack() { ui.back(); },
});
