---
title: 校园功能开发
slug: docs/client/campus
description: 校园页子应用、whu_auth、WebView 约定
sidebar:
  order: 10
  label: 校园功能
---

校园页入口在 `features/pages/campus/`。子应用放在：

```text
lib/features/pages/campus/sub_apps/<子应用名>/
```

每个一级目录对应一个真实子应用。辅助代码放在所属子应用内。

详细说明：

- [校园子应用目录](/docs/client/campus-sub-apps/)  
- [教务认证](/docs/client/campus-whu-auth/)  
- [WebView](/docs/client/webview/)  

## 开发顺序（摘要）

1. 明确查询型还是交互型（是否改远端状态）  
2. 接 `whu_auth` 检查登录 / 刷新  
3. data 层请求与模型转换  
4. 页面状态：加载 / 空 / 错误 / 未登录  
5. 路由 + 校园入口一起合入  

## 与服务端边界

| 能力 | 客户端 | 服务端 |
|------|--------|--------|
| 个人教务课表导入 | 直连教务 | 不收 Cookie |
| 空闲教室 / 部分主数据 | UI + 可选 API | `campus/*` 域 |
| E 卡 / 座位 / 场馆 | 多为本机会话 + WebView | 不代持密码 |
| 课程评价资格 | 本地成绩 → 同步最小数据 | identity / course_review |
| 校园巴士预览 | `CampusBusCard` + 布局偏好 | 不经过业务服务器 |
| 安装包更新 / 热更新脚本 | 官网 `www.whu.sb` | 非 `system` 域（见下） |

详见 服务端 · 校园边界。

## 校巴卡片 vs 网格

`campus_page.dart`：

```text
showBusPreview = layout.showBusPreviewCard
```

- 为 true：渲染预览卡片，`excludedAppIds` 含 `bus`（网格无图标）  
- 为 false：无卡片，网格显示校巴（除非用户 `hiddenAppIds`）  

**不要**再用登录状态门控卡片，否则未登录时开关「开」仍只看到网格图标，编辑态开关会显得无效。  
编辑 UI：开关放在天气/校巴卡片下方、App 网格编辑栏上方。

## 相关

- [认证](/docs/client/auth/)  
- [功能模块](/docs/client/features/)  
- [用户指南](/docs/user/)  
