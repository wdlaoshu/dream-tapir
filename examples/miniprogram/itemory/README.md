# Itemory · 小程序版（一期）

个人物品档案与持有成本，移植自 [StarYunLee/Scripting](https://github.com/StarYunLee/Scripting) 的 Itemory 1.0.0（MIT）。

- 桌面版：Scripting App（iOS），TypeScript + SwiftUI 桥接 + SQLite（需要 Scripting Pro）
- 这一版：WXML/WXSS/JS，跑在 [Dimina](https://github.com/wdlaoshu/dream-tapir)（dream-tapir）上，Android / iOS / Harmony / Web 四端

一期范围是「能日常用起来」：物品增删改查、持有成本、流水、结束持有、统计、分类标签、JSON 备份。
二期补上了回顾页、封面裁剪，以及 AI 识图录入（含接口配置与本机密钥加密）。
桌面版里依赖平台能力的部分（SQLite、Keychain、主屏幕小组件、透明物品图、`*.zip` 数据交换）没有移植，下面逐条说明替代方案。

## 跑起来

```bash
# 在 dream-tapir 仓库里
cd fe
pnpm install
pnpm compile          # 产出小程序资源包

# 小程序源码在这里
examples/miniprogram/itemory
```

也可以把 `examples/miniprogram/itemory` 单独用微信开发者工具打开（`project.config.json` 已经就位，appid 是 `touristappid`）。

## 页面

| 页面 | 做什么 |
| --- | --- |
| `pages/inventory` | 物品列表：置物架网格 / 时间线列表两种布局，搜索、分类筛选、状态筛选、四种排序（添加时间、累计投入、陪伴时间、日均成本） |
| `pages/item` | 物品详情：成本小结、基础信息、时间线；记支出 / 记收入 / 结束持有 / 编辑 / 删除 |
| `pages/item-edit` | 新增与编辑：名称、分类、购入日期、购入价、状态、标签、Emoji 图标、封面、渠道、保修、备注 |
| `pages/money-edit` | 记一笔：方向、类型（配件 / 保养 / 维修 / 升级 / 其他）、金额、日期、事项、备注 |
| `pages/exit-edit` | 结束持有：出售 / 赠送 / 丢弃 / 遗失，出售才填回收金额 |
| `pages/statistics` | 期间投入与回收、物品去向、现金流（按月 / 按年）、分类投入、额外支出构成、陪伴时长分布、日均成本排行、到期与缺口预警 |
| `pages/review` | **二期** 回顾：按购入年份与顺序翻物品，跨年分组，点回详情 |
| `pages/settings` | 外观、默认布局、分类管理、标签管理、AI 入口、备份入口 |
| `pages/ai-settings` | **二期** AI 服务：接口地址、API Key（可选口令加密）、接口形态、模型、推理强度、自定义提示词、数据外发同意 |
| `pages/ai-import` | **二期** 识图录入：选订单截图/物品照片 → 识别 → 结果核对 → 带草稿进编辑页 |
| `pages/cover-crop` | **二期** 封面裁剪：拖动 + 缩放，输出 1024×1024 PNG |
| `pages/backup` | 导出 JSON 到剪贴板、从剪贴板或手动粘贴导入（替换 / 追加合并）、示例数据、清空 |

底部导航是自绘的四页（物品 / 回顾 / 统计 / 设置）：原生 `tabBar` 目前只在 Android / iOS / Harmony 有实现，Web 容器没有。

## 二期的三块

**AI 识图录入**。协议层是从桌面版 `services/ai-vision.ts` 搬的，不是重新设计的：

- 接口地址规范化（必须 HTTPS、去掉 `/models`、`/chat/completions`、`/responses` 后缀、自动补 `/v1`）
- 提示词与输出契约原样保留（不许猜价格、不许编日期、必须单件、币种必须明确）
- 结果解析的降级规则：金额归属不明就留空、多候选物品直接拒绝、备注里的订单号/收件人/手机号在本地过滤掉并提示核对
- 服务端明确拒绝 `response_format` / `reasoning` / `temperature` 时自动去掉该参数重试，最多 4 次
- 识图结果只是草稿：预填到编辑页后仍走编辑页的校验才落库

**本机密钥**。桌面版用 Keychain，小程序没有。这里给两种模式：明文保存（首次配好就能用，界面会明确写「明文」），或本地口令加密——`PBKDF2(SHA-256, 100000)` 派生 + `AES-256-GCM`（`utils/crypto.js`，算法之前给 Toki 小程序写过并与 Node `crypto` 逐字节对拍过）。加密模式下冷启动第一次用 AI 时输一次口令，只把明文留在会话内存里。这不是 Keychain 的等价物：忘了口令只能重填 Key。

**回顾页与封面裁剪**。回顾按购入年份与顺序浏览，副标题口径同桌面版（价格 · 渠道，或「于某日已出售」）。封面裁剪用 `movable-view` 拖动 + 滑杆缩放，画布输出 1024×1024 PNG 存成封面文件。

## 和桌面版的口径一致

这些是从 `Itemory/domain/` 和 `Itemory/services/statistics.ts` 逐条搬过来的，不是重新发明的：

- 金额一律**整数分**，`null` 表示未知、`0` 表示免费；输入用「元」，最多两位小数，不做四舍五入补精度。
- 陪伴天数 = 严格日历差 + 1（购入当天算 1 天）；结束日期不得早于购入日期。
- 累计投入 = 购入价 + 全部支出；累计回收 = 全部收入 + 出售回收；净支出 = 投入 − 回收（允许为负）；日均 = 净支出 ÷ 陪伴天数，四舍五入到分。
- 非出售的退出原因不能带回收金额；结束持有后发生的流水标为「结束持有后」。
- 日期不能晚于今天；金额溢出时该指标记为「未知」，不用 0 或截断值冒充。
- 统计的区间规则与桌面版相同：全部时间按年分桶，具体年份固定 12 个月分桶；状态分布按「该年购入物品的当前去向」算。

字段名（`acquisitionAmountMinor`、`holdingCondition`、`exitReason` 等）与枚举值和桌面版一致，导出的 JSON 也是同样的记录形状。

## 和桌面版的差别

| 桌面版 | 这一版 | 原因 |
| --- | --- | --- |
| SQLite（Scripting Pro） | 一份 JSON 存在 `wx storage` 的 `itemory.v1` 键 | 小程序没有 SQLite |
| Keychain | 无凭据存储需求（一期没有 AI Key） | — |
| 主屏幕小组件 | 无 | 小程序没有桌面小组件形态 |
| SF Symbols 图标 | Emoji（分类符号有映射表，物品图标直接用桌面版的 Emoji 库） | 小程序没有 SF Symbols |
| 封面 PNG 存 SQLite blob | 存 `USER_DATA_PATH/covers/*.png`，记录里留 `assetId` | 需要真实文件路径 |
| `.itemory`（SQLite 文件）备份 | JSON（封面内嵌 data URL） | 没有 SQLite 解析，四端也没有稳定的 zip 链路 |
| `.zip` 数据交换包 | 未做 | 同上 |
| AI 识图录入 | 已做（二期），需自备 OpenAI 兼容接口与 Key | — |
| Keychain 存 Key | 本机 storage，可选口令加密 | 没有 Keychain |
| 透明物品图（GPT Image） | 未做 | 需要 multipart 图片编辑接口，四端 `uploadFile` 行为不一致 |
| 复核（Review）页 | 简版「回顾」页 | 桌面版还带封面置物架模式与分页 |

## 平台差异（重要）

- **封面选图与 AI 识图只有原生三端能用。** `wx.chooseImage` 在 Web 容器没有实现，所以 Web 上这两个入口都会明确提示；物品图标用 Emoji，不受影响。
- **裁剪导出走 `canvasToTempFilePath`**，这是小程序侧路径；Web 端本来选不了图，所以不受影响，但没有验证 Web canvas 的导出行为。
- **Web 的 `USER_DATA_PATH` 是本会话临时文件**，封面在 Web 上本来也选不了，不需要处理持久化。
- `wx.setStorageSync` 在 Web 没有实现，所以存储层统一用异步 `setStorage` / `getStorage`。
- 二维码/相机/定位这类没有用到，无需宿主权限。

## 验证情况

```bash
cd examples/miniprogram/itemory
node scripts/smoke-test.js
```

这个脚本把小程序运行时用最小桩跑起来（storage、文件、剪贴板、弹窗、导航都是内存实现），覆盖：

- 日期与金额换算、成本口径（含坏数据降级、出售回收）
- 时间线节点与排序
- 存储层：默认分类、物品/流水/结束持有的增删改、重复名称拦截、删除分类后的引用置空
- 视图层：搜索、分类与状态筛选、四种排序、详情文案
- 统计：期间投入、分类归集、支出构成、空数据不炸
- 导出 → 替换导入 → 合并导入（重复跳过）、坏备份拦截
- AI 协议：地址规范化、模型解析、提示词含契约、结果解析（隐私过滤 / 金额归属 / 多候选拒绝）、请求形状与参数降级重试
- 密钥：明文与口令加密两种模式、错误口令、解锁后继续动作（页内口令面板）
- 识图录入 → 草稿 → 编辑页预填的完整链路；封面裁剪 → 回到编辑页替换旧封面
- 回顾页的年份筛选、顺序切换与跨年分组
- 十个页面的逻辑与事件处理（含导航目标）
- WXML 标签闭合、绑定的事件处理函数是否真的存在
- 主包体积（当前约 308 KB）

**没有验证的部分**：本机跑不了 DMCC（`oxc-parser` 需要原生绑定），所以没有真正编译过；也没有在真机上点过。合并前请在电脑上跑一次 `cd fe && pnpm install && pnpm compile`。

## 许可

原项目 Itemory 是 MIT（Copyright (c) 2026 StarYunLee），移植版同样保持 MIT，并保留原项目声明。物品 Emoji 库（`data/emojis.js`）原样取自 `Itemory/models/preset-icons.ts`。
