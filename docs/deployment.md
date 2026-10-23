# 官网部署

[English](./deployment.en.md)

生产环境是 Cloudflare Pages，域名 `www.whu.sb`。本地开发见
[development.md](./development.md)。

## Cloudflare Pages

1. 在 Cloudflare Dashboard 创建 Pages 项目，连接
   [ClosedWHU/Luotopia](https://github.com/ClosedWHU/Luotopia)
2. 构建配置：
   - **框架预设**：Astro
    - **构建命令**：`npm run build`
    - **Node 版本**：仓库根目录 `.nvmrc` 固定（Pages 会读它，等价于面板里设
      `NODE_VERSION`）。astro 7.4 起要求 ≥22.22.0，而 Pages 默认 22.16 —— 2026-10-19
      的 astro bump 之后连续多次构建失败就是这个原因；升 astro 时必须同步检查
      `.nvmrc` 与 `package.json` 的 `engines`
    - **构建输出目录**：`dist`
3. 配置[环境变量](#环境变量)
4. 部署后在 Pages 设置里绑定自定义域名

不要给这个项目加 `wrangler.jsonc`。加了之后它会成为整个项目配置的 source of
truth，面板里配好的环境变量与绑定会被文件覆盖 —— 风险远大于收益（详见
[404 处理](#404-处理)）。

### 构建流程

`npm run build` 之前会跑 `prebuild`：

| 步骤 | 作用 | 失败后果 |
|------|------|----------|
| `check:aasa` | 校验 `public/.well-known/apple-app-site-association` 格式 | 构建中止 |
| `hot-update:generate` | 生成并签名 `public/hot-update/manifest.json` | 缺签名密钥时构建中止 |
| `scales:generate` | 生成 `public/scales/manifest.json`（不签名） | 量表数据非法时构建中止 |

也就是说 `HOT_UPDATE_ED25519_PRIVATE_KEY` 是**必需**的 secret，不是可选项 ——
但只对生产构建必需，见下。

### PR 预览构建

Pages 会给每个 PR 建一次 preview 部署。Preview 环境默认拿不到 secret，于是
`hot-update:generate` 抛错、整次构建红掉 —— 每个 PR 都是红叉，久了就没人看红叉了。

**不要把 `HOT_UPDATE_ED25519_PRIVATE_KEY` 配到 Preview 环境。** 这是本仓库里唯一
一个泄露后果是「远程代码执行」的密钥：它签名的解析器脚本会在**每一台已安装的 App**
里执行。而 preview 构建跑的是 PR 的代码 —— 任何能开 PR 的人都能在 workflow 或构建
脚本里加一行把它读出来。App Store Connect 密钥能吊销重发，这个密钥泄露要轮换签名
公钥、发版、等所有客户端更新。

正确做法是让「必须签名」这件事变成有条件的：**preview 部署的清单没有任何人读**，
所以没什么可签的。在 Pages 的 **Preview** 环境（只 Preview，不要选 All
environments）加一个变量：

```
HOT_UPDATE_ALLOW_UNSIGNED=1
```

设置之后，缺密钥的构建会：

- 照常跑完所有校验 —— 测试向量齐全性检查、checksum、版本号计算，所以「新增解析器
  脚本却忘了配测试向量」在 PR 上依然会失败
- **不写** `manifest.json`，保留仓库里已提交的那份签名清单。不写而不是写一份未签名
  的，是因为写了等于让 preview 部署一个所有 App 都会拒收的清单，还会在构建目录里
  留一份现成的未签名文件
- 打印明确的警告

生产构建的行为完全不变：没有密钥就失败。

还有一道防线，防止有人图省事把这个变量配在 **All environments** 上：Cloudflare 会
注入 `CF_PAGES` 与 `CF_PAGES_BRANCH`，脚本发现自己在生产分支上就直接拒绝未签名构建
（分支名可用 `HOT_UPDATE_PRODUCTION_BRANCH` 覆盖，默认 `main`）。否则一次面板误操作
就会让生产清单悄悄停止更新 —— 脚本改了、清单没签、热更新不再到达任何客户端，而构建
是绿的。

### Preview 上哪些功能不可用

Preview 环境没有运行时 secret，所以：

| 路由 | Preview 上的表现 |
|------|------------------|
| `/status` | 503 `not_configured`，页面显示错误卡片 |
| `/api/releases*`、`/api/appstore/latest` | 无 `GITHUB_TOKEN` 时走匿名限额；下载页可能退回静态占位文案 |
| 静态页面、样式、交互 | 全部正常 |

`UPTIMEROBOT_API_KEY` 是只读的，配到 Preview 风险很低，想让 PR 审阅时能看到真实状态
页就配上。App Store Connect 那组**不要**配到 Preview。

## 环境变量

在 Pages → Settings → Environment variables 配置。本地开发写在 `.dev.vars`
（参考 `.dev.vars.example`），`.env.example` 是完整清单。

镜像部署共用同一批变量，但读取时机不同：EdgeOne 在**运行时**交给函数
（`context.env`）；ESA 没有运行时环境变量，`npm run build:esa` 在**构建期**
把它们内联进产物 banner（见[其他部署方式](#其他部署方式)）。

| 变量 | 必需 | 说明 |
|------|------|------|
| `HOT_UPDATE_ED25519_PRIVATE_KEY` | 是 | base64 的 PKCS#8 Ed25519 私钥，`npm run hot-update:init-key` 生成。**只配 Production** |
| `HOT_UPDATE_ALLOW_UNSIGNED` | 否 | `1` 时允许无密钥构建（只校验、不签名、不写清单）。**只配 Preview**，见 [PR 预览构建](#pr-预览构建) |
| `HOT_UPDATE_PRODUCTION_BRANCH` | 否 | 生产分支名，默认 `main`。用于拒绝在生产分支上未签名构建 |
| `MIRROR_ASSETS_ONLY` | 否 | `1` 时把构建产物中的全部 HTML 页面替换为跳转到主域名的存根（保留根 `404.html`），把部署变成纯静态文件镜像。**只配镜像项目**，Cloudflare 主站不配。见[其他部署方式](#其他部署方式) |
| `MIRROR_MAIN_DOMAIN` | 否 | 镜像跳转存根的目标域名，默认 `www.whu.sb`（应与 `functions/_middleware.ts` 的 `MAIN_DOMAIN` 一致）。仅 `MIRROR_ASSETS_ONLY` 启用时使用 |
| `UPTIMEROBOT_API_KEY` | `/status` 需要 | Read-Only key 即可 |
| `GITHUB_TOKEN` | 否 | 提高 `/api/releases*` 的 GitHub API 限额 |
| `GITHUB_ASSET_MIRROR` | 否 | release 资产下载的镜像前缀列表（逗号/空格分隔，按序尝试，如 `https://gh-proxy.com,https://ghfast.top`），全部失败回退 GitHub 直连。**国内边缘部署（EdgeOne/ESA）建议配**，Cloudflare 不配。见[其他部署方式](#其他部署方式) |
| `REPO` | 否 | 默认 `ClosedWHU/Luotopia` |
| `APPSTORE_CONNECT` | 否 | `1` 时启用 App Store Connect（TestFlight 构建号） |
| `APPSTORE_CONNECT_KEY_ID` / `_ISSUER_ID` / `_PRIVATE_KEY` | 启用时需要 | PEM 用字面 `\n` 换行 |
| `APPSTORE_BUNDLE_ID` / `APPSTORE_COUNTRY` | 否 | 默认 `sb.whu.luotopia` / `cn` |
| `MSSTORE_PRODUCT_ID` / `MSSTORE_MARKET` | 否 | 默认 `9P29527S1H0H` / `CN`；`/api/msstore/latest` 查询的产品与市场 |
| `UPTIMEROBOT_API_URL` | 否 | 默认 `https://api.uptimerobot.com/v2/` |
| `STATUS_COUNT_DAYS` | 否 | 历史天数，默认 90，上限 180 |
| `STATUS_SHOW_LINKS` | 否 | 是否在页面公开探测地址，默认 `1` |
| `STATUS_TIME_ZONE` | 否 | 日界时区，默认 `Asia/Shanghai` |
| `STATUS_CACHE_TTL` | 否 | 快照缓存秒数，默认 300 |

`APPSTORE_CONNECT` 未启用时，`/api/appstore/latest` 会退回公开的 iTunes Lookup
（不需要 JWT）。

`/api/msstore/latest` 合并两个无文档公开源：badge 工具的 `v8.0/sdk/products`
（在架状态与元数据）和产品页内嵌态（版本号、发布日期）。后者解析失败时版本字段
为 null，下载页只保留静态 Store 链接——两个源都无文档担保，降级是设计的一部分。

> [!CAUTION]
> 密钥只进 Pages 的 secret，不进仓库。`.dev.vars` 与 `.env*`（除 `.example`）都已
> gitignore。历史上 `status` 子项目把带真实 key 的 `.env` 提交进了 git —— gitignore
> **不会**取消跟踪已提交的文件，加规则之前就得先 `git rm --cached`。

## 404 处理

`src/pages/404.astro` 构建为 `dist/404.html`，**这个文件本身就是配置**。

Pages 判断「自定义 404」还是「单页应用」的唯一依据，是产物根目录有没有 `404.html`：
有则以 `404` 状态返回该文件；没有则认定为 SPA，把*所有*未命中路径重写到 `/` 并返回
`200`。本站此前没有 `404.html`，所以 `/typo` 乃至 `/missing.png` 都会返回首页 ——
这不是面板里某个开关被打开，而是缺文件的默认推断。

因此：

- Pages 项目**没有** `not_found_handling` 配置项。文档里那段
  `assets.not_found_handling: "404-page"` 属于 **Workers 静态资源**
  （`assets.directory` + `main`），与 Pages 是两套产品。
- 也**不需要**在中间件里维护站点路由表。未命中由平台判定，新增页面不会漏配。

`functions/_middleware.ts` 只保留平台做不到的部分。就 404 而言有两件：

**按客户端选择表示形式。** 浏览器拿到完整的 404 文档，`curl` / `wget` / 各类 HTTP 库
拿到一行 `text/plain`（`404 Not Found: /path` + 站点首页），避免 34 KB 的文档刷满
终端。判定依据 `Accept` 是否显式包含 `text/html`，并用 `Sec-Fetch-Dest` 兜底；
Function 自己返回的 JSON 404（如 `/api/*`）不会被改写。

**按访客选择语言。** `dist/404.html` 只能有一份，所以九种译文是普通路由
（`/<locale>/404/`，由 `src/pages/[lang]/404.astro` 构建），中间件在 HTML 404 上用
`ASSETS.fetch` 取对应语种那份，以 **404 状态**返回。语种优先级与全站一致：路径前缀 →
cookie → `Accept-Language`。`ASSETS.fetch` 直达资源存储、不再进 Functions，所以不会
递归。响应头照旧是 `max-age=0, must-revalidate`——404 绝不能被缓存住，下次部署后这个
路径可能就存在了。

同一个 `prefersHtml()` 判定也是[语言协商](#语言协商)的第一道闸——静态产物没有 SSR，
`Accept-Language` 同样只有边缘能读到。

部署后验证：

```sh
curl -i https://www.whu.sb/definitely-not-a-page   # HTTP/2 404 + text/plain
curl -s https://www.whu.sb/404 | head -c 120       # 404 页面本体
```

## 域名与中间件

`functions/_middleware.ts` 维护白名单：`localhost`、`127.0.0.1`、`www.whu.sb`、
`whu.sb`、`*.whu.sb` 直通；`*.pages.dev` / `*.workers.dev` 以及任何不在名单里的
Host 一律 302 到 `https://www.whu.sb`（保留 path 与 query）。新增域名要同时改这里，
否则会被重定向走。

### 语言协商

站点是纯静态的、没有 SSR，所以 `Accept-Language` 只能在边缘读——`Astro.preferredLocale`
在静态产物里恒为 `undefined`。中间件在域名归一化之后、`next()` 之前处理，四道闸缺一不可：

| 闸 | 条件 | 挡住的是 |
|----|------|----------|
| 表示形式 | `prefersHtml()` | `_astro` 资源、字体、`/api/*`，以及 **prefetch**（`sec-fetch-dest: empty`） |
| 路径形状 | `!looksLikeAsset()` | 地址栏直接打开的 `/api/releases/latest`、`/favicon.svg`、`/scales/manifest.json` |
| 已有前缀 | `!hasLocalePrefix()` | 已经在 `/en/…` 上的访问 |
| 已有选择 | 无 `luotopia_lang` cookie | 用户手动选过语言之后的每一次访问 |

四道都过了才解析 `Accept-Language`（自己写的 q 值解析，Workers 没有可靠的内置
matcher），把标签逐级折叠到本站语种：`zh-TW` → `zh-Hant`、`en-GB` → `en`；`q=0` 是
明确拒绝，跳过而不是继续往下找。折叠结果不是默认语种，**且该语种真的有这个页面**
（`TRANSLATED_ROUTES`），才 302 过去。

最后那个条件不是可选的。少了它，`/status` + `Accept-Language: en` 会 302 到
`/en/status`，那里 404，404 回退再 302 回 `/status`，然后又被识别一次——死循环。

**自动识别不写 cookie，只有显式选择写。** 写的一方有两个：

- 站内的语言切换器**在浏览器里写**（`Navbar.astro` 的捕获阶段委托监听，
  `Path=/; Max-Age=一年; SameSite=Lax`，`Secure` 仅在 https 下附加——否则本地
  `wrangler pages dev` 会直接拒收）。切换器的链接**直接指向目标 URL**，不带参数、
  不经过重定向，形状与站内其它链接一致。
- `?lang=<code>` 由中间件 `Set-Cookie` 并 302 到落点。这条留给 **App 深链、无 JS
  的浏览器和脚本调用**：`luotopia.whu.sb` 上是服务端改写而不是重定向（见下节），主站
  上则是普通 302。

两者都不能换成「按路径前缀记偏好」，那会记错方向：在 `/en/` 上点一个没有译文的页面
（导航直接指向中文原页），cookie 就会被写成 `zh-Hans`，把用户的选择悄悄改掉。

`?lang=` 的落点是**该语种下这个页面**的位置，不是原路径去掉参数：`/status?lang=en`
记下 en 并停在 `/status`（英文没有这一页时），`/features?lang=en` 落到 `/en/features`；
其它查询参数保留，未发布的语种（`?lang=ja`）整个忽略。

一律用 302 而不是 301：永久重定向会被按 URL 缓存，用户改了浏览器语言也回不来。

带语种前缀的路径 404 时，中间件先探一次去掉前缀的路径：存在就 302 过去（部分翻译时的
正解），不存在就直接回该语种的 404 文档，不再多一跳。这本是 Astro `i18n.fallback` 的
活，但那个方案与 `src/pages/[lang]/*` 冲突，见
[开发文档](./development.md#部分翻译时各处怎么表现)。目前十个语种翻了全部路由，所以
第一条分支实际上不会命中；留着是因为「某语种只翻一部分」这件事随时可能再发生。

`/status` + `Accept-Language: en` 会 302 到 `/en/status`——**因为该语种确实有这个页面**。
`pathInLocale()` 同时充当闸门和目标：目标等于原路径就不跳。少了这道闸就是
`/en/status` → 404 → 回退 → `/status` → 再识别，死循环。

### 深链域名（luotopia.whu.sb）

App 把 `https://luotopia.whu.sb/*` 注册为 Android App Links（autoVerify）与 iOS
Universal Links（applinks），链接与 App 内路由一一对应（GoRouter 按 path 匹配）。
已安装且验证通过时由系统直接唤起 App；否则中间件把该域名上的 HTML 导航重写到
`/open` 落地页（保留原始 URL），由页面脚本映射回 `luotopia://app/<path>` 并提供
「打开 App / 下载」引导。

落地页**参与**语言协商，但方式与主站不同：它是服务端改写而不是重定向，因为浏览器
地址栏必须留在原始深链 URL 上——那个 URL 就是页面脚本要映射成 `luotopia://` 的东西。
中间件按 `?lang=` → cookie → `Accept-Language` 的优先级取语种，`ASSETS.fetch` 对应
的 `/<locale>/open/` 返回。`?lang=` 是**给 App 用的**：App 知道自己的语言，比从系统
推断准得多（系统是英文但 App 里选了中文这种错配很常见）。该域名上不写 cookie——它与
`www.whu.sb` 不同源，写了也发不过去，只会看起来像一个永远不生效的偏好。取不到已发布
语种时回落到默认语种的落地页，绝不会因为 `?lang=` 写错而让深链失败。

`/.well-known/*` 与 `/open` 之外的路径照旧整体重写；关联文件必须无重定向直达，Apple
的 CDN 与 Android 的校验器把重定向当作验证失败。

维护要点：

- `public/.well-known/assetlinks.json` 里的 `sha256_cert_fingerprints` 必须与
  **实际分发的签名证书**一致（当前包含 release 证书与仓库共享 debug 证书）。更换
  签名密钥后要同步更新，否则 Android 侧验证失效。指纹用
  `apksigner verify --print-certs app.apk` 查看。
- `public/.well-known/apple-app-site-association` 对应 Team ID `ZW372988NV`，经
  `public/_headers` 以 `application/json` 提供；该文件必须**无重定向**直达。
- 需在 Pages 的自定义域名里绑定 `luotopia.whu.sb`（DNS CNAME 指向 Pages 项目）。
  域名必须**先于** App 发版上线，两端才会在安装时完成验证。
- 该域名整体被 App 认领，所以扫描器探测、过期二维码等**不认识的路径也会落到
  `/open`**。`src/config/deeplinkRoutes.ts` 列出 App 路由的顶层段（与
  `app/lib/app/router/app_route_paths.dart` 的首段一致）；首段不在其中时落地页会额外
  提示「App 里可能没有这个页面，仍会尝试打开」，但**唤起照常进行** —— 列表过期不
  应该拦住一个本来能成功的跳转。只校验首段是有意的：App 有数百个嵌套路由且随版本
  变动，更深的匹配交给客户端自己的错误页。

校验：

```sh
npm run check:aasa
curl -sI https://luotopia.whu.sb/.well-known/apple-app-site-association
```

### 文档域名（docs.whu.sb）

文档站原为独立部署（`ClosedWHU/Luotopia-Docs`，自己的 Worker），公开侧
（user/client 两区）已合并为本站 `/docs` 下的一等公民页面（主站自己的渲染链，
无文档框架；见 `docs/docs-site.md`）；server/ebike 开发文档随闭源代码转入
**私有**的 Luotopia-Docs 仓。`docs.whu.sb` 保留为纯跳转域名：中间件把该主机
上的**所有**路径 301 到 `https://www.whu.sb/docs/...`——user/client 的历史
URL（旧 Docusaurus 下划线 slug 等）经 `src/config/docs/redirects.mjs` 解析到
对应页面，**server/ebike 的旧 URL 按前缀落到 `/docs/` 首页**（公开侧已无对应
页面，首页说明去向）；全部**一跳到位**，不会出现「先跳主域再跳规范页」的
两跳链。查询串保留，fragment 由浏览器自动带回。

维护要点：

- 需在 Pages 自定义域名绑定 `docs.whu.sb`（与 `luotopia.whu.sb` 同样方式），并
  **删除旧 `luotopia-docs` Worker 上对该域名的绑定**，否则请求到不了本站中间件。
- `/docs` 前缀在 `NON_PAGE_PREFIXES` 里：文档只有 zh-Hans，语言协商永不给它加
  `/en/` 之类前缀（`/en/docs` 不存在）；hreflang 对路由表之外的路径只发
  x-default。
- 镜像构建（`MIRROR_ASSETS_ONLY=1`）照常包含文档页面，但它们的 HTML 与其他
  页面一样被替换为跳回主域的桩（镜像只分发资产）。
- user/client 页面改名/移动后，同步更新 `src/config/docs/redirects.mjs`，
  两个消费方（站内 redirects、docs.whu.sb 301）自动同步；server/ebike 前缀
  的落地兜底在 `functions/lib/docs-redirects.ts`。

## 服务状态页（/status）

`/status` 取代了原先独立部署的 `status.whu.sb`（Nuxt + naive-ui 的
`imsyy/site-status` 分支），与官网共用同一套设计、导航与深浅色。

数据链路：

| 层 | 文件 | 职责 |
|----|------|------|
| 核心 | `functions/lib/uptimerobot.ts` | 按 `Asia/Shanghai` 切日界、构造 `custom_uptime_ranges`、把 monitors/logs 聚合成快照（分组、每日状态、中断次数与时长）。运行时无关，Node 与 Workers 都能 import |
| 接口 | `functions/api/status.ts` | `GET /api/status`，用 `caches.default` 缓存派生快照；`?fresh=1` 绕过读取但有 60 秒下限 |
| 页面 | `src/pages/status.astro` | 客户端每 5 分钟轮询；标签页隐藏时停止计时、回前台按墙上时钟补齐；30/90 天切换只在前端切片同一份快照 |
| 本地 | `astro.config.mjs` 的 `statusDevApi` | `astro dev` 下提供同一个端点，共用上面那份核心 |

`?fresh=1` 的 60 秒下限不是多余的：只存在于浏览器里的节流只是建议，一个循环请求
`?fresh=1` 的客户端能耗光账户的 API 配额，把状态页自己搞挂 —— 而这正是它要报告的
事情。

`days` **不接受查询参数**，只能由 `STATUS_COUNT_DAYS` 配置。它是上游请求和缓存键的
一部分，放开就等于给任何人无限放大缓存未命中的能力。

UptimeRobot 侧的监控命名约定会影响分组：形如 `WHU.sb Backend (Cloudflare)` 的名字
会被拆成分组 `Backend` + 条目 `Cloudflare`；不符合该形状的名字进入「其他服务」分组
并保留全名。

### status.whu.sb 迁移

在 Cloudflare 上给该子域配 301 到 `https://www.whu.sb/status/`（Bulk Redirects 或
一条 Redirect Rule 即可），DNS 记录可以保留在原处。原独立项目已从工作区删除。

## 其他部署方式

### Cloudflare Workers（SSR）

若需要 SSR：

```sh
npx astro add cloudflare
```

然后在 `astro.config.mjs` 配置 `output: 'server'` 与 `cloudflare()` adapter，
`npm run build` 后把 `dist/` 或 `dist/_worker.js` 部署到 Workers。注意这会改变
404 的处理方式（见上文），`functions/` 也需要一并迁移。

### Vercel

导入仓库即可，Astro 会被自动识别，Framework Preset 保持默认。`functions/` 是
Cloudflare Pages Functions 的约定，Vercel 上不会生效 —— `/api/*` 需要改写成
`api/` 目录下的 Vercel Serverless Functions。

### 静态托管

```sh
npm run build
# dist/ 可以部署到 Nginx / GitHub Pages / Netlify 等
```

同样地，`functions/` 不会生效，依赖 `/api/*` 的部分（下载页的版本徽章与更新日志、
`/status` 的全部数据）会退回到静态占位或错误态。

### 静态文件镜像（EdgeOne Pages / 阿里云 ESA）

`whu-homepage-edgeone.tsinbei.cn`（EdgeOne Pages）从同一仓库构建，定位是**文件分发 +
API 函数面**——App 经由它拉取 hot-update 清单与脚本、`/scales/`、字体、`/_astro/`
产物，以及 `/api/*`、`/fonts/gstatic/*` 端点——不承担网页浏览。
`whu-homepage-esa.tsinbei.cn`（阿里云 ESA）承担同一角色，是
第二家云的冗余镜像。镜像项目需要的构建期变量：

- `MIRROR_ASSETS_ONLY=1`：构建期由 `astro.config.mjs` 的 `assetsOnlyMirror`
  把全部 HTML 页面替换为跳转存根——一个几百字节的文档，用 JS
  `location.replace`（保留 query 和 hash）立即把访客送到主域名的同路径，
  `<meta refresh>` 兜底无 JS 的场景，`<link rel=canonical>` 告诉爬虫真身
  在哪。纯静态托管没有运行时，发不出真正的 3xx，存根是静态镜像能做到的
  等价物。跳转目标用 `MIRROR_MAIN_DOMAIN` 覆盖（默认 `www.whu.sb`）。
- 根 `404.html` 原样保留：CF 风格平台以它的存在决定「自定义 404」还是
  「SPA 重写」（见 [404 处理](#404-处理)），留着它，typo 和缺失资源的未
  命中才是确定的 404，而不是被弹去主域名再 404 一次。
- `HOT_UPDATE_ED25519_PRIVATE_KEY`：prebuild 每次构建都重新生成签名清单，
  镜像分发的正是这份文件，所以仍然必需。若镜像项目开启了预览部署，同
  Cloudflare 的纪律：私钥只给生产部署。

**函数面怎么上去的**（两家共用一套核心，仿 `../proxy` 的多平台模式）：

- 路由表在 `functions/lib/dispatch.ts`，按 pathname 分发到 `functions/` 里
  现成的六个处理器（status、appstore/latest、releases、releases/latest、
  releases/download/*、fonts/gstatic/*）。Cloudflare 继续用它自己的文件路由，
  不经过 dispatch；EdgeOne / ESA 的入口全部是薄适配器，端点不会在平台间漂移。
- `npm run build:edgeone`（= astro build + `node build.mjs edgeone`）把
  `platform/edgeone/` 的六个入口用 esbuild 打成自包含 JS，连同 `dist/` 组装进
  `platform-dist/edgeone/`。**站点直接铺在输出目录根部**、`edge-functions/`
  与之并列（外加一个最小 `package.json`）——这是真实部署实测出的布局：
  EdgeOne 把输出目录本身当静态根；若再嵌一层 `public/`，整站会跑到
  `/public/...` 路径下、真实路径全部 404。仓库根的
  `edgeone.json` 已把构建命令和输出目录定好（Makers 只吃 JavaScript，也不解析
  跨目录 TS 导入，所以不能让平台直接跑源码；若控制台不认配置文件就照抄同值）。
  EdgeOne 的环境变量是**运行时**的（函数从 `context.env` 读），上表的
  `UPTIMEROBOT_API_KEY`、`GITHUB_TOKEN`、`APPSTORE_*`、`STATUS_*` 配了就生效。
- `npm run build:esa`（= astro build + `node build.mjs esa`）打出单入口
  `platform-dist/esa/edge-routine.js`（`export default { fetch }`，ESM——贴
  service-worker 形式会**静默不执行**）。仓库根的 `esa.jsonc` **覆盖控制台**，
  `name` 必须与已建的 Pages 项目同名，否则会另建一个；`assets.directory` 为
  `./dist`，默认路由「命中静态文件返回文件，否则执行函数」正是镜像要的，
  **不要**配 `assets.notFoundStrategy`。ESA 的环境变量是**构建期**的：
  `build.mjs` 把控制台「构建信息 → 环境变量」里的值内联成产物 banner
  （`globalThis.__LUOTOPIA_HOMEPAGE_ENV__`），密钥进产物不进仓库
  （`platform-dist/` 已 gitignore）。构建日志必须出现
  `config inlined from the build environment: …`；看到 `NO config inlined`
  说明变量没进构建，`/api/status` 会是 `503 not_configured`。
- ESA 平台限制（handlers 已遵守，改代码时保持）：单次调用 ≤4 个 fetch 子请求
  （最重的 App Store Connect 路径 3 个，下载在配了镜像且镜像失败时恰好 4 个；
  Cache API 读写也计数）；`Host` /
  `Connection` 等禁止头不可读写、迭代包含它们的集合也可能抛异常——现有
  handler 只读 `request.url` 和 `request.method`，新路由保持这一点。

**GitHub 下载提速（`GITHUB_ASSET_MIRROR`）**：国内节点直连 GitHub 拉 release
资产很慢，而函数响应会被平台边缘缓存——所以让慢跳只发生一次。配置镜像前缀
列表（逗号/空格分隔，按序尝试，如 `https://gh-proxy.com,https://ghfast.top`）
后，`/api/releases/download/*` 依次按
`{前缀}/https://github.com/{repo}/releases/download/{tag}/{file}` 拉字节
（这一步**不经过 GitHub API**，URL 形状是确定的；草稿/不存在的资产镜像处
自然 404），某个前缀非 200（404/429/5xx/网络错误）就试下一个，全部失败
回退原有 GitHub API 路径——镜像只是加速器，不是权威源。响应头与直连路径
一致（`immutable`、7 天边缘缓存），`X-Proxied-From` 报告实际走了哪条路。
**ESA 上只配一个前缀**：单次调用 ≤4 个子请求，一个镜像的最坏回退链恰好
贴线，两个镜像会在最深回退路径超限（退化为 502，不会死循环）；EdgeOne 无
此顾虑。

公共镜像实测（2026-10，联通家宽；**平台节点出口需部署后重测**）：
`gh-proxy.com`、`ghfast.top`、`ghproxy.net`、`gh.llkk.cc` 可用（吞吐
40–120 KB/s，其中 gh-proxy.com 还支持 `api.github.com` 透传，列表端点将来
也可走它）；`gh.ddlc.top` 429、`ghps.cc` 403、`github.moeyy.xyz` /
`hub.gitmirror.com` 不可达。公共镜像是共享的免费设施，限速和换域名都随时
发生——生产上更稳的做法是自托管 `hunshcn/gh-proxy`（部署在自己的服务器上，
把变量指过去），env 变量让换镜像只是改一个值。

```sh
curl -sI "https://whu-homepage-edgeone.tsinbei.cn/api/releases/download/v1.1.0%2B16/scoop-luotopia.json" | grep -iE "HTTP/|x-proxied-from"
# 期望 200；X-Proxied-From: gh-proxy.com（配了镜像）或 github-releases（回退/未配）
# 首拉慢属预期（回源），同一路径第二次应命中边缘缓存显著变快
```

**`_middleware.ts` 仍是 Cloudflare 专属，这是刻意的**：它的主机规范化会把
镜像域名自己 302 回主站（镜像就不成立了），语言协商 / 深链重写 / 本地化 404
需要 `env.ASSETS` 绑定且属于主站职责。镜像上的页面行为由 `MIRROR_ASSETS_ONLY`
存根决定，未命中路径由根 `404.html`（EdgeOne）或函数的纯文本 404（ESA）应答。

**App Store Connect 401 排查**：Apple 对所有令牌缺陷（kid 过期、issuer 含
不可见字符、运行时时钟漂移、ECDSA 签名编码不合规）回同一条通用 401，控制台
里的值又看不出差别。`/api/appstore/latest` 的失败响应因此带一个 `debug`
字段：`kid`/`kidLen`、`issHead`/`issLen`、`keyLen`/`keySha8`（归一化密钥体
的截断 SHA-256）、`sigBytes`（≠64 说明该运行时的 ECDSA 输出是 DER——签名
代码已自动转换，这里是双保险）、`now`（对比真实时间查时钟）。全部是公开或
单向信息，可以放心 curl。跨平台对比同一凭证的指纹即可定位差异（ESA 上可用
`?connect=1&bundleId=com.does.not.exist` 强制走失败路径拿基线）。

平台产物的离线冒烟：`npm run build && npm run smoke:platforms`——
`tools/smoke-platform-bundles.mjs` 用净化环境重打产物，再以各平台入口约定
（ESA `default.fetch`、EdgeOne `onRequest(context)`）驱动，fetch 全部打桩，
验证无配置 fail-closed、各端点主路径、守卫分支（400/404/405）以及两种配置门
到达同一行为。

部署后验证：

```sh
curl -s https://whu-homepage-edgeone.tsinbei.cn/ | head -c 300
# 期望跳转存根：canonical/meta refresh 指向 https://www.whu.sb/
curl -sI https://whu-homepage-edgeone.tsinbei.cn/hot-update/manifest.json | head -1
# 期望 200（文件正常分发）
curl -s https://whu-homepage-edgeone.tsinbei.cn/api/status | head -c 200
# 期望 200 快照 JSON；若 503 not_configured，查运行时环境变量
curl -sI https://whu-homepage-edgeone.tsinbei.cn/typo-page | head -1
# 期望 404（未命中不跳转，由 404.html 应答）
```

两条对镜像域名的硬性要求（App 端以 `AppConfig.kSiteStaticMirrors` 登记，
TLS 走 `*.tsinbei.cn` 的 pinned 信任区）：

- **证书必须覆盖镜像主机名**：`*.tsinbei.cn` 通配符或包含该主机的 SAN。
  平台托管证书若只签给旧主机名（改名后未重签），pinned 客户端会以
  hostname mismatch 拒连——`whu-timetable-esa` 改名后就踩过这一点。
- **静态路径必须真实应答**：源站回源未生效时全路径 404，镜像等于不存在；
  App 侧只会静默跳过（回退下一候选），不会报错，所以部署后要用上面的
  curl 实测，不能只看控制台状态。

## 部署后检查

```sh
curl -sI https://www.whu.sb/ | head -1                          # 200
curl -i  https://www.whu.sb/definitely-not-a-page | head -1     # 404
curl -s  https://www.whu.sb/api/releases/latest | head -c 200   # Release JSON
curl -sI https://www.whu.sb/api/status | grep -i x-status-source
curl -sI https://luotopia.whu.sb/.well-known/assetlinks.json    # 200，无重定向
```

语言协商：

```sh
# 首访识别：应 302 到 /en/
curl -sI -H 'accept: text/html' -H 'accept-language: en' https://www.whu.sb/ | grep -i '^location'

# 每条路由都有译文，所以这里期望 302 到 /en/status（而不是 Pages 的 308）
curl -sI -H 'accept: text/html' -H 'accept-language: en' https://www.whu.sb/status | grep -i '^location'

# 404 应按访客语言返回，状态码仍是 404
curl -s -H 'accept: text/html' -H 'accept-language: ja' https://www.whu.sb/nope-not-a-page \
  | grep -o '<html lang="[^"]*"'
curl -sI -H 'accept: text/html' -H 'accept-language: ja' https://www.whu.sb/nope-not-a-page | head -1

# 深链域名的落地页应跟随语言，且不是重定向（地址栏要留在原 URL）
curl -s -H 'accept: text/html' -H 'accept-language: en' https://luotopia.whu.sb/anything | grep -o '<html lang="[^"]*"'
curl -s -H 'accept: text/html' 'https://luotopia.whu.sb/anything?lang=fr' | grep -o '<html lang="[^"]*"'

# App 契约：这三个必须与语言协商无关，永远 200 且内容不变
curl -sI https://www.whu.sb/legal/terms.md | head -1
curl -s  https://www.whu.sb/data/legal.json | head -c 80
curl -s  https://www.whu.sb/data/friend-links.json | head -c 80

# 显式选择：应 302 到 /en/ 并带 Set-Cookie: luotopia_lang=en
curl -sI 'https://www.whu.sb/?lang=en' | grep -i '^location\|^set-cookie'

# 记过选择之后不再自动跳转：应 200
curl -sI -H 'accept: text/html' -H 'accept-language: en' \
     -H 'cookie: luotopia_lang=zh-Hans' https://www.whu.sb/ | head -1

# 非文档请求不受影响（含 prefetch）：应 200
curl -sI -H 'accept: */*' -H 'accept-language: en' https://www.whu.sb/ | head -1

# 文档站：应 200，且与语言协商无关（英文 Accept-Language 也不加前缀）
curl -sI https://www.whu.sb/docs/ | head -1
curl -sI -H 'accept: text/html' -H 'accept-language: en' https://www.whu.sb/docs/server/ | head -1
# 站内旧 URL：应重定向到规范地址（静态输出为 meta-refresh 页，目标带 /docs 前缀）
curl -s https://www.whu.sb/docs/server/cli_reference | grep -o 'url=[^"]*'

# docs.whu.sb 绑定到 Pages 之后：一跳 301 直达最终地址（含历史 URL 解析）
curl -sI https://docs.whu.sb/server/cli_reference | grep -i '^location'   # -> www.whu.sb/docs/server/cli-reference
curl -sI https://docs.whu.sb/user/ | grep -i '^location'                  # -> www.whu.sb/docs/user
```

`/api/status` 的 `X-Status-Source` 会是 `api`（回源）、`cache`（命中缓存）或
`throttled`（`?fresh=1` 撞上下限）。第一次部署后如果是 503 `not_configured`，
说明 `UPTIMEROBOT_API_KEY` 没配上。
