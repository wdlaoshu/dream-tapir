/* Itemory 小程序 · AI 服务设置
   对应桌面版 AiVisionSettingsPage / AiVisionConfigurationPanels（一期只做识图这一块）：
   接口地址、API Key、接口形态（chat_completions / responses）、模型、推理强度、
   自定义提示词、数据外发说明。桌面版用 Keychain 存 Key，这里可选用口令加密。 */

const ai = require('../../utils/ai.js');
const secret = require('../../utils/secret.js');

const app = getApp();

Page({
  data: {
    theme: 'theme-auto',
    enabled: false,
    baseURL: '',
    endpointKind: 'chat_completions',
    model: '',
    modelOptions: [],
    reasoningEffort: 'medium',
    customPrompt: '',
    consent: false,

    keyInput: '',
    keySaved: false,
    keySealed: false,
    keyMasked: '',
    encryptKey: false,
    passphrase: '',

    refreshing: false,
    testing: false,
    lastTest: '',
    effortOptions: ai.EFFORT_OPTIONS,
    unlockOpen: false,
    unlockInput: '',
    pendingAction: '',
  },

  async onLoad() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({ theme: `theme-${prefs.theme || 'auto'}` });
    await this.reload();
  },

  async reload() {
    const profile = await ai.readProfile();
    const keyState = await secret.readRecord();
    this.setData({
      enabled: profile.enabled,
      baseURL: profile.baseURL,
      endpointKind: profile.endpointKind,
      model: profile.model,
      modelOptions: profile.models,
      reasoningEffort: profile.reasoningEffort,
      customPrompt: profile.customPrompt,
      consent: Boolean(profile.consentAt),
      keySaved: keyState.mode !== 'none',
      keySealed: keyState.mode === 'sealed',
      keyMasked: keyState.mode === 'plain' ? secret.maskKey(keyState.value) : '',
    });
  },

  onEnabled(e) {
    const enabled = Boolean(e.detail.value);
    if (enabled && !this.data.consent) {
      wx.showToast({ title: '先阅读并勾选数据外发说明', icon: 'none' });
      return;
    }
    this.setData({ enabled });
  },

  onBaseURL(e) { this.setData({ baseURL: e.detail.value }); },
  onModel(e) { this.setData({ model: e.detail.value }); },
  onCustomPrompt(e) { this.setData({ customPrompt: e.detail.value }); },
  onKeyInput(e) { this.setData({ keyInput: e.detail.value }); },
  onPassphrase(e) { this.setData({ passphrase: e.detail.value }); },

  pickEndpoint(e) { this.setData({ endpointKind: e.currentTarget.dataset.kind }); },
  pickEffort(e) { this.setData({ reasoningEffort: e.currentTarget.dataset.effort }); },

  pickConsent(e) { this.setData({ consent: Boolean(e.detail.value) }); },

  pickModelFromList(e) {
    const index = Number(e.detail.value);
    const model = this.data.modelOptions[index];
    if (model) this.setData({ model });
  },

  toggleEncrypt(e) { this.setData({ encryptKey: Boolean(e.detail.value) }); },

  async saveProfile() {
    if (!this.data.baseURL.trim()) {
      wx.showToast({ title: '请填写接口地址', icon: 'none' });
      return;
    }
    try {
      ai.resolveRoot(this.data.baseURL); // 先校验一次，错误提示更具体
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
      return;
    }
    await ai.saveProfile({
      enabled: this.data.enabled,
      baseURL: this.data.baseURL.trim(),
      endpointKind: this.data.endpointKind,
      model: this.data.model.trim(),
      models: this.data.modelOptions,
      reasoningEffort: this.data.reasoningEffort,
      customPrompt: this.data.customPrompt,
      consentAt: this.data.consent ? Date.now() : null,
    });
    wx.showToast({ title: '已保存', icon: 'none' });
  },

  async saveKey() {
    const value = this.data.keyInput.trim();
    if (!value) {
      wx.showToast({ title: '先填 API Key', icon: 'none' });
      return;
    }
    if (this.data.encryptKey && !this.data.passphrase) {
      wx.showToast({ title: '请设置一个本地口令', icon: 'none' });
      return;
    }
    try {
      wx.showLoading({ title: this.data.encryptKey ? '正在加密' : '正在保存' });
      const result = await secret.saveKey(value, this.data.encryptKey ? this.data.passphrase : null);
      wx.hideLoading();
      this.setData({
        keyInput: '',
        keySaved: true,
        keySealed: result.mode === 'sealed',
        keyMasked: result.mode === 'plain' ? secret.maskKey(value) : '',
        passphrase: '',
        encryptKey: false,
      });
      wx.showToast({ title: result.mode === 'sealed' ? '已加密保存' : '已保存', icon: 'none' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  async clearKey() {
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '清除 API Key？',
        content: '识图录入会立刻不可用，接口地址和模型设置会保留。',
        confirmText: '清除',
        confirmColor: '#FF3B30',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await secret.clearKey();
    this.setData({ keySaved: false, keySealed: false, keyMasked: '' });
    wx.showToast({ title: '已清除', icon: 'none' });
  },

  /* 加密模式下拿不到明文 Key 时，打开页内口令面板，解锁后继续原来的动作 */
  async ensureKeyOrAsk(pendingAction) {
    const current = await secret.currentKey();
    if (current) return current;
    if (await secret.needsUnlock()) {
      this.setData({ unlockOpen: true, unlockInput: '', pendingAction });
      return '';
    }
    return '';
  },

  onUnlockInput(e) { this.setData({ unlockInput: e.detail.value }); },
  closeUnlock() { this.setData({ unlockOpen: false, unlockInput: '', pendingAction: '' }); },

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
    const action = this.data.pendingAction;
    this.setData({ unlockOpen: false, unlockInput: '', pendingAction: '' });
    if (action === 'refresh') this.refreshModels();
    else if (action === 'test') this.testConnection();
  },

  async refreshModels() {
    if (this.data.refreshing) return;
    this.setData({ refreshing: true });
    wx.showLoading({ title: '正在拉取模型' });
    try {
      const apiKey = await this.ensureKeyOrAsk('refresh');
      if (!apiKey) { wx.hideLoading(); this.setData({ refreshing: false }); return; }
      const root = ai.resolveRoot(this.data.baseURL);
      const models = await ai.refreshModels({ baseURL: root, apiKey });
      await ai.saveProfile({ models, modelsFetchedAt: Date.now() });
      this.setData({
        modelOptions: models,
        model: this.data.model || models[0] || '',
        lastTest: `已拉取 ${models.length} 个模型`,
      });
      wx.hideLoading();
      wx.showToast({ title: `拿到 ${models.length} 个模型`, icon: 'none' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ lastTest: err.message || '拉取失败' });
      wx.showToast({ title: err.message || '拉取失败', icon: 'none' });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  async testConnection() {
    if (this.data.testing) return;
    this.setData({ testing: true });
    wx.showLoading({ title: '正在测试' });
    try {
      const apiKey = await this.ensureKeyOrAsk('refresh');
      if (!apiKey) { wx.hideLoading(); this.setData({ refreshing: false }); return; }
      const models = await ai.refreshModels({ baseURL: this.data.baseURL, apiKey });
      this.setData({
        modelOptions: models,
        model: this.data.model || models[0] || '',
        lastTest: `连接正常，可用模型 ${models.length} 个`,
      });
      wx.hideLoading();
      wx.showToast({ title: '连接正常', icon: 'none' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ lastTest: err.message || '连接失败' });
      wx.showToast({ title: err.message || '连接失败', icon: 'none' });
    } finally {
      this.setData({ testing: false });
    }
  },

  gotoImport() {
    wx.navigateTo({ url: '/pages/ai-import/ai-import' });
  },
});
