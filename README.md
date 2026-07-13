# Luotopia

珞珈托邦 — 武汉大学综合校园服务 App。

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

## 部署

### Cloudflare Pages

1. 在 Cloudflare Dashboard 中创建 Pages 项目，连接本 GitHub 仓库
2. 构建配置：
   - **框架预设**: Astro
   - **构建命令**: `npm run build`
   - **构建输出目录**: `dist`
3. 可选：添加环境变量 `PUBLIC_SITE_URL` 为你的自定义域名
4. 部署后可在 Pages 设置中绑定自定义域名

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

## 许可证

[MIT](LICENSE)
