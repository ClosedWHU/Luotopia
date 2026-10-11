# Store listings

各应用商店的产品一览文案（listing copy），按商店分子目录存放。这些是**发布物料**：
每次向商店提交新版本时从这里复制，商店表单改版或文案迭代时在这里更新，保持单一来源。

```
microsoft-store/   Microsoft Store（Partner Center）10 语言文案 + 填表说明
google-play/       Google Play（Play Console）10 语言文案 + 送审清单
```

之后上架其它商店时新增子目录（如 `apple-app-store/`、`snap-store/`），字段结构按各自
后台表单组织，一个语言一个文件。

各商店的硬限制不同（Microsoft Store：简短描述 ≤270、关键字 ≤7 个且总词数 ≤21、功能
≤20 条；Google Play：名称 ≤30、短描述 ≤80、完整描述 ≤4000），改文案时按目标商店的
README 复核。Play 文案是移动端视角（小组件、手表、通知为一等功能），与 Microsoft
Store 的桌面视角**不是同一份文本的翻译**，更新功能时两边都要过一遍。

## 约定

- **取材来源**：功能描述以 `src/config/features.ts`（官网功能清单）与 app 仓库
  `README.md` 的定位语为准；「开发中」状态的功能**一律不写**，避免商店审核判定
  虚假宣传。文案更新应跟随 features.ts 的变化。
- **合规红线（勿删）**：每份说明必须保留第三方免责声明——本应用是 ClosedWHU 独立
  开发的第三方客户端，非武汉大学官方应用，校园功能需本人账号凭据。校园类客户端
  的商店审核重点核查这一点。
- **语言集合**：与 app `pubspec.yaml` 的 `msix_config.languages` / ARB 语言集保持
  一致（当前 10 种：zh-cn、zh-hant、en-us、ja、ko、es、fr、pt、ru、vi）。
- **硬限制自查**：各商店对简短描述、关键字数量/词数、功能条数都有上限，改动文案后
  重新核对（microsoft-store 当前值见其 README）。
- 版权与开发者署名各语言一致：`© 2026 Hsukqi Lee (ClosedWHU)` / `Hsukqi Lee`。
