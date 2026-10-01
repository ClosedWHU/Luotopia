# Luotopia
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FClosedWHU%2FLuotopia.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FClosedWHU%2FLuotopia?ref=badge_shield)


珞家 — 武汉大学综合校园服务 App。

[English](README.en.md)

> 本仓库为项目主页源码（Astro 构建），托管于 [ClosedWHU/Luotopia](https://github.com/ClosedWHU/Luotopia)。
> APK 发行版通过 GitHub Releases / Pre-releases 发布，请访问 [Releases](https://github.com/ClosedWHU/Luotopia/releases) 页面下载。

## 项目简介

Luotopia 是一款面向武汉大学师生的综合校园服务应用，提供课表查询、校园资讯、生活服务等功能。

- 主页：[https://www.whu.sb](https://www.whu.sb)

## 本地开发

```bash
npm install
npm run dev        # 启动开发服务器 localhost:4321
npm run build      # 构建到 dist/
npm run preview    # 本地预览构建产物
```

## 热更新脚本

解析器热更新脚本位于 `public/hot-update/scripts/`。应用仅接受已签名的
`public/hot-update/manifest.json`；即使校验和正确，没有有效 Ed25519 签名的清单也会被拒绝。

首次本地开发时初始化签名密钥：

```sh
npm run hot-update:init-key
```

该命令会将私钥写入已被忽略的 `.env.hot-update`，并仅将公钥安装到相邻的 App 工作区。
请勿提交 `.env.hot-update`。

生成并校验清单：

```sh
npm run hot-update:generate
npm run hot-update:verify
```

`npm run build` 会自动生成清单，并在签名密钥不可用时失败。生产环境必须以 secret 的形式提供
`HOT_UPDATE_ED25519_PRIVATE_KEY`，其值为上述命令生成的 base64 编码 PKCS#8 Ed25519 私钥。

## 部署

### Cloudflare Pages

1. 在 Cloudflare Dashboard 中创建 Pages 项目，连接本 GitHub 仓库
2. 构建配置：
   - **框架预设**: Astro
   - **构建命令**: `npm run build`
   - **构建输出目录**: `dist`
3. 可选：添加环境变量 `PUBLIC_SITE_URL` 为你的自定义域名
4. 部署后可在 Pages 设置中绑定自定义域名

### 404 处理

`src/pages/404.astro` 构建为 `dist/404.html`，**这个文件本身就是配置**。

Pages 判断「自定义 404」还是「单页应用」的唯一依据，是产物根目录有没有
`404.html`：有则以 `404` 状态返回该文件；没有则认定为 SPA，把*所有*未命中路径
重写到 `/` 并返回 `200`。本站此前没有 `404.html`，所以 `/typo` 乃至
`/missing.png` 都会返回首页——这不是面板里的某个开关被打开，而是缺文件的默认
推断。

因此：

- Pages 项目**没有** `not_found_handling` 配置项。文档里那段
  `assets.not_found_handling: "404-page"` 属于 **Workers 静态资源**（`assets.directory`
  + `main`），与 Pages 是两套产品。给 Pages 项目加 `wrangler.jsonc` 反而会使其
  成为整个项目配置的 source of truth，面板里配好的环境变量与绑定会被覆盖，风险
  远大于收益。
- 也**不需要**在中间件里维护站点路由表。未命中由平台判定，新增页面不会漏配。

`functions/_middleware.ts` 只保留平台做不到的那一半——**按客户端选择 404 的
表示形式**：浏览器拿到完整的 `dist/404.html`，`curl` / `wget` / 各类 HTTP 库
拿到一行 `text/plain`（`404 Not Found: /path` + 站点首页），避免 34 KB 的文档
刷满终端。判定依据 `Accept` 是否显式包含 `text/html`，并用 `Sec-Fetch-Dest`
兜底；Function 自己返回的 JSON 404（如 `/api/*`）不会被改写。

部署后可这样验证：

```sh
curl -i https://www.whu.sb/definitely-not-a-page   # HTTP/2 404 + text/plain
curl -s https://www.whu.sb/404 | head -c 120       # 404 页面本体
```

### 深链域名（luotopia.whu.sb）

App 将 `https://luotopia.whu.sb/*` 注册为 Android App Links（autoVerify）与
iOS Universal Links（applinks），链接与 App 内路由一一对应（GoRouter 按 path
匹配）。已安装且验证通过时由系统直接唤起 App；否则由
`functions/_middleware.ts` 将该域名上的 HTML 导航重写到 `/open` 落地页
（保留原始 URL），由页面脚本映射回 `luotopia://app/<path>` 并提供
「打开 App / 下载」引导。

维护要点：

- `public/.well-known/assetlinks.json` 中的 `sha256_cert_fingerprints` 必须与
  **实际分发的签名证书**一致（当前包含 release 证书与仓库共享 debug 证书）。
  更换签名密钥后需同步更新，否则 Android 侧验证失效。指纹可用
  `apksigner verify --print-certs app.apk` 查看。
- `public/.well-known/apple-app-site-association` 对应 Team ID `ZW372988NV`，
  经 `public/_headers` 以 `application/json` 提供；该文件必须无重定向直达。
- 需在 Cloudflare Pages 的自定义域名中绑定 `luotopia.whu.sb`（DNS CNAME 指向
  Pages 项目）。域名必须**先于** App 发版上线，两端才会在安装时完成验证。
- 该域名整体被 App 认领，所以扫描器探测、过期二维码等**不认识的路径也会落到
  `/open` 落地页**。`src/config/deeplinkRoutes.ts` 列出 App 路由的顶层段
  （与 `app/lib/app/router/app_route_paths.dart` 的首段一致）；首段不在其中时，
  落地页会额外显示「App 里可能没有这个页面，仍会尝试打开」，但**唤起照常进行**
  ——列表过期不应该拦住一个本来能成功的跳转。只校验首段是有意的：App 有数百个
  嵌套路由且随版本变动，更深的匹配交给客户端自己的错误页。

### Cloudflare Workers (通过 `@astrojs/cloudflare`)

若需 SSR / Workers 部署模式：

```bash
npx astro add cloudflare
```

然后在 `astro.config.mjs` 中配置 `output: 'server'` 与 `adapter: cloudflare()` 模块，之后：

```bash
npm run build
```

将 `dist/` 或 `dist/_worker.js` 部署到 Cloudflare Workers。

### Vercel

1. 在 Vercel 中导入本 GitHub 仓库
2. 框架自动检测为 Astro，无需额外配置
3. 默认 Framework Preset 选择 **Astro**
4. 部署后可在 Vercel 项目设置中绑定自定义域名

### 手动部署（静态）

```bash
npm run build
# 将 dist/ 目录部署到任意静态托管服务（Nginx, GitHub Pages, Netlify 等）
```

## Star History

<a href="https://star-history.tsinbei.com/#ClosedWHU/Luotopia&type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://star-history.tsinbei.com/svg?repos=ClosedWHU/Luotopia&type=date&legend=top-left" />
  </picture>
</a>

## 许可证

[MIT](LICENSE)


## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FClosedWHU%2FLuotopia.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FClosedWHU%2FLuotopia?ref=badge_large)