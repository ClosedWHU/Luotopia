---
title: 环境搭建
slug: docs/client/setup
description: Flutter 安装、运行与后端联调
sidebar:
  order: 1
  label: 环境搭建
---

## 前置

- Flutter 3.x / Dart 3.x  
- VS Code 或 Android Studio  
- 模拟器或真机  

## 安装与运行

> [!IMPORTANT]
> `lib/core/l10n/arb` 是指向 `ClosedWHU/Luotopia-i18n` 的 git submodule。fresh clone 需 `git clone --recurse-submodules`，或 clone 后执行 `git submodule update --init`，否则 l10n 生成缺 arb 文件。

```bash
cd app
flutter pub get
flutter run
```

### Android Release 构建

```bash
# Windows：默认仅 arm64（覆盖绝大多数真机）
build-release.bat
# 全 ABI：build-release.bat all
```

脚本启用 `--obfuscate` 与 split debug info。Cargo/fjs 缓存目录见 `.gitignore` 中的 `.cargo-target`（避免 `flutter clean` 清掉数十分钟编译缓存）。

iOS / 桌面发布脚本见 `app/build-ios*.sh`、Windows MSIX 配置（`pubspec` `msix_config`），以仓库脚本为准。

### HarmonyOS NEXT 构建

使用 OH Flutter 3.35（非官方 SDK，版本约束见 `pubspec.yaml` 注释）。构建入口为 `tool/ohos/build.ps1` / `tool/ohos/env.ps1`，详见 `tool/ohos/BUILD.md`。

## 联调后端

1. 启动服务端（服务端环境搭建），端口样例 **6262**。  
2. App：debug/profile 构建下 **开发者模式** 默认开启；稳定版需云控 `developer.channel` 授予。  
3. **开发者设置** 填自定义服务器（Auth 与业务 API 共用）：
   - 模拟器：`http://10.0.2.2:6262`
   - 真机：`http://<电脑局域网IP>:6262`
4. 可选：扫描局域网探测 `:6262/health`。

默认 Auth 与 OpenAPI 端口可能不一致。联调时请用自定义 URL 将两者**统一**。

官网（检查更新 / 热更新 / 友情链接）不走该自定义服务器，仍访问 `https://www.whu.sb`。

## OpenAPI 客户端

生成物在 `lib/core/api_client`（`dart-dio` + built_value 模板）。在 `app/` 下运行一条命令即可端到端重生成：

```powershell
pwsh tool/generate_openapi_client.ps1
```

它会依次执行：

1. `go run scripts/export_openapi.go`，从后端导出 `server/openapi.json`；
2. 用 openapi-generator 重生成 `lib/core/api_client`（版本由 `app/openapitools.json` 锁定，当前 7.23.0）；
3. `dart pub get`、`build_runner build`、`dart fix`、`dart format`。

生成文件勿手改：`lib/` 源码入库，`.openapi-generator/`、`build/`、`.dart_tool/`、`doc/`、`test/` 已被忽略。采用前先 `dart analyze`。完整说明见 `server/scripts/README.md` 的「OpenAPI contract」一节。

## 常见问题

| 问题 | 处理 |
|------|------|
| iOS 依赖 | `cd ios && pod install` |
| 连不上后端 | 端口、防火墙、同一局域网 |
| 401 循环 | 查 refresh 与服务器时间 / 密钥 |
| Release 无法检查更新 | 见 [更新与热更新](/docs/client/updates/)；多为 prerelease / 官网接口 |

## 相关

- [认证](/docs/client/auth/)
- [API 对接](/docs/client/api-integration/)
- [更新与热更新](/docs/client/updates/)
- [用户指南](/docs/user/)
