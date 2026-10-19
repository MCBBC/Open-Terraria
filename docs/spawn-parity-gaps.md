# 刷怪系统与原版差异台账(VanillaSpawner 已知缺口)

> 生成规则:本文件登记所有 VanillaSpawner.ts 内注释标记"未移植/简化/恒X/省略"的
> 与原版 NPC.cs 的行为差异。**新增任何此类简化必须在此登记**,否则视为未完成移植。
> 2026-08-12 spawnFriendly 事件教训:登记了"恒 false 门恒放行"却没人回头补,
> 导致兔鼠刷到浮空岛(原版岛边 townNPCs=0 永不出小动物)。
> 维护规则:每条登记须含 ①原版行号 ②可见影响 ③补齐依赖 ④状态。

## 已修复(勿重复登记)
| 项 | 原版 | 影响 | 状态 |
|---|---|---|---|
| spawnFriendly 掷骰 | :711-832 | 无 NPC 区出小动物 | ✅ 2026-08-12 |
| 蚁狮 SandstoneCheck | :4374/5364 | 孤沙也出蚁狮 | ✅(并行会话) |
| 丛林水 157/241/242 | :1673-1683 | 困难丛林湖主体怪缺失 | ✅ 2026-08-12 |
| 龟甲虫 219 / 骨头博士 52 | :3681/3688 | 丛林稀有怪缺失 | ✅ 2026-08-12 |
| 敌怪弹幕原版贴图+角度 | Projectile.cs SetDefaults/AI | 全部射击怪弹幕是 8×4 色块且方向与弹速不符 | ✅ 2026-08-12(Dart.ts DART_STYLE) |
| 海洋 376 门(高1) | :1705 | 旧写 `!any(376)` 整体封死海洋段——睡渔夫在场时鲨鱼/水母/鱿鱼全断供;现改 `(!spawnFriendlyCycle\|\|!any(376))`,友好轮仍让位渔夫,敌怪轮恒放行 | ✅ 2026-08-13 |
| 猩红段 tile 门+分层(高2) | :3973-4031 | 旧用 ZoneCrimson 整段拦截(腐化边界/猩红矿外怪被劫持)且 182/268 无 hard 门(肉前误出);现照原文 tile 门 `(204&&ZoneCrimson)\|\|199/200/203/234/662` + 十支分层(179/182 带 !noWorms、268/174 hard 门、239 血爬虫、-22~-25 netId) | ✅ 2026-08-13 |
| 腐化段 tile 门勘误 | :4032-4037 | 旧 `T.SAND&&ZoneCorrupt` 系把 tile 22 误标"黄沙"(22=魔矿 TileID.cs:477)顶替,且漏 661 腐化丛林草;现 `(22&&ZoneCorrupt)\|\|23/25/112/163/661`,83 补 !noWorms 门 | ✅ 2026-08-13 |
| Devourer 段(高3) | :3611-3621/:5478-5492 | 整段缺失——腐化区永不出吞噬怪;CanSpawnDevourer 查原文=!infectedSeed 恒 true(本仓无种子系统),门=ZoneCorrupt&&1/65&&!noWorms,hard 3/4 出 98(探求者)else 7 | ✅ 2026-08-13 |
| 自然刷史莱姆王链(高4) | :4277-4280/:81273+ | 整段缺失——远离出生点草地永不出史莱姆王;门=!waterTile&&num46>w/3&&tile 2&&1/300&&场上无 50;SpawnOnPlayer 500 次选点以"钉玩家格+Game 常规落位"近似(见待补) | ✅ 2026-08-13 |
| 速率 else-if 链(高5) | :504-559 | 旧只移植地牢一支;补沙尘暴 hard?×0.4:0.9/×1.5:1.2、地下沙漠 ×0.2/×3、丛林城镇阶梯(0/1/2/≥3 → 0.4/0.55/0.7/0.85 与 1.5/1.4/1.3/1.2)、腐化猩红 ×0.65/×1.3、陨石 ×0.4/×1.1、神庙独立 if ×0.8/×1.2(墙 87)、神圣深层独立 if ×0.65/×1.3 | ✅ 2026-08-13 |
| 地下沙漠池(高6) | :1589-1672 | 旧权重错(50/40/10)且缺 508/509/510/513/hard 加权池/589 门;现 1:1:checkUnderground 门+num11 深度系数+基础池 SelectRandom(69:20%/580×3:60%/581:20%)先选后改(1/15→537、1/10 升 508/509);flag 扫描墙表补全 9 种(:1088 WallID.cs:42)+!invaders 门(:1077) | ✅ 2026-08-13 |
| 天空 686+飞龙门(中7) | :1316-1331 | 飞龙 87 缺 !noWorms(房屋内出蠕虫);686 绑缚紫史莱姆支整体缺失(!unlockedSlimePurpleSpawn 恒 false+1/25+场上唯一) | ✅ 2026-08-13 |
| 天空选点门+第二带(中8) | :890-903 | 缺 !invaders/!spawnFriendly/困难第二天空层(hard&&y<0.45ws&&1/10);带外判据沿用"上两格无墙"露天近似(兼容中央浮空岛存量世界,见近似表) | ✅ 2026-08-13 |
| 沙漠地表昼门+tile 集(中9) | :3930-3944/:4374-4381 | 旧主链段昼夜皆出且 tile 集含硬化沙/沙岩/化石;现木乃伊四支归主链(53→78 1/3、112→79、234→630、116→80 各 1/2),蚁狮/秃鹫归昼池(夜沙走僵尸族);另删误标"L3940"的珍珠沙 80 重复支(原版唯一门在 :3942) | ✅ 2026-08-13 |
| 神圣 661 昼夜窗(中10) | :3946-3971 | 661 支序错(应首支)且缺 !dayTime&&time<16200(夜前半)/surfaceSpawn/场上唯一门;244/122/86/75 顺序照原文 | ✅ 2026-08-13 |
| 丛林四支(中11) | :3713-3830 | 地表小动物(671-675/SpawnFrog)、蜂巢块 225 落脚(hard 苔藓黄蜂族)、困难丛林草 60 主池(152/177/205/236/176/175/153)、神庙砖 226/232(墙 87 门,1/3 飞蛇 226 else 198)四段缺失,全补 | ✅ 2026-08-13 |
| 雨雪高仑/探测器(中12) | :4094-4108 | 243 冰雪高仑(雪原雨 hard 1/20 唯一)、250 雨云怪(!雪原雨 hard CountNPCS<2 1/10)、399 地表支(flag17+downedGolemBoss+(1/100 或 1/400))三支缺失,全补 | ✅ 2026-08-13 |
| 地牢 rng 坑+hard 四支(中13) | :2588-2629/:2674 | `rng.int(0,5)` 闭区间多出第 6 档 undefined id(应 int(0,4)=Next(5));补 290(蓝变体唯一 1/35)、289(绿粉 1/30)、281-286 死灵法师族(1/20,唯一才出否则空过)、269-280 施法者族(2/3) | ✅ 2026-08-13 |
| 僵尸族 rng 坑(中14) | :4478 | 同款 `int(0,5)`→`int(0,4)`(Next(5)=0..4;第 6 档越界 undefined) | ✅ 2026-08-13 |
| netId -22~-25 基底勘误 | NPCID.cs:10445 NetIdMap | 旧表 base:223(雨僵尸)全错——-22/-23 基底 173(Crimera)scale 0.85/1.15、-24/-25 基底 183(Crimslime)0.85/1.15(NPC.cs:7858-7911);猩红段补齐后会真实刷出 | ✅ 2026-08-13 |
| 蜘蛛巢/沙漠 flag !invaders 门 | :1053/:1077 | 两旗标扫描缺 !invaders(入侵期间误触发) | ✅ 2026-08-13 |
| 蘑菇地表/洞穴支(中) | :3540-3610 | 旧实现外层门写反(N(3) 应为 !N(3),2/3 通过写成 1/3)且内层只剩 254/257/259 三支;现 1:1 三支:hard 水支 256(:3540)、地表支 360(肉前 1/6\|\|困难 1/12)/260/259(锚点)/257/258/254/255(:3544)、洞穴支 374 松露虫(1/5)/360(1/8)/260/259/257/258(:3581) | ✅ 2026-08-13 |
| 地牢限深门勘误(中) | :2536/:5690-5697 | CheckToSpawnDungeonEnemies 原文 result=inTheDungeon,限深门(playerY<dungeonY+40→false)只在 drunkWorld/!isThereAWorldSurface 世界生效——旧实现无条件挂上,地牢浅层(入口段)整池不刷;现门恒开(本仓恒有 worldSurface 且无 drunkWorld) | ✅ 2026-08-13 |
| spawnFriendly 外层门四门(中) | :709 | 旧实现只挂 !血月/!invaders/!邪恶三门;补 南瓜霜月(!bloodMoon&&!pumpkinMoon&&!snowMoon)\|\|白天、日食白天关、ZoneMeteor 三门(:709 原文全列:flag(腐化\|\|猩红)+ZoneCrimson+ZoneMeteor+ZoneOldOneArmy) | ✅ 2026-08-13 |
| 城镇 noWorms 置位(中) | :717/:734/:750/:767/:792/:814 | GetSpawnRate 城镇段原版会置 noWorms(城镇 NPC≥1 地表恒置,地狱侧按 town 数掷骰)→ 城镇附近不出蠕虫;旧实现缺失。本仓 getSpawnRate/spawn 拆两次调用 → townNoWorms 闩锁 + spawn() 合成 | ✅ 2026-08-13 |
| 厄运轮 ×0.85/×1.15(低) | :834-838 | 非友好轮 RollOnlyBadLuckExtreme(50)==0(≈1/50) → spawnRate×0.85/max×1.15;位置在 ZoneDungeon rate=10 覆盖之后、return 之前 | ✅ 2026-08-13 |
| underGround 旗边界(低) | :1043/:3946/:4718 | 原版(非 remix) underGround=spawnTileY<=rockLayer **含地表**;旧实现写成 groundLevel<y<rockLevel 带状 → 神圣段(:3946 hard&&underGround 门)漏判地表神圣落脚(夜间 122/86/75 池不出)。地下层刷怪段(:4718)在 surfaceSpawn 段之后,行为不变 | ✅ 2026-08-13 |
| 水池第三支(中) | :1906-1993 | 整支缺失:waterTile&&1/4&&(x 在海洋带间\|\|y>ws+50) → 腐化 57/猩红 465 金鱼 / 白天地表水面线小动物(616 水黾/608 鸊鷉/613/612 水黾群/362/364 鸭)/深水夜间 607 鳉/592 金金鱼/55 金鱼;**无** !spawnFriendly 门(友好轮也可命中) | ✅ 2026-08-13 |
| 沙尘暴门+池(中) | :3859-3928 | 门缺 Spawning_SandstoneCheck 第四合取项(孤沙误刷);tile 集误(Conversion.Sand=TileID.cs:30 四沙 53/112/116/234,旧混入 397/396 且漏三色沙);池缺 510(y+10 落点,CountNPCS<4)、542-545 沙鲨换色(!noWorms)、沙尘内 mummy 四支(各 1/3,≠主链 1/2)、546/580/581 兜底、!downedBoss1 门 | ✅ 2026-08-13 |
| 刺球 NearSpikeBall 门(低) | :2635/:91002-91016 | 地牢绿变体出刺球 70 前防堆积门已 1:1(VanillaSpawner.nearSpikeBall=落点 ±300px 盒 × aiStyle==20 的 (ai[1],ai[2],20,20) 锚盒相交,零 RNG;1456:90933-90948 字面同值);锚点来源=Game.trySpawnEnemy / SimHost.trySpawn 每周期同循环采集 spikeBallAnchors 喂入(aiInit=false 未初始化个体上游剔除,spawner 无实体桶访问的既有侧信道式)。另勘误:70=Spike Ball(NPCID.cs:11205)/72=Blazing Wheel(:11209),旧注释名字写反 | ✅ 2026-09-03(1:1,旧"场上存在 70"近似退役) |
| FindSpawnTile 房屋墙豁免旗(低) | :886/:315-319 | ignoreSafeWalls(仅星璇四塔 Zone 置位)缺失——塔战期间原版允许穿房屋墙刷怪;现 setPlayerFlags 由 lunar!= null 置位 | ✅ 2026-08-13 |
| 墓地 spawnRate×1.66/×2.33/×3(低) | :769-826 | 墓地刷怪率/友好率调制(登记失真清理:实现在 getSpawnRate 地表/洞穴侧 gy 旗段,gy=ZoneGraveyard&&(!peaceCandle\|\|1/3 掷骰);townNPCs 1/2/≥3 → ×1.66/×2.33/×3 与友好掷骰 1/9/1/6/1/3,RNG 消费序=peaceCandle 短路) | ✅ 2026-08-13 |
| 雕像宝箱怪 690 幸运度掷骰(低) | NPC.cs:1478/:5271 | 旧裸 N(25) 无幸运度调制;现 RollBadLuckExtreme(player.luck,25)==0(正运 1/250/负运 1/2/中性 1/25),luck 经 setPlayerFlags 下发 | ✅ 2026-08-13 |
| 神圣 86 独角兽水蜡烛双掷(低) | :3960 | 旧只 Next(10)==0 单掷;现补 \|\| (ZoneWaterCandle && Next(10)==0) 二次 1/10(zoneWaterCandle 取 getSpawnRate 入参=手持\|\|邻近,略宽于原版 SceneMetrics 单源,近似) | ✅ 2026-08-13 |
| 绑缚三人组 105/106/685 | :1994-2005 | 主链 spawnFriendly 块之前三支 else-if 补齐(1:1,&& 求值序保持 RNG 流):门=RollLuck(20)&&!waterTile&&deeperThanRockLayer&&y<h-210&&!saved*/场上唯一;前置 105=downedGoblins/106=hardMode/685=downedBoss3&&!unlockedSlimeOldSpawn。产出为 bound TownNPC(VanillaSpawner.spawnBound 占位体→Game.trySpawnEnemy 转换,685 无 json 条目走 PLACEHOLDER_DEF);bound TownNPC 经 BOUND_TOWN_NPC_ID 反查登记进 activeIds 使 !AnyNPCs 门成立;685 解救置 flags.unlockedSlimeOldSpawn(WF:1410)。附带修复:setPlayerFlags 的 downedBoss3 改双键 downedSkeletron\|\|downed_35(旧只传 downedSkeletron 恒 false,地牢守卫池永不切换) | ✅ 2026-08-13 |
| 沙滩干沙睡渔夫 376 支(缺支) | :1928-1931 | 门=!waterTile&&!savedAngler&&!AnyNPCs(376)&&(x<380\|\|x>maxTilesX-380)&&tileSand[tileType]&&y<worldSurface(remix 臂按 Remix 裁决不实现)→真 Enemy 376(解救走 ENEMY_BOUND_TOWN_KEY 376→'angler');门全确定性零 RNG,链位=海洋支与水池段门 A 之间;此前海岸干沙落点直落主链出普通地表怪 | ✅ 2026-09-08(SW-BJ31) |
| 海洋睡渔夫 !savedAngler 两门 | :1705/:1708 | 旧缺 savedAngler 旗:解救后海洋仍可再掷 376(:1708 渔夫掷)+友好轮在解救后误入海洋支(:1705 友好半臂,出海鸥/鲨鱼);现两处补 !flags['savedAngler']——零 RNG 确定性门,解救后绝迹 | ✅ 2026-09-08(SW-BJ31) |
| 夜萤火虫概率源 setFireFlyChance | :94557-94610/:4413 | 旧恒代表值 30;现每夜 StartNight 掷三档(1/9 高发 5-9 / 1/3 绝迹 999999 / 其余 10-59)落 World 五字段(随存档,旧档缺省=代表值),萤火虫门读 world.fireFlyChance;同源补白昼椿象 669(:2381)/蝴蝶 356\|金 444(:2394)两支(读 stinkBugChance/butterflyChance,位于瓢虫支之前=原版链序) | ✅ 2026-08-13 |
| NET_ID_MAP 三死行（-1/-2/-15 基底） | NPCID.cs:10450-10460 NetIdMap+FromNetId(:12478-12484)；SetDefaultsFromNetId case -1/-2 :7687-7702 / case -15 :7831-7842 | ★BJ337：-1/-2 base 16(母史莱姆)→81(腐化史莱姆,Slimeling/Slimer2)、-15 base 1(绿史莱姆!)→77(Heavy Skeleton)+hp:400 硬置。★BJ334"纯潜伏"判注对 -15 不实——洞穴主池 L4959 实刷点(hard&&(remix\|\|深层)&&1/5)曾刷 1.15 倍绿史莱姆;-1/-2 刷生侧确无掷点(真刷出点=Enemy.ts BJ263 死亡分裂链,base 81 已硬编码),潜伏态修值 | ✅ 2026-09-24(BJ337) tests/bj337-net-id-map.test.ts 全表判别+变异 1 发证红 |
| NET_ID_MAP 缺行 -18..-21（苔藓黄蜂变体） | NetIdMap[17..20]=176;case -18..-21 :7867-7900 scale 0.8/0.9/1.1/1.2 | ★BJ337 普查新发现（BJ334 未登记）：行整缺 → spawnNPC 走 map?.base??netId → fromVanilla(-N)=null 静默丢刷。活性面=蜂巢块 225(NPC.cs:3835-3860)与深层丛林草 60(:3893-3918)两刷点 hard 1/10 四支 D(-21..-18) 全空掷;补行后 176 真身+json scale 盒链生效 | ✅ 2026-09-24(BJ337) 同上测试行为面锁 |

