# 终局复核：所有种子世界内容实装与正确性状态账本（2026-08-29 · 只读复核）

> 任务：回答「是否所有种子世界内容都已实装，且内容无误」。方法=通读三份权威记录
> （secret-seed-alignment-master-plan.md §10／secret-seed-audit-matrix-2026-08-28.md 全文／
> content-parity-vs-vanilla-2026-08-16.md「终局·七链满绿宣告」章+IIIII14~40 各批章），
> 并对每条 T2/T3 结论做代码现实抽查（grep 消费点+tests 存在性核对）。本文只读新增，零 src/tests 改动。
> 交叉锚：终局宣告章 = content-parity-vs-vanilla-2026-08-16.md:18032-18122；
> 审计矩阵 = secret-seed-audit-matrix-2026-08-28.md；总计划 = secret-seed-alignment-master-plan.md。

## 0. 总判定句（直白回答）

**不是。「全部种子内容已实装且无误」不成立；准确状态是分层的三级事实：**

- **T1（x86 真值认证，tile 面逐字节）**：7 条 mile8 认证链覆盖 4 枚彩蛋种子
  （theConstant/notTheBees/noTraps）+ 普通随机种子默认路由的四个数字种子 lane
  （g 9293480／m 20260811／s22222／12345），0..105 槽 × 8 通道零差（终局宣告 2026-08-29）。
  ★T1 覆盖的是**生成期 tile 面**，这些种子的运行时域（theConstant 的 hunger/黑暗/sepia、
  NTB 音乐钓鱼折半等）不在宣告范围。
- **T2（功能落地+生成期断言/控制组/tests，无专属 x86 真值金标链）**：约 25 枚旗标内容面
  有实质落地并有探针/tests 收口（详见 §2 表）：DRUNK 两波落地、celebrationmk10 主面、
  九秘终结面九枚、abandoned manors、portalGunInChests、节日双旗桥、wld 导入还原桥、
  starter 换人支七臂、royale-with-cheese 队点系统、dualDungeons NPC 域等。
  它们的验证都是**静态期望/阈值断言/构造性对照，非 x86 逐位对拍**——这是 T2 与 T1 的本质差别。
- **T3（明确登记未做或部分做）**：5 个域性缺口 + 若干部分实现：
  rainbow road 运行时液体观感层、
  FTW(IIII42 批车道已启动,G2+官方仲裁互证,0..9 槽绿)/REMIX(IIIII43 已启动)/Skyblock(达标出线)/GFB 四条大线、HiveBiome 内参、
  组合叠加语义（activeSecretSeedCount）等。
  ★IIIII41 批（2026-08-29）已清三件：randomSpawn 掷臂接线（T3→T2★）、
  arachnophobia 蜘蛛洞域（T3→T2★，多秘计数组合债另案）、双雷世界面覆盖度定谳+DoRainsForAYear 臂补齐（见 content-parity doc「IIIII41 批」章）。

另注：T1 的「普通种子已认证」是**按数字种子逐个认证**的（四个 lane）；任意用户输入的其他
数字共享同一代码路径，结构上被覆盖，但不构成逐一逐字节断言。

## 1. 三级总表（46 唯一旗标逐一归类）

级别记号：**T1**＝tile 面随认证链到顶；**T2**＝实装+探针验证（⚠️后附验证局限）；**T3**＝登记未决
（附补齐预估 S/M/L）。行序按特殊 9＋双雷 2＋秘密 35（中文俗名照 audit-matrix）。

### 1a. 特殊九种子

