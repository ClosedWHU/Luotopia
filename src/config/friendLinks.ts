import type { TranslationKey, Translator } from "../i18n/ui";

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
  /**
   * `readonly` because the literal below is `as const`, which is what makes
   * `FriendLinkId` a union of literal ids rather than `string`. Erased at
   * runtime, so `JSON.stringify` of the catalog is unaffected.
   */
  items: readonly FriendLinkItem[];
}

/*
 * The catalogue has two consumers with opposite requirements, and the split is
 * the whole reason this file looks the way it does.
 *
 * `friendLinkCatalog` is served verbatim at `/data/friend-links.json` by
 * `src/pages/data/friend-links.json.ts`, and the Flutter app fetches it:
 * `app_config.dart` builds the URL and `friend_links_provider.dart` parses the
 * result, including the `qqGroup` block that drives a native "join QQ group"
 * sheet. That document is a wire format. It must not gain, lose, rename or
 * reorder a field, and its bytes must not move — so it keeps the default
 * locale's copy inline, exactly as written, and localisation does not touch it.
 * Translating the app's friend-link sheet is the app's job, in its own ARB
 * files, not something a shared web endpoint can do for it.
 *
 * `friendLinkCatalogFor(t)` is the same shape with the prose resolved through
 * the dictionaries. `FriendLinks.astro` renders that one. Nothing else reads
 * it, and it never reaches the endpoint.
 *
 * The cost is that the Chinese prose exists twice: once here, where it is the
 * wire format's payload, and once in `src/i18n/zh-Hans.json`, where it is the
 * default locale's dictionary value. `tools/check-i18n.mjs` cannot see the
 * duplication. If you edit one, edit the other.
 */
const links = [
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
] as const satisfies readonly FriendLinkItem[];

/** Every friend-link id in the list, as a literal union. */
export type FriendLinkId = (typeof links)[number]["id"];

/** Every category id in the list, as a literal union. */
export type FriendLinkCategoryId = (typeof links)[number]["category"];

export const friendLinkCatalog: FriendLinkCatalog = {
  version: 4,
  items: links,
};

/**
 * The two dictionary keys every friend-link row renders.
 *
 * Typed as template literals over `FriendLinkId` and narrowed to
 * `TranslationKey`, so `t(friendLinkKeys(id).title)` is checked against the
 * default locale's key set: add a link here and forget its copy in
 * `zh-Hans.json`, and the call site stops typechecking instead of rendering the
 * raw key. (`astro build` does not typecheck — `tools/check-i18n.mjs` enforces
 * the same invariant at build time, and it is that script which fails CI.)
 */
export function friendLinkKeys(id: FriendLinkId): {
  title: TranslationKey;
  subtitle: TranslationKey;
} {
  return {
    title: `community.friend.item.${id}.title` as TranslationKey,
    subtitle: `community.friend.item.${id}.subtitle` as TranslationKey,
  };
}

/**
 * The dialog's own two keys.
 *
 * A separate helper rather than two more fields of `friendLinkKeys()` because
 * only the three `type: "dialog"` links render one. Deriving them for all seven
 * would put keys in every dictionary that no page ever reads.
 */
export function friendLinkDialogKeys(id: FriendLinkId): {
  title: TranslationKey;
  body: TranslationKey;
} {
  return {
    title: `community.friend.item.${id}.dialog.title` as TranslationKey,
    body: `community.friend.item.${id}.dialog.body` as TranslationKey,
  };
}

/** The dialog CTA's dictionary key — only two links ship a button at all. */
export function friendLinkDialogButtonKey(id: FriendLinkId): TranslationKey {
  return `community.friend.item.${id}.dialog.button` as TranslationKey;
}

/** The category heading's dictionary key. */
export function friendLinkCategoryKey(id: FriendLinkCategoryId): TranslationKey {
  return `community.friend.category.${id}` as TranslationKey;
}

/**
 * The same catalog with its prose resolved for `locale`.
 *
 * Identical shape, identical field names, identical key order — only the values
 * of `title`, `subtitle` and, on dialog links, `action.title`, `action.body`
 * and `action.button.label` differ. Everything that is not prose is carried
 * across untouched by the spreads, `qqGroup` included: those are credentials
 * and identifiers, not copy, and a translated group number does not join a
 * group.
 *
 * Deliberately *not* what `/data/friend-links.json` serves; see the comment on
 * `links` above.
 */
export function friendLinkCatalogFor(t: Translator): FriendLinkCatalog {
  return {
    version: friendLinkCatalog.version,
    items: friendLinkCatalog.items.map((item) => {
      const id = item.id as FriendLinkId;
      const keys = friendLinkKeys(id);
      const action: FriendLinkAction = { ...item.action };

      if (action.type === "dialog") {
        const dialog = friendLinkDialogKeys(id);
        action.title = t(dialog.title);
        action.body = t(dialog.body);
        // Shallow copy first: `action.button` still points at the frozen
        // literal's object, and writing through it would change the catalog the
        // JSON endpoint serves.
        if (action.button) {
          action.button = {
            ...action.button,
            label: t(friendLinkDialogButtonKey(id)),
          };
        }
      }

      return {
        ...item,
        title: t(keys.title),
        subtitle: t(keys.subtitle),
        action,
      };
    }),
  };
}
