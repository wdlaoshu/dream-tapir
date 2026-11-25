/* Itemory 小程序 · 物品编辑
   对应桌面版 ItemEditorPage：名称、分类、购入日期、购入价、持有状态、标签、
   图标 / 封面、渠道、保修、备注。金额按「元」输入，存整数分。 */

const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const covers = require('../../utils/covers.js');
const { parseYuanToMinor, minorToDecimalText, todayYmd, addYearsYmd, isValidYmd } = require('../../utils/format.js');
const { NAME_MAX_LENGTH } = require('../../utils/validate.js');
const { PRESET_ITEM_EMOJIS } = require('../../data/emojis.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    itemId: '',
    isEditing: false,
    name: '',
    categoryId: '',
    acquiredOn: '',
    priceText: '',
    valuationText: '',
    today: '',
    condition: 'in_use',
    iconSymbol: '',
    coverAssetId: '',
    coverPath: '',
    channel: '',
    warrantyEnabled: false,
    warrantyUntil: '',
    notes: '',
    categories: [],
    tags: [],
    selectedTagIds: [],
    conditionOptions: M.ITEM_CONDITION_OPTIONS,
    emojis: PRESET_ITEM_EMOJIS,
    iconOpen: false,
    nameMax: NAME_MAX_LENGTH,
    canPickImage: false,
    sourceNotice: '',
    priceNeedsConfirmation: false,
    dateNeedsConfirmation: false,
    categoryHint: '',
  },

  async onLoad(query) {
    this.setData({ canPickImage: covers.canPickImage() });
    await app.ready();
    const prefs = app.globalData.prefs || {};
    const itemId = (query && query.id) || '';
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      itemId,
      isEditing: Boolean(itemId),
      acquiredOn: todayYmd(),
      today: todayYmd(),
    });

    const state = store.getState();
    if (!state) return;
    const selectedTagIds = itemId ? store.tagIdsOf(itemId) : [];
    this.setData({
      categories: store.categoriesSorted().map(c => ({ id: c.id, name: c.name, emoji: M.categoryEmoji(c) })),
      tags: store.tagsSorted().map(t => ({
        id: t.id, name: t.name, color: t.color,
        selected: selectedTagIds.indexOf(t.id) >= 0,
      })),
      selectedTagIds,
    });

    if (!itemId) {
      /* AI 识图录入带过来的草稿：只预填，保存仍走本页校验 */
      const draft = app.globalData.aiItemDraft;
      if (draft) {
        app.globalData.aiItemDraft = null;
        this.setData({
          name: draft.name || '',
          categoryId: draft.categoryId || '',
          priceText: draft.priceText || '',
          acquiredOn: draft.purchasedOn || todayYmd(),
          channel: draft.channel || '',
          warrantyEnabled: Boolean(draft.warrantyUntil),
          warrantyUntil: draft.warrantyUntil || '',
          notes: draft.notes || '',
          sourceNotice: draft.sourceNotice || '',
          priceNeedsConfirmation: Boolean(draft.priceNeedsConfirmation),
          dateNeedsConfirmation: Boolean(draft.dateNeedsConfirmation),
        });
        const hint = draft.categoryHint || '';
        if (!draft.categoryId && hint) {
          this.setData({ categoryHint: hint });
        }
      }
    }

    if (itemId) {
      const detail = require('../../utils/view.js').buildDetail(state, itemId);
      if (!detail) {
        wx.showToast({ title: '物品不存在', icon: 'none' });
        return;
      }
      const item = store.findItem(itemId);
      this.setData({
        name: item.name,
        categoryId: item.categoryId || '',
        acquiredOn: item.acquiredOn,
        priceText: item.acquisitionAmountMinor === null ? '' : minorToDecimalText(item.acquisitionAmountMinor),
        valuationText: item.valuationMinor === null ? '' : minorToDecimalText(item.valuationMinor),
        condition: item.holdingCondition,
        iconSymbol: item.iconSymbol || '',
        coverAssetId: item.coverAssetId || '',
        coverPath: detail.coverPath || '',
        channel: item.channel || '',
        warrantyEnabled: Boolean(item.warrantyUntil),
        warrantyUntil: item.warrantyUntil || '',
        notes: item.notes || '',
        selectedTagIds,
      });
    }
  },

  async onShow() {
    await this.takeCropResult();
  },

  onUnload() {
    /* 没保存就离开：把本次新建的封面文件清掉，别留下孤儿文件 */
    if (this.saved) return;
    for (const id of this.createdAssetIds || []) {
      store.dropAsset(id).catch(() => {});
    }
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onPrice(e) { this.setData({ priceText: e.detail.value }); },
  onValuation(e) { this.setData({ valuationText: e.detail.value }); },
  onChannel(e) { this.setData({ channel: e.detail.value }); },
  onNotes(e) { this.setData({ notes: e.detail.value }); },
  onDateChange(e) { this.setData({ acquiredOn: e.detail.value }); },

  pickCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ categoryId: id === this.data.categoryId ? '' : id });
  },

  pickCondition(e) {
    this.setData({ condition: e.currentTarget.dataset.key });
  },

  toggleTag(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.selectedTagIds.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    /* WXML 里不能调 indexOf，所以「选中」状态在逻辑层算好 */
    this.setData({
      selectedTagIds: selected,
      tags: this.data.tags.map(tag => Object.assign({}, tag, { selected: selected.indexOf(tag.id) >= 0 })),
    });
  },

  toggleWarranty(e) {
    const enabled = e.detail.value;
    const patch = { warrantyEnabled: enabled };
    if (enabled && !this.data.warrantyUntil) {
      patch.warrantyUntil = addYearsYmd(this.data.acquiredOn || todayYmd(), 1);
    }
    this.setData(patch);
  },

  onWarrantyDate(e) { this.setData({ warrantyUntil: e.detail.value }); },

  openIconPicker() { this.setData({ iconOpen: true }); },
  closeIconPicker() { this.setData({ iconOpen: false }); },

  pickEmoji(e) {
    const symbol = e.currentTarget.dataset.symbol;
    this.setData({ iconSymbol: symbol === this.data.iconSymbol ? '' : symbol, iconOpen: false });
  },

  useCategoryIcon() {
    this.setData({ iconSymbol: '', iconOpen: false });
  },

  async pickCover() {
    if (!covers.canPickImage()) {
      wx.showModal({
        title: '这个平台不能选图',
        content: 'Web 容器没有 chooseImage 实现，封面只在 Android / iOS / Harmony 可用。可以先选一个 Emoji 图标。',
        showCancel: false,
      });
      return;
    }
    try {
      const tempPath = await covers.chooseTempImage();
      /* 交给裁剪页处理；裁剪页保存后把结果放在 globalData 里带回 */
      wx.navigateTo({ url: `/pages/cover-crop/cover-crop?src=${encodeURIComponent(tempPath)}` });
    } catch (err) {
      wx.showToast({ title: err.message || '选图失败', icon: 'none' });
    }
  },

  /* 从裁剪页回来：先换上，旧封面的文件等保存成功后再删（取消编辑不该丢数据） */
  async takeCropResult() {
    const result = app.globalData.coverCropResult;
    if (!result) return;
    app.globalData.coverCropResult = null;
    this.createdAssetIds = this.createdAssetIds || [];
    if (this.createdAssetIds.indexOf(result.assetId) < 0) this.createdAssetIds.push(result.assetId);
    const previous = this.data.coverAssetId;
    this.pendingDropIds = this.pendingDropIds || [];
    if (previous && previous !== result.assetId && this.pendingDropIds.indexOf(previous) < 0) {
      this.pendingDropIds.push(previous);
    }
    this.setData({ coverAssetId: result.assetId, coverPath: result.path });
  },

  async removeCover() {
    const previous = this.data.coverAssetId;
    this.setData({ coverAssetId: '', coverPath: '' });
    if (!previous) return;
    /* 同样是「保存后才删」，避免取消编辑把原封面也删掉 */
    this.pendingDropIds = this.pendingDropIds || [];
    if (this.pendingDropIds.indexOf(previous) < 0) this.pendingDropIds.push(previous);
  },

  async save() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '请填写物品名称', icon: 'none' });
      return;
    }
    if (!isValidYmd(this.data.acquiredOn)) {
      wx.showToast({ title: '请选择购入日期', icon: 'none' });
      return;
    }
    let amountMinor = null;
    try {
      amountMinor = parseYuanToMinor(this.data.priceText);
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
      return;
    }
    let valuationMinor = null;
    try {
      valuationMinor = parseYuanToMinor(this.data.valuationText);
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
      return;
    }
    if (this.data.warrantyEnabled && !isValidYmd(this.data.warrantyUntil)) {
      wx.showToast({ title: '请选择保修截止日期', icon: 'none' });
      return;
    }
    try {
      const record = await store.saveItem({
        id: this.data.itemId || undefined,
        name,
        categoryId: this.data.categoryId || null,
        acquiredOn: this.data.acquiredOn,
        acquisitionAmountMinor: amountMinor,
        holdingCondition: this.data.condition,
        iconSymbol: this.data.iconSymbol || null,
        coverAssetId: this.data.coverAssetId || null,
        channel: this.data.channel.trim() || null,
        valuationMinor,
        warrantyUntil: this.data.warrantyEnabled ? this.data.warrantyUntil : null,
        notes: this.data.notes.trim() || null,
      });
      await store.setItemTags(record.id, this.data.selectedTagIds);
      this.saved = true;
      /* 保存成功后清掉被替换的旧封面记录与文件 */
      for (const id of this.pendingDropIds || []) {
        if (id && id !== record.coverAssetId) await store.dropAsset(id);
      }
      wx.navigateBack();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },
});