| 旗标 | 种子 | T 级 | 证据锚 | T3 补齐预估 |
|---|---|---|---|---|
| notTheBees | not the bees | **T1** | 终局宣告② ntb 链 md5 e8d58787…；NTB #98→#105 六批滚绿归零（IIII9/11/24/28）；运行时族（音乐86/bgStyle3/钓鱼折半/商人货架/spawner）=行#9 P2 维持 | —（运行时族 P2 待续 S-M） |
| drunkWorld | 05162020 醉酒世界 | **T2** | IIIII14 章（30 消费点，双邪共存 P0）＋IIIII21 章（浮空岛族/FDC 绘装+宝箱/地牢入口族/神庙三倍体五簇中四簇）；tests/drunk-world-gen.test.ts 两用例＋探针 /tmp/{iii14,iii21}-out | ⚠️验证局限=静态阈值断言非真值对拍；残留见下 1e |
| tenthAnniversary | celebrationmk10 十周年 | **T1 在途（收官挂起）**（IIIII49 批：mile8 终局读数 r12=#32 W×4+【#59 Δ+3,153 骰】双残差；掷窗语义定谳+house 仪三件套+_i49snap2 双快照；两残差均取证完未定罪，移交下批——收口路径=存档回放 harness+门级 mutation bisect / 99 写链在 Dungeon pass 内部 ring 未定锚） | truth 链维持 iii48-out/x86-celeb（rig1 复跑逐字节验证）；celebnorm 控制链已 x86 重产（iii50-out/rigcn）；并行车道占用 dungeon 共享域故 #32 只登记不改码 | #59 尾超掷 + 入口塔弧 W×4 + 尾段级联(#63/#65/#67/#71/#85/#89/#97/#98/#103) 待 A/B 后复审 |
| theConstant | the constant | **T1** | 终局宣告② const 链 ef67edb2…；worldId t=16 跳掷铁证收录（master-plan §2）；hunger/黑暗/sepia 运行时族=行#4 P2 非 tile 面 | —（运行时族 M） |
| getGoodWorld | for the worthy | **T1★**（2026-08-29 IIII42 认证车道启动：G2 真值链 /tmp/iii44-out/x86-ftw 建成——dotted autocreate 配方 seed="1.1.1.4.1671560105"，**终态 act/typ/wal/liq/lty/half/slope 七通道 ≡ 官方 Steam TerrariaServer.exe v1.4.5.8 同配方产物**（外部仲裁级中立性）＋sum0 对照点官方互证；链内 **0..9 槽 mile8 全绿**=tile 面逐字节顶到 x86 真值，TileRunner:77679 strength/steps 增强＋:77707 num3 岩浆位两修落地（普通种子流零扰动·七满绿链回归 106 行×7 链全 0 坏行+金标六件套 29 测试全绿），首差 #10 Small_Holes 池味残差族（Next(4) 序列 P10 内一次性错位≈4.9k 格）、#18 起级联为现役前沿） | 首差槽归因=掷流仪器缺口（rig 端 ROLLWIN/TAGLOG 钩在 L1 二进制 cb5cdb94 缺席、rrrr-rigs 今日树重建输出漂移不可用作仪器——补齐方案 content-parity IIII42 章 §⑤）；残余台账：SpiderCaves×3(:17492)/Moss 强制带(:17625)/tileSolid[56] 开窗↔还原(:16870,:21073)/Traps 组合臂(:21241,:21392)/FinishGetGoodWorld 油漆族(:22639)/AddHellHouses(:32449)/makeTemple×3(:33756)/AddBuriedChest num10=52(:36425)/SonOfLakinater lava湖(:80918,recon「不支持」记载翻案)/ShroomPatch(:81107)/neonMoss(:9777)/ItemVariants 物品池域 |
| noTraps | no traps | **T1** | 终局宣告② notraps 链 md5 85236314…；IIII40 §③ #105 Final_Cleanup 八通道归零收官 | — |
| remix | don't dig up | **T1★**（2026-08-29 IIII43 认证车道启动；链内 0..11 槽 mile8 全绿=tile 面逐字节顶到 x86 真值，首差 #12 Rock_Layer_Caves 为现役前沿） | G2 真值链 /tmp/iii45-out/x86-remix（rig-v ≡ rrrr-app1458 双产 848/848 逐字节相等）；TerrainPass/沙团/隧道/山丘/Mountinater×1.5/DirtInRocks 反转/Clay 深域带/SmallHoles 折减/DirtLayer ×2×1.9/RockLayer ×1.1+0.7+附加环 remix 支已按 cs 落地，七满绿链回归零扰 | 首差槽 #12 归因进行中（rig 掷窗 p12=9,017,229 vs JS 8,541,215，Δ≈47.6 万主骰；仪具 tools/_i43{b..i}+SW_ROLLWIN 配方在案） |
| everything | get fixed boi | **T3†** | 见 §3 组合专项 | 组合专属语义 M＋继承全债 |
| skyblock | skyblock | **T1**（★IIIII44 批,2026-08-29:由 T3 升格） | 加型生成器本体已 1:1 实装（`vanilla/SkyblockPass.ts`＝GenerateSkyBlockWorld cs:22725-23021 + SkyblockIsland cs:23022-23821 + Skyblock 类 deny 族谓词 cs:3029-3250）；x86 真值链 G2=/tmp/iii46-out/x86-skyblock（seed_skyblock=1+seed=20260829 evil=1 小图）mile8 **107 槽×8ch 全绿首差无**（probe /tmp/iii46-out/i46-final.log）；抑制边界按 x86 pc.txt 掷数逐槽对齐补齐（GravitatingSand/Dunes 门后主体/CaveWalls 翻转三支保留/denySome 全族=~40 处）；A/B 中立性：g/s22222/const/m/notraps/ntb 六链 mile8 rc=0 首差无、12345 与 iii47 认证基线同签名、金标六件套+四护卫 rc=0。残债=非 tile 面：运行时 lowTiles 普查族（Sky crate/TownNPC 进度/Enemy 容器/NPC 换挡）、NpcDrops SkyblockIsUp 条件、ExtraSpawnsRoyale landmassData 候选（team 岛）、extraLivingTrees 组合 GrowLivingTree 特化支（gs.skyblockExtraTreeAt 已登记锚位）、`.wld` 写侧 v302 位（本仓无 writer）。★复核批(2026-08-30)：运行时域 `src/world/SkyblockRuntime.ts` 已落地（并行会话建）并由本批守卫加固——hasWall 记账按 CountTiles cs:71743 无条件化修正＋anchorSets 全键行为面常跑护栏 | — |

