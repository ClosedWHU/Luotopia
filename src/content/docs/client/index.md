---
title: 客户端开发
slug: docs/client
description: Flutter 客户端文档入口
sidebar:
  order: 0
  label: 概览
---

Flutter 跨平台 App（Riverpod + Material 3 + go_router）。代码在 monorepo 的 `app/`。

侧栏按阅读顺序排列。快速跳转：

| 目标 | 文档 |
|--------|-----|
| 装环境、联调后端 | [环境搭建](/docs/client/setup/) |
| 目录与分层 | [架构](/docs/client/architecture/) · [目录结构](/docs/client/project-structure/) · [Feature 约定](/docs/client/feature-architecture/) |
| 状态 / UI | [状态管理](/docs/client/state-management/) · [UI 与组件](/docs/client/components/) · [多端](/docs/client/multi-platform/) |
| 登录与业务 API | [认证](/docs/client/auth/) · [API 对接](/docs/client/api-integration/) |
| 校园子应用 | [校园功能](/docs/client/campus/) · [教务认证](/docs/client/campus-whu-auth/) · [子应用目录](/docs/client/campus-sub-apps/) · [WebView](/docs/client/webview/) |
| 能力地图 / 更新 | [功能模块](/docs/client/features/) · [更新与热更新](/docs/client/updates/) · [云控](/docs/client/cloud-control/) |
| 测试 / 迁移项 | [测试](/docs/client/testing/) · [已移除与迁移](/docs/client/removed-and-migrated/) |

其他分区：

- [用户怎么用 App](/docs/user/)
- 服务端开发

## 硬性约定

- UI：**Material 3**（含 M3E loading；SnackBar 用 `showAppSnackBar*`）
- 业务 API：`Authorization: Bearer`，无请求 HMAC 签名
- 武大教务会话：只在设备本地（`whu_auth`）
- 天气：客户端直连第三方
- 安装包更新 / 解析脚本热更新：官网 `www.whu.sb`（homepage），**不是**业务服务器 `system/update`  
- Feature 分层与迁址状态：[Feature 约定](/docs/client/feature-architecture/)

公开文档只写到**契约与工程边界**；第三方协议细节与密钥见 公开文档边界。
