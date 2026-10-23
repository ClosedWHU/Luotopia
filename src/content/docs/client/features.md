---
title: 功能模块地图
slug: docs/client/features
description: 已实现与开发中能力一览（对照 app/README）
sidebar:
  order: 14
  label: 功能模块
---

以仓库 `app/README.md` 为准；下表方便导航。

## 已可用（客户端）

| 能力 | 大致位置 |
|------|----------|
| 课表（教务 / WakeUp / 编辑） | `pages/campus/sub_apps/timetable`、主页网格 |
| 成绩 | `sub_apps/score` |
| 学业状态 | `sub_apps/study_status` |
| 空闲教室 | `sub_apps/empty_classroom` |
| 座位预约 | `sub_apps/seat_reservation` |
| 运动场馆 | `sub_apps/sports_reservation` |
| E 卡 / 付款码 | `luojia_ecard`、`ecard_paycode` |
| 校园巴士 | `campus_bus` + `sub_apps/bus`；校园页卡片 vs 网格见 `campus_page` |
| 校医院报告 | `sub_apps/medical_service` + 热更新 medical 解析脚本 |
| 校园网 / 网费 | `sub_apps/school_net` |
| 取水码 | `sub_apps/water_control` |
| 水电费 | `sub_apps/water_electric_fee` |
| 邮箱 / 消息 | `sub_apps/email`、`messages` |
| 智慧珞珈 | `sub_apps/zhihui_luojia` |
| 校历 | `sub_apps/calendar` |
| 校园地图 | `sub_apps/campus_map`（矢量/卫星底图、POI、校巴/电单车叠加） |
| 专业信息 / 培养方案 | `sub_apps/major_info` |
| 图书借阅 | `sub_apps/library`（OPAC 借阅 + 到期提醒） |
| 超星学习通 | `sub_apps/chaoxing`（课程、签到、视频） |
| CS 易办 | `sub_apps/cs_eban`（评奖评优） |
| 希冀平台 | `sub_apps/cg`（实验/课程平台） |
| 电单车 | `sub_apps/ebike`（知音出行 / 芒果；见电单车分区） |
| 食堂 | `features/dining` + `sub_apps/dining` |
| 天气 | `features/weather` |
| 列表 / 事项 / 提醒 | `pages/list`、`item_editor`、`item_detail` |
| AI 会话 | `pages/ai` + 设置 AI；含实时语音输入（ASR） |
| AI Agent 代付（水电 / 校园网） | `pages/ai` + `lib/toolkit` + 收银台 handoff |
| 课程信息共享 | `features/course_space`（教学班共享 + 可信协作） |
| 社交 / 私信 | `features/social`（关注 / 拉黑 / 私信） |
| 账户 / 凭据中心 | `features/account_center`（多账户适配器聚合） |
| VPN（aTrust） | `sub_apps/vpn`（`flutter_sangfor_atrust`） |
| 壁纸 / 主题 | 设置相关 pages |
| 检查更新（安装包） | `features/app_update` → 官网 `GET /api/releases/latest` |
| 热更新（JS 解析脚本） | `features/hot_update` → 官网 `/hot-update/manifest.json` |
| 云控（子应用 / 功能开关） | `core/cloud_control` + `core/config/sub_app_config.dart` |

## 进行中 / 占位

| 能力 | 说明 |
|------|------|
| 论坛 | 服务端 `forum` 域已有；客户端 `features/forum/` 含列表、帖子、通知、个人帖、管理等页面。默认 **导航隐藏**，可在导航设置中打开 |
| 蹭课 | 无独立入口；课程信息共享 / 全校课表能力仍在演进 |

做新校园子应用时：完整闭环（入口、路由、页面、data、错误态），不要只挂空入口。

## 相关

- [校园功能开发](/docs/client/campus/)
- [更新与热更新](/docs/client/updates/)
- [目录结构](/docs/client/project-structure/)
- [用户指南](/docs/user/)
