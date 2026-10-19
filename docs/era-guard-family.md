# era guard 家族处方（正本）

> ★BJ212 2026-09-20 落档（债源：BJ207 登记「BJ191 处方无盘上落档——任务引用的
> BJ191 四要素在 docs/memory 均无档案，按任务括号内规格实现；建议处方落档以便
> 同族后续对锚」）。本文是 era guard 家族的处方正本：后续任何提取器/素材管线
> 落闸，对锚本文；**现状清单逐条亲读盘上工具头部/守卫块核验（2026-09-20），
> 不抄记忆**——工具演化后请随手更新本清单（注明批次）。

## 一、适用对象

一切「读 `Terarria14xx/` 反编译源码 → 产数据 json」的 producer 工具
（`game/tools/extract-*.mjs`）与素材管线（`game/scripts/vanilla-atlas.mjs`、
`scripts/atlas-append-1457.mjs`）。反编译源码是唯一标杆，而 producer 有两类
结构性险面：

1. **洗库险**：producer 全量重写产物、不读现库。当现库已领先于提取器输出面
   （recon 活通道修正 / 手补增量 / 白名单外字段 / 新版本段）时，误重跑 = 增量
   整批回退（vanilla-atlas 全量重跑四连事故同族）。
2. **旧基线险**：源锚钉在旧版本（1456/1405），基准切换（2026-08-23 → 1457）
   后误跑 = 把 1457 终值/新增段洗回旧锚态（itemrare 1456 裸跑洗 6147-6195 案）。

## 二、四要素处方（BJ191 规格正释）

### ① `SW_*` 显式 env 缺省 fail-closed

- 源版本选择面统一 `SW_ITEM_VER`（或同域别名），**缺省即 1457**（拍板#7A，
  2026-09-18 自 itemrare 起翻转；新写 producer 缺省直接 1457）。
- 显式值走**白名单校验**：值不在白名单或对应反编译目录不存在 → `exit 1`
  + 指引（extract-petai 习语：白名单还可语义收窄——1456 锚集已退役时显式
  1456 直接拒并给退役指引，而非放进去让它炸一堆「未找到」）。
- **探测注入面与写盘面分离**是本要素的硬变体（g1 footgun 硬化，红蓝-J1②/
  红蓝-F① 定谳）：`SW_XXX_JSON` 类探测 env 已设置而 `SW_OUT` 缺省 → 拒跑
  `exit 1`。理由：守卫将探测注入夹具（零增量→放行）而写盘落缺省现库路径——
  探测与写盘分离 = 守卫被绕过洗库（write-blocking hook exit 42 物证实证）。

### ② 输出通道三分离

| 通道 | 触发 | 行为 |
|---|---|---|
| 干跑（缺省） | 无 env 无旗 | **零写盘**；打印摘要/对拍结果 |
| 沙箱 | `SW_OUT=<dir>` | 写 `<dir>/<产物名>`（测试与对拍专用） |
| 逃生门 | `--write-real` | 写真实现库路径（确认定谳后才许） |

- **双旗互斥 footgun 拒跑**：`SW_OUT` 与 `--write-real` 同给 → 拒 `exit 1`
  （petai 习语，语义最清晰）；BJ207 合并语义族（npccolors/critters）取
  「SW_OUT 优先」变体（沙箱最安全，提示即走）——两种变体都合格，新落闸
  建议用 petai 的互斥习语。
- **非 1457 禁写真库**：`SW_ITEM_VER≠1457` 时 `--write-real` 拒 `exit 1`
  （旧基线重放只能进沙箱；petai 习语）。
- 产物路径缺省**必须绝对或锚定 ROOT**；相对路径缺省（travelshop/shops 的
  `src/data/...`）是已知 footgun 形态（cwd 敏感），登记在案。

### ③ 锚断言 fail-loud（锚点局部号 + 行窗 + 签名）

- 逐款数值一律「锚点定位 + 正则解析」，锚失配 `throw` 报错退出，**禁止**
  「找不到就吃缺省值」的静默兜底——静默兜底 = 表与源码失配还全绿
  （extract-petai 头注「源码漂移即报错退出」原旨）。
- 锚点要钉三层：**方法签名**（`methodAt` 找不到签名即炸）→ **局部号/锚文本**
  （`anchorAssert`/`firstIn`/专项正则 `.test` 硬校验）→ **行号坐标落盘**
  （`meta.paramLines`/`rec.line` 供守卫测试反查）。
- 反编译器换版会**重排局部号**（1456→1457：AI_026 飞行段 num41..53→num42..54、
  地面段 num181/182→num184/185、num91→num92、num100/101→num101/102、
  num111→num112、num93/94→num94/95；AI_067 num34→num50；ST11/ST90/ST124
  各自重排——BJ183/BJ212 全账）。重锚 = 全部锚点正则重推 + 1458 交叉对拍
  （BJ212 实证 1457↔1458 三方法体逐字节全等）+ 与现库逐值 diff 定谳后才准
  更新数据（**在途金标禁重冻**纪律同源）。

### ④ 判别力自证（守卫自身配变异证明闸有效）

- 守卫测试必须含**变异用例**：摘掉守卫判据 → footgun 必须复现（在注入面/假
  现库上，真现库零接触），证明守卫是唯一拦截面；毒化一处锚 → 必须 exit≠0
  + 锚点名，证明 fail-loud 在位。
- 变异习语（extract-itemrare-era-guard / extract-petai-era-guard 同款）：
  `spawnSync('node', [mutant])` 跑工具副本；mutant = 源码 `String.replace`
  摘判据/重定向真库路径到假现库；假现库种子用**哨兵内容**（种子=工具产物
  本身时 md5 不变无法判写发生——petai 守卫测试 M1 用例踩过并已修正）；
  macOS `/var→/private/var` 符号链接 → 临时目录一律 `realpathSync(tmpdir())`
  （mutant 放 /var 下会因 import.meta.url 与 argv[1] URL 不匹配走偏）。

## 三、守卫三形态（按 producer 语义选型）

| 形态 | 机制 | 适用 | 案例 |
|---|---|---|---|
| A. 动态 diff 闸 | 重产输出 vs 现库**动态 diff**（缺 id 非空即拒+物证，不硬编码 id 清单） | 现库领先于提取器（追加时代）且提取器输出面本应盖住现库 | itemrare（缺键型）/ projectiles（缺 id+值漂移双轴）/ npcs（字段型+id 型，producer 已退役另有旗闸） |
| B. 干跑对拍闸 | 缺省零写盘+对拍（零漂移 exit 0 / 漂移 exit 1+物证）；写盘必须显式通道 | 合并语义/重锚后重产幂等态（bare 重跑=现库逐字节） | npccolors / critters（BJ207）/ petai（BJ212） |
| C. 追加时代旗闸 | 现库含 producer 输出面外增量即拒；`--force-full --overwrite-append-era` 双旗逃生（单旗仍拒） | 全量重写型 producer 且增量可枚举判定 | vanilla-atlas（SW-FX23）/ extract-npcs（债刀-3） |

选型口诀：**重产盖得住现库 → B（干跑对拍）；盖不住 → A 或 C**。A/B 都必须
给活通道指引（recon-* 闸门 / 合并语义提取器），守卫拦的是误触不是工作流。

## 四、现状清单（2026-09-20 亲读核验;★BJ261 2026-09-22 全量普查扩账+时效更新）

### 已落闸（38——★BJ261 普查 17+2;★BJ284 2026-09-22 增 9;★BJ298 2026-09-23 增 12（B 形九件 acc-drawslots/dyes/shimmer/hairdyes/research/bestiary-spawn/bestiary/fishing/itemsorting + 降级面三件补缺省干跑臂 journey-browser/equip-prefix/itemfunc,部分闸 2 件一并清偿）;BJ261 表头旧记 18 系数错已正）

