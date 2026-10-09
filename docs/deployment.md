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

| 变量 | 必需 | 说明 |
|------|------|------|
| `HOT_UPDATE_ED25519_PRIVATE_KEY` | 是 | base64 的 PKCS#8 Ed25519 私钥，`npm run hot-update:init-key` 生成。**只配 Production** |
| `HOT_UPDATE_ALLOW_UNSIGNED` | 否 | `1` 时允许无密钥构建（只校验、不签名、不写清单）。**只配 Preview**，见 [PR 预览构建](#pr-预览构建) |
| `HOT_UPDATE_PRODUCTION_BRANCH` | 否 | 生产分支名，默认 `main`。用于拒绝在生产分支上未签名构建 |
| `UPTIMEROBOT_API_KEY` | `/status` 需要 | Read-Only key 即可 |
| `GITHUB_TOKEN` | 否 | 提高 `/api/releases*` 的 GitHub API 限额 |
| `REPO` | 否 | 默认 `ClosedWHU/Luotopia` |
| `APPSTORE_CONNECT` | 否 | `1` 时启用 App Store Connect（TestFlight 构建号） |
| `APPSTORE_CONNECT_KEY_ID` / `_ISSUER_ID` / `_PRIVATE_KEY` | 启用时需要 | PEM 用字面 `\n` 换行 |
| `APPSTORE_BUNDLE_ID` / `APPSTORE_COUNTRY` | 否 | 默认 `sb.whu.luotopia` / `cn` |
| `UPTIMEROBOT_API_URL` | 否 | 默认 `https://api.uptimerobot.com/v2/` |
| `STATUS_COUNT_DAYS` | 否 | 历史天数，默认 90，上限 180 |
| `STATUS_SHOW_LINKS` | 否 | 是否在页面公开探测地址，默认 `1` |
| `STATUS_TIME_ZONE` | 否 | 日界时区，默认 `Asia/Shanghai` |
| `STATUS_CACHE_TTL` | 否 | 快照缓存秒数，默认 300 |

`APPSTORE_CONNECT` 未启用时，`/api/appstore/latest` 会退回公开的 iTunes Lookup
（不需要 JWT）。

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

`functions/_middleware.ts` 只保留平台做不到的那一半 —— **按客户端选择 404 的表示
形式**：浏览器拿到完整的 `dist/404.html`，`curl` / `wget` / 各类 HTTP 库拿到一行
`text/plain`（`404 Not Found: /path` + 站点首页），避免 34 KB 的文档刷满终端。判定
依据 `Accept` 是否显式包含 `text/html`，并用 `Sec-Fetch-Dest` 兜底；Function 自己
返回的 JSON 404（如 `/api/*`）不会被改写。

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

### 深链域名（luotopia.whu.sb）

App 把 `https://luotopia.whu.sb/*` 注册为 Android App Links（autoVerify）与 iOS
Universal Links（applinks），链接与 App 内路由一一对应（GoRouter 按 path 匹配）。
已安装且验证通过时由系统直接唤起 App；否则中间件把该域名上的 HTML 导航重写到
`/open` 落地页（保留原始 URL），由页面脚本映射回 `luotopia://app/<path>` 并提供
「打开 App / 下载」引导。

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

## 部署后检查

```sh
curl -sI https://www.whu.sb/ | head -1                          # 200
curl -i  https://www.whu.sb/definitely-not-a-page | head -1     # 404
curl -s  https://www.whu.sb/api/releases/latest | head -c 200   # Release JSON
curl -sI https://www.whu.sb/api/status | grep -i x-status-source
curl -sI https://luotopia.whu.sb/.well-known/assetlinks.json    # 200，无重定向
```

`/api/status` 的 `X-Status-Source` 会是 `api`（回源）、`cache`（命中缓存）或
`throttled`（`?fresh=1` 撞上下限）。第一次部署后如果是 503 `not_configured`，
说明 `UPTIMEROBOT_API_KEY` 没配上。
