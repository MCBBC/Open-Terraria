# secret-seed-audit-matrix — 彩蛋种子全维度覆盖度审计（IIIII15，2026-08-28）

背景：用户实测醉酒世界(05162020)只有旗标识别、内容层大面积缺失；已派 M 车道修 DRUNK
GEN 面。本审计举一反三，把**全部 48 枚彩蛋种子**在四维（GEN/NPC/RUNTIME/FILE）上
做「vanilla 引用面 vs JS 实装面」对账，清出所有「旗标识别了但内容没实装」的债。

## 0. 结论速览

- **46 个唯一旗标**（9 特殊种子 + moreLightning/noLightning 在 1457 原版本就属于
  37 枚 SecretSeed 注册表内的第 36/37 位；JS 因历史口径单独列名。去重后
  9 特殊 + 35 秘密 = 44 行 + 2 lightning 行）。审计中另有 stormyweather/clearskies
  两文本别名在 vanilla 无独立条目（是 electric boogaloo/calm before the storm 的
  社区别名），不做重复行。
- **P0 整域缺失 15 枚（★IIIII22b 起 teamBasedSpawns 已清偿，余 14 枚）**：surfaceIsInSpace /
  biggerAbandonedHouses / startInHardmode / noInfection(fish mox) / hallowOnTheSurface /
  surfaceIsMushrooms(toadstool) / rainbowStuff(rainbow road) / digExtraHoles(jagged rocks) /
  portalGunInChests / halloweenGen(pumpkin season) / endlessHalloween(hocus pocus) /
  endlessChristmas(jingle all the way) / ~~teamBasedSpawns(royale with cheese)~~ /
  randomSpawn(how did I get here，重掷臂登记未接) / noSpiderCaves(arachnophobia，
  仅注释)。
- **P1 明显残缺 9 枚（★IIIII22b 起 dualDungeons NPC 域已清偿）**：drunk(换人支+NPC 域)、
  remix(starter 税务员支)、getGoodWorld(starter 爆破匠支)、worldIsInfected(Lilith/zombie
  starter 支)、mole people(noSurface, 地形重排大面)、sandy britches(表面沙漠交换带 finish)、
  planetoids(山体重排收口)、winter is coming(箱物变换+冻结洋面)、~~dualDungeons(NPC 出生
  区域扫描)~~、night of the living dead(初始血月态)。
- **P2 基本到位 22 枚**：FTW/dontStarve/celebrationmk10/zenith/skyblock/notTheBees/
  noTraps 双雷种子及 13 枚已在 FinalSeedCleanup/LivingTree/Teleporter 等落地的秘种子。
- 1458 增量核对：50 个旗标关键字在 1457↔1458 两棵 Terraria 树逐一计数**全等**
  （含 WorldGen.cs 字节级同源差异不涉及种子面）→ 本矩阵锚 1457 即覆盖 1458。

## 1. 口径与方法

1. vanilla 侧：`grep -rc <flag> Terarria1457/Terraria/**/*.cs` 全树文件级计数；
   特殊种子按 `X`(Main.*) 与 `XGen`(WorldGen.*) 联合匹配；SecretSeed 按 `X.Enabled`
   直读，并把派生 `Main.*` 运行时旗标的全部消费归并回母种子行（映射表 =
   `WorldGen.InitializeSecretSeeds()` cs:542-584）。
