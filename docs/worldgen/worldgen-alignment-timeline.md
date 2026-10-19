# 世界金标对齐完整时间线（2026-08-07 ~ 2026-09-04）

> 编制日期：2026-09-04。本文把世界生成（worldgen）金标对齐战役从第一天到今天的全部工作
> 编成按日推进的完整时间线。粒度=批（batch）；重大批可拆多步。
> 只读编制，零 src 改动；不替代各批章正文（所有细节以
> `content-parity-vs-vanilla-2026-08-16.md` 各批章与其引用档案为准）。

## 0. 阅读说明

### 0.1 条目字段

每条时间线条目按序给出（可缺省）：

| 字段 | 含义 |
| --- | --- |
| 批号/章号 | 主文档批章名（如 `IIII47 批`、`XCVII·IIII220 批`）；括注交办名冲突时以「交办名」标 |
| 车道/种子/链 | 该批服务的认证链或种子（g=9293480、m=20260811、s22222、12345/c12345、const、ntb、notraps、celeb、drunk、ftw、remix、skyblock、gfb、ddual 及各秘种子迷你链） |
| 定罪 | 一句话根因（重要者附 cs 锚） |
| 修复/动作 | 落盘的修复或取证动作 |
| mile8/认证 | 该批的 mile8 对拍/认证结果（绿带边界、满绿、回退） |
| 方法论 | 该批沉淀的可复用方法（有专门转折点者另见 §2） |

mile8 口径：JS 链 vs x86 真值 dump 链逐槽对拍，106 槽×8 通道
（act/typ/wal/liq/half/slope/lty/inact），「0..N 绿」=槽 0..N 零差、首差槽号=N+1；
「106/106 满绿」=全链零差。

### 0.2 主文档结构警告（编制时发现）

`content-parity-vs-vanilla-2026-08-16.md`（51,174 行）在 **第 18,687 行起含一整段
意外自重复块（约 18,690 行，至 37,276 行止）**：内容=文首 1~18,686 行的近似全拷
（差三处：BOM、缺 IIII47 章、结尾多出 IIII49 章开头）。真实独有内容为：

- 第 1~18,686 行（08-16 ~ 08-29，含 IIII47/44/45/48/43/42）；
- 第 37,277~51,174 行（IIIII49 起 ~ 09-04 CXVII + §⑦ 复验）。

引用行号时注意勿落进重复块。重复块成因未在文档内记载（疑似某次整文件追加事故），
建议后续按「删除 18,687~37,276 行」瘦身（另行评审，本文不执行）。

### 0.3 资料源

1. 主时间线骨架：`game/docs/worldgen/content-parity-vs-vanilla-2026-08-16.md`（批章按时间序追加）。
2. `secret-seed-alignment-master-plan.md`（HHHHHH 批诞生；§10 状态表演进——本文现状与其交叉核对）。
3. `secret-seed-audit-matrix-2026-08-28.md`（46 旗标四维覆盖度）、
   `seed-content-review-2026-08-29.md`（T1/T2/T3 三级复核）、
   `golden-chains-runbook.md`（IIIII90b 诞生；真值资产总表）。
4. 记忆库 worldgen 条目（各批一句话结论）、`game/` git log（08-15 起）。
5. 前史：`vanilla-pass-alignment.md`（08-12）、`specs/content-passes-inventory-2026-08-13.md`、
   `dungeon-js-audit-2026-08-13.md`、memory `vanilla-worldgen-passes`/`approx-zero-project`。

---

## 1. Executive Summary

**一句话现状（截至 2026-09-04）**：从「单种子 4 通道粗对账」起步，20 天内建成
「x86 官方语义真值链 + mile8 逐槽对拍 + 反演重放/掷流仪」的全套认证体系；普通四链
（g/m/s22222/12345）与七彩蛋大线全部 106 槽×8 通道满绿；秘种子扩张到 30+ 条认证链、
其中 22 条满绿；剩余债集中在少数链的尾部单格/单域与运行时（非 tile 面）域。

### 1.1 认证链数（编制时点）

- **真值资产（~/GoldenChains/）**：runbook §1 总表 25+ 桶（golden-g/m/ftw/drunk/celeb/
  toadstool/ddual/gfb-a/gfb-c/remix/skyblock/fishmox/win/grvfix/waterpark/planetoids/
  truckstop/tooeasy/dontstarve/const + gen2-{g,m,s22222,ntb} + cert-endgame +
  mch3-{arachno,mch,manors,pglun} + x86-i78-{pumpkin,jagged}），另有 1 个已定罪禁用桶
  （varia-g1458-ARM64-TAINTED）。
- **mile8 满绿认证链（106 槽×8ch 零差，按各自收官章/最近复验）22 条**：
  g、m、s22222、c12345（12345/evil1）、const、ntb、notraps（七链，08-29 终局宣告）、
  skyblock（08-29 IIII44）、drunk（08-30 IIII71b）、celeb（08-30 IIII68b）、
  toadstool（08-30 建链/09-01 IIII105 收官/09-04 复验再证）、jagged（08-31 IIII99c）、
  fishmox（08-31 IIIII87）、pumpkin（09-01 IIII103c；★09-04 起登记新红 #86，见 §9）、
  FTW（09-01 IIII110b）、purifythis（09-01 IIII107b）、monochrome（09-01 IIII108）、
  xrayvision（09-01 IIII110b 涂装链/09-02 IIII111c 再证）、invisibleplane+negativeinfinity
  （09-02 IIII111c）、rainforest（09-02 IIII115b）、carebears（09-02 IIII115c）、
  waterpark（09-03 IIIII217）、truckstop（09-04 CXIV）、REMIX（09-04 CW）、
  arachnophobia（09-04 CXVII，103/103）。
- **接近满绿（在册残余极小）**：GFB（CXIII 后 105/106，唯余 #99 1 格 slope 瞬态）、
  winter（★09-02 IIII113b 曾达全行满绿 103/103；09-04 CXVI 换 Cecil 复辟 rig 重产 G2
  后在新真值下登记 3 单格债）、tooeasy（#038 W=1 固有备案+#32 已收敛）、
  dontstarve（#065/#090 共 3 格）、planetoids（#32 域 ~40 格）。
- **攻坚在途**：ddual（双地牢，绿带 0..32/0..58 波动，座1/座2 布局域）、
  graveyard（0..96，#97 轨道域）、iamerror（0..31）、sandy（0..75，#76 单站链）、
  howdidigethere / abandonedmanors / wedonteventestforthat（CXVII 新暴露三根因）。

### 1.2 各时期里程碑

| 时期 | 日期 | 里程碑 |
| --- | --- | --- |
| 前史期 | ≤08-15 | 105/106-pass 清单建档；caves-oracle.cs C# 仲裁器+双种子 checkpoint 金标（19 检查点全绿）；近似清零工程；TEdit 仅作 .wld 格式参考 |
| 攻坚期 | 08-16~08-23 | 首轮全链对账（#1-#18 逐位全等）；#19 沙漠三根因定谳开山；8 通道真值链 van22（08-17）；mile8/SW_M8 harness 定型（08-18）；第二/三/四种子链（08-18/19）；四链 #101/#105 会师（08-21）；终局序列①~⑥+1456 回滚+金标再生（08-22）；S0 结构前置四件（08-22）；CONST/NOTRAPS/NTB 立链；★双态门（08-23） |
| 并行爆发期 | 08-23 晚~08-29 | 彩蛋滚动①~㉜多车道并作；1457 真值定版+1458 侦测（08-24）；1457 x86 真值重产 848/848（08-24）；1458 官方双仲裁（08-27）；arm64 flavor 全景翻案（08-27）；#81 幻影案与 mile8 名实校验（08-28）；★终局·七链满绿宣告（08-29）；FTW/REMIX/SKYBLOCK/CELEB/DRUNK 五条 T1 车道同日启动（08-29） |
| 全种子战役期 | 08-30~09-04 | 六+八迷你链批产（08-30）；任意种子闸门（08-30）；jagged/fishmox 满绿（08-31）；真值资产迁址 ~/GoldenChains + runbook（08-31）；pumpkin/FTW/purifythis 满绿（09-01）；rainforest/carebears/涂装三链满绿（09-02）；waterpark 满绿+air 实心语义定谳（09-03）；REMIX 首次满绿+arachnophobia 认证+rig 灭失后 Cecil 复辟（09-04） |

### 1.3 统计（可核查口径）

- 主文档批章级标题 378 个（扣除子节/重复后约 **360 个批章**）；日期覆盖
  08-16→09-04 共 20 天，**无日期断层**（每日均有批章，08-28 与 08-31、09-01 为峰值日）。
- 主文档 51,174 行，其中意外自重复块约 18,690 行（§0.2）。
- 认证链 30+ 条、满绿 22 条（§1.1）；登记在册「满绿后登记红」1 条（pumpkin）。
- 方法论/账本文档 4 份（master-plan、audit-matrix、seed-content-review、runbook）
  + 金标 md5 清单/spotcheck JSON 入 git。
- 定罪/修复未做全量计数（多数批章含 1~10 组定罪+修复，总量在千级）；本文只保
  可核查的链级与批级结果。

---

## 2. 关键转折点（专门标注）

| # | 转折点 | 日期 | 一句话 | 详见 |
| --- | --- | --- | --- | --- |
| T1 | **caves-oracle 仲裁器诞生** | 08-12 | C# oracle 反射真 UnifiedRandom + 双种子 checkpoint 金标，确立「JS 对 x86 真值」的仲裁范式 | §3.2 |
| T2 | **幽灵 tile 语义律** | 08-12 | 原版 `active(false)` 保留 type；JS `EMPTY=0 ≡ 幽灵泥土`；typ=RAW 口径 | §3.2 |
| T3 | **首轮全链对账 rig + 级联告警总则** | 08-16 | 按槽名映射的 pass 头重播快照；「修序自上而下、new 大≠自身错」归因总则 | §4.1 |
| T4 | **流指纹定标法** | 08-16 | passchain 第 6 列流哈希=f(seed,掷数) 唯一命中 → 掷数差可独立于内容定标 | §4.1 |
| T5 | **8 通道真值链（van22）** | 08-17 | half/slope/lty/inact 入链，坡位/液体类型/非活性维度的债从此可见 | §4.2 |
| T6 | **mile8/SW_M8 harness 诞生** | 08-17~08-18 | 106 槽×8ch 槽末对拍+pc.txt passchain；08-18 第二种子链落地→「单种子绿」升「双种子绿」 | §4.2/§4.4 |
| T7 | **官方二进制仲裁之一：Rosetta x86 复现** | 08-17（U 批） | `arch -x86_64` 强制=Intel 语义口径；arm64 有真分歧 | §4.2 |
| T8 | **反事实基座重放** | 08-18（WWW 批） | 用 x86 槽 N-1 八通道快照作干净基座跑单 pass → 差=该 pass 自身自因 | §4.4 |
| T9 | **隔离重放（单槽反演）范式** | 08-16 起（#23 等） | dump022 直构输入跑本 pass 对拍 dump023；后演进为反演重放三层次 | §4.1 |
| T10 | **双态门（SW_MB_1457）** | 08-23（VVVVVV 批） | 1456 缺省认证线与 1457 迁移战役并存，一键切换互不污染 | §4.7 |
| T11 | **值流 vacuous 律** | 08-20~08-27 | 「fresh-seed 下第 t 个样本值恒=S[t]」——前缀逐位相等不构成行为一致证据；有效信号=总长差/段界指纹/受理集差 | §5.4/§5.5 |
| T12 | **官方二进制仲裁之二：1457 x86 真值重产** | 08-24（JJJJJJ 批） | 编译反编译源→字节级验证 848/848，七链全产 | §5.2 |
| T13 | **官方二进制仲裁之三：Steam 双仲裁** | 08-27（NNNNNNN 批） | compiled-1458 rig ≡ Steam 官方 1.4.5.8 两种子各 5,040,000 格全 0 | §5.5 |
| T14 | **arm64 flavor 律** | 08-25/08-27 | 两次基线污染事故定谳：rig 一律 `arch -x86_64`+lipo 检查；插桩零行为扰动须三跑互同 | §5.3/§5.5 |
| T15 | **mile8 名实校验（STRICT_NAMES）** | 08-28（IIIIII8 批） | 槽名对表校验+行 tag 带 passName——数字锚表错位伪影一秒判决 | §5.6 |
| T16 | **任意种子闸门** | 08-30（IIII84 批） | dotted 配方第 4 段=旗标位掩码（bit0=drunk）；slot0 抽样 harness 命令化常驻 | §6.1 |
| T17 | **真值资产迁址** | 08-31（IIII90b 批） | G2 一律居 ~/GoldenChains；runbook=再生保险（配方/md5/SOP） | §6.2 |
| T18 | **air 实心语义** | 09-03（IIIII227b 批） | vanilla `tileSolid[0]=true`——「act=1 且 type=0」残型格对液体不可通行；裸写 type≠KillTile | §6.5 |
| T19 | **rig 灭失→Cecil 织入复辟** | 09-04（CXVI 批） | 全部 /tmp rig 灭失后改用 Steam vanilla exe+Mono.Cecil 三点织入，30 分钟可重建 | §6.6 |
| T20 | **帧维（frx/fry）全槽对拍仪** | 09-03（IIIII199 批） | 认证链帧维盲区补盲；mile8 不裁决的信息位分离原则 | §6.5 |

