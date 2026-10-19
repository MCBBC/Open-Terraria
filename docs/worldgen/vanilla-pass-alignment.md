# 原版世界生成 pass 对齐总表

> 2026-08-12。权威源码 = `Terarria1456/`（ilspycmd 反编译 1.4.5.6）。
> 种子等价验证 = `tests/caves-checkpoint.test.ts`（C# oracle `tools/golden/caves-oracle.cs`
> 反射真 UnifiedRandom，双种子金标 `tests/golden/caves-chain-*.json`）。
> pass 编号沿用 1.4.0.5 的 105-pass 清单（`memory/vanilla-worldgen-passes.md`），
> 1.4.5.6 新增 pass（约 4 个，Total ~109）在对应阶段注明。

## 幽灵 tile 机制（读表前提）

原版 `active(false)` **保留 type**（"幽灵"）。生成期多个 pass 对非活性格读/写 type：
- IceBiome（cs:12394）`switch(tile.type)` 不判 active → 幽灵泥土(0)→雪(147)、幽灵石(1)→冰(161)，**天空行也转化**；
- TileRunner 铺设分支 `if (!flag4) tile.type = type` 同样不判 active → 幽灵写出；
- 收尾循环的拒绝采样（`type != 59`）会读到幽灵 → 幽灵一致性影响掷骰流。

**JS 侧对应约定**：内部 `EMPTY=0` ≡ 原版幽灵泥土 `type=0`——凡原版判 `type==0`，
JS 必须 `t === 0 || t === T.DIRT`。海盆挖掘（BeachPass）原版仅 `active(false)`（cs:15014）。

## 已逐哈希验证（19 checkpoint，双种子全绿，2026-08-12）

| checkpoint | 原版 pass | 实现文件 |
|---|---|---|
| terrain | 2 Terrain | TerrainPass.ts |
| dunes | 3 Dunes | DunesPass.ts |
| oceansand | 4 Ocean Sand | BeachPass.ts (runOceanSandPass) |
| sandpatches | 5 Sand Patches | MissingCavesPass.ts |
| tunnels | 6 Tunnels | MissingCavesPass.ts |
| mountaincaves | 7 Mount Caves | MountCavesPass.ts |
| dirtwallbg | 8 Dirt Wall Backgrounds | MissingCavesPass.ts |
| rocksclay | 9-11 RocksInDirt/DirtInRocks/Clay | CavesPass.ts |
| smallholes | 12 Small Holes | MissingCavesPass.ts |
| surfacecaves | 13-15 Dirt/Rock/Surface Caves | CavesPass.ts |
| mcopenings | 34 Mountain Caves | MountCavesPass.ts |
| beaches | 35 Beaches | BeachPass.ts |
| icebiome | 16 Ice Biome | IceBiomePass.ts |
| grass | 17 Grass | GrassPass.ts |
| jungle | 18 Jungle（JunglePass.cs 全文） | JunglePass.ts |
| mudcaves | 19 Mud Caves To Grass | Spread.ts (SpreadGrass) |
| desertmound | 20 Full Desert 之 mound 段 | DesertPass.ts |
| —— | 附：oracle 链尾还有 Reset 掷骰序列（cs:11159-11472）已 1:1 重置 | WorldGen.ts runResetAndTerrain |

## JS 已移植、oracle 未对账（无逐哈希验证）

| 原版 pass | 实现文件 | 备注 |
|---|---|---|
| 21 Floating Islands | — | 检查 WorldGen.ts vanillaBiomes |
| 22 Mushroom Patches | MushroomPass.ts | |
| 23/24 Marble/Granite | MarbleGranitePass.ts | TileRunner 伴生墙 180/178 |
| 25/26 DirtToMud/Silt | DirtToMudPass.ts | |
| 27 Shinies（矿石） | — | 全硬编码表（见 memory） |
| 31 Lakes + 36 Gems | LakesPass.ts / GemPasses.ts | |
| 37 GravitatingSandCleanup（1456 cs:15198-15226） | GravitatingSandPass.ts | 零掷骰；Falling 系空腔落定；2026-08-12 补缺 |
| DirtRockWallRunner（1456 cs:15536 + DirtyRockRunner cs:77503） | DirtRockWallRunnerPass.ts | 近地表泥土自然墙 2 → 石墙 59 游走斑；2026-08-13 补缺（清零批） |
| ShellPiles（1456 cs:16385-16501） | BeachPass.ts（runBeachDecorPass+shellPile） | 1:1 掷骰序（含原版右侧误写 shellStartXLeft 怪癖）；2026-08-12 从管线末尾归位至平滑前 |
| Shimmer（1456 cs:15256） | ShimmerPass.ts | |
| 33 Slush | IceBiomePass.ts runSlushPass | 无 RNG |
| 28 Corruption/Crimson | CorruptionPass.ts | 二选一 |
| 30 Dungeon | DungeonPass.ts | |
| 29 Underworld + 地狱塔/屋 | HellFortPass.ts / HellforgesPass.ts | |
| 38 Ocean Caves | OceanCavesPass.ts | |
| 40 Pyramids | （vanillaBiomes 内） | gs.pyramidSpots 来自 Dunes |
| 42/43 Living Trees(+Walls) | LivingTreePass.ts | |
| 46 Jungle Temple / 47 Hives | TemplePass / BeehivePass | 见 memory beehive-port |
| 57-67 箱子/水晶/雕像/神龛/小屋 | BuriedChests/CaveHouse/Statues/JungleShrine... | 内容型 |
| 49 中途沉降 SettleLiquids | WorldGen.ts liquidSettlePass | 尾沉降=SettleLiquidsPart2 由读档承担 |
| 53 SmoothWorld / 54 Waterfalls | HalfBrickPass.ts | 坡面/半砖三路分支已 1:1（见 memory） |
| 82 Trees | TreePass（surfacePass 内嵌） | 半砖/坡面门禁已补 |
| 78 SurfaceOreAndStone（1456 cs:18559） | SurfaceDecorPasses.ts | OrePatch/StonePatch 1:1；gs.orePatchX 登记 |
| 79 FallenLogsAndWaterFeatures（cs:18625） | SurfaceDecorPasses.ts | 仅倒木段（水景=秘密种子）；gs.logX/logY→Flowers |
| 84 DyePlants（cs:20126） | SurfaceDecorPasses.ts | plantDye/PlaceDye(34*style)/MatureTheHerbPlants/656/752 |
| 91 Vines（cs:20338） | SurfaceDecorPasses.ts | 六类藤 52/382/62/528/636/205/638 + GrowMoreVines/CanHitLine + 444 凹龛 |
| 92 Flowers（cs:20592） | SurfaceDecorPasses.ts | 花圃重帧（tile3→73），消费 gs.logX/logY |
| 93 Mushrooms（cs:20744） | SurfaceDecorPasses.ts | 3/24→frameX144、201→270 帧重刷 |
| 96 LongMoss（cs:20915） | SurfaceDecorPasses.ts | PlaceTile184+TileFrame184(22*色号)；上游 MossAndMossCaves(17573) 已移植（MossPass.ts，收尾批） |
| 102 LilypadsCattailsBambooAndSeaweed（cs:22131） | SurfaceDecorPasses.ts | 518/519/571/549；GrowCheckSeaweed 已去重（BeachPass 海藻近似删除） |

