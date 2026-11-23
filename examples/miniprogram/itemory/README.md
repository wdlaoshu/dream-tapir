# Itemory · 小程序版（一期）

个人物品档案与持有成本，移植自 [StarYunLee/Scripting](https://github.com/StarYunLee/Scripting) 的 Itemory 1.0.0（MIT）。

- 桌面版：Scripting App（iOS），TypeScript + SwiftUI 桥接 + SQLite（需要 Scripting Pro）
- 这一版：WXML/WXSS/JS，跑在 [Dimina](https://github.com/wdlaoshu/dream-tapir)（dream-tapir）上，Android / iOS / Harmony / Web 四端

一期范围是「能日常用起来」：物品增删改查、持有成本、流水、结束持有、统计、分类标签、JSON 备份。
桌面版里依赖平台能力的部分（SQLite、Keychain、主屏幕小组件、AI 识图、封面裁剪、`*.zip` 数据交换）没有移植，下面逐条说明替代方案。

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
| `pages/settings` | 外观、默认布局、分类管理、标签管理、备份入口 |
| `pages/backup` | 导出 JSON 到剪贴板、从剪贴板或手动粘贴导入（替换 / 追加合并）、示例数据、清空 |

底部导航是自绘的（`templates/tabbar.wxml`）：原生 `tabBar` 目前只在 Android / iOS / Harmony 有实现，Web 容器没有。

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
| AI 识图录入、透明物品图 | 未做 | 需要用户自备模型 Key，属于二期 |
| 复核（Review）页 | 未做 | 二期 |
| 封面裁剪 | 未做 | 二期 |

## 平台差异（重要）

- **封面选图只有原生三端能用。** `wx.chooseImage` 在 Web 容器没有实现，所以 Web 上点「选择封面」会提示不支持；物品图标用 Emoji，不受影响。
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
- 六个页面的逻辑与事件处理（含导航目标）
- WXML 标签闭合、绑定的事件处理函数是否真的存在
- 主包体积（当前约 203 KB）

**没有验证的部分**：本机跑不了 DMCC（`oxc-parser` 需要原生绑定），所以没有真正编译过；也没有在真机上点过。合并前请在电脑上跑一次 `cd fe && pnpm install && pnpm compile`。

## 许可

原项目 Itemory 是 MIT（Copyright (c) 2026 StarYunLee），移植版同样保持 MIT，并保留原项目声明。物品 Emoji 库（`data/emojis.js`）原样取自 `Itemory/models/preset-icons.ts`。
