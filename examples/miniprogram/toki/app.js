/* Toki 小程序 · 入口
   与网页版 web/app.js 对应，但只保留本机数据：没有加密同步。 */

const store = require('./utils/store.js');
const { demo } = require('./utils/model.js');
const Sync = require('./utils/sync.js');

let bootPromise = null;

async function boot() {
  const prefs = await store.loadPrefs();
  const state = await store.load();
  if (!state) {
    const d = demo();
    store.replaceState(d).then(() => {
      wx.showToast({ title: '这是示例数据', icon: 'none', duration: 2000 });
    });
  }
  return { prefs };
}

App({
  globalData: { prefs: { theme: 'auto', privacy: false, kind: 'email' } },

  onLaunch() {
    bootPromise = boot().then(res => {
      this.globalData.prefs = res.prefs;
      /* 每次保存后排队一次加密同步 */
      store.subscribe(() => Sync.schedule());
      Sync.init();
      return res;
    });
  },

  /* 页面在 onLoad/onShow 里等这个 promise，避免读到未加载完的数据 */
  ready() {
    if (!bootPromise) bootPromise = boot().then(res => { this.globalData.prefs = res.prefs; return res; });
    return bootPromise;
  },

  async setPrefs(patch) {
    this.globalData.prefs = Object.assign({}, this.globalData.prefs, patch);
    await store.savePrefs(this.globalData.prefs);
    return this.globalData.prefs;
  },
});
