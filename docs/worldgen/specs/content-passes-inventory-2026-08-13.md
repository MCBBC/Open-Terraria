# #35-105 内容区 pass 移植状态清点表（2026-08-16 复核）

> 权威 = `Terarria1456/Terraria/WorldGen.cs` 的 `AddGenerationPass(GenPassNameID.*)` 注册序
> （执行序=注册序，WorldGenerator.cs:447 逐个执行、每 pass 前重播种子 cs:497）。
> 编号口径：全表 105 个注册 pass，#1 Terrain … **#35 Gems=cs:15109 … #105 FinalCleanup=cs:22304**。
> 我们链 = `src/world/gen/WorldGen.ts` 的 passes 数组（槽）+ `vanillaBiomes`/`vanillaStructures`/
> `statuesChestsPass` 等包装函数内的 run 调用；实现文件在 `src/world/gen/vanilla/`。
> 本表只清点 **#35-#105**（71 个）；#1-#34 见 `docs/worldgen/vanilla-pass-alignment.md`（19 checkpoint 已全绿）。
> 状态图例：✅=已实现且管线位置正确｜🔀=已实现但位置偏差｜❌=完全没有实现｜⏭️=常态跳过（普通种子零掷骰/no-op，实证门在案）。

## 统计

| 类别 | 计数 |
|---|---|
| ✅ 已实现 + 位置正确 | **69**（2026-08-16 内容区缺口修复批：#68/#70 补缺、#37/#77 归位、自造补偿块删除） |
| 🔀 已实现 + 位置偏差（仅剩 #97 尾沉降外移=既有设计备案） | **1** |
| ❌ 完全没有实现 | **0** |
| ⏭️ 常态跳过·实证正当（#80） | **1** |
| 合计 | **71** |
| 自造 pass 插入（非原版注册；见「管线偏差」④） | 2 处（④-c 丛林补偿块已删） |

## 清点表（#35 → #105，1456 注册序）

