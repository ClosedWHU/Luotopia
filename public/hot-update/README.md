# hot-update 静态资源

本目录存放 App 的热更新静态资源，随官网构建发布到 `/hot-update/*` 路径。App 的 `hot_update` 模块从这里拉取清单与解析脚本，用于在不发版的情况下更新校园接口的解析逻辑。

## 目录内容

```text
hot-update/
├── manifest.json    # 带 Ed25519 签名的清单（生成物，勿手改）——发布到 R2，不入 git
├── scripts/         # 解析脚本，每个解析器一个 .js 文件——提交到 git，静态发布
└── assets/          # 数据资产，每个资产一个 .json.gz 文件
    ├── model-metadata-catalog.json.gz       # 每日自动重建——发布到 R2，不入 git
    ├── campus-news-sources.json.gz          # 手动——提交到 git，静态发布
    └── water-electric-fee-room-directory.json.gz  # 手动——提交到 git，静态发布
```

**两类文件，两种发布路径。** 解析脚本与手动数据资产照旧提交到 git、随官网构建静态发布。而 `manifest.json` 与 `model-metadata-catalog.json.gz` 不再入 git：目录是一份 ~137 KB 的 gzip，几乎无法 delta 压缩，且上游模型列表天天在动，过去等于每天往仓库塞一个 blob + 一条 bot commit。二者现在发布到 R2（桶 `whu-sb-bucket`，key 前缀 `hot-update/`），在 Cloudflare 由 [functions/hot-update/[[path]].ts](../../functions/hot-update/%5B%5Bpath%5D%5D.ts) 通过 `HOT_UPDATE_R2` binding 读取，在 EdgeOne / ESA 镜像由 [functions/lib/hot-update-origin.ts](../../functions/lib/hot-update-origin.ts) 从源站 `www.whu.sb` 代理并边缘缓存（与 gstatic 字体代理同构）。URL 路径不变，App 端无需改动。

`manifest.json` 由 [tools/generate-hot-update-manifest.mjs](../../tools/generate-hot-update-manifest.mjs) 生成并签名，唯一写入方是两个工作流：[sync-model-metadata.yml](../../.github/workflows/sync-model-metadata.yml)（每日重建目录后发布）与 [publish-hot-update.yml](../../.github/workflows/publish-hot-update.yml)（脚本或手动资产变更后重签发布）。手工编辑无效，签名失效的清单会被客户端整体丢弃。

[public/_headers](../_headers) 对 `/hot-update/*` 设置 `Cache-Control: no-cache`；R2 支撑的两个文件由函数各自带上 `no-cache` + ETag，客户端每次检查都重新验证，不会命中过期缓存。

## 工作机制

1. 客户端拉取 `manifest.json`。
2. 客户端用内置公钥验证清单的 Ed25519 签名。签名无效或缺失时，整份清单被丢弃。
3. 客户端按清单中的 `checksum` 下载新增或有更新的脚本。
4. 客户端在 QuickJS 沙箱中运行每个脚本自带的测试向量（`testInput` / `testExpect`）。运行失败或输出不符的脚本不会启用。
5. 通过验证的脚本写入本地缓存，业务模块按 `name` 调用。
6. 清单里的数据资产（`assets`）不走沙箱：客户端按 `checksum` 下载 `.json.gz`，校验 sha256 后原子落盘，读取时再次校验。资产不会在任何引擎里执行，完整性由清单签名加每文件 sha256 保证。

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

`assets` 数组每项（可选字段，没有数据资产时整个数组不出现在清单里；旧客户端验签时对整个 payload 做规范化 JSON，因此新增该字段不影响其签名校验，它们只是忽略它）：

| 字段 | 说明 |
|---|---|
| `name` | 资产名，与文件名一致（去掉 `.json.gz` 后缀），客户端按它找到对应的加载器 |
| `label` | 中文名称 |
| `version` | 资产版本，内容（checksum）变化时自动递增 |
| `url` | 下载路径，形如 `/hot-update/assets/model-metadata-catalog.json.gz` |
| `checksum` | 资产文件摘要，形如 `sha256:<hex>` |
| `minAppVersion` | 能加载该资产的最低 App 版本，必须是包含对应加载代码的首个发行版，否则旧客户端会白白下载用不上的文件 |

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
3. 只提交脚本（和生成器的改动）——**不要**提交 `manifest.json`，它在 R2 里。合并到 `main` 后 [publish-hot-update.yml](../../.github/workflows/publish-hot-update.yml) 会自动重签清单并发布到 R2；`prebuild` 的 `hot-update:verify-scripts` 会在构建时先跑一遍全部测试向量。
4. 脚本经 Pages / 镜像构建静态发布，清单经该工作流发布到 R2，两者短暂不一致时客户端按 checksum 拒绝并下次重试（fail-closed，不会误装）。