## bound 救援族 Game 侧登记(SW-BJ31 2026-09-08 洞穴层哥布林工匠实报审计)

主报判语:三人组链四面对照零偏差+实机同条件采样实证可达(tests/sw-bj31-goblin-tinkerer-spawn.test.ts
——setPlayerFlags 实参镜像 trySpawnEnemy+实机半屏格数,3000 次采样命中 105)。"刷不出"非生成系统
缺陷,用户侧可能成因:①世界内已有一只绑缚工匠未找到(!AnyNPCs(105) 关门+存档持久 t.bound,原版本相
——原版同样全世界仅一只直到被救);②旧档/导入档 downedGoblins 未置;③在地下层(rockLayer 上)或
水域落点探索(原版不刷)。Game 侧随审计登记/修复两项:

- **~~boundTouchCheck 触碰解救=非原版近似~~(✅ 2026-09-18 BJ124 用户拍板方案 A 清偿退役)**:
  原版解救唯一路径=玩家 talkNPC(NPC.cs:19874-19912 AI_000_TransformBoundNPC :45371→
  Transform+UpdateSavedStates 置 saved 旗),无"接触即转正"路径;旧注"原版 AI_007 玩家接触
  bound→转正"系误锚已勘误(Game.ts)。触碰臂(Game 15t AABB 扫描 freeBoundNpc)已整摘,
  解救唯一触发源=talkToNearbyNpc bound 支(Main.cs:43781 名单+:43805-43812 SetTalkNPC 同义);
  685 抖箱支(金钥匙 327+PlaySound(22)=Unlock)/534 唯净化粉链(Projectile.cs:14794-14810)
  特例保留,534 同时补 talk 面跳过门。判别力=tests/bj124-talk-only-rescue.test.ts(贴近不解救/
  talk 触发/685 特例/534 不解救/结构锁)+bound-rescue-dialog.test.ts 更新。同批(BJ124-②):
  解救自创音尘摘除(TransformVisuals NPC.cs:81788-81851 对解救配对零音零尘;
  freeBoundNpc/wakeBoundEnemyNpc 的 NPC_Hit_1+绿粒子、applyPowder 534 支 NPC_Killed_1+尘雾;
  685 特例保留原版 Unlock 音;TownSlimeTransform 编排粒子本仓无 ParticleOrchestrator
  系统未移植=登记债);浮字"NPC.Rescued" newText 未在拍板范围,保留登记。
