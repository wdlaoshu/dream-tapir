/* Itemory 小程序 · AI 识图录入
   对应桌面版 AiItemCreatePage + ai-entry 系列：选一张订单截图/物品照片，
   交给用户配置的 OpenAI 兼容接口识别，然后把结果作为「草稿」带进编辑页。
   草稿只负责预填，最终保存仍走编辑页的校验。 */

const store = require('../../utils/store.js');
const M = require('../../utils/model.js');
const ai = require('../../utils/ai.js');
const secret = require('../../utils/secret.js');
const covers = require('../../utils/covers.js');
const { minorToDecimalText } = require('../../utils/format.js');

const app = getApp();

const IMAGE_TYPE_LABELS = {
  physical_item: '物品照片',
  order_receipt: '订单截图',
  mixed: '混合内容',
  other: '其他图片',
};

Page({
  data: {
    theme: 'theme-auto',
    configured: false,
    hasKey: false,
    canPick: false,
    imagePath: '',
    imageUrl: '',
    busy: false,
    busyText: '',
    result: null,
    error: '',
    warnings: [],
    unlockOpen: false,
    unlockInput: '',
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    const profile = await ai.readProfile();
    const hasKey = await secret.hasKey();
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      configured: Boolean(profile.enabled && profile.baseURL && profile.model && profile.consentAt),
      hasKey,
      canPick: covers.canPickImage(),
    });
  },

  gotoSettings() {
    wx.navigateTo({ url: '/pages/ai-settings/ai-settings' });
  },

  async choose() {
    if (!this.data.canPick) {
      wx.showModal({
        title: '这个平台不能选图',
        content: 'AI 识图需要 chooseImage，Web 容器没有这个实现。可以在 Android / iOS / Harmony 上用。',
        showCancel: false,
      });
      return;
    }
    if (this.data.busy) return;
    let tempPath = '';
    try {
      const chosen = await new Promise((resolve, reject) => {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: err => reject(new Error((err && err.errMsg) || '没有选择图片')),
        });
      });
      tempPath = (chosen.tempFilePaths || [])[0] || '';
      if (!tempPath) throw new Error('没有选择图片');
      const base64 = await covers.readFileBase64(tempPath);
      if (!base64) throw new Error('读不到图片内容');
      if (base64.length > 6 * 1024 * 1024) throw new Error('图片太大，请先裁小或截图重试');
      const lower = tempPath.toLowerCase();
      const mime = lower.indexOf('.png') >= 0 ? 'image/png' : 'image/jpeg';
      this.setData({
        imagePath: tempPath,
        imageUrl: `data:${mime};base64,${base64}`,
        result: null,
        warnings: [],
        error: '',
      });
      await this.recognize();
    } catch (err) {
      wx.showToast({ title: err.message || '选图失败', icon: 'none' });
    }
  },

  async recognize() {
    if (this.data.busy) return;
    if (!this.data.imageUrl) {
      wx.showToast({ title: '先选一张图', icon: 'none' });
      return;
    }
    const profile = await ai.readProfile();
    try {
      ai.resolveRoot(profile.baseURL);
    } catch (err) {
      this.setData({ error: err.message });
      return;
    }
    if (!profile.model) {
      this.setData({ error: '还没有选模型，先去 AI 服务设置里选一个' });
      return;
    }
    const apiKey = await secret.currentKey();
    if (!apiKey) {
      if (await secret.needsUnlock()) {
        this.setData({ unlockOpen: true, unlockInput: '' });
        return;
      }
      this.setData({ error: '没有可用的 API Key，先去 AI 服务设置里填' });
      return;
    }

    this.setData({ busy: true, busyText: '正在识别…', error: '', result: null, warnings: [] });
    try {
      const categories = store.categoriesSorted().map(c => ({ id: c.id, name: c.name, normalizedName: c.normalizedName }));
      const outcome = await ai.extractItemFromImage({
        baseURL: profile.baseURL,
        apiKey,
        model: profile.model,
        endpointKind: profile.endpointKind,
        reasoningEffort: profile.reasoningEffort,
        customPrompt: profile.customPrompt,
        candidateCategories: categories.map(c => `"${c.name}"`),
        imageDataUrl: this.data.imageUrl,
      });
      const extraction = outcome.extraction;
      const matched = ai.matchBestCategory(extraction.categoryHint, categories);
      const warnings = extraction.warnings.slice();
      if (extraction.categoryHint && !matched) warnings.push(`分类建议「${extraction.categoryHint}」没有匹配到现有分类`);
      if (extraction.priceNeedsConfirmation) warnings.push('金额来自旧格式结果，请在保存前核对');

      this.setData({
        busy: false,
        busyText: '',
        result: {
          name: extraction.name,
          typeLabel: IMAGE_TYPE_LABELS[extraction.imageType] || '其他图片',
          categoryHint: extraction.categoryHint || '',
          categoryName: matched ? matched.name : '',
          priceText: extraction.price === null ? '' : minorToDecimalText(Math.round(extraction.price * 100)),
          acquiredOn: extraction.acquiredOn || '',
          channel: extraction.channel || '',
          warrantyUntil: extraction.warrantyUntil || '',
          notes: extraction.notes || '',
          latencyMs: outcome.latencyMs,
          attempts: outcome.attempts.length,
        },
        warnings,
        _draft: {
          name: extraction.name,
          categoryId: matched ? matched.id : '',
          categoryHint: extraction.categoryHint || '',
          priceText: extraction.price === null ? '' : minorToDecimalText(Math.round(extraction.price * 100)),
          purchasedOn: extraction.acquiredOn || '',
          warrantyUntil: extraction.warrantyUntil || '',
          channel: extraction.channel || '',
          notes: extraction.notes || '',
          sourceNotice: '信息由 AI 从图片识别，请核对后保存。',
          priceNeedsConfirmation: extraction.priceNeedsConfirmation,
          dateNeedsConfirmation: !extraction.acquiredOn,
        },
      });
    } catch (err) {
      this.setData({ busy: false, busyText: '', error: err.message || '识别失败' });
    }
  },

  toEditor() {
    if (!this.data.result) return;
    app.globalData.aiItemDraft = this.data._draft || null;
    wx.navigateTo({ url: '/pages/item-edit/item-edit' });
  },

  onUnlockInput(e) { this.setData({ unlockInput: e.detail.value }); },
  closeUnlock() { this.setData({ unlockOpen: false, unlockInput: '' }); },

  async submitUnlock() {
    const passphrase = this.data.unlockInput;
    if (!passphrase) {
      wx.showToast({ title: '请输入口令', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在解锁' });
    const ok = await secret.unlockKey(passphrase);
    wx.hideLoading();
    if (!ok) {
      wx.showToast({ title: '口令不对', icon: 'none' });
      return;
    }
    this.setData({ unlockOpen: false, unlockInput: '' });
    await this.recognize();
  },

  clear() {
    this.setData({ imagePath: '', imageUrl: '', result: null, warnings: [], error: '' });
  },
});
