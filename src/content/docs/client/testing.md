---
title: 测试
slug: docs/client/testing
description: Flutter 测试约定与重点目录
sidebar:
  order: 16
  label: 测试
---

## 命令

```bash
cd app
flutter test
# 单文件示例
flutter test test/features/hot_update/
flutter test test/features/campus/
```

部分环境用 `dart test` 可能因 Flutter UI 依赖失败，**优先 `flutter test`**。

## 建议

| 层级 | 内容 |
|------|------|
| 单元 | domain 规则、纯 Dart 转换、GPA、版本比较等 |
| Widget | 关键页面状态（加载 / 空 / 错误） |
| 集成 | 可选；网络用 mock。`integration_test/` 已有 smoke、AI stream、voice 套件 |

- 测 ViewModel / Notifier 时用 `ProviderContainer`，避免依赖真实网络  
- `whu_auth`、Dio 用 mock 接口  
- 生成代码（`api_client`）一般不单测实现细节  
- 含 `AppLoadingIndicator` / 持续动画的页面：`pumpAndSettle` 可能永不结束，用 `pump` + 超时或 mock  

## 仓库中已有重点测试（示例）

| 路径 | 覆盖 |
|------|------|
| `test/features/hot_update/` | manifest 签名 / canonical JSON |
| `test/features/app_update/` | 版本比较 |
| `test/features/campus/` | 网格排除、布局设置 |
| `test/features/item_detail/` 等 | 事项 / 动画相关 |

## 相关

- [状态管理](/docs/client/state-management/)
- [架构](/docs/client/architecture/)
- [更新与热更新](/docs/client/updates/)
