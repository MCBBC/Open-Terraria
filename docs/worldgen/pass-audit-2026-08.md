# 世界生成全量审计总账（2026-08-12 起）

> 触发:用户连续标注「悬空宝石」「神庙木椅」(debug-report-忠实的税收林场 两份),
> 定性为系统性转译缺口。本文件是 Phase 2 逐批深查的 working backlog,
> 权威源 `Terarria1456/`。**每次深查批次完成后更新处置状态列。**

## 一、已修复（Phase 1,2026-08-12）

| 项 | 根因 | 修复 |
|---|---|---|
| 悬空宝石 | `CaveWallsInEnclosedSpaces`(cs:17819) 整 pass 缺失→洞穴零背景墙,晶簇(178,贴墙装饰)全悬空 | 新增 `vanilla/CaveWallsPass.ts`(countTiles/Spread.Wall 1:1+丛林泥墙段),插「苔藓」槽后 |
| 洞穴墙单调 | `CaveWallVariety`(cs:16786) 缺失 | 同文件第二导出,插「瀑布唇缘」与「生命水晶」之间(含 OuterOutline origin +1 行偏移原样保留) |
| 宝石洞被墙压制风险 | GemCaves 顺序偏差(原在 Moss 后近 30 槽) | 前移「宝石洞」独立槽(Moss 前),RNG 流随之对齐原版 64→65→67 |
| 神庙木椅 | TemplePass 配对错位(原版 18→10/14→9/15→12,错抄成 14→10/15→9/18→12)+ 椅横排假设(实竖排) | 配对回正;`FurnitureStyle` 椅音高 38→40(PaddingFix.Y);placeFurn inTable 补 15/139/187/79/90 |
| 地牢家具 3 处错位 | ftype3 书架值贴给烛台;ftype10/11 路灯(24-26)与烛台(22-24)样式互换 | DungeonPass 样式表三列修正 |
| 床 79/浴缸 90 竖排 | Style4x2 族(WrapLimit=2/Multiplier=2)未建模 | FurnitureStyle 新增 `case 79/90: [0, style*36]` |

回归门:`tests/cavewalls.test.ts`(五组结构断言:墙覆盖>30%、晶簇贴墙>50%、神庙三件套帧、宝石矿>500、变体墙出现)。

## 二、缺失 pass 裁决表(108 项 GenPassNameID 对账)

| pass | cs 行 | 状态 | 备注 |
|---|---|---|---|
| CaveWallsInEnclosedSpaces | 17819 | ✅ 已补 | 见上 |
| CaveWallVariety | 16786 | ✅ 已补 | 见上 |
| GravitatingSandCleanup | 15198 | ✅ 已补 | 并发会话同日补(引力沙槽) |
| Skyblock / Jungle(skyblock) / DualDungeons / WavyCaves | — | ⏭️ 有意跳过 | 秘密种子专用,普通世界零掷骰 |
| Oasis | 16327 | ⬜ 待裁 | B2 批 |
| RemoveSurfaceWaterAboveSand | 16295 | ⬜ 待裁 | B2 批 |
| FragileIceOverIceBiomeWater | 16756 | ⬜ 待裁 | B3 批(thin_tile 只读不写) |
| DirtRockWallRunner | 15536 | ⬜ 待裁 | B3 批 |
| UndergroundJungleTrees | 17952 | ⬜ 待裁 | B4 批(丛林地下树) |
| QuickCleanup | 17987 | ⬜ 待裁 | B4 批 |
| Pots 墓碑+巨石堆段 | 18108 部分 | ⬜ 待裁 | B4 批 |
| SpreadingGrass 向日葵+岩浆清理段 | 18349 部分 | ⬜ 待裁 | B4 批 |
| SunflowersPart2 | 20043 | ✅ 已补齐 | 2026-08-13 review（普通种子向日葵唯一来源，缺失=全图零向日葵） |
| JunglePlantsPart2 | 20310 | ✅ 已补齐 | 2026-08-13 review（地表丛林大株植物 233 两分支） |
| MudWallsInJungle | 20963 | ✅ 已补齐 | 2026-08-13 review（丛林表层泥墙→15 + 界扫描） |
| CactusPalmCoral 珊瑚段 | 21115 部分 | ⬜ 待裁 | B5 批 |
| Speleothems 钟乳石段 | 22196 | ✅ 归位 | 2026-08-13 review（捆绑在"宝石系统"槽≈20842 位执行→外提独立槽至 22196 位） |
| TileCleanup / BrokenTrapCleanup / FinalCleanup | 21327/22283/22304 | ⬜ 待裁 | B5 批 |

## 三、顺序偏差(仍存)

| 项 | 现状 | 目标 | 批次 |
|---|---|---|---|
| DirtWallCleanup | 「清理」槽(结构后) | Pyramids(15426) 前 | B3 |
| DemonAndCrimsonAltars | 并入 CorruptionPass(提前约 25 槽) | LivingTreeWalls 后 | B2 |
| ShellPiles | ~~管线末~~ → 并发会话已前移 | SettleLiquids 后 | ✅ |
| GemCaves | ~~宝石系统槽~~ | Moss 前 | ✅ 本日 |
| WebsInSpiderCaves | vanillaBiomes(提前约 40 槽) | DyePlants 后 | B4 |
| Trees/Herbs/GrassPlants 内嵌 surfacePass | 地表矿石/倒木/陷阱前 | 其后 | B4 |
| SpawnPoint | finalize 末尾 | GrassWall 前 | B4 |
| Pots vs Hellforges | 熔炉→瓦罐(注释与代码矛盾) | 原版 Pots(18108)<Hellforges(18298) | B4 |

## 四、近似/未移植标记清单(21 处,vanilla/ 目录 grep 汇总)

BeachPass.ts:245 / TileRunner.ts:99 / IslandHousePass.ts:2 / Spread.ts:78 /
MicroBiomesPass.ts:14,107,110 / LakesPass.ts:16,69,177 / MushroomPass.ts:40 /
SurfaceDecorPasses.ts:12,15,18,121,1255 / CaveHousePass.ts:221 / HalfBrickPass.ts:6,7,9,60,83,154 /
ShiniesPass.ts:103 / HiveSpiderPass.ts:284 / TrapsPass.ts:69 / JunglePass.ts:4 /
TreePass.ts:39 / StructuresPass.ts:2,448
→ 各批次深查时逐项对照原版裁决:改 1:1 / 保留并注明理由。

## 五、深查批次进度(五批全部完成,2026-08-12)

- [x] B1 基础地形(1-15):**2 严重**——①Reset 尾部 3 掷缺失(cs:8211-8213,整条 RNG 流自源头少 3 样本;terrain-oracle/caves-oracle 同漏=金标自洽假阳性,已同步)②Tunnels 沙面判定 id 空间错(原版 53 直传内部表=沙漠化石)。已修+1 低(DirtWallBg 雪 147)。
- [x] B2 生物群系(16-33):**1 严重**(Dungeon 头部 SetupDungeonData 全部掷骰缺失+书架/灯样式骰挪陈设期)+6 中(走廊 cracked 掷序/值 0.166、Jungle 分支方向反、ShroomPatch 半径漏缩放、Corruption 中心 380→500、祭坛缺 oceanDepths 重掷、Lakes 幽灵格)。全部已修。
- [x] B3 结构与宝石(34-56):**8 严重**(Cleanup 邻列掷骰门控、Gems 拒采 64→3、OceanCaves flag 复位、Shimmer 首掷序+预掷、Pyramid 出口隧道条件掷、LifeCrystals 掷序、JungleShrine hutIdx 重掷)+12 中+14 低,共 25 条已全部修复(含 CaveWallsPass 新 pass 复审通过、spreadWall2 实心背面墙补齐)。
- [x] B4 内容装饰(57-96):**2 严重**(Piles pass 近全缺=五子段只剩一段简化版;UnderwaterChests 四重偏差含水箱减半)+14 中+8 低。修复批在途。
- [x] B5 收尾与裁决(97-105):**2 高**(GrowCactus 12%直柱简化 vs 150次邻域成簇语义、TileCleanup pass 基本未移植含滴水石笋/全图清坡)+珊瑚段缺失;缺失 pass 裁决:Stalac(小/高可见,修复批在途)/RemoveSurfaceWaterAboveSand+FragileIce(小,在途)/BrokenTrapCleanup+FinalCleanup+MicroBiomes 四缺项(中)/Oasis+GrowCactus 全量+TileCleanup 全量(大,留下一批)。

## 六、缺口模式(方法论沉淀)

五批 21 严重全部属于四类老毛病,新增 pass/移植时逐类自查:
1. **RNG 流错位**(13/21):漏抄方法尾部无条件掷骰(Reset)、掷骰顺序对调(Jungle/Shimmer/LifeCrystals)、条件掷骰写成无条件(Cleanup)、上限写错(Gems 64→3)、循环条件含掷骰未逐次求值(Pyramid)、循环外声明循环内变量(OceanCaves)、值已在 Reset 掷过又重掷(JungleShrine hutIdx)
2. **id 空间混淆**(2/21):原版 tile id 直传内部 id 表(Tunnels 53→沙漠化石;DirtWallBg 147→熔岩滴;Pots 367/368 互换)
3. **配对错位**(1/21+家具批):type↔style 整体旋转一位(TemplePass;Dungeon ftype3/10/11)
4. **整段缺失**(5/21):pass 或子段漏移植(CaveWalls/Piles 五子段/TileCleanup/Dungeon 头部/UnderwaterChests treasure 段)

## 七、防回归(Phase 3,2026-08-12 收官)

