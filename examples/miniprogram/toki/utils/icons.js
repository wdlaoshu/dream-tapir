/* Toki 小程序 · 图标
   全部沿用 toki 网页版的内联 SVG（web/app.js 的 ICON、web/tokens.js 的 ICON_*），
   这里是同一批 path 数据，只是改成用 CSS mask 渲染：
   mask 只关心形状和不透明度，颜色由元素的 background-color（也就是 currentColor）决定，
   所以同一个图标在任何主题、任何卡面颜色下都不用重新生成。

   assets/glyphs.wxss 由 scripts/build-glyphs.js 从这里生成，改图标后跑一次脚本即可。 */

const ICONS = {
  email: { vb: '0 0 24 24', body: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/>' },
  phone: { vb: '0 0 24 24', body: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M10.5 5h3"/>' },
  login: { vb: '0 0 24 24', body: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>' },
  wechat: {
    vb: '0 0 24 24',
    body: '<path d="M9.5 4C5.4 4 2.5 6.6 2.5 9.8c0 1.8 1 3.4 2.5 4.5l-.6 2.2 2.6-1.4c.8.2 1.6.3 2.5.3h.4"/><path d="M15.3 9.3c-3.4 0-6.1 2.3-6.1 5.1s2.7 5.1 6.1 5.1c.7 0 1.4-.1 2-.3l2.2 1.2-.5-1.9c1.5-.9 2.4-2.4 2.4-4.1 0-2.8-2.7-5.1-6.1-5.1Z"/><circle class="f" cx="7" cy="8.6" r=".9"/><circle class="f" cx="11.4" cy="8.6" r=".9"/><circle class="f" cx="13.4" cy="13.8" r=".8"/><circle class="f" cx="17.2" cy="13.8" r=".8"/>',
  },
  apple: {
    vb: '0 0 24 24',
    body: '<path class="f" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-.9-2.4-4ZM14 5.3c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3Z"/>',
  },
  card: { vb: '0 0 24 24', body: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19"/>' },
  grid: { vb: '0 0 24 24', body: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>' },
  key: { vb: '0 0 24 24', body: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10.2 12.8 20 3M16.5 3H20v3.5"/>' },
  graph: { vb: '0 0 24 24', body: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M8.2 10.8 15.8 7.4M8.2 13.2l7.6 3.4"/>' },
  chip: {
    vb: '0 0 40 30',
    body: '<rect x=".5" y=".5" width="39" height="29" rx="6"/><path d="M13 .5v9M27 .5v9M13 20.5v9M27 20.5v9M.5 10h12.5c2 0 2 10 0 10H.5M39.5 10H27c-2 0-2 10 0 10h12.5M13 15h14"/>',
  },
  chev: { vb: '0 0 9 15', body: '<path d="M1.5 1.5 7.5 7.5l-6 6"/>' },
  plus: { vb: '0 0 24 24', body: '<path d="M12 5v14M5 12h14"/>' },
  tick: { vb: '0 0 24 24', body: '<path d="m5 12.5 4.5 4.5L19 7.5"/>' },
  check: { vb: '0 0 24 24', body: '<path d="m5 12.5 4.5 4.5L19 7.5"/>' },
  edit: { vb: '0 0 24 24', body: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>' },
  copy: { vb: '0 0 24 24', body: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>' },
  trash: { vb: '0 0 24 24', body: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>' },
  open: { vb: '0 0 24 24', body: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>' },
  x: { vb: '0 0 24 24', body: '<path d="M6 6l12 12M18 6 6 18"/>' },
  eye: { vb: '0 0 24 24', body: '<path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>' },
  eyeOff: { vb: '0 0 24 24', body: '<path d="M3 3l18 18M10.6 6.2A9.9 9.9 0 0 1 12 6c5.9 0 9.5 6 9.5 6a15 15 0 0 1-3.1 3.7M6.5 7.6A15 15 0 0 0 2.5 12s3.6 6 9.5 6a9.7 9.7 0 0 0 4-.9"/><path d="M9.8 9.8a3 3 0 0 0 4.4 4.4"/>' },
  search: { vb: '0 0 24 24', body: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>' },
  dots: { vb: '0 0 24 24', body: '<circle class="f" cx="6" cy="12" r="1.3"/><circle class="f" cx="12" cy="12" r="1.3"/><circle class="f" cx="18" cy="12" r="1.3"/>' },
  photo: { vb: '0 0 24 24', body: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17.5 5-4.5 4 3.5 3-2.5 4 3.5"/>' },
  reset: { vb: '0 0 24 24', body: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>' },
  cloud: { vb: '0 0 24 24', body: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9a4 4 0 0 1-.5 9H7Z"/>' },
  sun: { vb: '0 0 24 24', body: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>' },
  moon: { vb: '0 0 24 24', body: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>' },
  order: { vb: '0 0 24 24', body: '<path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5"/>' },
  download: { vb: '0 0 24 24', body: '<path d="M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>' },
  upload: { vb: '0 0 24 24', body: '<path d="M12 3v12M7 10l5 5 5-5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>' },
};

/* mask 只取透明通道，所以图形一律画成不透明黑；颜色交给 background-color */
function glyphSvg(name) {
  const ic = ICONS[name];
  if (!ic) return '';
  const body = ic.body.replace(/class="f"/g, 'fill="#000" stroke="none"');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ic.vb}" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function maskUrl(name) {
  return `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(name))}')`;
}

const names = () => Object.keys(ICONS);

module.exports = { ICONS, glyphSvg, maskUrl, names };
