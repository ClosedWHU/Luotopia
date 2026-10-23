# 官网开发

[English](./development.en.md)

本仓库是 [www.whu.sb](https://www.whu.sb) 的源码：一个 Astro 静态站点，部署在
Cloudflare Pages 上，`functions/` 目录提供少量 Pages Functions。

部署、环境变量与域名相关内容在 [deployment.md](./deployment.md)。

## 环境

Node >= 22.12（见 `package.json` 的 `engines`）。包管理器用 npm，仓库里提交的是
`package-lock.json`。

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # 产物在 dist/
npm run preview    # 本地预览构建产物
```

### 后台模式的 dev server

`astro dev` 支持后台运行，适合让服务器一直挂着：

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

## 技术栈

| 部分 | 选型 |
|------|------|
| 框架 | Astro 7，纯静态输出（没有 SSR，没有前端框架 island） |
| 样式 | Tailwind v4（`@tailwindcss/vite`）+ 手写设计 token |
| 字体 | Plus Jakarta Sans（拉丁）+ MiSans（中文），均自托管 |
| 背景 | `@paper-design/shaders` + three.js 的极光着色器 |
| 滚动 | Lenis（平滑滚动，实例挂在 `window.ltLenis`） |
| 图标 | `@material-symbols/svg-400`，构建时内联成 SVG |
| 路由 | Astro Client Router（`<ClientRouter fallback="swap" />`） |

页面上的交互一律是原生 TypeScript，通过 `onPageSetup()` 挂载 —— 没有 React/Vue。
新增交互前请先读 [页面约定](#页面约定)。

## 目录结构

```
src/
  components/     # 复用的 Astro 组件（Navbar / Footer / PageHeader / …）
    pages/        # 整页正文（HomePage / FeaturesPage），被各语种的路由共用
  config/         # 内容即数据：features / downloads / friendLinks / legal / deeplinkRoutes
  i18n/           # 多语言：语种表 / 发布集 / 词典 / 查表 / 路由表，见下
  layouts/        # BaseLayout.astro —— 全站外壳
  pages/          # 路由。legal/ 下有 [slug].astro 动态路由，[lang]/ 下是每个语种的副本
  scripts/        # 客户端运行时：page-lifecycle、icon-svg、icon-source.server
  styles/         # tokens.css —— 设计 token 的唯一来源（--lt-*，营销页与文档共用）
                  # global.css —— Tailwind 入口 + @theme 别名 + 组件规则
                  # docs.css —— /docs 的 prose 与外壳样式（全部引用 lt token）
  content/docs/   # 文档内容（content collection，160 篇中文 markdown），见 docs/docs-site.md
functions/        # Cloudflare Pages Functions
  api/            # /api/releases、/api/appstore、/api/status
  lib/            # 运行时无关的核心逻辑（可被 Node 直接 import）
  _middleware.ts  # 域名白名单、深链域名重写、docs.whu.sb 301、404 的表示形式
public/           # 静态资源、.well-known、hot-update、scales
tools/            # 构建脚本（热更新清单生成、量表清单生成、AASA 校验、
                  # vite/font-plugins 字体插件）
```

内容改动优先落在 `src/config/` 而不是页面里 —— 功能列表、下载平台、友链、法律
文档都是数据驱动的。

## astro.config.mjs 里的几件事

配置里除了 Tailwind 和 i18n 还有四个自定义 Vite 插件（两个字体插件抽在
`tools/vite/font-plugins.mjs`），每个都对应一个不写下来就会被人「顺手优化掉」
的坑：

**`misansWeights()`** —— MiSans 自带的 `@font-face` 声明的是小米切字体时用的字重
（Regular 330 / Medium 380 / Bold 630），不是本站请求的值。不重写的话
`font-weight: 400` 和 `500` 都会落到 Medium 380，MD3 字阶里 body 与 label 的区别
就没了。插件在 import 时把每个 face 的 descriptor 改写成标准字重，字形数据和
unicode-range 分片都不动。

**`pruneFontSubsets()`** —— MiSans 按字符簇切成 56 个 `unicode-range` 分片（每个
字重一份），172 条 `@font-face` 规则占了 293 KB 共享样式表的 81%，而全站十二个页面
一共只用到 1038 个字形。插件扫 `src/**` 的**源码文本**收集字符集，把覆盖不到任何
一个字符的分片连同规则一起删掉，对应的 woff2 也就根本不会产出。

必须在 `transform` 阶段做而不是 `generateBundle`：Vite 是在 transform **之后**算 CSS
哈希的，晚剪会让剪完的字节顶着剪前的文件名发出，而那个名字是 `immutable`、缓存一年。
只在构建时生效，dev 下始终提供完整字族（否则改一个字要重启服务器才看得到，很难查）。

**扫的是文本，注释也算。** 这条会咬到 i18n，见[多语言](#多语言i18n)。

**`flattenCssLayers()`** —— Tailwind v4 把所有产物塞进
`@layer properties/theme/base/utilities`，而级联层是 Chromium 99+ 的特性。更老的
Android WebView（无 Play 服务的停更设备）**整块丢弃**解析不了的 `@layer`，于是所有
工具类消失、页面塌成无样式 HTML。插件在 `generateBundle` 阶段把层展开，保留原本的
层优先级顺序。只在构建时生效 —— `astro dev` 仍然输出分层 CSS，所以验证老内核行为
必须用 `npm run build && npm run preview`。

**`statusDevApi()`** —— `astro dev` **不会**运行 `functions/`（Pages Functions 是
Cloudflare 运行时的东西），本地访问 `/api/status` 会 404。这个中间件在本地提供同一个
端点，调用的是**同一份** `functions/lib/uptimerobot.ts`，只把 `caches.default` 换成
内存 Map。凭据按 wrangler 的顺序读：`.dev.vars` → `.env.local` → `.env` →
真实环境变量；没有 key 时返回 503 `not_configured`，和生产一致。

其他 `/api/*`（releases、appstore）本地没有对应中间件，`/download` 会退回静态占位
文案 —— 要验证它们得用 `npm run build && npx wrangler pages dev dist`。

## 构建目标：Chrome 66

```js
target: ['chrome66', 'safari12', 'firefox68', 'edge88']
```

Vite 默认的 `baseline-widely-available`（约 Chrome 107）会原样输出 `?.` / `??`，而
这在 Chrome 80 以下是**解析错误** —— 模块一行都跑不起来。66 是这份代码实际能服务的
下限：`AbortController`（66，page-lifecycle 的核心）、动态 `import()`（63，着色器
chunk）、`import.meta`（64）都在，其余由 esbuild 降级。

再往下就退化成无 JS 路径：可读的静态 HTML（展平后的 CSS 不需要 JS）加上 `<head>`
里的 reveal 兜底 / `<noscript>`。

**写客户端代码时的硬性约束**：

- 不用 `replaceAll`（85+）、`Array.prototype.flat`/`flatMap`（69+）、
  `Object.hasOwn`（93+）、`AbortSignal.any`（116+）、`AbortSignal.timeout`（103+）、
  `structuredClone`（98+）
- 不用 `inset` 简写（87+）—— 写 `top/right/bottom/left`
- `@property`（85+）、`color-mix()`（111+）可以用，但必须有可接受的降级
- 监听器统一用 `{ signal }`，`page-lifecycle.ts` 会给老内核打补丁

## 设计系统

`src/styles/global.css` 是 token 的唯一来源，分两层：

1. `:root` / `:root.dark` 里的 `--lt-*` 原始值 —— 永远输出、不会被 tree-shake，
   也是深色模式唯一的切换点
2. `@theme` 里的别名 —— 教 Tailwind 生成工具类（`text-title-medium`、
   `bg-surface`、`rounded-card`、`backdrop-blur-glass`）

色板与字阶来自 MD3（种子色 `#005BAC`，与 App 的
`AppDesignLanguage` 同源），但**表面模型不是 MD3 的**：不透明 tonal surface 被换成
了一整套透明度阶梯（玻璃）。几何尺寸不是网页自己发明的 —— 圆角取自 App 的
`AppDesignLayout.glass()`（control 14 / nested 18 / card 28 / group 32），模糊取自
`kAppGlassBlurSigma`（10）与 `appGlassStyle(blur:)`（8）。

### 玻璃的三条硬规则

改样式之前先读完 `global.css` 里的注释，这里只列会咬人的部分：

**backdrop-filter 需要背后有东西。** 没有活动内容的背景，模糊会退化成一坨半透明
塑料。这就是 `BaseLayout` 在每一页都铺一层 page-fixed 极光的原因，不只是装饰首屏。

**opacity < 1 会让元素变成 backdrop root。** 此时它内部的 `backdrop-filter` 不再
采样页面，玻璃会瞬间变平。所以：
- 含玻璃的元素入场动画只能动 `transform`（`.lt-reveal-lift`）
- 需要淡入的纯文本元素才用 `.lt-reveal`
- 淡入淡出的浮层（tooltip / snackbar）用不透明的 inverse surface，不用玻璃

**嵌套玻璃没有意义。** 父面板已经模糊过极光了，子元素再模糊一次采样到的是父面板
自己的填充，视觉无变化、每个元素多一个合成层。面板内的行用 `.lt-inset` /
`.lt-inset-raised`（`FriendLinks` 与 `/status` 都是这个写法）。

**圆角容器要滚动，就得是两个元素。** `border-radius` 只圆容器自己的背景，不圆它的
滚动条：滚动条按 border box 的整个高度画成方的，滑块走到两端时就落在圆角轮廓**外面**，
而不是被圆角切掉。把滑块本身设成圆角也没用——轨道仍然是顶天立地的。

只有**裁剪祖先**能解决，因为在祖先内部滚动条只是普通子内容，会被祖先的圆角裁剪区切到。
所以形状固定为：外层放圆角 + `overflow: hidden`，内层放 `.lt-scroll-y` +
`overflow-y: auto`。`.lt-dialog-card`/`.lt-dialog-body`、`.lt-lang-panel`/
`.lt-lang-scroll`、`.lt-mobile-menu`/`.lt-mobile-menu-scroll` 都是这个结构，照抄即可。

`clip-path: inset(0 round Npx)` 直接加在滚动容器上、或者给 `::-webkit-scrollbar-track`
加 `margin`，都能省掉这层元素——但两者都建立在「某个引擎会裁剪自己的滚动条」这个猜测
上。包一层是级联规则**保证**的行为，而本站的标准是：停更的 Android WebView 也得能活。

`/status` 上曾经有 12 张各自带 `backdrop-filter` 的卡片，快速滚动时合成器来不及对
固定的 WebGL 画布重新采样，就直接画卡片自己的白色半透明底 —— 表现为滚动中的白块。
改成「每组一个玻璃面板 + 内部 inset 行」之后消失。

### 动画的另一条：fill-mode

入场动画用 `backwards`，不要用 `both`。终帧本来就是元素的自然状态，`forwards` 只会
让合成层在动画结束后**永久**留着，之后每一帧滚动都要重新光栅化。

## 页面约定

**外壳**：所有页面走 `BaseLayout`（`title` 必填，`description` 可选，`bare` 去掉
导航/页脚，`noindex` 加 robots 标签）。内页顶部用 `PageHeader`，它自带比首屏更弱的
hero wash —— 内页是文档，不是落地页。

**客户端脚本必须用 `onPageSetup()`**（`src/scripts/page-lifecycle.ts`）：

```ts
import { onPageSetup } from "../scripts/page-lifecycle";

onPageSetup((signal) => {
  // 所有 addEventListener 传 { signal }
  // 定时器 / observer 在返回的清理函数里销毁
  return () => clearInterval(timer);
});
```

原因是 Astro 会按 URL/内容去重打包后的脚本：第二次访问同一页时脚本**不会重新执行**，
而它上次绑定的 DOM 已经被换掉了。`astro:page-load` 是唯一可靠的每次导航入口，
`AbortSignal` 负责在下次 swap 之前自动解绑。直接在模块顶层绑事件会泄漏。

**滚动揭示**：`.lt-reveal` / `.lt-reveal-lift` 由 `BaseLayout` 里的
IntersectionObserver 在页面加载时统一认领。**运行时插入的 DOM 不会被观察到**，加了
这两个类就会永远停在 `opacity: 0`。异步渲染的内容请自己写入场动画（只动
`transform`），参考 `/status` 的 `lt-st-rise`。

**图标**：Astro 模板里用 `<Icon name="material_symbol_name" />`（构建时内联）；
客户端脚本里拼 HTML 时按 `download.astro` 的写法：

```ts
import { normalizeIconSvg } from "../scripts/icon-svg";
import raw from "@material-symbols/svg-400/outlined/open_in_new.svg?raw";
const icon = normalizeIconSvg(raw, "text-base");
```

**Tailwind 的类名扫描**：v4 扫的是源码文本，所以 JS 模板字符串里的工具类也能被
识别（`download.astro`、`status.astro` 都这么写）。反过来说，`scripts/`、`tools/`、
`functions/`、`docs/` 里的类形状字符串会被 `@source not` 排除，否则注释里的示例会
被编译成没人用的工具类。

**转义**：凡是把 API 数据拼进 `innerHTML` 的地方都要过 `escapeHtml()`。监控名、
Release 说明这些都来自外部。

## 热更新清单

App 的解析器热更新脚本放在 `public/hot-update/scripts/`，数据资产（如 AI 模型
元数据目录，`.json.gz`）放在 `public/hot-update/assets/`，清单是
`public/hot-update/manifest.json`。App **只接受有有效 Ed25519 签名的清单** ——
校验和对了但签名无效同样会被拒。数据资产不进沙箱执行，完整性由清单签名加
每文件 sha256 保证；模型目录由 `.github/workflows/sync-model-metadata.yml`
每日重建（需要仓库 secret `HOT_UPDATE_ED25519_PRIVATE_KEY`，与 Cloudflare
Production 变量同值），详见 [public/hot-update/README.md](../public/hot-update/README.md)。

首次本地开发要初始化一次签名密钥：

```sh
npm run hot-update:init-key
```

私钥写进已被忽略的 `.env.hot-update`，公钥只安装到相邻的 App 工作区。然后：

```sh
npm run hot-update:generate
npm run hot-update:verify
```

`npm run build` 会通过 `prebuild` 自动生成清单，签名密钥不可用时**构建失败**。
生产环境必须以 secret 提供 `HOT_UPDATE_ED25519_PRIVATE_KEY`（base64 编码的 PKCS#8
私钥）。

`prebuild` 还会跑 `check:aasa`（`tools/verify-aasa.mjs`），校验
`apple-app-site-association` 的格式。

## 量表清单

App 的心理量表数据放在 `public/scales/data/`，清单是
`public/scales/manifest.json`。与热更新不同，**这份清单不签名，也不需要任何密钥**
—— 量表是数据而不是可执行代码，完整性由 HTTPS 加每文件 sha256 保证，客户端下载
后逐个校验摘要。所以它在本地、PR Preview 和生产构建里的生成结果完全一致，不存在
「Preview 拿不到密钥」的问题。

```sh
npm run scales:generate   # 扫描 data/ 重新生成 manifest.json
npm run scales:check      # 只校验已提交的清单是否最新，不写文件（CI 用）
```

生成器（`tools/generate-scale-manifest.mjs`）在以下情况直接失败：文件不是合法
JSON、文件内 `id` 与文件名不符、缺 `name` 或 `abbreviation`、单文件超过 4 MB、
或生成的清单为空。`updatedAt` 与两个 `version` 只在内容真的变了时才动，因此重复
运行是幂等的 —— 这正是 `scales:check` 能用来卡住「改了数据忘了重新生成清单」的
前提。

字段含义、客户端的缓存与校验流程，以及**量表数据的版权与许可**（MMPI-2 上游为
GPLv3，需要单独评估），见 [public/scales/README.md](../public/scales/README.md)。

## 多语言（i18n）

站点是**纯静态**的：没有 adapter，没有 SSR。所以 `Astro.preferredLocale` 恒为
`undefined`，Astro 自带的 i18n 中间件也只在构建期跑一次。分工因此是固定的：

| 层 | 文件 | 职责 |
|----|------|------|
| 配置 | `astro.config.mjs` 的 `i18n` | 声明语种、决定 URL 形状（`prefixDefaultLocale: false`，默认语种留在 `/`） |
| 语种表 | `src/i18n/locales.ts` | code → URL 段 / 本地名 / hreflang / og:locale，以及 `Accept-Language` 的折叠规则 |
| 发布集 | `src/i18n/published.json` | 真正构建的语种。配置文件、语种表、校验脚本三方共读这一份 |
| 词典 | `src/i18n/<code>.json` | 扁平点号 key；默认语种那份定义 key 集 |
| 查表 | `src/i18n/ui.ts` | `useTranslations()`、`routeUrl()`、`hreflangAlternates()` |
| 路由表 | `src/i18n/routes.ts` | `ROUTES` 与 `TRANSLATED_ROUTES`：哪个语种翻了哪个页面 |
| 路由 | `src/pages/[lang]/*.astro` | 每个已发布语种一份，正文共用 `src/components/pages/*.astro` |
| 法律文档 | `src/config/legal.ts` | 只存**结构**（slug、`lastUpdated`、每节有无正文、几个子节），正文按位置派生 key 落在词典里 |
| 首访识别 / 404 语言 | `functions/_middleware.ts` | `Accept-Language` → 302，以及按语种替换 404 文档，见[部署文档](./deployment.md#语言协商) |

页面组件里**不传 locale**，一律读 `Astro.currentLocale`（Astro 按路由填：`/en/features`
→ `en`，`/features` → 默认语种）。这样路由文件只是壳，两份实现不可能对不上。

十个语种当前都翻了全部 12 条路由。`TRANSLATED_ROUTES` 因此对每个语种都是
`ALL_ROUTES`——但**保留这张表**，因为「某语种只翻一部分」是随时可能再出现的状态，而
链接生成、`hreflang`、中间件的重定向闸门三处都靠它。

### 加一个语种

1. 写 `src/i18n/<code>.json` —— key 集必须与默认语种**完全一致**，占位符也要一致，
   `npm run i18n:check` 会卡住缺漏与多余
2. 在 `src/i18n/locales.ts` 的 `LOCALES` 里加一行
3. 把 code 加进 `src/i18n/published.json`
4. 在 `src/i18n/routes.ts` 的 `TRANSLATED_ROUTES` 里登记翻了哪些页面

页面文件不用动：`src/pages/[lang]/*.astro` 由 `PREFIXED_LOCALES` 驱动，自动多出一份。

只翻一部分页面是可以的，登记没翻的那部分留给默认语种即可。

### 部分翻译时各处怎么表现

`TRANSLATED_ROUTES` 是唯一的事实来源。某个语种没登记的页面：

- 导航与页脚由 `routeUrl()` 生成链接，**直接指向默认语种的 URL**，不经过重定向
- 切换器由 `pathInLocale()` 决定目标，切到没有译文的页面时停在原页——但 cookie 会
  记住这次选择，之后有译文的页面就是那个语种
- `hreflang` 不声明该语种有这个页面。声明一个会 404 的 alternate 比不声明更糟：
  搜索引擎会校验整个 cluster，有一个成员不回应就整组作废
- 中间件**不会**把首访者重定向到该路径的语种版本。否则会先 404、再被 404 回退弹回
  原路径、然后又被识别一次——死循环

带语种前缀的路径 404 时，中间件先探一次去掉前缀的路径：命中就 302 过去，没命中就直接
回该语种的 404 文档。

Astro 自带的 `i18n.fallback` **不要用**：它认不出 `src/pages/[lang]/*` 建出来的路由，
会把 `/en` 当成一个待翻译的普通页面，在 `/en/en` 生成跳转壳，而且它给 `/en/features`
生成的壳优先级**高于**真正的英文页——真的译文会被直接丢掉，构建只报一条 warning。
它产出的壳还是 2 秒 meta refresh、canonical 指向裸域，等于两跳重定向。

### 404 页为什么是路由而不是产物

`dist/404.html` 只能有一份——**这个文件本身就是 Pages 的配置**（见部署文档）。所以九种
译文是普通路由 `src/pages/[lang]/404.astro`，构建出 `/<locale>/404/`，由中间件在 HTML
404 上取对应那份、仍以 404 状态返回。`ROUTES` 里因此有一条 `notFound: "/404"`，
`/404` 与 `/<locale>/404/` 都能直接访问，这与本站一直允许 `curl /404` 是一致的。

它是 `noindex` 的，所以 `BaseLayout` 不给它输出 `hreflang` 簇——`/open` 同理。给
noindex 页面声明 alternate 没有意义，而且簇不对称比不声明更糟。

### App 契约：这几样不能被多语言动到

`app/lib/core/config/app_config.dart` 直接从 `siteBaseUrl` 拼这些 URL，**没有语种前缀**，
所以它们必须永远以默认语种、原路径、原字节提供：

| URL | 用途 |
|-----|------|
| `/data/legal.json` | 法律文档目录（版本 + 各文档 `lastUpdated`），客户端据此判断缓存是否过期 |
| `/data/friend-links.json` | 友链目录，含 QQ 群原生唤起所需的 `groupUin` / `androidKey` / `iosAuthSig` |
| `/legal/<slug>.md` | 法律文档的 Markdown 源，客户端**原生渲染**而非 WebView |
| `/legal/<slug>/` | 同上的 WebView 兜底 |

`config/legal.ts` 与 `config/friendLinks.ts` 的重构都是**加法**：默认语种的输出字节不变，
译文走 `/<locale>/legal/<slug>.md` 这类新路径。`renderLegalMarkdown()` 只在非默认语种
多输出一行「以简体中文为准」的声明，这正是默认语种那份必须保持原样的原因——它是 App
会缓存并按 `lastUpdated` 校验的文档。

改这两个文件之后必须比对摘要：

```sh
npx astro build
certutil -hashfile dist\data\legal.json SHA256
certutil -hashfile dist\data\friend-links.json SHA256
certutil -hashfile dist\legal\terms.md SHA256
```

`tools/check-i18n.mjs` 会走 `legalDocuments` 的结构、按位置推出全部 key，并断言默认
语种词典一个不缺、也没有哪个 `legal.*` key 指向已不存在的章节。派生 key 是这套 i18n
里唯一一处类型系统管不到的地方：加一节而忘了十份词典，页面上就会直接渲染出
`legal.privacy.s12.heading`。

### 两个会咬人的地方

**字体裁剪把注释也算进去，而十种语言加上区域字体基本上取消了这项优化。** `pruneFontSubsets()`
扫的是 `src/**` 的源码文本，数据和注释一视同仁。全站十种语言意味着字符集必须覆盖繁体
专有字、假名、谚文、西里尔与越南语拉丁扩展。zh-Hant/ja/ko 现在用 Noto Sans TC/JP/KR
（MiSans 是简体导向，没有 `locl`，简繁同码位的字会渲染成简体字形）。构建产物实测：
629 条 `@font-face` 规则、534 个 woff2 文件（MiSans 110 + Noto Sans TC 184 + JP 226 +
KR 124）；整份共享样式表 133 KB → 727 KB raw、38 → 246 KB gzip、19.0 → 90 KB brotli，
其中字体分片占 raw 的 86%，也几乎是全部增量。真正传输的增量是 brotli 那 **+71 KB**；
raw 的 +594 KB 主要是解析成本，而它几乎全是 `unicode-range` 的十六进制列表，所以压缩率
约 6.6:1。

几条相关的约定：

- 分片是**惰性**的。`unicode-range` 决定浏览器只在页面真的渲染到某个字符时才去下对应
  的 woff2，所以西班牙语访客不会下载谚文分片。涨的是 CSS 体积，不是字体流量
- MiSans 只在 zh-Hans 页面用到；zh-Hant/ja/ko 分别用 Noto Sans TC/JP/KR。`--font-sans`
  里 Plus Jakarta Sans 排在它们前面，拉丁文案根本走不到 CJK 字体。按语种加载已经做了，
  但 CSS 是共享的，所以所有页面都会解析全部 `@font-face` 规则（字体文件本身是惰性的，
  只在用到时才下载）
- i18n 相关模块的注释一律英文；要引用中文原文时改成转述，别照抄。一条引用了十种语言
  本地名的注释，实测要多留 6 个分片、6,893 字节

本地名（endonym）不能省：切换器必须在任何语种下都能让看不懂当前页面的人找到自己的
语言，所以它按各自文字渲染，不翻译成本地语的说法。

**`transition:persist` 与语种是冲突的，四处。** 持久化元素不参与 swap，所以：

- `Navbar.astro` 的 persist 名带语种（`lt-navbar-${locale}`）：同语种导航照旧走持久化，
  跨语种导航重新渲染一份，否则旧语言的标签会留在新语言的页面上。`<html lang>` 不用管，
  Astro 会从新文档同步根元素属性（`BaseLayout` 的 `preserveRootState` 只负责 theme 与
  kiosk 这两个纯客户端状态）。
- 而 persist 名一变，元素就被换掉，**导航栏脚本里所有模块级引用都指向了脱离文档的
  节点**——Astro 按内容去重脚本，模块不会重新执行。后果是切一次语言之后主题开关、
  汉堡按钮、语言面板全部静默失效。所以 `Navbar.astro` 的脚本必须走
  `onPageSetup()`（见[页面约定](#页面约定)），每次导航重新查询元素；
  `onBeforeNavigation()` 里同理，只能实时查询，不能捕获。
- 同语种那次「便宜的持久化」还有另一面：**服务端渲染进导航栏内部的东西，全部冻结在
  第一个把这条栏搬上屏的页面上**。导航链接与 logo 是按语种绝对定位的，冻结了也照样
  对；但切换器的 href 来自 `pathInLocale(Astro.url.pathname, …)`，描述的是它被构建
  出来的那个页面。于是从 `/en/features/` 走到 `/en/download/` 再点日本語，会落到
  `/ja/features/`；更糟的是**一次从 `/` 开始的访问，会把该语种之后所有切换都钉死在
  `/<lang>/`**——这正是「切语言总是回首页」的成因。`Navbar.astro` 因此在
  `astro:before-swap` 里把新文档的 href 拷到持久化的栏上。选择拷贝而不是在客户端重算，
  是为了把「目标语种没翻译这条路由时回退到默认语种」这个判断留在服务端，而不是把
  `TRANSLATED_ROUTES`（连同语种表里的本地名）复制进导航栏 chunk。
- 导航链接的 `aria-current` 同样是按页生成的，由同一个 handler 一起拷。它曾经在客户端
  由**第二份**匹配规则重算，而两份不一致：客户端用 `base === "/"` 表示「这是首页，精确
  匹配」，这只在默认语种下成立。其它语种里首页的 base 是 `/en`、`/ja`……是该语言下每个
  页面的前缀，于是整个访问期间首页一直是高亮的。现在服务端改成与
  `routeUrl(locale, "home")` 比较而不是与字面量 `/` 比较，客户端那一份直接删掉。同一条
  规则写两遍不是冗余，是定时炸弹。

**切换器链接直接指向目标 URL，不带 `?lang=`、不经过重定向**，形状与站内其它链接完全
一致。曾经带过 `?lang=`，指望中间件 302 换 cookie 再落到干净 URL，并靠
`data-astro-reload` 让它走整页导航——但**那个属性在 Astro 7 里根本不存在**（整个包里
搜不到），所以点击始终走 Client Router 的 fetch+swap，中间夹一个 302。改成直链后重定向
从点击路径里消失了，路由能保住是因为 href 本身就是那条路由；偏好 cookie 由捕获阶段的
委托监听在导航开始前写入。中间件仍然认 `?lang=`，那是给 App 深链和无 JS 调用方用的。

`data-astro-prefetch={false}` **是有效的**（Astro 的 `elMatchesStrategy` 对字符串
`"false"` 直接返回 false），必须留着：`prefetchAll: true` 否则会让鼠标划过就把十个语种
的整页文档全预取一遍。

### 校验

```sh
npm run i18n:check        # 源码层：词典、语种表、配置、路由表互相一致
npm run i18n:check:dist   # 构建后：TRANSLATED_ROUTES 与 dist/ 双向对齐
```

`i18n:check` 已挂进 `prebuild`。`--dist` 那半边需要产物，所以是单独一条命令，改了路由
登记之后要手动跑一次。
## 提交前

仓库没有测试套件，也没有 lint 脚本。最低要求是构建能过：

```sh
npm run build
```

`onBrokenLinks: 'throw'` 是文档站的设置，本站没有等价物 —— 改了路由记得手动点一遍
导航和页脚链接。涉及老 WebView 的改动（CSS 层、语法降级）必须用
`build && preview` 验证，dev server 看不到。

`functions/` 也一样，`astro dev` 不跑它。语言协商、404 的表示形式、深链域名改写都要
用 `npm run build && npx wrangler pages dev dist` 才看得到；本地 workerd 的兼容日期可能
落后于当天，报 `requires compatibility date` 时加 `--compatibility-date <它支持的那天>`。