| # | 注册名 | cs 行 | 我们实现（文件/函数） | 状态 | 对账难度 |
|---|---|---|---|---|---|
| 35 | Gems | 15109 | `ShiniesPass.ts` `runGemsPass`（vanillaBiomes 尾，Beaches 后） | ✅ | 低（B3 批已修拒绝采样 64→3） |
| 36 | GravitatingSandCleanup | 15198 | `GravitatingSandPass.ts`（「引力沙」槽=引力沙+OceanCaves 复合槽） | ✅ | 低（零掷骰纯扫描；2026-08-16 起 OceanCaves 归位到本槽尾，偏差①核销） |
| 37 | OceanCaves | 15228 | `OceanCavesPass.ts` `runOceanCavesPass`（「引力沙」槽内尾，gravitatingSandSlot） | ✅ | 高（oceanCave cs:76686-76980：每步 NextDouble×2 无条件+Next(3)×2 条件+宝藏登记；B3 批修过 flag 复位；2026-08-16 从 vanillaBiomes 尾归位到引力沙之后=偏差①核销） |
| 38 | Shimmer | 15256 | `ShimmerPass.ts`（「微光」槽） | ✅ | 低-中（shimmer-checkpoint 四段金标全绿；ShimmerMakeBiome cs:34889-35083 大量 NextDouble 椭圆判定已对账） |
| 39 | DirtWallCleanup | 15310 | `CleanupPass.ts`（「清理」槽） | ✅ | 中（邻列 ±2/±3 的 Next(2) 命中才消费短路语义，B3 批修过） |
| 40 | Pyramids | 15426 | `StructuresPass.ts` `runPyramidPass`（「结构」槽头） | ✅ | 高（Pyramid() cs:27816-28120：密室+出口隧道条件循环每行 Next(0,2)×2；候选在 Dunes pass 预登记 gs.pyramidSpots） |
| 41 | DirtRockWallRunner | 15536 | `DirtRockWallRunnerPass.ts`（结构槽第 2） | ✅ | 中（DirtyRockRunner cs:77503：每格 Next(-10,11) 在 wall 判定前无条件消耗——文件头注已记） |
| 42 | LivingTrees | 15551 | `LivingTreePass.ts` `runLivingTreesPass` | ✅ | 高（GrowLivingTree cs:28123-28759 ≈640 行五段掷骰：主干收窄/侧枝/顶/根/叶簇+patch 侧翼树） |
| 43 | LivingTreeWalls | 15792 | `LivingTreePass.ts` `runLivingTreeWallsPass` | ✅ | 低（零掷骰，type 191 连通核补墙 244） |
| 44 | DemonAndCrimsonAltars | 15825 | `CorruptionPass.ts` `runAltarsPass` | ✅ | 中（计数 w*h*3.3e-6；三层拒绝采样：x 中央带重掷→y 带掷→oceanDepths/微光 150 距离全重掷；每坛≤10000 次） |
| 45 | SurfaceWaterInJungle | 15887 | `StructuresPass.ts` `runWetJunglePass` | ✅ | 低（零掷骰逐列灌水两格） |
| 46 | LihzahrdTemple | 15911 | `TemplePass.ts` `runTemplePass` | ✅ | 高（makeTemple cs:33573：锚点 Next(rock,h-600)+NextDouble×num3 带系数定位、房间链重投至不相交、100 万次失败 escalator num3 0.25→0.35） |
| 47 | Beehives | 16005 | `HiveSpiderPass.ts` `runBeehivePass` | ✅ | 高（计数 1+Next(5n,8n)；预算 10000；HiveBiome.Place 内 num2=Next(2,5) 隧道族+CreateHiveTunnel+蜂蜜环 Next(2) 循环+RandomWorldPoint 每迭代 2 掷） |
| 48 | JungleShrines | 16059 | `JungleShrinePass.ts` `runJungleShrinePass`（结构槽尾） | ✅ | 中（hutIdx 复用 Reset 掷不重掷——B3 批修过；坐标跨槽传 #61） |
| 49 | SettleLiquids | 16215 | `WorldGen.ts` `liquidSettlePass` → `src/world/liquid/settle.ts` settleWorldLiquids('gen')（「水体沉降」槽） | ✅ | 中（液体模拟状态机对账，非掷骰型） |
| 50 | RemoveSurfaceWaterAboveSand | 16295 | `WaterIcePasses.ts` `runRemoveSurfaceWaterAboveSandPass`（「沙上清水」槽） | ✅ | 低（零掷骰） |
| 51 | Oasis | 16327 | `OasisPass.ts` `runOasisPass`（「绿洲」槽） | ✅ | 中（PlaceOasis cs:10716-10952 全量已移植；登记 gs.oasisX/Y/W） |
| 52 | ShellPilesMarblePilesAndSpikePits | 16353 | `BeachPass.ts` `runBeachDecorPass`（「海滩装饰」槽） | ✅ | 中（常态仅 ShellPiles 左右两段：Next(2) 开关+Next(5/10/15) 退距+Next(2,4) maxValue 门；**MarblePiles 段=Constant 专属（cs:16361 dontStarveWorldGen 门）、AddSpikeCaves=秘种子专属（cs:16396）**，省略正确） |
| 53 | SmoothWorld | 16507 | `HalfBrickPass.ts` `runSmoothWorldPass`（「半砖平滑」槽） | ✅ | 低-中（已对账；tileSolid 481-483 翻转窗口还原点在尾） |
| 54 | Waterfalls | 16697 | `HalfBrickPass.ts` `runWaterfallLipPass`（「瀑布唇缘」槽） | ✅ | 低 |
| 55 | FragileIceOverIceBiomeWater | 16756 | `WaterIcePasses.ts` `runFragileIcePass`（「薄冰」槽） | ✅ | 低（零掷骰） |
| 56 | CaveWallVariety | 16786 | `CaveWallsPass.ts` `runCaveWallVarietyPass`（「洞穴墙变体」槽） | ✅ | 中（变体墙选择掷骰；OuterOutline origin +1 行偏移原样保留） |
| 57 | LifeCrystals | 16847 | `StructuresPass.ts` `runLifeCrystalsPass`（「生命水晶」槽） | ✅ | 中（掷序 B3 批修过） |
| 58 | Statues | 16947 | `StatuesPass.ts` `runStatuesPass`（「雕像宝箱」槽头，R 批归位） | ✅ | 中（73 序雕像+头尾 226/162/225/190 四翻窗口） |
| 59 | UndergroundHousesAndBuriedChests | 17066 | `BuriedChestsPass.ts` ①② + `CaveHousePass.ts` ③④（同槽合一） | ✅ | 高（#58 四循环合一：洞穴箱→地狱箱→小屋两循环；头四翻+四计数连掷预掷 rollHouseChestCounts） |
| 60 | SurfaceChests | 17226 | `BuriedChestsPass.ts` `runSurfaceChestsPass` | ✅ | 中 |
| 61 | ChestsInJungleShrines | 17308 | `JungleShrinePass.ts` `runJungleChestsPass`（神龛坐标跨槽） | ✅ | 低 |
| 62 | UnderwaterChests | 17343 | `OceanCavesPass.ts` `runUnderwaterChestsPass`+`runWaterChestsPass`（宝藏点跨槽） | ✅ | 中（单 pass 三段：海洋洞窟宝藏箱（半径 2→50 扩张重试+NextFromList 主件）+9n 水箱+两组 while 重试水草箱；B4 批修过四重偏差） |
| 63 | SpiderCaves | 17455 | `HiveSpiderPass.ts` `runSpiderNestPass`（槽尾） | ✅ | 中（countTiles 门+波前 BFS 刷墙 62+蛛网罐/箱） |
| 64 | GemCaves | 17528 | `GemPasses.ts` `runGemCavesPass`（「宝石洞」独立槽） | ✅ | 中（已归位 Moss 前） |
| 65 | MossAndMossCaves | 17573 | `MossPass.ts` `runMossAndMossCavesPass`（「苔藓」槽） | ✅ | 中-高（霓虹苔藓洞+斑/散点+地狱氦苔藓多段） |
| 66 | LihzahrdTemplePart2 | 17809 | `TemplePass.ts` `runTemplePart2Pass`（「神庙陈设」槽，R 批拆出） | ✅ | 高（陷阱→箱→雕像→家具→挂饰五段；采样域经 gs.tLeft/tRight/tTop/tBottom/tRooms 跨槽） |
| 67 | CaveWallsInEnclosedSpaces | 17819 | `CaveWallsPass.ts` `runCaveWallsPass`（「洞穴墙」槽） | ✅ | 中（countTiles 洪水+Spread.Wall+丛林泥墙段；2026-08-12 补缺） |
| 68 | UndergroundJungleTrees | 17952 | `UndergroundJungleTreesPass.ts` `runUndergroundJungleTreesPass`（「地下丛林树」槽=#67 后，2026-08-16 补缺） | ✅ | 中（GrowUndergroundTree cs:31007-31457 已移植：掷序 num4→num5（与 GrowTree 相反！）、根部三掷独立、树冠 Next(8)；EmptyTileCheck ignoreID=20 的 CommonSapling∪植物白名单语义；头 tileSolid[379]=true（cs:17956 还原位）；每 pass 重播种子 RNG 流隔离；单测 tests/content-passes-batch.test.ts） |
| 69 | FloatingIslandHouses | 17971 | `IslandHousePass.ts` `runIslandHousePass`（「浮空岛屋」槽=#67 后） | ✅ | 中（消费 FloatingIslands pass 预登记的 X/Y/style/skyLake 数组） |
| 70 | QuickCleanup | 17987 | `QuickCleanupPass.ts` `runQuickCleanupPass`（「快清理」槽=#69 后，2026-08-16 补缺） | ✅ | 中（五子段已 1:1：海洋液体转水/海洋表面沙下填土（Next(4,7) 在 for 条件内逐判定掷；k/k+1/k+2 展望窗停）/沙岩墙 187·硬化沙墙 216（**非大理石/花岗岩墙——那是 178/180**）杂块转硬化沙+浅干深岩浆/表面悬空沙墙 7×7 补齐（内层 break 只断 m 循环 bug-for-bug）/SaveSlopes 归一；头尾 tileSolid 137/130 翻转；单测 tests/content-passes-batch.test.ts） |
| 71 | PotsGraveyardsAndBoulderPiles | 18108 | `WorldGen.ts` `potPass`（「瓦罐」槽） | ✅ | 低（瓦罐段已 1:1：每罐 10000 次全列尝试+style 覆写链掷序；**墓园段=秘种子专属（cs:18110）、巨石堆段=noTraps/errorWorld 专属（cs:18121-18122）**，省略正确） |
| 72 | Hellforges | 18298 | `HellforgesPass.ts` `runHellforgesPass` | ✅ | 低-中（w/200 个，墙 13/14 门禁） |
| 73 | SpreadingGrassOnSurfaceSunflowersEvilsOnSurfaceAndLavaCleanup | 18349 | `WorldGen.ts` `spreadingGrassPass`（「表面」槽，段①②） | ✅ | 低（段①②零掷骰（SpreadGrass cs:75210 全文 0 次 genRand）；向日葵/Evils-On-Surface Convert/岩浆清理三段**全在 `if (remixWorldGen)` 门内**（cs:18467/18536），常态零消耗，省略正确；cs:18421 jungleMinX/MaxX=Reset 初值 -1 的怪癖已 bug-for-bug 保留） |
| 74 | SurfaceOreAndStone | 18559 | `SurfaceDecorPasses.ts` `runSurfaceOreAndStonePass`（「地表矿石」槽） | ✅ | 低-中（OrePatch/StonePatch 1:1 已对账） |
| 75 | FallenLogsAndWaterFeatures | 18625 | `SurfaceDecorPasses.ts` `runFallenLogsPass`（「倒木水景」槽） | ✅ | 低（仅倒木段（gs.logX/logY→#90）；水景段=秘种子专属） |
| 76 | Traps | 18769 | `TrapsPass.ts` `runTrapsPass`（「地表装饰」槽内第二段） | ✅* | 高（陷阱族大；*槽内第一段是自造 runSurfaceDecorPass，见偏差④） |
| 77 | Piles | 18900 | `PilesPass.ts` `runPilesPass`（「矿骨堆」槽=「地表装饰」（Traps）之后、「出生点」前） | ✅ | 高（七子段 1:1 已重写；2026-08-16 从「地狱熔炉」后归位到 Traps 后=偏差②核销：堆的地面门禁现作用于 SpreadingGrass 群系转换之后，与原版一致） |
| 78 | SpawnPoint | 19605 | `WorldGen.ts` `spawnPointPass`（「出生点」槽） | ✅ | 中（中心扩张拒绝采样+3 格水检+379 排斥；tileSolid[379] 头翻尾还原） |
| 79 | SurfaceDirtWallsToGrassWalls | 19734 | `GrassWallPass.ts` `runGrassWallPass`（「草墙」槽） | ✅ | 中（63/65 花墙对 Vines#89 的上游） |
| 80 | SpawnStarterNPCs | 19830 | ——（有意跳过） | ⏭️ | N/A（cs:19833 pass 体整段包在 `if (Main.tenthAnniversaryWorld)` 内，普通种子零掷骰 no-op——已实证） |
| 81 | SunflowersPart2 | 20043 | `SurfaceDecorPasses.ts` `runSunflowersPart2Pass`（「向日葵」槽） | ✅ | 低（w*0.002 次带状扫描；2026-08-13 补缺） |
| 82 | Trees | 20085 | `TreePass.ts` `runTreePass`（「栽树」槽） | ✅ | 高（AddTrees 逐列树形族+树样式边界） |
| 83 | AlchemyHerbs | 20109 | `SurfaceDecorPasses.ts` `runAlchemyHerbsPass`（「炼金草药」槽） | ✅ | 低-中 |
| 84 | DyePlants | 20126 | `SurfaceDecorPasses.ts` `runDyePlantsPass`（「染料植物」槽） | ✅ | 中（plantDye+MatureTheHerbPlants+656+752） |
| 85 | WebsInSpiderCavesAndHoneyPlusSpeleothemsInBeehives | 20140 | `HiveSpiderPass.ts` `runWebsInSpiderCavesPass`（「蛛网蜂巢」槽，Batch D 归位） | ✅ | 低（两段扫描：wall 86 蜂巢腔→蜂蜜液化+Next(3) 钟乳石；wall 62 蛛网腔→Next(10) 门+Next(2,5) 半径+近实心检查） |
| 86 | GrassPlantsEvilPlantsAndPumpkinsOnSurface | 20209 | `SurfaceDecorPasses.ts` `runGrassPlantsPass`（「地表植物」槽） | ✅ | 中 |
| 87 | GlowingMushroomPlantsUndergroundAndJunglePlants | 20267 | `SurfaceDecorPasses.ts` `runGlowingMushroomPlantsPass`（同槽第二段，独立重播） | ✅ | 中 |
| 88 | JunglePlantsPart2 | 20310 | `SurfaceDecorPasses.ts` `runJunglePlantsPart2Pass`（「丛林植物P2」槽） | ✅ | 低（w*100 次 Next(8)/Next(12) 款式；2026-08-13 补缺） |
| 89 | Vines | 20338 | `SurfaceDecorPasses.ts` `runVinesPass`（「藤蔓」槽） | ✅ | 中（六藤族+GrowMoreVines+CanHitLine+444 凹龛） |
| 90 | Flowers | 20592 | `SurfaceDecorPasses.ts` `runFlowersPass`（「地表花」槽） | ✅ | 低（花圃重帧，消费 gs.logX/logY） |
| 91 | Mushrooms | 20744 | `SurfaceDecorPasses.ts` `runMushroomsPass`（「地表蘑菇」槽） | ✅ | 低 |
| 92 | ExposedGemsInIceBiome | 20842 | `GemPasses.ts` `runExposedGemsPass` 冰段（「宝石系统」槽） | ✅ | 中（y∈[(ws+rl)/2, lavaLine)+逐行雪界；x 掷骰无条件（含 Next(0,0) 怪癖）+4×Next(1,4)+Next(12) 窗口掷序已修） |
| 93 | ExposedGemsUnderground | 20874 | 同函数地下段（独立重播） | ✅ | 中（w 次 x∈[20,w-20)/y∈[rock,h-300)） |
| 94 | LongMoss | 20915 | `SurfaceDecorPasses.ts` `runLongMossPass`（「长苔藓」槽） | ✅ | 低-中（TileFrame184 22*色号） |
| 95 | DirtWallsIntoMudWallsInJungleAndJungleMinMax | 20963 | `CaveWallsPass.ts` `runJungleMudWallsPass`（「丛林墙」槽） | ✅ | 低-中（界扫描+边缘 Next(2)/Next(3) 抖动；jungleMinX/MaxX 字段未存——唯一读点 cs:18421 在本 pass 之前读 Reset 初值 -1，bug-for-bug 等价，CaveWallsPass.ts:270 已核） |
| 96 | BeeLarvaInBeehives | 21018 | `HiveSpiderPass.ts` `runBeeLarvaPass`（「蜂巢幼虫」槽） | ✅ | 低（零掷骰：纯消费蜂巢 pass 登记的 numLarva 坐标；3×4 托台清空+幼虫 211 放置） |
| 97 | SettleLiquidsPart2AndNotTheBees | 21051 | `settleWorldLiquids('gen')` 由 worker/Game 侧在 generateWorld 之后承担（管线外尾） | 🔀 | 中（NotTheBees=秘种子；尾沉降外移=设计备案——但原版位于 #96 与 #98 之间，见偏差③） |
| 98 | CactusPalmTreesAndCoral | 21115 | `StructuresPass.ts` `runCactusPalmTreesAndCoralPass`（「仙人掌珊瑚」槽） | ✅ | 高（头部绿洲消费段 cs:21129-21163（±1.5w×±20 逐格 NextDouble<1/0.13 棕榈+燕麦 Next(2)×2+530 Next(9)）**已实现**——WorldGen.ts:99-100「未实现」注释过时；GrowCactus 150 次邻域成簇+两端珊瑚+水盒棕榈） |
| 99 | TileCleanup | 21327 | `TileCleanupPass.ts` `runTileCleanupPass`（「瓦片清理」槽） | ✅ | 中（清坡/坡接半砖/液体草本/滴水石笋/墙液体清零/祭坛 232→226；帧规范化族备案） |
| 100 | LihzahrdAltar | 21753 | `TemplePass.ts` `runLihzahrdAltarPass`（「蜥蜴祭坛」槽） | ✅ | 低（零掷骰，重放祭坛 6 格+底行 226） |
| 101 | MicroBiomes | 21785 | `MicroBiomesPass.ts` `runMicroBiomesPass`（「微群系」槽） | ✅ | 高（Campsites/MiningExplosives/附魔剑圣地/薄冰/死亡之箱/矿轨 TrackGenerator） |
| 102 | LilypadsCattailsBambooAndSeaweed | 22131 | `SurfaceDecorPasses.ts` `runLilypadsPass`（「水生植物」槽） | ✅ | 中（518/519/571/549） |
| 103 | SpeleothemsAndGemTrees | 22196 | `GemPasses.ts` `runGemTreesPass`（「钟乳石宝石树」槽，2026-08-13 归位） | ✅ | 中（147/161 天花板钟乳石+TryGrowingTreeByType 583-589） |
| 104 | BrokenTrapCleanup | 22283 | `BrokenTrapCleanupPass.ts` `runBrokenTrapCleanupPass`（「断线陷阱清理」槽） | ✅ | 低（零掷骰；noTraps 种子门已接） |
| 105 | FinalCleanup | 22304 | `FinalCleanupPass.ts` `runFinalCleanupPass`（「终清理」槽） | ✅ | 中（九子项；FillWallHoles/DirtiestBlock 彩蛋备案） |

