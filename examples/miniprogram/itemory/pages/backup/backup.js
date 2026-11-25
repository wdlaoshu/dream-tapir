/* Itemory 小程序 · 备份与导入
   桌面版导出的是 SQLite 文件（.itemory）和 zip 交换包；小程序四端没有稳定的
   zip/文件选择链路，所以这里统一用 JSON：复制到剪贴板带走，粘贴回来导入。
   封面以 data URL 内嵌，保持「一个文件带走全部」。 */

const store = require('../../utils/store.js');
const covers = require('../../utils/covers.js');

const app = getApp();

function byteText(text) {
  const bytes = text.length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

Page({
  data: {
    theme: 'theme-auto',
    counts: { items: 0, categories: 0, tags: 0, moneyEntries: 0, exits: 0 },
    includeCovers: true,
    importText: '',
    importOpen: false,
    mode: 'merge',
    lastExportText: '',
    importing: false,
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({ theme: `theme-${prefs.theme || 'auto'}` });
    this.refresh();
  },

  refresh() {
    const state = store.getState();
    if (!state) return;
    this.setData({
      counts: {
        items: state.items.length,
        categories: state.categories.length,
        tags: state.tags.length,
        moneyEntries: state.moneyEntries.length,
        exits: state.exits.length,
      },
    });
  },

  toggleCovers(e) {
    this.setData({ includeCovers: Boolean(e.detail.value) });
  },

  async exportAll() {
    wx.showLoading({ title: '正在打包' });
    try {
      const doc = await store.exportJSON({ includeCovers: this.data.includeCovers });
      const text = JSON.stringify(doc);
      await new Promise((resolve, reject) => {
        wx.setClipboardData({
          data: text,
          success: resolve,
          fail: err => reject(new Error((err && err.errMsg) || '复制失败')),
        });
      });
      const note = doc.skippedCovers.length
        ? `已复制 ${byteText(text)}，${doc.skippedCovers.length} 张封面过大未包含`
        : `已复制 ${byteText(text)} 到剪贴板`;
      this.setData({ lastExportText: note });
      wx.showToast({ title: '已复制到剪贴板', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: err.message || '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async pasteFromClipboard() {
    try {
      const text = await new Promise((resolve, reject) => {
        wx.getClipboardData({
          success: res => resolve(res && res.data),
          fail: err => reject(new Error((err && err.errMsg) || '读不到剪贴板')),
        });
      });
      if (!text) {
        wx.showToast({ title: '剪贴板是空的', icon: 'none' });
        return;
      }
      this.setData({ importText: text, importOpen: true });
    } catch (err) {
      wx.showToast({ title: err.message || '读不到剪贴板', icon: 'none' });
    }
  },

  openImport() { this.setData({ importOpen: true }); },
  closeImport() { this.setData({ importOpen: false }); },
  onImportText(e) { this.setData({ importText: e.detail.value }); },
  pickMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },

  async doImport() {
    const text = this.data.importText.trim();
    if (!text) {
      wx.showToast({ title: '先粘贴备份内容', icon: 'none' });
      return;
    }
    let doc;
    try {
      doc = JSON.parse(text);
      store.validateImported(doc);
    } catch (err) {
      wx.showToast({ title: err.message || '不是有效的备份', icon: 'none' });
      return;
    }
    const modeLabel = this.data.mode === 'replace' ? '替换当前数据' : '追加合并';
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: `${modeLabel}？`,
        content: `备份里有 ${(doc.data.items || []).length} 件物品。${this.data.mode === 'replace' ? '当前数据会被完全替换。' : '同 ID 或同「名称 + 购入日期」的物品会跳过。'}`,
        confirmText: '开始导入',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ importing: true });
    wx.showLoading({ title: '正在导入' });
    try {
      const summary = await store.importJSON(doc, this.data.mode);
      this.refresh();
      this.setData({ importText: '', importOpen: false });
      wx.hideLoading();
      wx.showModal({
        title: '导入完成',
        content: `现在共 ${summary.totalItems} 件物品。${this.data.mode === 'merge' ? `新增 ${summary.addedItems} 件，跳过 ${summary.skippedItems} 件。` : ''}`,
        showCancel: false,
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '导入失败', icon: 'none' });
    } finally {
      this.setData({ importing: false });
    }
  },

  async loadDemo() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '载入示例数据？',
        content: '会替换当前数据，方便先看看列表和统计长什么样。',
        confirmText: '载入',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.replaceState(store.demoState());
    this.refresh();
    wx.showToast({ title: '已载入示例', icon: 'none' });
  },

  async resetAll() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '清空所有数据？',
        content: '物品、流水、分类、标签和封面都会删除，无法恢复。建议先导出备份。',
        confirmText: '清空',
        confirmColor: '#FF3B30',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.replaceState(store.emptyState());
    try { await covers.pruneCovers([]); } catch (e) { /* 文件清理失败不影响数据 */ }
    this.refresh();
    wx.showToast({ title: '已清空', icon: 'none' });
  },
});
