---
title: 多端适配
slug: docs/client/multi-platform
description: 平台分支、鸿蒙适配与宽屏布局约定
sidebar:
  order: 7
  label: 多端适配
---

## 原则

- 移动端优先流式布局  
- 宽屏可换导航形态（如 NavigationRail / 侧栏，以实现为准）  
- Desktop：提供 hover / focus 反馈（Material `InkWell` 等）  

> [!NOTE]
> 项目已移除全部 Flutter Web 支持（无 `web/` 目录、无 Web 构建目标、`lib` 中无 `kIsWeb` 残留）。目标平台为 Android / iOS / Windows / macOS / Linux / HarmonyOS NEXT（ohos）。

## 平台分支

```dart
if (Platform.isAndroid) {
  // Android
} else if (Platform.isIOS) {
  // iOS
} else if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
  // 桌面
} else if (Platform.operatingSystem == 'ohos') {
  // HarmonyOS NEXT
}
```

能力级差异不用运行时分支硬编码，优先用数据标记。如校园网格 `CampusGridApp` 的 `ohosSafe` 字段（`campus_grid_app.dart`）：在 ohos 上不可用的能力（如水电网费缴纳）标记 `ohosSafe: false`（`campus_page.dart`），由网格组件过滤（`campus_apps_grid.dart`）。

## 与能力相关的平台差异（摘要）

| 能力 | 备注 |
|------|------|
| 校园巴士预览卡片 | 仅由布局偏好控制（`layout.showBusPreviewCard`）；桌面宽屏可双列天气+校巴 |
| 热更新 / fjs | fjs 依赖原生 / FFI；ohos 走 `lib/core/scripting/fjs_runtime.dart` 平台适配 |
| 安装包检查 | 各平台下载资源由官网 release assets 区分 |
| 桌面小组件 | 仅部分平台 |
| 鸿蒙 `ohos/` | 独立工程目录，能力以代码 `*Safe` 标记为准；含 aTrust VPN 扩展（`ohos/entry/src/main/ets/vpnability/SangforVpnExtAbility.ets`）；ArkTS 已启用混淆；构建入口 `tool/ohos/build.ps1`（HAP 构建失败自动重试一次），详见 `tool/ohos/BUILD.md` |

## 相关

- [UI 与组件](/docs/client/components/)
- [更新与热更新](/docs/client/updates/)
- [校园功能](/docs/client/campus/)
