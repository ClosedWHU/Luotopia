# scales 静态资源

本目录存放 App 的心理量表库，随官网构建发布到 `/scales/*` 路径。App 的 `scale_library` 模块从这里拉取清单与量表定义文件，缓存到本地，并在下拉刷新时与清单对账。

量表数据从 App 的安装包里搬出来，是为了让「修正一份 MMPI 常模表」或「新增一个量表」不必等一次发版。代价是首次启动需要联网一次；之后整份库都在磁盘上，可以离线打开。

## 目录内容

```text
scales/
├── README.md        # 本文件
├── manifest.json    # 量表清单（生成物，勿手改）
└── data/            # 量表定义，每个量表一个 .json 文件
```

`manifest.json` 由 [tools/generate-scale-manifest.mjs](../../tools/generate-scale-manifest.mjs) 生成。手工编辑会在下次构建时被覆盖。

[public/_headers](../_headers) 对 `/scales/manifest.json` 设置 `Cache-Control: no-cache`，客户端每次刷新都会向源站重新验证，不会命中过期的 CDN 缓存；`/scales/data/*` 是 `max-age=300`，因为数据文件由清单里的 sha256 钉死，短缓存既安全又能省掉重装时的一次往返。

## manifest.json 字段

顶层字段：

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 清单结构版本，当前为 1。客户端遇到不认识的版本会整份丢弃 |
| `version` | 清单版本，`scales` 数组内容变化时由生成器自动递增 |
| `updatedAt` | 最近一次内容变更时间（ISO 8601）。内容没变就不会动 |
| `scales` | 量表条目数组，按 `id` 升序排列 |

`scales` 数组每项：

| 字段 | 说明 |
|---|---|
| `id` | 量表标识，与 `data/` 下的文件名一致（去掉 `.json` 后缀） |
| `label` | 中文名称，取自量表文件自己的 `name` 字段 |
| `abbreviation` | 缩写，取自量表文件自己的 `abbreviation` 字段 |
| `category` | 分类（如 `抑郁`、`人格`、`睡眠`），取自量表文件自己的 `category` 字段，客户端按它给量表列表分组 |
| `itemCount` | 条目数，即量表文件 `items` 数组的长度，用于卡片副标题 |
| `version` | 该量表的版本，内容（checksum）变化时自动递增，新量表从 1 开始 |
| `url` | 下载路径，形如 `/scales/data/phq9.json` |
| `checksum` | 文件摘要，形如 `sha256:<hex>`，对磁盘上的原始字节计算 |
| `bytes` | 文件字节数 |
| `minAppVersion` | 兼容的最低 App 版本，当前为 `1.0.0` |

> [!NOTE]
> **这份清单按设计不签名。** 量表是数据，不是可执行代码：客户端对下载的文件逐个校验 sha256、按防御性方式解析 JSON，从不 `eval` 里面的任何东西，所以「HTTPS + 每文件 sha256」已经是相称的完整性保证。不签名还带来一个实际好处 —— 它不需要任何密钥材料，在本地开发、PR Preview 和生产构建里的生成结果完全一致。相邻的 [hot-update 清单](../hot-update/README.md) 必须签名，因为它下发的是每一台已安装 App 都会执行的解析脚本；也正因为如此，签名私钥刻意只配置在 Production，Preview 环境根本没有它。量表库不受这个限制。

## 工作机制

1. 客户端默认**先读本地缓存**：有可用的缓存就直接构建量表目录，不发网络请求。首次同步成功之后，量表页面可以离线打开。
2. 下拉刷新（或缓存为空）时拉取 `manifest.json`。
3. 清单的 `schemaVersion` 不是客户端认识的版本时，**整份清单被拒绝**，不做部分应用 —— 未来的格式变更不会把缓存更新到一半。
4. 客户端逐项比较本地已缓存的 checksum，**只下载 checksum 变了的条目**。
5. 下载回来的字节先确认能解析成 JSON 对象、且内部 `id` 与清单条目一致（防止运营商劫持返回的 HTML 页面被当成量表存下来），再校验 sha256。**校验不通过就丢弃，保留原有的旧文件。**
6. 通过校验的文件**原子写入**：先写 `.part` 临时文件，再 rename 覆盖正式文件，下载中断不会留下一个被计分器当成有效的半截 JSON。
7. 清单里不再列出的量表会从本地缓存中**剪除**，上游下线的量表不会永远留在设备上。
8. 单个量表下载失败不会拖垮整份库：其余量表照常可用，失败的 `id` 作为「缺失」上报给界面。
9. 缓存超过 7 天会被标记为陈旧，界面据此提示刷新，而不是默默端出一个月前的常模。

清单本身也有大小上限（256 KB），单个量表文件上限 2 MB —— 生成器的硬上限是 4 MB，比客户端宽松，所以**真正的约束是客户端的 2 MB**。目前最大的 `mmpi2.json` 约 261 KB，余量充足。

## 版权与许可

这一节是本目录最重要的内容，请完整读完再决定如何使用这些文件。

### 一般量表

