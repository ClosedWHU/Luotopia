---
title: Flutter Feature 架构约定
slug: docs/client/feature-architecture
description: feature-first 布局、分层规则与迁移例外
sidebar:
  order: 4
  label: Feature 约定
---

约定源自内部架构规范化计划 Phase 0/1（该计划不随站发布）。

## 目标布局

```text
lib/
  app/                 # 路由、壳
  core/                # api 客户端、config、l10n、theme…
  features/
    <feature_name>/
      data/            # Repository、DTO 映射、本地存储
      domain/          # 实体、状态、纯逻辑（无 Dio/OpenAPI/Widget）
      presentation/    # pages、widgets、providers
  shared/              # 跨 feature UI/工具
  toolkit/             # AI Agent 工具运行时
    application/       # 工具 / catalog 定义、runtime
    credentials/       # 凭据 provider
    data/              # 工具适配器（adapters）
    upstream/          # 上游宿主集成（apple_shortcuts）
```

## 规则

1. **业务代码进 `features/<name>`**，不要把可复用逻辑只放在 `features/pages/...` 的 page 文件里。  
2. **`presentation` 禁止**直接写 API 路径字符串；统一走 `data/*_repository.dart`。  
3. **`domain` 禁止** import `package:dio`、`package:openapi`、Flutter widget。  
4. 网络：  
   - 未登录 / Auth：`luotopiaBaseDioProvider`（`core/api/luotopia_http.dart`）  
   - 业务：`dioProvider` / OpenAPI（`core/api/api_providers.dart`）  
   - 官网（更新 / 热更新 / 法律 / 友情链接）：`package:http` + `AppConfig.siteBaseUrl`  
5. 双 origin：业务 `apiBaseUrl`（可被 `customServerUrl` 覆盖）与官网 `siteBaseUrl` **分开**。  
6. Page 文件建议 **&lt; 400 行**；超出则拆 widget / notifier。  
7. SnackBar 优先 `showAppSnackBar*`（root messenger），见 [UI 与组件](/docs/client/components/)。  
8. toolkit 边界：`toolkit/data` 适配器可复用 features 的 data / domain 能力；features 页面经 `toolkit/application` 的 providers / runtime 接入，收银台 handoff 通过 `toolkit/data/payment_checkout_vault.dart` 交接，其余情况不依赖适配器内部实现。仓库级 `packages/`（`luotopia_toolkit_core`、`luotopia_agent_harness` 等本地包）承载与 Flutter 解耦的 Agent / 工具核心逻辑。

## 迁移状态（相对规范化计划）

| 项 | 状态 |
|------|------|
| `features/forum` | 已独立 feature |
| `features/course_review` | 已独立 feature |
| `features/course_space` | 已独立 feature（课程信息共享） |
| `features/social` | 已独立 feature（关注 / 拉黑 / 私信） |
| `features/account_center` | 已独立 feature（账户 / 凭据中心） |
| `features/dining` | 已独立 feature；校园页入口为 `sub_apps/dining` 薄壳 |
| `features/app_update` / `hot_update` | 已独立 |
| `features/pages/ai` | 仍在 `pages/ai`（可后续升格） |
| `features/weather` | 已有独立 feature；校园页卡片复用 |
| 校园 `sub_apps/*` | 主路径；见 [子应用目录](/docs/client/campus-sub-apps/) |
| `toolkit/` | AI Agent 工具运行时；application / credentials / data 三层 |
| `packages/` | 本地包：`luotopia_toolkit_core`、`luotopia_agent_harness`、`luotopia_agent_tool_runtime`、`luotopia_course_api`、`luotopia_flutter_bridge`、`luotopia_toolkit_virtual_cli` |

迁移时用 **export 转发** 保持 import 稳定，避免一次全仓 rename。

## 服务端协同模块检查表

- [x] 统一 `apiBaseUrl`  
- [x] Auth Dio 与业务 Dio 分离（防循环依赖）  
- [x] Forum / CourseReview feature 迁出  
- [x] Auth domain models 与 data 分离  
- [x] 官网更新 / 热更新不走业务 Dio  
- [ ] OpenAPI 按 tag 生成裁剪  
- [ ] 资料 / 头图等剩余接入  

## 新增 feature 模板

```text
features/foo/
  data/foo_repository.dart
  domain/models.dart
  domain/foo_state.dart          # 可选
  presentation/providers/...
  presentation/pages/...
  presentation/widgets/...
```