- **loadWorld 不重建 vanillaSpawner(已修复)**:spawner.world 为构造期捕获引用,同会话载入第二个
  世界后刷怪域(选点 tile 扫描/flags 读数,含三人组前置旗 downedGoblins)仍读旧世界。修复=
  loadWorld 置 null,下一拍 ?? 位按新世界懒建(零 RNG 面)。

## 待补(有可见影响)
| 项 | 原版 | 可见影响 | 补齐依赖 |
|---|---|---|---|
| ~~291 地狱火弹 aiStyle50 到点即爆~~ | AI_050 弹飞至 ai 点才引爆 | 魔法师火弹撞人/到期才爆 | ✅ 2026-09-02 敌侧弹幕三缺口批已清（Dart.dartStep 291 支：锚点 Dot<=0 越点引爆 :28748-28756 + Kill→292 :75802-75807）；SW-FX7 补发射位显式传锚（NPC.cs:21294 末两参=玩家心,Enemy.fireCasterVolley） |
| ~~大盒弹 tile 判定仅中心格~~ | ★SW-FX7 勘误：金标=GetCollisionParams **缩盒**（Projectile.cs:19982-20156）非"全盒扫"——44 aiStyle18→width−36=12×12（:20081）/288 缩盒名单→10×10（:20072）/300 tileCollide=false 无扫描（:3915） | 缩盒边缘 6px/5px 漏检（沿墙皮可多穿半格） | ✅ 2026-09-10 SW-FX7：DartStyle.tileBox 12/10 + dartStep 缩盒重叠判定（tests/sw-fx7-dart.test.ts 变异证红）；其余弹型 GetCollisionParams 逐型缩盒仍登记近似 |
| 572/128/177/288 渐入速率取族标准 -50 | ★SW-FX7 反编译定谳：四型 AI 内【无 alpha 递减行】（AI_001 572 支 :57253-57270 仅音+尘 / aiStyle28 128·177 :26966-26995 仅尘 / aiStyle12 288 :24788-24831 仅 scale+尘）→ alpha 恒 255,经 GetAlpha 缺省尾（:81481-81491）RGB×0+A=0=**本体不可见**,可视面=尘链（572:2×d40 / 177:3×d137 / 128:3×d92 / 288:3×d170+1/8 加重） | 本仓 fade:50=本体 5 拍渐显后恒可见（vanilla 本体永隐） | 尘引擎缺 d40/d92/d137/d170 行为 case（VanillaDust 按消费方扩表协议）——本体不可见化须与真尘链移植同批落刀,单独登记待专项 |
| ~~290 暗影束 aiStyle48 反射~~ | 束弹撞墙反射数段 | 死灵法师束撞墙即灭 | ✅ 2026-09-02 已清（撞块主轴全速反号+束段铺撒+重锚 :18975-19018 近似口,Kill 收尾 :71825-71870；登记近似=分轴反射无轴信息,tests/sw-fx7-dart.test.ts 回归锁） |
| ~~44 魔镰 AI_018 phase1 转向~~ | ★SW-FX7 勘误：登记误锚——1457 P.cs:25735-25737 的 AngleTowards(0.25) 属 aiStyle18 内 **type==1092** 蓄势支;44 走 :25780-25797 通用支（spin 0.8+×1.06 加速+2×d27,零转向） | "飞镰加速段直线不追踪"正是原版本相 | ✅ 2026-09-10 定谳不修（tests/sw-fx7-dart.test.ts 锁"无转向"） |
| ~~216 海盗火枪手专家炮弹~~ | ★SW-FX7 勘误：非专家模式门——NPC.cs:60106-60117 flag21=localAI[2]>=20（20 轮齐射后）→ num170=100/num171=240(CannonballHostile) + 冷却 max(60,180−lai3×20)（:59758-59774,激怒 flag20 加速 lai3） | — | ✅ F4 批已清（Enemy.ts RANGED_FIGHTERS 216 分档,lai2/lai3 双门 2026-09-02 复核定谳;tests/enemy-shooters.test.ts 已锁） |
| ~~CountNPCS 计数通道~~ | CountNPCS 遍历 Main.npc 全表 | 昼夜链 N 阈值门在 ≥2 只在场时仍放行 | ✅ 2026-09-10 SW-FX7：Game 每周期注入 VanillaSpawner.npcCounts 全量计数表（enemies+critters+bound 全桶,Main.npc 全表语义）;countNpc 注入优先/activeIds 0/1 回退;cnt467 一并改真计数。消费面：250<2(:4192)/467<2(:3575)/510<4(:3973)/74+297+298<6(:4328)/513==0(:1703)/gnome cap(:5773)。★==0 型唯一门在旧退化下本就正确,本批只救"上限"门 |
| flag=false netID 族 case 体 stat×scale 未建模 | SetDefaultsFromNetId case -11..-25/-46..-55 体（NPC.cs:7770-8130 逐 case `defense/damage/life=(int)(×scale)`，紧跟 SetDefaults_ForNetId(基底,scale) 之后跑=乘在 ScaleStats 终值上） | scale 变体（小/大噬魂怪、蜂/黄蜂族、猩红族、僵尸/骷髅/眼族、雨僵尸族、苔藓黄蜂 -18..-21）本仓 stats=基底原值未乘 scale（经典档即偏;专家/-master 档原版序=ScaleStats 后再乘,本仓硬置/不置双面都非原版序）。唯一例外 -13/-14（表内预计算 hp/dmg/def）——★其值疑用四舍五入非 (int) 截断（26×1.15×1.1 应 32,表 33;8×1.15 应 9,表 10）,须 f32 定谳后一并重算。-15 残面同族:dmg ×1.15×1.1/def ×1.15/knockBackResist ×(2−scale)/height=44 硬置 | 逐 case f32 精确预计算全家 hp/dmg/def（含 -13/-14 现值复核）+ 表机制扩 h?/kb? 或改运行时 ScaleStats 后乘——需独立刀+金标,本登记不落刀(BJ337 只修基底/hp:400 两面) |

