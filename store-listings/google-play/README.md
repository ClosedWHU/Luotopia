# Google Play 送审清单 — Luotopia（珞家）

## 构建产物（AAB）

- 来源：release workflow 的 android job，每次构建 APK 时同步产出（`flutter build appbundle`，与 APK 同一签名配置）。
- 获取：Actions 运行摘要 → Artifacts → `play-aab-<版本>-<构建号>`（如 `play-aab-1.1.0-16`）。**AAB 不进公开 release**（不可直接安装，性质同 Store MSIX）。
- versionCode = pubspec 的构建号（AAB 不做 per-ABI 重写）。**Play 要求每次提交严格递增**：下次送审先 bump `version: 1.1.0+17`。
- 混淆符号：私有 `symbols-<tag>` release 的 `dart-symbols-android-aab.tar.gz`（AAB 单独混淆，符号与 APK 的不通用）。Play Console「Android 混淆 → 上传去混淆文件」传这份里的 `app.android-*.symbols`。
- targetSdk = Flutter 3.47 的 pinned 值；Play 2026-08-31 起新应用要求 target API 36+，上传后在 Play Console 的 AAB 详情核对一次。

## Play App Signing（新应用强制）

- 上传首个 AAB 时自动加入 Play App Signing：CI keystore 的证书成为**上传密钥**，Google 生成并托管**应用签名密钥**。无需本地操作。
- CI keystore 即 GitHub secrets（`ANDROID_KEYSTORE_*`）里那把；丢失后可在 Play Console 走上传密钥重置流程，但避免发生。

## 商店设置

- 隐私政策 URL（必填）：`https://www.whu.sb/legal/privacy`
- 应用类别：教育；联系邮箱用能收信的（审核沟通渠道）
- 广告：声明"不含广告"
- 加密合规问卷：使用加密，但仅 HTTPS/标准加密算法 → 选择豁免
- 图形资产：图标 512×512（PNG32）、特色图片 1024×500、手机截图 2–8 张（16:9 或 9:16，单边 ≥320、≤3840）；7/10 英寸平板截图可选
- 发布轨道：先内部测试（免审核、当天可装）→ 封闭/生产。**注意**：2023-11-13 之后注册的**个人**开发者账号，须封闭测试连续 14 天、≥12 名测试员，才能申请生产发布；公司账号无此限制。

## 数据安全表（对照 /legal/privacy 填写）

| 数据类型 | 是否收集 | 必填/可选 | 用途 | 备注 |
|---|---|---|---|---|
| 邮箱地址 | 是 | 可选 | 应用功能/开发者通信 | Luotopia 账号可选项 |
| 设备 ID | 是 | 必填 | 应用功能、防欺诈 | 登录设备列表（设备名/标识/IP），用户可吊销 |
| 应用互动（分析） | 是 | 可选 | 分析 | 默认关闭（AppTelemetry opt-in） |
| 崩溃日志 | 是 | 可选 | 分析 | Crashlytics 随遥测总开关，默认关闭 |
| 用户生成内容 | 是 | 可选 | 应用功能 | 论坛帖子/评论 |
| 大致位置 | 视隐私政策 | 可选 | 应用功能 | 天气/校车使用；若仅本机处理不上传则不勾"收集" |
| CAS 凭据/会话 Cookie | 否（仅本机） | — | — | Android Keystore 加密本机存储，不收集 |
| 生物特征 | 否（仅本机） | — | — | 隐私锁本机验证，不上传 |

全部勾选"传输中加密"（HTTPS）；账号类数据勾"可请求删除"。填表前把 `/legal/privacy` 对照一遍，以隐私政策为准。

## 内容分级（IARC 问卷）

无广告、无赌博、无内购、无色情/暴力。有 UGC（论坛）→ 如实勾选"用户生成内容"。预期分级：Everyone / PEGI 3～12 区间。

## UGC 政策声明（论坛触发的必答项）

Play 对含 UGC 的应用要求：应用内举报机制、拉黑/屏蔽用户、内容审核。论坛已有版务管理与声望体系——提交前确认**应用内举报入口**和**用户屏蔽**功能可被审核员找到（政策表单会问"是否有举报/屏蔽机制"，答"是"并简述位置）。

## 首次提交步骤速记

1. Play Console 创建应用（名称：珞家 / Luotopia，默认语言 zh-CN，免费，应用/游戏选"应用"）
2. 上传 AAB 到内部测试轨道 → 核对 targetSdk/versionCode/签名证书指纹
3. 填商店设置各节（文案从本目录 10 个语言文件复制：名称 ≤30、短描述 ≤80、完整描述 ≤4000，首次提交"发布说明"留空）
4. 数据安全表、内容分级、UGC 声明、隐私政策 URL
5. 送审（内部测试免审；生产审核通常 1–7 天）
