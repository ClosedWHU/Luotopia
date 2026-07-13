export interface FriendLinkImage {
  type: "network" | "svg";
  url?: string;
  data?: string;
}

export interface FriendLinkButton {
  label: string;
  url: string;
}

export interface FriendLinkAction {
  type: "openUrl" | "dialog" | "none";
  url?: string;
  title?: string;
  body?: string;
  image?: FriendLinkImage;
  button?: FriendLinkButton;
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

const SITE_BASE = "https://whu.sb";

const links: FriendLinkItem[] = [
  {
    id: "closedwhu",
    title: "WHU闭源社区（QQ群）",
    subtitle: "目前正在进行次世代武汉大学校园生活服务应用的开发",
    category: "feedback",
    image: { type: "network", url: `${SITE_BASE}/img/links/closedwhu.jpeg` },
    action: {
      type: "dialog",
      title: "WHU闭源社区",
      body: "群号：994642924（长按选择复制）",
      image: { type: "network", url: `${SITE_BASE}/img/links/closedwhu_qrcode.png` },
      button: { label: "访问 GitHub", url: "https://github.com/ClosedWHU" },
    },
  },
  {
    id: "whu-emo",
    title: "WHU-EMO（QQ群）",
    subtitle: "一个致力于经管资料编写和开源分享的社区",
    category: "clubOrg",
    image: { type: "network", url: `${SITE_BASE}/img/links/whuemo.png` },
    action: {
      type: "dialog",
      title: "WHU-EMO",
      body: "一群：389414112（已满）\n二群：1032919287（长按文本选择复制）",
      image: { type: "network", url: `${SITE_BASE}/img/links/whuemo_qrcode.png` },
    },
  },
  {
    id: "whudays",
    title: "武汉大学动漫协会",
    subtitle: "希望每一位成员都能在这里找到自己的兴趣点，享受社团的每一刻",
    category: "clubOrg",
    image: { type: "network", url: `${SITE_BASE}/img/links/whudays.png` },
    action: { type: "openUrl", url: "https://whudays.org/" },
  },
  {
    id: "milthm",
    title: "Milthm",
    subtitle: "一款充满激情的非商业节奏游戏，以动感的音轨和音符为特色",
    category: "partnerApp",
    image: { type: "network", url: `${SITE_BASE}/img/links/milthm.jpg` },
    action: { type: "openUrl", url: "https://milthm.com/" },
  },
  {
    id: "soruxgpt",
    title: "SoruxGPT",
    subtitle: "一站式访问全球领先的人工智能模型",
    category: "other",
    image: { type: "network", url: `${SITE_BASE}/img/links/soruxgpt.jpg` },
    action: {
      type: "dialog",
      title: "SoruxGPT",
      body: "邀请码：6L2Z8Q7M（注册使用）\n优惠码：IAMWHUER，需要使用WHU邮箱注册",
      button: { label: "注册", url: "https://app.soruxgpt.com/auth/register?aff=6L2Z8Q7M" },
    },
  },
];

export const friendLinkCatalog: FriendLinkCatalog = {
  version: 2,
  items: links,
};
