---
title: 校园子应用目录
slug: docs/client/campus-sub-apps
description: sub_apps 布局、共享边界与当前清单
sidebar:
  order: 12
  label: 子应用目录
---

校园页主入口与具体子应用分开。路径均相对于 `app/lib/`。

## 文件安排

- `features/pages/campus/presentation/pages/campus_page.dart`：天气 / 校巴预览 + 九宫格  
- `features/pages/campus/sub_apps/`：各实际子应用  
- `features/campus_bus/`：校巴数据与卡片（**不在** `sub_apps` 内，但被校园页引用）  
- `features/pages/campus/README.md`：目录规则说明  

`sub_apps/` 的一级目录必须对应一个实际子应用。辅助流程放进所属子应用内部。

## 当前 `sub_apps/` 清单（以仓库为准）

| 目录 | 能力 |
|------|------|
| `timetable/` | 课程表（含 `course_import/`） |
| `score/` | 成绩 / 成绩单 |
| `study_status/` | 学业状态 |
| `empty_classroom/` | 空闲教室 |
| `seat_reservation/` | 图书馆座位预约 |
| `sports_reservation/` | 运动场馆 |
| `lepao/` | 乐跑（步道乐跑：历史记录、轨迹、上传） |
| `luojia_ecard/` | 珞珈 E 卡 WebView |
| `water_control/` | 取水码 |
| `school_net/` | 校园网 |
| `medical_service/` | 校医院报告（解析脚本可热更新） |
| `calendar/` | 校历 |
| `email/` | 校内邮箱 |
| `messages/` | 消息 |
| `bus/` | 校园巴士完整页 |
| `zhihui_luojia/` | 智慧珞珈 WebView |
| `library/` | 图书借阅（OPAC 借阅 / 到期提醒） |
| `vpn/` | aTrust VPN（`flutter_sangfor_atrust`；`flutter_sangfor` 仅应用内 HTTP 代理） |
| `water_electric_fee/` | 水电费缴纳 |
| `campus_map/` | 校园地图 |
| `major_info/` | 专业信息 / 培养方案 |
| `dining/` | 食堂（薄壳，领域与数据在 `features/dining/`） |
| `chaoxing/` | 超星学习通（课程、签到、视频） |
| `cs_eban/` | CS 易办（评奖评优） |
| `cg/` | 希冀平台（实验 / 课程平台） |
| `ebike/` | 电单车（知音出行 / 芒果） |

网格入口 ID 与显示顺序以 `campus_page.dart` 的 `gridApps` 与用户布局偏好为准。

子应用内部按需分层：

- `presentation/`：页面、组件、ViewModel  
- `domain/`：业务模型、用例、仓储接口  
- `data/`：服务、适配器、数据源、仓储实现  

不为占位创建空目录。暂时只有页面时，可只保留 `presentation/`。

## 共享能力（不要塞进某个 sub_app）

- `features/whu_auth/`、`features/luotopia_auth/`  
- `features/hot_update/`（解析脚本）  
- `features/components/wallpaper/`  
- `shared/presentation/widgets/app_web_view_page.dart`  
- `shared/domain/`、`shared/data/` 日程 / 课程等实体  

子应用可依赖共享能力；共享能力不要反向依赖具体子应用。

## 旧路径迁移表

| 旧路径 | 新路径 |
| --- | --- |
| `features/components/course_import/...` | `.../sub_apps/timetable/course_import/...` |
| `.../campus/presentation/pages/campus_timetable_page.dart` | `.../sub_apps/timetable/...` |
| `.../campus/presentation/pages/score_page.dart` | `.../sub_apps/score/...` |
| `.../campus/data/whu_score_service.dart` | `.../sub_apps/score/data/...` |

## 新增子应用

1. 在 `sub_apps/<name>/` 建目录并实现闭环  
2. 在 `campus_page.dart` 的 `gridApps` 增加入口  
3. 路由：`app_route_paths.dart` + `campus_*_routes`  
4. 若需热更新解析：同步 `ParserNames` + 官网 manifest（见 [更新与热更新](/docs/client/updates/)）  

路由 path 字符串变更需兼容深链；页面类 import 随目录移动。

## 相关

- [校园功能](/docs/client/campus/)  
- [功能模块](/docs/client/features/)  