2. 四维归类：
   - GEN＝WorldGen.cs 正文/genpass（含 Do* 端点）；NPC＝NPC.cs + SpawnStarterNPCs
     pass 内的换人支（cs:19851-20066，虽物理上在 WorldGen.cs）；RUNTIME＝Player/
     Projectile/Main(事件节日渲染)/Rain/Liquid/Rain/Cloud/SceneMetrics/Collision/Chest
     (战利品)/Item/Map 等；FILE＝Terraria.IO/*(.wld 写读位)。
3. JS 侧：`grep -rE "\b<flag>\b" game/src/**/*.ts`，按目录归类到同四维；
   注意甄别「纯注释提及」（如 randomSpawn/noSpiderCaves 在备注里点名"登记未接"，
   计为零实装）。
4. vanilla 计数含注释行；V总 列用全树子串计数（含 Variations.* 派生名），GEN 列用
   `X.Enabled` 直读计数——两口径允许差（差值=派生名与字符串引用）；数值用于定级与
   抓整域缺失，不追求逐位数精确。

## 2. 总矩阵表

J 列记号：✓＝有实质实现（附主落地文件）；◇＝部分实现；✗＝零实装（仅解析器认识）。

| # | 种子 | 明文 | V总 | GEN v/j | NPC v/j | RUN v/j | FILE v/j | 级 |
|---|------|------|----:|---------|---------|---------|----------|----|
| 1 | for the worthy | fortheworthy | 244 | 75 / ✓ 多 pass | 101+ / ✓(:20034 爆破匠38 + unlockedDemolitionistSpawn——★IIIII20 pass 臂⑥+Game 链) | ~66 / ✓ Enemy·drops·lightTables·glow-off(Game:6814) | 1bit ✓ | P1(仅 GEN 数值面遗留) |
| 2 | drunk 05162020 | —(数字路由) | 158+4支 | 130+ / ◇→◆ **T1 攻坚中·88→78 红（IIII47,2026-08-29）**:#18 边缘残迹 ✅ 清偿(Spread.ts flood 边界 `>=w-5`→C# `>maxX-5`,cs:10054);0..27 槽满绿、首差 #28 揭幕(underworld 窗零骰写分叉≈4.1k 格:骰流 21,806,910 全等、JS 尾多 685k;嫌疑 quickWater/hellFort 余项/灰烬带 ghost 写);#32 地牢族仪器级定罪未修——主流全程逐位对齐+inner-instance 延续采样双向不对称=非骰写面,左翼[3104..3399]仅 JS 有;掷流仪新律=x86 SW_ROLLWIN 标签 K 实载 pcIdx K+1 骰——详见 content-parity「IIII47 批」章 | 5支 / ✓(:20043 派对女孩/:20016 机械师 ★IIIII14→IIIII20 收入链位;:19941 画家Jim 十周年支已落) | ~26 / ✓ evil翻转(Game:6211)·bg·sky·gel(★IIIII61 ShouldDropExtraGel 接线 NpcDrops,SpecialSeedFeatures.cs:5-13；余=菜单乐/logo/Chroma 域,证据关闭见 §9) | bit ✓ | P0(GEN 面)——修复中(T1 车道) |
| 3 | no traps | notraps | 53 | 40 / ✓ Traps·BuriedChests·MicroBiomes… | 2 / ✓(掉落禁陷阱类物) | ~9 / ✓ Enemy·导线可视 noTraps 门(WiresUI.cs:31-35→Game.showWires ★IIIII61) | bit ✓ | P2 |
| 4 | the constant | constant·eye4aneye | 91 | 53 / ✓ Beach·Dungeon·WavyCaves… | 3 / ✓ | ~33 / ✓ Player 黑暗(★IIIII61 DontStarveDarkness 1:1 落地)·饥饿链·PlayerVoice·SkyRenderer | bit ✓ | P2 |
| 5 | celebrationmk10 | celebrationmk10·5162021/5162011 | 165 | 113 / ✓ D批收官 | 10+主支 ✓ / 主支已落(内嵌 infected 支:19855 未移植) | ~37 / ✓ party·starfall(Game:6368/6431) | bit ✓+partyGenuine(WF:1027) | P2 |
| 6 | don't dig up | dontdigup | 482 | 267 / ✓ 广布~30 文件 | 85+ / ✓(:20007→cs:20007-20015 税务员441+savedTaxCollector——★IIIII20 pass 臂③+Game 链) | ~127 / ✓ Rain·Liquid·SkyRenderer·Eclipse… | bit ✓ | P1 |
| 7 | get fixed boi(everything) | getfixedboi | 12本体 | 1 / ✓(组合置八旗) | 2 / 随组合走 | ~8 本体 / 主题提示类 | bit ✓(:2027 由 remix∧drunk 推导) | P2† |
| 8 | skyblock | skyblock | 81 | 71+gen1 / ✓ denyAllGeneration 门广布 | 0 / ✓ TownNPC·NpcDrops(JS) | ~9 / ★IIIII61 ✓ SkyblockRuntime 动态普查(lowTiles/noAltars 八旗)+刷怪率÷2+史莱姆体内物六臂+夜始 roll 三门+掉落条件族 | bit ✓ | P2★ |
| 9 | not the bees | notthebees | 34 | 16 / ✓ NotTheBeesPass 等 | 2 / ✓ 商人17(pass 臂⑤ cs:20027 掷流记录+Game 链,★IIIII20)+变体向导228(十周年支) | ~15 / ✓ Bobber 渔业·Main 菜单 | bit ✓ | P2 |
| 10 | electric boogaloo | stormy weather 别名 | ~15 | 4 / ✓ StormLightningSpawner | 0 / n.a. | ~11 / ✓ proj1457 ·风雷调度 | WF:1433/2516 v≥323 ✓ | P2 |
| 11 | calm before the storm | clear skies 别名 | ~14 | 3 / ✓ 同上对称臂 | 0 / n.a. | ~11 / ✓ | 同上 ✓ | P2 |
| 12 | monochrome | monochrome | 17 | 17 / ✓ FinalSeedCleanupPass | 0 / n.a. | 0 | seedText ✓ | P2 |
| 13 | negative infinity | negativeinfinity | 16 | 16 / ✓ FinalSeedCleanupPass | 0 | 0 | seedText ✓ | P2 |
| 14 | invisible plane | invisibleplane | 20 | 20 / ✓ FinalSeedCleanupPass(+echoJustSomeThings 变体备案) | 0 | 0 | seedText ✓ | P2 |
| 15 | x-ray vision | xrayvision | 13 | 13 / ✓ FinalSeedCleanupPass | 0 | 0 | seedText ✓ | P2 |
| 16 | mole people | molepeople | 67 | ~60 / ◇ 仅 Beach·IceBiome·Oasis·WaterIce 四挂点，地形重排大面缺失 | 0 | 0 | seedText ✓ | P1 |
| 17 | save the rainforest | savetherainforest | 21+降参 | 21 / ✓ LivingTreePass | 0 | 0 | seedText ✓ | P2 |
| 18 | care bears movie | thecarebearsmovie | 23 | 14 / ✓ LivingTreePass 数量调参(skyblock/noSurface 级联) | 0 | 0 | seedText ✓ | P2 |
| 19 | I am error | iamerror | 69 | 48 / ✓ 微调函数+多 pass(BuriedChests·HellFort·Track…) | 0 | 0(★IIIII61 定谳：errorWorld 无任何运行时消费面——证据关闭，见 §9.2) | seedText ✓ | P2 |
| 20 | night of the living dead | nightofthelivingdead | 1+WF1 | 1 / ✓ graveyardSeedGate(WorldGen.ts:1446-1453)+初始夜/血月态(applyGraveyardInitialClockState,SecretSeedDoEndsPass.ts:805-817——WF.cs:1019-1024 臂) | 0 | ✓ 入世界时钟=夜+血月+time≈1tick(gen 侧桥接)；导入档走 seedFlags 同核 | WF:1019 ✓(parseSeed 并集) | P2★(审计初判 ✗ 系查证前旧态) |
| 21 | such great heights | suchgreatheights | 12 | 12 / ✗ | 0 | ✗ | seedText △ | **P0** |
| 22 | bring a towel | bringatowel | 1+WF重挂 | 1 / ✓ Weather.ts 常年雨 | 0 | ✓ | WF:3305 读回 ✗ | P2 |
| 23 | abandoned manors | abandonedmanors | 属性 :408 | ✓ CaveHouse 尺寸门+y 钳制（IIIII17）;★IIIII109 认证批=mile8 0..58 绿、台账前 15 attempt 逐格全等含 5 accept 同点位;残差=第 5 accept 屋 builder 掷耗差（移交,CXVII 章⑤） | 0 | 0 | seedText ✓ | P1(链建+残差移交) |
| 24 | how did I get here | howdidigethere | 3 | ✓ randomSpawn 重掷臂(vampireSeedFinishPass 共宿核外提,WorldGen.ts:371-377/SkyblockPass.ts:689——★IIIII41-T3①);★IIIII109 认证批=x86 重掷实锤(spawn=(3508,797)),mile8 102/103 唯一红=火把环快照时点语义;残差=spawn 落点 js(1560,634)≠x86——CheckForGoodTeleportationSpot 精简核非逐句（移交,CXVII 章④） | 0 | 0（★IIIII61 定谳：DoRandomSpawn 后置 GenVars.worldSpawnHasBeenRandomized 无其他运行时读者；出生即用新点，无专属运行时臂） | seedText ✓ | P1(链建+残差移交) |
| 25 | beam me up | beammeup | 2 | 2 / ✓ TeleporterPass | 0 | 0（★IIIII61 定谳：vanilla 无专属运行时臂——TeleporterGenerator 属 gen，运行时=通用导线传送机行为，证据关闭 §9.2） | seedText ✓ | P2 |
| 26 | too easy | tooeasy | 1→DoStartInHardmode :1905 | ✓ doStartInHardmode(SecretSeedDoEndsPass.ts:467-470=Main.hardMode+initializeHardMode V带) | 0 | ✓ flags.hardMode 落位随存档持久化 | seedText ✓ | P2★(审计初判 ✗ 系查证前旧态) |
| 27 | fish mox | fishmox | 6→DoNoInfection | ✗ 净化端点无 | 0 | ✗ | seedText ✓ | **P0** |
| 28 | does that sparkle | doesthatsparkle | 6→DoHallowOnSurface | ✗ | 0 | ✗ | seedText ✓ | **P0** |
| 29 | purify this(infectedSeed) | purifythis | 17+Main.infectedSeed 23 | 17 / ✓ Spawner·SceneMetrics·Game | +德鲁伊20 var1（:19986 臂 与 十周年内嵌臂 :19855 均 ✓——★IIIII20 pass 臂①/十周年三臂 + Game 链） | ~23 / ✓(注意 fish-mox 对冲 :3397) | bit WF ✓ | P1 |
| 30 | toadstool | toadstool | 5→DoSurfaceIsMushrooms | ✗ | 0 | ✗ | seedText ✓ | **P0** |
| 31 | sandy britches | sandybritches | 19+swapVariations | 19 / ◇ IceBiome·FinalCleanup·SurfaceDecor 三挂点 | 0 | 0 | seedText ✓ | P1 |
| 32 | truck stop | truckstop | 3 | 3 / ✓ TrapsPass | 0 | 0 | seedText ✓ | P2 |
| 33 | arachnophobia | arachnophobia | 2核心(variations 扩散~8) | ✓ HiveSpiderPass 整跳+GrassWallPass 反向门+savedStylist（IIIII41-T3②）;★IIIII109 **满绿认证 103/103×8ch 复跑双证**（旗面三重实证=#062≡#063 整跳 8/8 字节+蛛网 0+wld savedStylist=true） | 0 | 0 | seedText ✓ | ✅已认证 |
| 34 | more traps please | moretrapsplease | 2核心+variations 扩散 | ✓ MicroBiomes·Piles·Statues·Temple·Traps | 0 | 0 | seedText ✓ | P2 |
| 35 | rainbow road | rainbowroad | 5+彩虹液体绘制(:37022…:37914) | ✗ GEN 端点未接 | 0 | ★IIIII61 定谳：vanilla 无种子专用液体渲染臂(Liquid/Rain/Cloud/Map 零引用)——仅 DoRainbowStuff 尾段 tileSolid[379]=false 会话态，SW 已按运行期语义恒真；GEN 面(glowstick 箱物/彩营)归 D 车道 | seedText ✓ | P0(仅 GEN) |
| 36 | jagged rocks | jaggedrocks | 1→DoDigExtraHoles :2853 | ✗ | 0 | 0 | seedText ✓ | **P0** |
| 37 | planetoids | planetoids | 10 | 10 / ◇ Oasis·QuickCleanup·WaterIce·GravitatingSand 四挂点 | 0 | 0 | seedText ✓ | P1 |
| 38 | waterpark | waterpark | 18+finish | 18 / ◇ 七文件接近，finish 端点核对 | 0 | 0 | seedText ✓ | P2 |
| 39 | we don't even test for that | wedonteventestforthat | 1→DoPortalGunInChests :3004 | ✓ FinalSeedCleanupPass.doPortalGunInChests（IIIII17）;★IIIII109 认证批=x86 27 枪/174 箱实锤,mile8 0..75 绿、首红 #76=4 格 TNT 桶（PlaceSandTrap 清场邻格 Check2x2 横扫未复刻,移交,CXVII 章⑥;24vs27 枪=掷流位移下游投影） | 0 | 0 | seedText ✓ | P1(链建+残差移交) |
| 40 | winter is coming | winteriscoming | 11(:16781 冻洋/:8238 箱冰变换/finish) | SurfaceDecor 一挂点 ◇ | 0 | 0 | seedText ✓ | P1 |
| 41 | pumpkin season | pumpkinseason | 1(:20232 南瓜爆发) | ✗ | 0 | 0 | seedText ✓ | **P0**(S) |
| 42 | hocus pocus | hocuspocus | forceHalloweenForever 链(Main3/WF3)+:20232 双门 | ✗ 种子→flags.forceHalloweenForever 桥缺 | 0 | ✓ 运行时消费者已在(Game:23848)——只差桥 | WF ✓(读侧已有) | **P0**(S) |
| 43 | jingle all the way | jinglealltheway | forceXMasForever 链(Main3/WF3) | ✗ 同上 | 0 | ✓ Game:23845 已在——只差桥 | WF ✓ | **P0**(S) |
| 44 | horrible night curse(vampireSeed) | whatahorriblenighttohaveacurse | 2+Main.vampireSeed 24 | 12 / ✓ FinalSeedCleanup(+vampireSeedFinishPass 出生重掷) | starter 动物学家633 ✓ pass 臂②(cs:19999 记录+BestiaryGirlNames 第二掷终名,★IIIII20)+Game 链 | ✓ Sfx 吱响·Buffs·皮肤 draw + 商店双臂(向导火把+恶变火把/动物学家火把,Chest.cs:1727/:3397 ★IIIII61) | bit WF ✓ | P2 |
| 45 | royale with cheese | royalewithcheese | 14+ExtraSpawnPointManager.gen | ◇ GEN 面 settings 组装/RNG 等价接(gen 未含按队岛) ★IIIII22b | 0(地图层恒画注释见 Renderer:14195,登记余留) | ✓ ExtraSpawnPointManager 移植+Spawn 三分支接线+同种子重放跨端收敛 ★IIIII22b(R1-R5 偏差见 §8) | bit WF:2507 读 ✓ | P2★(GEN 组合带/地图层余留) |
| 46 | double daring dangers | doubledaringdangers | 50+dualDungeonsSeed 10 | 50 / ✓ Dungeon·Corruption·Hardmode·Track… | 6 / ✓ NPCSpawningFlagsForDualDungeons 区域扫描→出生表 + SceneMetrics Zone 重写 ★IIIII22b | Player4 区 Zone 类态 / ✓ Spawner 带重掷+safe 半化+SceneMetrics 接线 ★IIIII22b | bit WF:1432/2515 ✓ | P2★ |

† zenith 单体引用极少属预期（主题/提示层）；其内容后果完全由它组合置位的七种子各行债决定，见 §6。

seedText 持久化口径：SW 世界槽存用户原始种子串并在每次 worldgen parseSeed 复原全部
46 旗标（ui/WorldSelect.ts:36、world/gen/WorldGen.ts:65）——SW 自产世界的 FILE 维天然 OK；
上表 FILE 标注针对**导入原版 .wld** 场景（§3 尾注 F-1）。

## 3. P0 清单（缺什么 / 锚 / 规模）

| # | 种子 | 缺失域 | vanilla 锚 | 修复规模 |
|---|------|--------|-----------|---------|
| 1 | such great heights | GEN 整域（浮空高度带整体上移至太空，Do 端点） | DoSurfaceIsInSpace WorldGen.cs:2077（FinalizeSecretSeeds cs:579-702 内调用，下同） | M |
| 2 | abandoned manors | GEN（大型废弃屋：CaveHouse 尺寸门 + 与 errorWorld 的骰面 GenerateBiggerAbandonedHouses :408-420 errorWorld 时 Next(3)==0 臂） | 属性 ：408-420 + Terraria.GameContent.Biomes.CaveHouse 用点 | M |
| 3 | too easy | GEN+全程状态（起始即困难模式 gear/怪物/难度标记） | DoStartInHardmode :1905（FinalizeSecretSeeds 调用） | S-M |
| 4 | fish mox | GEN 终净化端点（全图猩红/腐化置换为草） | DoNoInfection（FinalizeSecretSeeds 调用） | M |
| 5 | does that sparkle | GEN 终端点（地表神圣草化） | DoHallowOnSurface（FinalizeSecretSeeds 调用） | M |
| 6 | toadstool | GEN（地表改蘑菇群系） | DoSurfaceIsMushrooms + 行内调用 :12517（FinalizeSecretSeeds 调用） | M |
| 7 | rainbow road | GEN+RUNTIME 彩虹液体观感 | DoRainbowStuff :2715 + Liquid 绘制分支 ：37022/:37914 | L |
| 8 | jagged rocks | GEN 地形打孔 | DoDigExtraHoles :2853（pass 调用 :12470） | S |
| 9 | we don't even test for that | GEN 战利品（特定箱必插传送门枪） | DoPortalGunInChests :3004（FinalizeSecretSeeds 调用） | S |
| 10 | pumpkin season | GEN 南瓜铺地表 | GrassPlantsEvilPlantsAndPumpkinsOnSurface pass 内门 ：20230-20232 | S |
| 11 | hocus pocus | GEN→RUNTIME 桥（生成完把 flags.forceHalloweenForever=true）+南瓜 gen 门复用 ：20232 | InitializeSecretSeeds :569-571;WF 读写 Main3/WF3 | S |
| 12 | jingle all the way | 同上 XMas 版（forceXMasForever） | :573-575 | S |
| 13 | royale with cheese | RUNTIME(MP)+GEN ExtraSpawnPointManager 出生点生成 | WorldGen.cs:1711 settings 组装 + ExtraSpawnPointManager.cs:21;WF:2507 | M-L（依赖现有房间制 MP） |
| 14 | how did I get here | GEN 出生重掷 | DoRandomSpawn :1896（文件 ：22750 vampire 共臂已另有宿主） | S |
| 15 | arachnophobia | GEN（蜘蛛洞剔除/反向加量 variations） | :273-291 getters；扩散门（dontStarve 蛛壁 :19797 等） | S-M |

换人支 P0（drunk/remix/getGood/worldIsInfected 四枚的 NPC 域残缺）合并进 §4 A 车道。

> FILE 附记 F-1：导入原版 .wld 时 seedFlags 只由 section 选项位回填
> （wld/WldParser.ts:176-189/387-400），不对 header 里 seed 文本跑
> parseSeed——凡以 `|purifythis` 型密码追加的原版档，秘种子导入即丢。修复 =
> WldImport 把 header.seed 过一次 parseSeed 并 merge（S）。

## 4. 修复车道分组建议（供主线派发）

- **A. NPC 换人支车道（S）——★IIIII20 已收官**：SpawnStarterNPCs else 链 7 支全数
  落地（pass 臂 + Game.ts starterKey 双链同构）：infected→德鲁伊20 var1、vampire→
  动物学家633（掷流记录+终名）、remix→税务员441(savedTaxCollector)、drunk×const→
  机械师124(IIIII14)、notBees×!const→商人17(unlockedMerchantSpawn)、FTW→爆破匠38
  (unlockedDemolitionistSpawn)、裸 drunk→派对女孩208(IIIII14)；另有十周年首 NPC 的
  worldIsInfected/remix 两臂(:19855-19871，zenith 组合主线)。落点=StarterNPCsPass.ts
  else 链 + game/src/core/Game.ts:4277/4333 选择链。普通种子/裸 skyblock 维持零副作用
  早退口径不变。
  覆盖行：#2 drunk / #6 remix / #1 FTW / #29 infected / #44 vampire。
- **B. 种子→世界态桥车道（S）**：endlessHalloween/endlessChristmas 桥 +
  startInHardmode + graveyardBloodmoonStart 初始夜/血月。四个都是"worldgen 收尾时
  置一个全局态"的小改，动一处 hook（generateWorld 完成 → world.flags）。
  覆盖行：#26/#41/#42/#43/#20(FILE 侧)。
- **C. 秘种子 finalize 端点车道（M）**：对照 `FinalizeSecretSeeds()`
  cs:579-700 逐个 Do\* 端点补齐——DoSurfaceIsInSpace/DoNoInfection/DoHallowOnSurface/
  DoSurfaceIsMushrooms/DoDigExtraHoles/DoRoundLandMasses 收口/DoExtraLiquidFinish
  核对/DoWorldIsFrozenFinish/DoErrorWorldFinish(balanced chests)。多数只是
  FinalSeedCleanupPass / 各 biome Pass 末尾追加端点；可按 pass 亲和拆给既有
  Terrain/Ice/Oasis/WaterIce/FinalCleanup 车道续刀。
- **D. 结构与战利品车道（M）**：biggerAbandonedHouses(CaveHousePass 尺寸+errorWorld
  骰面 :408)、portalGunInChests(BuriedChests 末尾插枪)、worldIsFrozen 箱物变换(:8238)、
  rainbowStuff 剩余端点+液体渲染观感、arachnophobia 门补接。
- **E. MP 出生点车道（M-L，可与多人组协同）——★IIIII22b 已收官（2026-08-28）**：
  royale with cheese 的 ExtraSpawnPointManager 全流程移植到
  src/world/spawn/ExtraSpawnsRoyale.ts（settings 组装/TryFind/分离门/fallback 百分位/
  Spawn :37911 三分支运行时消费），协议零改动走"同种子确定性重放"跨端收敛；
  dualDungeons 的 NPCSpawningFlagsForDualDungeons 区域扫描（结构体全文 +
  Spawner chosen-tile 尾支 + SceneMetrics.CalculateZones 尾支）落
  src/world/DungeonDualZones.ts 并接线 VanillaSpawner/SceneMetrics。
  余留（登记）：GEN 按队 Style13 岛生成(WorldGen.cs:22789)/landmassData 候选集三支、
  PrepareExtraSpawns 地下点整备、DoExtraLiquidAddBubbleBlocks minRadius 门(cs:1707)、
  TeamBasedSpawnMapLayer 地图层恒画(Renderer:14195)、remix 层带参数。
- **F. FILE 车道（S）**：WldImport seedText 补 parseSeed 合并（F-1）；fullSeedText 补
  zenith 128 位（ui/WorldSelect.ts 注释自标"zenith 128 未接"，仅影响复制串保真）。
- **drunk GEN 主账继续走 M 车道**（本审计不深审）：本报告只为它登记 A 车道的
  换人支边界，避免两车道互踩：M 车道=旗标⑨格+邪恶共存/生态重排；A 车道=
  spawn 处 NPC 替换与解锁旗（unlockedPartyGirlSpawn/savedMech/savedTaxCollector）。

## 5. 用户举例验证：drunk 向导→派对女孩

- vanilla：SpawnStarterNPCs pass 内 else-if 链最后一个种子分支
  **WorldGen.cs:20043 `else if (drunkWorldGen)` → :20045 NewNPC type 208
  （PartyGirlNames.Amanda）→ :20050 `NPC.unlockedPartyGirlSpawn = true`**；
  其上游优先序：infected(:19986)>vampire(:19999)>remix(:20007)>
  **drunk×const→机械师124(:20016)**>notTheBees(:20025)>FTW(:20034)，
  都命中时轮不到普通醉酒世界出向导；裸 else 才是向导 22（:20052-20054）。
  十周年世界里 drunk 另把"派对女孩 @+4"换成画师 227 Jim（:19938-19941）。
- JS 现状：game/src/core/Game.ts:4229 / 4265 starterKey 只三分支
  `vampireSeed?'zoologist':notTheBees?'merchant':'guide'`；drunk 落默认 guide；
  world/gen/vanilla/StarterNPCsPass.ts 文件头注④明言"其余为组合种子域登记未移植，
  本 pass 对非十周年世界零掷骰零记录早退"。**用户实测结论成立**：醉酒世界出生
  是普通向导而非派对女孩，unlockedPartyGirlSpawn 从未置位。

## 6. getfixedboi 组合爆炸面（只标注，不展开）

everything 会同时点亮 getGood/drunk/noTraps/theConstant/tenthAnniversary/remix/
notTheBees 八项（JS parseSeed 与原版 Everything 选项同构），因此它的"真实内容面"
等于其余七行的全部债务之和，另叠加 vanilla 中大量
`activeSecretSeedCount>=N` 级联（gray/treasure/mansion 平衡臂、errorWorldAdjustment、
extraFloatingIslandsReducedAmount 等）。这些计数级联依赖**同一张 seed 上多个秘种子
同开**的形态——JS 若未来支持多秘种子叠加输入，需先建 activeSecretSeedCount
等价计数（目前 parseSeed 单播一旗，countSites 无该计数点）。在本矩阵各行的
"级联字段"按独立语义实现即可；不建议为此单独开 zenith 车道。

## 7. IIIII18 批（2026-08-28）：FILE 导入桥 + 节日双旗

### 7.1 任务 A（F-1 清偿）：.wld 导入走 parseSeed 解析链

**定罪面复核（比矩阵 §3 F-1 更深一层）**：原版档 header 种子串不是单一种子——
`UIWorldCreation.FinishCreatingWorld`（cs:1004-1008）写侧协议为
`SetSeed(string.Join("|", _secretSeedTextsEntered) + "|" + SeedText)`：
每录入一枚秘种子向串首拼一段，因此**单秘种子世界串里该明文出现两次**
（如 `hocus pocus|hocus pocus|48152`）；`SetSeedToRandomWithCurrentEvents`
（WorldFileData.cs:419-425）另产 `pumpkinseason|` 前缀；`TryApplyingCopiedSeed`
复制串格式 `尺寸.难度.邪恶.九位和.|段…|底种` 也落同一字段。矩阵原文的
"`|purifythis` 型密码" 描述与该协议相符但低估了"多段+重复段+数字底种"形态。

修复实施：

- `src/world/gen/SeedEasterEggs.ts` 新增出入口 `parseSeedChain(rawSeed)`：按
  `|` 拆段、逐段过既有 `parseSeed`（与新创建世界同一解析层），命中段**并集**合并。
  单段/无分隔行为与 `parseSeed` 全等；重复段幂等吸收；纯数字段照常走
  SpecialSeedValues 数字路由（05162020/5162021/5162011 同源命中）。读侧比对
  语义锚 = `WorldFileData.TryParseSecretSeed` 循环（cs:296-309）。
- `src/wld/WldImport.ts` `parseWldToSave` 的 `header.seedFlags` 改双源并集：
  ①派生源=header.seed 过 `parseSeedChain`；②权威位=WldParser 从 section 读出的
  位面（九特殊+dualDungeons/moreLightning/noLightning 五位），后并。两源只落真值，
  空集保持 `undefined`（普通世界与旧档缺省同形）。主线程/worker 双导入路径
  （mainFlow.importWld、save.worker、SaveClient.importWld）均经此函数，一处修全通。
- **不回退核对（D 批 celebrationmk10 结论保持成立）**：自有 `.sbw.json`
  载入路径（loadSaveData/saveGame/serializeSave）零改动——header.seed 数字 +
  header.seedFlags 直注链原样；celebrationmk10 由 header.seed 再派生的显示链
  （ui/WorldSelect.ts worldIconName/fullSeedText）不受影响。

单元测试 `tests/wld-secret-seed-import.test.ts`（合成 v279/v326 .wld 固件，
writer 与 tests/wld.test.ts 同构参数化）：单密码导入硬等 / 多秘种子并集 /
getfixedboi 权威位不被污染 / drunk 数字路由自恢复 / 普通世界零漂移 / 随机样本
diff 快照回归 / 自有格式节日位往返。7 例全绿。

### 7.2 任务 B（车道 B 前半）：节日双旗 gen→flags 一桥

vanilla 锚 `InitializeSecretSeeds`（WorldGen.cs:573-579）：
`endlessHalloween.Enabled → Main.forceHalloweenForever = true`（hocus pocus）、
`endlessChristmas.Enabled → Main.forceXMasForever = true`（jingle all the way）；
该值随 .wld LoadWorldFlags 位落盘（WF:2471-2472，v287+），运行时消费 =
checkXMas/checkHalloween 三路或的现实日期分支。矩阵判 RUNTIME ✓ 仅 GEN→flags 缺桥。

实施：`src/core/Game.ts` `afterWorldLoad()` 头部（三条进世界路径汇合点，紧邻
setItemVariantWorld 世界态灌入）补 seedFlags→world.flags 折算，幂等且仅真值键：

```ts
if (w.seedFlags?.endlessHalloween && !w.flags.forceHalloweenForever) w.flags.forceHalloweenForever = true;
if (w.seedFlags?.endlessChristmas && !w.flags.forceXMasForever) w.flags.forceXMasForever = true;
```

- 新建 SW 自产 hocus pocus/jingle 世界生成完成即生效，随首次 doSave 经
  meta.flags→data.flags 落盘（SaveFile.ts:72/:178 → serialize.ts:441）；
- 存量旧档若带旗缺位则读档即修；
- 无该旗世界零触碰（守卫见上测试文件「普通世界零漂移」例），默认值不漂移；
- dawn 结算臂（Game.ts:6274-6275 Forever 压制 ForToday）语义不变。

实机探针（SW_ORIGIN=:5209，一次性脚本验后已删，源码备份与输出存
/tmp/iii18-out/probe-source-backup.mjs 与 /tmp/iii18-out/bridge-probe1.log）：
对照臂无两键且时钟不落季节位；hocus pocus 臂 flags.forceHalloweenForever=true 且
clock.halloween=true；jingle all the way 臂 flags.forceXMasForever=true 且
clock.xMas=true——八月现实日期下 10 断言全 PASS。

### 7.3 遗留登记（本批不做）

- `ui/WorldSelect.ts` 行图标/fullSeedText 对**多段种子串**（含 `|`）仍整串归一化，
  秘种子后缀匹配不到 → 图标回退素体（仅显示层，玩法/存档面已由本批桥通）；
  属 F 车道收尾项，待多秘种子 UI 输入落地时一并处理。
- fullSeedText 的 zenith 128 位缺失（注释自标）维持 F 车道 F-2 登记。
- night-of-living-dead 初始血月/startInHardmode 等重叠项不在本批边界
  （N1/B-C 车道负责）。

## 8. IIIII22b 批（2026-08-28）：E 车道收官——MP 队伍出生点 + 双地牢区域扫描

### 8.1 royale-with-cheese（行 #45，P0 → P2★）

vanilla 全链考证见 content-parity-vs-vanilla-2026-08-16.md「IIIII22b 批」章 §①。
JS 落地面：

- **GEN/RUNTIME 主面**：`src/world/spawn/ExtraSpawnsRoyale.ts` =
  ExtraSpawnPointManager.cs:10-459 全流程移植（GenerateExtraSpawns_Setup 候选集→
  GenerateExtraSpawns 点表构建[cs:91-113,PlayerTeamID.Count=6]→TryFindSpawnRandomly/
  TryFindSpawnAt[CandidateSearch cs:115-317]→GetFallbackSpawn/PercentileAvoid 百分位
  回退→TilesToAvoid 表 cs:8200-8267 减支 1:1）+ Player.Spawn :37911-37916 三分支的
  纯函数形态 `teamSpawnPlacement(w,team,bedActive)`（床点 > 队点 > 世界出生点；
  resolveTeamSpawnFloor=Spawn_GetPositionAtSpawn 精简核扫位，isAreaValidSpawnLite
  自证合法 ⇒ ForceClearArea 分支不可达=R5）。Game.ts `applyTeamSpawnPlacement`
  在 respawnPlayer 与 loadWorld 开局/加入两路径接线（starter/节日桥禁区零触碰）。
- **跨端分发**：协议 D 批冻结不动 ⇒ 不复制原版 msg157，改"同种子确定性重放"
  （UnifiedRandom 摄入 seed 哈希盐；主机/访客各自全量重算、世界 strip 同步保证输入
  一致 ⇒ 点表逐元素收敛；单机同路径不受影响）。缓存 World.extraSpawnPoints/
  extraSpawnMeta（'found'|'fallback'），不入档不进包。
- **登记偏差 R1-R5**（R2 remix 层带、R3 landmassData 候选三支与 GEN 按队 Style13 岛、
  R4 PrepareExtraSpawns 地下点整备、DoExtraLiquidAddBubbleBlocks minRadius 门）——
  GEN 组合带归后续批；地图层恒画（Renderer:14195 TeamBasedSpawnMapLayer 门）留显示域。
  ★SW-BP1 2026-09-07 复核（ExtraSpawnsRoyale.ts 头注同步）：R1 内坡度臂
  （ExtraSpawnPointManager.cs:248-251 halfBrick/topSlope×左右岩浆邻）已 1:1 接入
  specializedFloorOk（TileStore slope/half/liquidType 全承载）；R2 维持 remix=false
  结案（remixSurfaceLayerLow 仅 GenState 持有,须持久化车道;消费位五处坐标入注）；
  R3 维持结案（gs.skyblockIslands 已登记但 gen 期专用,运行期重放取不到=接通即
  新生/读档世界失同;RoundLandmass/ExtraLiquidBubbleSquare 零登记）；R4 维持结案
  （调用位=生成期尾 WorldGen.cs:22683+PlaceTorchesAroundSpawn genRand 密集续掷,
  接通须 worldgen 车道金标零处置）。

验证：tests/iiiii22b-team-spawns-dual-dungeons.test.ts A1-A5——双实例确定性收敛
（逐元素相等）/队 0=世界出生点/搜索命中对 ≥250 构造性分离（extraSpawnMeta 区分，
fallback 豁免=vanilla 同态；曾误把 fallback 对也要求分离被探针打回，落 meta 设计）/
双人合成场景/旗关+床门单机零漂移。

### 8.2 double daring dangers NPC 域（行 #46，P1 → P2★）

`src/world/DungeonDualZones.ts`=NPCSpawningFlagsForDualDungeons.cs 六入口 1:1
（CanScan 巨石/48/137/232 排除+SolidTile3 语义；ScanZonesFor sheet 级 switch 全臂：
163/200 双置、case123 三臂、泥土×DualDungeonsJungleBiomeWalls{64,204..207,15}、
Cavern BrickWallType=349、Temple=87、Conversion.Sandstone/HardenedSand 沙墙族、
地牢主砖 rockLayer 门）；两类消费接线：

1. VanillaSpawner.setFlagsForChosenTile 尾部（NPC.cs:1256-1281 位置序=SetSpawnFlags
   ForChosenTile 最后一段）：dual ∧ 地下 ∧ <UnderworldLayer → rand(7) 三层带重掷 +
   :432-440 九位覆盖序（dungeon/desert `&=`、LihzhardTemple 经 ddLihzhardLatch 替换
   玩家墙读数）+ GetSpawnArea safe 区半化（NPC.cs:964-966，狙击镜扩圈之后生效）。
2. SceneMetrics.scanScene 尾部（SceneMetrics.cs:714-738 同位）：玩家行向下 ≤300 格扫
   首个可判格重写九 Zone 位——非 dual 世界恒 null 直通（shimmer/atmospherics 先算位
   不吃覆盖值，序与 vanilla CalculateZones 相同）。

验证：B1 单臂对拍矩阵/B2 CanScan 受理门/B3 rand(7) band 三臂+覆盖序（dungeon 列
&= 保持真、平列 &= 清假）/B4 **非 dual 世界零扰动**（bandCalls==0 锁骰流不变）/
B5 SceneMetrics 重写对照实验（31 格地牢柱<250 阈值 ⇒ 计数路径不可达、dual 下扫翻真；
中心格 wallDungeon 收尾门同验）。

四护卫套件守恒全绿（20/20），pvp/mp-sync-pack/wld-secret-seed-import 回归绿。

## 9. IIII61 批（2026-08-30）：运行时维全量普查与收口

方法：以 Terarria1457 反编译源为准，对 **37 枚 SecretSeed 注册旗 + 9 特殊种子** 逐一
grep 其「非 WorldGen.cs / 非 WorldBuilding」消费面（Player/NPC/Main/Projectile/Chest/
Liquid/Rain/Cloud/Map/SceneMetrics/GameContent 全档），再逐条对 JS 实装面定级
（✅落地 / 🔒证据关闭=原版也无此运行时面 / ◇登记缺口）。上下两表 = 差集总账。

### 9.1 本批新落地（RUNTIME 差集清偿）

| # | 种子 | 落地项 | vanilla 锚 | SW 落点 |
|---|------|--------|-----------|---------|
| L1 | the constant | **黑暗伤害系统全量**（60t 危险文案/120t 后每 61 拍一击 250 伤+Item1 音/getGood 静默/复明 Safe 文案/死亡=DiedInTheDark(17)/dead·shimmer·失焦三早退） | DontStarveDarknessDamageDealer.cs 全文 + Player.cs:24550 + WorldGen.cs:6908 Reset | src/player/DontStarveDarkness.ts（新建）+ Game.fixedUpdate 接线（玩家中心格光照模长 ≥0.1 即安全,RGB Vector3.Length 口径 ÷255） |
| L2 | skyblock | **WorldGen.Skyblock 八旗动态普查**：lowTiles/noAltars/noDungeon/noTemple/noHellstone/noFossils/noLifeCrystals/noHellforge；30t/列滚动巡检、尾列 Calculate 重算+清零（原版 totalX 回卷节律）、进图暖扫取真首态 | WorldGen.cs:3045-3240 class Skyblock + UpdateWorld :72065-72072 + CountTiles :71686-71748 | src/world/SkyblockRuntime.ts（新建）+ Game.afterWorldLoad/fixedUpdate；World 挂动态旗字段 |
| L3 | skyblock | 刷怪率 ÷2（紧跟地牢 rate=10 臂后） | NPC.cs:791-793 | VanillaSpawner.getSpawnRate 尾段 |
| L4 | skyblock | 地狱侧城镇=1 两掷整体跳过（零掷流） | NPC.cs:806-821 | VanillaSpawner deep 城镇臂 |
| L5 | skyblock | GetZombieSettings 双臂：style∉{4,5} 1/3 重掷为 4/5；spawnArmedZombies=false | NPC.cs:5602/:5615 | VanillaSpawner :1495-1510 |
| L6 | skyblock | 火把僵尸前插臂（!墓园 && !水 && lowTiles && !DownedAnyPreHardmodeBoss → 1/3 火把僵尸/基础史莱姆）；连带补 spawnArmedZombies 门进 :4565/:4624/:4644 三处持械臂 | NPC.cs:4691-4713 | VanillaSpawner 表层夜带 |
| L7 | skyblock | GetGnomeChance lowTiles 档（remix→20 否则 ×200，场上有侏儒再 ×4000；remix 尾除 2）——①③两支分母同步接真值 | NPC.cs:5383-5405 | VanillaSpawner 侏儒支 |
| L8 | skyblock | 史莱姆体内物六臂：主桶调参(lowTiles maxValue15/maxValue220/num2+4/-6+5)、狱石174(noHellstone&&骷髅王后 1/15)、沙漠化石3347(noFossils 1/5)、水晶29(rockLayer&&(noLifeCrystals‖lowTiles)&&!AnyLifeCrystalSlimes 1/200)、语音物品(lowTiles 地下 1/1000→GetRandomVoiceItem Next(14) 池 5500-5509/5484/5485/5534/5499)、表层副桶 194/195/62/27 号位同源 | NPC.cs:60957-61104 + AnyLifeCrystalSlimes :90966 + Item.GetRandomVoiceItem Item.cs:49431 | entities/Enemy.ts slimeRollContainedItem（★互斥 else-if 链同构） |
| L9 | skyblock | 夜始事件三门：EoC 分母 3→10 与 noAltars 豁免臂从 !!sf.skyblock 近似升为动态旗；机械臂 altarCount>0‖lowTiles；海盗自然臂同式 | Main.cs:66244-66251/:66265/:66441 | Game.ts crossed(DUSK) 块 |
| L10 | skyblock | 掉落条件族四条件接真值：SkyblockIsUp(低格蜂蜜块 189/435/188/434→9)、SkyblockIsNotUp 取反、SkyblockIsUpNoSickle(+未持镰刀 1786 门)、EyeOfCthulhu…NoAltars 数据源升动态 | Conditions.cs:1516-1566 | drops/NpcDrops.evalCond + Enemy 注入 ctx.skyblockLowTiles/playerHasSickle |
| L11 | the constant | dark dealer 以外：黑暗文案走产品 l10n `Game.DarknessDanger/Safe`（嵌套键直读,无需新增 Mods 键） | Language Game.* 包 | Lang.text 内建 |
| L12 | drunk×tenth | ShouldDropExtraGel → evalCond 'DropExtraGel'/'NotDropExtraGel' 从恒 false/true 接特征位（tenth && drunk && !remix && !ntb） | SpecialSeedFeatures.cs:5-13 + Conditions.cs:448/:466 | NpcDrops.evalCond + ctx.extraGelWorld |
| L13 | drunk×tenth | ShouldDropExtraWood → 树族木材堆叠 ×2（dropIsWood 门,蘑菇格豁免）、棕榈 ×3 | SpecialSeedFeatures.cs:15-24 + WorldGen.cs:65742/:65778 | Game.dropVanillaTreeLoot/棕榈支 |
| L14 | vampireSeed | 商店双臂：向导 3（vampire&&infected&&!HM → 火把8+猩红/腐化火把4386/4385）；动物学家 633（vampire&&!infected → 火把8） | Chest.cs:1726-1739(case3 尾)/:3397-3402(case23 尾) | Game.shopStockFor 尾段 |
| L15 | no traps | 导线可视化 noTraps 门：击败骷髅王前整层隐藏（含 F7 强制/装备透视镜两路） | WiresUI.cs:31-35 DrawWires 首门 | Game renderer.showWires 计算 |
| L16 | 顺手修复 | worldGen worker 「process is not defined」启动炸：IceBiomePass II48 探针钩漏 typeof 守卫（浏览器 worker 无 process → pass 4/60 必崩、boot 挂死） | 同文件既有守卫约定/HellFortPass:104 注 | IceBiomePass.ts:23 加 typeof 守卫 |

### 9.2 证据性关闭（原版也无此运行时面 / 本域外属 GEN·FILE 车道）

| 种子 | 结论 | 依据（1457 全树 grep 非 gen 面 = 零命中） |
|------|------|------------------------------------------|
| beammeup | 无专属运行时臂——TeleporterGenerator 属生成期，运行时传送=通用导线机制 | Player/Main/Liquid 零 teleporter 引用 |
| portalGunInChests | 战利品(gen-time 塞箱)+标准物品行为，无种子运行时代码 | DoPortalGunInChests 仅 WorldGen 内部 |
| rainbowroad 运行时 | 彩虹液体渲染**在原版不存在**（此前审计 P0 行表述有误）；唯一运行时残片 tileSolid[379]=false 为游戏期全局语义，SW 的 v_379_bubble solid:false 已恒覆盖 | Liquid/Rain/Cloud/MapRenderer 零 SecretSeed 引用 |
| errorWorld(iamerror) | 全部消费在 HouseUtils/HouseBuilder/EnchantedSword/DungeonHall 生成随机化；无消息盒/视觉/地图运行时钩 | Chest.cs:408 类目查证（census Agent-B） |
| randomSpawn(howdidigethere) | DoRandomSpawn 置 GenVars.worldSpawnHasBeenRandomized 后无其他读者；出生即用新点 | GenVars.cs:34 reader 面 |
| noSurface/surfaceIsInSpace/biggerAbandonedHouses/digExtraHoles/pooEverywhere/extraLivingTrees/extraFloatingIslands/coat·paint 四族/hallowOnTheSurface/noInfection/surfaceIsMushrooms/surfaceIsDesert 地形族 | 纯 GEN 烘焙族——效果随 tile 落盘自然成立，无运行时再读点；后续 P0 修复全部归 C/D GEN 车道 | census §per-seed EXPLICIT ZEROS 清单 |
| actuallyNoTraps/runsForAYear(bringatowel) | FILE 车道尾注：FixEndlessRainWorlds(WF.cs:3307) 对 >v317 档清雨的保真依赖 seedText codes——SW WldImport 已过 parseSeedChain 并集（IIIII18 §7.1），导入侧天然符合 | WF.cs:3300-3312 ↔ SeedEasterEggs.parseSeedChain |
| startInHardmode | 审计行初判 ✗ 系旧态——doStartInHardmode 已落（SecretSeedDoEndsPass:467），flags.hardMode 随存档持久化，导入档由 WldParser hardMode 位直接回填 | WorldGen.cs:1905-1908 + WF:1310/:2113 |
| nightofthelivingdead | 初判 ✗ 系旧态——applyGraveyardInitialClockState 已落（夜+血月+time≈1tick） | WF.cs:1019-1024 |
| notthebees 渔业双臂/钻探臂 | R14-E13①② 已先行落地（honey wipe 50%(:20730)/丛林 flag 50% 弃掷(:20989)）；「pickaxe 不能采 honey-hive trap」项按 tiles 域登记到 F 后续核对（Chest.cs:1411 经核为本批前已实现态——待专项复核不阻断） | Projectile.cs:20700-20760 ↔ entities/Bobber.ts fishingCheck |
| tenthAnniversary 大面 | party/starfall/partyGenuine/rain概率/EoC窗/zoologist 解锁链等已在 Game 前批落地；本批续接商店 gel/wood 特征位（见 L12/L13）；Star.cs:162 anySecretSeedIsActive 流星初速微扰=纯视觉小面，登记后续 | census classic §5 |

### 9.3 登记（非本域归口）

- remix 音乐深度带重排（Main.cs:12101-13202 血月/日食/地底 BGM 段）与 IsItDay 假日门：
  属音乐系统专项，本批不动（RUNTIME 主面 Rain/Liquid/SkyRenderer/Eclipse/SpawnStrata
  已 ✓）。
- 自然史莱姆王 roll（Main.cs:65900-65916）：SW 未实装该通用功能，lowTiles 分母 ÷5 臂
  待通用功能落地时一并接入。
- Star.cs anySecretSeedIsActive 秘种子流星微调：纯视觉，低优先登记。
- SkyblockIsland 出界致死（Player.cs:24292 ByOther(21)）：SW 边界逻辑已统一出界死语义
  （Player.wrap 段），skyblock 域自动满足，不做世界级分流（避免破坏既有通用回归）。
