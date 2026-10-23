---
title: 已移除与迁移项
slug: docs/client/removed-and-migrated
description: 客户端不应再使用的协议、目录与旧行为
sidebar:
  order: 17
  label: 已移除与迁移
---

以下废弃约定仅针对客户端。新代码使用「替代方案」，不要按旧文档或旧分支实现。

## 全站请求 HMAC

| 旧做法 | 当前替代 |
|--------|----------|
| `X-Api-Sign` / `X-Api-Ts`，或硬编码全局 `api_secret` | HTTPS + `Authorization: Bearer <token>`；必要时使用用户级 API 凭证 |

业务请求**不再**实现全站 body HMAC。用户级 `X-Api-Key` / `X-Api-Secret` 是单独的窄权限集成凭证，不等同全站签名。

## 旧校园目录

课程导入与部分校园页已迁至 `features/pages/campus/sub_apps/`。完整旧/新路径映射见 [子应用目录](/docs/client/campus-sub-apps/#旧路径迁移表)。

新增代码不得创建独立 `sub_apps/course_import/`，应放入 `sub_apps/timetable/course_import/`。

## 更新检查的旧判断

Release / stable 构建不再因 channel 自动排除 prerelease。是否请求预发布由 `receivePrereleaseUpdates` 决定（默认开），见 [更新与热更新](/docs/client/updates/)。

## 不要依赖

- 未文档化的业务 API、调试开关或内部 WebView bridge 名称。
- 将武大 Cookie 放进 Luotopia 业务 API 请求。
- 旧页面路径的 import；迁移期如有 export 转发，以当前目录为准。

## 相关

- [认证与账户](/docs/client/auth/)
- [API 对接](/docs/client/api-integration/)
- 公开文档边界
