---
title: 安装包更新与热更新
slug: docs/client/updates
description: app_update / hot_update 与官网 homepage 边界
sidebar:
  order: 15
  label: 更新与热更新
---

两套机制，**不要混用**：

| | 安装包更新 | 热更新 |
|--|------------|--------|
| 代码 | `features/app_update` | `features/hot_update` |
| 产物 | APK / 桌面包等 | JS 解析脚本 |
| 源 | 官网 `GET /api/releases/latest` | 官网 `/hot-update/manifest.json` |
| 鉴权 | 无 | Ed25519 + checksum + 沙箱测试 |

均 **不经过** 业务服务器 `:6262` 的 `system` 域（见 服务端 system）。

## 安装包检查

- UI：设置 → 关于 → 检查更新；启动任务也可软提示。  
- `receivePrereleaseUpdates`（开发者设置，**默认开**）控制是否带 `?prerelease=1`。  
- 预发布开关与旧 channel 判断的迁移说明见 [已移除与迁移](/docs/client/removed-and-migrated/#更新检查的旧判断)。  
- 无正式版且关闭 prerelease 时，接口返回 not_found → 用户看到检查失败。

## 热更新

- `DefaultScripts`：编译进包的兜底脚本。  
- 远程脚本：下载 → **签名校验** → 沙箱 → 落盘缓存。  
- 无 default、无缓存时 `getScript` 返回空串，**不抛**；设置页显示「本地缺失 · 云端 vN」。  
- 新增 `ParserNames` 时：尽量补 default；至少保证 UI/加载路径不因 throw 卡死。

公开文档只描述**流程与失败语义**；不记录私钥、不粘贴完整解析脚本正文（见 公开文档边界）。

## 相关

- [功能模块](/docs/client/features/)  
- [用户 · 设置](/docs/user/settings)  
