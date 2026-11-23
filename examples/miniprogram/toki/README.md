# Toki · 小程序版

[Toki](https://github.com/wdlaoshu/toki) 的 Dimina（星河小程序）移植版：邮箱、手机号、第三方登录身份，网站与 App 账号，以及 API 密钥的关系管理。数据只保存在本机。

一期目标是把四个页面跑通：**账号**、**网站**、**密钥**、**关系图**，加上增删改查、本地存储、JSON 导入导出、隐私打码和深浅色。加密同步（Gitee / GitHub 私密 Gist）和自定义图标属于二期，见文末。

## 怎么跑

```sh
cd fe
pnpm install
pnpm compile          # 编译 examples/miniprogram 下的小程序
pnpm dev              # 起 Web 容器与代理
```

需要 Node.js ≥ 22.22.3 与 pnpm ≥ 12.2.0。也可以把 `examples/miniprogram/toki` 放进微信开发者工具单独预览（`project.config.json` 里 appid 是 `touristappid`，正式 appid 换成自己的）。

## 结构

```text
toki/
├── app.js                    入口：加载数据、首次写入示例数据
├── app.json                  页面与窗口配置
├── app.wxss                  设计变量、卡包、列表、表单等公共样式
├── project.config.json
├── data/presets.js           内置平台表（网站 111 条、密钥平台 24 条）
├── utils/
│   ├── model.js              数据模型与纯函数：打码、品牌色、平台归并、示例数据
│   ├── store.js              存储适配（wx.setStorage）与导入导出
│   ├── view.js               页面视图模型，WXML 直接渲染
│   └── ui.js                 主题、提示、确认、导航
├── templates/tabbar.wxml     四页共用的底部导航
└── pages/
    ├── home/                 账号卡包 + 当前身份的网站网格
    ├── sites/                网站与 App，按分类分组
    ├── tokens/               密钥列表，复制 / 显示 / 编辑
    ├── graph/                身份 → 平台 → 密钥 关系图
    ├── identity-edit/        邮箱、手机号、微信 / Apple 登录
    ├── account-edit/         网站与 App，关联多个身份
    ├── token-edit/           密钥，平台、有效期、关联账号
    └── backup/               导出 / 导入 JSON
```

## 和网页版的取舍

数据格式与网页版完全一致，`atlas.v1` 的 `{identities, accounts, tokens}`、`version: 3`、`expiresAt: 0` 表示无限期，导出的 JSON 两边可以互相导入。

已经对齐的：

- 三类身份（邮箱 / 手机号 / 微信·Apple 登录）、卡面色板、eSIM 标记、登录身份绑定的手机号
- 网站与 App 的多身份关联、手填分类、账号名、备注
- 密钥的平台 / 用途名称分离、默认打码、有效期、精确关联到同平台的具体账号
- 关系图三列结构：同平台只显示一个节点
- 隐私打码、深浅色（跟随系统 / 强制浅色 / 强制深色）

一期换掉或没做的：

| 网页版 | 小程序版 | 原因 |
| --- | --- | --- |
| 内联 SVG 图标 | 首字母 + 品牌色方块 | WXML 不渲染 SVG；一期不做图标资源 |
| 远程 favicon / 自定义图标 | 无 | 需要域名白名单与图片剪裁 |
| coverflow 卡片动画 | `swiper` 滑动 | 不依赖逐帧几何计算，四端一致 |
| SVG 贝塞尔连线 + 描边动画 | 旋转 2rpx 直线 | 不用 canvas，避免四端 canvas 差异 |
| 加密同步（PBKDF2 + AES-GCM） | 无 | 逻辑层没有 Web Crypto，纯 JS 实现性能差，二期再定 |
| PWA / 主屏图标 | 无 | 小程序没有对应概念 |

## 已知限制

- 底部导航是自绘的：原生 `tabBar` 目前只在 Android / iOS / Harmony 支持，Web 容器没有，所以四页各自渲染 `templates/tabbar.wxml`。
- 存储走异步的 `wx.setStorage`：`setStorageSync` 在 Web 容器里没有实现。
- 关系图的连线是直线，节点多的时候会交叉；二期换成 canvas 再补贝塞尔曲线和分组收缩。
- 导出用剪贴板而不是文件：原生端的「存文件」每个平台表现不同，剪贴板四端一致。

## 许可

Toki 代码采用 [GPL-3.0](https://github.com/wdlaoshu/toki/blob/main/LICENSE)，本站移植版同样以 GPL-3.0 发布并保留原项目声明。内置平台名称与图标归各自所有者。