> L6 清偿批(2026-08-31)自此表移出并核销:友好轮水中小动物(:2220-2325)、地牢书架
> 书怪 693/694(findNearestBookForSpawn/AI_FindNearbyBook 早已落地,登记陈旧)、
> 昼池小动物链主体(2026-08-17 缺池补齐批,行残留)、天空水蜡烛加重支、
> skyBehindPlayer/AnyDanger 上下文门、血月 RollOnlyBadLuck(300)、
> WoF 在场地狱压制(移近似表)、NPC json 缺条目 589/630/686/687/255(json 已逐 id 核验在位)。

## 待补(依赖外部系统,暂不可见)
| 项 | 原版 | 依赖 |
|---|---|---|
| 渔夫 376 救援→369 城镇化 | :1685/53337 | savedAngler 位 + 转换链 |
| 高尔夫球手 589 海滩救援 | :1600 | TownNPC 出生管线(spawner→TownNPC,453 模式可扩) |
| 造型师 353 蜘蛛巢救援 | :1576 | savedStylist + TownNPC 管线 |
| 酒保 579 DD2 救援 | :1565 | 旧军入侵事件 |
| 海滩酒保 678 出生 | :1835 | TownNPC 管线 |
| Chum Caster 鲨鱼率 | :1766/5458 | 物品 820/弹体系统 |
| 墓地/Skyblock/infectedSeed spawnFriendly 变体 | :715-828 | 种子系统 |
| 专家 1/30 不友好例外 | :824 | 专家模式 |
| 武装僵尸(expert) | :4585 | 专家模式 |

## 近似(与原版等价或引擎级不可见)
| 项 | 说明 |
|---|---|
| SceneMetrics 计数 0.5s 缓存 | 原版每帧增量;刷怪按帧采样的差异不可感知 |
| UnderworldLayer = h-200 | **精确**(Main.cs:2863 属性表达式),非近似 |
| RollLuck(n)≈1/n | 玩家幸运度未接,默认幸运 0 时原版即 1/n |
| spawnRate 罚倍拆到 getSpawnRate | 原版同例程;语义同序 |
| 天空选点"露天判据"替代两侧带判定 | :890-897 原版 `x<0.45w\|\|x>0.55w\|\|hard`;本仓改"落脚面上两格无墙"(合法原版世界岛皆露天→等价,且兼容含中央浮空岛的存量世界;中央岛会出天空怪是可见差异,但存量世界本无此形态) |
| SpawnOnPlayer→钉玩家格 | :81273+ 500 次 spawnArea 选点循环未移植;史莱姆王以 currentSpawnX/Y=玩家格 + Game 常规落位扫描近似(必在玩家近旁,与原版意图一致) |
| GetSpawnRate 的 Zone 取值 | :504-559 链内 Corrupt/Crimson/Jungle/Meteor 走 zoneCounts 缓存计数(0.5s),UndergroundDesert 走 world.scene(测试直调无 scene 按 false);两者在真实运行时同帧一致 |
| ~~天空 399 概率近似~~ | ★SW-FX7 复核定谳（2026-09-10）：登记"影烛 3/10"系误注——1457 NPC.cs:1392-1396 加重档判定是 **ZoneWaterCandle**（mv2 8→3/mv3 30→10）,非影烛;L6 批已按原文接（:1918-1939 含 1405/1413 烛亮第二次独立掷怪癖）,spawn-parity-l6.test.ts 已锁 |
| 昼池小动物链由 spawnFriendly 段承担 | :4112-4373 昼池 else-if 链的本仓近似:权重/触发点(1/15 昼池 roll vs 概率 roll+tile 门)与原版不同,可见差异=昼间小动物密度曲线;主体链未移植(见待补) |
| ~~NearSpikeBall 以"场上存在刺球 70"近似~~(2026-09-03 清偿退役) | 已 1:1(:91002-91016,落点 ±300px 盒 × 锚盒相交):spawner 无实体桶访问不变,锚点经 spikeBallAnchors 侧信道每周期喂入(Game.trySpawnEnemy:26216-26228 / SimHost.trySpawn 同式采集)——旧"场上任意位置有刺球即抑制火轮位"过度抑制面消除 |
| 城镇 noWorms 帧级闩锁 | :717-814 原版 GetSpawnRate 与 SetSpawnFlags 同一次 TrySpawnAnNPC 内(每次尝试重掷);本仓 getSpawnRate(每帧)/spawn(每次尝试)拆两次调用 → townNoWorms 每帧掷一次、该帧全部尝试共用。分布相同,时序粒度差一档,不可见 |
| 厄运轮走 Luck.RollOnlyBadLuckExtreme(playerLuck,50) | :834 与原版同式;残余差异仅在 playerLuck 来源精度(见 RollLuck 近似行) |
| WoF 在场地狱压制 | :666-670 原版 wofNPCIndex 在场且玩家入地狱 → rate×3/max×0.3;本仓 trySpawnEnemy 首行 `if (this.boss) return`——Boss 槽(含血肉墙 114 本体)存续期整体禁刷,强于原版乘法压制。spawner 内接 wof 倍率即死码,登记不接(L6 批裁决) |

