---
title: 声明式 UI（SDUI）
slug: docs/client/sdui
description: spec → Widget 渲染层、组件词表与 JS 生产者
sidebar:
  order: 19
  label: 声明式 UI
---

`lib/core/ui/sdui/` 是一层**声明式 UI 运行时**：吃一份 JSON 树（spec），用本应用的设计系统渲染成真实 Widget。

它不是插件系统，也不依赖插件系统才有用。生产 spec 的可以是：

- Dart 代码（把一个反复出现的卡片形状抽成数据）
- cloud control 下发的文档（不发版调整一块布局）
- 跑在 fjs 沙箱里的脚本（见 [更新与热更新](/docs/client/updates/)）

渲染器不认识生产者，只认识 spec。

## 边界

| | 属于 SDUI | 不属于 SDUI |
|--|----------|------------|
| 出图 | 组件词表内的节点 | 任意 Flutter Widget |
| 样式 | token 名（`'md'` / `'primary'` / `'titleLarge'`） | 具体数值、色值、字号 |
| 交互 | 动作名 + 数据（`{'type':'navigate','route':...}`） | 回调、闭包、Dart 代码 |
| 能力 | 无 | 网络、文件、导航、凭证 |

spec 是**数据**，不是代码：它不能持有函数，也不能自己发起任何副作用。所有副作用都表现为一个具名动作，交给宿主的 `AppSduiActionSink` 决定要不要执行、怎么执行。

## 文档结构

```json
{
  "sdui": 1,
  "id": "water-bill-card",
  "data": { "title": "水电费" },
  "root": {
    "type": "column",
    "spacing": "md",
    "children": [
      { "type": "text", "value": "{{title}}", "style": "titleLarge" },
      { "type": "dataRow", "$each": "rooms", "title": "{{item.name}}",
        "subtitle": "{{item.balance}} 元" }
    ]
  }
}
```

- `sdui`：版本号。不匹配直接拒绝，不做兼容猜测。
- `root`：根节点。也可以整个文档就是一个裸节点。
- `data`：随文档下发的静态数据，作为绑定的兜底层。
- 节点：`type` + `children` 是结构键，`$` 前缀是控制键，其余都是组件 prop。

## 控制键

| 键 | 作用 |
|----|------|
| `$each` | 按集合重复本节点，元素绑定为 `item`、下标为 `index` |
| `$as` / `$index` | 改这两个绑定名 |
| `$when` | 值为假时整个节点不渲染 |
| `$key` | 重复时的稳定身份，避免重建丢状态 |
| `$slot` | 命名子槽，供多槽组件使用 |

绑定写法两种：字符串里的 `{{path}}` 插值（结果是文本），以及 `{"$state": "path"}`（保留原类型，给数字/布尔 prop 用）。

名字解析顺序：`$each` 局部变量 → `AppSduiStore`（运行时状态）→ spec `data`。

## 组件词表

| 分组 | 组件 |
|------|------|
| 布局 | `column` `row` `wrap` `stack` `positioned` `padding` `sized` `expanded` `spacer` `divider` `center` `align` `box` `scroll` `list` `grid` `frame` |
| 内容 | `text` `icon` `image` `badge` |
| 控件 | `button` `iconButton` `chip` `buttonRow` |
| 容器与行 | `card` `section` `cardColumn` `dataRow` `dataCard` `flatTile` `infoRow` `expansion` |
| 表单 | `form` `submitButton` `textField` `searchField` `dropdown` `checkbox` `switchField` `radioGroup` `slider` |
| 反馈 | `loading` `empty` `error` `progress` |

每个组件都映射到既有 facade（`AppSurfaceCard`、`AppDataRow`、`AppFilledButton`、`AppSkin.button` …），所以三套 design language 下的观感、按压反馈、busy/enabled 契约都由设计系统提供，spec 无从绕过。

机器可读的词表（含每个 prop 的类型与取值）由 `appSduiComponentReference()` 生成，与校验器共用同一份描述符，不会和实际渲染漂移。

`list` / `grid` 绑定 `items` 时按模板懒加载；`$each` 是一次性展开，适合短集合。

## 表单

带 `name` 的字段直接读写 `AppSduiStore`：输入 → 写 store → store 通知 → 树重建。同屏任何 `{{path}}` 在同一帧更新，**不需要回调生产者重算布局**。

