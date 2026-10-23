---
title: 认证与账户
slug: docs/client/auth
description: 珞家 JWT、武大教务会话、开发者服务器
sidebar:
  order: 8
  label: 认证与账户
---

客户端存在两套彼此独立的身份体系，凭据与用途均不同，**不要交叉使用**。

## 对比

| | 武大 / 教务 | 珞家 Luotopia |
|--|-------------|---------------|
| 代码 | `features/whu_auth/` | `features/luotopia_auth/` |
| 用途 | 课表导入、成绩、座位、场馆、E 卡… | 社区、评价等云端 API |
| 存储 | 本机会话 / Cookie | access + refresh token |
| 是否发往珞家 API | **否**（Cookie 不上云） | 是（Bearer） |

用户操作见 [用户指南](/docs/user/)。

## 珞家 JWT

1. 登录 / 注册：`LuotopiaAuthRepository` → 服务端 identity  
2. Token：secure storage（见 `core/security` 等）  
3. 请求：`api_providers.dart` 注入 `Authorization: Bearer …`  
4. 401：拦截器调用 `refreshSession`，成功则重试，失败则清会话  

服务端默认 `/api/v1/*` 需登录；白名单见 服务端安全策略。

## Base URL

| 配置 | 典型 |
|------|------|
| `AppConfig.apiBaseUrl` | 默认 `https://api-whu-sb.tsinbei.cn`（可由 `LUOTOPIA_API_URL` 编译期覆盖） |
| 开发者 `customServerUrl` | 覆盖默认，如模拟器 `http://10.0.2.2:6262`、真机 `http://<局域网 IP>:6262` |
| `AppConfig.siteBaseUrl` | 官网 `https://www.whu.sb`（更新 / 热更新 / 法律 / 友情链接） |

开启：debug/profile 构建下开发者模式默认开启；稳定版由云控 `developer.channel` 授予。入口为 **设置 → 开发者**。

`customServerUrl` **只**覆盖珞家业务服务器，**不**改变 `siteBaseUrl`。

## 珞家账户安全（`luotopia_auth`）

`features/luotopia_auth/` 同时负责以下账户安全能力（注册登录与会话见上文）：

- Passkey（密码免密登录 / 第二因素 / 步进验证）、TOTP、MFA 恢复码、多会话管理（下线其他设备）
- API 凭证（Key + Secret）签发与管理
- 社交账户（Ham OAuth2）绑定 / 解绑

详见 服务端 · 身份认证。

## 武大教务（`whu_auth`）

- 登录页 / 设置中的武大账户  
- 能力：原生 CAS 登录、CAS TOTP、可信设备、教务（datarepo）与自费转诊（zyfzzd）服务
- 生命周期：后台过久可主动刷新教务会话  
- WebView 校园业务：统一用 `AppWebViewPage` 模式挂 Cookie / Header  

详见 [校园页教务认证](/docs/client/campus-whu-auth/)。

## 迁移提示

全站请求 HMAC 与旧校园目录等已集中见 [已移除与迁移](/docs/client/removed-and-migrated/)。

> [!IMPORTANT]
> 仍须遵守：不要把教务 Cookie 放到 Luotopia REST body/header 让服务端代爬。

## 相关

- [API 对接](/docs/client/api-integration/)
- [校园功能](/docs/client/campus/)
- [已移除与迁移](/docs/client/removed-and-migrated/)
- 服务端 API
