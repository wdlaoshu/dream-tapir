/* Itemory 小程序 · 记一笔（支出 / 收入）
   对应桌面版 EntryModal：方向、类型、金额、日期、标题、备注。金额元→分。 */

const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const { parseYuanToMinor, minorToDecimalText, todayYmd, isValidYmd } = require('../../utils/format.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    itemId: '',
    entryId: '',
    itemName: '',
    direction: 'expense',
    kind: 'accessory',
    amountText: '',
    occurredOn: '',
    title: '',
    note: '',
    kindOptions: M.MONEY_KIND_OPTIONS,
    isEditing: false,
    today: '',
  },

  async onLoad(query) {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    const itemId = (query && query.itemId) || '';
    const entryId = (query && query.id) || '';
    const item = store.findItem(itemId);
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      itemId,
      entryId,
      itemName: item ? item.name : '',
      direction: (query && query.direction) || 'expense',
      occurredOn: todayYmd(),
      today: todayYmd(),
      isEditing: Boolean(entryId),
    });
    if (entryId) {
      const entry = store.findMoneyEntry(entryId);
      if (!entry) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        return;
      }
      this.setData({
        itemId: entry.itemId,
        itemName: (store.findItem(entry.itemId) || {}).name || '',
        direction: entry.direction,
        kind: entry.kind,
        amountText: minorToDecimalText(entry.amountMinor),
        occurredOn: entry.occurredOn,
        title: entry.title,
        note: entry.note || '',
      });
    }
  },

  pickDirection(e) { this.setData({ direction: e.currentTarget.dataset.key }); },
  pickKind(e) { this.setData({ kind: e.currentTarget.dataset.key }); },
  onAmount(e) { this.setData({ amountText: e.detail.value }); },
  onDateChange(e) { this.setData({ occurredOn: e.detail.value }); },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  async save() {
    const title = this.data.title.trim();
    if (!title) {
      wx.showToast({ title: '请填写事项标题', icon: 'none' });
      return;
    }
    let amountMinor = null;
    try {
      amountMinor = parseYuanToMinor(this.data.amountText);
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
      return;
    }
    if (!amountMinor || amountMinor <= 0) {
      wx.showToast({ title: '金额要大于 0', icon: 'none' });
      return;
    }
    if (!isValidYmd(this.data.occurredOn)) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    try {
      await store.saveMoneyEntry({
        id: this.data.entryId || undefined,
        itemId: this.data.itemId,
        direction: this.data.direction,
        kind: this.data.kind,
        amountMinor,
        occurredOn: this.data.occurredOn,
        title,
        note: this.data.note.trim() || null,
      });
      wx.navigateBack();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  async remove() {
    if (!this.data.entryId) return;
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除这笔记录？',
        confirmText: '删除',
        confirmColor: '#FF3B30',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.deleteMoneyEntry(this.data.entryId);
    wx.navigateBack();
  },
});
