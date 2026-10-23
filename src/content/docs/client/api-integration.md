---
title: API 对接
slug: docs/client/api-integration
description: Dio、Bearer JWT、customServerUrl
sidebar:
  order: 9
  label: API 对接
---

## 约定

| 项 | 位置 / 行为 |
|----|-------------|
| Dio（业务） | `core/api/api_providers.dart` |
| OpenAPI 生成 | `core/api_client/`（主）；课程信息共享另用 `packages/luotopia_course_api` 生成客户端 |
| 珞家登录 | `features/luotopia_auth/` |
| 认证头 | `Authorization: Bearer <token>` |
| 客户端标识头 | `X-App-Version`（`1.4.0+42`）、`X-App-Platform`（android/ios/…）；由 `luotopiaClientIdentityInterceptor` 连同版本化 User-Agent 一并打上 |
| 持有证明 | `DPoP`（RFC 9449）：`core/api/dpop_interceptor.dart` 用设备密钥签发证明；登录/刷新时绑定令牌（`cnf.jkt`），后续请求证明持有；旧客户端无密钥则退化为普通 bearer |
| 401 | refresh 后重试 |
| 426 | 版本门禁拒绝：`UpgradeGateInterceptor` 触发 `AppUpgradeGate.onUpgradeRequired`，弹不可关闭的升级对话框 |
| Deprecation/Sunset | 版本弃用公告：同上拦截器触发 `onDeprecated`，按 sunset 每周至多提示一次 |
| 自定义服务器 | 开发者 `customServerUrl` |
| 请求签名 | **无 HMAC**（个别校园第三方如座位预约另有 HMAC，与业务服务器无关）；受保护操作经 Altcha 拦截器附带 `X-Altcha` 人机校验证明 |
| 官网 HTTP | `package:http`（更新、热更新、友情链接等） |

人机校验：`core/api/altcha_interceptor.dart`（`AltchaInterceptor`）在 `luotopiaBaseDioProvider` / 业务 Dio 上求解 Altcha 挑战并附带 `X-Altcha`（登录、注册、发邮件验证码等受保护操作）。这不是请求签名，见 服务端 · 人机校验。

版本门禁：`core/api/upgrade_gate.dart`（拦截器 + `AppUpgradeGate` 回调）监听服务端的 426/`Deprecation` 信号；UI 绑定在 `features/app_update/presentation/upgrade_gate_binding.dart`，由 `AppUpdateStartupTask` 在启动时安装（升级流程复用发布检查 + 安装器，426 期间发布接口走官网域名不受门禁影响）。服务端策略见 服务端 · 客户端版本兼容门禁。

服务端总览：API 使用指南。

## Base URL

见 [认证 · Base URL](/docs/client/auth/#base-url)。业务 Dio 与官网 `siteBaseUrl` 分离。

## 接线示意

```dart
final baseUrl = devSettings.customServerUrl?.isNotEmpty == true
    ? devSettings.customServerUrl!
    : config.apiBaseUrl;

final dio = Dio(BaseOptions(baseUrl: baseUrl));
if (token != null) {
  dio.options.headers['Authorization'] = 'Bearer $token';
}
// QueuedInterceptor: 401 → refresh → 重试
```

## 安全边界

1. 生产 HTTPS  
2. 用户 JWT + 服务端鉴权  
3. 教务 Cookie 只在 `whu_auth`  

## 联调清单

- [ ] `/health` 通  
- [ ] 开发者 URL = `server.port`  
- [ ] 登录后带 Bearer  

## 相关

- [环境搭建](/docs/client/setup/)
- [认证](/docs/client/auth/)
- 服务端安全
