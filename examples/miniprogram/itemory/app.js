/* Itemory 小程序 · 入口
   对应 Itemory/index.tsx（MIT，Copyright (c) 2026 StarYunLee）。
   桌面版用 SQLite + Scripting Pro；这里是一份 JSON 存本机，启动即用。 */

const store = require('./utils/store.js');

let bootPromise = null;

async function boot() {
  const prefs = await store.loadPrefs();
  const state = await store.ensure();
  return { prefs, state };
}

App({
  globalData: {
    prefs: { theme: 'auto', layout: 'shelf', sortField: 'created', sortDirection: 'desc' },
  },

  onLaunch() {
    bootPromise = boot().then(res => {
      this.globalData.prefs = res.prefs;
      return res;
    }).catch(err => {
      console.error('Itemory 启动失败', err);
      return { prefs: this.globalData.prefs, state: null };
    });
  },

  /* 页面在 onLoad / onShow 里等这个 promise，避免读到还没加载完的数据 */
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
