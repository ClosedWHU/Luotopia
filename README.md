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