`form` + `submitButton` 走 Flutter 的 `Form` 校验；`submitButton` 的动作 payload 里带 `values`（store 快照）。

## 动作

```json
{ "type": "button", "label": "缴费",
  "action": { "type": "navigate", "route": "/campus/waterElectricFee" } }
```

- 内置类型（渲染器自己处理，不需要宿主）：`set` / `merge` / `reset`，只改 store。
- 其余一律交给宿主的 `AppSduiActionSink`。导航必须由宿主用 `pushGuarded` / `goGuarded` 实现，spec 不能直接驱动路由。
- `action` 可以是数组，按序执行（长度有上限）。
- 组件会把用户刚产生的值合并进 payload（chip 的 `selected`、字段的 `value`、submit 的 `values`），spec 不必预测它。
- 没有 sink 时动作是 no-op，所以预览面可以随便点。

## 图片

默认只允许 bundle asset，且路径必须在白名单前缀下、不含 `..`。网络图要宿主显式开 `AppSduiImagePolicy(allowNetwork: true)`，且只接受 `https`；需要 CDN 白名单就传 `networkValidator`。被拒的源报 issue 并画兜底图标，不会出现破图。

## 失败语义

预算见 `AppSduiLimits`：深度 32、节点 4096、单节点子项 512、文本 8192 字符、spec 1 MB、脚本 512 KB、`$each` 512 次、列表 2000 项。

| 情况 | 行为 |
|------|------|
| 结构不合法（版本、缺 `type`、超预算、非 JSON 值） | **整份拒绝**，返回 issue 列表；`AppSduiDocument` 画 `fallback` |
| 组件未注册 | 报 issue，该节点跳过（或 placeholder），其余照常渲染 |
| prop 未声明 / 类型不对 / token 不认识 | 报 issue，该 prop 用兜底值 |
| 绑定路径解析不到 | 插值成空串，`$each` 报 issue 并跳过 |

原则是**结构错误拒绝、语义错误降级**：一份远端布局里的一个错字不该白屏，但一份结构就不对的文档不该被猜。

issue 全部通过 `onIssue` 出去，错误码稳定（`AppSduiIssueCodes`）。发布环境可以不接，开发生产者时必须接。

`AppSduiView.validate` 默认在挂载时对整棵树做一次 catalog 校验；只想要渲染期的 issue 就关掉它。

## JS 生产者

`core/scripting/sdui_js_prelude.dart` 提供一个 ES 模块 `luotopia:sdui`，脚本这样写：

```js
import { spec, column, text, card, dataRow, each } from 'luotopia:sdui';

export function render(input) {
  return spec(column({ spacing: 'md' },
    text(input.title, { style: 'titleLarge' }),
    card({ padding: 'base' },
      dataRow({ ...each('rooms'), title: '{{item.name}}' }),
    ),
  ));
}
```

`AppSduiJsRenderer` 跑它并产出 `AppSduiSpec`。沙箱姿态与热更新解析器、Agent 脚本工具**完全一致**：`JsBuiltinOptions.none()`（无 fetch / fs / timers）、`initWithoutBridge()`（无 Dart 桥）、32 MB 内存 / 512 KB 栈、每次调用新建 engine、硬超时。

也就是说 `render(input)` 是**纯函数**：它只能根据输入算出一份布局，拿不到宿主任何东西。要网络、要凭证，得先有能力桥，那是另一层决策，不在这一层里。

失败原因分得很细（`AppSduiJsFailure`）：引擎不可用 / 超时 → 回退，脚本错误 → 把 detail 交回作者，spec 被拒 → 说明脚本跑通了但产物这版画不了。

## 新增组件

1. 在 `app_sdui_components_*.dart` 里加 builder + 描述符（prop 类型、子节点数量、必填项）
2. JS 侧要能写就在 prelude 加一个 builder（`sdui_js_prelude_test.dart` 会检查两边不同步）
3. 业务组件不要放 `core/ui`：在 feature 里注册进 catalog，再 `merge` 到核心词表上

## 相关

- [子应用目录](/docs/client/campus-sub-apps/)
- [更新与热更新](/docs/client/updates/)
- [组件](/docs/client/components/)
- [云控](/docs/client/cloud-control/)
