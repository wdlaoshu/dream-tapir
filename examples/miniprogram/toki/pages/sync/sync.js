const Sync = require('../../utils/sync.js');
const ui = require('../../utils/ui.js');

const app = getApp();

const PROVIDERS = {
  gitee: {
    title: 'Gitee 私人令牌',
    ph: '32 位私人令牌',
    ok: t => /^[0-9a-f]{32}$/i.test(t),
    hint: '只需要勾选 gists 权限。国内网络不用代理也能同步。',
  },
  github: {
    title: 'GitHub 令牌',
    ph: 'ghp_… 或 github_pat_…',
    ok: t => /^(ghp_|github_pat_|gho_)\w{20,}/.test(t),
    hint: '只需要 gist 权限。国内网络可能需要代理。',
  },
};

Page({
  data: {
    theme: 'theme-auto',
    on: false,
    provider: 'gitee',
    providerLabel: 'Gitee',
    tokenTitle: 'Gitee 私人令牌',
    tokenPh: '32 位私人令牌',
    tokenHint: '',
    token: '',
    pass: '',
    busy: false,
    progress: 0,
    statusText: '未开启',
    statusState: 'off',
  },

  onLoad() {
    app.ready().then(() => this.refresh());
  },

  onShow() {
    app.ready().then(() => this.refresh());
  },

  refresh() {
    const prefs = app.globalData.prefs || {};
    this.setData({
      theme: ui.themeClass(prefs),
      on: Sync.on,
      provider: Sync.provider,
      providerLabel: Sync.provider === 'gitee' ? 'Gitee' : 'GitHub',
      statusText: this.statusText(),
      statusState: Sync.status.state,
    }, () => this.paintProvider());
    ui.applyNav(prefs);
  },

  statusText() {
    const st = Sync.status;
    if (!Sync.on) return '未开启';
    if (st.state === 'syncing') return '正在同步…';
    if (st.state === 'error') return st.err || '同步失败';
    return '已同步 · ' + this.ago(Sync.at);
  },

  ago(t) {
    if (!t) return '还没同步过';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  },

  paintProvider() {
    const p = PROVIDERS[this.data.provider] || PROVIDERS.gitee;
    this.setData({
      tokenTitle: p.title,
      tokenPh: p.ph,
      tokenHint: p.hint,
    });
  },

  onProvider(e) {
    const provider = e.currentTarget.dataset.provider;
    if (provider === this.data.provider) return;
    this.setData({ provider }, () => this.paintProvider());
  },

  onToken(e) { this.setData({ token: e.detail.value }); },
  onPass(e) { this.setData({ pass: e.detail.value }); },

  async onEnable() {
    if (this.data.busy) return;
    const prov = this.data.provider;
    const P = PROVIDERS[prov];
    const token = String(this.data.token || '').trim();
    const pass = String(this.data.pass || '');

    if (!P.ok(token)) { ui.toast('令牌格式不对'); return; }
    if (pass.length < 8) { ui.toast('同步密码至少 8 位'); return; }

    this.setData({ busy: true, progress: 0, statusText: '正在连接…' });
    try {
      const found = await Sync.enable(token, pass, prov, ratio => {
        this.setData({ progress: Math.round(ratio * 100), statusText: `正在加密 ${Math.round(ratio * 100)}%` });
      });
      await app.setPrefs({});
      this.setData({ busy: false, token: '', pass: '', progress: 100 });
      ui.toast(found ? '已连接，数据已合并' : '同步已开启');
      this.refresh();
    } catch (e) {
      this.setData({ busy: false, progress: 0 });
      ui.toast((e && e.message) || '连接失败');
      this.refresh();
    }
  },

  async onSyncNow() {
    if (this.data.busy) return;
    this.setData({ busy: true, statusText: '正在同步…' });
    await Sync.run();
    this.setData({ busy: false });
    ui.toast(Sync.status.state === 'error' ? (Sync.status.err || '同步失败') : '已同步');
    this.refresh();
  },

  onDisable() {
    ui.confirm('关闭同步', '只影响这台设备，云端的加密数据和本机数据都会保留。', '关闭').then(async ok => {
      if (!ok) return;
      await Sync.disable();
      ui.toast('已在这台设备上关闭同步');
      this.refresh();
    });
  },

  onBack() { ui.back(); },
});
