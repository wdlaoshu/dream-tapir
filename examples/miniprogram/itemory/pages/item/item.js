/* Itemory 小程序 · 物品详情
   对应桌面版 ItemPage：成本小结、基础信息、时间线，以及记一笔 / 结束持有 / 编辑 / 删除。 */

const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const M = require('../../utils/model.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    itemId: '',
    detail: null,
    missing: false,
  },

  onLoad(query) {
    this.setData({ itemId: (query && query.id) || '' });
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
    const detail = V.buildDetail(state, this.data.itemId);
    this.setData({ detail, missing: !detail });
  },

  edit() {
    wx.navigateTo({ url: `/pages/item-edit/item-edit?id=${this.data.itemId}` });
  },

  addExpense() {
    wx.navigateTo({ url: `/pages/money-edit/money-edit?itemId=${this.data.itemId}&direction=expense` });
  },

  addIncome() {
    wx.navigateTo({ url: `/pages/money-edit/money-edit?itemId=${this.data.itemId}&direction=income` });
  },

  endHolding() {
    wx.navigateTo({ url: `/pages/exit-edit/exit-edit?id=${this.data.itemId}` });
  },

  undoExit() {
    wx.showModal({
      title: '撤销结束持有？',
      content: '物品会回到当前持有状态，出售回收金额也会一起移除。',
      confirmText: '撤销',
      success: async res => {
        if (!res.confirm) return;
        await store.clearExit(this.data.itemId);
        this.refresh();
        wx.showToast({ title: '已撤销', icon: 'none' });
      },
    });
  },

  previewCover() {
    const detail = this.data.detail;
    if (!detail || !detail.coverPath) return;
    if (typeof wx.previewImage !== 'function') {
      wx.showToast({ title: '当前平台不支持预览图片', icon: 'none' });
      return;
    }
    wx.previewImage({ urls: [detail.coverPath], current: detail.coverPath });
  },

  /* 时间线：支出/收入可编辑或删除，结束持有可改 */
  onTimelineTap(e) {
    const node = this.data.detail.timeline[e.currentTarget.dataset.index];
    if (!node) return;
    if (node.moneyEntryId) {
      wx.showActionSheet({
        itemList: ['编辑这笔记录', '删除这笔记录'],
        success: res => {
          if (res.tapIndex === 0) {
            wx.navigateTo({ url: `/pages/money-edit/money-edit?id=${node.moneyEntryId}&itemId=${this.data.itemId}` });
          } else if (res.tapIndex === 1) {
            this.removeMoneyEntry(node);
          }
        },
      });
      return;
    }
    if (node.type === 'exit') this.endHolding();
  },

  removeMoneyEntry(node) {
    wx.showModal({
      title: '删除这笔记录？',
      content: `${node.title} · ${node.amountText}`,
      confirmText: '删除',
      success: async res => {
        if (!res.confirm) return;
        await store.deleteMoneyEntry(node.moneyEntryId);
        this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  deleteItem() {
    wx.showModal({
      title: '删除这件物品？',
      content: '物品、流水和时间线都会一起删除，无法恢复。',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: async res => {
        if (!res.confirm) return;
        await store.deleteItem(this.data.itemId);
        wx.navigateBack();
      },
    });
  },
});