---

## 3. 前史期（≤ 2026-08-15：七链奠基 / TEDIT 校对时代 / oracle 诞生）

> 编者按：此期无批章制，工作以「pass 清单建档 + checkpoint 金标 + 近似清零」为主。
> 「七链奠基」指 g/m/s22222/12345/const/ntb/notraps 七条日后满绿链的种子域地基
> （种子解析、RNG 复现、pass 骨架）在本期成型；mile8 harness 本体尚未诞生。

### 3.1 2026-08-07
- **105-pass 管线清单建档**（memory `vanilla-worldgen-passes`）：从 `Terarria1405/WorldGen.cs`
  提取 1.4.0.5 全部 105 pass（GenerateWorld L4652 注册、L11204 顺序执行），钉死
  「pass 顺序不可调换、共享 genRand 调用顺序=种子复现契约」两条总纲。

### 3.2 2026-08-12
- **caves-oracle.cs 仲裁器 + 双种子 checkpoint 金标**（`vanilla-pass-alignment.md`）：
  C# oracle 反射加载真 UnifiedRandom，`tests/golden/caves-chain-*.json` 双种子金标，
  19 个 checkpoint（terrain→deserthive）全绿。【T1】
- **幽灵 tile 语义律成文**：原版 `active(false)` 保留 type；IceBiome/TileRunner/拒绝采样
  均读幽灵；JS `EMPTY=0 ≡ 原版幽灵泥土 type=0`；typ 对账用 RAW 口径。【T2】

### 3.3 2026-08-11 ~ 08-12
- **近似清零工程**（memory `approx-zero-project`）：127 条普查缺口全处置、AI 家族 100%、
  发现并修复 5 个全仓级真 bug；gen 域 17 条 0 漏网；确立「新移植直接 1:1、
  📋 精确登记=合规终态」纪律；`caves-checkpoint` 3/3 全绿。
- **项目约定定型**（08-11）：dev server 钉 5199；E2E 一律 run-e2e.mjs；
  **TEdit 仓库（Terraria-Map-Editor）钉为 .wld 格式与数据表参考、禁止照抄其 C# 实现**
  ——「TEDIT 校对时代」的本义：.wld 结构/字段以 TEdit 仓库校对，行为以反编译源为准。

### 3.4 2026-08-13
- **dungeon 地牢域 JS 审计**（`dungeon-js-audit-2026-08-13.md`）。
- **content-passes-inventory 清点表**（`specs/`）：106 pass 逐槽覆盖旗（❶❷ 行）——
  该表 08-16 即被实测数据判过时（#36/#37/#68/#70 实测对齐），成为「静态清点<动态对账」的
  第一份反例教材。

### 3.5 08-09 ~ 08-10（更早轮次，存 memory）
- loot 链与新 pass 轮次（memory `2026-08-09-round5`、`2026-08-10-loot-new-passes`）：
  战利品/新 pass 首轮对齐，属 checkpoint 时代的前置工作。

---

## 4. 攻坚期（2026-08-16 ~ 08-23：单链逐槽清债）

> 编者按：主线=单链（g=9293480/evil0/小世界）×106 槽逐槽清债；08-18 起多种子化，
> 08-22 起「终局序列」+S0 结构前置+彩蛋立链；08-23 双态门收束。本期内 x86 真值链
> 为 1456 冻结件（run.log 实证 v1.4.5.6）。

### 4.1 2026-08-16（首轮全链对账 + #19 开山）
- **首轮全链对账 rig**（`tools/_contentparity.test.ts`）：钩 `RNG.prototype.reseed` 按
  pass 头重播取「上一 pass 末态」，**按槽名而非位置映射**（管线重排免疫）；x86 4 通道
  dump 链（van_x86_g）106/106 覆盖。判定：**#1-#18 整段逐位全等**（18 边界）+
  31 个内容 pass 实质对齐（new<600）+ 分歧清单（#19/#21/#22/#23/#24/#25/#26/#27/#28/#32/#33
  上游根因 + #35-#105 内容 pass）。【T3】
- **级联告警总则成文**：#19 是全链首个分歧且入口逐位一致=纯自因；此后所有 new 值是
  「自身 bug+级联」混合，**修序必须自上而下**。
- **#19 Full_Desert 三根因清偿**（SquareWallFrame 掷骰还原 / SmoothSlope 坡面落地 /
  PlaceTile(187) Check3x2 材质击杀）：掷数 319318=319318、流指纹 46d14bb7 逐位相等。
  【T4：流指纹定标法（passchain 第 6 列=终极 oracle）】
- **#23 浮空岛两根因**（CloudIsland 墙73 循环 SquareWallFrame 掷 / CloudLake 云 puff 段
  整缺）：隔离重放（dump022→pass→dump023）四通道全 0。【T9】
- **J 批**：大理石 biome2 slab77 板内分歧终局=CheckStalactite 击杀类型门（ShimmerPass）。
- **K 批**：#29 Corruption（ChasmRunnerSideways 壳2 墙写走 PlaceWall=wall==0 门+WallFrame
  1 掷）+ #20 Mushroom；掷数 5,128,077 精确、双种子泛化。
- **晚批**：#28 Underworld 债清偿（自债继承定界）。
- **深夜批**：#24 DirtToMud + #21/#22 Marble/Granite 三笔（修后 rig 边界 158,750→156,079
  全为上游级联）。
- 方法论：`oracle 侧同步清单` 制度诞生——每批 JS 修复同步登记 caves-oracle.cs 侧待办
  （金标不重生）。

### 4.2 2026-08-17（墙家族日 + 8 通道化 + Rosetta）
- **#56 CaveWallVariety**：PlaceWall 框架耗掷（WallFrame resetFrame 分支 Next(0,3)+墙21
  再 Next(2)，约 5 掷/格）——**陷阱①「框架耗掷」实锤**；Mono.Cecil 向 `<AddPasses>b__282_55`
  闭包注入 CWVProbe 逐迭代定位（接受后 paint 段耗掷）。
- **尾部清剿批 1**：#30 Lakes（掷数 718 精确+四通道 0）、#71 Pots（三自因：实现体外提/
  平台族 tileSolid 9 类/采样上界 off-by-one）、#89 Vines（+669=0.4% 结构零差=级联）、
  #103 Stalac（掷数 6,015,909 精确）。
- **#82 Trees 专项**：普通树全门谓词对齐 1456（五笔 1405 旧译残留）。
- **L 批**：#28 Underworld 隔离复验——「全级联」判定证伪+QW 清零；#46/#47/#67 墙家族横扫。
- **N 批**：#28 AddHellHouses 内部残余终清（HF 掷数/内容双归零）。
- **深夜/凌晨批**：#32 Dungeon 楼梯 JS 移植+`(207,876)` 一格根因猎杀；468 格假差清零
  （JS 转录本体无罪）；k0 定界 k0_v∈[6737,6977]（≡5 mod 6）。
- **Q 批**：#47 Hives 全归零（五件连环根因）+ canPlaceStructure 补 GeneralPlacementTiles
  扫门+#67 通道盲区定界。
- **U 批**：half/slope 通道首分叉猎杀——#53 SmoothWorld 四件移植差全修；★**前提推翻：
  x86 基准本机可 100% 复现（`arch -x86_64`，Rosetta）**——官方二进制仲裁口径自此确立。【T7】
- **W 批**：#19 平滑幻影坡=TileRunner ClearSlope 缺失（#27 Webs 显形）；#67 Cave_Walls
  全归零（重放缺 GenSolid 时点态+Spread.Wall2 实心门弱谓词）。
- **#32 Dungeon U 批收官**：k0_v 定值证明+C 段双精确+G 落位三根因。
- **X 批**：TemplePass.setBrick 清坡位+_walliso gsPristine rig 修复；Dungeon B 段
  「隐形书架」+2,092 定案（真根=E 段入口走廊 +169）。
- **Z 批**：Dungeon 真终清——E 段 +169 真根=PlaceWall 每调用一掷；+144=24 次失败坑尝试；
  平台行 n27 归位；DG_SET_ROLLS 硬跳撤除。
- **尾部 2-A/2-B/2-C**：微群系 #101+仙人掌珊瑚 #98（Mahogany 缺段/DeadMans 候选序/
  二次沉降时点）；箱族+雕像槽（#58 SurfaceChests 边界；x86 AddBuriedChest/
  CaveHouseBiome.Place 事件探针）；房屋链欠掷终清（墙重帧掷 5 万+房间互斥自创门——
  房屋掷数 30%→102.5%、房型分布 21/17/4 全同）。
- **Y 批**：Marble/Granite @52 坡位残余 219 格三案齐清——granite −703,003 假案勘正
  （VN 表 `gra:781137` 系定标笔误，真值 78,137）；★**8 通道真值资产 `van22` 诞生**
  （106 pass×8ch，probelib WriteGrid 扩 half/slope/lty/inact）。【T5】
- **EE 批**：Dungeon 砖写清坡收口（@52 残余 219→3）+「砖型债 44↔91↔241↔240↔42」勘正。
- **Granite 首红猎杀（FF 批）**：「JS 多清 6-10k 坡位」勘误=**隔离 rig 伪影**（oracle CA
  漏激活位一行修）——rig 伪影类事故第一次立案。
- **房屋段墙重帧掷终清批**：十一修复、AB 558→565、house0-4 位级全对齐。
- **II 批残余两件**：死亡判定对象感知 100%+JS 接入；仙人掌 P(2789) 掷差（棕榈尾帧扫缺失）。
- **PM 批**：house5 起逐屋欠掷剥层（MM 批续作）。
- **矩阵基线真缺口批**：moonType 落地+spawn 循环二 1:1+Pots 首次归零闭环+三项级联归因。
- **中尺寸分界带猎杀**：#22 矩阵最大单一差距=JunglePass `(int)` 截断 vs Math.floor
  单行修（m111 typ 20.09%→4.82%）。
- **大尺寸终案**：「大尺寸专属根因」=**矩阵基线架构错配（arm64 切片）**——基线污染
  先例①；skyLakes 硬编码真 bug 顺带修复。
- **RR 批**：蜘蛛巢墙 62+tile25/28 三族定位——SpiderCaves 六移植差全修。
- **离群种子定位批**：s4444/s6666——Tower 入口整路径缺失（两种子同根）+s6666 Corruption
  独立分支缺口。
- **s111 三大差异清剿**：#29 place3x2 坡门/#103 初始列语义/#89 v_444 键名断链。

