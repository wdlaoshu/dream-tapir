/* Itemory 小程序 · 结束持有 / 撤销
   对应桌面版 ExitModal：原因、日期、回收金额（只有出售才有）、备注。 */

const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const { parseYuanToMinor, minorToDecimalText, todayYmd, isValidYmd } = require('../../utils/format.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    itemId: '',
    itemName: '',
    acquiredOn: '',
    reason: 'sold',
    exitedOn: '',
    recoveryText: '',
    note: '',
    reasonOptions: M.EXIT_REASON_OPTIONS,
    hasExit: false,
    today: '',
  },

  async onLoad(query) {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    const itemId = (query && query.id) || '';
    const item = store.findItem(itemId);
    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      return;
    }
    const exit = store.findExit(itemId);
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      itemId,
      itemName: item.name,
      acquiredOn: item.acquiredOn,
      exitedOn: exit ? exit.exitedOn : todayYmd(),
      reason: exit ? exit.reason : 'sold',
      recoveryText: exit && exit.recoveryAmountMinor !== null ? minorToDecimalText(exit.recoveryAmountMinor) : '',
      note: exit && exit.note ? exit.note : '',
      hasExit: Boolean(exit),
      today: todayYmd(),
    });
  },

  pickReason(e) {
    this.setData({ reason: e.currentTarget.dataset.key });
  },

  onDateChange(e) { this.setData({ exitedOn: e.detail.value }); },
  onRecovery(e) { this.setData({ recoveryText: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  async save() {
    if (!isValidYmd(this.data.exitedOn)) {
      wx.showToast({ title: '请选择结束日期', icon: 'none' });
      return;
    }
    if (this.data.exitedOn < this.data.acquiredOn) {
      wx.showToast({ title: '结束日期不能早于购入日期', icon: 'none' });
      return;
    }
    let recoveryMinor = null;
    if (this.data.reason === 'sold') {
      try {
        recoveryMinor = parseYuanToMinor(this.data.recoveryText);
      } catch (err) {
        wx.showToast({ title: err.message, icon: 'none' });
        return;
      }
    }
    try {
      await store.setExit(this.data.itemId, {
        reason: this.data.reason,
        exitedOn: this.data.exitedOn,
        recoveryAmountMinor: recoveryMinor,
        note: this.data.note.trim() || null,
      });
      wx.navigateBack();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  async undo() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '撤销结束持有？',
        content: '物品会回到当前持有状态，回收金额一起移除。',
        confirmText: '撤销',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.clearExit(this.data.itemId);
    wx.navigateBack();
  },
});
