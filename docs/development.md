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
  config/         # 内容即数据：features / downloads / friendLinks / legal / deeplinkRoutes
  layouts/        # BaseLayout.astro —— 全站外壳
  pages/          # 路由。legal/ 下有 [slug].astro 动态路由
  scripts/        # 客户端运行时：page-lifecycle、icon-svg、icon-source.server
  styles/         # global.css —— 设计 token 的唯一来源
functions/        # Cloudflare Pages Functions
  api/            # /api/releases、/api/appstore、/api/status
  lib/            # 运行时无关的核心逻辑（可被 Node 直接 import）
  _middleware.ts  # 域名白名单、深链域名重写、404 的表示形式
public/           # 静态资源、.well-known、hot-update
tools/            # 构建脚本（热更新清单生成、AASA 校验）
```

内容改动优先落在 `src/config/` 而不是页面里 —— 功能列表、下载平台、友链、法律
文档都是数据驱动的。

## astro.config.mjs 里的三件事

配置里除了 Tailwind 还有三个自定义 Vite 插件，每个都对应一个不写下来就会被人
「顺手优化掉」的坑：

**`misansWeights()`** —— MiSans 自带的 `@font-face` 声明的是小米切字体时用的字重
（Regular 330 / Medium 380 / Bold 630），不是本站请求的值。不重写的话
`font-weight: 400` 和 `500` 都会落到 Medium 380，MD3 字阶里 body 与 label 的区别
就没了。插件在 import 时把每个 face 的 descriptor 改写成标准字重，字形数据和
unicode-range 分片都不动。

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

其它 `/api/*`（releases、appstore）本地没有对应中间件，`/download` 会退回静态占位
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

App 的解析器热更新脚本放在 `public/hot-update/scripts/`，清单是
`public/hot-update/manifest.json`。App **只接受有有效 Ed25519 签名的清单** ——
校验和对了但签名无效同样会被拒。

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

## 提交前

仓库没有测试套件，也没有 lint 脚本。最低要求是构建能过：

```sh
npm run build
```

`onBrokenLinks: 'throw'` 是文档站的设置，本站没有等价物 —— 改了路由记得手动点一遍
导航和页脚链接。涉及老 WebView 的改动（CSS 层、语法降级）必须用
`build && preview` 验证，dev server 看不到。