### 4.3 2026-08-18（种子化 + mile8 定型 + 尾段自因清查）
- **XX 批**：Tower 入口 PrecalculateEntrancePosition 路径双侧转录。
- **GGG 批**：Temple 三根因全清（#46 隔离重放六通道全零）。
- **#49 Settle_Liquids 丛林沉降族终清批 / VVV 批**：两役（LiquidSim.delWater 岩浆烧除
  active 门等）。
- **TTT 批**：#47 起 3 格 half/slope 债（#53 雪崩独立点火源熄灭）。
- **UUU 批**：#53 SmoothWorld R0 清零——KillTile 尾 SquareTileFrame 级联移植
  （SolidTile 变体家族的级联移植原型）。
- **XXX 批**：中/大尺寸矩阵全量+尺寸敏感分支全扫——「尺寸专属债」证伪（x86 基线）；
  FinalCleanup ⑭ DirtiestBlock 尺寸分支补齐。
- **YYY 批**：#49 第二役——gen 期 KillTile→SquareTileFrame→TileFrameImportant 锚点
  级联拆除族。
- **WWW 批**：★尾段逐 pass 自因清查 #54-#105（golden 干净基座反事实重放）+6 修复+
  underworld 检查点仲裁。【T8】
- **AAAA 批**：post-OOO 地牢盒四世界复测+s12345 三专项裁决+Dome 锚语义修复。
- **ZZZ 批**：FinalCleanup ⑭ 前置 TileFrame 全图扫 1:1+ShimmerCleanUp 补齐+苔藓计数
  机制平权。
- **CCCC 批**：#101 Micro_Biomes 自因定罪 8 项 1:1+43k 差级联分解（上游 wire/宝箱输入债）。
- **BBBB 批**：oracle 同步 x86 43/43 全绿+金标再生彩排。
- **DDDD 批**：#59 Buried_Chests 7.8k 自因清零攻坚（6081A/7876T/4806W→193A/193T/0W）。
- **GGGG 批**：无根树终审——Flowers 杀干基 CheckTree 整树坍塌级联补齐（用户实战报障）。
- **FFFF 批**：Dome 入口体全量移植（DomeDungeonEntrance.cs 1:1）。
- **EEEE 批**：#76 Traps 自因 4915→8 格+JS 自造 runSurfaceDecorPass 前置段退役。
- **KKKK 批**：终局红基线——全量回归红集总清点（三跑快照+逐条五类归因）。
- **JJJJ 批**：★**第二种子 12345 里程碑 dump 链**（106 槽×8ch+pc.txt passchain）+
  双种子全链对拍——「单种子绿」升「双种子绿」；SW_M8/_mile8 harness 就此定型。【T6】
- **LLLL 批**：12345 #53 自差清零（CheckSuper(485) 派发缺失+SolidTile 致动腿缺失）。
- **HHHH 批**：跳段区 10 名清零（_oraclesync 66→76/78）。
- **MMMM 批**：12345 #32 Dome 残余清零（瓦罐支撑门/水书掷位/致动柱）+Dome/Tower
  入口盒特性门。
- **IIII 批**：小债总清扫（#64/#77/#99 根因落地+树列收敛复验+登记表幽灵修剪）。
- **NNNN 批**：oracle Dome 入口体终态镜像+MMMM 四修同步（40/78→71/78）。

### 4.4 2026-08-19（四链全景日）
- **PPPP 批**：五小债+一复扫——12345 祭坛级联清零；house#111 定性为**陈旧基座假债**。
- **QQQQ 批**：#49 Lt=1 清零（finalGenMergeCheck 误带 LavaCheck 沙漠 blast 前导）——
  **12345 链 0-53 全绿（双链全绿里程碑）**。
- **OOOO 批**：#64/#87 八通道全清+#77 三修+探针雷根因。
- **RRRR 批**：邻近装饰帧杀引擎落地（#77 残 952→2+平台锚定补真+KillTile 尘掷实测表）。
- **SSSS 批**：#93/#77 双归零+#63 −96%+SolidTile2 双重载仲裁（SolidTile 变体家族节点）。
- **TTTT 批**：金标帧/线/注册表三通道织入+Water Chests 重掷域修——#62 归零。
- **UUUU 批**：TTTT 五残量清偿（#66/#76/#99 三归零+#63 全 pass 掷流全等）+
  **两大反编译陷阱定谳**。
- **VVVV 批**：终局矩阵预演——39 世界全量只读重跑（战果量化+残余分流）。
- **YYYY 批**：第三/四种子 dump 链（s22222+m20260811）+mile8 尾段 106 槽扩展+
  **四链全景表**+六族残余槽级归因。
- **XXXX 批**：#101 全样本流五修（20196→165353/1663744）+剑冢 HashSet 豁免撤销（裁决）。
- **ZZZZ 批**：金字塔走廊 26 vs 24=主体刷墙段 SquareWallFrame 11025 掷债（双参织入实测）。
- **AAAAA 批**：TrackGenerator 帧链 1:1 补齐（三链镜像；掷流 165353→165546）。
- **WWWW 批**：#59 百格级根清偿（金标反事实四修到零+跨物件帧杀级联引擎）。
- **BBBBB 批**：s22222/m 两链 #32 种子特异残差（水覆写箱 loot 支+入口 0.6f 刀口 float）。
- **CCCCC 批**：Place2x2 右下锚族修复（矿爆 411+DeadMans 巨石 138）+Check2x2 引擎
  138/411 派发——#101 判定域全收敛。
- **DDDDD 批**：m 链 #49 湖体 L=11,707 清零（LiquidBuffer 回灌双重错位；中世界首触
  25000 帽）。
- **GGGGG 批**：m/s 双链 #58 Statues 清零（放置期 SquareTileFrame 组拆级联全量接线）。
- **EEEEE 批**：BBBBB oracle 镜像债清零+中世界支四根因（marble/granite/skyLakes/DBnd）。
- **FFFFF 批**：矿轨 TrackPass 全链终清——**#101 轨道 3991/3991 逐位全同**。
- **HHHHH 批**：中世界 quickcleanup 8 格定罪（oracle 微光清坡位漏转录·反事实归零）。
- **IIIII 批**：两备案格终清（#63 蜘蛛洞 2 格+#54 瀑布 1 格）。
- **LLLLL 批**：#64 Gem_Caves 回归归因（case 178 上线后 placeExposed 手写掷/基带双计）。
- **KKKKK 批**：引擎三微件清偿——**#101 槽八通道全零**。
- **MMMMM 批**：#65 Moss 四连根因（repeat=false/BFS 出列端误去重/暴露段动态上限/
  SpreadGrass enclosed 读静态实心表）。
- **JJJJJ 批**：m/s 双链 #59 清零（七件屋域补齐）+金标掷签名流全对齐。
- **NNNNN 批**（08-19/20）：#69→#77 五连根因（岛屋壳半砖/QuickCleanup 静态 SaveSlopes/
  SpreadGrass Check3x2/SurfaceOre GenVars 混淆/SolidTile2 严口径）。

### 4.5 2026-08-20（四链抵 #101 + 彩蛋侦察）
- **OOOOO 批**：三链 #61/62 水箱/海底箱清零（AddBuriedChest trySlope 逐行门序重构）。
- **PPPPP 批**：#77 墙画帧步进+#81 向日葵三连根因（连带 #82 全愈）+TileRunner
  SaveSlopes pristine。
- **QQQQQ 批**：三链各清最后一件（#63 蜘蛛波镜像双杀掷/#73 族 CheckPile+187 帧假 wrap/
  #69 岛屋门放置帧）——四链零回退。
- **RRRRR 批**：#84 Dye_Plants PlaceTile 头尾镜像全绿+#90 Flowers+#86 荆棘掷流谜案备案。
- **TTTTT 批**：金标链完整性终裁——g/ 原链无罪（848/848 逐字节复验+独立织入双锚）；
  #86 新定罪（PlaceTile 样式支 NfL(14) 无条件先掷被漏读）。
- **UUUUU 批**：终局预演测量批（39+1 世界全量矩阵重跑）。
- **RECON-DRUNK**（只读侦察章）：醉酒世界 37 站点/21 文件债清单落 doc。
- **SSSSS 批**：12345+m #76 Traps 五根因+s33333 回归警报归因。
- **WWWWW 批**：终局前 oracle 体检（仓库现态全量复验+STREAM_PRINT DgCR 一修）。
- **VVVVV 批**：四链齐推 10-12 槽（#77 Piles 三根因/#85 WebsAndHoney 全量重写/
  #79 织入定谳=countDirtTiles ±2 邻缺失）。
- **XXXXX 批**：四链收官——液体域解冻三修（引擎级联改派/checkAlch case5/烧除帧扫）。
- **YYYYY 批**：四链终清——**四链同抵 #101（Temple 域界）**；#97 残 2=vanilla 拷贝 bug；
  #77 残 17=float32 迭代界。

### 4.6 2026-08-21（会师 + oracle 终镜像）
- **BBBBBB 批**：#101 会师债主根因（sword GenVars.worldSurface 混淆+剑冢帧掷全链+
  campsite 墙序）——s22222 残差 −86%。
- **CCCCCC 批**：#101 掷流三链全对齐+九修；BBBBBB「41 vs 32 候选」**定罪翻案**
  （异常 span 误读+幻影掷鉴别）。
- **DDDDDD 批**：四链终局——CheckSuper 四 case 通用臂+水侧 LiquidCheck 归位+CheckPot
  Gore 掷表+画作墙检族四派发——**四链 #101/#105 全绿达成（终局条件）**。
- **EEEEEE 批**：oracle 终镜像（终局序列第一步）——batch4 1457 hellfort 全量+
  剑冢/营地/矿爆+引擎臂全量转录（EE_NEWARMS 门控）。
- **RECON-LIGHTNING**：moreLightning/noLightning 双雷只读侦察（零 worldgen 债定谳）。

### 4.7 2026-08-22（终局序列 + S0 + 彩蛋首战）
- **FFFFFF 批**：漂移带 dice-account 猎杀（beehives 首名转绿+EE_NEWARMS 转正+十连根因，
  帧债层显影）。
- **HHHHHH 批**：★**彩蛋种子金标对齐总账**——八种子 JS 对拍定量全量落盘+资产完整性
  矩阵（9×5）+修复排期依赖图+CONST worldId t=16 跳掷铁证；`secret-seed-alignment-
  master-plan.md` 由此诞生。
- **GGGGGG/IIIIII/JJJJJJ/KKKKKK/LLLLLL/MMMMMM 批（终局序列③④⑤前置⑤执行⑥执行①）**：
  帧债层清偿→双种子达标→JS 侧四处 1456 回滚+盲区四通道体检→#28 Underworld 三链同签名
  清偿（七文件 1457→1456 回滚）→oracle 侧最后回滚→1 格液残差清偿+**金标再生执行+
  全量回归+矩阵终验**。
- **NNNNNN 批**：★**S0 结构性前置四件**——seed/flags 解耦（GenConfig.seedFlags）+
  parseSeed 全量明文（37/37 经 BCrypt 复算验证）+WldParser 九旗标位回填+paint 第四通道。
- **OOOOOO 批**：普通种子收官清仓（MMMMMM 遗留三件）。
- **PPPPP/QQQQQQ 批**：CONST（The Constant）首战与收官——矿石锁先决（t=16 跳掷）+
  五件核心 1:1；4444 塔种子全 pass 掷级等价铁证+残差一格定界。

### 4.8 2026-08-23（双态门日——时期交界）
- **RRRRRR 批**：CONST #32 书架候选门（塔入口盒底边 20 格勘误，x86 CGFA 门值探针）+
  Caverer 墙桥接门缺失+surface 箱 loot 值域八连勘误。
- **SSSSSS 批**：NOTRAPS 批 1——七族全移植（签名级全绿）。
- **TTTTTT 批**：CONST 终清——killTile 缺失五支全补，**Caverer 带残差 28,675→0，
  #32 与 #31 逐字节相等**。
- **UUUUU 批**：★**假绿事故**——`/tmp/sw-num4/van_x86_g` 名表目录被清空→mile8 缺省
  VG 读空目录→全槽 "(no dump)" 零差→「0..31 全绿」假绿；修复+判据（真跑必有
  `dump names: 106` 头行+ghost 首差；「ghost: 无」即假绿）。同批 NTB 两大方法移植
  （NotTheBees ~600 行+FinishNotTheBees）——NTB 链 0..27 全绿。