### 1b. 双雷（1457 SecretSeed 注册第 36/37 位）

| 旗标 | 种子 | T 级 | 证据锚 | T3 补齐预估 |
|---|---|---|---|---|
| moreLightning | electric boogaloo | **T2✚** | StormLightningSpawner.ts ＋ projTargets/Game/WldImport/WldParser 共 6 文件消费；★IIIII41 定谳：世界生成期消费点恰两处=InitializeSecretSeeds 旗标复制(:579)＋DoRainsForAYear 风暴臂(:1878←:11261，windSpeedTarget±0.8×Next(2)=唯一 genRand 掷点)，tile/rods 零消费；JS 已补 DoRainsForAYear 臂（vanillaTerrain prelude 原位挂载+weather 直写持久） | 探针 probe-final.log P5 全绿；余下非任务域=rainsForAYear×moreLightning x86 受控对拍基线（取证型 S，与本批语义面无关） |
| noLightning | calm before the storm | **T2✚** | 同上对称臂（同 grep 集）——其世界面仅存档布尔 WF57:1433-1434（WldParser.ts:399-400 已读），gen 期零骰零写；运行时 :72438 门已并 | 同左；结论一行=「世界生成期无旗标消费缺口」 |

### 1c. 秘密 35 枚（按注册序；✓＝有实质实现并收口）