## 管线偏差（本次清点新发现/确认）

1. **① #37 OceanCaves 与 #36 GravitatingSandCleanup 对调（2026-08-16 已核销）**
   原版注册序 Gems(15109) → **GravitatingSand(15198) → OceanCaves(15228)** → Shimmer(15256)。
   ~~我们链：OceanCaves 在 `vanillaBiomes` 尾执行，早于独立槽「引力沙」。~~
   **修法已落地**：`runOceanCavesPass` 调用从 vanillaBiomes 尾挪到「引力沙」槽内尾
   （WorldGen.ts `gravitatingSandSlot`）；每 pass 重播种子 RNG 流零移位，仅状态先后修正
   （引力沙现作用于未挖洞的海岸剖面=原版序）。caves-checkpoint 链本就按
   gravitatingsand→oceancaves 序对账，未受影响。

2. **② #77 Piles 提前 4 个注册位（2026-08-16 已核销）**
   ~~「矿骨堆」槽位于「地狱熔炉」(#72) 之后、「表面」(#73) 之前。~~
   **修法已落地**：矿骨堆槽整体后移到「地表装饰」（Traps）之后、「出生点」之前——
   Piles 的地面门禁现作用于 SpreadingGrass 段①群系转换之后，与原版一致。

3. **③ #97 SettleLiquidsPart2 外移到管线外（既有设计备案，保留观察）**
   原版位于 BeeLarva(#96) 与 CactusPalm(#98) 之间；我们由 `settleWorldLiquids('gen')` 在
   generateWorld+finalize 全部完成后承担。影响：#98-#105 各 pass 读到的液体状态是
   「未二次沉降」的（原版已沉降）。仙人掌/珊瑚、TileCleanup 的液体分支判定可能分叉。

4. **④ 自造 pass 插入（非原版注册，状态污染源候选）**
   - `runSurfaceDecorPass`（StructuresPass.ts，自创杂草/花/蘑菇/藤扫描）插在 #75 与 #76 之间，
     以「槽头新流」跑非原版掷骰+放置——与 #86/#87/#89 原版 pass 职能重叠，可能提前占格；
   - 「多格残片清扫」槽（#105 后）+ finalize 后二次清扫——本仓存档格式产物（原版由 KillTile
     整块语义天然保证），幂等，低风险；
   - ~~vanillaBiomes 内「丛林表面泥化」补偿块（runJunglePass 后，WorldGen.ts:671-683）~~
     **2026-08-16 已删**：该块补的是 noYChange 修复前巨型泥 runner 够不到地表的旧缺陷；
     修复后 JunglePass/MudCaves 两检查点对 oracle 位级全绿（tests/caves-checkpoint
     terrain→slush 全绿段含 jungle/mudcaves），巨型 runner 的表面泥覆盖已与原版一致，
     补偿块只在原版终态之外额外把 ±0.12w 表层 dirt 改 mud（实测丛林带表层泥列
     62.7%→55.7% 回到 runner 原生覆盖）=纯偏差，移除（原位留注释存档）。

5. **⑤ 过时注释（2026-08-16 已删）**：~~WorldGen.ts:99-100 称「pass 98 的绿洲棕榈/燕麦/
   植物 530 消费段未实现，备案」~~——StructuresPass.ts cs:21129-21163 段已落地
   （`placeOasisPlant`/`plantSeaOat`/`growPalmTreeAt` 全在），注释已改为落地表述。

## 常态省略正确性实证（防误判为缺口）

| 段 | 门 | 实证行 |
|---|---|---|
| #52 MarblePiles | `dontStarveWorldGen`（The Constant 专属） | cs:16361 |
| #52 AddSpikeCaves | `GenVars.noTrapsAndForTheWorthyNoCelebration` | cs:16396 |
| #71 墓园段 | `(dontStarve&&(drunk‖getGood)&&!tenth)‖graveyardBloodmoonStart` | cs:18110-18120 |
| #71 巨石堆段 | `(noTraps‖errorWorld)&&!actuallyNoTrapsForRealIMeanIt` | cs:18121-18122 |
| #73 向日葵/Evils/岩浆清理三段 | `remixWorldGen` | cs:18467/18536（缩进实证） |
| #75 水景段 | 秘种子 | —— |
| #80 SpawnStarterNPCs | `Main.tenthAnniversaryWorld` 全包 | cs:19833 |
| #15 WavyCaves（#34 前） | dontStarve 专用普通零消耗 | cs:12303 |

## 与既有文档的关系

- `docs/worldgen/vanilla-pass-alignment.md`：#1-#34 的 checkpoint 对账 + 旧编号（1.4.0.5 口径）；
- `docs/worldgen/pass-audit-2026-08.md`：全量审计总账（其二节缺失裁决表、三节顺序偏差——
  本表证实其中 QuickCleanup/UndergroundJungleTrees 两项「⬜ 待裁 B4」至今未落，其余多数已核销）；
- 本目录 `specs-structural-batch1.md`：#36-#47 十二个结构 pass 的原版掷骰规格（oracle 转录蓝图）。