## 已知管线偏差（备案，未修）

**执行序 = 注册序已确认**（WorldGenerator.cs:447 `_passes[PassResults.Count]` 逐个执行，
无排序/无 weight 重排）。1456 完整 105-pass 注册序见上表编号；与我们链的真实顺序偏差
（JS 与 oracle 双方一致地"错"——oracle 按 JS 链顺序转录，互验全绿 ≠ 原版等价）：

| 原版真实序 | 我们链现状 | 影响 |
|---|---|---|
| #20 Mushroom→#21 Marble→#22 Granite→**#23 FloatingIslands** | 岛在蘑菇/大理石**前** | RNG 流错位 |
| #26 OresAndShinies（Silt 后、Webs 前） | 排在很后（"矿石"槽） | 同上 |
| #30 Lakes、**#35 Gems（Beaches 后）** | Lakes+Gems 捆绑 | 同上 |
| **#33 MountainCaveOpenings→#34 Beaches（Dungeon 后、Gems 前）** | 紧跟 SurfaceCaves（太早） | 同上 |

- #15 WavyCaves：**dontStarveWorldGen 专用**（cs:12303 普通世界空跑零消耗），不构成偏差。
- 因此 19 个 checkpoint 中 terrain..surfacecaves 在原版序下依然有效；mcopenings 起全部
  在错误流位置执行——这是 seed-parity（对真 .wld）仍红的结构性根因之一。
- 修正需 JS 链与 oracle 同步改序 + 金标再生（共享文件，串行做）。
- 71 Pots / 77 Piles 以 legacy pass 原位运行（语义 1:1，无 oracle）。
- 73 SpreadingGrass + 86-90 杂草花混在 surfacePass（legacy 外壳）。
- 表面装饰子 pass 群（SurfaceDecorPasses.ts）插入位置：SpreadingGrass(18349) 之后、
  Traps(18769) 之前放 78/79（OrePatch/倒木需草面）；84/91/92/93 在 AlchemyHerbs 之后
  按 20126<20338<20592<20744 排列；96 紧随 ExposedGems(20874)；102 在 MicroBiomes(21785)
  之后。依赖销核（收尾批 2026-08-12）：LongMoss 的上游 MossAndMossCaves(17573) 已移植
  （MossPass.ts，"苔藓"槽=地狱箱之后/Pots 之前）；藤 638 的上游灰烬草 633 已在 hellPass 铺设
  （cs:13869-13915 外缘 17% 带+灰烬树 634）；藤 382 的上游草墙 63/65 已移植
  （GrassWallPass.ts = SurfaceDirtWallsToGrassWalls cs:19734，"草墙"槽=地表装饰之后/
  染料植物之前；66/68 是可放置安全版墙非世界生成产物，63/65 即解锁花藤）。
- DyePlants 的 MatureTheHerbPlants（cs:20135）原在 surfacePass 调用，已下沉到染料植物 pass
  （原版调用点），AlchemyHerbs 仍在 surfacePass（20109<20126 序保持）。

## 种子等价工作流（标准动作）

1. `dotnet run tools/golden/caves-oracle.cs <seedInt> <evil> tests/golden/caves-chain-<name>.json` 再生金标
   （'9293480'→9293480/evil 0；'SandboxWorld'→1511931452/evil 1）；
2. `npx vitest run tests/caves-checkpoint.test.ts` 双种子全等；
3. 改动前先读 `Terarria1456` 对应源码；掷骰序用 C# 实参左→右求值规则核对；
4. `rng.int(a,b)`≡闭区间 [a,b]≡`Next(a,b+1)`；`(int)` 截断=Math.trunc；(int)NaN=x86 Int32.MinValue；
5. 对账两侧 id 空间不同（JS 内部 vs oracle 原版 sheet），比较前先归一——历史乌龙多源于此。