| 旗标 | 种子 | T 级 | 证据锚 | T3 残留预估 |
|---|---|---|---|---|
| paintEverythingGray | monochrome | T2 | FinalSeedCleanupPass（FullCleanup 家族涂装）＋16 文件消费；行#12 P2 | — |
| paintEverythingNegative | negative infinity | T2 | 同上；行#13 P2 | — |
| coatEverythingEcho | invisible plane | T2 | FinalSeedCleanupPass doCoatEverythingEcho；行#14 P2（echoJustSomeThings 变体备案） | — |
| coatEverythingIlluminant | x-ray vision | T2 | 同上 illuminant 臂；行#15 P2 | — |
| noSurface | mole people | **T3** | 仅 Beach/IceBiome/Oasis/WaterIce 四挂点（audit 行#16 ◇）| 地形重排大面 **M-L** |
| extraLivingTrees | save the rainforest | T2 | LivingTreePass 调参臂；行#17 P2 | — |
| extraFloatingIslands | the care bears movie | T2 | LivingTreePass 数量调参（skyblock/noSurface 级联）；行#18 P2 | — |
| errorWorld | I am error | T2 | 微调函数＋BuriedChests/HellFort/Track 多 pass（行#19 P2） | balanced chests 箱物级联未接（S-M） |
| graveyardBloodmoonStart | night of the living dead | T2 | **IIIII16 已落**初始夜+血月态（WF ResetTempsToDayTime :1019；bloodMoon/timeOfDay/moonPhase 探针 ✓＋墓碑 1818）；tile 面走 potPass graveyardSeedGate（WorldGen.ts:1446-1453）。⚠️audit 行#20 的「RUNTIME ✗/WF ✗」是同日批前判定，已被 IIIII16 覆盖 | — |
| surfaceIsInSpace | such great heights | T2 | IIIII16 ①（doSurfaceIsInSpace :2077；wall73 全列清扫，零掷）＋SecretSeedDoEndsPass.ts:403 | — |
| rainsForAYear | bring a towel | T2 | Weather.ts 常年雨（consumer 在案） | WF:3305 读回缺（S） |
| biggerAbandonedHouses | abandoned manors | T2 | IIIII17 全量（CaveHousePass 四读点+ctor Top 升序暗坑定谳）；探针 40 座屋分布+对照 37 座屋 {1..3} | ⚠️本域无 x86 rig 逐骰基准，「以静态期望断言收口」（章内原话） |
| randomSpawn | how did I get here | **T2★** | ★IIIII41 清偿：randomizeWorldSpawnCore/doAdditionalChangesAroundSpawnCore 外提共核（vampire 同宿）+ doRandomSpawnFinishPass 尾段接线（finalize 上提 SpawnPoint 写回的管线序注）+ 着陆二段复核/规避表四支补全/parseSeedChain 多段协议修复；探针 /tmp/iii43-out/probe-final.log P0/P1/P2 | 残留=remix 岛链尾(:23015)/skyblock 重掷域(:22750)/FinishRemixWorld 让位(:26855) 随未实装车道；TownNPCPositionsCleanup 未移植（S 备案） |
| addTeleporters | beam me up | T2 | TeleporterPass.ts＋WorldGen 接线；行#25 P2 | — |
| startInHardmode | too easy | T2 | IIIII16（hardMode=true→initializeHardMode 管线 rng 直通）；flags.hardMode 探针 ✓ | — |
| noInfection | fish mox | T2 | IIIII16（doNoInfection 全图 Convert(0)；type==70 免净怪癖照录）；infectedSeed 共享函数 | — |
| hallowOnTheSurface | does that sparkle | T2 | IIIII16（doHallowOnSurface；墙 187/216/63..68 walls-only 支） | — |
| infectedSeed | purify this | T2 | 臂①德鲁伊 Lilith var1（IIIII20 :19986）＋Spawner/SceneMetrics/Game；fmx 对冲 :3397 注意项 | townNpcVariationIndex=1 渲染档无特判（Renderer 债，S-M） |
| surfaceIsMushrooms | toadstool | T2 | IIIII16（首掷 :12517+终结 ×2 :607-614 连调怪癖照录） | — |
| surfaceIsDesert | sandy britches | **T3** | 三挂点已接（IceBiome/FinalCleanup/SurfaceDecor，audit 行#31 ◇） | 表面沙漠交换带 finish 端点 **S-M** |
| pooEverywhere | truck stop | T2 | TrapsPass；行#32 P2 | — |
| noSpiderCaves | arachnophobia | **T2★** | ★IIIII41 清偿：runSpiderNestPass 整跳门（cs:17472 变体门，连 tileSolid 翻转一起跳）+ GrassWallPass Next(maxValue) die-order 显式化 + savedStylist worldgen 写（cs:688-691）；探针墙62 41916→0、蛛网 −41%、savedStylist ✓ | 组合债=activeSecretSeedCount 计数（count<4 跳过/count≥4 ILied 反向语义 :17539/:20185：本仓多秘组合保守让位，helper 见 SeedEasterEggs.ts）**M**（另案） |
| actuallyNoTraps | more traps please | T2 | MicroBiomes·Piles·Statues·Temple·Traps 五支；行#34 P2 | — |
| rainbowStuff | rainbow road | **T3** | GEN 面已落（IIIII16 doRainbowStuff :2715+OverGrownDungeonWithRainbowMoss；disco126/箱染/苔砖探针 ✓）但**液体彩虹 shader 观感层未接**（render/ 无对应分支；Liquid 绘制 cs:37022/37914） | 渲染车道 **M-L** |
| digExtraHoles | jagged rocks | T2 | IIIII16 doDigExtraHoles（TileRunner type=-1 打孔；skyblock 早退门在 WorldGen.ts:884） | — |
| roundLandmasses | planetoids | **T3** | Oasis/QuickCleanup/WaterIce/GravitatingSand 四挂点已有（行#37 ◇） | 山体重排收口 **M** |
| extraLiquid | waterpark | T2◇ | Desert/TileCleanup/WaterIce/FinalCleanup 多文件门（行#38 P2，finish 端点待核对） | finish 核对 **S-M** |
| portalGunInChests | we don't even test for that | T2 | IIIII17（FinalSeedCleanupPass #18 位；前 8000 箱每箱恒掷 Next(7)；槽0永不插枪）；渗透率 0.121 静态期望 | ⚠️同上无 rig 基准 |
| worldIsFrozen | winter is coming | **T3** | SurfaceDecor 一挂点（行#40 ◇；:16781 冻洋/:8238 箱冰变换未接） | **S-M** |
| halloweenGen | pumpkin season | T2 | IIIII16（草2 Next(15) 南瓜株+GrowPumpkin 帧归约；PlacePumpkin :52898） | — |
| endlessHalloween | hocus pocus | T2 | IIIII18 桥（Game.ts:3824 afterWorldLoad 折算 forceHalloweenForever）＋南瓜门复用；实机探针 10 断言+wld 往返例 | 显示层图标（F 车道）S |
| endlessChristmas | jingle all the way | T2 | 同上对称臂 Game.ts:3825（forceXMasForever） | 同上 |
| vampireSeed | what a horrible night to have a curse | T2 | 臂②动物学家（IIIII20 :19999）＋vampireSeedFinishPass 出生重掷（WorldGen.ts:2155 共臂宿主）＋tests/vampire-seed.test.ts＋Sfx/Buffs/皮肤 draw | — |
| teamBasedSpawns | royale with cheese | **T2★** | IIIII22b 全流程（src/world/spawn/ExtraSpawnsRoyale.ts；同种子确定性重放范式）；tests/iiiii22b-team-spawns-dual-dungeons A1-A5 | **R1-R5 五项登记偏差**（Style13 队岛/landmassData 三支/地下点整备/bubbleBlocks minRadius/地图层恒画 Renderer:14195）＝组合带 M |
| dualDungeons | double daring dangers | **T2★** | IIIII22b（src/world/DungeonDualZones.ts；VanillaSpawner 尾支+SceneMetrics CalculateZones 尾支）；B1-B5 含「非 dual 世界 bandCalls==0 锁骰」 | Player4 区 Zone 类态细项 M |