- **终态哈希金标门** `tests/world-final-hash.test.ts`:双种子 generateWorld 终态四数组 FNV 硬断言(基线 tests/golden/world-final-*.json;有意改动后 `UPDATE_GOLDEN=1` 再生并人工确认 1:1)。从此任何管线无意改动被确定性抓住。
- **金标 oracle 同步再生成完成**:terrain 双种子位级全绿;caves 链 27 段全绿至 underworld;corruption 段分歧=另一会话在途调试区(转储 /tmp/js-crdump.txt;嫌疑点:oracle 硬编码 380 vs 原版随机 beachDistance 300-340)。
- **全量回归**:1144 通过;4 失败全部为并发会话辖区(tools/_biohang 诊断工具/caves-checkpoint corruption 段/debug-report hoverRing 新功能)。
- B4/B5 修复批 27/27 落地(含钟乳石/沙上清水/薄冰/蜂巢幼虫四个新管线槽),cavewalls+gem-passes 全绿,cavewalls 全管线 11s 无性能退化。

## 八、遗留批(2026-08-13 全部落地)

- **Batch A**:TileCleanup(清坡/坡接半砖/液体草本/滴水石笋/墙液体/祭坛 232→226)+FinalCleanup(落体柱/散水/岩浆墙/巨石/矿轨清液等 9 子项)+BrokenTrapCleanup(电线 BFS 断网拆除)——三独立文件,19 单测
- **Batch B**:GrowCactus 全量重写(PlantCactus 150 次邻域成簇)+两端珊瑚 81/贝壳 324+中段水盒棕榈+Oasis(PlaceOasis 全量,登记 oasisX/Y/W)
- **Batch C**:MicroBiomes 补 DeadMansChestBiome(死亡之箱全链)/ThinIce 薄冰斑/placeLavaTrap 熔岩陷阱/TrackGenerator 矿轨(完整 1:1,非近似),8 单测
- **接线**:WorldGen.ts 新增「绿洲/仙人掌珊瑚/瓦片清理/断线陷阱清理/终清理」五槽(原版注册序);终态金标已再生成;全量回归 1225 过,8 失败全部为并发会话辖区或负载超时(hive 单独复跑 8/8 绿)

## 九、Batch D 顺序偏差(2026-08-13 处置)

**已归位(3 处)**:
- WebsInSpiderCavesAndHoney(20140):vanillaBiomes 尾(提前约 40 槽)→ 独立「蛛网蜂巢」槽(DyePlants 后、GrassPlants 前)
- Trees(20085)/AlchemyHerbs(20109)/GrassPlants(20232)+GlowingMushroomPlants(20278):从「表面」槽拆出→「栽树」「炼金草药」「地表植物」三槽按注册序归位(GrassWall 与 Vines 之间)
- Pots(18108)↔Hellforges(18298):曾对调,归位(瓦罐先于地狱熔炉)

**保持备案(3 处)**:
- DirtWallCleanup(15310):原版在结构段(Pyramids 等)之前,我方结构全在 vanillaBiomes 单槽内先于「清理」槽运行——归位需拆分 vanillaBiomes 大槽,侵入性高且该区域被多会话频繁编辑,暂不动
- SpawnPoint(19605):finalize 末尾;出生点搜索与 finalize 的幽灵/帧净化强耦合,且搜索后有自定义出生区净空——移动风险大于收益
- **Altars 归位(LivingTreeWalls 后):需 caves-oracle.cs 同步镜像,且 Corruption 段正被另一会话逐段调试,必须等其收口**

另备案:Oasis 下游消费段(pass 98 绿洲棕榈/燕麦/植物 530)、FinalCleanup FillWallHoles/DirtiestBlock 彩蛋、TileCleanup 帧规范化族。

## 十、全仓同类缺陷复审(2026-08-13,世界生成之外)

三路审计(id 空间指纹/渲染层帧表/运行时子系统+测试基线),合计 80+ findings。

### 已修(本日)
- **id 空间×4**:TILE_NO_FAIL 内部/sheet 口径错位(**58 种方块一击秒挖**,Game.ts);金币雨 item id 整体+1(**每次降雨 ×100 通胀**,Game.ts);修剪草 477 直传内部空间成锡板+492 五门缺失(VanillaSpawner);瀑布平台豁免 type!==19(WaterfallRenderer)
- **SceneMetrics×3**:地狱高度带 lavaLine→h-200(跨子系统污染:地狱背景/丛林深度抑制);holy 互减前漏钳位;八音盒/喷泉关态覆写

### 在途(修复代理)
- 渲染批 19 条(手持层 4 高:useStyle1 时段接反/法杖 45°/左向 aim 未镜像/swingNet 缺字段;墙动画帧带 11 类;TileAnim 缺表~60 id;放置端轴向×3;蝙蝠/城镇步进/HB_ADD_H 等)
- 刷怪批 14 条(速率 else-if 链 6 群系差 1.5-2.5 倍/海洋 376 门/猩红 tile 门/Devourer 缺失/史莱姆王链/地下沙漠权重+台账登记)
- 掉落批(提取器三盲区:**大师宠物掉率 100%**/ByCondition 第 6 参/冰模仿怪池丢失+求值器 NotRemixSeedEasymode 等)

### 待下一批(Game.ts/Player.ts 解锁后:渲染批收口即做)
- A2 日夜链:日晷/月晷全链缺失/睡眠 ×5 倍率/旅行商 0.8→0.9/stopEvents 缺四塔压制/taxTimer 不吃 dayRate/鹿角怪雨天生成
- A5 Buff:狼人回复误用 campfireAccum/DoT 相消语义/蜂蜜史莱姆授予链/荆棘被弹幕误触发
- A1 剩余中低 19+7 条(见代理③报告)

### 横切系统性模式(比单条更值得注意)
1. `rng.int(a,b)` 闭区间 vs 原版 `Next(n)` off-by-one 仍在复发(地牢池/僵尸族已实锤)——全仓扫 `rng.int(0, N)` 对应 Next(N)
2. `lavaLine ≡ UnderworldLayer` 语义混淆跨子系统(SceneMetrics+掉落 LivingFlames 同源)
3. remixWorld 专属条款被无条件应用(spawner 强推/NotRemixSeedEasymode)
4. "条件被静默吞掉"家族:提取器类字段/第 6 参/方法实参三盲区——**静默假绿型,最危险**

