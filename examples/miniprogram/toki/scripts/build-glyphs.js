/* 生成 assets/glyphs.wxss。
   图标形状来自 utils/icons.js，用 mask 渲染，颜色跟着元素的 color 走。
   改了图标后跑：node scripts/build-glyphs.js */

const fs = require('fs');
const path = require('path');
const { maskUrl, names } = require('../utils/icons.js');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets', 'glyphs.wxss');

const header = `/* 由 scripts/build-glyphs.js 生成，请勿手改。
   图标来自 toki 网页版的内联 SVG，这里用 CSS mask 着色：
   <view class="ico ico-email" style="color:#0a84ff"></view> */

`;

const base = `.ico {
  display: inline-block;
  flex: none;
  width: 36rpx;
  height: 36rpx;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.ico-sm { width: 28rpx; height: 28rpx; }
.ico-md { width: 32rpx; height: 32rpx; }
.ico-lg { width: 46rpx; height: 46rpx; }
.ico-xl { width: 64rpx; height: 64rpx; }
.ico-thin { width: 9rpx; height: 15rpx; }

`;

const rules = names().map(name => `.ico-${name} {
  -webkit-mask-image: ${maskUrl(name)};
  mask-image: ${maskUrl(name)};
}`).join('\n\n');

fs.writeFileSync(out, header + base + rules + '\n');
console.log('wrote', out, (header + base + rules).length, 'chars');
