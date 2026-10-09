# hot-update 静态资源

本目录存放 App 的热更新静态资源，随官网构建发布到 `/hot-update/*` 路径。App 的 `hot_update` 模块从这里拉取清单与解析脚本，用于在不发版的情况下更新校园接口的解析逻辑。

## 目录内容

```text
hot-update/
├── manifest.json    # 带 Ed25519 签名的脚本清单（生成物，勿手改）
└── scripts/         # 解析脚本，每个解析器一个 .js 文件
```

`manifest.json` 由 [tools/generate-hot-update-manifest.mjs](../../tools/generate-hot-update-manifest.mjs) 生成。手工编辑会在下次构建时被覆盖，签名失效的清单也会被客户端整体丢弃。

[public/_headers](../_headers) 对 `/hot-update/*` 设置 `Cache-Control: no-cache`，客户端每次检查都会向源站重新验证，不会命中过期的 CDN 缓存。

## 工作机制

1. 客户端拉取 `manifest.json`。
2. 客户端用内置公钥验证清单的 Ed25519 签名。签名无效或缺失时，整份清单被丢弃。
3. 客户端按清单中的 `checksum` 下载新增或有更新的脚本。
4. 客户端在 QuickJS 沙箱中运行每个脚本自带的测试向量（`testInput` / `testExpect`）。运行失败或输出不符的脚本不会启用。
5. 通过验证的脚本写入本地缓存，业务模块按 `name` 调用。

App 内的用户入口是「设置 → 热更新」，下拉即可检查并下载。

## manifest.json 字段

顶层字段：

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 清单结构版本，当前为 1 |
| `version` | 清单版本，内容变化时由生成器自动递增 |
| `updatedAt` | 最近一次内容变更时间（ISO 8601） |
| `expiresAt` | 过期时间，为生成时间加 180 天 |
| `keyId` | 签名密钥标识，当前为 `luotopia-hot-update-2026-01` |
| `signature` | 对以上字段规范化 JSON 后的 Ed25519 签名 |

`scripts` 数组每项：

| 字段 | 说明 |
|---|---|
| `name` | 脚本名，与文件名一致（去掉 `.js` 后缀） |
| `label` | 中文名称，客户端界面显示 |
| `version` | 脚本版本，内容（checksum）变化时自动递增 |
| `url` | 下载路径，形如 `/hot-update/scripts/course-parser.js` |
| `checksum` | 脚本文件摘要，形如 `sha256:<hex>` |
| `minAppVersion` | 兼容的最低 App 版本 |
| `apiVersion` | 脚本接口版本，当前为 1 |
| `testInput` / `testExpect` | 测试向量，构建时与客户端各运行一次 |

## 脚本编写约定

文件名使用 `kebab-case`，以 `-parser.js` 结尾。每个脚本定义唯一的入口函数 `parse`，输入与输出都是 JSON 字符串：

```js
// Parses empty-classroom availability data into a normalized room list.
function parse(rawJson) {
  var data = JSON.parse(rawJson);
  // …解析逻辑…
  return JSON.stringify({ rooms: rooms });
}
```

脚本在受限沙箱中运行，遵守以下约束：

- 可用全局对象仅限 `JSON`、`Math`、`Number`、`String`、`Object`、`Array`、`RegExp`、`parseInt`、`parseFloat`、`isFinite`、`isNaN`。构建时的测试向量校验就运行在只注入这些全局的环境里。
- 客户端执行引擎是 QuickJS。没有网络、DOM、文件等宿主能力，也没有 `Date` 可用。
- 现有脚本统一使用 ES5 风格（`var`、`function`，不用箭头函数与模板字符串）。新脚本保持同样写法，避免依赖较新的语法。
- 相同输入必须产生确定性的输出，否则无法通过构建时与客户端的测试向量。
- 输出结构自定，由调用方与脚本约定；建议带 `schemaVersion` 字段，便于后续演进。

## 新增或修改解析器

1. 在 `scripts/` 下新建或修改脚本，实现 `parse(rawJson)`。
2. 在 [generate-hot-update-manifest.mjs](../../tools/generate-hot-update-manifest.mjs) 的 `tests` 中登记测试向量，在 `labels` 中登记中文名。缺测试向量的脚本会让生成直接失败。
3. 本地运行 `npm run hot-update:generate`（需要签名私钥），确认 `manifest.json` 更新。
4. 将脚本与 `manifest.json` 一并提交。构建时的 `prebuild` 钩子会再次生成并校验。

签名私钥的初始化、CI 配置与预览环境的未签名构建规则，见 [docs/development.md](../../docs/development.md) 的「热更新清单」一节与 [docs/deployment.md](../../docs/deployment.md)。

> [!CAUTION]
> 签名私钥（`HOT_UPDATE_ED25519_PRIVATE_KEY`）能给全部已安装 App 下发可执行代码。私钥只配置在 Production 环境，不要提交到仓库，也不要配置给 Preview。

## 相关文件

- 生成器：[tools/generate-hot-update-manifest.mjs](../../tools/generate-hot-update-manifest.mjs)
- 缓存头：[public/_headers](../_headers)
- 客户端模块：app 仓库 `lib/features/hot_update/`（跨仓库，不直接链接）
- 用户文档：docs 仓库 `user-docs/settings.md` 的「热更新」一节（跨仓库，不直接链接）