### 测试基线可信度表(自洽假金标排查结论)
| 基线 | 源头 | 判定 |
|---|---|---|
| golden/wld/*.wld(5 真机) | Steam 1.4.5.6 真机 | **可信**,但 seed-parity 只断言"差异<全格"——真值在手未转硬断言(L2 根治路径) |
| unified-random.json | 反射真 exe | 可信 |
| terrain/caves-oracle | RNG 反射真 + **逻辑手抄** | 半:共同误读→双绿(Reset 尾 3 掷已发生一次);#32 Dungeon 段未转录无裁决 |
| world-final-hash | **TS 自产** | 纯自洽——定位为"变更探测器",与正确性测试分开呈现 |
| caves-chain-1511931452.json | oracle 再生 | **悬空金标**:无测试消费,接进 cases 或删 |
| _gem-dist-audit | console 自产 0 expect | 诊断件非测试门 |

**勘误记录**:记忆「蜂蜜不淹死」与 1456 源码不符(Collision.cs:1415 只排 lava/shimmer)——代码现状正确,记忆已修正(2026-08-13)。

---

## 清零批收官(2026-08-13 午:全部解决,不留遗留或近似)

**四个并行代理 + 主循环快修,全部落地并终验**(tsc 本批文件零错误/定向套件 34-34/terrain·caves 双绿):

- **getGoodWorld(FTW)分支 30+**:EoC 11 分支/WoF 本体+Hoplite(1/180<4只)/BoC×3/双子×9/摧毁者×1.2 加速/Golem×4+火把击碎/邪教徒意外收获/弹 bounce/蜂后。**任务清单三处勘误(以 1456 为准)**:WoF 之眼整段无 g 分支;1.4.5.6 无 jewelBeetleChance 字段;lunar_misc 是 tenthAnniversaryWorld 非 g。
- **管线槽位批**:结构尾 18 调用拆出独立"结构"槽(修 DirtWallCleanup AND Shimmer-before-structures 双顺序);`DirtRockWallRunnerPass`(cs:15536 wall 2→59,探针 18527 格);SpawnPoint 提取为管线槽;world-final 金标再生(11:28)。**后续 11:46 并行会话改 MicroBiomesPass/TrapsPass → 终态门转红=金标门按设计抓到在途编辑,勿再生盖章**。
- **EoW 渲染批**:behindTiles 层(2b' 介于墙与块,46 id 表,WoF 族排除)/专家渲染缩放(13-15×1.05,266/267/134-136/139×1.05)/BGM 类别表触发/世吞分段生成淡入 -42/tick(alpha<85 链门)/运行时探针 20/20。
- **特性缺口六件**:绑缚三人组 105/106/685(1:1 求值序,685 走 spawnBound 占位+BOUND_TOWN_NPC_ID 反查;**附带真修:setPlayerFlags 只传 downedSkeletron 无置位点 → 双键 downed_35**)/setFireFlyChance 三档分布+五字段持久化/拜月石碑重生 delay=86400 随存档+TabletDestroyed 边沿捕获/獾帽双杀/派对蛋糕/Badger 帽/fairy 三 id 583/584/585(原台账 501-503 错)。
- **主循环快修**:wofDrawArea getter 导出+Renderer 精确消费(消"双眼间距反解"近似)/WallOfFlesh.png 白名单/growPalmTree 1456 侧净空 -20 终态+导出去重/v_484 solid:true 经 Main.cs:7413 核实正确。

**备案(无近似,仅结构性或非错位)**:
- King Slime getGoodWorld:原版仅将速度基线换算单位,我方基线未建模该单位→无对应代码可移植,已登记
- 685 绑缚态渲染复用 679 城镇史莱姆帧表(Renderer.BOUND_NPC_SHEET 缺行,该文件本批禁改)——纯视觉差
- 453 骷髅商出生脚底 y 用 (spawnY+1)*TILE 嵌入一格(原支未动,三人组用正确值)
- 并行会话债务(非本批):knockbackResist 语义变更致 scale-stats/bossAI-dd2 两测试红;RandomText.ts 12:01 重构致 random-text 测试 kind:'default' 失配;MicroBiomes/Traps 在途编辑致 world-final-hash 双种子红

---

## 2026-08-13 整体 review（四维度：BossAI / 渲染 / 运行时事件+存档 / 管线槽位）

### 管线维度（主循环自营，全部落地）
- **三个整 pass 补缺**（台账"待裁"清账）：SunflowersPart2(20043)/JunglePlantsPart2(20310)/DirtWallsIntoMudWallsInJungle(20963)，各入独立槽于原版注册位；SpawnStarterNPCs(19830)=十周年专属 NPC 生成，普通种子 no-op，**备案跳过**。
- **两处顺序归位**：SpeleothemsAndGemTrees(22196) 从"宝石系统"槽(≈20842 位)外提至 Lilypads(22131) 后；LihzahrdAltar(21753) 终保从 TemplePass 末尾(≈15911 位)外提至 TileCleanup(21327) 后（对 Pots/Traps/TileCleanup 的祭坛扰动最终回滚）。
- 回归门：`tests/gen-review-tail.test.ts`（种子 42 五断言：向日葵 38 株/233/墙15/祭坛 3×2+226/管线不崩）；金标三门前两绿，world-final 因并行会话 MicroBiomes/Traps 在途编辑维持红（**勿再生**）。

### BossAI 维度（审查代理 + 主循环修复）
- 已修：**underworldLayer 误用 world.lavaLine**（Main.UnderworldLayer 恒 h-200，lavaLine 高约 150 格——spawnWOF 落点/墙扫描带整体上浮）/wofEyeAI expert 加档块(:26236-26245，旧注释以"无 g 分支"误杀真代码)/EoW 舵机 `sameX && sameY`→OR(:52513 四条件跨轴或)/毁灭者 FTW 段数 80→100(:51339)/毁灭者白天离场丢 num18=32 钳与横漂(重构为不 return)/EoC 仆从门距改锚悬浮点−200(:20046)/EoW FTW 段距 62(:52300)/VANILLA_BOSS_IDS 剔除 68·325·327·345·346(原版 SetDefaults 无 boss 位：月事件 Boss 占槽会误播击败/误写 downed)/月事件首杀 SetEventFlagCleared 补全(327→5·345→20 带月别门,灯笼夜预约)/行号勘误两处。
- 登记未修（在途区或需设计决策）：双子低血加速节奏(:26971/:27596)、毁灭者出生淡入 AI_037 链门 128(现为通用 -1/t 近似)、396/397/664 是否补入 boss 集。

### 渲染维度（审查代理，只读——Renderer.ts 热区）
- **getGoodAdjustments 整族缺失**（NPC.cs:17874-18027：FTW 体型/血防伤/渲染缩放且扩盒）——最大单一缺口，横跨 ScaleStats/Enemy/Renderer，登记为下批首选。
- 其余登记：南瓜王 327 披风/双臂(:22499)/骷髅王 BoneArm3(:22571)/behindTiles 表 44/46(622/623 json 缺)/月总层序三方拆分/石巨人拳链 FTW +8(:22625)/食人怪藤蔓强制亮彩(:22467)/693 闪电塔光环(:22676)。
- **已核实无误**（逐项实读）：expertRenderScale 两档完整(1456 仅 4 处 scale*=,Master 无第三档,771 不存在)/无双乘/DrawWoFBody 逐项/EoW 淡入不影响受击/behindTiles 来源=SetDefaults 直读正确。

### 运行时事件维度（审查代理，只读——Game.ts/VanillaSpawner 热区）
- 已修（主循环）：FallenLogDestroyed 延迟到清格后重扫(原版 KillTile 尾部)/freeCake 台词挪 GetChat 头部压一切分支(优先级反了)/anyDanger 补 DangerThatPreventsOtherDangers{517,422,507,493,399,13,14,15}/setFireFlyChance 读档重掷(WF:770)/spawnTablet·spawnFairy 双派 id 死码/RuntimeEvents 头注 RNG 流勘误(1456 genRand≡Main.rand 同一条)。
- 登记未修：fireFlyFriendly/Multiple 三消费点(:2321/:4421/:5768)/地下仙女链 fairyLog(:5730)/WldParser 导入丢 cultistDelay(并行会话在途)/PlayerLOS 屏幕×1.2 矩形近似(现为 ±50×±40 硬编码盒)/RollLuck(20) 运气缩放。
- **placeBoundRescueNpcs 已移除（2026-08-13 用户裁决：对齐原版，实证链）**：① WorldGen SpawnStarterNPCs(cs:19830-20041) 普通种子分支只 NewNPC(22) 向导（:20037-20041），无任何 bound NPC；② bound NPC 唯一来源 = NPC.Spawner 链（三人组 :1994-2008/造型师 :1576/高尔夫 :1600/机械师 :2563/税务员 :4777）；③ Spawner.SpawnNPC(:5146)=普通 NewNPC，bound 形态即类型本体。同步收口：蜘蛛巢 354 分支按 :1579-1581 补齐（曾"注释保留"跳过）/589 链补 !savedGolfer 门+spawnBound 占位(json 缺条目)/123 链补 !savedMech 门/trySpawnEnemy 转换扩为六路(105/106/123/354/589/685 → bound TownNPC；534 走净化粉链)/入驻轮困难模式巫师补放同移除。回归 `tests/bound-chains-vanilla.test.ts`（354/589/105/123 四链命中+saved 旗关门）。
- **断链复查（用户要求全链确认）抓到并修一个真断点**：applyPowder 税务员分支只扫 npcs 桶 bound TownNPC——生成期放置移除后 534 以敌怪掷出，弹粉永远扫不到=税务员链断。已补敌怪桶 534→Transform(441)（:81850 换型+保血量比例+底边对齐+homeless+UpdateSavedStates 写旗）。**净化粉 66/67/2886 树妖商店全在（shop 20 三支），旧注"未进货"过时**。六路转换抽为 `Game.trySpawnBoundTownNpc`。
- **入驻条件表全量对齐（2026-08-13 下午二轮）**：Main.cs UpdateTime_SpawnTownNPCs(:65021-65570) 逐条 diff——修 santa 漏 downedFrost 门（曾 xMas 即到）/补 angler 369 重生门/补 tavernkeep 550 全链（spawner :1565 醉酒酒保 579[ReadyToFindBartender=downedBoss2] + 触碰 Transform :19806 + 入驻 :65283，此前整链缺失=酒馆老板不可达）/造型师优先位归位裁缝后/史莱姆第二轮按 :65557-65574 原序重排/公主门补 angler+tavernkeep（24 全在场）/派对女孩补 unlockedPartyGirlSpawn 直通。登记：兔 656/猫 637/狗 638（许可证商店未实装）、松露人地表蘑菇房特判（CheckSpecialTownNPCSpawningConditions :4919，按全域找房既有备案）、spawner 690/244 块位置与 vanilla 有既有序差（酒保分支插在 spider 前近 vanilla 位，1/80 门主导影响边缘）。
- **入驻条件补完批（2026-08-13 傍晚"继续处理完整"）**——备案缺口清四项：
  ① **宠物三只全链**（兔 656/猫 637/狗 638）：许可证物品注册（4830 狗/4910 兔——★兔证是 4910 非 4831！4831-4837 是捕捉小动物笼）+ 使用语义（Player.cs:44730 LicenseOrExchangePet：首用置 bought* 旗/在场重用换皮备案/缺席不消耗）+ 动物学家进货（Chest.cs:3265-3280：4829 无门/4830 图鉴≥25%/4910 ≥45%，shopstock 手工补条+bestiary25/45 门）+ 优先链 ：65567-65574 序（彩虹后 兔→猫→狗）+ IsTownPet 免房流浪生成（NPCID.cs:4444 宠物+全史莱姆）；json 补 637/638/656 条目（帧数取 Main.cs:65994 npcFrameCount 权威表 28/28/27）。
  ② **unlocked* 永久旗族**（WorldGen.cs:5510-5560 到访即置：商人/护士/军火/爆破/染料/松露/派对/公主/酷史莱姆）——五个 SpawnAllowed_* 首位查旗 + 到访写旗：此前商人到访后花光钱死亡=永不回归，已修。
  ③ **松露人蘑菇房特判**（CheckSpecialTownNPCSpawningConditions :4919-4946）：房须在地表+蘑菇族 tile≥100（MushroomTileThreshold）——替代既有"全域找房"备案。
  ④ 酒保链（上批）+ 本批探针实证其死亡重生门工作正常。
  探针扩到 33 断言全 PASS（⑪ unlocked 直通双向/⑫ bestiary 门恒等/⑬ boughtCat→免房入驻）。**测试场景教训**：优先链一周期只放一人——验证低优先级条目（宠物）须预置全部高优先级 NPC 在场，且注意前段断言的副作用（杀酒保关公主门会让酒保重生抢先）。
- **全链 Game 级 e2e**（`scripts/_boundchain-e2e.mjs`，28/28 PASS）：①applyPowder 敌怪 534 转化+旗 ②六路转换+唯一门+普通怪不受扰 ③解救写旗后 3000 掷链绝迹 ④真 PowderProj(10) 飞过 534 实际转化 ⑤存档快照 bound 标往返。
- **已核实无误**：CultistRitual 全文/cultistDelay 存档五路(唯一缺口=wld 导入路)/仙女事件主体/獾帽/freeCake 生命周期/绑缚三人组链与门序/无重复挂载。

### 横向备注
- 血月 roll 邻位 `player.maxHp > 120` 用了含临时加成的 maxHp（原版 statLifeMax 永久上限）——旧伤非本批，报备。

### 遗留清账批二（2026-08-13 傍晚"继续"，安静区四件落地）
- **萤火虫成群附加**（fireFlyMultiple 消费，:2327-2344/:4419-4433/:5767-2782）：主只后四向各 1/multiple 独立掷——新增 spawner 侧信道 `pendingCritterExtras` + Game 落位段消费（此前三处恒单只，"API 限制"备案全核销）。
- **地下仙女链**（:3524-3532 整支缺失）：fairyLog（扫倒木置位，MysticLogFairiesEvent.cs:181-183→world.fairyLog 运行时位）+ RollLuck(500[十周年 250]·hardMode×1.66) + 深度窗 + AnyHelpfulFairies 门（:90885，Game 每周期喂 fairyHelpfulActive）→ 583-585 随机、ai2=2。回归 tests/firefly-fairy.test.ts。
- **三人组 RollLuck(20)**（:1996-2008 原文是运气缩放非平掷）：N(20)→rollLuck。
- **WldParser 导入丢 cultistDelay**（WF:2185-2192）：捕获→WldImport SaveData【顶层】字段（非 header 内——坑）→loadSaveData 消费（:333 原已就绪）。
- 仍登记：getGoodAdjustments 整族（ScaleStats/Enemy/Game 15:15-15:25 仍被并行会话改，本批避让）、PlayerLOS 屏幕矩形（Game.ts 热）、渲染六小项（Renderer.ts 热）、双子低血加速、毁灭者 AI_037 淡入链门、spawner 690/244 序差。

### 遗留清账批三（2026-08-13 晚"继续补齐"）
- **双子阶段三低血加速**（NPC.cs:26971-26990 雷眼/:27598-27612 魔眼同表）：弹幕节奏由固定节拍（aiT%180/%8）改为血量阶梯累积器——每 tick +1，<75%/<50%/<25% 各再 +1、<10% 再 +2（满血 1×、濒死 6×），蓄满（雷眼 180/魔眼 8）且视线可达清零发射；补魔眼火焰音（:27593-27603 localAI[2] 每 22t Item34，随发射帧近似）。a-batch4 28/28 绿。
- 仍登记：getGoodAdjustments 整族（ScaleStats/Enemy/Game 持续被并行会话占用）、PlayerLOS 屏幕矩形、渲染六小项（Renderer 热）、毁灭者 AI_037 淡入链门（Enemy.ts 占用）、spawner 690/244 序差。

### 状态（2026-08-13 16:15"继续补齐"轮）
- 目标文件全部处于并行会话活跃编辑窗口：Game.ts 16:14（1 分钟前）/Enemy.ts 16:11/Renderer.ts 16:01/ScaleStats.ts 15:15——剩余五项（getGoodAdjustments/PlayerLOS/渲染六小项/毁灭者淡入/spawner 序差）全部落在这些文件内，按"错峰编辑"纪律本批不动，待冷却后收尾。

### 遗留清账批四（2026-08-13 17:0x"继续吧"重勘轮）
- **重勘结论**：五项全部仍在（getGoodAdjustments 零命中/PlayerLOS 仍 ±50×±40/渲染六项零命中/毁灭者仍通用渐显/690 块错位）。
- **690 块已归位**（vanilla :1478 链位 = 入侵块后、酒保/蜘蛛巢前，纯挪位 757 字节，逻辑不变）。lategame 17/17 绿；dungeon-spawn 的失败为并行会话 DungeonPass.ts:420 `isDW` 声明序在途错误，与本次无关。
- **勘误重分类**：244 块非"位置序差"而是**整支缺失**（落脚微光 tile 的小动物链 :1490-1563：水→金金鱼 592/金鱼 55、深→448/357、侏儒 624 timeLeft×10、金小动物 443/539 RollLuck、节日 303/337/540、299/538、兔 46）；另 dual-dungeon 入侵支（:1484 → 82/316）也缺失——登记待补。
- 仍登记：getGoodAdjustments 整族、PlayerLOS、渲染六小项、毁灭者淡入、244 微光小动物链、dual-dungeon 支。

### 遗留清账批五（2026-08-13 17:1x，解除温度闸）
- **PlayerLOS 屏幕矩形落地**：Game.ts 两处 playerLOS（cultist/fairy 宿主）由 ±50×±40 格硬编码盒改为原版 WorldGen.cs:69500-69515 真义——点 16×16 矩形 ∩ 玩家为中心 `视口×1.2` 矩形（camera.viewW/H÷zoom×0.6+8 半径）。27/27 绿。
- 用户解除冷却等待 → 后续批直接写热文件（编辑前重读、冲突以 Edit 精确匹配兜底）。
- 仍登记：getGoodAdjustments（旗舰，下轮整块）、渲染六小项、毁灭者淡入、244 微光链、dual-dungeon 支。

### 收敛收口（2026-08-13 17:2x"直到收敛"轮）
- **世界生成复活**：并行会话 DungeonPass 重构的 TDZ 声明序错（isDW/typAt 晚声明早执行）由本侧上移 const 助手簇修复先行解堵，其会话随后续完重构——dungeon-spawn/firefly-fairy 等全部生成类测试恢复。**终扫 60/60 全绿**。
- 交接清单最终版（全部带行号可实施）：①getGoodAdjustments 整族(NPC.cs:17874-18027，扩盒语义)；②渲染六小项；③毁灭者淡入 AI_037；④244 微光小动物链(:1490-1563)+dual-dungeon 支(:1484)。世界生成阻塞已消除。

### 遗留清账批六（2026-08-13 17:5x，新会话"继续收尾遗留四项"轮①）
- **getGoodAdjustments 整族落地**（交接清单①核销）：ScaleStats.applySeedAdjustments
  （zenith :17774-17777 → getGood :17874-18027 → tenthAnniversary :17795-17863 else-if 互斥，
  全部先于 ScaleStats :17791）+ Enemy.fromVanilla 接线（ss 输入用调整值/扩盒/渲染乘区）。
  - 数据表全按 :17874-18027 原文（非计划表转抄）：39-41 是 `scale=1.1f` 赋值非乘法+remix
    ×1.2 子分支；245-248 带 canDisplayBuffs=false（249 不带）；**else 提前 return=扩盒只对
    命中分支生效**；十周年函数**无 else-return=扩盒无条件**（未列族 s≠1 二次乘盒是原版
    怪癖，史莱姆王 50：122→152，已照抄）。
  - 扩盒公式两级 (int) 截断：`(int)((int)(w0×s0) × scaleNew)`——s≠1 族（113/114 s=1.2、
    134-136 s=1.25）真实二次乘（113 FTW 盒=93）；渲染乘区走 vanillaScale=scaleNew/s0
    自动进 Renderer :2213；VanillaSpawner netID 覆写改相乘（原版 SetDefaultsFromNetId→
    SetDefaults(WithScale) 链 sizeScale 赋值后 getGood 再乘；netID 基类型表与两列表零交集，
    今日恒等）。
  - defDamage 快照在 getGood **前**（:17749-17751）→ baseDamage 保持未调基值（266 FTW
    baseDamage=30、def.damage=(int)(30×1.2)=36 吃专家乘区）。
  - 回归 tests/scale-stats.test.ts 第 12 节 7 断言（245/266/113/39-41/zenith/互斥+怪癖/
    非种子世界恒等）48/48 绿。
  - 备案：SetDefaults 入口 FTW sizeScaleOverride 膨胀 `(o+o²)/2`（:8362-8366，本仓
    fromVanilla 无 scale 参数路径）；图鉴假人还原（:18020-18023/:17856-17859）；
    canDisplayBuffs（本仓无 NPC buff 图标渲染）；netID 覆写族的 anniversary 二次乘盒
    （vanilla `trunc(trunc(w0×o)×o)`，spawner netID 盒既有语义未动）。
- 顺带修复：并行会话在 Enemy.ts:135-139 写 VANILLA_BOSS_IDS 注释时块注释体内出现
  `**/` 序列提前终止注释 → 全 Enemy 引用测试转译炸（esbuild），改反引号强调记号解堵。
- **本批归属外的红灯**（勿动勿归属本批）：firefly-fairy（并行 17:48 编辑 VanillaSpawner
  在途 RNG 序变化）、caves-checkpoint/world-final-hash/matrixcmp/hive（DungeonPass 17:47
  在途）、station-remaining/place-backfill/world-store/debug-tools（物品/存储/玩家域并行批）。
- 仍登记：渲染六小项、毁灭者淡入、244 微光链、dual-dungeon 支。

### 遗留清账批七（同轮②）：毁灭者链门淡入落地
- **AI_037 淡入 1:1**（交接清单③核销）：destroyerAI 头循环逐段执行 :50162-50182——
  头 134 恒过 / 段 135/136 须前段 spawnAlpha<128（链式传播，128 非 85 勿抄 EoW 门）→
  门内 alpha≠0 时 2 颗 182 红尘（贴图采样 (255,33,34)→#FF2122，NewDust alpha100/
  scale2/noGravity+noLight）→ 无条件 -42 钳 0。fromVanilla 侧 134-136 保持原版 255
  初值、不再置通用 alphaFade（通用 -1/t 近似退役）；渲染直读 1-spawnAlpha/255 无需改。
- 原版每段独立跑 AI_037、本仓段链由头驱动 → 头先段后循环（与 whoAmI 序一致）。
- 回归 a-batch4 4b 节 2 断言（初值/链传播时序/40t 全链现身）78/78 绿。
- 仍登记：渲染六小项、244 微光链、dual-dungeon 支。

### 遗留清账批八（同轮③）：渲染六小项四实装二登记
- **①327 披风 + 328 双臂实装**（:22499-22542）：drawPumpkingCloak（锚=中心+80Y、
  PumpkingCloak 166×630 五帧行=localAI[1]、origin=(W/2,帧高/2)）+ drawPumpkingArm
  （与骷髅王手同构两段 IK，目标带 -30 偏移、PumpkingArm 整幅）；moon_events 导出
  localAIOf 只读出口（各 AI 文件 localAI 是独立 WeakMap——勿跨文件直读字段）。
- **②36 二阶段 BoneArm3 实装**（:22571-22578）：门=master.ai3===1。**全链考据**：
  原版手 localAI[3] 每 tick 镜像头 ai[3]（:22304），头 ai[3] 唯一置位=Red Hat
  彩蛋生成（SpawnSkeletron :81269-81271 redHatMode）——Red Hat 族（35/36/32/33，
  :67282-67294）生成本仓未建模→备案；渲染按 master.ai3 直读（与镜像等值）。
  Arm_Bone_3(28×98) 按 BoneArm(26×98) rect/origin 绘制（原版两分支同用 :22575）。
- **④石巨人拳链 FTW +8Y 实装**（:22625-22628）：drawGolemFistChain 循环内重导
  目标后 `if (getGoodWorld) dy += 8`（首段推导无此偏移——与原版循环结构一致）。
- **⑤259/260 茎蔓强制亮彩实装**（:22462-22477）：原版整链【单次】采样锚点光照
  取下限 (max(R,100),max(G,150),B=255)。主 pass 跳过该族，新增 drawBrightVines
  在 compositeLight【后】绘制（7c 钩子）——全屏乘光会压掉下限色，必须后置；
  逐敌 scratch source-atop 染色，段循环与主 pass 同式（step12/stop20）。
  探针 _vinebright-probe 10/10：零光照直调走廊仍有像素、下限色 G>R 特征成立、
  披风/臂骨像素俱在（327 悬浮 AI 会带离采样窗——采样前传送复位）。
- **③396/397 拉入 398 同层**：登记偏差（CacheNPCDraws :37512-37582 的缓存层
  语义，本仓逐实体绘制无缓存层；如需再攻时按"登记或实现"计划默认登记）。
- **⑥693 闪电塔光环**：登记——NPC 693 全仓无生成路径（DD2 T3 电塔实体未实装），
  渲染实装即死代码；Extra_289 公式已考据在案（:22676-22719：localAI[0] 起始
  0-60 淡入 / 末期旋转加速、Extra_289 at npc.Top）待实装时直接转录。
- 观察（非本批）：探针中深层洞穴呈 teal 环境底色（[106,146,190]）——光照引擎
  可能有环境底光或采样区矿水残留，与原版纯黑洞穴行为待专项核对。
- 仍登记：244 微光链、dual-dungeon 支。

### 遗留清账批九（同轮④）：244 微光小动物链 + dual-dungeon 支落地（交接清单清空）
- **微光墙落脚小动物链**（NPC.cs:1495-1560）：`num`=落脚【上格墙】（:1188-1193：
  wall(x,y-1)，y-2/y 任一为 244 也判微光）→ wall 244=Shimmer 墙（TileID 244 是
  BubbleMachine——台账旧称"微光 tile"实为墙 id，勿混）。!remixWorld 门。全表 1:1：
  水→RollLuck(400)金金鱼592:金鱼55 / 地下(y>worldSurface)→金蛙447:蛙300→
  359→金鼠448→鼠357（Next(3)==0 终段 1/3 轮落空=原版可无产出）/ 地表→侏儒 624
  （RollLuck(1+gnomeChance/10)、GetGnomeChance 基档10、timeLeft×10→despawnTimer
  7500）→金鸟443→金松鼠539→万圣303→圣诞337→派对540→299/538→兜底兔46。
  goldCritterChance=400（NPC.cs:5976）；skyblock lowTiles 子档备案。
- **dual-dungeon 越界支**（:1482-1494）：tresspassing && RollBadLuck(15) → hardMode
  82:316。全前置系统补齐：Player.insideUnbreakableWalls（UnbreakableWallScan.cs
  8 向射线×250 格+5 位环移封闭判定；Player.cs:28125-28141 门=dualDungeonsSeed
  （getfixedboi）+20t 冷却/256px 重扫）+ DangerousDungeonCurse.cs 双档位表
  （needs=区档 Temple5/Hallow4/Dungeon3/Jungle2/Evil1；can=进度档 mechAny|QueenSlime5/
  downedBoss3|hardMode4/QueenBee3/downedBoss2 2/SlimeKing|Boss1 1）——Game 侧
  比较经 setPlayerFlags 传入；spawner 链位=690 块后酒保前（与原版同序）。
  ★备案：LineScan 的 wallColor()>=16 分层色阶门未建模（墙 350 即命中，越界
  判定略偏宽，外部进度档比较仍把关）。
- 回归 tests/shimmer-spawn-chain.test.ts 4 断言（地下/水/地表+侏儒 despawnTimer/
  越界 316 计数）全绿；dungeon-spawn/eow-despawn/house-spawn/jungle/snow/
  spawn-friendly-cycle/spawn-progression-gates/a-batch4/bound-chains 全绿。
- **交接清单四项全部核销**：getGoodAdjustments/毁灭者淡入/渲染六小项/244+dual。
  本会话遗留红灯全部归属并行在途（DungeonPass/VanillaSpawner 编辑窗口+物品/
  存储域批次），无未归属断链。

### 用户报障修复（2026-08-17）：老人诅咒链杀王后复活
- **现象**：地牢门口老人"诅咒"变骷髅王后，老人没有消失（杀掉 Boss 后仍在门口）。
- **根因**：击杀记账链写 `downed_${vanillaId}`（骷髅王 → **downed_35**，Game.ts:4050），
  从不写 `downedSkeletron`；而五处消费门只查 `downedSkeletron`（恒 undefined）——
  boss 结束块 `!downedSkeletron` 成立 → **杀王同帧 maybeRespawnOldMan 在门口重建老人**
  （读档两处同病复活；地牢砖挖掘门同病误锁）。:3971/:12673 等处早已是双键惯例，
  五处漏改。
- **修复**：新增 `Game.skeletronDowned()` 双键助手（downedSkeletron||downed_35）统一
  五门（载入×2 / 重生门 / boss 结束门 / 挖墙门）；boss 结束块补"王已败 → 在场老人
  全灭"（对位原版老人 AI 每帧 downedBoss3 → ai[3]=1 自灭，NPC.cs:53754-53760——
  覆盖非诅咒途径（裁缝巫毒娃娃 eq.killClothier :12396）杀王时在场的老人）。
- 原版语义复核：SpawnSkeletron(:81216-81273) 对老人置 ai[3]=1（非直接删）→ 下一
  AI tick life=-1+HitEffect 自灭（:53743-53756，37/54 伴 SoundID 15 咆哮）；本仓
  诅咒路径 dead=true+压缩清扫等价（咆哮归 Boss 唤醒）。
- 探针 _oldman-curse-probe 11/11：诅咒当帧消失+召 35 / 真伤击杀记账 downed_35 /
  杀王后不复活 / 旧键存档同样关门 / 离场重生语义保留。
- **教训**：downed 旗标键名有两套（downed_<id> 新链 / 语义驼峰旧档），**新消费点一律
  双键或走助手**——单键门在"写读异键"下静默恒 false/true。

### 用户问询引出修复（2026-08-17）：光芒药水与手持光源双源并存
- **问**：光芒药水+手持发光物谁优先/是否叠加？
- **原版语义**（三处实读）：光芒 buff 11 中心格 AddLight(0.8,0.95,1.0)（Player.cs:
  9687-9690，UpdateBuffs 无条件）；手持火把在手部位移格（:49093-49107 direction==-
  1→X-12/else X+6、Y-14）AddLight(TorchID 色)；引擎 ApplyPerFrameLights **逐通道
  Vector3.Max**（LightingEngine.cs:205-220）——**不叠加、无优先级，同格取各通道
  最大值**（药水偏蓝/火把偏黄，火把 R 更高、药水 B 更高→同格混合偏白；异格则
  双亮种子、范围略宽）。
- **本仓旧偏差两处**：①`!heldRGB &&` 优先链（持火把时药水完全不发光）；②光芒
  亮度误值 1.3/1.3/1.3（比一切火把亮，来源不明的错值+错行号注）。
- **修复**：LightingEngine 新增 buffLights 槽（与 heldLight 并存独立喂入，引擎
  侧 :744 max 合并早已有之）；Game 侧光芒 (0.8,0.95,1.0)/狱火 (0.65,0.4,0.1)
  无条件发射 + 手持灯改手部位移格；DebugReport 报 buffLights；Buffs.ts 注释勘误。
  回归 tile-light-specials/buffs/buff-r1 34/34 绿。

### review 追修（2026-08-17 光芒双源批复核）
- **手位公式两处纠偏**（探针钉住）：①火把族 X 偏移=±12 **对称**（:49127 右向
  +12——+6 是尘粒位误抄）；非火把族（蜡烛/148/5322/4952/荧光棒族 282/286/
  3112/3002/4776/5643）=−16/+6（:49153/:49175/:49288 等逐 case 实读）。
  ②Y 完整链=idle itemLocation（:50387-50389 默认分支 X=cx−2·dir / Y=cy−
  itemFrame.H/2）+各 case −14——帧高实测（Item_N.png）：火把族16/蜡烛·148·
  5322=20/3002=18/4952=40 → 光位格=(cx∓10~14, cy−22~34)。
- **5643 迪斯科荧光棒**：原版=DiscoR/G/B÷255 连续渐变（:49390-49410），旧近似
  6 档跳变已废，改同源 clock.discoColor()。
- 全族 case 出处补核：282(0.7,1,0.8)/3002(1.05,0.95,0.55)/3112(1,0.6,0.85)/
  4776(0.9,0.35,1)逐值对上；4776 原版另有 FloodFillTile 4.5 穿墙扩散
  （:49395-49400，同 proj 870 机制）——登记未接（held 侧 floodfill）。
- 探针 _shinelight-probe 10/10：双源并存（held@手位格+buff@中心格相邻两格，
  与原版"双亮种子"同象）/湿火把门/水炬/过期清槽/引擎 max 合并。
- 回归 64/64 绿；tsc 干净。

### 用户报障处理（2026-08-17）：树冠摆动冠-干接缝微缝
- **原版核查**（TileDrawing.DrawTrees :8184-8460 全读）：无任何接缝专项处理——
  密封面完全来自公式本身：冠 `position=(x*16+8, y*16+16)` 底中锚 + sway 偏移
  (2s, 2|s|)（**下压**）+ 绕底中旋转 0.08s。数学上干中带 ±25px 内旋转上抬
  (0.08·|s|·u) 恒小于下压 2|s|——中带永覆盖；三 case（顶冠/左右枝）锚点、
  origin、偏移、旋转本仓全部逐项一致（GetWindCycle :7800 亦 1:1）。
- **实证**（_treecrown-seam-probe）：草/雪/猩红/丛林/腐化五族 × 48 帧全风摆
  周期 × 6 亚像素相机相位 × zoom 2/1.25 × DPR 1/2——冠-干交界全透明行与
  半透明缝线检测**零命中**（干顶件 (88,*) 列美术顶 16px 全宽实心亦核对）。
- **仍可能的成缝机制与本仓修复**：全仓 `imageSmoothingEnabled=false`（最近邻）
  下，逐帧重绘的旋转贴图边缘会"整像素跳脱"（DPR=2 Retina / 特定小数对齐
  高发，探针相位矩阵难以穷举）——原版 XNA SpriteBatch 为**线性采样**（边缘
  柔化但永不丢像素）。已改：风摆图层绘制期间开 imageSmoothingEnabled=true
  （XNA 同构），静态 chunk/tile 路径保持最近邻。
- **顺带修复（同审计发现）**：神圣树 style 3 表（738×142 = 9 帧 80×140，出参
  h=140 :63011）被 treeTopSize 的 floor(w/3)−2 推导成 244×140 三联冠——按
  原版出参表加例外档（3:[80,140] / 19:[120,140]）+ 神圣 i%3 变体帧推进
  （case 109 :63026-63033，帧 +3/+6 用满 9 帧）。
- 登记：枝-干楔形缝（旋转 ±0.087rad 时枝基边缘 ±1.7px 楔口）原版同样存在
  （无补偿项），1:1 保留；style 15/20/21 多行帧表 crownStyleFor 不可达，未接。

### 用户报障二轮（2026-08-17 下午）：无风静止细缝 + 树高相关
- **用户报告时点（09:01）早于当日最近邻→线性采样修复**——症状主机制与前判一致：
  GetWindCycle 的 cos 项使摆动**永不为零**（无风时残余振幅 ~0.04×0.08≈±0.003rad），
  旧全局最近邻采样把该微旋的冠底边缘变成间歇性整像素跳脱（DPR2 高发）=
  "无风也有极小细缝/偶尔出现"。
- **用户世界复现**（debug 报告 seed 12345 **小型** 4200×1200——曾误判中型）：
  玩家 (2068,232) 旁即 GrowEpicTree 巨型树群（h=20-24，间距 4 列冠冠重叠）——
  "越高的树越出现"实为巨型树冠-干交界线更长更醒目 + 该林区全为巨树。
- 干顶件随机帧（(0,22)/(66,66)/(110,110) 等）经核为**原版行为**（GrowTree
  :29983-30395 与 EpicTree :27405 同构：marker 写在 j-num2 覆盖强制顶件，
  视觉干顶=j-num2+1 吃随机件——vanilla 同样如此，非 bug）。
- 修复后（风摆层线性采样）在用户同世界同机位复测：接缝区密合；探针
  _treeseed-repro（含用户视角截图）留档。
- 探针工程注：newWorld 直调走主线程生成阻塞 CDP（protocolTimeout），UI 路径
  才走 worker——复现世界一律走 UI（种子输入+点"小"档）。

### 用户报障三轮（2026-08-17 晚）：线性采样回退 + 单树解剖台
- **线性采样已回退**（用户实测冠糊化=负优化；像素风全层回最近邻）。接缝未消，
  采样机制论被证伪（线性下缝仍在 → 非丢像素机制）。
- 复核排除项：干件顶 5 行全 24 件 100% 实心（静止穿透缝几何不可能）；Tree_Tops
  帧切片/素材与原版逐字节一致；chunk 烘焙与 overlay 绘制路径无双重/缺失。
- **交付 public/tree-inspect.html 单树解剖台**：真实渲染代码（drawTreeCell 干/
  冠双路径 + chunk 烘焙同构开关 + getWindCycle 同源摆动），预设 矮/中(用户世界
  实例首件 44,110)/高/巨(EpicTree) 四档，风况 静止/无风微摆/强风 + 相位滑杆 +
  空格暂停，**用户点标空像素（红）+ 自动透明行检测（黄）+ 一键导出 JSON**。
  冒烟测试过（渲染/导出/零业务错）。等用户标注回传精确定位。

### 用户报障四轮收官（2026-08-18）：chunk 拼装非整数 zoom 接缝（真根因）
- **症状链**：树冠-干交界偶发细缝（无风也有）+ 仙人掌柱同款 + "解剖台里没问题"。
- **根因**：chunk 拼装旧公式在世界变换内 `drawImage(chunk, cx*256, cy*256, 257, 257)`
  ——zoom=1.25 默认档 256×1.25=320 恰整除从未暴露；用户自调 **1.27 → 325.12
  设备像素**，各 chunk 落小数像素、独立最近邻采样在 chunk 边缘产生周期性 1px
  透明缝。跨 chunk 行的大物件（冠 80×80/仙人掌柱）交界线最醒目；单画布路径
  （解剖台）无此结构故测不出——A/B 实锤：同数据旧公式 16/16 帧缝、单画布零。
- **修复**：Renderer drawChunkGrid('wall'|'tile')——退出缩放变换，逐 chunk 取整
  设备矩形（xd1−xd0+1 保底 1px 重叠），任意 zoom 下 chunk 边缘恒整数像素。
- **验证**：用户林区数据（10 冠标记）修复后无风全零；真实游戏 5 树 × 无风/强风
  × 1.27× × DPR2 × 4 亚像素相机相位全零（_ingame-chunkfix）。
- 解剖台 tree-inspect.html 留档（真实渲染代码 + F5 报告林区导入 + 标注导出 +
  真实 chunk 拼装公式档）；本轮排除项：采样模式/干件帧/枝表/冠帧表/静止几何。
- 教训：**相机 snap 只保证相机对齐，chunk 边界位置 = k×256×z mod 1 仍随 zoom
  漂移**——非整数倍 zoom 下逐块绘制必须显式整数化目标矩形（或 chunk 尺寸
  对齐设备像素网格）。

### 用户报障五轮收官（2026-08-18）：夜间树冠横缝 = 摆动层小数偏移逐帧跳变
- **症状**：横线缝、任何缩放都有、无风（微风）也有；用户报告区域为夜间无光区
  （截图亮度 5-8）。全图水平线检测：23 条横线，线簇命中**枝标记行**（575/577/578）
  而非冠交界行（573/574/575 零命中）——即"树冠下的横缝"= 冠/枝逐帧重绘层
  的边缘行。
- **机制**：冠/枝由风摆 overlay 每帧重绘，offX/offY 带小数（微风 0.35 下
  ±0.1-0.6 世界px）→ 冠底边缘行逐帧落在不同设备像素行（最近邻）→ 夜间
  剪影高对比下呈现为闪烁横缝。白天/低对比下不可见（所有白天探针测不出的原因）。
- **修复**：VanillaTiler.renderEnv 加 zoom（Renderer 每帧注入）+ devSnap()
  设备像素吸附——冠/枝/棕榈冠的绘制目的地吸附到 1/zoom 网格（1.25× 下
  0.8 世界px 步进，运动平滑度不受影响），边缘恒落整数设备像素。
- **验证**：夜间+0.35 风 × 4 树 × 1.25/1.27 × 30 帧相位矩阵——干带零全透明行。
- 连带修：上一轮 chunk 修复漏加 viewW/2 中心偏移（世界左上偏半屏，用户实抓）。
- 教训：**夜间剪影是 1px 级缺陷的放大镜**——像素级渲染审计必须含"夜间高对比"
  场景；逐帧重绘层的坐标必须设备像素对齐（烘焙层同律，见 chunk 轮）。

### 树摇动算法全量对账（2026-08-19，用户问询触发）
逐项 vs TileDrawing.cs :7700-8460 / Main.cs:17987：
- ✅ **完全一致**：GetWindCycle(:7800)（cos 相位/每格相位偏移/WindForVisuals/
  lerp(0.08,0.18)/remix 门）；风计数器推进（:377：1/240 基率 + |wind| lerp(0.08,1.2)
  ×2 系数，Main.Update 60Hz 逻辑帧推进 = 本仓 fixedUpdate 同拍）；顶冠 off(2s,2|s|)
  rot 0.08s 绕底中（:8284-8290）；左枝 offX=(s>0?s:0)+2|s| rot 0.06s 绕(40,24)
  （:8313-8326）；右枝 offX=(s<0?s:0)−2|s| rot 0.06s 绕(0,30)（:8367-8400）；
  棕榈 off/rot 同顶冠（:8443-8456）；墙后不摆（flag=wall>0）/液体门/落叶频率表
  （UpdateLeafFrequency ×7 档）/枝叶 ×3 稀释/特殊叶 ÷2/高度门 10000——全部同值。
- ⚠️ 唯一刻意偏离：**devSnap 设备像素吸附**（0818 夜缝修复）——仅渲染坐标量化
  （1/zoom 网格），运动学公式零改动。
- 审计顺手修复：**绿洲棕榈缺失**（GetPalmTreeVariant :3519 内陆棕榈 biome+4 →
  Tree_Tops_21 114×98 帧/X 偏移 48/Y+2，:8421-8434）——此前只有海滩 4 变体，
  内陆棕榈画的是小号海滩冠。
- 登记不改：fx=0 稀有顶（1/13）原版走 DrawSingleTile 普通 16px 小顶帧
  （Tiles_5 (0,198-242) 有专属美术 33-54% 覆盖），本仓画静态大冠——静态无摆
  差异，纯美术选择，见 drawTreeSway :756 注释；落叶起点实心检查 +6px 偏移
  （近似，:8008 原文为 gore 位直取格）。

### 树差异全收齐（2026-08-19，用户裁决"不能有差异"）
摇动对账登记的 3 项差异全部落地：
1. **fx=0 稀有顶（1/13 树）**：drawTreeCell 冠/枝块门改 `fy>=198 && fx>=22`——
   fx=0 走干身 20×20 帧路径（原版 DrawSingleTile :4691-4697 tileWidth/Height=20、
   X −2 = Tiles_5 (0,fy) 静态灌木小顶），烘焙直画、摆动层早退=不画不摆。
   探针 _fx0-top：三相位恒同 ✓ 小顶高度 ✓（曾画 80×80 静态大冠，且首版改道
   误落枝分支——python 补丁未命中教训：改结构必须 Edit 精确匹配+读回验证）。
2. **落叶实心检查**：floor(像素/16) 直取格（:8008 ToTileCoordinates 语义），
   撤 +6 近似。
3. **绿洲棕榈**（0819 对账批已落）：IsPalmOasisTree（海滩带 380 外）→
   Tree_Tops_21 114×98 帧/X 偏移 48/Y+2。
- **神圣冠"固定 3"勘误为等价**：hallowBG 是原版建世界背景样式菜单值
  （WorldGen.cs:7391 case 4），本仓无该菜单=默认 0 → GetHollowTreeFoliageStyle
  default 分支返回 3——与原版默认世界**完全一致**，非近似。
- 唯一保留偏离：devSnap 设备像素吸附——量化的是**光栅化落点**而非摆动函数
  （GetWindCycle 输出原值传入，仅 drawImage 坐标取整到 1/zoom 网格），
  属渲染管线像素对齐（与 chunk 整数矩形同族），撤销即复现夜间横缝。

### 长按 F5 行为录制 × 树木动态验证（2026-08-19，探针已撤）
- 用户问询：长按 F5 行为录制窗（BehaviorRecorder，事件日志型）能否完整捕获
  树木动态。**结论：原生不能**——recorder 只收因果事件（key/tile/spawn/
  death/hurt/drop/use/chat/sample/world/bomb），无任何渲染侧钩子，树冠摆动
  是纯渲染态。
- **临时探针**（验证完毕已整体撤除）：WindSway 帧内收集视区树族冠/枝格 sway
  原值 → Renderer 摆动层画完后对前 3 顶冠取交界带亮度矩阵（干心±10 世界px ×
  行 B−2..B+1 各 10 点）→ recorder.log('tree', {c,p})。录制窗开关经 Game
  refreshTreeProbe 联动 main.ts toggle 两侧。
- **验证结果**（_treerec-verify，7 秒窗）：396 tree 帧/帧均 12 sway 细胞，
  sway 值域 [−0.15, 0.85]（风 0.35 理论幅 ✓ 摆动动态完整捕获）；交界带亮度
  矩阵逐帧可回放（探针首帧即见冠行/干行结构）✓。第二轮夜+强风+1.27× 还
  量化到交界行存在空行窗口（sway=0 静止时 1.27× 交界行采样落在亚像素过渡带）
  ——留作后续缝排查线索（录制侧无缝帧判定 0/396、0/358：当前修复态合成层
  无常驻缝）。
- **撤除清单**（零残留）：WindSway treeSwayFrame/收集块、Renderer 探针块+
  treeProbeSink/setTreeProbeSink、Game refreshTreeProbe、main.ts 两处调用、
  BehaviorRecorder.isRecording、_treerec-verify.mjs。tsc 干净+测试绿。

### 归位缝收官（2026-08-19 晚，用户截图+报告实抓）
- **用户证据**：截图（400×484）树冠底缘 y≈190 横贯全冠宽 1-2px 亮带，恰在
  冠-干交界；"归位原位时出现"——摆动中下压 |s|×2 把该行混入干色不可见，
  sway→0 下压归零即暴露。报告（zoom 1.25 截图为平天色未含缝；截图 8 小时
  后另摄，为分数缩放档）。
- **根因**：devSnap 只吸附绘制【左上角】——80px 冠在 1.27× 下高 101.6 设备px，
  底边仍落小数像素；canvas 对 drawImage 目标矩形几何边缘做 AA（与
  imageSmoothing 无关）→ 冠底最后一整行半透明 = 亮缝。
- **修复**：rectSnap 矩形双边缘吸附（左上/右下独立取整、宽高取差）——底边
  恒整数像素，半覆盖行消失；1.25× 整数倍缩放下为无操作。应用于顶冠/枝/
  棕榈（海滩+绿洲）全部摆动绘制，旋转枢轴改为吸附后矩形底中（w'/2, h'）。
- **验证**（_restseam 解剖台 ×1.25/×1.27 × 静止/微摆）：交界带半透明像素
  全零（修复前该行整行半透明）。
- 教训：**像素吸附必须吸附"矩形的每条边"，不是"位置"**——高 80×非整数倍
  zoom = 101.6px 的底边永远差那 0.6。canvas 的几何边缘 AA 与 imageSmoothing
  是两套机制，关后者不关前者。

### 缩放残留缝复核（2026-08-19 深夜，用户"某些缩放仍有缝"+新截图）
- **新截图解剖**（590×442）：树干列宽 ~4px + 冠暗跨 180px（密林多冠合并，
  不能反推 zoom）；交界区呈"20px 宽实心块 + 4px 全宽空带 + 窄柱"结构。
  游戏缩放域 0.5-2.5（步 0.15，经 +/- 键；1.25 起点档永不落在 1.0）。
- **全档扫描**（报告 areaPlayer 导入解剖台——含用户真实干件序列
  (0,0)(0,44)(88,0)(22,0)²(0,44)(22,110)(66,110)；交界带 = 干心±8 世界px ×
  行 B−3..B+3 全透明行检测）：**0.50-3.00 步 0.05 共 51 档零背景行**。
  工具单件直绘 (0,0) 覆盖率 0.56 正常（手搓 store 相机对位陷阱两次：
  非导入模式 cam.x=树心≠区中心、cam.y=boundary−2——扫描脚本必须按渲染
  实际 cam 公式对位）。
- 结论：树渲染管线在 rectSnap 修复后于全部缩放档交界密合。用户截图的缝
  位于**截图时刻的相机/页面合成条件**（截图 8 小时后另摄、缩放未知）或
  非 tree 渲染层——需下次缝可见瞬间的 F5 报告（带 areaPlayer+相机+截图
  三件套同帧）定位。登记待用户复现样本。

### 归位缝·真·终根因（2026-08-20，用户 F5 同帧实抓 + 种子世界复现）
- **证据链**：报告（黏腻的虫子热喷泉）内嵌截图逐树亮度扫描——树 (2164,219)
  交界行 dy=0 亮度 161.5 vs 上下 ~113（其余两树平滑）→ 逐像素：交界行左 2/3
  纯天空色；重建种子 12345 小世界同位森林活体复现（相位扫描 74 例命中，
  无风也有、恰一行）→ chunk 画布直读：**烘焙里树干首行完好**（chunk 内
  (0,44) 行 0 = `################`）→ 屏幕上却被天空盖掉。
