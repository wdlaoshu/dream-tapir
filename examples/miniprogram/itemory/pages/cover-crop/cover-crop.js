/* Itemory 小程序 · 封面裁剪
   桌面版 CoverCropPage 的自由裁剪；这里做成正方形裁切：
   拖动平移 + 滑杆缩放，画布按 1024×1024 输出 PNG，再存成本地封面文件。

   说明：只有 Android / iOS / Harmony 能选图（Web 容器没有 chooseImage），
   所以这个页面天然只在这三端可达。 */

const store = require('../../utils/store.js');
const covers = require('../../utils/covers.js');

const app = getApp();
const OUTPUT_SIZE = 1024;

Page({
  data: {
    theme: 'theme-auto',
    src: '',
    ready: false,
    areaSize: 0,
    imageW: 0,
    imageH: 0,
    baseW: 0,
    baseH: 0,
    imgW: 0,
    imgH: 0,
    x: 0,
    y: 0,
    scale: 1,
    minScale: 1,
    maxScale: 3,
    saving: false,
  },

  onLoad(query) {
    const theme = (app.globalData.prefs && app.globalData.prefs.theme) || 'auto';
    const src = query && query.src ? decodeURIComponent(query.src) : '';
    this.setData({ theme: `theme-${theme}`, src });
  },

  async onReady() {
    if (!this.data.src) {
      wx.showToast({ title: '没有图片', icon: 'none' });
      return;
    }
    try {
      const info = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: this.data.src,
          success: resolve,
          fail: err => reject(new Error((err && err.errMsg) || '读不到图片尺寸')),
        });
      });
      const areaSize = await this.measureArea();
      if (!areaSize) throw new Error('无法测量裁剪区域');
      const naturalW = info.width;
      const naturalH = info.height;
      if (!naturalW || !naturalH) throw new Error('图片尺寸无效');
      const fit = Math.max(areaSize / naturalW, areaSize / naturalH);
      const baseW = naturalW * fit;
      const baseH = naturalH * fit;
      this.setData({
        areaSize,
        baseW,
        baseH,
        imgW: baseW,
        imgH: baseH,
        x: (areaSize - baseW) / 2,
        y: (areaSize - baseH) / 2,
        ready: true,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '图片加载失败', icon: 'none' });
    }
  },

  measureArea() {
    return new Promise(resolve => {
      const query = wx.createSelectorQuery();
      query.select('.crop-area').boundingClientRect(rect => {
        resolve(rect && rect.width ? rect.width : 0);
      }).exec();
    });
  },

  onMove(e) {
    if (!e.detail || e.detail.source === 'out-of-bounds') {
      /* 越界回弹时以组件值为准，避免我们的记录和实际位置不一致 */
      this.setData({ x: e.detail.x, y: e.detail.y });
      return;
    }
    this.setData({ x: e.detail.x, y: e.detail.y });
  },

  onScale(e) {
    const scale = Number(e.detail.value) || 1;
    const areaSize = this.data.areaSize;
    const imgW = this.data.baseW * scale;
    const imgH = this.data.baseH * scale;
    /* 以当前看到的中心点为锚点缩放，避免一缩放就跳走 */
    const centerX = areaSize / 2 - this.data.x;
    const centerY = areaSize / 2 - this.data.y;
    const ratioX = this.data.imgW ? centerX / this.data.imgW : 0.5;
    const ratioY = this.data.imgH ? centerY / this.data.imgH : 0.5;
    let x = areaSize / 2 - imgW * ratioX;
    let y = areaSize / 2 - imgH * ratioY;
    x = Math.min(0, Math.max(areaSize - imgW, x));
    y = Math.min(0, Math.max(areaSize - imgH, y));
    this.setData({ scale, imgW, imgH, x, y });
  },

  reset() {
    const areaSize = this.data.areaSize;
    this.setData({
      scale: 1,
      imgW: this.data.baseW,
      imgH: this.data.baseH,
      x: (areaSize - this.data.baseW) / 2,
      y: (areaSize - this.data.baseH) / 2,
    });
  },

  async save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '正在生成封面' });
    try {
      const k = OUTPUT_SIZE / this.data.areaSize;
      const ctx = wx.createCanvasContext('cropCanvas');
      ctx.drawImage(
        this.data.src,
        this.data.x * k,
        this.data.y * k,
        this.data.imgW * k,
        this.data.imgH * k
      );
      await new Promise((resolve, reject) => {
        ctx.draw(false, () => resolve());
      });
      const tempPath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvasId: 'cropCanvas',
          x: 0,
          y: 0,
          width: OUTPUT_SIZE,
          height: OUTPUT_SIZE,
          destWidth: OUTPUT_SIZE,
          destHeight: OUTPUT_SIZE,
          fileType: 'png',
          success: res => resolve(res.tempFilePath),
          fail: err => reject(new Error((err && err.errMsg) || '导出图片失败')),
        });
      });
      const asset = await covers.persistFromTemp(tempPath);
      await store.registerAsset(asset);
      app.globalData.coverCropResult = { assetId: asset.id, path: asset.path };
      wx.hideLoading();
      wx.navigateBack();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async saveOriginal() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '正在保存' });
    try {
      const asset = await covers.persistFromTemp(this.data.src);
      await store.registerAsset(asset);
      app.globalData.coverCropResult = { assetId: asset.id, path: asset.path };
      wx.hideLoading();
      wx.navigateBack();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
