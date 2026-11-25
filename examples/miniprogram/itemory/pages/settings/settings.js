/* Itemory 小程序 · 设置
   对应桌面版 SettingsPage 的一期范围：显示偏好、分类管理、标签管理、
   数据与备份入口、关于。桌面版的 AI 服务、封面裁剪、复核入口不在一期。 */

const store = require('../../utils/store.js');
const M = require('../../utils/model.js');

const app = getApp();

Page({
  data: {
    active: 'settings',
    theme: 'theme-auto',
    themeChoice: 'auto',
    layout: 'shelf',
    categories: [],
    tags: [],
    counts: { items: 0, moneyEntries: 0, tags: 0, exits: 0 },
    categoryEmojis: M.CATEGORY_EMOJI_CHOICES,
    tagColors: M.TAG_COLORS,
    catOpen: false,
    catId: '',
    catName: '',
    catEmoji: '📦',
    catIsSystem: false,
    tagOpen: false,
    tagId: '',
    tagName: '',
    tagColor: M.TAG_COLORS[0],
  },

  async onShow() {
    await app.ready();
    const prefs = app.globalData.prefs || {};
    this.setData({
      theme: `theme-${prefs.theme || 'auto'}`,
      themeChoice: prefs.theme || 'auto',
      layout: prefs.layout || 'shelf',
    });
    this.refresh();
  },

  refresh() {
    const state = store.getState();
    if (!state) return;
    this.setData({
      categories: store.categoriesSorted().map(c => ({
        id: c.id, name: c.name, emoji: M.categoryEmoji(c), isSystem: Boolean(c.isSystem),
      })),
      tags: store.tagsSorted().map(t => ({ id: t.id, name: t.name, color: t.color })),
      counts: {
        items: state.items.length,
        moneyEntries: state.moneyEntries.length,
        tags: state.tags.length,
        exits: state.exits.length,
      },
    });
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'settings') return;
    const paths = {
      items: '/pages/inventory/inventory',
      review: '/pages/review/review',
      stats: '/pages/statistics/statistics',
    };
    wx.reLaunch({ url: paths[tab] || paths.items });
  },

  /* ---------- 显示 ---------- */
  async pickTheme(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ themeChoice: value, theme: `theme-${value}` });
    await app.setPrefs({ theme: value });
  },

  async pickLayout(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ layout: value });
    await app.setPrefs({ layout: value });
  },

  /* ---------- 分类 ---------- */
  newCategory() {
    this.setData({ catOpen: true, catId: '', catName: '', catEmoji: '📦', catIsSystem: false });
  },

  editCategory(e) {
    const id = e.currentTarget.dataset.id;
    const category = this.data.categories.find(c => c.id === id);
    if (!category) return;
    this.setData({
      catOpen: true, catId: id, catName: category.name,
      catEmoji: category.emoji, catIsSystem: category.isSystem,
    });
  },

  closeCategory() { this.setData({ catOpen: false }); },
  onCatName(e) { this.setData({ catName: e.detail.value }); },
  pickCatEmoji(e) { this.setData({ catEmoji: e.currentTarget.dataset.emoji }); },

  async saveCategory() {
    const name = this.data.catName.trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }
    const icon = Object.keys(M.SYMBOL_EMOJI).find(key => M.SYMBOL_EMOJI[key] === this.data.catEmoji) || 'shippingbox.fill';
    try {
      await store.saveCategory({ id: this.data.catId || undefined, name, icon });
      this.setData({ catOpen: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  async deleteCategory() {
    if (!this.data.catId) return;
    if (this.data.catIsSystem) {
      wx.showToast({ title: '系统分类不能删除', icon: 'none' });
      return;
    }
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除这个分类？',
        content: '分类下的物品会变成「未分类」，物品本身不会删。',
        confirmText: '删除',
        confirmColor: '#FF3B30',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.deleteCategory(this.data.catId);
    this.setData({ catOpen: false });
    this.refresh();
  },

  /* ---------- 标签 ---------- */
  newTag() {
    this.setData({ tagOpen: true, tagId: '', tagName: '', tagColor: M.TAG_COLORS[(this.data.tags.length) % M.TAG_COLORS.length] });
  },

  editTag(e) {
    const id = e.currentTarget.dataset.id;
    const tag = this.data.tags.find(t => t.id === id);
    if (!tag) return;
    this.setData({ tagOpen: true, tagId: id, tagName: tag.name, tagColor: tag.color });
  },

  closeTag() { this.setData({ tagOpen: false }); },
  onTagName(e) { this.setData({ tagName: e.detail.value }); },
  pickTagColor(e) { this.setData({ tagColor: e.currentTarget.dataset.color }); },

  async saveTag() {
    const name = this.data.tagName.trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }
    try {
      await store.saveTag({ id: this.data.tagId || undefined, name, color: this.data.tagColor });
      this.setData({ tagOpen: false });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  },

  async deleteTag() {
    if (!this.data.tagId) return;
    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '删除这个标签？',
        content: '物品上的这个标签关联会一起移除。',
        confirmText: '删除',
        confirmColor: '#FF3B30',
        success: res => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    await store.deleteTag(this.data.tagId);
    this.setData({ tagOpen: false });
    this.refresh();
  },

  gotoBackup() {
    wx.navigateTo({ url: '/pages/backup/backup' });
  },

  gotoAISettings() {
    wx.navigateTo({ url: '/pages/ai-settings/ai-settings' });
  },

  gotoAIImport() {
    wx.navigateTo({ url: '/pages/ai-import/ai-import' });
  },
});