## 图鉴搜索别名（SearchAliasInfoElement，BestiaryDatabaseNPCsPopulator.cs:643-647）
- 原版给 EoC(4) 加别名 `eoc`、EoW(13) 加 `eow`（可能还有更多后续行）；我方
  BestiaryPanel 搜索只匹配显示名+掉落物名，无别名机制。
- 可见影响：极低（缩写搜索便利性）。实现方案：提取器扫该文件全部 AddTags(new
  SearchAliasInfoElement(...)) 落 JSON，面板搜索并入匹配串。

## 2026-08-17 出怪池+仇恨脱战全量审计(双代理对账)
### 本轮修复(数值错误)
| 项 | 原版 | 影响 | 状态 |
|---|---|---|---|
| 地牢墙色重掷档 | :2551 Next(3)∈{0,1,2} | 曾 int(0,3)=Next(4) 多出档 3→蓝砖权重虚高 ½;RollLuck(7) 替 N(7) | ✅ 2026-08-17 |
| 神圣地下 661 夜窗上界 | :3949 !dayTime&&time<16200 | 曾缺 <24 上界(凌晨也出);RollLuck(10) 替 N(10) | ✅ |
| 彩虹史莱姆 244 | :3953 RollLuck(10) | 曾 N(10),luck 未接 | ✅ |
| 蒲公英 628 tile 门 | :4398 仅 {2,477} | 曾扩到草族∪雪∪冰(注释误引 :4112 昼池 critter 门) | ✅ |
| 稀有元素 476 十周年门 | :3657 tenthAnniversaryWorld&&Next(2) | 曾无门,普通世界丛林也出 476;入口 RollLuck(十周年?50:75) 替恒 N(75) | ✅ |
| 专家骨堆 449-452 | :5029 expertMode&&1/3→Next(4) | 曾注"无专家模式"略——expert 已实装 | ✅ |
| AI_001 flag3 史莱姆雨 | :61462 \|\| Main.slimeRain | 曾缺第四项:史莱姆雨白天满血地表史莱姆不追人 | ✅ |
| AI_006 地下蠕虫地表脱战 | :51532-51544 | 玩家死亡\|\|(flag 型 10/39/95/117/510&&玩家升地表)→EncourageDespawn(300)+下潜 0.2;513 沙漠外 0.1;621 白天 (60)+vy+1——曾只死→300 | ✅ |
| AI_014 吸血蝙蝠白天离场 | :22944-22949 | 158 地表+白天+非日食→dirY=-1+水平翻转上飞——曾缺(白天赖场) | ✅ |

### 本轮登记(缺池/结构近似,依赖未就绪)
| 项 | 原版 | 影响 | 依赖 |
|---|---|---|---|
~~昼池 critter 链主体/695/696/海滩边缘支/香蒲蜻蜓/晨间鸟两支/海滩蝎/天然侏儒两支/友好轮 isBeach 支~~ → ✅ 2026-08-17 缺池补齐批全量移植(敌怪轮昼池链+侏儒两支+友好轮 isBeach/雨天香蒲;新增 findCattailTop/rollDragonflyType 辅助;附加只走 pendingCritterExtras 侧信道)。教训:友好轮新支必须带 spawnFriendlyCycle 外层门(:2006 链语义),曾漏致敌怪轮被海鸥 602 截胡+游戏内 ReferenceError(raining 作用域);迷你测试世界(<2×beachDistance)全图落海岸带,小动物测试须 1300 宽世界。
| ~~食人怪 471 玩家死快速消散~~ | ★SW-FX7 勘误：471=Goblin Summoner（NPCID.cs:12009,非食人怪 43）;死亡快散支在 1457 :57286-57293（`player.dead→TargetClosest→仍死→EncourageDespawn(1)`） | 471 全 AI 已由 F12 批落地（goblinWarlockStep 含该支） | ✅ 已清;SW-FX7 判别力锁定（tests/sw-fx7-spawn-ai.test.ts） |
| ~~骷髅手 aiStyle12 退相门~~ | ★SW-FX7 勘误：Distance>2000‖Dot≤0 门实属 aiStyle11 骷髅王**头**（:22648 ai[2]==2 直冲退出/:22709 ai[2]==5 回冲退出）;aiStyle12 手为 :22400-22714 五态机（头离场→EncourageDespawn(10) :22426） | 台账 D 2026-08-19 已全量重写 bossAI.skeletronHandAI 五态机 | ✅ 已清 |
| ~~AI_026 事件门~~ | 1457 :63219-63229 546 离沙漠 EncourageDespawn(10)+ai[3]=num;:63230-63240 329/315 非南瓜月 EncourageDespawn(10) | chargerAI 已接（546 沙漠重瞄双门/329·315 pumpkinMoon 臂） | ✅ 已清;SW-FX7 判别力锁定（tests/sw-fx7-spawn-ai.test.ts） |
| ~~aiStyle22/316~~ | 1457 :24792-24847 dead‖Dist>3000→(10);316 ai[3]==1 态 Opacity−0.025 渐隐自灭（NPCDeath55 首帧）;330/253/490 事件旗 | ghostAI 已接（含渐隐面） | ✅ 已清;SW-FX7 判别力锁定（tests/sw-fx7-spawn-ai.test.ts） |
| flyAI 遗留近似门 | aiStyle2 无距离门 | 仅死键 cave_bat/servant_of_cthulhu 使用（仅 key 分发 else 支可达,vanillaId 域走 aiStyle2→floatEyeAI;SW-FX7 复核确认无生成方=死码） | 死键退役时一并清 |
| ~~noSpawnCycle 帧抑制~~ | NPC.cs:6186 静态位;置位面=checkDead 尾 :78941（任意死亡）/checkActive 消散 :78797/GetShimmered :92673·:92690;消费=SpawnNPC 头 :80991-80995 跳过一周期 | 消散面 2026-09-01 已接（runDespawnFx→Game.noSpawnCycleThisFrame,trySpawnEnemy 头消费）;★SW-FX7 2026-09-10 补死亡面（Enemy.hurt 死亡管线置位;血尽转演出族放行不置位）。残差登记：TownNPC 死亡管线与微光 GetShimmered 两置位未接 | ✅ 2026-09-10 SW-FX7（tests/sw-fx7-spawn-ai.test.ts） |