签名私钥的初始化、CI 配置与预览环境的未签名构建规则，见 [docs/development.md](../../docs/development.md) 的「热更新清单」一节与 [docs/deployment.md](../../docs/deployment.md)。

## 更新数据资产

数据资产用于把更新频率高于发版的打包数据移出安装包：客户端优先读热更缓存，缓存缺失或损坏时回退到包内资产。当前发布三个：

| 资产 | 更新方式 |
|---|---|
| `model-metadata-catalog`（AI 模型元数据目录） | **自动 · 发布到 R2（不入 git）**：[.github/workflows/sync-model-metadata.yml](../../.github/workflows/sync-model-metadata.yml) 每天用 [tools/sync-model-metadata.mjs](../../tools/sync-model-metadata.mjs) 从 models.dev、OpenRouter 与 Vercel AI Gateway 重建，只有模型数据真的变了才会重写 `.json.gz`，随后重签清单并 `wrangler r2 object put` 回 R2——安静日重传同样字节、不递增版本、不产生任何 git 提交。App 仓库的包内快照（`tool/model_metadata_sync.dart`）直接下载 `www.whu.sb` 上这个路径（现由 R2 支撑） |
| `campus-news-sources`（校园新闻订阅目录） | **手动**：App 仓库 `tool/news/import_catalog.py` 重建目录后，把 `app/assets/data/campus_news_sources.json.gz` 拷贝到本目录（文件名换成 kebab-case），再走下面的发布步骤。源站改版导致选择器失效时不必等发版 |
| `water-electric-fee-room-directory`（水电费房间目录） | **手动**：同上，拷贝 `app/assets/data/water_electric_fee_room_directory.json.gz`。新宿舍交付、房间编号变化时更新 |
| `campus-field-maps`（校园接口字段映射表） | **仅事故时发布**：平时不存在这个文件，客户端用编译进包的候选字段名。某个校园/厂商接口改了字段名时，按 `{"schemaVersion":1,"features":{"<feature>":{"<model>.<field>":["新名","旧名"]}}}` 写一份 `.json.gz` 放到本目录，走下面的发布步骤，几分钟内覆盖全部已安装 App。路径名与 Dart 侧 `fields.keys(...)` 的第一个参数一致（如 `waterElectricFee` 的 `dayUsage.startReading`）。只能改字段名候选，改不了结构；结构性变化要写解析脚本 |
| `water-control-endpoints`（水控接口配方） | **仅事故时发布**：平时不存在，客户端用编译进包的 `WaterControlEndpoints.defaults`。水控接口改了路径、加密载荷的键、查询参数或取 ticket 的交易码时发布，格式见 `water_control_endpoints.dart` 的 `parseWaterControlEndpoints`。配方只能描述请求形状：host 钉死在客户端，AES 密钥与算法在 `WaterControlCrypto` 里，配方没有任何字段能碰到它们；路径必须是以 `/` 开头的相对路径，占位符只认 `$token` 与 `$classNo`，不认识的写法整份丢弃并回落默认值 |

手动资产的发布步骤（手动资产**仍提交到 git**，只有清单发布到 R2）：

1. 把 `.json.gz` 放进 `assets/` 并提交到 git（它会随构建静态发布到源站与镜像）。
2. 合并到 `main` 后，[publish-hot-update.yml](../../.github/workflows/publish-hot-update.yml) 自动触发：从 R2 取回当前目录与清单 → `hot-update:generate`（重算 checksum、按需递增 version、重签）→ `hot-update:verify` → 把新清单 `put` 回 R2。无需手动操作。
3. 需要本地手动发布时：先从 R2 取回 `manifest.json` 与 `model-metadata-catalog.json.gz` 到本目录（`wrangler r2 object get … --remote`），再 `npm run hot-update:generate && npm run hot-update:verify`（需要签名私钥），最后把 `manifest.json` `put` 回 R2。

`hot-update:verify` 会校验每个清单资产的 checksum 与磁盘文件一致——因此运行前 `assets/` 里必须同时有手动资产（git）与目录（从 R2 取回）。

新增其它资产时，在生成器的 `assetMinAppVersions`（必要）与 `assetLabels` 中登记资产名，且客户端还需要有按 `name` 读取它的加载代码，`minAppVersion` 必须指向包含该代码的首个发行版。

> [!CAUTION]
> 签名私钥（`HOT_UPDATE_ED25519_PRIVATE_KEY`）能给全部已安装 App 下发可执行代码。私钥只配置在 Production 环境，不要提交到仓库，也不要配置给 Preview。

## 相关文件

- 生成器：[tools/generate-hot-update-manifest.mjs](../../tools/generate-hot-update-manifest.mjs)
- 缓存头：[public/_headers](../_headers)
- 客户端模块：app 仓库 `lib/features/hot_update/`（跨仓库，不直接链接）
- 用户文档：docs 仓库 `user-docs/settings.md` 的「热更新」一节（跨仓库，不直接链接）
