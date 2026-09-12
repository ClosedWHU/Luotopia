export type FeatureStatus = "released" | "upcoming" | "development";

export interface SiteFeature {
  icon: string;
  title: string;
  summary: string;
  description: string;
  status?: FeatureStatus;
  highlight?: boolean;
}

export interface FeatureCategory {
  title: string;
  features: SiteFeature[];
}

export const featureStatusLabels: Record<Exclude<FeatureStatus, "released">, string> = {
  upcoming: "即将上线",
  development: "开发中",
};

export const featureCategories: FeatureCategory[] = [
  {
    title: "课程与学业",
    features: [
      {
        icon: "calendar_month",
        title: "课程表",
        summary: "多源导入、多课表管理，周月视图与课程提醒。",
        description:
          "支持本科教务、WakeUp 文件/分享码、第三方课表与手动编辑；多课表分组管理、周月视图、课程提醒与桌面小组件联动。",
        highlight: true,
      },
      {
        icon: "checklist",
        title: "日程与待办",
        summary: "课程、任务、备忘集中管理，支持重复与提醒。",
        description:
          "事项分为日程、任务与备忘；支持重复规则、优先级、列表分组、滑动操作、课程提醒和小组件同步。",
        highlight: true,
      },
      {
        icon: "school",
        title: "空闲教室",
        summary: "多维查询空闲教室，自动避开课表冲突。",
        description:
          "按日期、校区、楼栋与节次查询空闲教室，自动比对本人课表冲突，可一键生成日程事项。",
        highlight: true,
      },
      {
        icon: "library_books",
        title: "自习座位预约",
        summary: "图书馆座位原生查询、预约与取消。",
        description:
          "原生接口查询图书馆空间、日期、时段与座位，支持创建/取消预约、我的预约列表和日程提醒。",
        highlight: true,
      },
      {
        icon: "sports_tennis",
        title: "运动场馆预约",
        summary: "场馆、项目、时段预约与订单管理。",
        description:
          "查询运动场馆与可用时段，完成预约、支付、取消和订单查看，可将预约写入日程。",
        highlight: true,
      },
      {
        icon: "view_week",
        title: "全校课表与蹭课匹配",
        summary: "浏览全校总课表，筛选无冲突课程。",
        description:
          "按学年学期浏览全校总课表，检索课程并结合本人课表筛出无冲突候选，方便蹭课与补选。",
      },
      {
        icon: "bar_chart",
        title: "学业状态",
        summary: "培养方案、修读进度与学分统计。",
        description:
          "展示学校专业信息、培养方案、已修学分与未修课程，帮助追踪修读进度。",
      },
      {
        icon: "edit_note",
        title: "成绩查询",
        summary: "多渠道导入、GPA 算法与成绩趋势。",
        description:
          "支持本科教务、可信电子凭证与专业发展指导系统导入；GPA 算法切换、成绩趋势、成绩单 PDF、学期筛选与生物识别锁。",
      },
      {
        icon: "calendar_view_day",
        title: "校历",
        summary: "武大校历与学期安排随时查看。",
        description:
          "展示武大历年校历数据，学期起止、假期与教学安排一目了然。",
      },
      {
        icon: "rate_review",
        title: "课程给分与评价",
        summary: "给分分布、课程评价与匿名提交。",
        description:
          "按课程查看给分分布与评价，支持匿名提交；小样本聚合保护隐私，延续 WHU.sb / WHUCourses.cn 的数据脉络。",
      },
      {
        icon: "calendar_add_on",
        title: "研究生课表导入",
        summary: "研究生 newyjs 课表导入与校历对齐。",
        description:
          "对接研究生 newyjs 系统，读取学期、课表与研究生校历，自动对齐周次与上课日期。",
        status: "upcoming",
      },
      {
        icon: "cast_for_education",
        title: "学习通账号",
        summary: "绑定学习通账号，凭据本机安全存储。",
        description:
          "支持学习通（超星）密码或短信登录绑定，凭据按武大账号隔离存储，为后续课程与签到能力打基础。",
        status: "upcoming",
      },
    ],
  },
  {
    title: "校园服务",
    features: [
      {
        icon: "qr_code_2",
        title: "珞珈E卡与付款码",
        summary: "原生付款码自动刷新，手表也能刷。",
        description:
          "珞珈 E 卡入口与余额流水查询；原生付款码每分钟自动刷新，网页版兜底，支持 Apple Watch 与桌面快捷方式。",
        highlight: true,
      },
      {
        icon: "directions_bus",
        title: "校车",
        summary: "实时位置、线路查询与到站提醒。",
        description:
          "查询校车线路与实时位置，后台到站提醒，iOS 实况活动与手表快照同步。",
        highlight: true,
      },
      {
        icon: "map",
        title: "校园地图",
        summary: "原生地图、地点搜索与设施图层。",
        description:
          "原生地图实现，不嵌入网页；支持地点联合搜索、停车场/出入口/AED/校园设施图层、矢量与卫星图切换。",
        highlight: true,
      },
      {
        icon: "medical_services",
        title: "就医服务",
        summary: "就诊卡、挂号、排队、发票与报告。",
        description:
          "管理就诊卡，查看挂号记录与退号、门诊排队叫号、工作时间、已缴/未缴发票、检验检查报告。",
        highlight: true,
      },
      {
        icon: "bolt",
        title: "水电费与取水码",
        summary: "宿舍水电查询、缴费与开水取水码。",
        description:
          "查询宿舍水电用量并在线缴费，低余额提醒；开水取水码即开即用。",
      },
      {
        icon: "mark_email_unread",
        title: "校园消息",
        summary: "武大消息中心通知与待办聚合。",
        description:
          "聚合武大消息中心，按全部/通知/待办查看，支持详情与未读角标。",
      },
      {
        icon: "language",
        title: "智慧珞珈",
        summary: "官方门户直达，自动携带校园身份。",
        description:
          "内嵌智慧珞珈门户，复用校园身份会话，常用学校服务无需反复登录。",
      },
      {
        icon: "router",
        title: "校园网",
        summary: "套餐、设备、充值与暂停恢复。",
        description:
          "查询套餐状态、暂停/恢复（天数顺延）、门户自动认证、运营商切换、在线设备管理与网费充值；iOS 支持系统级接入。",
      },
      {
        icon: "vpn_key",
        title: "校园 VPN",
        summary: "aTrust VPN 分流与连通性测试。",
        description:
          "连接 WHU aTrust VPN，支持应用内代理或系统级 TUN、分流规则、双因素挑战与网页连通性测试。",
      },
      {
        icon: "forum",
        title: "论坛「珞珈防空洞」",
        summary: "帖子、评论、附件、声望与版务管理。",
        description:
          "社区论坛支持帖子、评论、版块、附件、搜索、声望、排行榜与公开管理日志；标签默认隐藏，可在设置→导航中开启。",
        highlight: true,
      },
      {
        icon: "electric_scooter",
        title: "共享电动车",
        summary: "知音/芒果扫码、蓝牙与远程解锁。",
        description:
          "接入知音出行与芒果电单车：扫码、蓝牙与远程解锁，骑行实况、iOS 实时活动、骑行卡、钱包充值、押金退款和订单管理。",
        status: "upcoming",
      },
      {
        icon: "layers",
        title: "地图实时图层",
        summary: "地图上显示校车与共享电动车位置。",
        description:
          "在校园地图叠加校车实时位置，以及知音/芒果共享电动车分布，便于就近取车与等车。",
        status: "upcoming",
      },
    ],
  },
  {
    title: "智能工具",
    features: [
      {
        icon: "smart_toy",
        title: "AI 助手",
        summary: "多模型 Agent，可操作校园服务。",
        description:
          "支持内置与自定义多模型、多模态附件、语音输入/朗读、图像生成、联网搜索、MCP、技能与助手；确认桥提供手动/半自动/全自动三档，工具可查询和管理课表、成绩、校园服务等数据。",
        highlight: true,
      },
      {
        icon: "partly_cloudy_day",
        title: "天气",
        summary: "多数据源预报、AQI、降水与预警。",
        description:
          "小米天气 / Open-Meteo / AccuWeather 分能力直连，提供逐小时预报、空气质量、降水、预警、缓存与重试。",
        highlight: true,
      },
      {
        icon: "mail",
        title: "Coremail 邮箱",
        summary: "校园邮件收件、详情与未读角标。",
        description:
          "原生 Coremail 客户端支持 SSO 登录、客户端专用密码、收件箱、邮件详情安全渲染与未读角标。",
      },
      {
        icon: "palette",
        title: "壁纸中心",
        summary: "本地、Bing 每日与分页壁纸配置。",
        description:
          "支持无壁纸、本地图片与 Bing 每日随机；课程表、校园、设置、任务列表、论坛、AI 页面可独立配置，深色蒙版可调。",
      },
      {
        icon: "terminal",
        title: "脚本热更新",
        summary: "签名解析脚本，接口变化无需发版。",
        description:
          "官网分发 Ed25519 签名的 QuickJS 解析脚本；校园接口变化时可热更新解析器，减少等待 App 发版。",
      },
      {
        icon: "update",
        title: "应用内更新",
        summary: "检查新版本并引导安装。",
        description:
          "从 GitHub Releases 检查更新，Android 提供 ABI 升级建议与安装引导，桌面平台提示下载新版本。",
      },
      {
        icon: "outgoing_mail",
        title: "邮件撰写与 AI 邮箱工具",
        summary: "应用内写邮件，AI 可检索邮箱。",
        description:
          "增加邮件撰写与发送流程，并将校园邮箱开放给 AI Agent，用于检索、整理、移动和草拟发送。",
        status: "upcoming",
      },
      {
        icon: "eco",
        title: "花粉与天气数据源控制",
        summary: "花粉浓度、周报与数据源回退透明化。",
        description:
          "增加花粉浓度与官方花粉周报，显示数据源替换/回退情况，并支持严格模式，避免静默换源。",
        status: "upcoming",
      },
      {
        icon: "payments",
        title: "AI 缴费协助",
        summary: "在用户确认下发起水电费与网费缴费。",
        description:
          "AI 可发起水电费与校园网费缴费流程，实际支付仍由用户在收银台确认。",
        status: "upcoming",
      },
      {
        icon: "laptop_mac",
        title: "Apple 快捷指令",
        summary: "快捷指令调用经审核的 App 工具。",
        description:
          "macOS 快捷指令可调用校历、课程表、成绩、空闲教室等经审核工具，写操作需要确认。",
        status: "upcoming",
      },
      {
        icon: "tune",
        title: "壁纸链接与 Theme Lab",
        summary: "网络壁纸链接与实验设计语言预览。",
        description:
          "壁纸中心支持网络图片 URL；开发者 Theme Lab 可预览不同设计语言，属实验功能。",
        status: "upcoming",
      },
    ],
  },
  {
    title: "跨端与账号",
    features: [
      {
        icon: "widgets",
        title: "桌面小组件",
        summary: "四款小组件覆盖 Android/iOS/macOS。",
        description:
          "事项列表、今日课程、即将开始、本周课程四款小组件，覆盖 Android、iOS 与 macOS 菜单栏。",
      },
      {
        icon: "watch",
        title: "手表联动",
        summary: "Apple Watch 与华为/鸿蒙手表同步。",
        description:
          "Apple Watch 可出示 E 卡付款码；华为/鸿蒙手表同步日程、校车与天气快照。",
      },
      {
        icon: "apps",
        title: "桌面快捷方式",
        summary: "长按图标直达常用入口。",
        description:
          "Android App Shortcuts 与 iOS Quick Actions 直达 E 卡付款码、自习预约、AI 等入口，并按登录状态显示。",
      },
      {
        icon: "passkey",
        title: "账号与安全",
        summary: "CAS、珞家账号、Passkeys 与设备信任。",
        description:
          "武大 CAS 与珞家账号分离；支持 Passkeys、多会话、设备信任、API 凭据、成绩生物识别锁，诊断遥测可关闭。",
      },
      {
        icon: "translate",
        title: "多语言",
        summary: "12 种语言与地区化时间格式。",
        description:
          "支持简体中文、繁体中文、粤语、英语、日语、韩语、法语、西班牙语、葡萄牙语、俄语、越南语共 12 种语言。",
      },
      {
        icon: "switch_account",
        title: "多账号与第三方绑定",
        summary: "按武大账号隔离凭据并支持切换。",
        description:
          "多个武大账号切换时，VPN、邮箱、学习通等凭据按账号隔离；支持 Ham 等第三方账号授权绑定。",
        status: "upcoming",
      },
    ],
  },
  {
    title: "开发中",
    features: [
      {
        icon: "menu_book",
        title: "图书借阅",
        summary: "馆藏借阅、续借与到期提醒。",
        description:
          "计划接入馆藏借阅 API，展示当前借阅、到期时间、续借状态，并支持到期提醒。",
        status: "development",
      },
      {
        icon: "folder",
        title: "学习资料共享",
        summary: "按课程、教师、学期检索资料。",
        description:
          "计划接入服务端检索、上传、下载、收藏与审核状态，按课程、教师、学期组织资料。",
        status: "development",
      },
      {
        icon: "trending_up",
        title: "成绩增强",
        summary: "学期对比、摘要导出与课程标识联动。",
        description:
          "在现有成绩趋势基础上，继续完善学期对比、摘要导出与课程标识联动。",
        status: "development",
      },
      {
        icon: "repeat",
        title: "重复事项增强",
        summary: "完善重复事项的展开与整组操作。",
        description:
          "完善重复事项的实例展开、完成、恢复与整组操作。",
        status: "development",
      },
      {
        icon: "dashboard",
        title: "小组件增强",
        summary: "增强 Android 并探索更多平台入口。",
        description:
          "继续增强 Android 小组件，并探索更多桌面平台入口。",
        status: "development",
      },
      {
        icon: "public",
        title: "独立 Web 版",
        summary: "Flutter Web 停止维护，规划独立 Web。",
        description:
          "Flutter Web 兼容层与发布产物已停止维护；独立 Web 产品将在需求和服务端代理能力明确后启动。",
        status: "development",
      },
    ],
  },
];

export const highlightedFeatures: SiteFeature[] = featureCategories
  .flatMap((category) => category.features)
  .filter((feature) => feature.highlight);