## 2026-08-17 缺池补齐批落地明细(供回溯)
| 支 | 原版 | 实现要点 |
|---|---|---|
| 敌怪轮昼池 critter 链 | :4110-4266 | 外门 !waterTile&&num46<w/2&&N(15)&&草族{2,477,109,492,147,161};雪/冰→企鹅 148/149;椿象 669(Next(stinkBugChance))+1/4 左右附加;蝴蝶 356/金444(Next(butterflyChance));起风瓢虫 604/金605(1/5 近似 butterflyChance/2 复合档)+四段附加;金兔/金松鼠;节日 303/337/540;1/3 松鼠 299|538;兜底兔 46 |
| 海滩内带蝎 | :4215 | beachX<x<w-beachX&&N(12)&&黄沙→366/367 |
| 敌怪轮香蒲蜻蜓 | :4221-4233 | 草沙{2,477,53}+!tooWindy+!rain+N(3)!=0+y≤ws+findCattailTop→金601/三色(RollDragonflyType)+1/3 左右附加 |
| 晨间鸟两支 | :4243/:4251 | A:num46<w/3+<9:30+N(4)+鸟族<6 上限;B:num46<w/3+N(15)(含雪 147);金 442/297/298/74 |
| Town Slime 695/696 | :4281-4288 | num46>w/8+{2,147,60,161}+N(200)+双唯一;RollLuck(100)<40→696 |
| 海滩边缘支 | :4290-4366 | !xRange+沙+海岸带;干 1/10→602;水:干隙扫描(SolidTile 排除 solidTop/half/slope)→9/10 空过 else Next(4):625/615/金627|626/688 |
| 侏儒两支 | :3532-3538/:5647-5686 | ①livingTree(玩家格墙 244)+夜或落脚墙+RollLuck(30)+CountNPCS(624)≤Next(3);②地下:非恶地+RollLuck(10)+y∈[0.8ws,1.1ws]+墙∈{2,63,196-199} |
| 友好轮 isBeach | :2021-2097 | friendly 门内!xRange&&isBeach:水→N(2) 才掷 Next(4) 表(625/615/金627|626/688)else 低线 602;干→602 直接 |
| 友好轮雨天香蒲 | :2105-2123 | friendly 门内草沙+rain+N(2)+FindCattailTop→金601/三色+1/3 左右附加 |

### Review 批修正(2026-08-17 自复查)
| 问题 | 修正 |
|---|---|
| 晨鸟 A 全天出晨表鸟 | 补 Main.time<18000(<9:30) 时段门(:4244) |
| 瓢虫写死 1/5 | 改 Next(butterflyChance/2)(:4156——随每日掷收敛) |
| 海滩边缘支水表 9/10 空过门方向反 | N(10)=1/10 通过,原版 Next(10)!=0 → return,改 !N(10)(:4314) |
| 自定义落位被覆写 | spawnNPC 非默认坐标打 customSpawnPos → Game 放置段跳过 critters 找地面/water 扫描;香蒲附加 extras 加 ax/ay 绝对坐标(落 cattail 顶±16) |
| EnemyDef.defense 可选字段 += 严格空检查报错 | (?? 0) 空合并(松鼠黑化彩蛋 Enemy.ts) |

## 2026-08-31 spawn parity L6 清偿批(runtime spawner 面)

基准 Terarria1458/Terraria/NPC.cs `class Spawner`(:144-6011,SpawnAnNPC :1284-5245;
老台账行号均指旧反编译布局,本批已按 1458 新布局逐支重对)。只动运行时 spawner 面,
未触碰 world/gen 生成期 pass(并行重构禁区)。

### 本批实装(每项 ≥1 条门控断言,tests/spawn-parity-l6.test.ts)
| 项 | 原版(1458) | 实现要点 |
|---|---|---|
| 友好轮通用水域段 | :2220-2325 | 雨天香蒲支后插入 waterTile 段:白天地表水面线 dry-gap → case60 龟617/水黾群612·金613、case53 鸊鷉608/水黾群、default 草 1/5 海龟616/鸭362\|364;未达线→内带鳉607/RollLuck400 金金鱼592/金鱼55。整支 return(友好守卫前) |
| 友好轮雨天链尾 break 语义 | :2380-2407 | raining&&y≤UnderworldLayer 进入后【恒产出并 break】:深层1/5宝石松鼠→1/5宝石兔→RL400 金蚯蚓448→Next(3)!=0 蚯蚓357→RL400 金上岸金鱼593→兜底 上岸金鱼230(GoldfishWalker);修掉"雨天草面出鸟表二/尾部兔"的原版绝迹组合 |
| 友好轮夜萤火虫独立槽 | :2414-2438 | !tooWindy&&!dayTime&&Next(fireFlyFriendly)==0(fireFlyFriendly 与敌怪轮 fireFlyChance 同夜独立两掷,setFireFlyChance :94503-94516),主只+四向 1/fireFlyMultiple 附加(World.fireFlyFriendly 字段早已在,缺消费端) |
| 友好轮浅地下带尾段 | :2580-2625 | !surfaceSpawn 三带分裂照抄:金兔443(RL400)→节日303/337/540(!flag11 门=浅地下专属)→Next(3) 分派 浅地下 SelectRandom(299\|538)/洞穴层 1/5 宝石松鼠;!=0 支:浅地下兔46/洞穴层 1/5 宝石兔(掷空静默空过)。★旧实现整个漏掉 ws<y<rockLayer 带 |
| 天空怪探测器四门+加重双掷怪癖 | :1387-1425 | flag5=带外距离>1/3 && skyBehindPlayer(SetSpawnFlags :413=玩家所站格墙∈Main.wallLight∪{73},WALL_LIGHT 表 Main.cs:10717-10732 提取)&&!AnyDanger;水蜡烛 mv2 8→3/mv3 30→10;探测器掷还原短路序 (!downedMartians&&N(mv2))==0||N(mv3)==0(旧实现语义写反成 Next(downedMartians?30:8));:1405/:1413 两支"同条件+&&ZoneWaterCandle"重复支 = 烛亮第二次独立掷(原版怪癖照抄);87 同款双掷;686 改 RollLuck(25) |
| 地表探测器 flag17 AnyDanger 压制 | :4170-4201 | AnyDanger 场置 flag17=false(Gate :4171-4174),此前恒放行 |
| NPC.AnyDanger 共享快照 | :81040-81108 | Game.npcAnyDanger() 新方法(月总倒计时/入侵/月事件/旧军/Boss 族∪DangerThatPreventsOtherDangers={517,422,507,493,399,13,14,15}),石碑 recheck 与 spawner 双消费端同源;setPlayerFlags 追加 anyDanger/palHas5663/palHas5664 三个可选参 |
| 血月 The Groom/Bride | :4623/:4628 | RollOnlyBadLuck(300)==0 在前、(bloodMoon||graveyard) 判据在后(原文 RNG 流序);负运收窄 [150,300) 接通(Luck.cs:31-38) |
| Palworld 双宠池 | :4374-4389 | Next(200)→**Next(160)**(1458 调档);HasItem(5663/5664) 强制档(flag20 修正:!B&&A→true / !A&&B→false)——本仓物品池未注册两物时旗恒 false=纯幸运档,Game 经 invIndexOfVanilla+inv.countOf 注入 |
| 万圣节家族补接 | :4561/:4734/:4739/:5115/:4439/:4449 | 眼球变异 Next(317,319)(眼球簇内)、夜僵尸族 Next(319,322)、xMas Next(331,333)、洞穴幽魂 Next(322,325)(均 1/2 门)——旧注"节日未接"失效(季节旗 clock.halloween/xMas 早已建模);Raven 301/Hoppin' Jack 304 补 halloween 单边门(原 (halloween\|\|graveyard)) |
| 节日史莱姆替换档 | :5637-5685 | GetBasicSlimeToSpawn default 首两位:halloween→302/xMas→333+rng.int(0,3),受 GetBasicSlimeToSpawn_ChanceToBeHolidaySlime(lowTiles?Next(4)==0:Next(3)!=0)独立掷——"节日未移植"备案核销 |
| lowTiles 批 II | :3726/:4990 | ①困难 lowTiles 世界恢复肉前 1/4 史莱姆臂(门改 (!hard\|\|lowTiles));②lowTiles 肉前 y>rockLayer && RL100==0 && 场上无85/629 → ZoneSnow?629:85(低格世界唯二地下稀有怪来源,整支缺失);rate÷2/gnome/torch/zombie-settings 各臂此前批已在 |
| 骷髅商影烛门 | :5007-5010 | 453 加 !ZoneShadowCandle(影烛熄灭商队) |
| 地下沙漠直接格判定 | :1682/:5535 | 门改 SpawnTileOrAboveHasAnyWallInSet(落脚格/上格墙∈AllowsUndergroundDesertEnemiesToSpawn)||邻域扫描旗——直踩沙漠墙的落点每次尝试受理(旧仅 1/3 抽样);墙集提升为模块级 DESERT_WALL_SET |
| 专家骨堆三连 ==0 怪癖 | :5120-5139 | `num56=Next(4)` 后三个 `==0` 判定连写(1456 :5031-5055 同款确认非 1458 独有):450/451 死码,实际分布 449×¼/452×¾——旧均匀四选违背反编译,按源照抄勿"修" |
| ~~isNearFairy 刷怪率调制~~(2026-09-03 清偿退役) | :745-749 | rate×1.2/max×0.8;判定改 1:1 Player.isNearFairy(Player.cs:54494-54506:任一 active 仙女 583-585 距玩家 Center<NPC.sWidth[=1920 常量 NPC.cs:6791],无 ai 态条件)——窗口谓词 isNearFairyWindow(VanillaSpawner.ts 尾)Game 每周期喂入 VanillaSpawner.isNearFairy;与 AnyHelpfulFairies(:90954,跟随态门,checkToSpawnUndergroundFairy 消费)两谓词分立 |

