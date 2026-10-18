# tests/ 目录说明

回归测试套件（vitest）。本文只钉两件事：**测试世界使用策略**（IIIII259 起）与
档案库工具链入口。探针/puppeteer 纪律见 `../docs/methodology/probe-guide.md`。

## 测试世界使用策略（IIIII259，必须遵守）

**原则：测试世界=档案库优先；`generateWorld` 是例外，须写明理由。**
全量套件 288min 的慢文件几乎全是「整世界生成（~2.5min/次）+ 毫秒级静态断言」；
对固定种子世界的内容断言，载入同一世界的存档（游戏读档路径，秒级）= 同一断言语义。

### 允许 `generateWorld` 的两类场景（仅此两类）

1. **测试主题=世界生成本身**：断言面含生成过程中间态或生成过程性质——
   `caves-checkpoint`（逐 pass 哈希链）、`_freeze-caves`/`_dgidump`（链冻结基线/dump）、
   `world-final-hash`（生成终态哈希）、`worldgen-ui-easter-eggs` 的 g 链守恒用例
   （「同种子两次生成逐位全等」——载档案即失去命题）、`drunk-world-gen`
   （DRUNK 种子生成内容回归）、`gen-loot-passes`/`_fullgen-smoke` 等生成活性 tripwire。
2. **确需不同种子世界且无档案可复用**：新探针场景在既有档案里找不到合适世界时——
   但用完即弃的临时世界**不得**沉淀为常驻生成的测试（先加档案再写断言）。

### 档案库用法

```ts
import { loadFixtureWorld, loadFixture } from './world-fixtures';

const world = loadFixtureWorld('small');              // 4200×1200 seed 9293480（~2s）
const { world: w2, fixture } = loadFixture('bj42-a'); // fixture.side.gs 等 Generate 态域
```

- 档案清单与配置：`tests/world-fixture-gen.test.ts` 的 `SPECS` 表（唯一权威）+
  `tests/fixtures/worlds/*.fixture.json`（每档案元数据：cfg/source/notes/六通道指纹/侧车）。
- 档案文件 `*.wld.json.gz` 不入库（.gitignore），本地再产：
  `SW_GEN_WORLD_FIXTURES=1 npx vitest run tests/world-fixture-gen.test.ts -t "<档案名>"`
  （全量 30 档案 ~28min CPU，可 `SW_FIXTURE_GROUP=a|b|c` 三组并行）。
- 链路=游戏自身存档路径：`generateWorld(固定种子)` → `saveWorldOnly`（serializeSave v5）
  → gzip → `loadSave`/`loadSaveData`（与读档页同缝）。**档案世界≡「该世界被读档页
  载入后的活存储」**：落盘前按读档边界同语义 `purgeGhostTiles`（原版 SaveTile 非活格
  不写 type→读档本无幽灵）+空格帧统一到解码口径（0）——生成态与载入态的全部既知
  差异=这两条；六通道（type/flags/wall/liquid/frameX/frameY）fnv1a 指纹全等由生成端
  逐档案自证——「同世界同断言」钉死。

### 语义债与守卫面（改世界生成代码前必读）

- **档案=生成快照，不随生成代码漂移自动重产。** 内容测试锚的是「当时生成的世界」；
  世界生成回归由**必须生成**的套件守卫（上列 1 类）。若生成链有意改数值，受影响的
  内容档案须显式再产（重跑生成端对应 `-t`，指纹变化体现在 `.fixture.json` diff 里）。
- 生成态而不落 `SaveData` 的域由侧车回填：`world.trees`（生成期登记）、
  `world.starterTownNpcs`（SpawnStarterNPCs 产物槽）、`world.seedFlags`（有效旗标集
  ——saveWorldOnly/buildSaveParts 路径现不落此域，见 content-parity CCXXIX ④）、
  `GenState` 域常量（如 `desertHiveHigh/Low`）。新测试若需要其它 GenState 域，在
  `SPECS` 的 `side.gsFields` 声明后由生成端采集。
- pass 活性补偿模式：档案化的 pass 级测试应在文件内加 **canary 用例**——在档案世界
  上以 `new RNG(seed)`（≡槽头 `rng.reseed(seed)`）独立重放被测 pass，与原断言硬等
  （范例：`_iii6-starter-npcs.test.ts` 末用例）。前提=该 pass 不读「pass 时点之后
  才出现的生成态」（如栽树后的地形）。
- 新增档案的准入门槛（防档案库无序膨胀）：固定种子/档位 + 明确复用面（≥2 处调用或
  明确的专项守卫）+ `source`/`notes` 写清来源与用途；通用档位优先用 `small`/`medium`。

## 测试可移植性（C 档，2026-10-18 用户拍板：他人 clone 后 `npm run test` 全绿）

**纪律：tests/tools 禁用户家目录绝对路径与微信 wxid 字面量**（终验 grep 零命中）。
三类外部依赖的统一降级习语——**本机文件在=真跑（零语义变化），clone 侧缺=skip 不红**：

1. **用户取证存档**（原 ~/Downloads/微信收件路径）→ 收编 `tests/fixtures/local/`
  （gz 压缩、git 跟踪；清单见该目录 `README.md`）。存取一律走 `tests/fixturePath.ts`：
  `readLocalFixture(name)` / `readLocalFixtureText(name)` + `it/describe.skipIf(localFixtureMissing(name))`。
2. **仓库外真值面**（反编译树 `Terarria1457/…`、TEdit、CalamityModPublic、`server/`、
  `tools/l10n-custom`、`terraria-assets`——game/ 的兄弟目录，clone 侧缺）→ 消费测试
  文件头 `const EXT_MISSING = !['Terarria1457', …].every((d) => existsSync(new URL(\`../../${d}\`, import.meta.url)))`
  + 顶层 `describe/it.skipIf(EXT_MISSING)`；模块级读加 `existsSync(expr) ? readFileSync(expr, 'utf8') : ''`
  守卫（防收集期红）。era-guard 家族同款（被守卫工具缺树=skip）。
  路径解析可 `SW_PROJECT_ROOT` 覆盖。
3. **`~/GoldenChains/` 本机对拍真值链**（体积/语义不可收编）→ 探针保持 env 门控
  （`SW_*` 缺省 skip），路径一律 `${process.env.HOME ?? ''}/GoldenChains/…` 家目录相对式。
- 测试世界档案 gz 不入 git（.gitignore）→ 消费端 `it/describe.skipIf(fixtureMissing('档案名'))`
  （`tests/world-fixtures.ts`；缺档提示一条 console + 再产指引）。
- 落盘产物/一次性诊断面默认走 env 门控缺省 skip（`_` 前缀探针族既有习语）。
