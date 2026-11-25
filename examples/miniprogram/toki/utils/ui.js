/* Toki 小程序 · 界面小工具：主题、提示、确认、导航 */

const THEME_CLASS = { light: 'theme-light', dark: 'theme-dark', auto: 'theme-auto' };

function themeClass(prefs) {
  return THEME_CLASS[(prefs && prefs.theme) || 'auto'] || 'theme-auto';
}

/* 导航栏跟随主题；不支持的容器安静跳过 */
function applyNav(prefs) {
  const t = (prefs && prefs.theme) || 'auto';
  const light = t === 'light';
  if (typeof wx === 'undefined' || typeof wx.setNavigationBarColor !== 'function') return;
  try {
    wx.setNavigationBarColor({
      frontColor: light ? '#000000' : '#ffffff',
      backgroundColor: light ? '#f2f2f7' : '#000000',
      fail: () => {},
    });
  } catch (e) { /* 容器不支持就保持默认 */ }
}

function toast(msg) {
  wx.showToast({ title: String(msg || ''), icon: 'none', duration: 1800 });
}

function confirm(title, content, confirmText, confirmColor) {
  return new Promise(resolve => {
    wx.showModal({
      title: title || '确认',
      content: content || '',
      confirmText: confirmText || '确定',
      confirmColor: confirmColor || '#ff453a',
      cancelText: '取消',
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    });
  });
}

/* 四个底部页面之间切换用 redirectTo，避免页面栈越堆越深 */
function goTab(url) {
  wx.redirectTo({ url, fail: () => wx.navigateTo({ url }) });
}

function go(url) {
  wx.navigateTo({ url });
}

function back() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  if (pages.length > 1) wx.navigateBack({ delta: 1 });
  else wx.redirectTo({ url: '/pages/home/home' });
}

module.exports = { themeClass, applyNav, toast, confirm, goTab, go, back };