### 1d. 种子完备性与文本路由核对（任务 3 项）

- SeedEasterEggs.ts 枚举对账：SPECIAL_OPTIONS 10 位（Normal 占位+九特殊，getfixedboi 七依赖
  全置 :99-102，顺序=WorldGenerationOptions.cs:27-40 注册序 1:1）；SECRET_ROUTES 39 条正则
  （35 秘密+双雷双别名 stormyweather/clearskies/electricboogaloo/calmbeforethestorm 去重重叠）
  ⇒ **46 唯一旗标全数接入**，无漏注册。
- 文本路由语义：vanilla `GetOptionFromSeedText`（WorldGenerationOptions.cs:66-88）=
  int 路 TranslateSeed 命中 SpecialSeedValues → 文本路归一化命中 SpecialSeedNames → 否则 null
  （Normal 选项自身 Values/Names 皆空 ⇒ `'random'`/任意串落普通 CRC 流）。JS parseSeed
  (:150-177) 逐语义同构；`'random world'` 无专属条目与原版一致（无需列）。
- 数字路由零填充/负号/CRC 碰撞串（5162020/5162021/5162011）经 translateSeed 同源命中
  （S0-2①② 已落）。
- S0 五项遗留盘点：S0-1/2①②④⑤/S0-3/S0-4 已落；**S0-2③（文本特殊种子→
  SetSeedToRandomWithCurrentEvents 随机流语义）仍遗留**（master-plan §3-S0，须存档兼容评估）；
  S0-5 serverconfig 通道未做（可选）。

### 1e. DRUNK 专行（M 车道现状精确定界）

IIIII14（30 消费点）＋IIIII21（C1 浮空岛族/C2 FinishDrunkGen 数据面+宝箱/C3 地牢入口族/
C4 神庙三倍体）已把 §10 宣告⑤#8 所列「岛族/paint 通道/地牢入口族/神庙三倍体」四项落地
（宣告该行落笔早于 IIIII21 收账，见 §5 对照）。**真实残留=**HiveBiome 内参（larvae +Next(7,10)/
额外幼虫台/蜂蜜满格双段）、组合域（NotTheBees 内 drunk 门群 :25417/:25574 Glass 墙、
finishTenth/remix/getGood 后续 Finish*、graveyard 血月开局=dontStarve 组合）、hellFort() 1457
存档路径 drunk 跨距/翼门放宽（GFB 合并时接线，hfDrunkMode 只覆盖 1456 形）、地牢窗 Closed 位
（掷流中性视觉债）、paint/wallColor 第四通道对拍扩容（存储在位、mile8 八通道不含 pt/pw）。