- **VVVVVV 批**：★★**双态门裁决落地**【T10】——sibling 意图=全战役级推进 1457；
  裁决=双态并存：1456 链=主认证线（缺省），1457 迁移=并行战役（`SW_MB_1457=1` 切换）；
  HellFort/Temple/BuriedChests 三文件双态化（1456 分支按 cs 逐行重建）——
  g/22222/m 三链 106/106 全绿复达。
- **WWWWWW 批**：终局⑧——12345 链重产 106/106 复达+**mile8 假绿免疫落地**+
  CONST #42 深挖+deactivate 幽灵勘误。

---

## 5. 并行爆发期（2026-08-23 晚 ~ 08-29：多车道 + 彩蛋功能面）

> 编者按：主线=「彩蛋滚动①~㉜」多车道并作（CONST/NTB/NOTRAPS 三线常驻+g/m/s22222/12345
> 普通线回归）+ 真值基线两次换代（1457 定版→1458 官方双仲裁→arm64 翻案）+
> 08-29 七链满绿宣告与五条新 T1 车道同日启动。

### 5.1 2026-08-23 晚
- **XXXXXX 批（彩蛋滚动④）**：CONST #42 雀杖 4281 前缀表定罪清偿；NOTRAPS #53
  blockType 门；#58 锁门 CheckTileBreakability 拒毁门缺失定谳（引擎禁区移交）；
  NTB #32 蜂箱带掷流支。
- **YYYYY 批（彩蛋滚动⑤）**：引擎臂落刀（CheckTileBreakability 门接入 killTileGen）+
  NOTRAPS #58 落刀推进+NTB #42 活树域四支+CONST #49 定罪到域界+**mile8 假绿免疫落地**。
- **ZZZZZ 批（彩蛋滚动⑥）**：NTB #49 蜜位掩码定谳（微光→岩浆→ShimmerRemoveWater 链）+
  NTB #69 天空箱 AddBuriedChest 化+CONST #49 相位网格基建（「R2 再入队」假说证伪）+
  NOTRAPS #59 定罪翻案（→CaveHouse 帧扫域）。

### 5.2 2026-08-24（1457 真值定版日）
- **AAAAA~EEEEEEE 批（彩蛋滚动⑦~⑪）**：CONST #49 落点写钩终裁（「类型分歧」整体系
  探针伪影翻案）；NOTRAPS 57→65（harness 旗标键勘误+CaveHouse 平台实心门）；NTB 52→81
  （祭坛 Check3x2 级联+Traps NTB 跳过）；NTB 81→88（GrowTree 双豁免+树尾 RangeFrame+
  藤蔓 cs:63904 掷）；CONST #49 七通道轮级对拍（「湿岩浆受理门」翻案+首轮内状态分歧
  实证链）+唤醒门裸型位；delWater「静默写」翻案+谓词全表审计两缺口落刀
  （nactive checking 半边+SolidTile inActive 半边）。
- **FFFFFF 批（彩蛋滚动⑫）**：#32 定性翻案（非在制漂移=1457 基线切换预期态）；★
  **环境警报：Steam Terraria 已升 1.4.5.8（caves-oracle 真值源再移动）**。
- **GGGGGGGG 批（终局⑨）**：★**1457 真值定版执行**——caves-oracle 加载器**源级转录**
  （Steam exe 1458 污染源退役；76 检查点与 committed 金标逐字节全等）+地牢域 1457
  五项重转录+#32 三方对拍归因闭合+s22222/m mile8 假绿揭发+**1458 战役登记**
  （master-plan §8）。
- **HHHHHHH 批**：**#32 阻塞解除**——DungeonPass 1457 三件+⑥掷值落地（JS==oracle-1457
  post-Dungeon 逐格全等 0 差铁证）+**mile8 假绿免疫第 4 坑（通道完备性）**。
- **IIIIIII 批（彩蛋滚动⑬）**：CONST #32 mega-diff 三级定罪=「非移植债」（后被 JJJJJJJ
  修正）。
- **JJJJJJ 批（彩蛋滚动⑭）**：★**1457 x86 真值重产落地**（编译反编译源→字节级验证
  848/848）+七链全产+三线解锁复验——真实首差=**#32 Dungeon 移植债现形**（III 批结论
  修正）。【T12】

### 5.3 2026-08-25（七链推进日 + 切片噪声事故）
- **KKKKKKK 批（⑮）**：CONST/NTB/NOTRAPS #32 值级定罪与清偿——**七链 #32 Dungeon 全绿**
  （地牢箱 flag9 第三掷 6156+多格物完整性级联两臂）。
- **LLLLLLL 批（⑯）**：#46 Jungle_Temple 三线清偿——**七链 #46 全绿**（砖线谓词 id
  空间碰撞一针定罪）。
- **MMMMMMM 批（⑰）**：#60/#76 正式清偿+同型审计——七链全数前推。
- **NNNNNNN 批（⑱）**：#65 Moss/12345#76/const#49 三件落刀+ntb #72 Hellforge
  （71→83）+**12345 直达 #97 与主链合流**。
- **OOOOOOO 批（⑲）**：#97 三链合流定性反转+执行序迁移（s22222 直达 #100）+
  MiningExplosives 1457 双语义移植。
- **PPPPPPP 批（草稿）**：网关中断续跑·诊断计划落盘。
- **PPPPPPP 批**：★**切片噪声事故定谳**——OOO 批所有 rig 跑（dmlog/mbseg/tilog/mplog）
  直接启动=跑了 **arm64 切片**，其「x86 真值」实为 arm64 世界；三连实证（pc 链首差
  Dunes/arch 重跑逐位≡g1457/两代 exe 语义等价）→ OOO「#97 三件套」全部作废翻案；
  真分歧=SurfaceChests style 显式 0（应 −1 落深解析，cs:17292/36022）一刀修复。
  基线污染先例②。【T14】
- **QQQQQQQ 批（⑳）**：PPP「营地尾段 ±2 值序发散」翻案+g/12345 #97 真分歧定域到
  Micro_Biomes 尾段+ntb #84/m #59/const #52 三件清偿。

### 5.4 2026-08-26（液体域取证日）
- **RRRRRRR 批（㉑）**：QQQ「DeadMans 候选扫描 Δ32」定谳为**双态口径伪影**（SW_MB_1457=1
  后 JS==x86 逐位全等）+剑冢 InnerOutline 漏清墙真凶落刀+Micro_Biomes 总差
  94,867→9,275。
- **SSSSSSS 批（㉓）**：TrackGenerator.Place 掷差定罪（1457 InvalidTiles 五型缺表）→
  g/const 两线 #97 清偿、s22222/const 直跳 #105、ntb 清 #88。
- **TTTTTTT 批（㉔）**：★Final_Cleanup 双链清偿——**const/s22222 直达 106/106**；
  液体域掷流窗口仪定域。
- **UUUUUUU 批（㉕）**：★液体域四刀取证链全量落地（FNV 事件流→逐迭代指纹→RNG 触点序）
  +「孤掷 δ=10 谜题」定界交签。
- **VVVVVVV 批（㉖）**：「孤掷 δ=10 谜题」终审=**跨运行对照伪影翻案**+样本流标定仪
  双端落地。【T11（vacuous 律深化）】
- **WWWWWWW 批（㉗）**：「86 cut-kill 缺杀」=双端 K-log 挂钩不对称伪影（翻案）；
  g#98 首分歧改判 QuickWater/WaterCheck-Rebuild 相位（一改判）。

### 5.5 2026-08-27（1458 定版 + arm64 翻案 + CELEB 立链）
- **XXXXXXX 批（㉘）**：离线重放实验室落地+g#98 定罪链**第三次改判**（相位翻案→流位
  漂移链全量定界）+ntb#98 定罪到二次 NotTheBees()。
- **NNNNNNNN 批**：★**1458 真值定版+七链重产**——compiled-1458 rig ≡ Steam 官方 1.4.5.8
  **全图逐格零差双仲裁**（9293480+22222 两种子各 5,040,000 格全 0）；版本号 326；NTB
  热补丁实证入产物（地牢漆 tile=84,747/wall=135,372）；1457→1458 世界生成真语义差仅
  NotTheBees() 内两处。【T13】
- **SSSSSSSS 批**：CELEB（Celebrationmk10）位级对齐首批。
- **RRRRRRR 批**：★**NNNN 全景翻案**——g1458-* 七链系 **arm64 flavor 产物**
  （run-chain.sh 漏 `arch -x86_64` 强制；Steam kickstart 同为 universal→NNN「双仲裁」
  实为同 flavor 自洽）；x86_64 强制重产后「#1 Dunes/#28/#29」全消失——**五线首差全部
  复位回旧阵地**。基线污染先例③（最大规模）。【T14】
- **QQQQQQQQ 批（㉘bis）**：notraps 双刀连清两域（#66 Temple 雕像级联+#71 Pots 巨石
  三角段）——首差 66→76 两跳；m#61 定罪到「AddBuriedChest 受理×回退窗口」组合。
- **RRRRRRR2 批（㉙）**：m#61 清偿落刀（killTile 有物箱存活门=
  **CheckTileBreakability2_ShouldTileSurvive**，cs:62988/63003）；★**「前缀流判定法」
  判死（vacuous 定谳）**——fresh-seed 下任意两原始值流按定义前缀相等，与控制流差异
  无关；有效仪表=分段/分组 roll 账本。【T11】
- **EEEEEE 批（㉚）**：CELEB ImproveAllChestContents 前缀引擎落地+g#98 promotion-band
  解剖翻向+五线权威复验（SW_MB_1457 门教训固化）。
- **FFFFFFF2 批（㉛）**：g#98 定罪边界推至 wrap131 回灌单格（调度指纹 v1/v2 双端逐位
  等价链）+TrapsPass nactive 九格 inActive 维度补齐。

### 5.6 2026-08-28（多车道大爆发：~24 批 + 两事故）
- **HHHH2 批（㉜）**：★g#98 液体域双修落刀清偿——g 链 0..97→**0..104** 六槽推进；
  ntb「同形抽骰」前判定罪被位级证伪翻案。
- **IIIIIII2 批（㉛bis）**：全窗掷流仪首建——J≡x86 逐值全等至第 11,681,792 掷，
  分歧缩域到本 pass 尾段 ±1.5 万掷的调度/队列簿记层。
- **IIIIIII6 批（㉞）**：CELEB 第二批 SpawnStarterNPCs 落地（起始镇民播种 pass+沙滩出生+
  开局派对基态；白兔掷名 'Boof' 与 x86 全等）——**新槽插入**（埋下 #81 幻影）。
- **IIIII3 批**：g#105 收官三案全清+12345#97 掷数对差首次钉死（Δ=3）；★并行车道交汇
  告警：#81 Sunflowers 全线伪红（他道共享面改动嫌疑）。
- **IIIII5 批**：m/notraps 双链 #76 收官——★KillTile_MakeTileDust 隐藏掷模型移植
  （glass 家族 +10/格）——**m 链 0..80 全绿**。
- **IIIIIII4 批**：ntb #98 WaterCheck checking 位「到场清位」转录缺件+同构双端 round
  对拍仪全家桶。
- **IIIIII8 批**：★★**守门定谳——#81 Sunflowers 四链全线伪红=「mile8 槽表数字位未随
  II6 插槽迁移」对位伪影（零世界内容差）**；修=槽表 +1 迁移+期望槽名名实校验钩
  （STRICT_NAMES）+行 tag 带 passName。【T15】【事故：#81 幻影案】
- **IIII9 批**：ntb #98 收口终测——「前缀逐字节全等+纯尾差 1332」判据确立。
- **IIIIII7 批**：12345 链 #97 三掷差定罪推进（x86 段账权威基线；三类规则错修：
  act=1/type=0 生成伪影格实心语义、truth-base 电线通道、死箱候选门探针化）。
