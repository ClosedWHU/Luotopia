---
title: 云控（子应用开关与参数下发）
slug: docs/client/cloud-control
description: core/cloud_control 与 sub_app 开关
sidebar:
  order: 18
  label: 云控
---

云控用于「不发版即可开关功能 / 下发参数」。客户端经 `core/cloud_control/` 拉取配置，按 `role` / `user_id` 定向生效，优先级 **用户规则 > 角色规则 > flag 默认值**。

`role` 规则可写裸代码（`admin`，即 `permission` 分组）或分组限定形式（`beta:cohort_a`），两者等价匹配；详见 服务端 · 数据库设计。

## 代码位置

- `lib/core/cloud_control/`：`cloud_control_api.dart`、`cloud_control_controller.dart`、`cloud_control_cache.dart`、`cloud_control_keys.dart`、`cloud_control_models.dart`、`cloud_control_defaults.dart`、`cloud_control_platform.dart`、`cloud_control_providers.dart`（见 `core/cloud_control/README.md`）
- `lib/core/config/sub_app_config.dart`：子应用开关（`subapp.*`）与能力 key，经 `subAppConfigProvider` 消费
- 管理台：`features/admin/presentation/cloud_control/`

## 开关形态

| key 形态 | 含义 |
|----------|------|
| `subapp.*` | 校园子应用入口开关（如 `subapp.bus`、`subapp.dining`、`subapp.ebike`、`subapp.courseSharing`） |
| 能力 key | 功能开关与参数（如 `courseSharing.*`） |
| `developer.channel` | 稳定版开发者工具通道。默认关闭，由控制台按角色规则或用户规则授予——给测试者开调试面板不再需要把人提升为管理员 |

默认值由服务端云控下发（见 服务端 · 云控）；客户端在服务端不可达时回落到本地默认（`_defaults.dart`）。

## 消费方式

- 子应用入口用 `subAppEnabledProvider(<id>)` 判断是否展示（`SubAppIds.*`）。
- 部分能力在 ohos 上另有 `*Safe` 标记（见 [多端适配](/docs/client/multi-platform/)）。

## 相关

- [功能模块](/docs/client/features/)
- [校园功能](/docs/client/campus/)
- 服务端 · 云控
