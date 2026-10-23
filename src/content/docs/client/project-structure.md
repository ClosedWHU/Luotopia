---
title: 目录结构
slug: docs/client/project-structure
description: app/ 顶层目录职责、app/lib 分层与依赖方向
sidebar:
  order: 3
  label: 目录结构
---

仓库路径：`app/lib/`。约定见 `app/lib/README.md`。

## 顶层

```text
app/lib/
├── main.dart
├── app/              # 启动、路由、Shell、装配
├── core/             # 与业务无关的基础设施
├── features/         # 按功能切分（页面 / 账户 / 天气…）
├── shared/           # 跨 feature 的领域模型与通用 UI
└── toolkit/          # AI Agent 工具运行时（application / credentials / data / upstream）
```

`toolkit/data/` 存放工具适配器（如 `payment_checkout_vault.dart`、`water_electric_adapters.dart`、`school_net_adapters.dart`），`toolkit/application/` 为工具与 catalog 定义，`toolkit/credentials/` 为凭据 provider，`toolkit/upstream/` 为上游宿主集成（如 `apple_shortcuts/`）。

仓库级目录（`lib/` 之外的 `app/` 顶层）见下一节。

## app/ 顶层目录

| 目录 | 职责 | 路径约束 |
|------|------|----------|
| `lib/` | 应用代码，分层见下 | — |
| `test/`、`integration_test/` | 单元 / Widget 测试、集成测试 | `test/` 与 `lib/` **不是机械镜像**，查找规则见 `app/DEVELOPMENT.md`「测试布局」 |
| `tool/` | 开发者**本地**运行的构建、代码生成、环境引导、补丁与提交前校验脚本 | `tool/ohos/` 鸿蒙构建、`tool/luotopia_lints/` 自定义 lint、`tool/reference/` 二进制参考资料、`tool/oneoff/` 一次性脚本（除 README 外已 gitignore） |
| `scripts/` | **CI 直接调用**的脚本：覆盖率合并过滤、Runner 空间清理、Windows 构建前置补丁与暂存 | 被 `app/.github/workflows/pr-ci.yml` 与 homepage 仓的 `app-release.yml` 按路径引用，移动前必须先同步改工作流 |
| `packaging/` | 桌面端**分发产物**：`winget/`、`scoop/`、`aur/`、`linux/`（deb / AppImage / Flatpak / .desktop）清单模板与打包脚本 | 主体是发布到各商店的声明式模板（数据，不是脚本），因此不并入 `tool/`；被 `app-release.yml`、`test/app/aur_packaging_test.dart`、`packaging/aur/render.sh` 按路径引用。详见 `packaging/README.md` |
| `fastlane/` | Apple 发布流水线：Match 签名与 `apple_build` / `apple_upload` / `apple_distribute` / `apple_status` | 目录名是 fastlane 的**约定位置**，CI 以 `bundle exec fastlane <lane>`（不带 Fastfile 路径）调用；`fastlane/lib/apple_release.rb` 的 `ROOT` 由 `__dir__` 上溯两级得到。详见 `fastlane/README.md` |
| `native/` | Rust 原生组件（`key_obfuscator`） | 由 `tool/build_key_obfuscator.*` 编译为各平台预编译产物 |
| `packages/` | 本地 Dart 包：`luotopia_agent_harness`、`luotopia_agent_tool_runtime`、`luotopia_course_api`、`luotopia_flutter_bridge`、`luotopia_toolkit_core`、`luotopia_toolkit_virtual_cli` | 由 `pubspec.yaml` 以 path 依赖引入 |
| `assets/` | 运行时资源，含 `assets/config/feature_defaults.json`（云控离线默认值） | `tool/check_sub_app_gates.*` 与提交前钩子校验子应用开关默认值 |
| `android/`、`ios/`、`macos/`、`windows/`、`linux/`、`ohos/` | 各平台工程 | `ohos/` 另见 `ohos/README.md` |
| `.github/` | 本仓库工作流：`flutter-ci`、`pr-ci`、`prebuilt-natives-trigger`、`semgrep-reaper` | 发布工作流（含 Apple 与桌面打包）在 homepage 仓库 |
| `.githooks/` | 仓库内 git hooks：`pre-commit` 跑子应用开关校验并对暂存的 Dart 文件执行 `dart fix` + `dart format` | 由 `tool/bootstrap_workspace.*` 通过 `core.hooksPath` 挂载；CI 重跑同样检查 |
| `docs/` | 仓库内专项说明（relay、widget 平台矩阵等） | 与文档站 `../docs` 不是一回事 |

`lib/core/l10n/arb` 是独立子模块（[Luotopia-i18n](https://github.com/ClosedWHU/Luotopia-i18n)，Weblate 维护）：新增文案改子模块并单独提交，再跑 `tool/flutter_l10n.sh`（即 `flutter gen-l10n`）重新生成 `lib/core/l10n/generated/`。

根级配置：`pubspec.yaml`（依赖与 `msix_config`）、`l10n.yaml`、`analysis_options.yaml`、`cargokit_options.yaml`、`Gemfile` + `.ruby-version`（fastlane / CocoaPods）、`.gitmodules`、`.gitattributes`（`* text=auto eol=lf`）。

## core/

适合：主题、l10n、存储、网络、配置、平台适配、图标语义（如 `AppIcons`）。

不适合：具体「课表 / 事项」业务规则、某一页的私有 UI。

## features/

| 区域 | 说明 |
|------|------|
| `features/pages/` | 完整页面：home、list、campus、settings、ai、weather… |
| `features/luotopia_auth/` | 珞家账户 |
| `features/whu_auth/` | 武大教务认证 |
| `features/weather/` | 天气（直连第三方） |
| `features/campus_bus/` | 校巴数据与预览卡片 |
| `features/app_update/` | 安装包版本检查（官网 Pages Function） |
| `features/hot_update/` | 解析脚本热更新（manifest + Ed25519） |
| `features/forum/`、`course_review/`、`course_space/`、`social/`、`dining/` 等 | 其他独立领域能力 |
| `features/account_center/` | 账户 / 凭据中心（多账户适配器聚合） |
| `features/ecard_paycode/` | 珞珈 E 卡付款码 |

页面内部可按需有 `presentation` / `domain` / `data`，**不为占位强行建空目录**。

校园子应用：`features/pages/campus/sub_apps/<子应用>/`，与校园页入口一一对应。

## shared/

跨模块实体、仓储接口、值对象、可复用业务组件。  
不承载启动逻辑，不提供整页 Scaffold 脚手架。

## 依赖方向

```text
presentation  →  domain
data          →  domain
app           →  features / core / shared
```

- `domain` 禁止依赖 `presentation` / `data`
- feature 之间避免深耦合；复用优先进 `shared/`

## 路由

路径常量：`app/lib/app/router/app_route_paths.dart`  
校园子路由、设置子路由分文件注册（`campus_*_routes`、`settings_*_routes`）。

## 相关

- [架构总览](/docs/client/architecture/)
- [功能模块](/docs/client/features/)