- **IIII10 批**：notraps #76 主族清偿（placePlate 补 PlaceTile case135 尾 SquareTileFrame
  全环分派）——主循环 21000 组+TNT 段与 x86 掷流逐值对齐。
- **IIIII12 批**：12345 #97 续刀——tileSolid[0] 镜像全域化+SW_MB_1457 走廊闸门追认。
- **IIII13 批**：notraps#76 残差收官（TNT 相位 KillTile 突发定罪，x86 KS 栈轨迹）。
- **IIIII14 批**：DRUNK 生成内容层首波（30 消费点；P0 双邪恶群落全链 crimsonLeft；
  探针 17/17）。
- **IIIII17 批**：结构战利品面——abandoned manors 大宅塔+portalGunInChests 箱插枪
  （实现面 P0 两枚落刀）。
- **IIIII20 批**：StarterNPC 换人支收齐（税务员/爆破匠/派对女孩/机械师等链位）。
  （git 侧：936562b6 tenth anniversary starter NPCs。）
- **IIIII16 批**：秘种子生成终结面九枚 P0。
- **IIIII22 批**：#28 Underworld 回归考古仲裁（多判定证据链）。
- **IIIII21 批**：DRUNK 生成面二期（浮空岛族/FDC 绘装+宝箱/地牢入口族/神庙三倍体）。
- **IIIII23 批**：#28 Underworld「结构性陈年债」翻案+基准门缺省翻转。
- **IIIII22b 批**：MP 出生点+双地牢域（royale-with-cheese 队伍出生点系统+dualDungeons
  NPC 区域扫描）。
- **IIII26/IIII24/IIII24b/IIII27/IIII29 批**：12345 mile8 卡点换判；ntb #105 收官攻坚
  （四家族 10k→2.5k）；notraps/const 干净窗口首扫+CheckSuper case443（StyleHorizontal
  误标）；12345 deadmans ±4（炸药桶 inert）；**notraps#76 桶受理面收官+const#31 两格——
  const 链 0..105 全绿**。
- **（并行工具链事故）425 键假缺失**（08-28 夜）：l10n-audit 报 425 键缺失全系
  tools/l10n-custom 目录歧义+双前缀键被误剥（memory `l10n-custom-shape-and-path`）——
  该 gate 阻断 vitest/build，曾同时误伤 worldgen 批车。

### 5.7 2026-08-29（七链满绿宣告日：~22 批）
- **IIII31 批**：notraps #77 Piles 收官（case 654 Check2x2 派发缺口清偿——引擎「未派发
  备案」债现形）。
- **IIII30 批**：12345 #102 Water_Plants 反演重放解剖（秒级刀床建成）。
- **IIII28 批**：ntb 链 #105 终清收顶——**mile8 106/106 满绿，第一条到顶的彩蛋线**。
- **IIII33 批**：notraps#98 引擎派发表一行收口（0..104 绿滚至 #105）。
- **IIIIE34 批**：12345 链 #102 一刀收官（PlaceTile 成功尾二次 SquareTileFrame 整缺）——
  0..105 全绿。
- **IIII36/IIII39/IIII40 批**：notraps #105 十通道分离+FNT(B) 放板路径语义修复+
  FNT 相位漂移终刀（Δ+4,485 全账清偿）+最后 15 格终局归零（PlaceTile 入口双臂补写）。
- **★终局·七链满绿宣告（结项章）**：七链（g/s22222/const/ntb/m/notraps/12345）经权威
  复跑 **106 槽×8 通道全部零差**；§④ 方法学遗产 9 条（mile8 三闸纪律/槽名实校验/tag 栈
  仪器家族/反演重放范式/中立性门槛/信号有效性法则/信息位分离/编译保真闭环/资产双闸门）；
  §⑤ 诚实边界 11 项；§⑥ 全量回归快照（tsc 233 错全存量白名单；vitest 61 failed 全域外）。
- **IIIII41 批**：T3 快清三件（randomSpawn 掷臂接线/arachnophobia 蜘蛛洞域/双雷世界面
  覆盖度定谳+DoRainsForAYear 臂）。
- **IIII47 批**：DRUNK 满绿攻坚——#18 清偿（flood 边界 `>=w-5`→`>maxX-5`，cs:10054）；
  #32 地牢族仪器级定罪（主流逐位对齐+inner-instance LCG 延续采样双向不对称=非骰写面）；
  #28 揭幕；掷流仪新律：**x86 SW_ROLLWIN 分段标签 K 实载 pcIdx=K+1 的骰**。
- **IIIII45 批**：DRUNK 升级 T2→T1（x86 真值链建成+双债清偿）。
- **IIII44 批**：SKYBLOCK 升级 T3→T1——加型生成器本体实装（SkyblockPass=
  GenerateSkyBlockWorld+SkyblockIsland+deny 族）+x86 真值链（107 槽×8ch **mile8 全绿**）。
- **IIII48 批（交办 IIII46）**：CELEB 升级 T2→T1（truth 复产翻案：旧档系 arm64 变味链；
  双债清偿）。
- **IIII43 批**：REMIX（don't dig up）认证车道启动——truth 链双产+中立性闸门+remix 支
  五波落地（0..11 绿）。
- **IIII42 批**：FTW（for the worthy）认证车道启动——G2 建成（dotted 配方
  `1.1.1.4.1671560105`，终态七通道 ≡ 官方 Steam TerrariaServer.exe v1.4.5.8 同配方产物）
  +mile8 首段 0..9 绿（TileRunner strength/num3 两修）。
- **IIII49 批**：CELEB 收官 Attempt——掷窗语义定谳（SW_ROLLWIN 按 pass id 精确分桶、
  `---PASS n` 标记滞后一拍）+★vacuous 教训再命中+残差 A（#59）仪器成型。
- **IIII50 批**：FTW 池味残差定罪修（TileRunner 海滩带 num3 烙灭，cs:77764）——
  #10..31 全绿；台账 12 项清偿 8 修。
- **IIII48·B 批（与 CELEB IIII48 并存异车道，撞号判例）**：REMIX 链收敛——#12 定谳=
  remix 附加双发环四处闭/半开界偏位；0..18 绿；沙漠 remix 五件套落地。
- **IIIII53 批**：DRUNK 零骰写面双案猎杀。
- **IIII52 批**：CELEB 终局收口 Attempt——#59 离线重放 harness 建成+三候选洗清+
  x86 逐骰栈全量定标。
- **IIII54/IIII55/IIII57×2/IIII56 批**：REMIX ghost 一致性专项+#19 收敛；FTW 第三轮
  收敛（#62/#65=级联归因）；REMIX 末刀收官；DRUNK 收敛终局（撞号并存）；CELEB 双残差
  精确定罪收官（A 刀 #59 序数结构对账法；B 刀 #32 writer 翻案=BFS 洪水可达集差）。

---

## 6. 全种子战役期（2026-08-30 ~ 09-04：26→30+ 链扩张与尾部收割）

> 编者按：主线=「迷你链批产」（08-30 两波 14 链）→ 逐链收口与满绿收割 → 09-04
> 末批四链+rig 世代更替（Cecil 织入）。本期内章号启用罗马数字流水（XL/L/CX…），
> 并行车道撞号按「先落盘者持号」判例备案。

### 6.1 2026-08-30（迷你链批产日：~28 批）
- **CELEB 线**：IIII65 双点收官（B 刀 #32=SpreadWallDungeon SolidTile 谓词缺 halfBrick/
  slope；A 刀 #69 三连=tenth 岛风格矩阵/sunplate 幽灵位/chestStyle）red74→red9；
  IIII60 #59 单屋 mark 序；IIII67 #97 Micro_Biomes 收官（EnchantedSwordBiome `||tenth`
  短路门缺失）；IIII68b 四格终刀（#105 RollingCactus 嵌套 destroyObject 窗口语义）——
  **CELEB 106/106 满绿收官**。
- **DRUNK 线**：IIII72 真终刀（Ba 单柱三格）；IIII73 活木森林（#42 归零）；IIII74 蜂巢
  （#47 归零）；IIII70b 水体沉降（#49 归零+nactive 语义修正）；IIII71b 滚动清扫收官
  （#59/#74/#97/#99/#101/#105 六前沿）——**DRUNK 106/106 满绿**。
- **REMIX 线**：IIII58 单格收官；IIII62 收官；IIII62b 入口链路由末刀；IIII59 地牢体内
  两未移植家族；IIII63b 反向地牢体收官；IIII85 活木森林收官（#42 大幅收窄）；
  IIII86 摆动环终刀（#42 清偿+AddBuriedChest 四档链 remix 带移位）。
- **FTW 线**：IIII66（交办 IIII64）尾段收敛（取证+双刀）；IIII67b 平滑世界族 A 谓词定谳。
- **IIII61 批**：彩蛋种子运行时域全量收齐；**IIII63 批**：九满绿线树态仲裁（守门复跑）。
- **IIII77 批**：★**地形烘焙型六秘种子迷你链批产**（sgis/toadstool/fishmox/sparkle/
  jagged/rainbow；G2=/tmp/iii80-out/x86-*；JJHook PreGen 六 SW_FLAG_* 注入）——
  **TOADSTOOL 满绿(0..105)**；双定罪=lane env 跨链残留污染（已修「每链六清」）+
  SecretSeedDoEndsPass `Next(a,b)` off-by-one 全家族（nextIntRange Exclusive 误读）。
- **IIII78 批**：★**状态/资源型秘种子×8 迷你链批产**（ddual/tooeasy/graveyard/pumpkin/
  waterpark/truckstop/winter/planetoids）+dualDungeons 域；插桩中立性三方仲裁升级
  （≡官方 Steam v1.4.5.8 六通道 0 差）；★「种子类依赖早发散」立案（八链 slot0 起红）。