- **终根因**：drawChunkGrid 的 `尺寸+1` "保险重叠"在整数设备矩形下实为
  【拉伸】——256 源画进 321 目标（320 精确 +1），有效缩放 1.2539≠1.25，
  块内内容逐行漂移（第 160 行漂 0.6px）；树干首行落在设备行中间时，最近邻
  采样取到上一行 = **marker 空行（冠不烘焙）渗入交界行** = 天空缝。漂移量随
  块内位置/缩放/相机 round 相位变化——"某些树/某些缩放/归位时出现"全部
  得到解释（摆动时冠下压盖住缝，静止归位即暴露）。此 +1 自 2026-08-18
  chunk 整数矩形化时从旧世界变换代码继承——旧代码里它确实防发丝缝（分数
  位置时代），整数矩形下相邻块 round 共享同值 = 精确对接，+1 变成纯害。
- **修复**：撤 +1（`xd1−xd0`/`yd1−yd0` 原值）。
- **验证**：同树相位×风况全扫零天空像素；dy=0 bark=0.8 与上下行一致；
  全树×1.27×DPR2 回归绿；三套件 36/36。
- 排查兵器谱（本案累积）：F5 同帧截图逐树亮度扫描→逐像素色型→chunk 画布
  直读（pair.sx/sy cell 偏移 + 局部坐标）→种子世界重建活体复现→相位扫描
  归因。工具解剖台自身的独立 bug（另一树画空）另案登记未查。