多数量表（PHQ-9、GAD-7、PHQ-15、AUDIT、WHO-5、K10、CORE-10、WEMWBS、SDS/SAS、EPQ-R、BFI-2 等）的条目属于学术界公开发表的自评工具，本仓库中的中英文文本为自行整理／翻译。

**每个量表 JSON 内的 `license` 字段记录了该量表逐个的来源与使用限制，请以该字段为准。** 本 README 只做汇总，不替代逐文件的说明；两者不一致时以 `license` 字段为准。

### MMPI / MMPI-2 单独说明

MMPI 与 MMPI-2 与其他量表不同，它是**在版权保护下商业发行**的工具：

- 量表本身的版权与发行权归 **University of Minnesota Press**（明尼苏达大学出版社）所有，商业发行由 **Pearson** 临床评估部门负责。
- 本仓库 `mmpi2.json` / `mmpi2_short.json` 的**英文条目**源自 Kevin Timmerman 于 2008 年以 **GNU GPL v3.0** 许可发布的 MMPI-2 实现。
- **中文译文与计分数据**整理自开源项目 **MMPI-CHN**（https://github.com/MMPI-CHN/MMPI-CHN.github.io），**并非官方《MMPI-2 中文简体字版》**。
- **中国常模参数**取自：Cheung, F. M., Song, W. Z., & Zhang, J. X. (1996). *The Chinese MMPI-2*. In J. N. Butcher (Ed.), *International Adaptations of the MMPI-2* (pp. 137–161)，表 6-3。

### GPLv3 提示

由于这两个 MMPI 数据文件的上游以 GPLv3 发布，**若你的分发方式要求闭源，请在集成前自行评估这两个文件的许可影响。** GPL 对纯数据文件是否适用、以及适用到什么程度，在法律上存在争议；但上游仓库明确以 GPLv3 发布，本仓库选择如实标注而不是替你做判断。如果你不能接受 GPLv3 的传染性，最简单的做法是不分发 `mmpi2.json` 与 `mmpi2_short.json` —— 清单是按 `data/` 目录内容生成的，删掉这两个文件即可，其余 33 个量表不受影响。

### 边界（务必知悉）

- 本版本的中文译文由本项目自行整理，**与正版《MMPI-2 中文简体字版》不同，题目等价性未经验证**。
- 中国常模建立于 1990 年代（对标 1990 年人口普查），且**完整原始分分布未公开**。本项目采用双参数近似换算 `T_中国 = 50 + (T_美国 − M_T) × 10 / S_T`，只校正位置与离散度，**不是官方的中国一致性 T 分**。
- 全部量表仅供**自我了解**与**与专业人士讨论**之用，**不能作为诊断依据**。任何结果都不构成医学诊断，也不能替代执业人员的评估。

### 如果你是版权方，希望移除某个量表

请在仓库提 issue，或直接联系维护者，说明你主张权利的量表与依据。我们会：

1. 从 `data/` 中删除对应文件；
2. 运行 `npm run scales:generate` 重新生成清单 —— 该量表从 `scales` 数组中消失，清单 `version` 递增；
3. 发布后，客户端在下一次同步时通过剪除机制（上文第 7 步）**自动清除本地缓存中的该文件**。

也就是说，移除不需要发版，也不需要用户手动操作。

## 新增或修改量表

1. 在 `data/` 下新建或修改 `<id>.json`。**文件名必须等于文件内部的 `id` 字段**（不含 `.json` 后缀）—— 不一致时生成器直接失败，客户端也会拒收下载的文件。
2. 本地运行 `npm run scales:generate`，确认 `manifest.json` 更新（新量表 `version` 为 1，清单顶层 `version` 递增）。
3. 将数据文件与 `manifest.json` **一并提交**。构建时的 `prebuild` 钩子会再次生成；CI 里可以用 `npm run scales:check` 校验已提交的清单是不是最新的。

生成器会在以下情况**直接失败**：文件不是合法 JSON、内部 `id` 与文件名不符、缺少 `name`、`abbreviation` 或 `category`、`items` 缺失／不是数组／为空、任一条目缺少正整数 `index`、文件超过 4 MB、或者生成的清单为空。

### 重新生成两个 MMPI 文件

`data/mmpi2.json` 与 `data/mmpi2_short.json` 不是手写的，由 [tools/build-mmpi2-scale.cjs](../../tools/build-mmpi2-scale.cjs) 从 MMPI-CHN 参考仓库的数据生成：

1. 在本机克隆参考仓库（任意位置）：`git clone https://github.com/MMPI-CHN/MMPI-CHN.github.io <dir>`。
2. 运行生成器，用 `--ref` 指向克隆目录（也可以设置环境变量 `MMPI_CHN_DIR`）：
   - 完整卷：`npm run scales:mmpi2 -- --ref <dir>`（等价于 `node tools/build-mmpi2-scale.cjs --ref <dir>`）
   - 短卷：`npm run scales:mmpi2:short -- --ref <dir>`（等价于加 `--short 370`）
3. 运行 `npm run scales:generate` 刷新 `manifest.json`。
4. 将数据文件与 `manifest.json` **一并提交**。