## 2. 正确性风险标注（凡 T2 皆成立的共性局限）

1. **静态期望 ≠ 真值对拍**：DRUNK/九秘终结面/manor/portalGun 等 T2 面的探针全是阈值/
   分布/存在性断言＋对照臂，无法排除小面积数值漂移；T1 链没有这些种子。
2. **名字掷=流位预言而非原版 NPC 表直比**：_iii6/_iii20 的终名断言由 UnifiedRandom(seed)
   前 2 掷＋池序表推得并自洽硬等，原版侧没有逐名 gold 直比（celeb 五人组例外=x86 w.wld 对拍）。
3. **重放范式偏离**：royale 点表用「同种子确定性重放」非原版 msg157 下发协议（R1）；分布形态
   1:1、点位不可与原版逐位对拍。
4. **已知近似六条**（IIIII16 §③）：SquareTileFrame 邻格重帧未模拟、ConvertTreeAndGround 整树
   换种臂缺、discoball PlaceTile 非全前置清单、箱染首空槽 compact 近似、苔芽直写帧、
   worldIsInfected/errorWorld/teamBasedSpawns/worldIsFrozen finalize 端点彼时未全接（其中部分
   已由后续批清偿）。
5. **1372357239≠9293480 类换链坑**屡犯（memory ssss-/ffff- 在案）：任何补测必须抄全套参数表
   （SW_MB_1457/EVIL/NOCACHE/VG=G2 同目录），否则假红假绿都会发生（IIIII23 整批即伪影翻案先例）。

## 3. 组合种子专项（getfixedboi 一句话定谳）

**JS parseSeed 对 getfixedboi 的八旗同置与原版 Everything 选项同构且组合成员的内容面各自演进中，
但其组合专属语义（activeSecretSeedCount≥N 计数级联：gray/treasure/mansion 平衡臂、
errorWorldAdjustment、extraFloatingIslandsReducedAmount 等）全仓一个计数点都没有
（grep activeSecretSeedCount 于 src 仅注释命中），zenith 用户输入路径也走不到十周年内嵌
infected 臂（IIIII20 §④.1）** —— 故 GFB 现状=「旗标组合正确 + 内容=七成员各行进行时的债之和 +
组合级联整体缺位」，维持 master-plan C 组结论（排在全部 A/B 组成员清偿之后），不为它单开车道。

## 4. 「要升 T1 还差什么」清单

| 种子线 | 缺口动作 | rig 链成本估计 |
|---|---|---|
| DRUNK | ①补 HiveBiome 内参+组合域+hellFort1457 存档路径 drunk 门（M 车道余期 1-2 批）②建 hh-drunk/x86-drunk G2 链（rig 配方=produce-chains.sh 同款，SW_AUTOGEN mode\|seed\|name\|W\|H 已支持）③mile8 逐槽滚动清偿至 0..105 | 链生产分钟级（ntb 38s/notraps 53s 实绩）；**修复批本体 M-L（估 2-4 批）** |
| FTW | ~~RECON-FTW 22 处映射按 B 组排期整线移植＋hh-ftw 链＋mile8 清偿~~（★IIIII42 批 2026-08-29 启动：G2 建成+官方仲裁互证+0..9 槽满绿+TileRunner 双修落地；余量=池味序列错位族+触点台账续推） | **L→M**（链已立,余 2-3 批+掷流仪器补齐） |
| REMIX(+skyblock) | B 组 3 批（TerrainPass 4 分支/Reset 池/SpawnPoint 地狱/52 支/沙漠地牢族 19）＋skyblock 加型 ~500 行＋hh-remix 链 | **L**（估 4 批＋链） |
| GFB | A/B/C 全部成员清偿后：继承验收批＋专属尾链批＋hh-gfb 链 | **XL**（继承于前述全部） |
| CELEB | g-secret-celeb 旧链资产恢复/重产（ZZZZZ 四链纪元产物）＋mile8 口径重验＋内嵌支润色尾差清偿 **→ 2026-08-30 IIII65 批更新：#32/#69 双刀清偿（red74→red9），尾部 #97..#105 Micro_Biomes 族为 T1 清偿移交（~30k 格 conversion 家族），状态维持 M 再进一格** | **M**（1-2 批＋链；已实 3 批:52/56/60+65） |
| 秘密 35 中其余 T2 各枚 | 升格非必需：如需真值须逐枚产 dump 链并把 mile8 豁免口径扩到 X（ Ends 结构，多数秘种子主战力集中在 finalize/Finish* 段） | 每枚 **S-M**（链分钟级、对拍口径一次性投入） |
| 双雷 | T1 不适用（无 worldgen 分歧，D 组口径）；只需 rainsForAYear×moreLightning 受控基线一次取证 | **S** |