### 收尾确认（2026-08-20）：树缝已修（用户实证"已经修正"），F5 树木录制撤除核验
- 用户确认归位缝修复生效。F5 树木录制（0819 临时探针）源码侧撤除复核：
  treeSwayFrame/treeProbeSink/setTreeProbeSink/refreshTreeProbe/recLog('tree')/
  isRecording 全部零命中；录制器本体（BehaviorRecorder + 长按 F5 窗口）完好，
  debug-report 7/7 绿。
- tsc 报错 60 条全部为并行会话在途（minion-orientation/Minimap fog/Player
  eclipse/_friendly-gate 等），无本批归属。
- 本案（0817→0820 四轮）修复总账：①chunk 拼装整数设备矩形（非整数 zoom 缝）
  ②漏 viewW/2 半屏偏移 ③摆动层 rectSnap 双边缘吸附（夜缝+归位缝前半）
  ④**+1 拉伸撤除（终根因）**⑤绿洲棕榈 ⑥fx=0 小顶改道 ⑦落叶取格对齐
  ⑧F5 areaPlayer 补 half/slope 位。九件探针脚本留档 scripts/。

### 微光湖"怪异贴图"排查（2026-08-21，用户报告+贴图）
- **现象**：微光湖上方洞穴里成群淡黄白 (255,255,218) 4-16px 光斑，用户判断
  "类似精灵的东西、贴图动画调度有问题"。