| 工具 | 守卫形态 | 要点 | 守卫测试 |
|---|---|---|---|
| `tools/extract-npcs.mjs` | C+g1 | 1405 退役 producer：现库含 id>586 或白名单外字段即拒；`--force-full --overwrite-append-era` 双旗；SW_NPCS_JSON 探测+SW_OUT 缺省 → 拒（g1） | `tests/extract-npcs-era-guard.test.ts` |
| `tools/extract-itemrare.mjs` | A+g1 | SW_ITEM_VER 缺省 1457（拍板#7A）；重产 vs 现库缺 id 动态 diff（6147-6195/1293 动态捕获）；双旗逃生；`--dump` 对账通道豁免 | `tests/extract-itemrare-era-guard.test.ts` |
| `tools/extract-projectiles.mjs` | A+g1 | SW_PROJ_JSON 探测/SW_OUT 写盘分离拒跑；动态 diff 双轴（1111-1135 段缺 id=1456 源指纹 + 值漂移）；双旗逃生 | `tests/extract-projectiles-era-guard.test.ts` |
| `tools/extract-npccolors.mjs` | B（BJ207） | 缺省干跑对拍零写盘；SW_OUT/--write-real 显式通道（同给 SW_OUT 优先）；SW_NPCS_JSON 探测+--write-real 混用拒 | `tests/extract-npcs-era-guard.test.ts` BJ207 段 |
| `tools/extract-critters.mjs` | B（BJ207） | 同 npccolors 同款守卫块 | 同上 |
| `tools/extract-petai.mjs` | B（BJ212） | SW_ITEM_VER 白名单 {1457,1458}（1456 锚集退役显式拒）；缺省干跑零写盘；双旗互斥；非 1457 禁写真库；锚 fail-loud | `tests/extract-petai-era-guard.test.ts` |
| `tools/extract-bossbags.mjs` | C+动态 diff（BJ215 落闸;★BJ217 编码面恢复;★BJ222 残差收口;★BJ261 fresh-only 轴） | 重产禁令代码化：缺省干跑对拍（袋/spawn/字段/coinMap live-only+fresh-only 双向八轴动态 diff,任一轴非空=洗库预警或现库退化缺键型 exit 1+差异清单——★G-1/S3 处方:原只算 live-only 对现库删 spawn 恒绿）;SW_OUT 沙箱；--write-real 非纯增量拒+差异清单,强推须 `--force-full --overwrite-append-era` 双旗；SW_ITEM_VER 白名单 {1457,1458}（1458 OpenBossBag 方法体与重产 fresh 逐字节全等,BJ215 实证+BJ217 复证）；SW_BOSSBAGS_JSON 探测面+--write-real 混用拒（g1）；锚 fail-loud（签名/BAGS 全命中/coinMap 基数）。★BJ217 恢复:noMaster/remix/noRemix+stackVar lo/hi+stackExpr 分列+sw default=Next(N)-1+dedup2+swPopAt。★BJ222:3329 chance pair 残差数据刀收口（现库=源码位序,守卫转静默+合成毒化保持判别力）。守卫测试含 G-1 变异:现库删 spawn=fresh-only exit 1/摘轴恒绿复现 | `tests/extract-bossbags-era-guard.test.ts` |
| `tools/extract-itemcombat.mjs` | B（BJ215） | 头注「Terarria1456」陈旧注释勘误（BJ205 ⑥盘点块保留）；SW_ITEM_VER 白名单 {1456,1457,1458}（1456=recon 双实例 --dump 通道）；缺省干跑对拍零写盘（缺键型+值漂移双轴 exit 1+物证；BJ215 定谳 bare 1457 重产=现库逐值零漂移 4369 items+978 useSound）；methodBody 锚 fail-loud（原静默返空体反模式已修）；双旗互斥+非 1457 禁写真库 | `tests/extract-itemcombat-era-guard.test.ts` |
| `tools/extract-travelshop.mjs` | B 壳+A 判定（BJ215 落闸;★BJ217 词表恢复=B 全绿;★BJ261 fresh-only 轴+SW_TRAVELSHOP_JSON 探测面） | cwd footgun 修复（缺省 OUT 锚定 import.meta.url,原相对路径从非 game/ 跑=写错位）；缺省干跑对拍（条目键=id/ids+tier——★键含 tier,画作 5121-5124 双档,单 id 键塌缩互撞 BJ215 勘误）；★BJ261 补 fresh-only 轴（重产有而现库无=现库退化缺键型,非空 exit 1——G-1/S3 处方:原只算 live-only 对现库删条恒绿）+SW_TRAVELSHOP_JSON 探测面（g1:与 --write-real 混用拒）；--out 沙箱/--write-real 逃生门；双旗互斥；--write-real 非纯增量拒,强推双旗。★BJ217:TRAVEL_CONDS 整串精匹配表+ids 组条目+基数护栏抬 66/31——重产 vs 现库 66+31 多重集逐值全等（残差:组条目源码位序 57 vs 现库手补末位 65,RNG 消费序=池序,源码序为准,数据刀待修,多重集对拍不受影响）。★BJ217 守卫重设计:--write-real 测试 mutant 假现库重定向 | `tests/extract-shops-era-guard.test.ts` |
| `tools/extract-shops.mjs` | B 壳+A 判定（BJ215 落闸;★BJ217 词表恢复;★BJ222 残差收口;★BJ261 fresh-only 选报轴+SW_SHOPSTOCK_JSON 探测面） | 同 travelshop 同构守卫（values 5334 零漂移）；cwd footgun 修复+锚 fail-loud（SetupShop 签名/基数护栏）。★BJ217 恢复:parseGate 词表二十余 token+取反升级+for/while 循环上架展开+OR 段 DNF 笛卡尔分配+switch 结束行界等（全账见 BJ217）。★BJ222:live-only 残差 2 条（353 的 2863/3259 火星门）数据刀收口→exit 0+合成毒化保持判别力。★BJ261 补 fresh-only【选报】轴（valuesFresh/shopsFresh,打印不拒跑）——器语义特例:现库 60 条刻意剥离面（453 相位表/633 动物学家/227 基础色等,运行时动态直管,重产不写入）使拒跑语义不成立,但轴向必须 loud（现库真删条=退化,人工判别）;SW_SHOPSTOCK_JSON 探测面（g1:与 --write-real 混用拒） | `tests/extract-shops-era-guard.test.ts` |
| `tools/extract-pets.mjs` | B+重锚（BJ215） | 1456 锚重推 1457（petai 习语）：结构扫描无局部号锚,BJ215 沙箱三方对拍=1457/1458 重产与现库【逐字节零差】（83 件）零差只换锚;SW_ITEM_VER 白名单 {1457,1458},1456 退役显式拒+指引；缺省干跑对拍零写盘；SW_OUT canonical+PETS_OUT（FX53 legacy 别名）；锚 fail-loud（DefaultToVanitypet 4797 公式块/表基数/4797-4817 boss 宠 21 件/3855-3857 SW-FX53 钉值） | `tests/extract-pets-era-guard.test.ts` |
| `tools/extract-mounts.mjs` | B（BJ215;★BJ217 1458 定谳注记） | SW_ITEM_VER 白名单单值 {1457}——★BJ217 已对 1458 MountID sets 真差逐值定谳:唯一增量=MountID.cs:19 `DoesNotOverrideWings=CreateBoolSet(57,58,59,60)`（滚轴鞋族;1457↔1458 Mount.cs 逐字节全等）;语义=Player.cs:15710 隐藏翼显形门 1458 扩支,本仓渲染侧（Renderer.ts:13875-13881）以 MOUNT_DATA.CanUseWings 同集（SetAsRollerSkate 仅 57-60 置 true）已实现同语义,数据面零影响 → 白名单维持单值;扩 {1457,1458} 须连动现库加表+渲染侧换读位（条件债三件一体）；缺省干跑对拍（BJ215 定谳 bare 重产=现库逐字节零漂移）；fnBody 锚 fail-loud；双旗互斥+非 1457 禁写真库 | `tests/extract-mounts-expert-era-guard.test.ts` |
| `tools/extract-npcdust.mjs`（BJ254 2026-09-21） | B | SW_ITEM_VER 白名单 {1457,1458}（1456 锚集未建显式拒）；缺省干跑对拍零写盘（bare 重跑=现库逐字节）；SW_OUT 沙箱/--write-real 逃生门；双旗互斥+非 1457 禁写真库；锚 fail-loud（HitEffect 签名 :82492/方法尾 :90939/尘调用基数 629/探针组锚行 5 处）；★BLOCK1_TYPES 首批名单内建（78 门组/299 型,未接组以 _meta.pending 滚动登记=batch2+ 可表达 270+白名单外形态 122）；消费点 src/entities/NpcHitDust.ts（Enemy.hurt 受击/死亡尘查表单源,未列型零尘=原版无通用尘尾） | `tests/extract-npcdust-era-guard.test.ts` |
| `tools/extract-expert.mjs` | B（BJ215） | SW_ITEM_VER 白名单 {1456,1457,1458}（1456=recon --dump 通道,1456↔1457 数据面全等）；缺省干跑对拍零写盘（43 条逐字节零漂移）；SW_OUT 沙箱/--write-real 逃生门；双旗互斥+非 1457 禁写真库；--dump 不受守卫限制 | `tests/extract-mounts-expert-era-guard.test.ts` |
| `tools/extract-vanity-effects.mjs`（BJ260 2026-09-22） | B | hasVanityEffects 置位面机械提取（Item.cs SetDefaults 三通路:字面 18 站 33 vid/DefaultToInfoAccessory 22 站/DefaultToGolfBall 15 站/DefaultToMusicBox 85 站 101 vid=171 全集;case 连标全 run+区间 if 块+嵌套 switch 归属行态机,1803-1807→1533-1537 SetDefaults 委托建模）。SW_ITEM_VER 白名单 {1456,1457,1458}（三版 SetDefaults1..5 分段同构解析,all 集逐 vid 全等=活体交叉闸）;缺省干跑对拍零写盘;SW_OUT 沙箱/--write-real 逃生门;双旗互斥+SW_VANITY_JSON 探测分离 g1+非 1457 禁写真库;锚 fail-loud（签名/helper 定义体/哨兵正负面 4·239/通路基数 18·22·15·85/字面 vid 33/归属带外即炸）。★扣除判据=数据面 itemstats van 键实压位（非 vanilla vanity 字面——音乐盒族 itemstats acc=1 无 van 键须留集,S7 简报「音乐盒族扣除」被本刀证据翻案）。产物 vanilla-vanity-effects.json 消费位 itemTooltip.ts SOCIAL_VANITY_EFFECTS_VIDS（BJ230 手抄 4 件退役） | `tests/extract-vanity-effects-era-guard.test.ts` |
| `tools/extract-npcdrops.mjs`（BJ261 2026-09-22） | B+重锚 1457 | S5 定级「唯一旧基线险实弹」（1456 硬锚三源+裸跑直写两活库+相对路径 cwd 敏感）清偿：三源重锚 `Terarria${VER}`（ItemDropDatabase.cs 与 1458 逐字节全等 md5 cdc9c108;NPC.cs SetDefaults/SetDefaultsFromNetId 两读域 1457↔1458 全等;SlimeBodyItemDropRule.cs 三版全等），apply1457DropPatches 补丁面整体退役 → 12 处 1457 注册锚源文本 fail-loud+POOL_METHODS 池字面量回读校验+entries·values·slimeBody 基数护栏（630/428/44）承载判别力（对拍实证 630 条目多重集零差,唯一位序差=6173@395 回归源码序 :926）。SW_ITEM_VER 白名单 {1457,1458}（1456 退役显式拒）;缺省干跑对拍【双向】零写盘;SW_OUT 沙箱（双产物）/--write-real 逃生门+非纯增量拒+双旗互斥+非 1457 禁写;SW_NPCDROPS_JSON/SW_NPCVALUE_JSON 探测面+--write-real 混用拒（g1）。★同刀勘误（活库对账逐值定谳,--write-real 已落）:①callRule ScalingWithOnlyBadLuck 坍缩普通 common→onlyBadLuck:1（:179 4271,消费面 NpcDrops.ts:432 R14-A1 在）;②vanilla-npcvalue 589:60=BJ174 前「定窗分段」渗漏工件（type==589 块无 value 赋值）→删;590/591 真值 60 整缺（旧 mark 正则漏‖组）→补;455-458 真值 0f→补。守卫测试 M1 摘干跑门/M2 毒化注册锚/M3 摘 fresh-only 轴 | `tests/extract-npcdrops-era-guard.test.ts` |
| `tools/extract-recipes.mjs`（BJ261 2026-09-22） | B+编码面重建 | S5 P2（红队 r25 债「干跑实测会被抹但无机械闸」——原 R25-B5② 强制门只拦单向,缺省仍直写现库）清偿：缺省干跑对拍【双向】零写盘（live-only=洗库预警/fresh-only=缺键型,组 gid 按组名归一对拍——gid 系自洽内部键,live 编号=1456 时代枚举+手并工件,源码序=权威）;--out 沙箱/--write-real 逃生门+非纯增量拒+双旗互斥+非 1457 禁写;--append-loops 遗留通道限 1457+与 --write-real 互斥;SW_TREE 白名单 {1457,1458}（Recipe.cs/ItemID.cs/Item.cs 读域 1457↔1458 md5 全等,1456 退役显式拒;Main.cs 依赖随死扫描勘误移除）;SW_RECIPES_JSON 探测面+--write-real 混用拒（g1）;基数护栏 3431/34/9 fail-loud+生成器签名四拼写全失配即炸（原静默漏族）。★编码面重建七勘误（对拍逐值定谳,--write-real 已落,3376→3431）:①单参 SetIngredients（:16768-16776 Length==1→stack 1）原被 pair 循环整吞→items:[] 假配方 276+;②num/stack 局部变量（53 处 .stack 引用）原静默塌 1;③num2-5 变量块→高尔夫墙族 14+反向 14 原整条蒸发;④needTorchGodsFavor/needMechdusa（消费面 vanillaRecipes.ts:411-412 在）原整缺;⑤Turtles 组（:508 GetNPCNameValue 嵌套括号）原静默跳组→gid 全体错位,现按源码注册序重编（decraft 测试 gid 引用同步更新）;⑥Platforms 死扫描（Main.cs 形态三版 0 命中,权威=TileID.cs:243 CreateBoolSet(19,427,435-439)）→平台反转 27 条整族补齐;⑦3918 算式栈量 (int)((float)num*2.5f) 原塌 1,源=12。残差登记:反向配方落位序=追加式（原版插原位 i+1,纯 UI 列序差,对拍多重集不受影响,排序债另立） | `tests/extract-recipes-era-guard.test.ts` |
| `tools/extract-banners.mjs`（BJ284 2026-09-22） | B | S5 洗库险（绝对路径缺省直写）清偿：缺省干跑对拍双向零写盘（deepWash 路径级 diff,live-only=洗库预警/fresh-only=退化缺键型）;SW_OUT 沙箱/--write-real 逃生门（非纯增量拒+双旗强推）;SW_ITEM_VER 白名单 {1457,1458}（1458 交叉重放 byte-perfect,BJ284 定谳;1456 退役拒）;SW_BANNERS_JSON 探测面+--write-real 混用拒（g1）;锚 fail-loud：四面签名（原 indexOf -1 静默滑窗反模式已修）+KillsToBanner 字面量回读+基数护栏 447/6/9/280/43 | `tests/extract-tables-era-guard.test.ts` |
| `tools/extract-mapcolors.mjs`（BJ284 2026-09-22） | B | S5 洗库险清偿：同 banners 同构闸（deepWash/沙箱/逃生门/双旗/g1=SW_MAPCOLORS_JSON/白名单 {1457,1458}）;★锚反模式新形态：`methodBody` 签名未命中时 `indexOf('{',-1)` 滑到「首个 { 起的全文体」而非空体（静默全文体,parse 照常全绿）——修=INIT_SIG 显式 includes 锚先行+`!body.trim()` 兜底双闸;基数护栏 tiles 748/walls 356 | `tests/extract-tables-era-guard.test.ts` |
| `tools/extract-tile-collision.mjs`（BJ284 2026-09-22） | B | S5 洗库险清偿：同 banners 同构闸（probe=SW_TILECOLLISION_JSON）;Platforms `if(m)` 静默空集反模式已修（fail-loud）;provenance `source` 字段钉 1457 基线静态串（tiles 数据面 1457↔1458 全等——动态串会在 1458 重放假红）;基数护栏 solid 324/solidTop 84/platforms 7 | `tests/extract-tables-era-guard.test.ts` |
| `tools/extract-npcbestiaryoffset.mjs`（BJ284 2026-09-22） | B | S5 洗库险清偿：同 banners 同构闸（probe=SW_NPCBESTIARYOFFSET_JSON）;三段签名 section() 原有 throw+合并基数护栏 665;mutant ROOT_TRIGGER 前置重锚习语 | `tests/extract-tables-era-guard.test.ts` |
| `tools/extract-cursor-icon-tables.mjs`（BJ284 2026-09-22） | B | S5 洗库险清偿：同 banners 同构闸（probe=SW_HOVERICONS_JSON）;六方法体签名 methodBody throw+基数护栏 beds 55/candles 60/dressers 61/chests 52+37/chairs 68/pylons 11 | `tests/extract-tables-era-guard.test.ts` |
| `tools/extract-projstatus.mjs`（BJ284 2026-09-22） | B | S5 P3【半版本门】清偿（原 SW_ITEM_VER 有版本面无通道/对拍）：白名单 {1457,1458}（1458 交叉重放 byte-perfect;1456 退役拒——recon 工具链不含本器,1456 回拍读时代快照）;缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;SW_PROJSTATUS_JSON 探测面+--write-real 混用拒（g1）;写盘逻辑全部收编进主运行臂（import 库模式零写盘不变）;--audit 无写诊断通道保留（extract-audit.test.ts 依赖）;基数护栏 types 113/entries 127（floor 100/110） | `tests/extract-projstatus-era-guard.test.ts` |
| `tools/extract-statusplayer.mjs`（BJ284 2026-09-22） | B | 同 projstatus 同构闸（probe=SW_STATUSPLAYER_JSON/白名单 {1457,1458}/1456 退役拒）;EXPECT_TYPES 50/EXPECT_BLOCKS 44/零跳过护栏（BJ183 原有）与对拍闸组合（drift 分支先于写盘臂,exitCode 1 保持）;StatusPvP 1127 重放补丁保留 | `tests/extract-projstatus-era-guard.test.ts` |
| `tools/extract-wallitems.mjs`（BJ283 line 锚闸+BJ284 2026-09-22 通道三分离） | B+双锚二相 | BJ261 排期②【cwd footgun】清偿：读/写路径全锚定 GAME=import.meta.url 派生（原相对路径 cwd 敏感）;缺省干跑对拍=**核心面（id 集+wall/key/name）双向严格+line 域按锚二相**（现库 line 锚=1456（wallitems-parity 层 B 树锚钉死,1457 Item.cs 已并 SetDefaults1-5 不可直读）,缺省 1457 跑 line 差 292 件=预期二相报告不拒跑;同锚 line 差=drift 严判）——家族新变体「D. 双锚二相对拍」;SW_OUT 沙箱/--write-real 逃生门（BJ283 line 锚门收编进写实库臂:缺省 VER 对 1456 锚现库拒写,显式 env=定谳放行）;★家族例外：「非 1457 禁写」不适用本器（1456=line 锚再生合法通道,再生处方 `SW_ITEM_VER=1456 … --write-real`）;白名单 {1456,1457}（BJ283 定,1458 不入——line 域不可用）;SW_WALLITEMS_JSON 探测面+g1;基数护栏 292。守卫测试 M1 用例=双锚 byte-equal 断言不适用（写=fresh 全量非 live 拷贝）的登记样本 | `tests/extract-wallitems-era-guard.test.ts` |
| `tools/extract-gore.mjs`（BJ284 2026-09-22;★BJ329 2026-09-24 重锚 1457 转正） | B（1456 退役拒） | ★BJ329 数据面重锚 1457 清偿：line 域=1457 行号（金标 gore.test.ts 三钉重冻 :84611/:84625/:83109）,白名单 {1457,1458}（1456 退役拒+指引;1458 交叉重放 byte-perfect）,++/-- 后处理解析补臂,「非 1457 禁写」恢复适用。前史（BJ284）:1456 锚曾「刻意保留」（产物 line 域=1456 行号（金标 gore.test.ts 钉 :84540/:84554/:83038 等,553 条 line 平移 ~+71=独立刀量级）,1457 语义 delta=MANUAL_1457_DELTAS 承载（1457↔1458 HitEffect 区 :82492-:90939 逐字节全等 md5 ae487fa5,BJ284 复证）→ 白名单单值 {1456},显式 1457/1458 拒+重锚指引（重锚=数据刀+金标重冻,按 BJ261 件 1 流程另立刀——续批登记）;缺省干跑对拍双向零写盘（deepWash 全树）;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;SW_GORE_JSON 探测面+g1;「非 1457 禁写」不适用（白名单单值 1456）;HitEffect 签名锚（原有）+entries 基数护栏 550;--audit 通道保留 | `tests/extract-gore-era-guard.test.ts` |
| `tools/extract-acc-drawslots.mjs`（BJ298 2026-09-23） | B | 续批排期①【洗库险】清偿：缺省干跑对拍双向零写盘（deepWash）;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_ACC_DRAWSLOTS_JSON 探测面+g1;SW_ITEM_VER（SW_VER legacy 别名仍受纳+--ver）白名单 {1457,1458}（Item.cs 1457↔1458 全等 15ebd617;1456 退役拒）;锚 fail-loud:SetDefaults1..5 五方法体全命中（原 methodBodyOf 静默返空反模式已修）+哨兵 vid 族位 7 断言（原 print-only 升格）+基数护栏 vid≥160/族分布下限;--audit 字节级对账通道保留;定谳=--audit identical 167 vid | `tests/extract-tables2-era-guard.test.ts` |
| `tools/extract-dyes.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_DYES_JSON 探测面+g1;白名单 {1457,1458}（读域 DyeInitializer.cs 三版逐字节全等 b5422370,1458 交叉重放天然 byte-perfect）;meta.source 静态串;锚=BindShader 计数守恒+六哨兵（原有）;定谳=干跑双向零差 116 条 | 同上 |
| `tools/extract-shimmer.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_SHIMMER_JSON 探测面+g1;白名单 {1457,1458}（读域 ItemID/NPCID/Item.cs 1457↔1458 全等 49a0e26a/0234ef53/15ebd617）;锚=Set 名 throw（原有）+十键基数护栏;定谳=干跑双向零差（十键 316/6/1/6/4/93/114/15/29/131） | 同上 |
| `tools/extract-hairdyes.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_HAIRDYES_JSON 探测面+g1;白名单 {1457,1458}（DyeInitializer 三版全等+Item.cs 1457↔1458 全等;Item.cs 行号锚 1457 系 BJ183 重钉）;锚=五锚行/连续段/钉死抽查 anomalies 硬校验先于写盘（原有）;--audit 摘要通道保留;定谳=干跑双向零差 12 条 | 同上 |
| `tools/extract-research.mjs`（BJ298 2026-09-23） | B+基线特例 | 续批②清偿：缺省干跑对拍双向零写盘（★meta.source 动态基线串按 provenance 处方豁免对拍）;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥;SW_RESEARCH_JSON 探测面+g1;★家族例外:「非 1457 禁写」豁免本器——SW_RESEARCH_BASE/SW_ITEM_VER 归一白名单 {1457,1458} 缺省 1458 系刻意（R24 定）,三读域 Sacrifices.tsv/ContentSamples.cs/ItemID.cs 1457↔1458 全等（18e21421/ade71710/49a0e26a）双档重产同构;1456 退役拒;锚=基数护栏 need≥6000/override≥10/count=6196;定谳=干跑双向零差 need 6138/override 16 | 同上 |
| `tools/extract-bestiary-spawn.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_BESTIARYSPAWN_JSON 探测面+g1;白名单 {1457,1458}（读域 BestiaryDatabaseNPCsPopulator.cs 三版全等 4874424e）;锚=conditions 空表/GetCommonInfoElementsForFilters throw（原有）+基数护栏 conditions≥60/byNpc≥600/条目≥800/cf≥50;定谳=干跑双向零差 68/681/839/57 | 同上 |
| `tools/extract-bestiary.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_BESTIARY_JSON 探测面+g1;白名单 {1457,1458}（NPCID/ContentSamples 全等+NPC.cs SetDefaults/SetDefaultsFromNetId 两方法体 1457↔1458 逐字节全等——整文件两版有差但读域零漂移,BJ298 括号配平亲核 178788/19366 字节）;锚=签名 throw（原有）+基数护栏 npcStats=761/ovr≥100 等;定谳=干跑双向零差 41/47/62/137/761 | 同上 |
| `tools/extract-fishing.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘（★_meta.sources 动态基线路径串豁免对拍——provenance 处方）;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_FISHING_JSON 探测面+g1;白名单 {1457,1458}（Populator 1457↔1458 全等 f7391368+AFish 三版全等 2525c321+Main.cs anglerQuest(:1864)/AnglerQuestSwap(:3851) 两域同位同文——Main.cs 整文件有差但读域零漂移,line 域 src 字段稳定）;锚=18 组/锚点抽查/任务鱼 41/拒绝表 14+18（原有）+ruleCount≥140;定谳=干跑双向零差 158 rules | 同上 |
| `tools/extract-itemsorting.mjs`（BJ298 2026-09-23） | B | 续批②清偿：缺省干跑对拍双向零写盘;SW_OUT 沙箱/--write-real 逃生门+非纯增量拒+双旗;双旗互斥+非 1457 禁写;SW_ITEMSORTING_JSON 探测面+g1;白名单 {1457,1458}——读域七源逐域亲核:Item/ItemID/BuffID/AmmoID 整文件全等（15ebd617/49a0e26a/fe0ee6b2/165b7018）,MountID/Projectile/Main 整文件有差但读域（Cart 集/Projectile.SetDefaults 体/Main lightPet+vanityPet+tileFrameImportant 三表域）逐字节全等;锚=SortingPriority 清单/SetFoodDefaults/Cart/Load 缺档 throw+LastNotTrash 不变量（原有;旧"已覆写后 void diff"死码块由对拍闸取代）;定谳=干跑双向零差 345KiB/6196 层全认领 | 同上 |
| `tools/extract-journey-browser.mjs`（BJ298 2026-09-23） | B 壳+选报轴（降级面补臂转正） | 续批③清偿：缺省干跑对拍零写盘（fresh-only/drift 拒+live-only 选报）;SW_FX53_OUT 沙箱（原通道保留）/--write-real 逃生门+双旗互斥;锚 1457 固定;M1=现库重定向假现库证 fresh-only 拒轴;★equip.json 数据刀（10 mount 件源码增补）级联本器 → vanilla-journeycat 十条 .mt 键 --write-real 定谳回写,对拍转双向零差;定谳=干跑双向零差 6110 entries | 同上 |
| `tools/extract-equip-prefix.mjs`（BJ298 2026-09-23） | B 壳+器语义选报/拒双形态（降级面补臂转正） | 续批③+部分闸清偿：缺省干跑对拍零写盘（PENDING 收集制——write-real 亦经闸,防手增面整洗）;五产物逐件语义分型：拒产物=equip/prefix/wingstats（fresh-only/drift→exit 1）,选报产物=accfx/itemstats（登记手增面:accfx 手增 25 条+lavaRose/dmgMinion/crit* 手增键、itemstats van 键 432 处,live-only loud 不拒跑;残差 accfx fresh-only 6166/6175/6181/6182 登记 data-cut 债）;SW_FX53_OUT 沙箱/--write-real 逃生门（diff 非纯增量拒+双旗强推,选报面强推警告）+双旗互斥;锚 1457 固定;★equip 数据刀=10 mount 件源码增补（4785-4787→mount40-42/4792-4796→44-48/6150→64/6151→65,Item.cs 1457 亲核,Cart 集对拍 MountID.cs 全等）→ equip 转双向零差,消费者测试 5 套 122 绿 | 同上 |
| `tools/extract-itemfunc.mjs`（BJ298 2026-09-23） | B 壳+选报轴（降级面补臂转正） | 续批③+部分闸清偿：缺省干跑对拍零写盘;拒轴=live-only（现库退化）+drift（同路径值漂移）;选报轴=fresh-only 登记未采纳面 866 处（785 整条目+81 叶键:placeStyle 67/bait 7 蠕虫笼/noUseGraphic 6/useTurn 1——F-STRUCT 设计「不新增 cur 缺的键」+items.ts 纠偏层+vanilla.json 回填链承载,data-cut 债登记,全量 write-real 被登记史禁止）;ITEMFUNC_OUT 沙箱（原通道保留）/--write-real 逃生门+双旗互斥;锚 1458 刻意（research 同款豁免注记）;placeStyle 内部金标漂移拒产保留;★2413.placeStyle 23→17 数据手术对齐 items.ts:1463 真值（drift 轴清零）→ sw-fx53 A1 例外清零 oracle 重生;mutant 置 tmp 须兄弟 import 绝对路径重写（tests 内建习语） | 同上 |

### 部分闸（0——★BJ298 2026-09-23 清偿:equip-prefix/itemfunc 补缺省干跑臂+对拍闸+逃生门后转正,原残缺面注销;详见四之三 BJ298 批段）

### 未落闸残留（0——BJ215 五件清偿;★BJ217 编码面恢复批清偿;★BJ222 数据刀收口;★BJ261 G-1 fresh-only 轴+S5 普查登记;★BJ298 E1 续批尾清偿）

> BJ212 登记的 5 件残留（itemcombat/bossbags/expert/pets/mounts）+ 部分闸 2 件中的
> travelshop/shops 已全部落闸（见上表 BJ215 行）；登记债状态（★时效更新）：
> ①bossbags 编码面恢复（★BJ217）→ 唯一残差 3329 chance pair 值**已由 BJ222 数据刀
> 收口**（现库=源码位序,守卫干跑转静默 exit 0,合成毒化保持判别力）；
> ②travelshop/shops 词表债清偿（★BJ217:travelshop 多重集全等;shops live-only 残差
> 2 条 2863/3259 **已由 BJ222 数据刀收口**）;fresh-only 60=现库刻意剥离面,运行时
> 动态直管,重产不写入（★BJ261:shops 侧已代码化为【选报】轴,travelshop/bossbags
> 侧为【拒】轴）;③mounts 1458 MountID sets 真差已逐值定谳（★BJ217:唯一增量
> DoesNotOverrideWings {57-60},本仓渲染侧 CanUseWings 同集已实现,数据面零影响,
> 白名单维持单值 1457,扩名单须连动现库+渲染侧）;④守卫测试 mutant 置于 OS tmp 时,
> ROOT 派生自 import.meta.url 的工具（pets/mounts/itemcombat）须先重锚 ROOT 再变异
> （tests 内已建习语,ROOT_TRIGGER 替换前置）。★BJ217 守卫重设计教训：travelshop/
> shops 的 --write-real 拒绝闸依赖「现库领先面非空」——词表恢复后对拍可零漂移,
> 守卫测试直跑真库路径的 --write-real 会真实写入（BJ217 在途实测发生过,canary md5
> 字节还原）;凡对拍可转绿的 B/A 壳工具,--write-real 测试一律 mutant 假现库重定向。
>
> ★BJ261（2026-09-22）G-1/S3 处方落地：B 形干跑对拍闸一律补 **fresh-only 轴**
> （重产有而现库无=现库退化缺键型面）——只算 live-only 的对拍闸对「现库删条/源侧
> 新增」恒绿（变异实证）。双向语义：bossbags/travelshop=拒（重产面应盖住现库）；
> shops=选报（60 条刻意剥离面使拒跑语义不成立,轴向 loud 人工判别）——「按器语义
> 选报/拒」双形态自此入族。npcdrops 亦同刀落双向轴。

## 四之二、BJ261 普查全量登记（2026-09-22 亲读盘点,S5 E1 普查案清偿;★BJ284 续批清偿时效更新）

> 活跃 producer 共 **41 件**（`tools/extract-*.mjs`,npcloot 已 retired 不计;
> ★BJ284 2026-09-22 extract-npcvalue 整件退役——BJ261 排期①「双产同库」定谳 +
> BJ283「双产同库险面注记」（tools/extract-npcdrops.mjs 头注,旧器退役处置落定）
> **双车道收口**（★BJ289 归属统一,详见四之三附段）：
> 亲测其 1456 补全面对 BJ261 后现库 428 键**零新增**（合并面 ⊆ npcdrops 已落闸 value
> 面,589/590/591/455-458 勘误后逐值对齐）,按「整件退役由 npcdrops 单源承载」预案执行,
> npcdrops 双向对拍闸已承载退化修复面（fresh-only 轴）,能力零损失,活库 md5 fdac63b9 零接触）。
> 上表已落闸 26 + 部分闸 2 = 28;以下 **13 件未落闸**逐个登记现状形态（亲读
> writeFileSync 目标/env 面;「降级」=登记即可暂不落闸）。续批排期见文末。
> ★★BJ298 2026-09-23 续批时效更新：下表 13 件中 11 件已落闸转正（acc-drawslots/B 形
> 八件=上表新增 9 行;降级面 journey-browser/equip-prefix/itemfunc=补缺省干跑臂转正,
> 部分闸 2 件一并清偿）→ 全家族落闸 38/41;仅余 tileframe-cosmetic（缺省写 /tmp 不触
> 现库）/shoot-table（写金标目录,守「在途金标禁重冻」）/draw-branch-families（纯读零
> 写盘）三件降级维持登记,无洗库险面。

| 工具 | 现状形态 | 险面 |
|---|---|---|
| `extract-acc-drawslots.mjs` | 缺省直写现库（绝对路径;有 --audit+SW_VER 面） | 洗库险（续批①） |
| `extract-bestiary-spawn.mjs` | 缺省直写现库 | 洗库险（续批②） |
| `extract-bestiary.mjs` | 缺省直写现库 | 洗库险（续批②） |
| `extract-dyes.mjs` | 缺省直写现库（OUT=live） | 洗库险（续批②） |
| `extract-fishing.mjs` | 缺省直写现库（import.meta.url 锚定） | 洗库险（续批②） |
| `extract-hairdyes.mjs` | 缺省直写现库 | 洗库险（续批②） |
| `extract-itemsorting.mjs` | 缺省直写现库 | 洗库险（续批②） |
| `extract-research.mjs` | 缺省直写现库（注:头注 1458 基准系刻意,R24 定） | 洗库险（续批②;白名单宜 {1457,1458}+缺省对拍定谳） |
| `extract-shimmer.mjs` | 缺省直写现库 | 洗库险（续批②） |
| `extract-journey-browser.mjs` | SW_FX53_OUT 试产重定向;缺省写现库 | 降级（有重定向面,同 equip-prefix 族——续批③补缺省干跑臂） |
| `extract-tileframe-cosmetic.mjs` | 缺省写 `/tmp/tileframe-program.json`（argv[2] 可改） | 降级（缺省不触现库） |
| `extract-shoot-table.mjs` | 缺省写 `tools/golden/vanilla-shoot-table.json`（金标目录,非现库;基准 1458+1457 对照 diff 内建） | 降级（写金标须守「在途金标禁重冻」） |
| `extract-draw-branch-families.mjs` | 无写盘（stdout 打印模式,与冻结守卫测试对账） | 无（纯读） |

**BJ284 已清偿（本批 10 件）**：①npcvalue=退役（见上）;②wallitems=cwd 修复+B 闸
（与 BJ283 line 锚闸组合,双锚二相对拍=new 家族变体 D）;③projstatus=半版本门补全;
④banners⑤mapcolors⑥tile-collision⑦npcbestiaryoffset⑧cursor-icon-tables=B 闸
（1458 交叉重放 byte-perfect,白名单 {1457,1458}）;⑨gore=B 闸+1456 锚刻意保留特例
（单值白名单;★续批债：gore 重锚 1457=553 line 平移+金标重冻,独立刀——**已由 BJ329
2026-09-24 清偿**,见续批排期④时效更新）;⑩statusplayer=B 闸。

**续批排期（BJ284 更新,按险面排序;★BJ298 2026-09-23 清偿时效更新）**：①【洗库险】
acc-drawslots（**已清偿**,B 闸+哨兵断言升格+SetDefaults 五体 fail-loud）;②【洗库险·B 形】
bestiary/bestiary-spawn/dyes/fishing/hairdyes/itemsorting/shimmer/research（8 件
**已清偿**——逐件「重产 vs 现库」对拍双向零差定谳,现库领先面=零,无手补恢复面;research
基线 1458 刻意维持,白名单 {1457,1458} 双档读域全等）;③【降级面】journey-browser/
equip-prefix/itemfunc（**已清偿**补缺省干跑臂+对拍闸+逃生门转正）;④【重锚刀】gore
1456→1457（**已由 BJ329 2026-09-24 全额清偿**：src 注释面 BJ298 件 2 双标在前,数据面
vanilla-gore.json line 域 2263 处 1456→1457 终值平移（非均匀:+69×647/+71×665/+72×951/
0×5,MANUAL_PATCHES 红魔 156 三条随锚平移 90865-90867→90934-90936）+金标 gore.test.ts
三钉重冻 84540→84611/84554→84625/83038→83109+注释 span 逐站重锚;**语义面对拍零差**
（554 npcIds/2265 条目 line-stripped 全等）;★重锚暴露并修复 1457 反编译形态解析缺口
`velocity.X++`≡`+= 1f`（BJ298「+=1f→++ 噪声」之实害面——旧解析器静默丢 va 后处理,
变异 M-B 4 门判别）;白名单 {1456}→{1457,1458}（1456 退役拒,1458 交叉重放 byte-perfect
新增守卫用例）,「非 1457 禁写」家族规则恢复适用;守卫测试 12 用例全绿+消费者 6 套 102 绿）。
每件落闸必配判别力变异守卫（M1 摘干跑门/M2 毒化锚/M3 摘 fresh-only 轴三件套,
视器语义选;BJ298 落 tests/extract-tables2-era-guard.test.ts 91 用例）。

**BJ284 批注记（家族处方增量）**：
- **deepWash 通用对拍器**：路径级双向 diff（对象键集+叶值;数组按位）——
  live-only=洗库预警/fresh-only=退化缺键型（G-1）/drift=值漂移;npcdrops 系
  逐轴专用 wash 之外的通用形态,已随 9 件落闸入库（每器自含拷贝,保持工具零依赖）。
- **D. 双锚二相对拍**（新守卫变体）：产物内嵌源码 line 域且测试钉死旧版行号时
  （wallitems line=1456/gore line=1456）,缺省新版跑对拍=「核心面严格+line 域按锚
  二相」（异锚=line 差异报告不拒跑,写侧由版本锚门把关;同锚=line 差即 drift 严判）。
- **methodBody 滑全文反模式**（mapcolors 实测）：`indexOf('{',-1)` 在签名未命中时
  返回「首个 { 起的全文体」而非空体——空体检查拦不住,必须显式签名 includes 锚先行。
- **provenance 字段静态串**：产物内嵌基准版本串（tile-collision source=Terarria1457）
  须钉基线静态串,动态模板串会令 1458 交叉重放在 provenance 字段假红。

## 四之三、BJ283 批档案补档（★BJ289 2026-09-23 盘上可证面）

> 来源声明：BJ283 = 12 件批（红蓝 T2/T3 波,批次台账在波次 transcript,未落盘）。
> 本附段 = **盘上可证面补档**（BJ289 亲读重建）,只登记有文件锚的落点;其余件
> 不作标题重建（防伪影,以原批次台账为准）。

已落盘可证件（锚齐）：
1. **extract-wallitems line 锚闸**（era-guard 家族表 :121 行,家族新变体 D 双锚
   二相对拍;守卫 tests/extract-wallitems-era-guard.test.ts）。★BJ289 D 补全：
   头注「同锚严判 drift」此前 washEmpty 未实现（lineDivergent 无条件出拒跑轴
   =同锚 line 漂移恒绿）→ 同锚拒跑轴落闸 + 守卫「行为面:同锚 line 漂移拒跑」
   + 变异 M4（摘轴恒绿复现）。
2. **parseInt 兜底退役**（方案 A ⑥等价定谳;★批内最大面）。盘上亲数（BJ289）：
   全仓标记 35 站 = src 25 退役注（UI 1/Game 7/Inventory 1/Player 12 共 21 处
   `d?.vid ?? -1` 标记 + 键前缀注 4 处[itemTooltip.ts:236/vanillaItemStats.ts:74·88/
   vanillaRecipes.ts:300]）+ tests 12 + tools/scripts 2。★任务书口径「22 站」
   与盘上亲数差**登记**（口径=是否含键前缀 4 站与 test 站的归属线,无从对原台账
   核定）——执行面以盘上标记为准,后续站数增减以标记串 grep 为准。
3. **orphan-b2 钉种销案**（件 8;tests/orphan-b2.test.ts:533-540）：成树 RNG
   防御性钉种（BJ267 登记假红,20 次 GREEN=20/RED=0 未复现=罕见尾;门判定与
   RNG 无关,非掩盖真红;mock 0.5→种子 5e8;try/finally 防污染）。销案注**在位**。
4. **worldGen.worker save 源注勘误**（S3 定谳：save 源零生产消费方,.wld 导入
   实走主线程 loadSaveData 直调;src/workers/worldGen.worker.ts:190/:202 两注）。
5. **extract-shops 溯源字段补齐**（tests/extract-shops-era-guard.test.ts:110
   ——现库与重产字节面全等断言前提）。

r33 侧核对：tests/sw-fx53-extractor-blindspots.test.ts 的 r33 引用为该波历史
定谳引用（DELEGATE_EXPANSION 手补金标等）,该文件无钉种面 → 无销案注欠账。

**npcvalue 退役归属（统一双车道注）**：BJ261 排期①「双产同库」定谳（本文件
四之二段）+ BJ283 双产同库险面注记（tools/extract-npcdrops.mjs:38-44,旧器
extract-npcvalue 退役删除处置、单源守卫通道承载）——两车道并存,后续引用
npcvalue 退役一律并提（BJ289 起）。

## 四之四、BJ298 批档案（2026-09-23,E1 续批尾+gore 重锚 src 注释面）

> 本批 = ①E1 续批尾（acc-drawslots+B 形八件+降级面三件,12 器落闸/转正）+
> ②gore 域 src 注释 1456→1457 双标重锚（数据面留独立刀）+③三笔登记内数据刀
> （equip 增补/journeycat 级联/itemfunc 2413）。守卫测试 tests/extract-tables2-era-guard.test.ts
> 91 用例（B 形九件全行为面+M1/M2、M3 acc-drawslots 代表、降级面三件行为面+M1）。

**对拍定谳账（先定谳后动刀实证）**：
- B 形九件 bare 重产 vs 现库双向零差（无需手补恢复面,与 BJ215 定谳同构）。
- 1457↔1458 读域亲核（白名单依据,各器头注有 md5 账）：dyes/hairdyes/bestiary-spawn
  读域整文件三版全等;shimmer/bestiary/itemsorting/research/fishing 读域=整文件全等
  或「整文件有差但读域零漂移」（bestiary=SetDefaults/SetDefaultsFromNetId 两方法体
  括号配平亲核 178788/19366 字节;itemsorting=Cart 集/Projectile.SetDefaults 体/
  Main 三表域;fishing=anglerQuest :1864/AnglerQuestSwap :3851 同位同文;line 域
  src 字段稳定）。provenance 动态串豁免面=research meta.source/fishing _meta.sources。

**登记内数据刀（三笔,均源码亲核+消费者测试绿）**：
1. **vanilla-equip.json +10 mount 件**（equip 刀）:live 缺 4785-4787(mount 40-42)/
   4792-4796(44-48)/6150(64)/6151(65)——Item.cs 1457 mountType 赋值亲核,Cart 分类
   对拍 MountID.cs CreateBoolSet 逐值全等（提取器 MOUNT_CART 手抄字面=源码全等）。
   live-only=0（无手补面）→ 纯增补安全落盘。消费者:a-batch1/accfx-armor-mainstats/
   p5-equip-prefix-loadout/sw-ay1-slot-ledger/sw-fx48-boss-pets 122 用例绿。
2. **vanilla-journeycat.json 十条 .mt 键**（equip 刀级联）:journey-browser 合并
   vanilla-equip → fresh-only .items.{4785..}.mt 十键（live 条目在而 mt 键缺）→
   --write-real 定谳回写,对拍转双向零差。
3. **vanilla-itemfunc.json 2413.placeStyle 23→17**（数据手术）:items.ts:1463
   SW-FX3 定谳真值 17（提取器段首匹配伪值 23=区间 return 死码判据）,live 长期持
   陈旧 23 由运行时纠偏 → 落盘对齐 → sw-fx53 A1 唯一例外清零（测试 oracle 同刀重生）。

**残差 data-cut 债（登记,另立刀）**：
- **accfx/itemstats（equip-prefix 选报产物）**:accfx live-only 25 条手增+lavaRose/
  dmgMinion/crit* 手增键+fresh-only 6166/6175/6181/6182 四件源码新档;itemstats
  van 键 432 处——全量重产会回退手增面,新增须走对拍增量合并通道（非 wholesale
  --write-real;器语义选报轴已在闸内承载）。
- **itemfunc fresh-only 866 处**:785 整条目+81 叶键（placeStyle 67/bait 7/noUseGraphic 6/
  useTurn 1）——F-STRUCT「不新增 cur 缺的键」设计面+items.ts 纠偏层/回填链承载;
  bait 7 件蠕虫笼（1994-2000 八档,Item.cs:21343-21388）运行时消费面（tooltip/
  JourneyBrowser/Game toolSlotSem）现由 live 37 条承载——扩面回写=独立数据刀。
- **gore 数据面**（**★BJ329 2026-09-24 已清偿**）:vanilla-gore.json line 域 1456→1457
  终值平移+金标 gore.test.ts 重冻已落（语义面零差,tool 白名单 {1457,1458}/1456 退役,
  详四之二续批排期④时效更新）。

**gore 域 src 注释重锚账（件 2,纯注释零行为）**:GorePiece.ts（HitEffect span 1456:
82421-90870/1457:82492-90939 等 11 站+头注「Gore.cs/GoreID.cs/ChildSafety.cs 三版
（★BJ308 勘误:1456 终点原冻 90873 系伪锚——方法体闭括号实为 :90870,:90872 起
CountNPCS;六处 provenance 冻结面 2026-09-23 一并勘误,金标 line 域不受影响）
逐字节全等 md5 3f7708af/a8018139/2b671c07 免标」声明）/Enemy.ts 6 站（TransformVisuals
81739-81771↔81788-81820 等）/SkyRenderer.ts Moonlord 块（ThrowPieces 83496↔83567 等,
+4813 大平移域）/BigMimicSummon.ts 已 1457 精准免改。★防锚漂移实证:14179「(:82313-82328)」
原系 1457 数（StrikeNPC 扇出,1456=:82240-82255）,与 Damage 尾块（1456:82313-82328）
撞号——亲读上下文后才定归属,盲改即反（BJ290 红蓝锚漂移同案）。
**HitEffect 1456↔1457 diff 全账（208 diff 行）**:语义 delta 四处=①type 405 块加
netMode!=1 门（spawn 面,非 gore）②独角兽 121 gore 94 NewGoreDirect+alpha 继承
（MANUAL_1457_DELTAS 已承载）③王 50 死 spawned slime ai[1] 0f→-1f（spawn 面,非 gore,
未登记→**另立案候选**）④发型师 353/354 微光 gore 543/544→1351/1352（已承载）;
余=+=1f→++ 反编译噪声+CountNPCS 尾块移动。

## 五、已知事故三案（处方的事实依据）

1. **BJ191 preflight 写真实 json**（2026-09，SW-FX 段）：守卫/预检的探测面读
   夹具，写盘面却落缺省真库路径——「探测与写盘分离=守卫被绕过」。产出要素①的
   g1 footgun 硬化（探测 env 设置而 SW_OUT 缺省 → 拒）与红蓝-J1②/F① 两轮
   动态实证（write-blocking hook exit 42 物证）。BJ207 将该处方第一次代码化到
   合并语义族（npccolors/critters）；BJ212 推广到版本门+双旗互斥（petai）。
2. **863 opus 自清扫误杀**（`memory: sw-scrub-mime-massacre-863-opus`）：资产
   清扫 worker MIME 判据漏 opus × gc 每会话强扫 = 自清扫误杀自落库，SFX 静默
   缺失。修 = 判据单源化 + 窄化 text/html。教训：**清扫/守卫判据必须单源**，
   双轨装配漂移会让守卫本身成为事故源（fx43 双轨同族）。
3. **1456 裸跑洗 6147-6195**（itemrare，2026-09-18）：基准切 1457 后 producer
   缺省仍 1456，裸跑把 1457 新物品 49 件（6147-6195）连同 1293 rare 档洗成缺键
   → 运行时 rare=0/value=0 兜底全错。处置 = 拍板#7A 缺省翻转 1457 + 要素 A
   动态 diff 闸（缺键型，不硬编码 id 清单）。BJ92（3860-3862 错值非缺键）同案
   异构勘误：错值型漂移归 recon-item 闸，守卫只拦缺键型——**一门一职责**。

   远祖同族：**vanilla-atlas 全量重跑四连**（2026-09-10 前）——现库进入追加
   时代后全量重写换页洗牌 6000+ 键，四起同型事故催生追加时代守卫（形态 C）
   与「禁止全量重跑、新素材一律走追加通道」的现行纪律（CLAUDE.md 硬约定）。

## 六、同族纪律引用

- **vanilla-atlas 追加时代守卫**（`scripts/vanilla-atlas.mjs:16-37`）：检测到
  Atlas_2/3 页引用（现追加时代判据含 tiles['753'] 扩展）即拒 `exit 1`；
  `--force-full --overwrite-append-era` 双旗逃生（单旗仍拒）。
- **追加通道幂等**：新素材一律 `scripts/atlas-append-1457.mjs`（既有键零改动
  自证），禁止全量重跑 `scripts/vanilla-atlas.mjs`。
- **recon 双闸门**：`tools/recon-item-1456-1457.mjs` / `tools/recon-npc-1456-1457.mjs`
  是数值对账活通道（--fix 重放 1457 终值）；era guard 只拦「重产洗增量」，
  错值型漂移归 recon——分工见事故 3。
- **recon 帧表闸（BJ378 2026-09-28）**：`tools/recon-frame-tables.mjs` =
  资产/帧表完整性静态对账闸（gore/proj/tile 三域×三源 A 原版反编译/B 本仓帧表/
  C PNG IHDR 实测×四规则漏配/越界/尺寸错/过配），源 A 从反编译机械直读
  （GoreID.cs SpecialAI+IsDrip / Gore.cs NewGore 逐 SpriteFrame·numFrames /
  Main.cs projFrames 覆写块连续性断言 / TileDrawing.cs GetTileDrawData
  tileWidth·Height），金标 `tests/golden/frame-tables-recon.json`（干跑双向
  diff 非空 exit 1；findings 活闸基线无关独立红；`--freeze --force-full`
  双旗重冻；SW_RECON_* 探测面+freeze 混用拒=g1；1456 退役拒、1458 交叉重放
  fingerprint 相等，_meta.ver/source 系 provenance 动态字段豁免）。守卫测试
  `tests/bj378-frame-tables-recon.test.ts`（注入→红×5 + M-A/M-B 变异 + g1/双旗/
  金标缺失行为面）。同族教训：**变异锚须自包含块**（单行 if…else 摘句会 SyntaxError
  假红）与**反编译局部号跨版重排**（num389 字面锚 1458 假红 → 矩形算式形状锚）。
- **在途金标禁重冻**：重产对拍零差前，现役数据与金标测试不得动；对拍定谳后
  更新数据必须先跑金标基线（item-stats-golden-1457 / npc-stats-golden /
  npc-frame-golden / atlas-append-golden）跑前跑后全绿自证。
- **共享热文件纪律**（CLAUDE.md）：守卫代码本身也是共享热文件——小粒度 Edit、
  禁整文件回写、每批编辑后 grep 自己的标记复核。

## 七、守卫测试习语速查

```ts
const SCRIPT = join(process.cwd(), 'tools', 'extract-X.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-X.json');
const TMP = realpathSync(tmpdir());            // ★macOS /var 符号链接
const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8',
  timeout: 300_000, env: { ...process.env, SW_OUT: dir } });
expect(r.status).toBe(1);                      // 拒绝路径
expect(md5(LIVE)).toBe(before);                // 现库零写盘（canary）
// 变异：src.replace(TRIGGER, 摘判据/重定向假现库) → spawnSync(mutant)
// 假现库种子用哨兵内容（勿用产物副本——byte-perfect 写入会令 md5 断言失效）
```

既有守卫测试文件：`tests/extract-npcs-era-guard.test.ts`（含 BJ207 合并语义段）、
`tests/extract-itemrare-era-guard.test.ts`、`tests/extract-projectiles-era-guard.test.ts`、
`tests/extract-petai-era-guard.test.ts`（BJ212）、`tests/sw-fx23-atlas-era-guard.test.ts`。
