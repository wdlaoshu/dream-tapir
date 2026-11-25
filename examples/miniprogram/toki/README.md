# Toki · 小程序版

[Toki](https://github.com/wdlaoshu/toki) 的 Dimina（星河小程序）移植版：邮箱、手机号、第三方登录身份，网站与 App 账号，以及 API 密钥的关系管理。数据默认只存在本机，也可以开启端到端加密同步。

## 功能

- **账号卡包**：邮箱 / 手机号 / 微信 / Apple 登录三类身份，卡面渐变、eSIM 标记、登录身份绑定的手机号
- **网站与 App**：一个账号可以关联多个身份，手填分类、账号名、自定义图标
- **密钥**：平台与用途名称分开，默认打码，可设有效期，精确关联到同平台的具体账号
- **关系图**：身份 → 平台 → 密钥三列，同一平台只显示一个节点，连线是 SVG 贝塞尔曲线
- **备份**：导出 JSON 到剪贴板，导入支持合并与覆盖，格式与网页版、Scripting 版互通
- **加密同步**：数据在本机用同步密码加密（PBKDF2 → AES-256-GCM），再存进自己的 Gitee / GitHub 私密 Gist
- **隐私打码、深浅色**（跟随系统 / 强制浅色 / 强制深色）

## 怎么跑

```sh
cd fe
pnpm install
pnpm compile          # 编译 examples/miniprogram 下的小程序
pnpm dev              # 起 Web 容器与代理
```

需要 Node.js ≥ 22.22.3 与 pnpm ≥ 12.2.0。也可以把 `examples/miniprogram/toki` 放进微信开发者工具单独预览（`project.config.json` 里 appid 是 `touristappid`，换成自己的）。注意主包体积：内置平台图标约 570 KB。

不跑容器也可以验证逻辑：

```sh
node scripts/smoke-test.js
```

它用最小运行时桩把 App 启动和四个页面跑一遍，并跟 Node 自带的 `crypto` 对拍 SHA-256 / PBKDF2 / AES-256-GCM。不联网，`wx.request` 是内存里的假 Gist。

## 结构

```text
toki/
├── app.js                    入口：加载数据、首次写入示例数据、启动同步
├── app.json / app.wxss       页面配置与设计变量
├── assets/
│   ├── icons/                内置平台图标（toki web/icons 缩到 96px，112 个）
│   ├── icons.wxss            域名 → 图标类名
│   ├── icon-class.js         同一份映射，供视图模型用
│   └── glyphs.wxss           由 scripts/build-glyphs.js 生成的 SVG mask 图标
├── data/presets.js           内置平台表（网站 111 条、密钥平台 24 条）
├── templates/
│   ├── tile.wxml             通用图标块：身份 SVG / 平台 PNG / 自定义图片 / 首字母
│   └── tabbar.wxml           四页共用的底部导航
├── utils/
│   ├── model.js              数据模型与纯函数：打码、品牌色、平台归并、示例数据
│   ├── store.js              本地存储、导入合并、变更订阅
│   ├── view.js               页面视图模型
│   ├── icons.js              SVG 图标形状（与网页版同一批 path）
│   ├── crypto.js             纯 JS SHA-256 / HMAC / PBKDF2 / AES-256-GCM
│   ├── sync.js               Gist 同步、合并规则、状态
│   └── ui.js                 主题、提示、确认、导航
├── scripts/
│   ├── build-glyphs.js       重新生成 assets/glyphs.wxss
│   └── smoke-test.js         本地冒烟测试
└── pages/
    ├── home/ sites/ tokens/ graph/          四个主页面
    ├── identity-edit/ account-edit/ token-edit/   增删改
    ├── backup/ sync/                        备份与加密同步
```

## 图标为什么是「SVG + mask」

WXML 不认识内联 SVG，但 WebView 认识 CSS mask。所以图标的 path 数据原样保留在 `utils/icons.js`，编译期生成 `assets/glyphs.wxss`：

```css
.ico-email { -webkit-mask-image: url('data:image/svg+xml,…'); mask-image: … }
```

使用时 `<view class="ico ico-email" style="color:#0a84ff"></view>`，形状是原 SVG，颜色跟着 `color` 走，深浅色主题和卡面配色都不用重新生成图标。

平台图标用 toki 自带的 PNG（缩到 96px），按域名生成 `.fav-github-com` 这样的类名。编译器不支持 `<image src>` 动态指向包内文件，用 CSS 类绕开。

## 和网页版的差异

数据格式完全一致：`atlas.v1` 的 `{identities, accounts, tokens}`、`version: 3`、`expiresAt: 0` 表示无限期；同步的密文格式也一致（`{v, salt, iv, ct, at}`，PBKDF2 310000 次，AES-GCM 96 位 IV，密文拼 tag），所以同一个 Gist 可以和网页版共用。

| 网页版 | 小程序版 | 原因 |
| --- | --- | --- |
| coverflow 逐帧动画 | `swiper` 滑动 | 不依赖逐帧几何计算，四端一致 |
| App Store 搜图、远程 favicon 回退 | 内置 PNG，缺图时首字母 | 少一层网络依赖，包内可控 |
| 自定义图标用 canvas 裁成 128px | 直接读图转 data URL，超过 400 KB 不存 | 逻辑层没有 canvas 绘制上下文 |
| PWA / 主屏图标 | 无 | 小程序没有对应概念 |

## 已知限制

- 底部导航是自绘的：原生 `tabBar` 目前只在 Android / iOS / Harmony 支持，Web 容器没有。
- 存储走异步的 `wx.setStorage`：`setStorageSync` 在 Web 容器里没有实现。
- **开启同步时**要跑 31 万次 PBKDF2。逻辑层没有 Web Crypto，这里是纯 JS 实现，手机上一把可能要十几秒到一分钟，界面有进度显示；派生出的密钥缓存在本机，之后的同步不再重算。同步密码忘掉就只能重开。
- 生成的 IV 用的是 `Math.random` 加时间抖动，不是密码学安全随机数（逻辑层没有 `crypto.getRandomValues`）。密文本身仍是 AES-GCM。
- 选图（`chooseImage`）在 Web 容器里没有实现，自定义图标只在原生端可用。
- 关系图节点多时会横向拥挤，连线是直线起点的贝塞尔，暂时没有分组折叠。

## 许可

Toki 代码采用 [GPL-3.0](https://github.com/wdlaoshu/toki/blob/main/LICENSE)，本移植版同样以 GPL-3.0 发布并保留原项目声明。内置平台名称与图标归各自所有者。