- **取证**：报告 shot 同区 531 组纯白斑（两时刻常驻）→ 排除瞬态粒子；
  重建种子 12345 世界传送 (292,428) 白像素=0 → 非贴图级错误（tile/墙全为
  石头无装饰）→ 瞬态生物群。
- **身份判定**：精灵萤 Faeling（NPC 677，微光生物群系发光飞虫小动物）——
  spawnFaelings 玩家进微光区上升沿成群生成（Game.ts:4895 已移植）、
  淡黄白发光体、湖上方群飞 = 原版 TrySpawningFaelings 行为一致。用户
  "类似精灵" = Faeling 字面即精灵 ✓。
- **"动画调度问题"实锤（原版自身 bug）**：npcFrameCount[677]=4（权威数组）
  vs 绘制代码 case 677 frame.Y 0..4 循环（5 帧）vs 贴图 88×110=5 帧×22px
  （110/5 整、alpha 内容 5 簇）——三者互相矛盾：frame.Height=(int)110/4=27，
  帧 4 (Y108..135) 越界裁剪。**原版玩家看到的精灵萤动画就是 27px 错位切分
  （每帧混入邻帧 5px）+ 残缺帧 4**。本仓 1:1 复刻同款错位（vhpc floor(110/4)=27），
  高清缩放/DPR2 下错位更显眼 = 用户感知的"动画调度问题"。