## 5. 与终局宣告诚实边界章的交叉引用（不许矛盾处核对）

映射（宣告⑤ #1..#11 ↔ 本复核）：#1 spawnY±1-2 → §6 通用债；#2 CELEB 润色 → §1a tenthAnniversary 行；
#3 GFB 合并门/组合叠加语义 → §3；#4 rainbow 观感层 → §1c rainbowStuff 行；#5 l10n → §6；
#6 秘种子 P0 14+P1 9 → §1c（**其中九枚已由 IIIII16/17/18/22b 清偿，本表已按最新批账升级，只剩
randomSpawn/arachnophobia/rainbow 观感零/部分缺口**——宣告该行列举的 such great heights/too easy/
fish mox 等均已落地，引用时应注意其成文时点）；#7 R1-R5 → §1c teamBasedSpawns 行；
#8 DRUNK → §1e（见下勘误 a）；#9 FTW/REMIX/Skyblock/GFB → §1a；#10 信息位域 → §6;
#11 金标三陈账 → §6。

**三处陈旧注记辨析（本复核裁定，防误引）**：
a) 宣告⑤#8 所列「岛族/paint 通道/地牢入口族/神庙三倍体」已由 IIIII21 同周落地（本章 1e），
   该行的准确剩余=HiveBiome 内参/组合域/GFB 合并门/paint 对拍扩容；M 车道「在修中」属实但范围更窄。
b) audit-matrix 行#5（celebrationmk10）「内嵌 infected 支 :19855 未移植」与其同行#29 及 IIIII20
   批账矛盾——按批账+tests/_iii6 六用例硬等，**该臂已落地**；行#5 注记作废。
c) audit-matrix 行#8（skyblock）GEN「✓」系指抑制门广布；按生成器实体口径（§1a）降读为 T3，
   NpcDrops.ts:360「天空盒世界未实装」为直接源码证词。

## 6. 通用债单列（不属于某一种子）

1. **spawnY±1-2 微移备案**——头锚 hdrΔ 口径内可备案例（金标定义书§4/master-plan §4）。
2. **l10n 新键润色通道**——tools/l10n-custom 目录曾并行车道挪动，回收登记（CLAUDE.md 硬约定；
   新增 Mods.SandboxWorld.* 键须先补键再 build-l10n）。
3. **world-final-hash 陈账**——tests/golden/world-final-9293480.json 钉 ee7ad7a8，现行树产
   115f524f（IIIII17 §⑤ pristine 隔离实证与本域无关）；oracle 口径类，收敛动作=所属域按 x86 权威再生。
4. **underworld-oracle 家族红**——10 文件 caves-checkpoint 族 firstBad='underworld'＋shimmer
   firstBad='gems'（宣告⑥ A 类白名单，主树/HEAD 分身失败集合逐值相同=并行交汇陈账）；
   mile8 语义下 tile 面终审权已收口，红仅属旧 oracle 金标口径。
5. **环境债**——24 个 tools/_ 一次性脚本 ENOENT（/tmp 退役锚位）＋tsc 233 错白名单三类
   （gen/ 根镜像断头副本/兄弟工程 import/tests 域噪）均为存量（宣告⑥）。
6. **信息位域**——ghost 残值/air 编码伪影两格 (927,971)(926,972) 备案不动（mile8 不裁决）。

---
*复核证据落点：SeedEasterEggs.ts（206 行全表）/SecretSeedDoEndsPass.ts/StarterNPCsPass.ts/
FinishDrunkGenPass.ts/ExtraSpawnsRoyale.ts/DungeonDualZones.ts/tests/{drunk-world-gen,
_iii6-starter-npcs,wld-secret-seed-import,iiiii22b-team-spawns-dual-dungeons,vampire-seed}.test.ts/
tools/_mile8.test.ts；grep 实证 randomSpawn(WorldGen.ts:2155)/noSpiderCaves(GrassWallPass.ts:155)/
skyblock(NpcDrops.ts:360)/activeSecretSeedCount(src 零消费点)。*

