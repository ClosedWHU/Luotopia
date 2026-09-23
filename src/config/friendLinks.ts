export interface FriendLinkImage {
  type: "network" | "svg";
  url?: string;
  data?: string;
}

export interface FriendLinkButton {
  label: string;
  url: string;
}

/**
 * Native "join QQ group" handoff, consumed by the Flutter app.
 *
 * QQ issues a *separate* key per platform, so `androidKey` (from the official
 * `joinQQGroup(key)` snippet) and `iosAuthSig` (from the official
 * `joinGroup:key:` snippet) are distinct values and are not interchangeable.
 * The app rejects an entry missing either one rather than rendering a button
 * that only works on one OS.
 *
 * Only Android and iOS render the button; on every other platform the app hides
 * it and the dialog body's group number / QR code remains the way in.
 */
export interface FriendLinkQqGroup {
  /** Button caption shown inside the dialog. */
  label: string;
  /** Group number; the iOS card URI needs it directly. */
  groupUin: string;
  androidKey: string;
  iosAuthSig: string;
}

export interface FriendLinkAction {
  type: "openUrl" | "dialog" | "none";
  url?: string;
  title?: string;
  body?: string;
  image?: FriendLinkImage;
  button?: FriendLinkButton;
  qqGroup?: FriendLinkQqGroup;
}

export interface FriendLinkItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  image?: FriendLinkImage;
  action: FriendLinkAction;
}

export interface FriendLinkCatalog {
  version: number;
  items: FriendLinkItem[];
}

export const categoryLabels: Record<string, string> = {
  feedback: "使用反馈",
  clubOrg: "社团组织",
  partnerApp: "合作与致谢",
  other: "其他",
};

const links: FriendLinkItem[] = [
  {
    id: "closedwhu",
    title: "WHU闭源社区（QQ群）",
    subtitle: "目前正在进行次世代武汉大学校园生活服务应用的开发",
    category: "feedback",
    image: { type: "network", url: "/img/links/closedwhu.jpeg" },
    action: {
      type: "dialog",
      title: "WHU闭源社区",
      body: "群号：994642924（长按选择复制）",
      image: { type: "network", url: "/img/links/closedwhu_qrcode.png" },
      button: { label: "访问 GitHub", url: "https://github.com/ClosedWHU" },
      qqGroup: {
        label: "加入QQ群",
        groupUin: "994642924",
        androidKey: "c3uMC_SPhGmesKBDFAnGHHSEaUBglEKX",
        iosAuthSig:
          "beN1nfk+NZaqVkjcuxUvDRYnChuCzuz89wqmkWigD6+k4ZYQ5QmRSz80tMibvDq5",
      },
    },
  },
  {
    id: "whu-emo",
    title: "WHU-EMO（QQ群）",
    subtitle: "一个致力于经管资料编写和开源分享的社区",
    category: "clubOrg",
    image: { type: "network", url: "/img/links/whuemo.png" },
    action: {
      type: "dialog",
      title: "WHU-EMO",
      body: "一群：389414112（已满）\n二群：1032919287（长按文本选择复制）",
      image: { type: "network", url: "/img/links/whuemo_qrcode.png" },
      // NOTE: these credentials are for 一群 (389414112), which the body above
      // already marks as full. The native handoff will open QQ on that group,
      // so QQ itself reports "群已满". Swap in the 二群 (1032919287) key from the
      // QQ console once one is generated if the button should target it.
      qqGroup: {
        label: "加入QQ群",
        groupUin: "389414112",
        androidKey: "az9Wa_D94E8c9SFVjnsFEtKqbj-wDWbT",
        iosAuthSig:
          "6OjuCm09gCFIuU8Vnodq35XZJ4WniomXyJd8vqLQ6GncIYz/z4N9VKIqXqtHjPVP",
      },
    },
  },
  {
    id: "whudays",
    title: "武汉大学动漫协会",
    subtitle: "希望每一位成员都能在这里找到自己的兴趣点，享受社团的每一刻",
    category: "clubOrg",
    image: { type: "network", url: "/img/links/whudays.png" },
    action: { type: "openUrl", url: "https://whudays.org/" },
  },
  {
    id: "ham-app",
    title: "Ham App",
    subtitle: "武汉大学生活助手——课表查询、成绩查询、预约体育场馆、预约武汉大学图书馆",
    category: "partnerApp",
    image: {
      type: "network",
      url: "https://docs.ham.nowcent.cn/icon-1024%202.png",
    },
    action: { type: "openUrl", url: "https://docs.ham.nowcent.cn/download/" },
  },
  {
    id: "milthm",
    title: "Milthm",
    subtitle: "一款充满激情的非商业节奏游戏，以动感的音轨和音符为特色",
    category: "partnerApp",
    image: { type: "network", url: "/img/links/milthm.jpg" },
    action: { type: "openUrl", url: "https://milthm.com/" },
  },
  {
    id: "nike232",
    title: "Tomfng",
    subtitle: "热爱 AI 工具与 Agents、系统与 KVCache，擅长 TypeScript / Go / Rust / C++",
    category: "partnerApp",
    image: { type: "network", url: "/img/links/nike232.jpg" },
    action: { type: "openUrl", url: "https://github.com/Nike232" },
  },
  {
    id: "soruxgpt",
    title: "SoruxGPT",
    subtitle: "一站式访问全球领先的人工智能模型",
    category: "other",
    image: { type: "network", url: "/img/links/soruxgpt.jpg" },
    action: {
      type: "dialog",
      title: "SoruxGPT",
      body: "邀请码：6L2Z8Q7M（注册使用）\n优惠码：IAMWHUER，需要使用WHU邮箱注册",
      button: { label: "注册", url: "https://app.soruxgpt.com/auth/register?aff=6L2Z8Q7M" },
    },
  },
];

export const friendLinkCatalog: FriendLinkCatalog = {
  version: 4,
  items: links,
};