脚本是**确定性的**（同一份输入永远产出字节级相同的输出），并且**自校验**：生成后会运行完整的断言套件（完整卷 149 条 / 短卷 112 条，逐条与参考实现 `my_script.js` 的计分算法对拍），任何一条失败都会以非零退出码结束；详细报告默认写到系统临时目录，不会落进 `public/`。

参考仓库**没有**、也**不会**被 vendor 进本仓库 —— 它有自己的许可条款，克隆只存在于生成者的本机。因此该脚本刻意**不在 `prebuild` 里**：它是一次手动的、有文档的步骤，普通构建与 CI 不需要这个克隆。

### 客户端对量表 JSON 的期望

客户端（app 仓库 `lib/features/mental_health/domain/models/scale_definition.dart`）按以下约定解析，字段名不要改动：

- **双语字段**：`name` / `nameEn`、`instructions` / `instructionsEn`、条目的 `text` / `textEn`、选项的 `label` / `labelEn`。英文字段用于让使用者把有歧义的译文与原文对照。
- **`scoring.kind`** 取值：`sum`（条目分值求和）、`sumTimesK`（求和后乘 `multiplier`，如 SDS/SAS 的标准分 = 粗分 × 1.25）、`mean`（求和后除以计分项数，如 SCL-90 的因子均分）、`tScore`（`50 + 10 × (sum − normMean) / normSd`，如 BFI-2 的维度 T 分）。
- **`scoring` 其他字段**：`decimals`、`hasTotal`、`multiplier`、`totalLabel`、`totalBands`、`factors`、`screenGate`、`summaryFactorId`、`consistency`。`summaryFactorId` 指定哪个因子代表整份量表出现在一行摘要里 —— 像 MMPI-2 这样报告上百个量表、且第一个是效度指标的量表，「取第一个因子」会说谎，所以必须显式指定。
- **`factors` 每项**：`id`、`name`、`itemIndexes`、`falseItemIndexes`、`bands`、`normMean`、`normSd`、`kCorrection`、`normTable`、`cnNorm`、`scoreIsRaw`、`appliesToGender`。
  - `falseItemIndexes` 是**反向计分**的条目：MMPI 对每个量表逐题标注「答是得分」还是「答否得分」，同一道题在两个量表上可能方向相反，所以这个信息不能挂在题目上。
  - `normTable`（`startRaw` + `male` / `female` 两张表，`null` 表示出版方没印出来的原始分）优先于 `normMean` / `normSd` 公式，因为 MMPI 家族的常模是非线性的。查表时四舍五入、超范围端点钳位、表内空洞就近取值。
  - `cnNorm`（`male` / `female` 各含 `meanT` / `sdT`）是在美国查表 T 分之上再做的中国常模仿射换算，见上文「边界」。
  - `kCorrection`（`factorId` + `weight`）是 MMPI 式的 K 校正：在换算 T 分之前，把被引用因子（通常是 K 量表）的原始分乘以权重加进来。
  - `scoreIsRaw` 表示直接报告条目endorsed 计数而不做换算 —— MMPI 的关键条目组没有公开的 T 表，有意义的数字就是「命中了几题」。
  - `appliesToGender`（`male` / `female`）把因子限制到单一常模组。MMPI 的 Mf 量表按性别使用不同的条目键控**和**不同的查表，因此拆成两个因子各自限定性别，计分器会丢掉不适用的那一个，而不是拿错表单给人计分。
- **`consistency`**（应答一致性指标，MMPI 的 VRIN / TRIN）：每项含 `id`、`name`、`baseScore`、`pairs`、`normTable`、`bands`。`pairs` 是紧凑数组 `[itemA, valueA, itemB, valueB, points]`，表示「第 A 题答 valueA **且** 第 B 题答 valueB 则加 points 分」；TRIN 的规则带符号，矛盾的一对会**减**分。这类指标无法用条目求和表达，所以单独建模。仅在完整卷（567 题）计算，短卷缺少部分题对所需的题目，不可计算也不应由短卷推算。
- **条目不能为空**：客户端会拒绝 `items` 为空的文件。
- **`license` 字段**：如上文所述，它是该量表版权信息的权威来源，新增量表时必须填写。
- **文件大小**：控制在 2 MB 以内（客户端 `maxScaleBytes`），生成器的 4 MB 上限只是兜底。

## 相关文件

- 生成器：[tools/generate-scale-manifest.mjs](../../tools/generate-scale-manifest.mjs)
- MMPI 数据生成器：[tools/build-mmpi2-scale.cjs](../../tools/build-mmpi2-scale.cjs)（需要外部克隆，见上文「重新生成两个 MMPI 文件」）
- 缓存头：[public/_headers](../_headers)
- 兄弟机制：[public/hot-update/README.md](../hot-update/README.md)（同为「静态发布 + 客户端拉取缓存」，但那份清单是签名的，因为它下发可执行脚本）
- 客户端模块：app 仓库 `lib/features/mental_health/data/scale_library/`（跨仓库，不直接链接）