- **IIII79 批**：GFB（getfixedboi/zenith）链前置工程（只诊断不修复）。
- **IIII80 批**：GFB-A 蘑菇主带(#19..27) 修复批（zenith 首刀）。
- **IIII84 批（交办 IIII80b）**：★★**任意种子平价闸门**——早发散 H1/H2 双双否决，
  整体为 IIII78 配方伪影：**dotted 第 4 段被误写 `1`=bit0 ⇒ 八链全部静默开醉酒世界**
  （地形带算术铁证：groundLevel 全 361=drunk 封顶）；勘误配方 `1.1.1.0.<flag>|<base>`；
  slot0 抽样 harness 命令化常驻。【T16】
- **IIII81/IIII82 批**：GFB-B 蜂巢域(#46) 第二刀；GFB-C 液型反转带(#27..33) 反演重放批。

### 6.2 2026-08-31（~40 批：五链满绿窗口 + 资产迁址）
- **GFB**：IIII84（GFB-D 双刀：DungeonPass 域 W 变体轮转+#28 三格液杀）。
- **ddual**：IIII88 四件套收官（Dither_Snake 槽落地+双地牢域装配）；IIII92
  DualDungeonLayoutProvider 巨件移植（#33 首刀）；IIII93b 第二座地牢参数化；
  IIII97 dualRoomsGen/provider 受理相位收敛；IIII98 续批（G2 防伪前置+「14/1963」
  重分类）；IIII99b2 第五轮（δ DR|S| 段界仪）；IIII100c 第六轮（γ 一击定谳=
  GetHallwayConnectionPoint「二调」实为 SelectGoodRoomForHallway 内静态 wrapper 合法
  二评）。
- **REMIX**：IIII90 滚动·祭坛域（DemonAndCrimsonAltars remix 分支，44/45 归零）；
  IIII94 神庙体（#46 归零）；IIII95 蜂巢；IIII98 箱域双轨取证（#59 全流对齐定谳）；
  IIII99c(bis) #59 十四组箱残差归因仪具批（ABRES 台账预置）。
- **状态七链**：IIII89 复验冲刺（bigcrc 单格双刀全绿——**bigcrc 满绿**；g 链 106 复证）；
  IIII91 #1 Dunes「交叉回归」猎杀收官——定罪=**误锚退役 arm64-flavor 真值桶**
  （/tmp/sw-slp/g1458-*），窗口 hunk 全数无罪；IIIII102 tooeasy/pumpkin/truckstop/winter
  四链复验冲刺；IIII100e Sweep 引擎 passRng 接线族全域清查；IIII101c ddual F 域
  （#25 Silt 一刀七槽）。
- **迷你链收割**：IIIII87 五迷你链接力收尾——**fishmox 满绿**+jungle-vine CanHitLine
  判据修复；IIII93 jagged 记账族（DoDigExtraHoles float 域缺转；前沿 16→37）；
  IIIII98b jagged 海洋洞穴体（#37 清偿+SolidTile 全口径）；IIII98c rainbow 双分流点
  （根因上移 BiomeChests±1/Bookshelves）；IIII99c jagged 陷阱小债收官
  （killObjectAt 巨石 chimera 假锚定罪）——**jagged 满绿（第 14 条口径）**；
  IIII97b toadstool 单刀收官（#18+#32；88 红→8 红，0..97）；IIII99b toadstool 终段
  滚动（#98..#104 六行清偿）。
- **FTW/secret**：IIII93 FTW 地牢域收口（G2 迁址+反演重放实验室）；IIIII98b2 FTW 早特征
  （主凶=FTW NewNPC 头 Next(3) 漏掷）；IIII99d2 FTW Front-A（AddBuriedChest 尾段 FTW
  追加掷整缺 WG.cs:37795）；IIII99e FTW 活木族（#42→#97）；IIII99f FTW 终段
  （#97 微群系=熔岩陷阱锚族定域；奇偶吸引子仪）；IIII97c sparkle 走道/叶簇；
  IIII96 sparkle/rainbow 双刀仪具批；IIIII100b sparkle 叶面堆（Check3x2 杀组尾窗扫
  整段缺失 cs:50291）；IIII99d rainbow #32（AddBuriedChest rainbowStuff 1260 追加支）；
  IIII99e rainbow #44/#66（前沿 44→76）；IIII99d 地牢家具帧正确化。
- **IIII90b 批**：★★**金标真值资产巩固：HOME 居所+六灭失链重产复验**——/tmp 清理
  已灭失 12+ 条认证链 G2；六链重产逐条对 md5 证据字节级对拍；全部迁 `~/GoldenChains/`；
  **golden-chains-runbook.md 诞生**（§0 规约禁令：G2 禁直写 /tmp；rig 铁律；新链必做
  控制槽比对）。【T17】
- 另：IIII103c（pumpkin 花域）、IIII105 等跨夜批次见 §6.3。

### 6.3 2026-09-01（~45 批：满绿连收 + 新九链）
- **IIII103c 批**：pumpkin 花域受理门单刀（南瓜 Check2x2Style 引擎臂+尘掷表错档）——
  **pumpkin 满绿（第 13 条 T1 口径）**。
- **IIII105 批**：toadstool 睡莲移动臂闭合（CheckLilyPad 全量版）——**mile8 106 行满绿
  （第 14 条 T1 口径）**。
- **IIII101c-b 批**：ddual DitherSnake 浮点链收口（safeNormalize 乘倒数 IL 锚+XNA
  Right/Bottom ≤ inclusive+EarlyGame tier 表错档+Rosetta-libm cos 终位钉表）。
- **IIII102b 批**：ddual 地牢内容域滚动（Wormlike Processed 重放 num6 跨侧共享计数器）。
- **IIIII106 批**：★**秘种子下一波迷你链九枚**（rainforest/care-bears/iamerror/
  sandybritches/purifythis/infected+涂层族×2+涂装族×2；canon rig 配方
  `1.1.1.0.<flag>|<base>`；i106rig 扩展二进制+.pnt/.pwal/.cbt 三新通道）。
- **IIII101e 批**：FTW DeadMansChests「±1 缺掷」定谳**翻案**（DmLog 栈对照证伪缺骰说，
  真根=chest sink 挂号面分叉）。
- **IIII105b/IIII105c 批**：ddual GroundFurniture 双座分派移植（F 相 4.0M→0.17M 样本
  自证）；ddual 带窗推进（Lights/Chests/Books 三族窗口化对拍）。
- **IIII107b 批**：purify this 终闭——#105「T1>25×17803」单窗反演=ShimmerCleanUp r90
  净化菱形 Convert(j,i,0,3) 整缺（旧注「结构性 no-op」被感染面真值翻案）——
  **purifythis 全链满绿收官**。
- **IIII107/IIII108b 批**：REMIX 屋内宝箱 ABRES 台账版（首分叉逐骰定域）；REMIX 岩门
  双步精修+四簇滚动。
- **IIII102c 批**：FTW 双钥工程（rig `.wir` 走线通道+chest sink 洞数组影子账——
  梳妆台 cs:52601 挂号=X-only 首裂点清偿）。
- **IIII108 批**：★涂装族认证闸裁决+四链金标终局——等价闸「首差#026」翻案=环境位
  SW_EVIL 缺失；control3b 全槽相等正式过闸；**monochrome 满绿**。
- **IIII106b 批**：ddual 四件移交滚动+**并行会话共享文件覆写事故二次立案**。
- **IIII107c/IIII108c 批**：ddual S1..S7 七臂移植；ddual §⑥ 五刀（HCP 几何双裂点归零）。
- **IIII110 批**：winter（worldIsFrozen）冰化世界专项首批——冰化巨面 T 通道 −96.6%/W
  −100% 清偿；G2 车道基座重建（TS37.exe 载入面勘误）。
- **IIII111 批**：rainforest/carebears/error/sandy 四新链收官连打（sandy 双刀/error
  双臂/carebears 三件/rainforest eLT 树冠特化）。
- **IIII109/IIII110b(涂装链) 批**：涂装三链残余收官（invis Pw26×204 主刀+「延后受理
  禁写」勘误=x86 同函数双段写）；xrayvision **满绿**、invisibleplane 9✗→1、
  negativeinfinity 29✗→1（清扫臂无罪翻案）。
- **IIII110b 批**：★**FTW 标准短轨 roll-shape 定罪**（getGoodWorld 灰烬崩塌级联缺移植
  =seq#128 STRK 巷内 201 掷真源）——**mile8 FTW 106 槽满绿（第 15 条口径）**。
- **IIIII111b 批**：winter 薄冰受理窗+绿带 0..27→0..58；★**rig-win-src JJHook.Snap
  插行断链事故定谳+修复**——钩插在 `if (drunkWorldGen)` 与 `{` 之间吞条件体；「插桩
  红线：禁止落在控制流头行与语句体之间」成文（runbook §3-8）。【事故：失控 rig①】
- **IIII112/IIIII112b（XXXXIII）批**：四新链第二轮（sandy 地牢窗族五刀 0..75；
  iamerror 万格→2 格/carebears 0..39）；winter 滚动·埋箱窗清偿。
- **IIII109b 批**：ddual seat0 尾特征窗主项（I=Lights 配额漏乘 globalFeatureScalar）。

### 6.4 2026-09-02（~30 批：rainforest/carebears/winter 满绿 + 三旗批真值重建）
- **IIII110c/IIII113/IIIII114/IIII114b 批**：ddual 窗写面位置校准定谳（S9 窗写面零罪；
  #032 基线审计发现「绿带 0..32 的 #032 行 mile8 从未实查」）；三链小债连打（iamerror
  0..27/carebears 0..39/sandy #76 定位）；rainforest 插桩 rig 建产+簇账定罪
  （「无 x86 侧对照物不可判」解封）；iamerror 地狱账+carebears 金字塔
  （Δ=−1 掷良性尾差判例）。
- **IIIII113b 批（XLIX）**：★**winter 滚动·微群系域收官——mile8 winter 全行满绿
  （绿带 0..96→103/103 行，第 16 条 T1 口径）**；首差 #97 定罪=CampsiteBiome 保护矩形
  右/下边 +1 格（CanPlace 候选域与 AddProtectedStructure(Inflate4) 双消费点同宽一格），
  一行修八通道归零。（注：09-04 CXVI 换 Cecil 复辟 rig 重产 G2 后登记 3 单格债，
  见 §6.6。）
- **IIIII111c 批**：涂装双链单格终闭（SW_I109_TRACE 单格写入铅簿定罪；FinalCleanup 尾
  全图 LiquidCheck 环合并落块 SQF 尾级联）——**invisibleplane/negativeinfinity 全行满绿
  （xrayvision 同证）**。
- **IIIII114b/IIIII116/IIIII118 批**：iamerror 地狱账；ddual seat0 写面位差第一刀
  （isInsideRoom origin「先差后截 vs 先截后差」）；ddual 多轮收敛。
- **IIIII115b 批**：★**rainforest 藤径对拍收官——mile8 106 槽×8 通道满绿（第 17 条）**；
  三刀（干行写入器分派门误用 flag3/FindLowestCloud 云层底/placePlatform 缺
  slope(0)+halfBrick(false)）。
- **IIIII115c 批**：carebears 活木族滚动（LivingTrees 入口 num2=FindLowestCloud()+1
  整缺 cs:15577）——**carebears 0..105 满绿**。
- **IIIII114b2 批**：ddual G 收口三刀（strengthVal 漏源=双重赋值，LegacyDungeonRoom
  cs:220）+T 同刀连打。
- **IIIII114（XLVII）/IIII163（LIX）批**：rainforest 插桩 rig 建产+簇账定罪；
  ★**秘种子三旗批（planetoids/graveyard/waterpark）真值基座重建**——
  **「i78 八链 x86 真值全 flagless」系统性定谳**（秘种子文本路由依赖 BCrypt 在
  recompiled rig 不可达；墓碑/南瓜=0 实证）+II102b「#26 Shinies 代际分叉」翻案=
  漏钉 SW_EVIL 伪影（SW_EVIL=0 重产 pc 110/110 全等）。（★该勘误 09-04 被 CXVI 再勘误，
  见 §6.6。）
- **IIII161/IIII162/IIII166/IIII167 批**：GFB #32 family-α/β 双靶收口（绿带 0..37）；
  sandy #76 巨石变体三刀（祭坛 destroyObject 尘掷账整缺等）；REMIX #59 地狱箱翻案
  （值拟合幻象→flag23 换轴臂+hellChestItem 换件臂）；waterpark #53+graveyard #59
  （「掷流值逐位对拍空洞律」实证——两 stream 5,100,876 掷逐值全等而世界面 18k 差）。
- **IIII171/IIII172/IIII173/IIII174/IIII175/IIII177/IIII178/IIII179/IIII180/IIIII181/
  IIII183/IIII184 批（09-02 密集滚动，摘要点）**：
  - truckstop/tooeasy/dontstarve canon 基座+首战（i171-rig 三注入臂+无旗控制链 pc
    110/110 中立性认证）；
  - GFB #38 Shimmer「tenth 浅带门误抄 !remix 排除」单行定谳（平行副本陷阱）；
  - ddual 座1 MCO「SubStyles 展开备案债」一字定谳（DC.cs:146-152）；
  - REMIX #62 Water_Chests（两趟共用趟1 液体门单刀 cs:17437/17455）；
  - GFB #46 Jungle_Temple @Beehives（remix 支 notTheBees 臂整缺）；
  - tooeasy initializeHardMode（GERunner 写语义双刀+DSEG 段掷流全绿）+dontstarve Moss；
  - grv #59 房箱 gy=h-250 战利品档边界一字定谳（cs:37184 严格小于 vs JS `<=`）；
  - waterpark #53「+2 颗无写无杀门掷」=叶块(192)实心窗整缺（SettleLiquids 尾
    worldGenTilesIgnoreWater）；
  - REMIX #65 Moss 十刀整缺单 pass 定谳（cs:17588-17833，md5 176b7f6b 双代互证）；
  - REMIX #64 Gem_Caves「每 pick 三骰被拆成两骰」单刀（覆写=活掷非死分支）；
  - GFB #53 Smooth_World 半砖平滑域定性+双端掷窗仪成套（行为零改动，定位移交）；
  - ddual W1 残差三段全数定谳（两刀落定+五段重定性）+#34 MCO dual 支 1:1 补移植。

### 6.5 2026-09-03（~30 批：waterpark 满绿 + GFB 冲刺 + air 实心语义）
- **IIII186/IIIII188/IIII191/IIII193/IIII194/IIII195/IIII190/IIII197/IIII198/IIIII199/
  IIII201/IIII203/IIII205/IIII207/IIII208/IIII210/IIIII211/IIII212/IIII214/IIIII215/
  IIII218/IIII220/IIII221 批（密集滚动，摘要点）**：
  - REMIX #67 Cave_Walls+#71/#69 连打（绿带 0..72）；REMIX #73/#75 滚动；
  - ddual BASICCHESTS 掷序债三刀+表支箱 tile 双映射内容 bug（internal 域二次映射）；
  - waterpark #75 三格裁决（**「EmptyTile 实体阻挡」证真=原版生成期老头 NPC 本体行为，
    1:1 落修非豁免**）→ 绿带 0..83；
  - waterpark #84 Dye_Plants「泡沫块 379 生成期实心」一刀（**SolidTile2/实心门读
    Main.tileSolid 可变数组=生成期面板，静态 TILE_DEFS.solid=运行期碰撞语义错窗**）
    → 0..99；
  - REMIX 链终段主刀：FinishRemixWorld 整段 1:1 移植（cs:26617-26991 三源逐行零差）；
  - GFB #59 定域三刀/逐屋分段收口第二·三刀/序19 Δ4 值级重放（loot 旗 flag4 本体整缺
    +沙漠门析取与还原臂）；
  - GFB #76 TrapEv+#77 直扑一刀双钉（绿带 0..89）；GFB #90 Flowers 4 格定罪
    （通用成功尾 SQF 级联）→ 0..96；
  - graveyard #71 Pots（**墓园支撑门读裸 TILE_DEFS.solid 绕过 solidOverrides 覆写表**；
    「旗面已绿」系计数口径误账翻案）；graveyard #76 Traps（「+1 掷」三重铁证）；
  - ddual LIGHTS +22,250 定谳（值流投影；真根=PD 后首段链四连码债）；
    ddual 座2 入口竖井爬升差/S4 归桶差定谳（RNG 流错位投影类翻案）；
  - tooeasy #097 收口（LXXXI 雕像杀序翻案=死格 no-op；真凶=轨巷 killTileLane 缺
    「蛛网落罐判定掷」）+★**帧维（frx/fry）全 106 槽对拍仪成套**【T20】；
  - tooeasy #105 T165 石笋重样式差定谳（GERunner 转化尾 SQF 级联现树整缺）；
  - waterpark #100 Tile_Cleanup 收官主刀（⑥墙87 extraLiquid 分支整缺）；
  - GFB #97 Micro_Biomes 定谳（真根=箱框 fx/sink 登记序债——当日即被 C 章翻案）。
- **IIIII217 批（XCVI）**：waterpark #105 残 3 格（涂层盈余）定罪收口——
  **waterpark 106 槽满绿（第 26 链口径）**。
- **C·IIII223 批**：★GFB #97「箱框 fx/sink 登记序债」金标直读**翻案**（XCVII 真根定谳
  被否证：IIII220 x86-dmlog=crimson=true 赝世界 vs 金标 golden-gfb-c crimson=false，
  rig 复跑↔金标血统断裂）+三刀 1:1 落盘（箱 flag17 保号臂/轨巷 KillTile 尾液体三臂/
  LifeCrystals 56=false）。
- **IIIII227b 批（CI 续）**：★★**REMIX #98 DelWater「三选一裁决」收口定谳**——
  真根=vanilla `Main.cs:7995 tileSolid[0]=true`（**原版把空气标实心**；「act=1 且
  type=0」残型格对液体不可通行）+岩浆烧除是裸 type 写（cs:1552-1554，保留 act/half/
  slope）；JS 三面差使早退支误成立。三刀 1:1 落盘 LiquidSim.ts；REMIX #98 八通道满绿
  归零，绿带 0..97→0..98。rig 全灭态势下全程零 rig（G2 金标直读+memory 台账+反编译
  闭式推导）。【T18】【事故相关：旧判例「passableLq 语义债」两次证伪翻案】
- **CII·IIII225b 批**：GFB STRK 段过冲回敛定谳（过冲=「1:1 正确刀×既有 Δ−18 流错位」
  的改道级联放大，回敛路=清偿 Δ−18 而非回滚刀 2）+Δ−18 藏身处收窄至 mahogany 树尾。

### 6.6 2026-09-04（末批四链 + rig 世代更替 + 全链复验）
- **CIII·IIII226b 批**：graveyard #97 TrackGenerator 逐列落刀取证批（差面 100% 定域=
  轨段；LTRK 轨账金标直读全重建，LTRK#2 len 943 origin 定位）。
- **CIV·IIIII216b 批**：TileFrame 残余单斑对齐收口（HM L3 残 3,825「单斑」=ALT 回填段
  PlaceWall 帧掷债——vanilla PlaceWall 每次调用尾随 SquareWallFrame+邻 4 组）。
- **CV·IIII106b 批**：REMIX ABRES 台账重建+收官（x86 全量 AddBuriedChest 台账 2264
  attempt/185 受理，三 pass 24 件对 G2 md5 全等=台账即真值）。
- **CVI·IIII100f 批**：GFB mahogany 哑骰窗「绝对计数反演」定谳（**UnifiedRandom Knuth
  减法器逐位确定性，seedArray/inext 全量克隆即可任意回卷**——pass 段起点流状态=纯样本数
  函数）。
- **CW·IIII107 批**：★**REMIX 滚动·仙人掌珊瑚族——#99 归零→一鼓连破 #99..#105，
  REMIX 106 槽【首次满绿】收官**。
- **CX·IIII101d 批**：graveyard #97 TRKLOG 两判据一锤——CIII 伪锚翻案；rig 原生台账
  两刀定谳双规则本体（墓碑 1/8 幽灵门 12,000 掷/门+被巷杀 31 格）。
- **IIIII105b 批**：sparkle 液体域空气语义复验（G2 灭失重建+rig 复刻认证+#49 反演定罪
  坍缩=地牢豁免盒右/下沿 exclusive 一刀）+首差推进 #97。
- **CXI·IIII100g 批**：GFB #97 收官——「iii85 同代 rig」不存在论翻案（**中立性=配方面
  非血统面**）+1,082 多掷真源=mine 预算 off-by-one（+995 掷）——GFB 绿带 0..98。
- **CXII·IIII106c 批**：sparkle #97 收口（DeadMans 候选扫描 gateD 多拒 226/237 单点
  定罪；巨石外环拒收表 vanilla=容器∪{12,665,639}，JS 误加 LIHARD 族）。
- **CXIII·IIII101e 批**：GFB 终清理域收官——#105 八通道满绿归零，**GFB 105/106 行绿+
  唯余 #99 1 格 slope 瞬态**（#100 自愈）；定罪链六主根+两勘误（FinishDrunkGen 调用位
  错位等）。
- **CXIV·IIII108c 批**：truckstop poo 域全面考证复验=**mile8 106 槽满绿认证（rc=0
  首差无）**+tooeasy #32 收敛复验；回归 16 链五点+金标十件套。
- **CXV·IIII107b2 批**：★**c12345「79 红」桶口径仲裁定谳=EVIL 配方漂移伪影**
  （手写 runner 误用 SW_M8_EVIL=0 对 crimson 真值；双极性复现闭合）——**c12345 桶
  未灭失**（72/72 sample md5 ≡ cert TRUTH-MANIFEST）+const 桶重产接居（官方
  `seed_theconstant=1` serverconfig 键=纯解析无 BCrypt 依赖；72/72 ≡ 认证指纹；
  mile8 106 槽 0 红）。【事故：c12345 EVIL 漂移】
- **CXVI·IIII107b 批**：★**winter is coming 冰化世界大件攻坚**——rig 全灭后
  **Mono.Cecil 三点织入复辟**（g-verify 848/848 字节全等认证；★Blt 非 Ble 分支教训）
  +**勘误配方 dotted BCrypt 明文路由 x86 首次打通**（「winteriscoming」bcrypt 复算
  定谳；IIII163「flagless」勘误被再勘误——只对裸管道串成立）+golden-winter G2 建链+
  冰化巨面（110 万格 ice/130 万格 snow/8 千 thin ice）全通道归零=**106 行仅余 3 单格债**。
  【T19】
- **CXVII·IIII109 批**：★**末批秘种子迷你链四链建链认证收官**——
  **arachnophobia 满绿认证（103/103，复跑双证）**；howdidigethere（重掷臂生效实证，
  残差=CheckForGoodTeleportationSpot 精简核非逐句）/abandonedmanors（台账前 15 attempt
  逐格全等，残差=第 5 accept 屋 builder 掷耗差）/wedonteventestforthat（箱插枪实锤
  27 枪/174 箱，残差=PlaceSandTrap 清场邻格 Check2x2 横扫未复刻）三链差异全暴露；
  i109 rig 全套仪具（SW_HOUSELOG 房屋台账+SW_ROLLLOG+SW_KILLWATCH 定点观察）；
  任意种子闸门 4/4 slot0 八通道全绿。
- **§⑦ 09-04 轮换唤醒复验（限流击杀后恢复·树已进三日并行车道增量）**：toadstool
  mile8 复跑 **106 行满绿再证**（09-03 优化批后 worldgen 大幅提速，27s）；回归矩阵
  11 spot+3 mile8+guard4+golden10——g/s22222/fishmox/notraps/c12345/ntb/drunk/celeb/
  toadstool/m 十一链五点全绿、skyblock rc=1=在案桶债指纹逐字同、**const/jagged 全行
  满绿**；**golden10 rc=0 十文件 57/57 全过——world-final-hash 两种子红已被并行车道
  清偿**；★pumpkin 移交新红（#86 Weeds @GlowingMushroomPlants 起 20 行连带，09-02..09-04
  窗口 worldgen 20+ 文件并行落刀为唯一因果增量域）；★仪具纪律补遗：_mile8/_iii81m8
  为报告型仪具 vitest rc 恒 0，**裁决以「★ 8通道首差边界」行与 ✗ 行计数为准**。

---

## 7. 现状（截至编制时点 2026-09-04 晚）

- **认证体系**：x86 真值链（rig=rig-iii133：Steam vanilla 1.4.5.8 exe+Mono.Cecil 三点
  织入，30 分钟可重建；中立性=g-verify 848/848）+ `_mile8`/`_iii81m8` 对拍 harness
  （106 槽×8ch，STRICT_NAMES 名实校验）+ `golden-chain-regen.sh` 复产 SOP + runbook
  （配方/锚点 md5/复现命令）+ `golden-spotcheck/` 绿基线 JSON 入 git。
- **满绿名单**：见 §1.1（22 条；pumpkin 满绿后登记新红）。
- **文档资产**：主对账文档（51k 行）、master-plan（§10 状态表演进至 IIII109）、
  audit-matrix（46 旗标四维）、seed-content-review（T1/T2/T3 三级）、runbook、
  本时间线。
- **master-plan §10 交叉核对**：§10.4（IIII109 状态行）与本时间线 §6.6 一致；
  §10.3 两个同名「IIIII106 批状态行」（重复标题、内容互补）与 §10.1/10.2 的状态快照
  均为历史节点，与各批章一致；§1/§2 的债百分比数字已被 §10 自身声明作废为
  「历史侦察值」——无矛盾。
- **每日连续性**：08-16→09-04 每天均有批章落盘（08-16/17/18/19/20/21/22/23/24/25/26/
  27/28/29/30/31、09-01/02/03/04），无断层；08-29、08-31、09-01 为批章峰值日。

---

## 8. 事故与翻案史（教训汇编，按主题）

### 8.1 基线污染（三次 arm64 事件）
1. **08-17 大尺寸批**：「大尺寸专属根因」=矩阵基线架构错配（arm64 切片）。
2. **08-25 PPPPPPP 切片噪声事故**：OOO 批 rig 直接启动=arm64 切片，其「x86 对拍」
   整批作废（三连实证+翻案）。
3. **08-27 NNNNNNNN→RRRRRRRR arm64 flavor 翻案**：g1458-* 七链全系 arm64 产物；
   「官方双仲裁」实为同 flavor 自洽；五线首差复位旧阵地。遗留资产=
   `varia-g1458-ARM64-TAINTED`（禁作认证基准）。
   → **定律：rig 一律 `arch -x86_64` 强制+lipo -archs 检查；插桩零行为扰动须三跑互同。**

### 8.2 伪影/假象家族
- **08-17 granite −703,003 假案**：定标笔误（VN 表多抄一位）。
- **08-17 FF「JS 多清坡位」**：隔离 rig 伪影（oracle CA 漏激活位）。
- **08-19 house#111**：陈旧基座假债。
- **08-23 UUUUUU 假绿事故**：G2 名表目录清空→"(no dump)" 零差假绿 → mile8 假绿免疫
  （判据：`dump names: 106` 头行+ghost 首差）。
- **08-28 #81 Sunflowers 四链全线伪红（幻影案）**：mile8 槽表数字位未随 II6 插槽迁移；
  修复=名实校验（STRICT_NAMES）+行 tag 带 passName；方法论=「单链红、全线红、标签行
  却绿」先查数字位锚。
- **08-30 IIII78「种子类依赖早发散」**：任意底种 slot0 起红——整体为 dotted 配方伪影
  （第 4 段=旗标位掩码），引擎本就平价。
- **08-31 IIII91 #1 Dunes 交叉回归**：误锚退役 arm64 真值桶。
- **09-01 IIIIII111b JJHook.Snap 插行断链**：钩插在控制流头行与语句体之间吞条件体；
  插桩红线成文。
- **09-01 IIII106b 共享文件覆写事故（二次立案）**；**09-04 CXV c12345「79 红」=
  EVIL 配方漂移伪影**（runner env 单变量错）。
- **09-03 IIIII197「mile8 被并行车道污染」**：如实登记未收口（后由 IIII205 序19 值级
  重放收口）。
- **09-02 IIII163「i78 八链全 flagless」→09-04 CXVI 再勘误**：flagless 只对裸管道串
  成立，dotted 明文路由可达。

### 8.3 vacuous/值流陷阱
- 08-20 起多次「前缀流全等」被当证据（QQQ/IIII48 等）；**08-27 RRRRRRR2 正式判死**、
  09-02 IIII167「掷流值逐位对拍空洞律」实证、08-29 终局宣告 §④-6 成文：
  **fresh-seed 下第 t 个样本值恒=S[t]；有效信号=总长差/段界指纹/受理集差+值级 FNV 账本**。
- 相关仪器律：x86 SW_ROLLWIN 分段标签 K 实载 pcIdx=K+1 的骰（08-29 IIII47）；
  「前缀流判定法」与「同 reseed 掷流窗口」是两根轴。

### 8.4 移植语义误读（代表判例）
- **SmoothSlope/坡面/半砖是一等输入**（08-16 #19）：省略「哈希无关副作用」会改写
  SolidTile 族门禁。
- **框架耗掷**（08-17 #56）：PlaceWall/WallFrame/SquareWallFrame 每次 1~5 掷。
- **覆写=活掷非死分支**（09-02 REMIX #64）：被弃掷值照耗。
- **裸写 type ≠ KillTile**（09-03 air 实心语义）：烧除保留 act/half/slope；
  `tileSolid[0]=true` 使 act=1 type=0 为液体实心格。
- **生成期 vs 运行期语义错窗**（09-01 waterpark #84）：实心门读 `Main.tileSolid`
  可变数组=生成期面板，静态 TILE_DEFS=运行期碰撞。
- **双态/旗标门抄错**（09-02 GFB #38）：`tenth` 浅带门误抄 `!remix` 排除=平行副本陷阱。

### 8.5 环境与流程
- /tmp 清理灭失 12+ 条认证链（08-31 IIII90b）→ **G2 一律居 ~/GoldenChains + runbook
  再生保险**。
- 09-04 rig 全灭 → **Cecil 织入复辟**（Steam vanilla exe 为权威真值本体；
  「从反编译源 dotnet build 复刻」路径退役）。
- 08-24 Steam 升 1.4.5.8 → caves-oracle 源级转录（真值源与 exe 解耦）。
- 08-28 l10n 425 键假缺失（目录歧义+双前缀键误剥）——worldgen 批车受牵连。
- 里程碑链产能条件不可复现性定谳（08-27 NNNNNNNN）：冻结链降级为历史物证。

---

## 9. 未决事项清单（截至 2026-09-04）

### 9.1 链级残差（tile 面）
| 链 | 残差 | 移交/锚 |
| --- | --- | --- |
| pumpkin | **满绿后新红**：#86 Weeds @GlowingMushroomPlants (659,96) A=45/T=91 起 20 行连带 | pumpkin 车道按批章回归义务追因（G2=x86-i78-pumpkin 可复验；09-02..09-04 并行落刀为唯一因果增量域） |
| GFB | #99 1 格 slope 瞬态（#97/#105/#98 均已归零） | CXIII 既账，#100 自愈 |
| winter | 新真值下 3 单格债（#28 T0>10×1 @(1862,1047) 等；09-02 IIII113b 曾达全行满绿 103/103，09-04 CXVI 换 Cecil rig 重产 G2 后登记） | runbook golden-winter |
| tooeasy | **106/106 满绿**（CXXXIII·IIIII156：唯一 W=1 @(495,537) 翻案=东开口臂写门 SolidTile 弱谓词漏四门（格 slope=3,不在椭圆盒,LXVIII「ULP 翻脸」备案证伪）,五门 1:1 一刀;#32 域零差维持） | CXXXIII |
| dontstarve | #065 Moss 单格 deco @(1491,533)+#090 双格 | IIII171 章登记 |
| planetoids | #32 Dungeon 域 ~40 格 | IIII163 章 |
| ddual | 座1 #33 布局域（RM/CSH 净偏移）、座2 腐化草域 (3628,153)、PRH/seat1 尾窗、W 变体墙写位差 | IIIII188/IIIII222 等 |
| graveyard | #97 TrackGenerator 轨道域（CIII/CX 已两刀取证）+血月面 | CX/CIII 章 |
| iamerror | 0..31；#032 Dungeon A=449/T=488/W=0 @(3489,353)=画/家具/陷阱三族非掷谓词债（CXXI 两刀后残差，IIIII152 复跑零漂移） | CXXI/IIIII152 |
| sandy | ~~#76 巨石变体单站链 16 格~~ **满绿**（旧读数=IIIII162 期旧 G2 代际伪影，XXIX 09-04 终局改判；IIIII152 新 G2 复证首差边界「无」） | XXIX 终局改判/IIIII152 |
| howdidigethere | spawn 落点 js≠x86：CheckForGoodTeleportationSpot 逐句移植单刀 | CXVII §⑤-1 |
| abandonedmanors | 第 5 accept 屋 (2846,545) builder 掷耗单窗反演+rolllog 实例过滤 | CXVII §⑤-2 |
| wedonteventestforthat | PlaceSandTrap 清场邻格 Check2x2 横扫清算（修后 24→27 枪应自动归位） | CXVII §⑤-3 |
| sparkle | **满绿 106/106**（F1 #49=IIIII105b 地牢豁免盒 exclusive 刀、F2 #97=CXII gateD 刀均已收口；IIIII152 复跑定谳销账维持，五点仪 _iii152spot 常驻） | IIIII105b/CXII/IIIII152 |
| const（旧 AB 口径） | 已由 CXV 重产升格 A·DUMP 八通道，iii117 期环境债清账 | CXV |

### 9.2 oracle/金标车道
- caves-oracle.cs 液体域（QuickWater/settleWaterAt/LavaCheckQW/烧除级联 PlantCheck）与
  修正后 JS 的 underworld/gems/dungeon 段残差对齐后重产金标转绿（09-03 CI 续移交；
  金标已按新 oracle 重产保留、红名如实登记）。
- 三件套陈账复核：world-final-hash（09-04 golden10 已 57/57 全过=清偿）、caves、shimmer。

### 9.3 运行时/非 tile 面（不在 mile8 裁决范围）
- theConstant：hunger/黑暗/sepia 运行时族（行#4 P2）。
- notTheBees：音乐 86/bgStyle3/钓鱼折半/商人货架/spawner（行#9 P2）。
- rainbow road：液体观感层（彩绘液体 shader/绘制分支）。
- CELEB 润色项（内嵌 infected 支 :19855 等）。
- GFB 组合域叠加语义（activeSecretSeedCount 计数级联）+组合专属尾链。
- skyblock：运行时 lowTiles 普查族/NpcDrops SkyblockIsUp/team 岛集合/`.wld` 写侧 v302 位。
- S0-2③ 文本特殊种子→SetSeedToRandomWithCurrentEvents 语义（存档兼容评估）；
  S0-5 serverconfig 通道（可选，未做）。

### 9.4 工具链/流程
- SW_ROLLLOG 加 `inst==WorldGen.genRand` 过滤+reseed 标记（多实例交叠使全流直差不可读）。
- 主文档自重复块瘦身（§0.2）与批号撞号索引（IIIII48/57/66/84/93/99d/107b 等双章按
  「先落盘者持号」判例并存，建议建章号→车道索引）。
- tools/l10n-custom 目录被并行车道挪走的回收登记（08-29 终局宣告 §⑥）。
- mile8 老数轴作废提醒：II6 插槽后 SLOT_END 数字键已 +1；跨代 JSON md5 仅同 harness
  版本内可比（runbook §3-2）。

---

## 10. 编制自检记录（质量抽检）

1. **抽检 5 批与主文档对照**（随机抽取，逐项核对定罪/修复/mile8/日期）：
   - `#56 CaveWallVariety（08-17）`——§4.2 条目与主文档 :509-540 一致
     （PlaceWall 框架耗掷 5 掷/格、Cecil 闭包注入、828,736−159,069 对账）。
   - `IIII78（08-30）`——§6.1 条目与主文档 :21396-21430 一致（dotted 五段式路由、
     八链 G2、官方 Steam 三方仲裁、早发散立案）。
   - `IIIII115c（09-02）`——§6.4 条目与主文档 :29604 一致（num2=FindLowestCloud()+1
     整缺 cs:15577-15580；carebears 0..41→0..105 满绿；rainforest 同日满绿复核）。
   - `IIIII227b（09-03，CI 续）`——§6.5 条目与主文档 :31583-31629 一致
     （tileSolid[0]=true 三刀、REMIX 0..97→0..98、零 rig 判据、oracle 金标重产处置）。
   - `CXVII·IIII109（09-04）`——§6.6 条目与主文档尾部（IIII109 批四链+§⑦ 复验）一致
     （arachno 103/103、27 枪/174 箱、spawn 重掷/大屋 builder/沙陷阱横扫三根因、golden10 57/57）。
2. **日期连续性**：08-16→09-04 共 20 天逐日核对（§7），无断层；前史期以文档 mtime/
   memory modified 时间戳定日（08-07/08-11/08-12/08-13）。
3. **与 master-plan §10 交叉核对**：§1.1 满绿名单逐条对 §10.0/10.1/10.2/10.3/10.4
   状态行与 runbook §1——skyblock「满绿+桶债判读警示」、pumpkin「满绿+09-04 新红」、
   const「CXV 重产 106 槽 0 红」三处易混淆点均已按最新章定谳标注，无矛盾；
   master-plan §10.3 存在两个同名「IIIII106 批状态行」（内容互补不冲突，已记入 §9.4）。
4. **编制中发现并如实登记的文档问题**：主文档自重复块（§0.2）；批号撞号双章现象
   （§9.4）；满绿链计数口径不一（「第 13/14/15/17/26 条」分属 T1 条数与认证链序两种
   口径，本文一律以链名为准并在 §1.1 旁注口径）。

（完）