## 7. IIII84 批补记（2026-08-30 · 任意种子平价闸门）

本复核 §0 的保留句「任意用户输入的其他数字共享同一代码路径，结构上被覆盖，但不构成
逐一逐字节断言」自 IIII84 起升级为**工具化抽样断言**：`game/scripts/anyseed-slot0.mjs`
＝任意底种 slot0 八通道字节对拍常驻闸门（首跑 N=20 分布抽样，含 0/负数/Abs 前导零/
int32 溢出回落 CRC32 等形状，全部通过或产出可指名残差）。另定谳一条**配方级勘误**：
dotted 共享种子第 4 段是 AWorldGenerationOption 位掩码（bit0=Drunk，WorldFileData.cs:71-82），
IIIII78 批的 `1.1.1.1.<flag>|<base>` 曾静默开启醉酒世界并把 slot0 红误诊为「任意底种
早发散」——正确形态 `1.1.1.0.<flag>|<base>`（或省略第 4 段）；底座债不存在，
引擎对任意底种的 Reset/Terrain 面与认证窗同价。详见 content-parity「IIII84 批」章。

> **IIIII89 状态行追加（2026-08-31）**：勘误配方后干净矩阵首张落档——八线里
> bigcrc(99999999999) 晋升满绿（spike 伴查格轴向 + CheckPile/Check2x1 分派两刀，
> g 链 106/106 零扰动复证）；grvfix 0..58、waterpark/planetoids/tooeasy/pumpkin/
> truckstop/winter 各绿至自身前沿，残余按「DUNGEON 布局域（新立案，layout 房表
> 骰序）/flag 域/worldIsFrozen 冰化面」三类分账。细节=content-parity「XVII·IIII89 批」章+
> master-plan §10.2；预存在红 world-final-hash 备案在案。

> **IIIII106 状态行追加（2026-09-04 终局改判）**：九枚秘种子迷你链收官——**四链 T1 满绿晋级**
> （purifythis/savetherainforest/the care bears movie/sandy britches，mile8 0..106 red=0，
> G2=~/GoldenChains/i106/x86-*）；iamerror 前沿 #032（Dungeon 尖刺海 T44×35718+冰带置换=
> errorWorldAdjustment 臂族精确靶）；**四涂装链 paint 位面满版逐位认证 ×4**（tools/_i106paintcert
> dP=dPw=dCb=0——单旗标全涂变体 paint 位面与 tile 内容正交故逐位置直比即字节级认证；
> 8ch 谱系差经等价闸三裁定罪为 rig 代际污染非 JS 债）。rig 世系三闸实录（i118 80/106≠、
> iii128 450 差、iii109 原版二进制=107 槽全等=新认证标准件）+「认证级资产必须落
> ~/GoldenChains、/tmp 只放过程件」判例沉淀。详见 content-parity「XXIX·IIIII106 批」章
> + master-plan §10.3。


> **IIIII109 状态行追加（2026-09-04）**：末批秘种子迷你链四链收口——**arachnophobia
> 满绿认证（103/103×8ch,复跑双证;旗面三重实证=SpiderCaves 整跳 #062≡#063 8/8 字节+
> 全链蛛网 0+wld savedStylist=true）**;howdidigethere（重掷臂生效实证,mile8 102/103,
> 唯一红=火把环快照时点语义;残差=spawn 落点 x86(3508,797) vs js(1560,634)=
> CheckForGoodTeleportationSpot 精简核非逐句）、abandonedmanors（台账前 15 attempt
> 逐格全等含 5 accept 同点位;首红 #59;残差=第 5 accept 屋 builder 掷耗差）、
> wedonteventestforthat（**x86 27 枪/174 箱插枪实锤**;首红 #76=4 格 TNT 桶
> @(2620-2621,387-388),根因=PlaceSandTrap 清场邻格 Check2x2 横扫清算,JS
> TILEFRAME_NO_CHECK(IIIII29) 未复刻该路径;24 vs 27 枪=掷流位移下游投影）三链单刀级
> 移交。i109 rig（iii128 血统克隆）四旗臂+pc 链+PostFin+HouseLine+RollLog+KillWatch
> 六仪,控制认证 856/856 字节+pc 107/107 全等 golden-g;任意种子闸门 4/4 slot0 全绿。
> 详见 content-parity「CXVII·IIII109 批」章 + master-plan §10.4。