- **裁决**：frames=4 维持（金标闸门 npcFrameCount 权威；曾改 5 触发闸门红，
  回退）。帧序 floor(t/3)%4 与原版可见帧序一致。台账登记原版自身不一致，
  不修（修=偏离原版）。
- 排除项：滴水珠 gore 1383（紫色 ✓ 非淡黄）、萤火虫 355（critter 仅 4 只）、
  瀑布（count=0）、drops（y 分布不符）、ShimmerFlyLeashedCritter（笼中物品生物）。

### 版本基准核验（2026-08-21，用户问"看的是 1456 还是 1457"）
- 本会话（含此前全部会话）标杆 = **Terarria1456/**（1.4.5.6，CLAUDE.md 约定）。
  Terarria1457/ 反编译也在仓库内，用户并行在加 1457 特性。
- **抽查本会话全部修复依据在 1457 中的状态**：
  - getGoodAdjustments（NPC.cs）：**逐字一致**（0 行差异）；
  - SpawnSkeletron（老人诅咒链）：仅 `&&`→`&`（反编译器布尔表现，语义等价）；
  - DrawShimmer（微光渲染）：仅 tileBatch.Draw 重载显式化（多写 1f/SpriteEffects.None，语义同）；
  - case 677 精灵萤帧循环：`+= 1.0; (+= 1.0)` vs `++; ++` 同一 double-increment 两种反编译表现，逻辑一致；
  - npcFrameCount[677] = 4 两版一致。
  → **本会话全部修复在 1457 下依然成立**。
- 行号偏移：1457 较 1456 多少量新增代码，台账所引行号在 1457 中偏移 +3~+23 行
  （如 getGoodAdjustments 17874→17971）——引用行号时注明版本。
- 1457 新增文件（用户并行特性可能涉及）：ButtonControlMode / FloatIntUnion /
  NewItemOwnership 等基础设施类。

### 微光湖白斑二轮（2026-08-21，新报告"氙奇葩"+贴图 5.png）
- **白斑身份修正**：新贴图白斑 (203,220,252) 淡蓝白、核心 4-6px + 光晕、
  位于玩家 (247,446) 头顶两侧——对应 tile (248,445) = **宝石树 585 枝标记
  (44,220)**（sheet 585 = 蓝宝石树 → Tree_Tops/Branches_24）。白斑 = 水晶枝
  的白色高光簇（Tree_Branches_24 帧 1 内多个 W 簇沿枝对角线分布，位置数学
  验证在枝贴图范围内）。暗洞穴里石头色枝体融入背景、只有水晶高光可见 =
  "漂浮的怪异光斑"观感。上一轮的淡黄白斑 (255,255,218) = 另一株宝石树
  （黄玉 583/Tree_Tops_22）或精灵萤，同为高光类。
- **渲染链全对**：TREE_SHEET_STYLES[585]=24 ✓（原版 GetGemTreeFoliageData
  case 585→24）、Tree_Tops/Branches_24 帧布局（354×98=3×116+2 步长 / 84×126=
  2×42 列×3 行）✓、摆动参数共用 num3/num4 ✓、锚点/枢轴数学验证 ✓、无
  GlowMask（原版宝石树亦无）✓、层级（tile 后风摆层）✓。
- 0817 尺寸表勘误：Tree_Tops_23/24 的 "vanilla 140×140 MISMATCH" 是误将
  神圣 case 109 值安到雪原水晶——实际 GetGemTreeFoliageData 恒 116×96，
  derived 与 vanilla 一致，无 mismatch。
- **精灵萤 677 帧数裁决回溯**：0821 曾改 frames=5 触发金标闸门红——回退 4
  （npcFrameCount 权威）。原版自身三方矛盾（数组 4/循环 5/贴图 5）维持登记。
- **待活体对比**：静态排查已无可寻差异。若用户仍观感异常，需录屏对比原版
  同场景（宝石树水晶枝摆动）确认差异点，或指明白斑出现的精确屏幕位置+
  F5 同帧报告。

### 微光湖飞灵动画终根因（2026-08-21，用户纠正"是飞灵不是静态特效"）
- **用户纠正**：白斑是飞灵（Faeling，NPC 677）——飞行小动物、可击杀、可捕捉、
  会穿过物块、玩家靠近会飞离。不是静态特效。
- **终根因**（NPC.cs case 677 :73504-73514 原版自身 bug）：
  FindFrame 的 `++frame.Y >= 5` 循环里 frame.Y 0..4 是【帧号】但**没乘帧高
  num=27**——frame.Y 直接当像素 Y 传给绘制。原版飞灵的 5 帧【全部叠在贴图
  顶部 0-4px 处】→ 动画 = 贴图 Y 0..4px 的微小抖动（几乎不可见）。
  本仓 floor(t/3)%4 × 帧高 27 真正切换了 4 个不同帧 → 动画在动 = 与原版
  视觉完全不同 = 用户看到的"动画调度问题"。
- **修复**：SpriteAtlas.vnpc 对 677 特殊处理——sy = frameIdx（不乘 frameH），
  与原版 frame.Y 帧号当像素的 bug 1:1 对齐。
- **验证**：npc-frame-golden 4/4 绿（frames=4 维持）；visual-extras 的 Glow
  计数失败为并行会话新增 Glow_380-383（1457 GlowMask）非本批。
- **1457 版本核验**（用户问"看的是 1456 还是 1457"）：本会话标杆 = 1456
  （CLAUDE.md 约定）。getGoodAdjustments 两版逐字一致；SpawnSkeletron 仅
  &&→&；DrawShimmer 仅重载显式化；case 677 帧循环逻辑一致；npcFrameCount
  [677]=4 一致——全部修复在 1457 下成立。1457 行号偏移 +3~23。

### 飞灵 677 多层复合渲染（2026-08-21，用户纠正后终根因）
- **用户纠正**：白斑是飞灵（Faeling 677）——飞行小动物、可击杀、微光湖上方游荡。
  此前所有分析都在错误方向上（帧调度/采样模式/chunk 拼接），因为**飞灵不走普通
  NPC 帧动画渲染路径**。
- **终根因**：原版 Main.cs:23725 对 NPC 677 走**独占绘制函数**
  `DrawNPCDirect_Faeling`（:26306-26368）——多层复合渲染：
  贴图 88×110 = 4 列 × 5 行 22×22 格，**4 列是 4 个不同图层**（非 4 帧动画）：
  - 列 0 = 本体图案（HSL 彩虹色 × 50% 透明度，行 = frame.Y 0..4）
  - 列 1 = 翅膀（白色 × 50%，行 = frame.Y）
  - 列 2 = 白色光晕体（加算混合，行 0 恒定 + 拖尾残影）
  - 列 3 = 闪烁 sparkle（彩虹→白 lerp × 脉冲缩放，行 = whoAmI%5 / 行 1）
  FindFrame case 677 的 frame.Y 0..4 = 选 5 行中的动画帧（每 3t 一帧）。
  **本仓此前把 4 列当 4 帧动画帧轮播 → 完全错误。**
- **修复**：Renderer.drawFaeling 1:1 移植 DrawNPCDirect_Faeling 全 6 层：
  ①拖尾残影（oldPos × 列 2，彩虹渐隐+扩大）②主光晕（列 2 行 0，白色加算 lighter）
  ③翅膀（列 1 行 frame.Y，白 50%）④本体（列 0 行 frame.Y，彩虹 50%）
  ⑤⑥闪烁（列 3，脉冲缩放+彩虹→白）。drawEnemy 路由 677 → drawFaeling。
  每只飞灵彩虹相位 = (whoAmI×0.11 + tVis/360) % 1（独立色相，随时间漂移）。
  拖尾正弦摆动 + 速度渐隐 + 脉冲缩放全部 1:1。
- **验证**：npc-frame-golden 4/4 绿（frames=4 维持）；tsc 干净。visual-extras
  Glow 计数失败为并行会话新增 Glow_380-383 非本批。
- **教训**：**遇到"贴图错误"类报障，第一步查 Main.cs DrawNPC 是否有专属绘制
  函数**——飞灵 677 走 DrawNPCDirect_Faeling 独占路径（:23725 case 677），
  不走普通帧动画。此前所有帧调度分析都在错误前提下进行。