### 已知回归抓回(编辑碰撞)
| 问题 | 定位 | 处置 |
|---|---|---|
| 并行会话编辑碰撞把 getSpawnRate 的地牢 arm(`ZoneDungeon && !downedBoss3 → spawnRate=10`)从文件中挤丢,只剩注释,dg.spawnRate 由 10 漂成常规链终值 75 | VanillaSpawner.getSpawnRate 尾段(skyblock ÷2 arm 之前) | 按 :787-790 补回并置于旅程滑杆之后/skyblock 整除之前;dungeon-spawn.test 断言锁回(toBe(10)) |

### 本批复核为误报/陈旧的登记
- 地牢书架书怪 693/694(findNearestBookForSpawn/AI_FindNearbyBook 32×32 窗+屏外门+伪装态 ai[3]=3 早已落地);
- 昼池小动物链主体(2026-08-17 缺池补齐批);
- NPC json 缺条目 589/630/686/687/255(public/sprites/vanilla-npcs.json 五 id 逐个核验在位)。

### Remix 支裁决(前几轮备案项)
`Main.remixWorld`(don't dig up / 从地狱出发类世界形态)在本仓引擎不存在:
seedFlags 无 remix 键(SeedEasterEggs 全集无此种子)、世界生成无从产出生效形态,
spawner 内全部 remix 分支(GetSpawnRate :489-582 remix 重排/:1207-1254 chosen-tile 重排/
Spawner 内 inRemixStartingArea/GetGnomeChance remix 尾除 等)经 `!remixWorld` 或
world.seedFlags?.remix 恒假路径不可达——维持"不实现"裁决,与 infectedSeed/teamBasedSpawnsSeed 同类。

### 测试结果
tests/spawn-parity-l6.test.ts 17 项全绿;spawner 相关既有套件(spawn-friendly-cycle/
critter-spawn-parity/dungeon-spawn/jungle/snow/house/shimmer/firefly-fairy/
spawn-progression-gates/bound-chains-vanilla/iiiii61-seed-runtime/town-npc-progression)
共 99 项全绿。tsc:本批触碰文件零错(gen//LiquidSim 为并行会话在途重构的瞬时错,非本批面)。

## δB B12 补接（双地牢刷生纸屑爆,✅2026-08-31 已清偿,2026-09-01 复核）

InScreenDungeonSpawn(66) 编排粒子的生产面此前零调用（syncModules 行内注&quot;spawner 域 caller
type 接线在位&quot;系声称失实,已撤回改写）。现按 NPC.SpawnNPC :5265-5273 包装位直译补齐：

- 生产点=VanillaSpawner.spawnNPC 尾门（自然刷生全链与 SlimeRainSpawns 均经此口,原版同构;
  SpawnFaelings 走裸 NewNPC 不经包装故不笺）。
- 门=dualDungeonsSeed && Y>worldSurface×16 && Y<UnderworldLayer×16（像素域严格不等;
  UnderworldLayer→本仓 world.lavaLine）。载荷:Position=(X,Y)、Movement=(width,height)、
  uniqueInfoPiece=npcType(netId 原值)。
- 出站=新增 spawnOrchestra 钩（Game.makeVanillaSpawner 统一注入三个构造点）：本地
  netApplyParticleOrchestra 同款复放 + module8 上行排除发送者广播,BroadcastOrRequest 两半边。
- 禁入 world/gen 生成期 pass 遵守——仅运行时刷生侧。
- 回归 tests/blue-deltab-wiring.test.ts（正例+dual 关闭/地表带/地狱层三负例）。

## SW-FX7 补债批(2026-09-10,spawn/AI 登记债逐条定谳+实修)

对盘范围:本表「待补(有可见影响)」+ 2026-08-17 登记批全部 14 条。现状先查(大量
条目已被 2026-09-02 敌侧弹幕批/F4/F12/台账 D/L6 等后续批清偿)→1457 反编译金标
逐条重锚(老台账行号均指旧反编译布局,本批已按 1457 布局重对)→1:1 补齐或勘误。

### 本批实修(4 项,tests/sw-fx7-* 全绿,变异实验证红)
| 项 | 1457 金标 | 实现 |
|---|---|---|
| CountNPCS 全量计数通道 | CountNPCS 遍历 Main.npc 全表(NPC.cs:51306 附近) | Game.trySpawnEnemy 每周期构建全量 vanillaId→存活数表(enemies+critters+bound 全桶,原版 Main.npc 全表一体)注入 VanillaSpawner.npcCounts;countNpc 注入优先→moonEvent/lunar ctx→activeIds 0/1 回退(测试域兼容);cnt467 同步改真计数。修复面:250<2(:4192)/467<2(:3575)/510<4(:3973)/74+297+298<6(:4328) 四个 N 阈值门(≥2 只在场仍放行→不再漏);==0 唯一门(513/453)与 gnome AnyNPCs(624)(:5399)旧语义本就正确零改动 |
| 大盒弹 44/288 tile 缩盒判定 | GetCollisionParams(Projectile.cs:19982-20156):HandleMovement 的 TileCollision 用缩盒——44: aiStyle18→width−36=12×12(:20081-20085);288: 缩盒名单→10×10(:20072-20080);300: tileCollide=false(:3915) 无扫描 | DartStyle.tileBox(中心锚正方形)+dartStep 撞块段改缩盒重叠判定(shotBoxSolid);其余弹型维持中心格近似(GetCollisionParams 其余分支逐型对拍另批)。修复面:沿墙皮掠过时提前 6px/5px 消亡=原版 TileCollision 截停边界 |
| 291 发射位显式锚 | NPC.cs:21294 NewProjectile 末两参=Main.player[target].Center.X/Y(ai[0]/ai[1]) | Enemy.fireCasterVolley 285/286 支发射时写 dart.spawnAi0/1=玩家心(原首子步补偿差 1 拍玩家位移);290/293 原版传 0/0 不动 |
| noSpawnCycle 死亡面 | checkDead 尾 :78941 无条件 `noSpawnCycle=true`(与消散面 :78797 对偶);消费=SpawnNPC 头 :80991-80995 下一周期整体跳过 | Enemy.hurt 死亡管线(血尽直死收敛点)this.dead=true 处置位 noSpawnCycleThisFrame;血尽转演出族(396/397/371/246 挂载/塔族)放行不置位=与 checkDead 转支对齐。战斗高频击杀帧照常刷生的偏离消除 |

### 本批复核为误报/已清的登记(逐条带 1457 重锚)
| 项 | 定谳 |
|---|---|
| 天空 399 影烛加重支 | 近似表"影烛 3/10"系误注:1457 :1392-1396 判定是 ZoneWaterCandle(mv2 8→3/mv3 30→10);L6 批实现正确(含 :1405/:1413 烛亮第二次独立掷怪癖) |
| 44 魔镰 AI_018 phase1 转向 | 登记误锚:AngleTowards(0.25) 属 aiStyle18 内 type==1092 支(:25735-25737);44 走 :25780-25797 通用支,零转向零追踪=原版本相,不修 |
| 216 海盗火枪手专家炮弹 | 非"专家模式旗"依赖:1457 :60106-60117 是 flag21=localAI[2]>=20(20 轮齐射后切 CannonballHostile 240/伤 100) + 冷却 max(60,180−lai3×20)(:59758-59774);F4 批已 1:1 |
| 291 到点即爆/290 反射/471 死亡快散/骷髅手五态/AI_026 事件门/aiStyle22·316 离场 | 均已被后续批清偿(2026-09-02 敌侧三缺口批/F4/F12/台账 D 2026-08-19/审计 B);本批按 1457 重锚 + 判别力锁定测试防回退 |

### 本批登记(未修,带理由)
| 项 | 理由 |
|---|---|
| 572/128/177/288 渐入 | 反编译定谳=四型无 alpha 递减行,本体恒不可见(GetAlpha 缺省尾 :81481-81491),可视面=真尘链(572:2×d40/177:3×d137/128:3×d92/288:3×d170+1/8);本仓 fade:50 本体渐显。不动刀理由:本体不可见化必须与 VanillaDust 扩表(d40/d92/d137/d170 按"消费方扩表"协议逐型移植)+真尘链同批,否则弹幕近乎全隐=可见性倒退;登记待尘域专项 |
| 44/288 之外弹型的 GetCollisionParams 缩盒 | 原版对 60+ 弹型/aiStyle 有逐型缩盒(aiStyle29/49→−8、27→−12、182 族→−20、969、771 族…);本仓 dartStep 中心格近似维持,逐型对拍另批(每型需 SetDefaults+缩盒分支双锚,防一刀大面积改变既有弹幕消亡边界) |
| flyAI 死键(cave_bat/servant_of_cthulhu) | 死码确认(仅 key 分发 else 支可达,无生成方);按原裁决死键退役时一并清 |
| noSpawnCycle 残差(TownNPC 死亡/微光 GetShimmered) | 城镇死亡走独立类,微光两置位(:92673/:92690)语义面窄;主面(敌怪死亡+消散)已闭合,残差随城镇/微光域批处理 |

测试:tests/sw-fx7-spawn-ai.test.ts(12)+tests/sw-fx7-dart.test.ts(8)全绿;变异实验
5 组(countNpc 摘除注入/缩盒退中心格/死亡面摘除/291 Dot 门死化/290 反射改即灭)全部
证红后复原。spawn/AI 族既有 23 文件 273 测试:1 红为 sw-bj31 源码扫描断言(断言串
"TILE_SAND.has(t) && this.spawnTil" 已不匹配 HEAD 已提交的 376 沙滩支重写——
先行批已改源未同步测试,与本批无关,移交其归属批)。

## BJ343 邻域登记批(2026-09-25,渲染钟域三案落档+行号勘误)

红蓝-W5 邻域普查落档:三案均为【登记债】(行为可见但属渲染钟域,独立批清偿),
各含 ①原版行号 ②可见影响 ③补齐依赖 ④状态。

| 项 | ①原版 | ②可见影响 | ③补齐依赖 | ④状态 |
|---|---|---|---|---|
| Enemy.visEffectFrames 暂停冻结 + 0 哨兵撞车 | timeForVisualEffects 推进在 Main.Update :17340-17342,**先于** gameMenu 早退(:17343)与暂停门——原版暂停期/菜单期 TFE 钟照走;本仓 stepVisEffectTick 挂 fixedUpdate(!paused 门,Game.ts:8112)→暂停冻结。另:visEffectFrames 以 `visTickCounter>0` 为「Game 已启动」哨兵(Enemy.ts:167-171),计数器回卷 216000→0 那一拍恰好撞车 → 单拍误走 performance.now 墙钟兜底(相位跳变) | 暂停期间敌怪附属动画钟(如 10311 p120 相位/10813 %60 抖动)冻结不闪,原版照走;回卷拍单帧错相(视觉一帧跳,无状态面) | 与 GTW 同构:visEffectFrames 改读 GameTime 单源或 stepVisEffectTick 移出 !paused 门(用户拍板暂停语义后照 GTW 裁决);0 哨兵改独立布尔 launched 位 | 📌 登记债(2026-09-25 BJ343) |
| WhipProj.whipHueClock 墙钟 | miscCounter tick 钟:UpdateMiscCounter 每拍 +1/wrap 300(Player.cs:29529-29531,调用点 :24788/:36009);消费=miscCounterNormalized :3373 → 鞭彩虹相 num22 链(:48010/:48342)/932 ai3(:48396)。本仓 whipHueClock(WhipProj.ts:1159)=performance.now/5000%1——同率(5s)但墙钟,暂停/失焦相位照走 | 晨星鞭彩虹拖尾色相在暂停期间继续转,原版冻结;重进世界相位与原版漂移(纯视觉) | 改读 GameTime 单源(tick/60×?——miscCounter=1 拍 1 步 wrap 300,等价 (tick%300)/300;GTW 秒域换算 tick%18000/18000×5?——注意 miscCounter 与 GTW 独立,须独立推导或并入 visTickCounter 族) | 📌 登记债(2026-09-25 BJ343) |
| shardGlowClock 消费行号勘误 | TileDrawing.cs:1284(129 晶簇辉光 hslToRgb(0.7±sin(2π·GTW·0.16+x·0.3+y·0.7)·0.16));旧注 :4688 系同文件 case 129 **帧动画**支的 GTW 站(:4610 num34 同族),非辉光消费行 | 无(纯注释) | — | ✅ 已勘误(VanillaTiler.ts shardGlowClock 头注,2026-09-25 BJ343) |
