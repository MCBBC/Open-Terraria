# 官方 Wiki 机制对齐审计 · 差异总表

> 审计日期:2026-08-13
> 方法:官方 wiki(terraria.wiki.gg 离线镜像 `terraria-wiki-md/`)× 反编译源码(`Terarria1456/`,最终裁决)× 本仓库实现(`game/src/`)三方核对。
> 状态图例:✅对齐 / ⚠️数值偏差 / ❌未实现 / 🔀逻辑不同 / ❓存疑 / 📄wiki与源码不符(wiki 过时)
> 本文档只记录事实差异,不含修复方案;修复按各域 TOP N 排期。

## 总览(23 域全部完成,约 1058 条逐项核验)

| 域 | 条目 | ✅ | ⚠️ | ❌ | 🔀 | 📄 |
|---|---|---|---|---|---|---|
| 敌怪生成 | 25 | 15 | 7 | 3 | 2 | 1 |
| 群系/住房/幸福度(两轮) | 61 | 34 | 15 | 14 | 6 | 3 |
| 玩家移动 | 39 | 14 | 15 | 12 | 5 | 0(小瑕1) |
| 修饰语/重铸 | 29 | 11 | 5 | 12 | 1 | 0 |
| 时间/天气 | 50 | 33 | 9 | 5 | 4 | 0 |
| 幸运/杂项 | 54 | 25 | 12 | 12 | 4 | 0 |
| Buff/Debuff 全表 | 88 | 41 | 17 | 27 | 1 | 8 |
| 再生/防御/伤害公式 | 35 | 14 | 12 | 8 | 3 | 0 |
| 工具力/挖掘 | 33 | 11 | 12 | 7 | 5 | 0 |
| 事件机制 | 52 | 44 | 3 | 4 | 1 | 1 |
| 制作/配方 | 34 | 15 | 5 | 9 | 4 | 0 |
| 图鉴/收集 | 28 | 18 | 3 | 7 | 1 | 1 |
| 盔甲/套装 | 54 | 21 | 6 | 24 | 2 | 2 |
| 电路/机械 | 64 | 38 | 9 | 13 | 3 | 1 |
| 弹药/弹幕 | 32 | 12 | 6 | 13 | 1 | 2 |
| 液体/钓鱼 | 26 | 12 | 4 | 9 | 3 | 2 |
| 掉落/拾取 | 32 | 16 | 8 | 12 | 2 | 1 |
| 受击/无敌帧/击退 | 51 | 22 | 10 | 14 | 4 | 1 |
| 召唤师/护甲穿透 | 35 | 22 | 8 | 4 | 4 | 2 |
| 地形危害/传送 | 36 | 13 | 14 | 9 | 0 | 0 |
| 物品使用主链(补漏) | 22 | 9 | 6 | 3 | 4 | 0 |
| 困难模式推进链(补漏) | 25 | 14 | 7 | 3 | 3 | 0 |
| 光标与方块交互(补漏) | 30 | 14 | 6 | 6 | 4 | 0 |
| 商店货品池(补漏) | ~19大条 | 4 | 2 | 9 | 4 | 0 |
| 音效触发链(补漏) | 33 | 13 | 5 | 9 | 5 | 1 |
| Boss 战斗本体(补漏) | 23 | 14 | 9 | 4 | 5 | 5 |
| **合计** | **~1058** | **~472** | **~210** | **~247** | **~78** | **~31** |

### 一、跨域系统性根因(多域重复发现,修一处全链受益)

1. **难度轴未接(3+ 域同根)——最大数值缺口**
   - 玩家受伤防御系数:恒 `dmg-def*0.5`,原版 0.5/0.75/1.0(Main.cs:65646)——专家承伤偏低、大师低一半
   - debuff 时长×2/×2.5 缩放完全缺失(BuffID.cs:28)——岩浆着火恒 7s、流血恒 10-20s
   - 敌弹对玩家全局 ×2(Projectile.cs:13776 Damage_EVP)——机关/敌弹对玩家伤害全部减半
2. **敌怪受击免疫模型(2 域同根)——全远程 DPS 失真**:Enemy 全局 iframes=8,原版无全局免疫、单发弹(maxPenetrate==1)豁免且不设帧、穿透弹按 owner 槽 10t → 霰弹/多随从同帧只吃一发
3. **DamageVar ±15%+luck 链(3 域同根)**:玩家受击(Enemy.ts:765 连基础浮动都没有)、玩家输出、接触伤害全部缺
4. **扫描半径系统性偏小(4 域)**:光环 ±48×36 步长3 vs ±84×62 逐格(1×1 灯仅 1/9 命中)、制作站 ±20/15 vs ±5/3(隔两屏生效,反向偏大)、生成环随视口浮动 vs 常量 1920×1200、城镇 NPC 计数 ±1080 vs ±1200
5. **基础常量/公式偏差**:重力 0.36 vs 0.4、移速 2.6 vs 3、跳跃钉速模型 vs 衰减、击退 3.4/−3 vs 4.5/−3.5、掉落物重力 2.5 倍、霰弹散布 ×20、磁吸 94/12/60/80 vs 150/350/250/300、锤墙 ×2 vs ×1.5
6. **"数据在表但消费链断"(5 域)**:projStatus 15 个 Enemy buff 字段静默跳过、幸运消费侧(伤害/刷怪/心星)、词缀 7 键仅 dmg/kb、extraUpdates/per-type pierce 全缺、buffImmune 双侧未建模
7. **本地自创属性(应删)**:药水病 +80 maxHp(Buffs.ts:466,最离谱)、甲虫球 15% 减伤(原版无)、摔伤 %HP 三次方曲线、浮标入浆即毁、掉落物 10 分钟定时销毁、1/3 箭回收(1.4 已删)
8. **提取器静默丢数据**:Turtles 组嵌套括号→海龟雕像配方缺、词缀字节读后丢弃、自id弹药 21 条 -1、饵表 2676=30 错、杀数表缺 5 条

### 二、玩法阻断级缺口(正常流程不可达)

| # | 断链 | 影响 |
|---|---|---|
| 1 | 邪教徒自然生成(CultistRitual)未接 | 439→四塔→月总整条进度链不可达 |
| 2 | 17 种 Boss 宝藏袋开启(仅世花) | 专家内容整层不可得 |
| 3 | 钓鱼物品断层:饵 0/竿 1/渔获 2/128/药水 0 | 正常玩法无法抛竿 |
| 4 | 晶塔获取链(商店进货+10 变体) | 晶塔不可获得 |
| 5 | 旗帜系统整块(BannerSystem+旗 buff) | 经典战斗机制缺失 |
| 6 | 幸福度系统整链(640 行数据) | 经济系统全靠折扣卡 0.8 |
| 7 | 陨石坠落链、日曜/海龟/仙人掌等 24 条套装规则、DD2 哨兵上限 | 后期内容白板化 |

### 三、一行级 P0 速修清单(低风险高影响,建议立即做)

1. `Buffs.ts:466` 删药水病 +80 maxHp(喝药即+80 上限,扭曲血条)
2. `Player.ts:1856` 防御难度系数 0.5/0.75/1.0
3. 敌弹对玩家 ×2(Damage_EVP 全局规则)
4. `Housing.ts:199` 向日葵符号反(+40→−40/株)
5. `vanillaSummonStats.ts:64-65` 神圣召唤头键(现永不触发+红帽误触发)
6. `Game.ts:10551` 炼金台粘滞(开头清 false)
7. `Game.ts` 传感器帧表 `%3`→直接映射
8. `SkyRenderer.ts:611` 月相 `dayCount%8`→`clock.moonPhase`
9. `TouchDamage.ts:44` 仙人掌种子门禁(注释与代码矛盾)
10. `Game.ts:4729` 爆炸伤害盒(炸弹 11px→64px,应 PrepareBombToBlow)
11. `TeleportPylons.ts:183`+`Game.ts:2205` lavaLine 残留→`h-200`
12. `Game.ts:4338` 无尽袋 consumable 门
13. `ui/UI.ts:834,854,1222,1324` 词缀实例三处丢失
14. `vanillaRecipes.ts:232` 制作消耗回滚(先扣后查=材料销毁)
15. `Enemy.ts` iframes 模型改 per-owner+maxPenetrate==1 豁免
16. `items.ts:1003` axe=70 单位污染(删写死表走 JSON)
17. `Game.ts:5050` 矿三档镐力门槛(梦魇镐能挖钴矿)
18. `constants.ts` 重力/移速/下落三常量+摔伤公式

### 四、wiki 勘误总表(源码裁决,共 ~25 处)

生成环高度 1080→1200(1.4.4→1.4.5.6)/幸福度上限 1.38→1.5/墓地扫描窗 170×125→169×124/狼人流血 1/8→1/5/Calming −17%→−39%/Campfire"+10%"不存在/Darkness 纯图标/火把神计数窗 41×41→81×81/错群系火把 −0.3→−0.2/税收上限 25金(非50)/护士费用与血月无关/情人节桌面不存在/banner 无杀数升阶制(1.4.5.6)/甲虫防御球减伤(wiki 有、源码无)/穿透×0.8 通用衰减(不存在)/箭回收(1.4.0.1 已删)/物品 3 分钟消失(不存在)/boss debuff 减半(不存在)/固定 AP 武器(不存在)/矿三档镐力/月亮掉落门基数 28/24(部分页沿用旧值 30/17)/骑乘坐骑减伤(不存在)/Fishing atmo 公式过时/水传感器微光(wiki 错)/Betsys Curse 时长自相矛盾/"Ogre Sped"应 Oozed/木套注释(本项目自注错)。

### 五、引擎级立项清单(非一行可修,需单独排期)

抓钩系统(完全未实装)/坐骑系统(仅矿车)/旗帜 BannerSystem/幸福度 ShopHelper+两表/Block Swap/附近箱联动(1456 默认开)/摇树子系统/礼袋礼盒开启/CultistRitual 自然生成/岩浆钓物品链(2422+三源)/陨石触发链/PvP 受伤链/传送门枪/微光塔精确判定/StatusFromNPC+StatusPlayer 两张全表/玩家 buffImmune 体系。

---

## 已归档域报告

### 域:敌怪生成机制(spawning)——已审计

### 差异清单

| # | 机制项 | 原版设定(wiki页+数值) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | 生成率/上限基础值 | 1/600、5(NPC.cs:6108/6110;wiki L42/44) | `spawnRate=600; maxSpawns=5`(VanillaSpawner.ts:615-616) | ✅ | — |
| 2 | 深度修正(地狱/洞穴/地下/夜/血月/日食) | 地狱max×2;洞穴×0.4/×1.9;地下×0.5/×1.7;夜×0.6/×1.3;血月再×0.3/×1.8;日食×0.2/×1.9;月事件×0.2/×2(NPC.cs:393-491) | VanillaSpawner.ts:624-649 逐支1:1 | ✅ | wiki 自然表可由源码复算对上 |
| 3 | Zone 速率互斥链(地牢/沙尘暴/地下沙漠/丛林阶梯/恶地/陨石)+神庙/神圣深层独立if | ×0.3/×1.8;沙尘暴 hard?0.4:0.9;×0.2/×3;丛林0.4~0.85阶梯;×0.65/×1.3;×0.4/×1.1;神庙×0.8/×1.2;神圣深层×0.65/×1.3(NPC.cs:504-559) | VanillaSpawner.ts:662-715 | ✅ | 此前只移植地牢一支,现已全链 |
| 4 | 附近怪分层加速 | <20%×0.6…<80%×0.9;深层/恶地再×0.7/×0.9(NPC.cs:580-604) | VanillaSpawner.ts:716-725 | ✅ | — |
| 5 | 镇静/向日葵/战斗药水/水蜡烛/和平蜡烛 | ×1.65/0.6;×1.2/0.8;×0.5/2;×0.75/1.5(太空再×0.5);×1.3/0.7(NPC.cs:617-652;wiki L665-693) | VanillaSpawner.ts:726-750 | ✅ | 顺序同原版;水蜡+平蜡互斥同 else-if |
| 6 | clamp 与地牢未破守卫 | rate≥60、max≤15;ZoneDungeon&&!downedBoss3→rate=10(NPC.cs:655-662,696) | VanillaSpawner.ts:752-755 | ✅ | — |
| 7 | 隐身药水 ×1.2/×0.8 | NPC.cs:612-616 | 未实现(VanillaSpawner.ts:600 注释登记) | ⚠️ | 已登记 docs/spawn-parity-gaps.md |
| 8 | 渔夫套装 anglerSetSpawnReduction ×1.3/×0.7 | NPC.cs:624-628(wiki L681) | 未实现,且未登记台账 | ❌ | 唯一"有 wiki 数值但完全缺席且无登记"的速率项 |
| 9 | WoF 在场地狱压制 ×3/×0.3 | NPC.cs:554-557 | 未实现(台账待补) | ⚠️ | 依赖 wofNPCIndex |
| 10 | FTW(getGoodWorld)×0.8/×1.2 | NPC.cs:674-677 | 未实现 | ⚠️ | 种子系统缺席,影响小 |
| 11 | **生成参考分辨率 sWidth/sHeight** | **常量 1920/1200(NPC.cs:6695/6697);生成环=±84×±52格、safe=±62×±39格、深度带边界=rockLayer/worldSurface×16+1200** | 用实时视口:`sHeightPx=camera.viewH/zoom`(Game.ts:7710)、`rangeX=viewHalfW×1.4`(VanillaSpawner.ts:825-828) | ⚠️ | **系统性偏差**:默认 zoom1.25+窗口视口 → 生成环远小于 ±84×52,深度带边界随窗口浮动(偏移可达数百px)。1405 为 1920/1080;1456 收紧为只读常量且 sHeight 1080→**1200** |
| 12 | 狙击镜/望远镜扩展生成环 | GetSpawnArea(NPC.cs:849-868):scope 时 range+=sWidth×0.5/1.25~2 | 未实现 | ❌ | wiki L772 表 114/62~132/72 |
| 13 | 生成尝试时序 | 每帧 SpawnNPC 一次,逐玩家,成功即 break(Main.cs:17724,NPC.cs:186-200) | 每帧 trySpawnEnemy 一次(Game.ts:2761,7635) | ✅ | 单人语义等价 |
| 14 | 生成位置与视野门 | FindSpawnTile 50次重试、实心/房屋墙弃选、向下找面、safeArea 拒绝、HasTileSpawnSpace(NPC.cs:879-917) | VanillaSpawner.ts:822-868 | ✅ | CheckNotSpawningOnScreen 含联机远端玩家 |
| 15 | 天空选点带 | y<worldSurface×0.35 且非中央45-55%(肉前);hard 第二带 0.45+1/10(NPC.cs:886-897) | VanillaSpawner.ts:845-852 | 🔀 | 本仓加 openAir 判据替代带外判定(已登记"近似"),中央浮空岛可见差异 |
| 16 | ignoreSafeWalls | 塔区置 true 后房屋墙不再弃选(NPC.cs:316-318,888) | findSpawnTile 无条件查房屋墙(VanillaSpawner.ts:837) | 🔀 | 四塔事件期间房屋内不刷怪(原版会刷) |
| 17 | 生成上限 nearbyActiveNPCs | CheckActive(NPC.cs:78684-78717):NPC±4032×2520px 内玩家计 npcSlots;排除 25/30/33/releaseOwner/lifeMax;史莱姆雨×0.65;boss 计入(高slots) | Game.ts:7695-7700:全图求和、boss 直接免 | ⚠️ | ①boss 全免(原版 boss 高 npcSlots 占上限="boss 压制刷怪")②无距离门③无类型排除与史莱姆雨0.65 |
| 18 | 深度/中心锚点 | GetSpawnRate 用 player.position.Y(碰盒顶) | 统一用 p.cy/cx(中心)(Game.ts:7710-7711,VanillaSpawner.ts:2361) | ⚠️ | 边界偏移~1-2 格,阈值场景偶发错带 |
| 19 | 日食刷怪表 | 1.4.5.6 全表(NPC.cs:3459-3525) | VanillaSpawner.ts:1643-1661 | ✅ | 逐支概率/唯一门/flag14 全对 |
| 20 | 海洋水域(鲨鱼/渔夫/海鸥/海龟族) | NPC.cs:1705-1817 | VanillaSpawner.ts:1386-1445 | ✅ | Chum Caster 鲨鱼率依赖未实装(恒10,已注) |
| 21 | 入侵事件 | 规模 80+40n/海盗+40+20n/火星160+40n(Main.cs:63904-63913);invaders rate=20,max=5×(2+0.3n)(NPC.cs:691-695);前线推进 dayRate(下限1)/帧(Main.cs:63830-63847) | Invasion.ts:46-62(✅)、:105-109(**固定1格/帧**) | ⚠️ | Journey 时间加速时原版前线按 dayRate 倍速推进,本仓恒1 |
| 22 | 月事件波次/分数 | REQUIRED_POINTS 0,25,40,…2000,0(NPC.cs:6534-6538);专家×2/大师×2.5(NPC.cs:79230) | MoonEvent.ts:48-67、:170-175 | ✅ | 溢出分不结转语义同 |
| 23 | spawnFriendly 城镇阶梯 | NPC.cs:711-832 | VanillaSpawner.ts:756-806 | ✅ | — |
| 24 | 城镇NPC入驻条件 | NPC.SpawnAllowed_*(NPC.cs:7046-7170) | Game.ts:7806+ | ✅ | 抽核5项全对 |
| 25 | Journey 刷怪倍率 | 0×~10×(wiki L753;NPC.cs:679-687) | 仅有时间倍率T键,**无刷怪滑条** | ❌ | 全仓无 SpawnRateSlider |

📄 **wiki 与源码不符**:wiki L765/772 生成环"84 西/83 东/46 上/45 下、safe 34"按 sHeight=1080(1.4.4 以前)算出;1.4.5.6 已改为常量 1200(NPC.cs:6697)→ 正确值为 **52 上/52 下、safe 39**、拒斥矩形高 1278px。以 1456 为准。

**覆盖**:细分 25 条:✅15 / ⚠️7 / ❌3 / 🔀2 / 📄1。

**最需修复 TOP 5**:
1. 固定参考分辨率 1920/1200(#11)——系统性最大偏差且未登记台账
2. 生成上限语义(#17)——boss 计入+距离门+史莱姆雨系数
3. Journey 刷怪滑条(#25)+入侵 dayRate(#21)
4. anglerSetSpawnReduction(#8)——唯一无登记缺席项
5. ignoreSafeWalls(#16)+狙击镜扩展环(#12)+锚点校准(#18)

---

### 域:群系检测与住房/幸福度——已审计

### 差异清单

| # | 机制项 | 原版设定(wiki页+数值) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| A1 | 扫描窗口 | ZoneScanSize=169×124(SceneMetrics.cs:16) | `game/src/world/SceneMetrics.ts:152-154` | ✅ | ±84/−61+62 一致 |
| A1 | 群系计数阈值 | 腐300/猩300/圣125/丛140/雪1500/沙1500/菇100/陨75/牢250(Biomes.md:287-380) | `SceneMetrics.ts:43-52` | ✅ | 九项全对 |
| A1 | 圣/腐/猩互减+钳位 | AggregateTileCounts cs:648-664 双重钳位 | `SceneMetrics.ts:191-197` | ✅ | 互减前后各钳一次,顺序正确 |
| A1 | 向日葵减益 | 每株 evil/blood −10;墓碑计数 −1/2 株(cs:588,623) | `SceneMetrics.ts:192-193,208` | ✅ | — |
| A1 | 沙漠沙=沙−海洋沙 | isDesertBiomeSand∩oceanDepths(cs:376-380) | `SceneMetrics.ts:31,171,205` | ✅ | 已修普通沙三色族误纳珍珠沙 |
| A1 | 蘑菇地 | 泥块70+发光菇71+蘑菇草72+528 ≥100 | `SceneMetrics.ts:24,49,243` | ✅ | — |
| A2 | 天空高度线 | worldSurface×0.3499999940395355(cs:672) | `SceneMetrics.ts:227-228` 用 `0.35` | ⚠️ | 边界差 1 格;一行修复 |
| A2 | 地狱深度线 | UnderworldLayer=maxTilesY−200(Main.cs:2863) | `SceneMetrics.ts:146` | ✅ | 已修 lavaLine 误用 |
| A2 | 海洋 | oceanDepths:y≤oceanLevel 且 x<380‖x>w−380(WorldGen.cs:10978/4102) | `SceneMetrics.ts:72,221-222` | ✅ | 380 常量对 |
| A2 | 地牢 | 250砖+BelowSurface+wallDungeon{7-9,94-99}(cs:687) | `SceneMetrics.ts:60,217` | ✅ | — |
| A2 | 神庙/花岗岩/大理石/蜂巢/宝石洞 | wall87/184,180/183,178/108,86/48-53(cs:688-692) | `SceneMetrics.ts:247` 仅 temple | ❌ | Granite/Marble/Hive/GemCave 四 zone 缺失(刷怪/背景消费点空) |
| A2 | 雨/沙尘/微光计数 | ZoneRain=雨∧SurfaceAtmospherics;Shimmer=液计数≥300(cs:701-707) | `SceneFlags` 无此字段;spawner 直判 `weather.raining`(`VanillaSpawner.ts:1481`) | ⚠️ | 缺 SurfaceAtmospherics 深度门;Shimmer 液体计数未实现 |
| A3 | 群系音乐链 | Main.cs:12602-12855 全分支 | `game/src/data/Music.ts:150-215` | ✅ | 全分支带行号对上 |
| A3 | 墓地视觉分级 | GetLerpValue(16,36)+Lerp(0,0.75)(SceneState.cs:414-417) | `MonolithFilters.ts:379`、`SkyRenderer.ts:549` | ✅ | 16/28/36=wiki 5/7/9 墓碑 |
| B4 | 房屋尺寸/需求 | 60≤格数≤750、盒<100(WorldGen.cs:4210-14);门/桌/椅/灯(RoomNeeds cs:5616) | `game/src/world/Housing.ts:67-70,346` | ✅ | — |
| B4 | 家具类别判定 | TileID.Sets.RoomNeeds.CountsAs* 全表 | `Housing.ts:40-46` 用 key.includes 近似 | ⚠️ | 染料商浴缸、壁炉等边缘项可能漏判 |
| B4 | 邪恶区域规则 | base50,净值≥50扣分,≤−250整房禁(WorldGen.cs:5826-35) | `Housing.ts:199-205` | ✅ | 神圣只扣分可住、重腐化/猩红禁 |
| B4 | ScoreRoom 打分链 | 占用−1/箱−30/列−15/门−20/避让压1(cs:5821-5940) | `Housing.ts:158-255` | ✅ | 仅极邪房 score 返回 0 非负(消费端等效) |
| B5 | 入驻条件 | Main.cs:65249-65435 + NPC.cs:7046-7154 | `game/src/core/Game.ts:7806-7913` | ✅ | 抽核 18 NPC 全对 |
| B5 | 渔夫(369) | savedAngler(cs:65307) | 未实现 | ❌ | 无 angler 键 |
| B5 | 酒馆老板(550) | savedBartender(cs:65367) | 未实现 | ❌ | happy/sales 全链缺失 |
| B5 | 公主条件 | flag9 含 26 名含 angler/tavernkeep(cs:65423) | `Game.ts:7902-7908` 22 名 | ⚠️ | 条件偏宽提前解锁 |
| B5 | 染料商 | dye>0 或 1107-1120/3385-3388(cs:7096-7135) | `Game.ts:7879-7888` 只查 id 区间 | ⚠️ | 漏 `item.dye>0` 与染料槽 |
| B5 | 松露人 | hardMode(cs:65351)+发光蘑菇群系空房 | `Game.ts:7852-7854` 仅 hardMode | ⚠️ | 注释已自认全域找房 |
| B6 | 入驻轮/优先级 | 每7200 tick,一轮一名,num42 顺序(cs:65021-65593) | `Game.ts:2840,7953-7979` | ✅ | 顺序细节均对 |
| B6 | 流浪生成 | 白天且有锚点(:4992) | `Game.ts:7994-8007` | ✅ | — |
| B6 | 搬房/赶走 | 住房菜单分配/驱离 | 无 | ❌ | 交互层缺失 |
| C7 | 幸福度系统 | ShopHelper:爱0.88/喜0.94/厌1.06/恨1.12;同房>3每只×1.05;独居×0.95;无家/远离/邪群系=禁买;clamp[0.75,1.5] | 全仓无 happiness 实现 | ❌ | **最大缺口**。经济系统与原版差距最大 |
| C7 | NPC 关系表 | AllPersonalitiesModifier.cs:41-505 全 23 族 | 无 | ❌ | 含于上 |
| C7 | 群系偏好表 | PersonalityDatabasePopulator.cs:27-148 全 26 注册 | 无 | ❌ | 含于上 |
| C8 | 折扣卡 | PriceAdjustment 0.8(cs:34917) | `Game.ts:8659` | ✅ | — |
| C8 | 税收官 | 50铜/人/分钟,上限25金(cs:23854-23880) | `Game.ts:3083-3088` | ✅ | 十周年×2 分支缺(种子体系) |
| C8 | 骷髅商/旅行商价格 | 月相1.1-1.4+昼+0.1;距出生点距离(cs:64-97) | 无 | ❌ | — |
| C9 | 晶塔型/需求 | 11型;Victory 0 只其余 2 只(cs:314-323) | `TeleportPylons.ts:28-31,114-116` | ✅ | — |
| C9 | 晶塔群系门 | DoesPylonAcceptTeleportation(cs:254-312) | `TeleportPylons.ts:150-190` | ✅ | 十分支对照 |
| C9 | 地狱塔深度门 | Y ≥ Main.UnderworldLayer(=h−200) | `TeleportPylons.ts:183` `world.lavaLine‖h−200` | ⚠️ | **真 bug**:lavaLine≈(rockLayer+h)/2 提前约170格,`\|\|` 短路致岩浆层上部误通过 |
| C9 | 微光塔 | EnoughTilesForShimmer(微光液≥300) | `TeleportPylons.ts:186` 腔心距<125 近似 | ❓ | 已声明近似 |
| C9 | NPC 足量判定 | isLikeATownNPC ∧ !homeless ∧ 家在窗内 ∧ 现位距家<100(cs:224-247) | `TeleportPylons.ts:122-137` | ⚠️ | 缺 `!homeless` 过滤 |
| C9 | 交互距离/同型唯一 | reach 60(TileReachCheckSettings.cs:22-26);HasPylonOfType | `TeleportPylons.ts:84,107-111` | ✅ | ±60 对 |
| C9 | 事件期间禁用 | wiki Pylons.md:1.4.5.0 **已移除**禁塔 | `checkPylonTeleport` 无事件门 | ✅ | 与 1.4.5.6 终态一致(勿回加) |
| C9 | 神庙早入门禁 | !downedPlantBoss∧wall87∧surface下(cs:120-128) | `TeleportPylons.ts:140-144,226` | ✅ | — |
| C10 | 墓地阈值/灵雾 | 5墓碑初现/7完整/9封顶;灵雾=墓地专属合成站 | 阈值✅ `SceneMetrics.ts:52,245`;灵雾**无** | ❌ | 灵雾视觉/灵雾工艺站/墓地商人专属交易全缺 |
| C10 | 墓地鬼魂/刷怪 | Ghost316 墓地专属(NPC.cs:4082/4409) | `VanillaSpawner.ts:1976,2176` | ✅ | — |
| C10 | 墓地向日葵压制 | HasSunflower 依赖墓碑≤16(cs:628-631) | `SceneMetrics.ts:211-213` | ✅ | — |
| C10 | 墓地对话 | HasSpecialEventText(NPC.cs:96081) | `Game.ts:8083-8094` | ✅ | — |
| — | 📄 wiki 墓地扫描窗 | Graveyard.md 称 170×125 | 源码 169×124 | 📄 | wiki 偏 1,以源码为准 |
| — | 📄 幸福度价格上限 | wiki 旧说 1.38 | 源码 ShopHelper.cs:16 `HighestPossiblePriceMultiplier=1.5f` | 📄 | 1.38 为 1.4.0 旧值,1.4.4+ 终态 1.5 |

**覆盖**:细分 44 条:✅24 / ⚠️10 / ❌9 / 📄2 / ❓1。

**最需修复 TOP 6**:
1. **幸福度系统整链缺失**(约 640 行数据):系数 0.88/0.94/1.06/1.12、密度>3×1.05、独居×0.95、clamp[0.75,1.5]、23 族关系表+26 群系偏好表
2. **晶塔地狱塔 lavaLine bug**(`TeleportPylons.ts:183`):`||` 短路让 lavaLine 先命中,改为 `h-200` 一行修复(SceneMetrics.ts 已有同款先例)
3. **Ecto Mist 灵雾**三层全缺:墓地 mini-biome 只完成一半
4. **补 angler(369)与 tavernkeep(550)**:连锁导致 princess 解锁条件偏宽
5. **zoneSkyHeight 系数**:`0.35` → `0.3499999940395355`
6. **晶塔 NPC 计数补 homeless 过滤** + **dyer 染料判定补 `dye>0`**

**次级**:Housing 家具判定换 TileID.Sets 全表;ZoneGranite/Marble/Hive/GemCave 补入;骷髅商月相价与旅行商距离价;搬房交互。

---

### 域:玩家移动系统——已审计

### 差异清单

| # | 机制项 | 原版设定(wiki页+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | 基础移速上限 | 3 px/tick=15 mph(`Player.cs:2386`) | `PLAYER_WALK_MAX=2.6` `core/constants.ts:8` | ⚠️ | 全局低 13%,所有移速(含靴族)被连带拉低 |
| 2 | 重力 | defaultGravity **0.4**(`Player.cs:2376`) | `GRAVITY=0.36` `constants.ts:5` | ⚠️ | 低 10%,跳跃/下落全程偏"轻" |
| 3 | 最大下落速度 | maxFallSpeed **10**(+0.01,`Player.cs:2384/24165`) | `MAX_FALL_SPEED=9.5` `constants.ts:6` | ⚠️ | 9.5 vs 10.01 |
| 4 | 水平加速/减速模型 | runAcceleration 0.08、runSlowdown 0.2;两段:0→3 全速加速,3→6 慢爬坡仅×0.2 且需地面/有翼;无输入摩擦地面 0.2/空中 0.1 **加法**(`Player.cs:19559-19800`) | `PLAYER_WALK_ACCEL=0.32` 统一加速、摩擦 **乘法**(`constants.ts:7-10`;`Player.ts:1015-1037`) | 🔀 | 无两段结构;空中加速比原版强~20×;摩擦曲线高速段衰减过快 |
| 5 | 靴族 sprint 档 | accRunSpeed=6(Hermes)/6.75(Lightning/Frostspark/Terraspark);sprint **不随 moveSpeed 缩放** | 折进 `moveMult`(`Player.ts:404`)→Hermes 5.2、Lightning 6.06(原版 6/6.75) | ⚠️ | 档位偏低且把 sprint 当移速乘区 |
| 6 | 沙丘行者靴 | 四参数全 ×1.75(`Player.cs:26226-26232`) | `Player.ts:984-992` | ✅ | 1:1 |
| 7 | 冰面/冰刀 | slippy:acc×0.7、无冰刀 slowdown×0.1、有冰刀 acc×3.5+maxRun×1.25(`Player.cs:26234-26255`) | 无任何 slippy/iceSkate 处理(`vanillaAccFx.ts:99` 自注未实装) | ❌ | 冰面不滑、冰刀无加成 |
| 8 | 沥青块 | powerrun:maxRun×3.5、slowdown×2(`Player.cs:26220-26225`) | 仅方块定义(`data/tiles.ts:552`) | ❌ | 沥青不提速 |
| 9 | 基础跳跃 | jumpSpeed **5.01**/jumpHeight **15**,上升期 vy 钉在 -jumpSpeed 直到耗尽(`Player.cs:2378-2380/20384-20405`);跳高 6.27 格 | `PLAYER_JUMP_SPEED=6.6` + jumpHold 9 每帧 -0.22 衰减模型(`constants.ts:11-12`;`Player.ts:1124-1135`);实算≈5.8 格 | 🔀 | 数值与模型双偏(-7% 高度) |
| 10 | 气球 jumpBoost | UpdateJumpHeight:jumpHeight≥20 且 jumpSpeed≥6.51(`Player.cs:19312-19316`);+74.5% 跳高 | 仅作用于**多段跳**速度×1.25(`Player.ts:1143`) | ❌ | Shiny Red Balloon 族对普通跳无效 |
| 11 | 多段跳高度/顺序 | Cloud=15/Sail≈18/Blizzard≈22/Fart=30/Sandstorm=45;消费序 **Basilisk→WoFGoat→Santank→Unicorn→Sandstorm→Blizzard→Fart→Sail→Cloud**(`Player.cs:20436-20483,20522-20531`) | `JUMP_ORDER` **正好反序**(Cloud 起,`Player.ts:406`);速度乘子固定 jumpHold 9 →Sandstorm 实算≈7.7 格(原版 21.18) | 🔀 | 双跳优先序颠倒;Sandstorm 少一半高度 |
| 12 | Autojump | `releaseJump\|\|(autoJump&&(vy==0\|\|sliding))`(`Player.cs:20406`) | 已聚合(`Player.ts:342/490`)但**从未消费** | ❌ | 按住跳键不能连跳 |
| 13 | 掉落伤害公式 | 25 格免伤+extraFall,超格数×10 **线性**;Stoned 20×(d-2)(`Player.cs:25005-25091`) | FALL_SAFE=22 格、FALL_FATAL=45,三次方曲线取**当前 HP 百分比**(`Player.ts:25-28/1589-1598`) | ❌ | 公式完全不同:22 vs 25 格起伤、%HP vs 线性 10/格 |
| 14 | 翼=免摔伤 | 配饰槽任一 wingSlot>-1 → flag9 → 免摔伤(`Player.cs:25054-25061/25075`) | 落地结算只查马掌/noFallDmg(`Player.ts:1590`),**不查 eq.wing** | ❌ | 装翅膀飞行后落地仍摔伤 |
| 15 | 摔伤豁免/重置其余 | 落水/蜂蜜 reset(wet)、云族方块距离归零、手持雨伞、Moon Lord Legs | 落水豁免✅;云块❌、雨伞❌(无 slowfall)、Moon Lord Legs❌ | ⚠️ | extraFall 链(蛙腿族+10)✅ |
| 16 | 翼属性表 | WingStatsInitializer.cs:28-61 全量 | `data/vanillaWingStats.ts:32-48` | ✅ | 数值 1:1 |
| 17 | WingMovement 主体 | `Player.cs:21746-21960`(0.1/0.5/1.5 档、翼型覆盖、hover 半耗) | `Player.ts:1649-1692` | ✅ | 1:1 |
| 18 | 悬停翼清单 | flag19 硬编码 {22,28,30,32,29,33,35,37,45}(`:26472-26475`);垂直阻尼表+37 Betsy 额外×0.92(`:27084-27103`) | hover 仅 {22,30,31,37,45}(`vanillaWingStats.ts`);阻尼缺 33/35、无 37 的 0.92 | ⚠️ | Lazure/Solar/Stardust/Yoraiz0r/Skiphs 五翼不能悬停 |
| 19 | Soaring Insignia(4989) | empressBrooch:飞行中 wingTime 恒回满(**无限飞行**)+jumpSpeedBoost+1.8(`Player.cs:21962-21964/19317-19319`) | 物品已注册(`items.ts:432`)但无效果 | ❌ | 皇后徽章不生效 |
| 20 | 飞行/燃料回复规则 | (vy==0\|\|sliding)&&releaseJump→回满;**攀绳回复** wingTime/rocketTime/canCarpet(`:26167-26174,26456-26459`) | 仅 onGround 回复(`Player.ts:1156-1163`) | ⚠️ | 攀绳/贴墙滑/跳跃顶点 vy==0 均不回复 |
| 21 | 火箭靴 | `Player.cs:26548-26633`(7s fuel/delay 10/0.1 档) | `Player.ts:1199-1218` | ✅ | 1:1 |
| 22 | 飞毯/冲刺 | Carpet 300t;Dash 1=16.9/2=14.5、撞墙减半、eocDash(`:21128-21602`) | `Player.ts:1220-1230/1238-1312` | ✅ | 1:1 |
| 23 | 坐骑系统 | Mount.cs 全表+骑乘翼禁用+mount 摔伤系数 | **仅矿车(mount 6)实装**;其余坐骑无系统(`Player.ts:919` 自注引擎级缺口) | ❌ | 除矿车外全部缺失 |
| 24 | 矿车运动学 | runSpeed 13/dash 13/accel 0.04;SuperCart 20;加速轨±4(Mount.cs:897-901/371-379) | `MinecartTrack.ts:26-37`、`Minecart.ts:94-231` | ✅ | 1:1(含倾角/道岔/boost) |
| 25 | 抓钩 | GrappleMovement(`Player.cs:22338`)、aiStyle 7 | **完全未实装** | ❌ | 无钩爪弹幕 AI、无拉扯物理 |
| 26 | 水中物理 | wet→gravity **0.2**、maxFall **5**、jumpHeight 30/jumpSpeed 6.01 钉速游泳、水平×0.5(`Player.cs:24094-24156`) | gravity 0.108、vy 钳[-4.6,3.0]、游泳 -0.62/tick 帽 -4.4(`Player.ts:1082-1121`) | ⚠️ | 下沉/上浮速度全部偏低;加速模型不同 |
| 27 | wet 判定 | WetCollision **排除岩浆与微光**(`Collision.cs:1418-1425`) | 只排微光:`Player.ts:759-761` ——**岩浆(type 2)被当水** | 🔀 | 岩浆里可"游泳";注释写对了、代码漏 `!==2` |
| 28 | 蜂蜜 | honeyWet→gravity 0.1/maxFall 3/水平 **×0.25**(`:24130-24133`) | 水平×**0.5**(`Player.ts:990`) | ⚠️ | 水平减速档差一倍 |
| 29 | 人鱼/三叉戟/内胎 | merman→gravity 0.3/maxFall 7;Trident→0.25/6;Inner Tube→浮水(`:24136-24152,3710-3720,27538`) | merman 仅免溺水;trident ❌、inner tube ❌ | ❌ | 三件水中机动装备缺两件半 |
| 30 | 水上行走/岩浆行走 | WaterCollision 液面站立+Lava Waders 岩浆面(`:23270-23314`) | 近似水面站立;**无岩浆面行走** | ⚠️ | Terraspark/Lava Waders 落岩浆直接沉底掉血 |
| 31 | 羽落 Featherfall | gravity/3 且落速帽 maxFall/3(/10 按Up)(`:26701-26711,27048-27054`) | 仅 `grav=GRAVITY/3`(`Player.ts:1329`) | ⚠️ | 无落速帽、无 Up/Down 三档,羽落"飘不动" |
| 32 | 重力药水 | Up 边沿翻转+fallStart 重置+jump 清零(`:26372-26391`) | 翻转✅但不清 fallStartY/jump | ⚠️ | 次级 |
| 33 | 微光物理 | 浸液 gravity 0.15/jumpHeight 23/jumpSpeed 5.51(`:24119-24123`) | `Player.ts:1066-1079` | ✅ | 1:1 |
| 34 | 绳索攀爬 | vy 模型+能力回复 | vy 模型✅、免摔✅;回复❌ | ⚠️ | 见 #20 |
| 35 | 攀壁钉鞋 | 两档:spikedBoots≥2 角落悬停;<2 仅 vy>0.5 钳 0.5;按 Down 4f;滑壁跳 vx=3×-slideDir(WallslideMovement `:21473-21560`) | 单档 vy≤1.5 缓降、蹬墙跳 vx 取 vx 符号(`Player.ts:1313-1324`) | 🔀 | 无两档、无角落条件 |
| 36 | 平台穿透/头顶 | fallThrough=controlDown;撞头 jump=0(`:23265-23302`) | dropThrough✅(`Player.ts:1417`、`TileCollision.ts:182-184`) | ✅ | 主干对齐 |
| 37 | 蛛网/蜂蜜块粘滞 | StickyTiles 两层(`:22650-22760`+HorizontalMovement 层 `:26206-26219`) | 阻尼块 1:1✅;HorizontalMovement 层 sticky 修正缺失 | ⚠️ | 网内仍可每帧重新加速到全速 |
| 38 | 跳跃期间地表 buff | Sandstorm 跳:acc×1.5/maxRun×2 等(`:26257-26280`) | 无 | ❌ | 沙暴瓶起跳无横移爆发 |
| 39 | 移速 buff 聚合 | Swiftness/Burning/Chilled/Slow/Oozed… | `Buffs.ts:399-408` 覆盖大半;**Slow(buff 32 ×0.5)与 Oozed 未实装** | ⚠️ | 次级 |

📄 小瑕:Movement_speed.md:128 注释 "Lightning Boots (34 mph)" 与其表 33.75 不符,以源码 6.75 px/tick 为准。

**覆盖**:细分 39 条:✅14 / ⚠️15 / 🔀5 / ❌12。

**最需修复 TOP 8**:
1. **装翅膀仍受摔伤 + 摔伤公式全错**(`Player.ts:25-28/1583-1600` vs `Player.cs:25005-25091`):25+extraFall 格、线性 10/格,豁免判定加 `eq.wing !== null`
2. **wet 判定把岩浆当水**(`Player.ts:760-761` 漏 `!==2`):一行修复
3. **基础数值三连 + 跳跃模型**(`constants.ts:5-12`):GRAVITY 0.36→0.4、MAX_FALL 9.5→10.01、WALK_MAX 2.6→3;跳跃改 jumpHeight 15 钉速模型(jumpSpeed 5.01)
4. **水平移动两段模型缺失**(`Player.ts:1015-1037` vs `Player.cs:19483-19800`):双上限+慢爬坡+空中×0.2
5. **Soaring Insignia 无限飞行 + hover 翼清单**:empressBrooch+hover 槽位 28/29/32/33/35+Betsy 37×0.92
6. **多段跳**:消费序反+各段改 jumpHeight 倍数模型+jumpBoost 接入基础跳
7. **攀绳/贴墙不回充飞行**(`Player.ts:1049-1063`)
8. **autoJump 未消费 + 内胎/雨伞/三叉戟/Moon Lord Legs 未接**;抓钩与除矿车外坐骑为引擎级缺口(需立项)

---

### 域:修饰语与重铸——已审计

实现侧有完整数据层(`game/src/data/vanillaPrefixes.ts` + `vanilla-prefix.json`,提取自 1456 源码)+ 重铸 UI,但**词缀对战斗的实际生效面极窄(仅 damage/knockback),且实例在 UI 流转中会丢失**。数据层脚本逐 case 对账 0 处数值偏差;缺口集中在运行时。

### 差异清单

| # | 机制项 | 原版设定(wiki页+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | 前缀数值表 1-97 | Item.cs:691-1027 switch(Legendary 81=+15%伤/+10%速/+5%暴/+15%击退/+10%尺寸;Unreal 82 速度→弹速;Mythical 83 速度→-10%耗魔;Legendary2 84=+17/+17/+8;召唤族 85-97 带 arpen/tagdmg) | `data/vanilla-prefix.json`;`vanillaPrefixes.ts:33-36` | ✅ | 78 个武器 case+19 个配饰 tier,与源码 0 偏差 |
| 2 | 前缀池 8 组 | PrefixLegacy.cs(Swords 40/Spears 14/GunsBows 35/Magic 36/Summons 22 含 85-97/Boomerangs 14/TerrarianYoyo 15 含 84/Accessories 19) | `vanilla-prefix.json` pools;`vanillaPrefixes.ts:28,46-61` | ✅ | 8 池逐 id 全等;判定顺序同 GetRollablePrefixes |
| 3 | 物品类集合 | PrefixLegacy.ItemSets+ItemID.Sets.CanGetPrefixes(106 个排除) | `vanilla-prefix.json`;`vanillaPrefixes.ts:46-59` | ✅ | 计数与排除清单全等 |
| 4 | 慈悲表 ReducedNaturalChance | PrefixID.cs:9(18 个差词缀,自然掷中 2/3 作废)+1/4 无词缀(Item.cs:526,538) | `vanillaPrefixes.ts:27,67-76`(`rollPrefix(pool,false)` 分支) | ❌ | **死代码**:全仓零调用,自然掷路径未接 |
| 5 | Prefix(-1) 自然掷:敌怪掉落 | CommonCode.cs DropItemFromNPC `NewItem(...,-1)` | `drops/NpcDrops.ts` 无 prefix 字段 | ❌ | 掉落物永不带词缀 |
| 6 | Prefix(-1):宝箱战利品 | WorldGen.cs:36279-36368 约 11 处 `Prefix(-1)` | `world/gen/vanilla/BuriedChestsPass.ts` 无 prefix | ❌ | 生成宝箱物品全无词缀 |
| 7 | .wld 导入保留词缀 | 箱内物品第 4 字节=prefix | `wld/WldParser.ts:262` `r.u8(); // prefix` **读后丢弃** | ❌ | 导入原版 .wld 金标丢全部宝箱词缀(种子等价路线破坏项) |
| 8 | Prefix(-2) 重铸掷有效性 | Item.cs:523-556:TryGetPrefixStatMultipliersForItem 返回 false(四类舍入无效/无击退)→重掷 | `vanillaPrefixes.ts:67-76` 仅"0 重掷" | 🔀 | 无击退武器/低伤/低耗魔/低 useTime 武器池缩减规则缺失 |
| 9 | 顶层前缀检测 | Item.cs:557 num2==BestPrefixValue→BestReforge 音效+彩虹粒子+60t 冷却 | `core/Game.ts:10353-10365` 自注"最优档音效未接",恒播 tink | ❌ | 顶层判定/音效/粒子/冷却全缺 |
| 10 | 重铸费用 | Main.cs:41025-41031 `value×stack`(**value 含词缀 ×num2²**)×折扣0.8×PriceAdjustment÷3 | `core/Game.ts:10333-10342` 取基础值÷3×0.8 | ⚠️ | 缺词缀价值因子:原版 Legendary 重铸费 3 倍;幸福度 PriceAdjustment 缺 |
| 11 | 价值系数 num2² | Item.cs:596-597 `num2*=num2; value*=num2` | `vanillaPrefixes.ts:39-43` 返回**未平方**值,仅用于稀有度阈值 | ⚠️ | 物品 value 不吃平方(重铸费/售价全错) |
| 12 | ResetPrefix 重基线 | Main.cs:41348+Item.cs:49525 | `Game.ts:4431-4434` heldPrefixStat | ✅ | 语义对齐 |
| 13 | 词缀→战斗:dmg/kb | Item.cs:558-568 | `Game.ts:3843-3852,4130-4131,4453-4454,4531,4572` | ✅ | 全族接入 |
| 14 | 词缀→战斗:spd 攻速 | Item.cs:559-561 useAnimation/useTime ×spd 取整 | `Game.ts:3844+,4460+` 均无 spd | ❌ | Legendary 的+10% 速度完全无效 |
| 15 | 词缀→战斗:crt 暴击 | Item.cs:566 `crit+=crt` | `Game.ts:4479` critTotal 无 ps.crt | ❌ | Godly/Demonic/Legendary 暴击不生效 |
| 16 | 词缀→战斗:mcst 耗魔 | Item.cs:562 `mana×mcst` | `Game.ts:4316` 无词缀 | ❌ | Mythical/Masterful -10/-15% 耗魔不生效 |
| 17 | 词缀→战斗:size/shtspd | Item.cs:564-565 scale/shootSpeed | 全仓 `ps?.` 仅 dmg/kb | ❌ | 尺寸/弹速乘区未接 |
| 18 | 词缀→战斗:arpen(87/91/95) | Item.cs:10508-10509 | `Game.ts:4453` 只加配饰 armorPen | ❌ | Worthy+8/Eager+25 不生效 |
| 19 | 词缀→战斗:tagdmg(85-96) | Item.cs:10508 bonusTagDamage | `entities/WhipProj.ts` tag 走固定表 | ❌ | **召唤词缀池(85-97)核心价值 arpen+tagdmg 全部不生效** |
| 20 | 配饰词缀效益 62-80 | Player.cs:13531-13629 GrantPrefixBenefits | `entities/Player.ts:389-404` | ⚠️ | **69-72(Jagged→Menacing)漏 minionDamage**(源码四系全加) |
| 21 | 词缀实例随槽流转 | ItemSlot 整实例取放 | `ui/UI.ts:834,854,1222,1324` 重建 `{id,stack}` 丢 prefix | ❌ | **三处丢词缀**:重铸后关面板=白重铸;拿起再放下也清空 |
| 22 | 词缀名本地化 | Lang.prefix 每语言 | `ui/UI.ts:30-36` 查 `Prefix.{ConstName}`;l10n 包 0 个键 | ❌ | 回退英文常量名;43/75/76/84 显示内部名 "Deadly2"/"Legendary2" 等 |
| 23 | 词缀 tooltip 行 | Lang.prefix 逐行红绿 | `vanillaPrefixes.ts:79-96` 自算 | ⚠️ | **魔力行符号反**:mcst=0.85 → "+15%"(应为 -15% 绿色) |
| 24 | 稀有度档位偏移 | Item.cs:569-595 | `ui/UI.ts:1037-1043` | ✅ | 对齐(rare=-11 守卫缺失,影响可忽略) |
| 25 | tooltip 数值随词缀 | 显示改后 damage/mana/暴击 | `ui/UI.ts:39-41,1054` 仅 damage | ⚠️ | 耗魔/暴击行不更新 |
| 26 | 存档持久化 | 全槽位存 prefix | `save/serialize.ts:145-155,242-250,306-314` | ✅ | 全槽位保留(但被 #21 先吃掉) |
| 27 | 重铸规则 | 不排除当前词缀;弹药/材料不可铸 | `Game.ts:10343-10350` | ✅ | 一致 |
| 28 | 1456 vs 1405 差异 | 1405 旧式单体 Prefix(至 84) | — | ✅ | 1-84 共享 case 0 数值差;1456 增量=召唤词缀族+池化重构 |
| 29 | wiki 对照 | Modifiers.md 数值 | — | ✅ | Legendary value+209.85% 与源码 3.0985 一致;**未发现 wiki 过时项** |

❓ 待查:配饰判定缺原版 `!vanity` 门(Item.cs:1132-1139),时装配饰可能被误判可重铸。

**覆盖**:共 29 项:✅11 / ⚠️5 / ❌12 / 🔀1 / ❓1。数据层 100% 对齐;缺口全在运行时接线与 UI 实例流转。

**最需修复 TOP 8**:
1. **词缀实例三处丢失**(`ui/UI.ts:834,854,1222,1324`):重铸产物随手一拿就清零,最致命断链(`heldStack` 类型无 prefix 字段)
2. **词缀战斗生效面**(spd/crt/mcst/size/shtspd/arpen/tagdmg 全缺):召唤词缀池(85-97)基本是摆设
3. **Prefix(-1) 自然掷未接**:敌怪掉落、宝箱战利品永不带词缀
4. **WldParser.ts:262 丢弃导入词缀字节**:破坏 .wld 金标对账
5. **重铸费缺 num2² 因子**:原版好词缀重铸费可达 3 倍
6. **rollPrefix 缺有效性重掷过滤**
7. **词缀名本地化缺失+内部名外泄**;魔力行符号反
8. **配饰 69-72 漏 minionDamage**

---

### 域:时间/天气系统——已审计

wiki 数值与 1456 源码全部吻合,未发现 wiki 过时项。核心时间链与核心天气链与 1456 逐行对得上(「时间系统 1:1」属实);偏差集中在**天气细节、视觉映射与边角门**。

### 差异清单(50 项,仅列非 ✅ 项;✅33 项含:昼夜边界/全天时长/起始时间/月相推进/血月 roll/血泪召唤/月相消费者/雨启动概率与时长/雨强档/雨天怪池/雪原刷怪倍率/雨天钓鱼乘区/雨粒子/雨云块/暴风雨触发/雷击掷率/风随机游走/风速逼近/沙暴状态机全量/沙暴倍率/冰雪高仑/鹿角怪/睡觉加速/日晷月晷/床/dayRate 消费/金币雨/灯笼夜压制/弹幕风力物理原版死代码)

| # | 机制项 | 原版设定(wiki页+源码数值) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 4 | 太阳/月亮位置换算 | x=time/54000×(屏宽+2图宽)-图宽;y=bgTopY+\|t·2-1\|²×250+180;rotation(Main.cs:62294-62307) | render/SkyRenderer.ts:580-581,591-614 公式 1:1 | ⚠️ | **映射错标度**:昼用 `(t-0.25)/0.5`、夜 `(t-0.75)/0.5`,应为 `(t-0.1875)/0.625`/`(t-0.8125)/0.375`。太阳升落变 6:00-18:00(±1.5h);月亮夜弧被压缩 |
| 5 | 月亮贴图相位帧 | 取 `Main.moonPhase`(0=满;首夜即满月) | SkyRenderer.ts:611 `phase = clock.dayCount % 8` | ❌ | **bug**:首夜显示亏凸月;wld 导入后视觉与机制(血月/狼人/钓鱼/商店)脱钩。一行可修 |
| 17 | 雨↔史莱姆雨互斥 | UpdateTime `!slimeRain` 才开雨;StartSlimeRain `if (raining) return`(Main.cs:64353,64223) | Weather.ts:545-556/287,301-307 双向无门 | 🔀 | 两事件可同屏,原版严格互斥 |
| 25 | NewLightning 门 | `FlashyEffectsWorld && shimmerAlpha<=0`(Main.cs:58095) | Weather.ts:365-377 无此门 | 🔀 | 设置体系未建,低优先 |
| 26 | 雷声播放 | PlaySound(43, center±thunderDistance×15px) | Weather.ts:334 手写衰减 | 🔀 | 近似;可改走 sfxAt 体系 |
| 29 | 风日音乐窗 | time∈[10800,43200](7:30AM-4:30PM)且 \|windT\|≥0.4 | Weather.ts:566-577 + Game.ts:6799 | ⚠️ | **窗口偏移**:dayTimeTicks 错标度(见#4)使风日音乐窗缩到 8:24-15:36 |
| 30 | 沙暴推人 Mighty Wind | buff194 → windPushed 0.06×sign(wind)(Player.cs:25271,19505-19525) | entities/Player.ts 全文 0 处 wind | ❌ | **未实现**:沙暴期间不被风推 |
| 32 | Weather Radio | 持有时显示天气+风速 | 仅合成引用 | ❌ | 信息配饰显示层未实现 |
| 34 | 沙暴怪池 | 肉前(!downedBoss1)546/61/69;困难 541/510(段数,y+10格)/沙鲨族 542-545 按沙型(NPC.cs:3859-3895) | VanillaSpawner.ts:1788-1802 | ⚠️ | 缺 hard&&1/2→沙鲨 542-545 整支;肉前支缺 !downedBoss1 门;510 缺 y+10 下移 |
| 36 | 雪暴视觉 | snowing():雪区 Dust76 雪花,雨时 X 速度=√\|wind\|×…(Main.cs:12966-13060) | 仅 WeatherRenderer.ts:104 雨量×(1-snow²) | 🔀 | **无雪花粒子**,暴风雪观感缺失 |
| 39 | 陨石 | 入夜 1/50(downedBoss2)置 spawnMeteor,**当夜 time>16200(午夜)dropMeteor**(Main.cs:64703-64975) | Game.ts:8624-8625 恒 false | ❌ | **整链未移植**(已登记)。注意:是当夜午夜落,非"次日晨" |
| 40 | Journey 时间 | ModifyTimeRate 1-24×滑杆 + FreezeTime 开关 | Game.ts:1364-1370 T 键 6 档循环 | ⚠️ | **FreezeTime 无任何开关** |
| 45 | dayRate>1 天气演化 | `for(i<dayRate) UpdateWeather()`(Main.cs:17173-17176) | Weather.ts:232 每帧一次 | ⚠️ | 仅部分参数吃 dayRate;风游走/云量漂掷/闪电计时仍 1× |
| 46 | 冻结时间边角 | dayRate=0 压掉史莱姆雨/沙暴 roll(Main.cs:64373、Sandstorm.cs:57-63) | Weather.ts:287-295/622 | ⚠️ | 冻结时仍掷(潜伏,因 FreezeTime 无开关) |
| 47 | 史莱姆雨频率 | num3=450000/dayRate;**else if**(downedSlimeKing) 才 hardMode×1.5;未杀王 /2(Main.cs:64394-64400) | Weather.ts:290-292 并列 if | ⚠️ | **else-if 错位**:肉前+困难原版 /2,本仓 /2×1.5,偏稀 |
| 48 | 史莱姆雨事件互斥门 | BusyWithAnyInvasionOfSorts 含 bloodMoon∪eclipse∪snowMoon∪pumpkinMoon∪invasion∪DD2∪冷却窗口(NPC.cs:7001-7008) | Game.ts:6817 仅查血月+invasion | ⚠️ | 缺四门 |

**覆盖**:核 50 项:✅33 / ⚠️9(含上表) / 🔀4 / ❌5。

**最需修复 TOP 7**:
1. **月亮相位贴图 `dayCount%8` → `clock.moonPhase`**(SkyRenderer.ts:611)——一行修复
2. **昼夜映射统一到 DAWN/DUSK 标度**——同时歪了太阳升落、月亮夜弧、风日音乐窗、日食压暗四处,本域最大系统性标度 bug
3. **雨↔史莱姆雨双向互斥门**
4. **陨石坠落链未移植**(zoneMeteor 刷怪侧已就绪,只差触发链)
5. **Mighty Wind 沙暴推人**(buff194)
6. **史莱姆雨 else-if 错位+互斥门缺口**
7. **Journey 冻结时间开关+雪花粒子**

顺手项:VanillaSpawner.ts:1980/2001 满月/新月注释互换(代码对);沙暴怪池补沙鲨族+!downedBoss1 门。

---

### 域:群系检测与住房/幸福度——第二轮深化审计(增量,修正第一轮结论)

> 第二轮独立复审(132 次工具调用)发现第一轮若干 ✅ 需降级,以及重大新缺口。以下为增量,与第一轮冲突处以第二轮为准。

| # | 机制项 | 原版设定(wiki页+数值) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 增1 | 检测窗垂直对齐 | 原版 `cy-62..cy+61`(SceneMetrics.cs:356 CenteredRectangle) | SceneMetrics.ts:152-156 `cy-61..+62` | ⚠️ | (修正第一轮 ✅)垂直窗整体下移 1 格,计数系统性偏 1 行 |
| 增2 | 房屋邪恶度向日葵 | num3 = 腐+猩−圣−**5×向日葵格**(WorldGen.cs:5774-5794;向日葵每株−40) | Housing.ts:199 `evilNet=-(hallow-(corrupt+crimson+5*sunflower))` | ❌ | **(修正第一轮 ✅)向日葵符号反**:本仓 +40/株,种向日葵反而把好房推向"corrupted"。一行修复 |
| 增3 | RoomNeeds 家族表 | 桌{14,18,87,88,90,101,354,355,464,469,487,699};椅{15,79,89,102,487,497};光源 26 项硬表;门{10,11,**19平台**,386-389,435-439}(TileID.cs:96-130) | Housing.ts:40-46 键名启发式 | ❌ | **宝箱(sheet21)被误计为椅**;桌缺 bookcase/piano/dresser/bathtub;椅缺 bed/bench/toilet;平台/高门不算门→平台房永不成立;向日葵(light 字段)被当灯 |
| 增4 | 城镇NPC计数半径 | ±1920×**±1200px**(SceneMetrics.cs:18,755-757) | Game.ts:2140-2144 ±1920×**±1080** | ⚠️ | 纵向少 120px,城镇曲边缘略提前失效 |
| 增5 | 沙尘暴 BGM | ZoneSandstorm→曲40(排城镇后、地狱前,Main.cs:12610) | Music.ts:126 自认"分支省略" | ❌ | 沙漠沙尘暴放不出 40 号曲(天气系统本体已有 sandstorm) |
| 增6 | 地狱 BGM 深度门 | `Center.Y > UnderworldLayer×16`(=h-200) | Game.ts:2205 传 `lavaLine‖h-200`,lavaLine 恒非零≈h/2 | ❌ | **lavaLine 残留**:地狱曲提前约 150 格(SceneMetrics 已修同款,此处漏网) |
| 增7 | **晶塔获取链(商店)** | 任意城镇 NPC(除军火/树妖)在「玩家处有2安家NPC∧非腐/猩」按所在群系进货对应塔(Chest.cs:3451-3530) | vanilla-shopstock.json 无任何晶塔 id;items.ts:904 仅单一 placeStyle 缺省 0 | ❌ | **晶塔在正常流程中不可获得**;10 种变体无区分 |
| 增8 | 晶塔群系接受表 | DoesPylonAcceptTeleportation 按 **EnoughTilesFor*** 计数阈值判;Underworld=≥h-200;Shimmer=微光液≥300 | TeleportPylons.ts:150-190 用 zoneJungle 等 Zone 替代;lavaLine 残留 | ⚠️ | 地狱门提前~150 格(#增6 同根);地狱深处 140 丛林格原版拒纯净塔、本仓放行 |
| 增9 | 墙判定 | 每格(含家具格)查「±2 窗口内 house 墙或实心」(WorldGen.cs:6150-6185) | Housing.ts:310 仅对空气格查墙 | 🔀 | 家具悬空无墙处原版判漏墙、本仓放行 |
| 增10 | 泛洪边界 | 实心/开门锚帧/**高门389恒挡/386开态帧挡**(WorldGen.cs:6118-6125) | Housing.ts:327 实心/平台/门三类 | ⚠️ | 高门(386/388/389)未作边界,泛洪穿高门外溢(串房) |
| 增11 | 房屋失效驱赶 | 每 7200 tick 对**所有已安家** NPC 跑 QuickFindHome,失效→homeless(WorldGen.cs:5665-5740) | Game.ts:8033-8041 仅给无家者找房 | 🔀 | 房屋被拆/腐化后 NPC 永不搬出也永不流浪 |
| 增12 | bound 救援 NPC | 哥布林=**打完哥布林入侵后**洞穴 1/20;机械师=地牢;造型师=蜘蛛巢;高尔夫=地下沙漠;税务官=地狱(净化粉);巫师=洞穴(困难) | Game.ts:1771-1831 世界生成期直接放置 | 🔀 | 哥布林无入侵门(开局即可救)、税务官可右键直救 |
| 增13 | santa 入驻门 | downedFrost∧xMas(Main.cs:65251+) | Game.ts:8003 无 downedFrost 门 | ⚠️ | — |
| 增14 | 城镇宠物/城镇史莱姆 | 宠物{637,638,656,670,678-684}族(TownRoomManager.cs:153) | 无 | ❌ | 整族缺(含公主 24 人名单中的 Angler/Bartender) |
| 增15 | unlockedXSpawn 持久化 | 商人死亡+钱花光后原版仍可回归 | 无 | ⚠️ | 入驻条件重掷每次都查当前钱 |
| 增16 | 光环扫描窗 | SceneMetrics 全窗 ±84×±62 逐格 | Game.ts:2749-2757(±48×±36)步长3采样 | ⚠️ | (与再生域 #6 交叉验证)半径~57%,1×1 灯仅~1/9 对齐命中,光环闪断 |
| 增17 | 篝火帧门 | `frameY<36`(SceneMetrics.cs:380) | Game.ts:2715 `frameX<18` | ⚠️ | 轴向疑似错 |

**第二轮最需修复增量**:①向日葵符号反(一行);②RoomNeeds 四张硬表替换键名启发式(宝箱当椅/平台房永不成立,玩家最先撞上);③晶塔获取链(正常流程不可获得);④lavaLine 残留×2(Game.ts:2205、TeleportPylons.ts:183);⑤房屋失效驱赶;⑥happiness 整链(两轮一致确认)。

📄 第二轮 wiki 勘误:House.md 邪恶扫描窗 45/42/45 为 1.4.4.9 旧值,1.4.5.6 源码是 **46/44/44**(本仓按源码实现 ✅);「树妖=杀boss或暗影珠」1456 无暗影珠条件;酒馆老板走 savedBartender(OOA 后)。

---

### 域:幸运与杂项全局机制——已审计

**总评**:幸运**来源侧**(五源聚合公式、火炬系数表、瓢虫、地精、掷骰五函数)真 1:1;**消费侧**只有约一半接线(掉落/钓鱼/旅商/掉钱),伤害链 DamageVar、刷怪侧 RollLuck 族、金小动物等大面缺口;护士费用公式完全分叉、渔夫每日任务链断开、火把神触发窗 Y 减半是三个最实的 bug。

### 差异清单

**A. 来源侧(16 项:✅8/⚠️6/❌1/🔀1,公式层无一处数值错误)**

| # | 机制项 | 原版设定 | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| A1 | 聚合公式 | 瓢虫×0.2+火炬×0.2+药水档+风筝档+珍珠0.03+灯笼夜0.3+地精0.2−臭屁0.25+装备+钱币−碎镜0.25,**不钳制** | Player.ts:1805-1818 | ✅ | 逐项同系数 |
| A2 | 火炬系数表 | 12 条件(good+1/bad+1/骨+0.5/咒火灵液专属/珊瑚炬/普通火把雪原bad+2 等) | Luck.ts:271-304 | ✅ | 逐条对上(含 liquidType+1 编码处理) |
| A3 | 火炬扫描窗 | 81×81 每tick一行81t一轮 | Luck.ts:211-269+Game.ts:2108-2134 | ✅ | 原版逐行/本仓15t整窗,净效果等价 |
| A4 | 幸运药水三档 | buff257 剩余>36000t=+0.3/>18000t=+0.2/其余+0.1 | Player.ts:1819-1824 逻辑✅;物品 4477-4479 未入物品表 | ⚠️ | **buff 257 无授予路径,恒 0** |
| A5 | 花园侏儒 | tile567 计数>0,+0.2 | Luck.ts:212-237 | ✅ | (Y±61 vs 原版 124 矮 1 格,可忽略) |
| A6 | 瓢虫 | 触碰 800px (1−d/800)^6×43200/击杀 400px −10800/金×2/rainBoost+1800 | Luck.ts:83-177+Enemy.ts:3488,4221 | ✅ | 公式全对;缺 releaseOwner!=255 门(放生瓢虫不应给运) |
| A7 | NPCLuck | 向导死亡→+14400;其余城镇NPC(除裁缝/老人/骷髅商)→−3600 | 无(全仓零命中) | ❌ | 整条缺失 |
| A8 | 风筝 buff 383 | clamp(buffTime/10800,0,3) 三档 | Buffs.ts:454-458 ✅;风筝物品未移植 | ⚠️ | 档位对但不可达 |
| A9 | 恶臭 buff 120 | −0.25 | Player.ts:1813 读位在;授予源未移植 | ⚠️ | 死代码位 |
| A10 | 银河珍珠 5340 | 一次性 +0.03 | Game.ts:4044-4048 | ✅ | 含"已用过不消耗"门 |
| A12 | 钱币幸运 | >249000→+0.2 七档至 0.025;×0.9999^dayRate;cap 1e6 | Luck.ts:88,123-159 公式全对 | ⚠️ | 微光未移植→addCoinLuck 恒 0 |
| A13 | 装备幸运 | 四叶草+0.03/马掌族**9件**+0.05/幸运币族+0.05 | Player.ts:1830-1838 | ⚠️ | 马掌族只认 158,缺其余 8 件气球马掌组合;四叶草三件未入表 |
| A15 | 萤火虫罐/松露虫/灯塔/生日蛋糕 | **原版均非幸运来源**(源码零命中) | — | 🔀 | 任务清单误记;派对蛋糕只是装饰 |
| A16 | 幸运 UI/钳制 | 聚合不钳;NormalizedLuck 钳[-1,1] 唯一消费=巫师对话 | 钳制语义✅;巫师幸运对话缺 | ⚠️ | 无数值 UI 是原版事实 |

**B. 消费侧(14 项:✅6/❌6/🔀1/⚠️1)**

| # | 消费点 | 状态 | 差异细节 |
|---|---|---|---|
| B1/B2 | 掉落规则族掷骰/NotScalingWithLuck | ✅ | 与 Luck.cs 逐分布等价;42 条 noLuck 生效 |
| B3 | ScalingWithOnlyBadLuck(货郎背包4271,怪53/536) | 🔀 | 提取器误映射成全量 rollLuck;正运玩家货郎背包掉率虚增;Luck.ts 现成函数零引用 |
| B4 | OneFromRulesRule 不吃 luck | ⚠️ | NpcDrops.ts:465 用 rollLuck(现无害,潜在过度应用) |
| B6 | **玩家受击浮动 DamageVar(−luck)** | ❌ | Main.cs:65597-65632 ±15%+\|luck\|概率第二掷取劣;Enemy.ts:765 传原值(**连±15%都没有**);地刺/敌弹同缺 |
| B7 | 玩家输出浮动 DamageVar(+luck) | ❌ | 近战有±15%无 luck;弹幕伤害出生即定;第二掷全缺 |
| B8 | 钓鱼 | ✅ | Bobber.ts:212-216 与源码一致 |
| B9 | 旅商稀有货 | ✅ | 缺货郎背包+1/十周年+1(已登记) |
| B10 | 金色小动物 | ❌ | NPC.cs 1/400+约25处 RollLuck(400);本仓直掷 1/n;spawn 无 luck 通道 |
| B11 | 刷怪选择侧 RollLuck 族(66 处) | ❌ | 整族未接;Groom/Bride RollOnlyBadLuck(300) 已登记未接 |
| B12 | 心/星掉落 | ❌ | NpcDrops.ts:584-594 直掷(luck 在 ctx 没用);一行可修 |
| B13 | NPC 掉钱双掷 | ✅ | 取极值分支正确 |
| B14 | 其余(金币雨/瓦罐/坠星/摇树/地牢魂/Boss多心/矿车/PvP) | ❌ | 合并计 |

**C. 火把神**:
- C1 触发条件 ⚠️:①触发扫描 Y 只±20(81×41),wiki 说 41×41、源码 **81×81**,两侧都不符;②缺 !unlockedBiomeTorches 门;③101根/任意类型/地下/背包无5043 ✅
- C2-C4 事件过程/奖励/冷却 ✅(缺 attacks≥200→funTimer=−180 另一支,仅时序差)
- C5 恩惠使用→群系火把 ❌:unlockedBiomeTorches/UsingBiomeTorches 整链缺失(含自动转化+成就)

**D. NPC 行为杂项**:
- D1 **护士治疗费用** ❌:原版=缺失HP(1HP=1铜)+每可移除减益+100→七档进度链取最高(克眼3/世吞10/骷髅王蜂后25/困难60/机械100/世花150/石巨人200)→专家×2→折扣×0.8→×幸福度,治疗后清全部减益;本仓 `max(3,(maxHp−hp)*0.75)` 写死,满血拒绝对话(原版 0 费可对话)。**与血月无关**
- D2 税收官 ✅:速率/50铜/上限**25金**全对(领取未÷幸福度、缺十周年×2)
- D3 地牢守卫 ⚠️:id 68 三项 9999 静态;数据层 1000 靠 AI 补丁,缺自旋视觉
- D4 老人召骷髅王 ⚠️:多加 !hardMode 门(原版无,困难后回头召合法);落点应为老人原位
- D5 城镇NPC夜归 🔀:原版雨/日食/史莱姆雨/雷暴/夜晚**离屏瞬移回家**(NPC.cs:53828-53854);本仓只有夜晚走回

**E. 换日轮换+节日**:
- E1-E5 万圣 10.10-11.1/圣诞 12.15-31/本机真实日期/月事件强制节日/节日掉落 ✅
- E6 节日刷怪换装 ❌(僵尸换装/南瓜精/礼物史莱姆)
- E7 情人节 🔀:**桌面版 1.4.4.9+ 不存在**(wiki 全 Legacy,勿移植)
- E8 旅商到访 ✅:每tick掷 P=dayRate/108000(整日≈22.12%,**非每日1/4**),货池到访瞬间重掷——本仓才是对的
- E10 骷髅商库存 ⚠️:**月相驱动**非每日随机;奇相位 hardMode 应 28**和**188 两件;缺时段火把件
- E11/E12 **渔夫任务链** ❌:换日 AnglerQuestSwap 无调用、anglerQuestFinished 无任何 true 写入、无交付交互(任务鱼能钓出但无法交付)
- E13 换日杂项 ✅;E14 摇树重置 ❓(摇树整特性缺席)

**覆盖**:共 54 项:✅25/⚠️12/❌12/🔀4/❓1。

**任务前提勘误(源码裁决)**:①火把神计数窗 wiki 41×41 vs 源码 81×81;②错群系火把惩罚是−0.2(−0.3 仅普通火把在雪原);③税收上限 25 金非 50 金;④护士费用与血月无关;⑤老人夜晚转化;地牢守卫 id=68 非 194;⑥情人节桌面不存在;⑦旅商/骷髅商口径(见上);⑧萤火虫罐等四项非幸运来源;⑨幸运聚合不钳制。

**最需修复 TOP 7**:①伤害链 DamageVar 全缺(B6/B7,NPC接触连±15%基础浮动都没有);②消费点接线收尾(刷怪侧 RollLuck 族+金小动物+心星一行改+onlyBad 通道);③火把神三连(触发窗 Y±20→±40+恩惠链);④护士费用公式重写;⑤渔夫每日任务链;⑥NPCLuck+幸运药水可达性;⑦城镇NPC传送回家。

---

### 域:Buff/Debuff 全表——已审计

**源码裁决线**:玩家 DoT=Player.cs:18779-18916;敌怪 DoT=NPC.cs:92585-92710;聚合=Player.cs:9556+。换算 lifeRegen N = N/2 HP/s。

#### A. Debuff(32 项)

| # | Buff | 原版 | 本仓库 | 状态 |
|---|---|---|---|---|
| A1/A2 | Poisoned(20)/Venom(70) 玩家 | 2/15 HP/s | 敌怪侧 6/30 ✅;**玩家侧无 BuffType** | ⚠️半边 |
| A3 | On Fire(24) | 4 HP/s,入水熄灭 | ✅ 4 HP/s+岩浆 7s+入水熄 | ✅ |
| A4 | Cursed Inferno(39) 玩家 | 12 HP/s;敌怪 24+击退+10% | 敌怪 ✅;玩家无;击退+10% 未接 | ⚠️半边 |
| A5 | Ichor(69) 玩家 | 防−15 | 无 | ❌ |
| A6 | Ichor 敌怪 | +15 后与防取 min 再 /2 | 定值 7(Enemy.ts:4191) | ⚠️ | 
| A7 | Frostburn(44) | 玩家敌怪均 8 HP/s | 无 | ❌ |
| A8 | Bleeding(30) 玩家 | 停自然再生 | ✅(尖刺族授予) | ✅ |
| A9 | Bleeding(30) 敌怪 | 12 HP/s(1.4.5.0 起) | 无 | ❌ |
| A10 | Darkness(22) | **1456 全仓无消费者,纯图标** | 无 | ✅(≈)📄 wiki 仍写"降低亮度" |
| A11 | Silenced(35) | 禁一切 mana>0 物品 | 无 | ❌ |
| A12 | Slow(32) | moveSpeed/=2 | 无 | ❌ |
| A13 | Weak(33) | 数值对但**来源错** | 挂在 NPC 155 身上,而 **155=Wolf 不掉 debuff** | ⚠️来源错 |
| A14 | Confused(31) 玩家 | 反向操作 | 无 | ❌ |
| A15 | Confused(31) 敌怪 | direction*=−1 | ✅ seekDirX 反转 | ✅ |
| A16 | Broken Armor(36) | 玩家防/2;敌怪+20 穿甲 | 无 | ❌ |
| A17 | Suffocation(68) | 20 HP/s | ✅ −20+埋沙刷新 | ✅ |
| A18/A19 | Chilled(46)/Frozen(47) | ×0.75/定身 | ✅ ✅ | ✅ |
| A20 | Stunned | Desktop 无玩家版 | 无 | ✅ |
| A21 | Electrified(144) | 静止 4/移动共 20 HP/s | 无 | ❌ |
| A22 | Moon Leech(145) | 840t=14s,**专家 960t=16s** | ✅ 14s 无专家分支 | ⚠️ |
| A23 | Betsys Curse(203) | 敌怪+40 穿甲 | projStatus 命中即丢 | ❌ |
| A24 | Oozed(197) | moveSpeed/=3 | 无("Ogre Sped"不存在) | ❌ |
| A25 | Lovestruck(119) | 视觉+幸福+10% | 无 | ❌ |
| A26 | Stinky(120) | luck−0.25 | 消费✅无授予源 | ⚠️ |
| A27 | Burning(67) | 30 HP/s+移速×0.5 | ✅ | ✅ |
| A28 | **Mana Sickness(94)** | 每瓶+5s 至 600t(**峰值 50%**),`magic×(1−0.25×剩余/300)` 无上限 | `min(0.25,…)` **硬顶 25%**+max 合并不可叠加(Buffs.ts:512-516/276) | ⚠️ | **峰值差一倍** |
| A29 | Obstructed(163) | 遮屏+bleed | ✅ 遮屏+停再生 | ✅ |
| A30 | **StatusFromNPC 全表**(Player.cs:22058-22337) | 接触命中掷骰施加(史莱姆毒/吸血鬼流血/525-527/狼人**Bleeding 1/5 45s**/木乃伊沉默) | **完全未移植**;唯一敌接触 debuff=Game.ts:9026 | ❌ |
| A31 | Wolf(155) 接触 | 155=Wolf,**无 debuff**;狼人=104 才是 Bleeding | `vanillaId===155 → Weak 30s` 无条件 | ❌移植错(三重错) |
| A32 | Stoned/Webbed/Shadowflame/Oiled/Daybreak/Hemorrhage/SoulDrain | 全表有定义 | 字段全无;**projStatus 数据在表、命中即丢** | ❌ |

#### B. Buff(30 项,非 ✅ 摘录)

| # | Buff | 差异 |
|---|---|---|
| B8 | Well Fed 三档 | 前六项全对;**随从击退档未接** ⚠️ |
| B9 | Clairvoyance(29) | 仅 +20 魔力;魔伤+5%/魔暴+2%/耗魔−2% 三项未接 ⚠️ |
| B12 | Summoning/Bewitched/WarTable | ✅ 全接(Buffs.ts:48 注释过时) |
| B13 | Sharpened(159) | ✅ +12 已接(与敌怪 ichor 近似不联动) |
| B14 | Ammo Box(93) | **图标有、效果无**(hasAmmoBox 零消费者);药水版生效 ❌ |
| B16 | Warmth(124) | 冰伤×0.7,无 BuffType ❌ |
| B19 | Invisibility(10) | 刷怪×1.2/×0.8+索敌,整链缺 ❌ |
| B20 | Hunter(17) | 登记✅零消费(detectCreature 未移植)❌ |
| B26 | Inferno(116) | **字段错**:光环写进 cursedT(Cursed Inferno 24 HP/s)应 OnFire3(**15 HP/s**)⚠️ |
| B27 | Fishing/Sonar/Crate | 渔力✅/Crate✅(10→25,注释"+10%"错)/**Sonar 零消费**⚠️ |
| B29 | PotionSickness(21) | 建模为本地"耐药性":**+80 maxHp** 60s+禁药,非原版语义(原版只禁治疗)🔀 |
| B30 | Kite(383) | 数值全对,风筝物品未移植→死数据 ⚠️ |

#### C. 环境光环(12 项)
- Campfire 0.5 HP/s ✅(wiki"+10%再生"源码未见 📄);Heart Lantern 1 HP/s ✅(无原版图标 89);Star in Bottle **公式级 1:1** ✅(比抄 wiki 观感值更对);Sunflower ×1.21 ✅;双烛(水蜡+平蜡同区豁免)未做 ⚠️小缺;Bast Statue +5 ✅;Garden Gnome +0.2 ✅;Slice of Cake **挖速未接** ⚠️;TorchGodPotion(376) ❌1456新;ShadowCandle(350) ❌1456新;Banner/Cat ❓

#### D. 机制性规则(7 项)
- D1 AddBuff max 合并 ✅;**AdditiveToCap={94→600,383→43200} 例外未接** ⚠️
- D2 **专家/大师 debuff 时长×2/×2.5 缩放(DoT 伤害不缩)完全缺失** ❌(BuffID.cs:28+GameDifficultyData.cs:71)
- D3 蜂蜜机制 ✅(四点全对,含 R<0 对冲钳回)
- D4 **玩家 buffImmune 链完全不存在**(配饰 885-893/安卡符/套装熔岩霜/湿身免疫;免疫即清存量)❌;Ankh 族 items.ts 无 1613 不可获得
- D5 **NPC buffImmune 零检查**(不死族可中毒、火系怪可点燃;fireImmune 字段声明后从不读)❌
- D6 buffNoSave 存档过滤 ✅
- D7 **弹幕→玩家 StatusPlayer 全表缺**(projTargets 仅冰系两型;Dart.ts 命中玩家从不走 statusPlayer)❌

#### E. 1456 新增(5 项):TorchGodPotion(376)❌/ShadowCandle(350)❌/DeadCellsPotionStation(366,buff×1.2)❌/Hemorrhage(375)❌/Kite 数值对无来源⚠️

📄 **wiki 勘误 8 条**:狼人流血 1/8→源码 **1/5 20%**;Calming 索引−17%过时(应−39%);Star in Bottle 页/索引两说(以公式为准);Campfire"+10%"源码未见;Darkness 纯图标;Betsys Curse 时长自相矛盾;Silenced 召唤豁免存疑;"Ogre Sped"应 Oozed。

**覆盖**:共 88 项:✅41/⚠️17/❌27/🔀1/📄8/❓2。已实装子集数值几乎全对,但覆盖面远未到全表(玩家侧 debuff 名册约缺 15 种、免疫链双侧全缺、难度时长缩放缺)。

**最需修复 TOP 8**:①玩家 debuff 名册+来源链(StatusFromNPC+StatusPlayer+修 A31);②难度时长缩放(DebuffTimeMultiplier);③buffImmune 双侧;④Mana Sickness 双修(峰值 25%→50%);⑤Inferno 字段错(cursedT→OnFire3);⑥ichor 穿甲近似收口;⑦死代码收尾(AmmoBox/Hunter/Sonar/Clairvoyance/蛋糕挖速+清三条过时注释);⑧projStatus 缺字段批(数据已在表,成本最低)。

---

### 域:生命/魔力再生 + 防御/伤害公式——已审计

> wiki 与 1.4.5.6 源码零冲突(📄 0)。审计期间并行会话在编辑同批文件,行号以内容定位为准。

### 差异清单(35 项)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | **自然再生主公式** | eRT 按 RT 300→3600t 分 9 档,R=eRT×(mHP/400×0.85+0.15),静止×1.25/移动×0.5,expert 未进食×0.5;100HP 满档≈2HP/s、400HP≈5.5HP/s | Player.ts:699-708 恒 1HP/s 仅首档阈值 | ❌简化 | 缺 9 档爬坡/mHP 缩放/移动系数/专家惩罚;满配回血只有原版 **1/3~1/5** |
| 2 | DoT 分块结算 | burned/suffocating 走 −600 阈值弹 5,其余 −120 弹 1-4 | Buffs.ts:251-254 | ✅ | — |
| 3 | 蜂蜜三效 | R<0 对冲+常规+RT 加速 | ✅ 全接 | ✅ | — |
| 4 | DoT 池清零语义 | 每个 DoT 块前清 lifeRegen | ✅ 顺序一致 | ✅ | — |
| 5 | 篝火/心灯/瓶中星数值 | R+1(篝火另 base×1.1)/R+2/+10,+0.5 | HP/s 值全对;**缺篝火 base×1.1** | ⚠️ | — |
| 6 | 光环扫描范围 | ±84×±61 逐格 | Game.ts:2749-2757 ±48×±36 **步长3采样** | ⚠️ | 半径~57%;1×1 灯仅~1/9 对齐命中,光环闪断 |
| 7 | 再生手环/药水/狼人/天界石/星云 | R+2/R+4/R+1/+2/+6·级 | ✅ 全对 | ✅ | — |
| 8 | 其余 lifeRegen 正项 | 树妖祝福+6/日耀甲三件+2/英灵殿胸甲+8/侍从巨盔+4/Hearty+6/Rapid+4/活力水晶/猩红套×1.5/就座×1.3/闪亮石 | ArmorSetBonus 无 life 字段 | ❌ | 硬膜回复装整体缺失 |
| 9 | **玩家侧 DoT debuff 族** | Poisoned−4/Venom−30/诅咒狱火−24/狱火−8/霜燃−16/冰咬−16/感电−8(−40)/舌锁−100 | Buffs.ts 仅 OnFire/Burning/Suffocation | ❌ | 8 种玩家 DoT 无登记 |
| 10 | 溺水重置 RT | 溺水扣血前 lifeRegenTime=0 | Player.ts:936-942 只 hp−=2 | ⚠️ | 回血爬坡不被打断 |
| 11 | 魔力再生全链 | delay 公式/静止攀绳/药水 buff/蓄能/系数截断/满魔照扣 | Player.ts:709-752 | ✅ | 逐项 1:1 |
| 12 | manaRegenDelay 截断 | 先 float 后 int 截断 | 先 floor 后乘 | ⚠️ | 差≤0.5t 无感 |
| 13 | 用魔重置窗 | itemAnimation 期间每帧重置 | Player.ts:628-630 用 useTime | 🔀 | 连续施法惩罚略轻 |
| 14 | 魔力再生手环 | +20魔/+25regenBonus/+1delayBonus | ✅ | ✅ | — |
| 15 | 魔力花自动喝蓝/眩晕 | 首个 healMana/300t 减伤曲线 | ✅ | ✅ | — |
| 16 | 魔力上限 400 帽 | statManaMax2 钳 400 | Player.ts:521-523 无钳制 | ⚠️ | 极限堆可超(常规碰不到) |
| 17 | **玩家受伤减防公式** | 经典×0.5/专家×0.75/大师×1.0,截断+两道 min1 | Player.ts:1856 固定×0.5+Math.round | ❌ | **专家/大师防御效果被低估 33%/50%**;round 替代 trunc 奇数防御多掉 1 血 |
| 18 | endurance 乘区 | 围巾+17%/龟甲+15%/叶绿+5%/日耀+12%/冰障+25%/药水+10% **加法** | 仅药水+甲虫壳 | ❌ | ArmorSetBonus 无 endurance 字段 |
| 19 | 防御负值钳制 | statDefense<0→0 | defense getter 无钳制 | ⚠️ | 虚弱/醉酒叠满防御变负→变相增伤 |
| 20 | 敌方接触伤害浮动 | DamageVar(±15%−luck)+旗帜减伤 | Enemy.ts:758-766 原值 | ⚠️ | 无浮动/无 luck/无旗帜 |
| 21 | **暴击×2 时机** | **先扣防再×2**(NPC.cs:81983) | Arrow.ts:229/Game.ts:7739 先×2 再扣防 | 🔀 | **暴击伤害系统性偏高敌防/2** |
| 22 | DamageVar±15% | ±15%+luck 重掷 | ±15%有;**luck 缺** | ⚠️ | — |
| 23 | 护甲穿透语义 | pen/2 直伤 | ✅ 等价 | ✅ | `def>2×dmg` 中间钳制为非原版 |
| 24 | 伤害类型四链 | melee/ranged(箭弹分道)/magic/summon | ✅ 全对 | ✅ | — |
| 25 | **徽章族召唤伤害** | 复仇者+12%/毁灭者+10%/召唤师+15% 均含 minion | accfx 无 minion 项;SUMMON_GEAR 无三键 | ❌ | **三枚徽章对召唤 0 加成**;dmgAll 不含 summon 是潜伏坑 |
| 26 | **对敌伤害数字口径** | 显示**扣防后**数值 | 显示扣防前 | 🔀 | 每个对敌飘字偏高敌防一半(联机已修,本地未改) |
| 27 | 受击数字口径 | 显示含 endurance 的最终值 | 不含 | ⚠️ | 耐久/甲虫壳生效时显示>实际 |
| 28 | 药水冷却 | 治疗 60s/恢复 45s/怪酿 40-70s/蘑菇 30s/蛋奶 40s | Game.ts:4201 恒 60s | ⚠️ | 恢复药水/食物不缩短 CD |
| 29 | **贤者之石×0.75** | 只缩 potionDelayTime 类 | Game.ts:4108 把 **buff 时长**×0.75;药水病硬编码不吃 | 🔀 | **双向错接**:所有药水 buff 变短,该缩的药水病没缩 |
| 30 | **maxHp 误加 80(新发现)** | buff 21=Potion Sickness 无任何属性 | Buffs.ts:466-468 healthBonus=80+Player.ts:519 | ❌ | **喝治疗药水→60s 内 maxHp+80**,血条/上限/回血门全被抬高,最离谱一条 |
| 31 | 死亡掉钱分档 | 经典留半/专家 1/4/大师全掉,按世界难度 | ✅ | ✅ | — |
| 32 | 中核/硬核惩罚 | 掉全部/消亡 | ✅ | ✅ | — |
| 33 | 重生时间 | 600t=10s(+600 boss 邻近/专家×1.5) | Game.ts:2679 **3 秒** | ⚠️ | 惩罚感不到原版 1/3 |
| 34 | 生命/魔力上限物品 | 三件门限/回复/成就钩 | ✅ | ✅ | — |
| 35 | 快捷喝药热键 | QuickHeal/QuickMana(H/J) | 全仓无 | ❌ | — |

**覆盖**:核 10/10 项拆 35 条:✅14/⚠️12/❌8/🔀3。

**最需修复 TOP 5**:
1. **#30 maxHp+80 假 buff**:BuffType.Resistance 被当+80 上限——喝药即+80 最大生命,直接扭曲战斗难度
2. **#17 防御难度系数缺失**:专家 0.75/大师 1.0 完全不生效,难度手感失真主因
3. **#29 贤者之石双向错接**:#4108 与 :4201 一处挪位两处修正
4. **#21+#26 暴击时机与飘字口径**:先扣防再×2、飘字取扣防后值(对齐 StrikeNPC)
5. **#1 自然再生主公式**:纯数值代码移植成本低,是"续航明显比原版差"的根因

次级:#25 三徽章召唤伤害、#6 光环步长3采样、#18 endurance 链、#9 玩家 DoT 族、#33 重生 3s→10s。

---

### 域:工具力与挖掘——已审计

> 关键口径发现:1456 源码中 `Item.axe` 字段单位=**斧力%÷5**(pick/hammer 是全百分比)。Drax axe=22(=110%)、The Axe 35(=175%),全严格×5。仓库 JSON 存的是源码原值,**与源码一致是对的**——但凡把它当百分比用的地方全错(见 #2)。主链(伤害=力/HitTile 100 阈值/冷却=useTime/衰减表/锤循环)确认 1:1;外围挖出 6 个真 bug 级偏差 + Block Swap 整体缺失。

### 差异清单(33 项:✅11/⚠️12/❌7/🔀5/❓1)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | 镐力表抽核 21 件 | 铜35…激光钻230(Pickaxes.md 全表) | `data/vanilla-itemfunc.json` | ✅ | 21 件+useTime 链全对 |
| 2 | **双工具斧力单位污染** | Drax `axe=22`(=110%),伤害 int(22×1.2)=26/击 | `items.ts:1003` 写死 `579/990: axe 70` 且**优先于** JSON(Game.ts:3714/3882) | ⚠️ | Drax/镐斧砍树 84 vs 原版 26 →**约 3 倍快**;1305/1507/3525 同病 |
| 3 | 锤力表 15 件 | 木25…耀斑四族100 | JSON+VANILLA_TOOL_POWERS | ✅ | 全对 |
| 4 | 挖掘阻力除数链 | 钴钯÷2/秘银山铜÷3/精金钛÷4/叶绿÷5/蜥蜴砖÷4/邪砖÷2/云雪×2(:52986-52996) | Game.ts:5042-5049 | ✅ | 一致(仅 #6 例外) |
| 5 | **矿三档镐力门槛** | 钴钯<100、秘银山铜<110、精金钛<150 →伤害归零(:53058-53070) | Game.ts:5050-5061 **无此三档** | ❌ | **梦魇镐能磨下钴矿**,破坏困难模式进度曲线;三行 if 即可修 |
| 6 | 蜥蜴祭坛 237 | 仅 226 走 /4,237 全额 | Game.ts:5046 一起 ÷4 | ⚠️ | 慢 4 倍(边缘) |
| 7 | 地牢砖门槛范围 | `<100 && y>worldSurface && (x<0.35w ‖ x>0.65w)`(:53062) | Game.ts:5061 缺 X 条件 | 🔀 | 实现**全域封锁**;原版中部 30% 地下地牢砖任意镐可挖 |
| 8 | tileDungeon 集合 | {41,43,44,**677-679**}(远古砖) | Game.ts:311 {41,43,44,481-483} | ⚠️ | 缺 677-679;481-483 混入(碰巧行为正确) |
| 9 | 黑檀/猩红石门槛 | 恒 <65→0 | `power<(underSurf?55:65)` | 🔀 | demonite/crimtane 错并(影响≈0) |
| 10 | **草/苔藓转换链** | 将破一击→归零+fail 分支草→泥土/丛林草→泥/苔→石(WorldGen.cs:63763-63790) | tryMine 无转换直接破坏 | ❌ | 原版草**永不破坏**而是变泥土(wiki「草吸收一击」) |
| 11 | **CanKillTile 保护门** | 树/仙人掌/祭坛/宝箱正下方禁挖、锁门禁拆、wall350(:62249-62375) | `toolCanBreak` 只查镐力(Game.ts:4816) | ❌ | 树下取方块/altar 下方/锁门均无保护 |
| 12 | 锁门保护 | IsLockedDoor+神庙门 429 未杀石巨人 | clearDoorAt 无条件拆 | ❌ | 神庙门/地牢锁门可提前拆 |
| 13 | 伤害增补段 | {147,0,40,53,57,59,123,224,397}+=pickPower 等十支(:53042-53123) | 仅部分 noFail 表 | ⚠️ | 137/128/334 与增补段缺 |
| 14 | **挖掘冷却** | `useTime×pickSpeed`;**近战速度不影响工具速度**(Tool_speed.md 明示) | `round(useTime/attackSpeedMult)×…`(Game.ts:5017) | 🔀 | 近战速度/甲虫球/食物**非法加速挖掘** |
| 15 | pickSpeed 加成链 | 药水−25%/SugarRush−20%/风筝−15%/食物/Ambrosia/日月石/凿子/护甲/采矿套,封顶 0.3(:25678,八处源码点) | 二值 `(tileSpeed‖Mining)?0.75:1`+食物×风筝 | ⚠️ | 不可叠加;缺五源与 0.3 封顶;tileSpeed(放置速度)误进挖掘 |
| 16 | 斧伤害 | int(axe×1.2)、仙人掌×3 | Game.ts:5038 | ✅ | (除 #2 单位污染) |
| 17 | **锤墙伤害** | int(hammer×**1.5**)(wiki「150×锤力%」) | `Math.round(power*2)` | ⚠️ | 木锤 50 vs 原版 37;**锤拆墙整体偏快** |
| 18 | 锤墙冷却 | useTime/**2**(Tool_speed「墙例外」) | 无减半 | 🔀 | 墙拆节奏慢一倍 |
| 19 | **天然墙拆除规则** | 非 3×3 内有墙洞/房墙不可拆;墙350 永禁(:45303-45328) | 仅 `if(!wall) return` | ❌ | **天然墙可任意位置直接拆** |
| 20 | 墙目标选择 | 活动格后禁锤墙(2×2 子格精度) | 平台后仍落墙分支 | 🔀 | 平台后可锤墙(原版不可) |
| 21 | 半砖/斜坡循环 | 整砖→半砖→slope1-4(:45640-45695) | Game.ts:4982-4996 | ✅ | 逐行一致 |
| 22 | 锤特殊族 | 平台楼梯/137 Traps 旋转/424栅栏/470姿势/轨道 | 仅轨道 | ⚠️ | 平台锤不出坡面/楼梯 |
| 23 | 祭坛反噬 | Hurt(**当前**HP/2)(:45079) | `floor(p.maxHp/2)` | ⚠️ | 满血时误伤加倍 |
| 24 | 爆炸可破表 | 六困难矿仅 scarab;地牢+箱永禁;六矿{107,108,111,221,**222**,223}(:75764-75833) | Game.ts:7249-7276 | ⚠️ | **漏 222 山铜矿**→山铜可被炸 |
| 25-28 | 放置射程5/3 ✅/放置特例✅/支撑锚点❓(平台浮空可放)/实体阻挡⚠️(城镇NPC头上可放实心块) | | | | |
| 29 | **Block Swap(1.4.4+)** | 开关+镐力达标+不可换清单(重力块/树下/草/蜂巢等) | 全仓无 blockSwap | ❌ | **完全未实现**(1456 必备建造机制) |
| 30 | 破坏掉落链 | KillTile_DropItems 全量 | breakTile | ✅ | 多格锚点/蘑菇/晶簇/八音盒帧带/告示牌覆盖相当深 |
| 31 | **狱岩留岩浆** | type58 且 y>h-200 →liquid=128(WorldGen.cs:63955) | 无此段 | ❌ | 地狱挖狱石不留岩浆 |
| 32 | HitTile 衰减 | 四档 −10/−7/−5/−2 | core/HitTile.ts:63-73 | ✅ | 逐条一致 |
| 33 | FTW 特殊种子 | pick×2/axe×1.3 | 无 | ❌ | 种子族全缺(低优) |

**最需修复 TOP 6**:①**#5 矿三档门槛**(三行 if,破坏整个进度曲线);②**#2 axe=70 污染**(写死表优先级高于权威 JSON,建议删表走 JSON);③**#29 Block Swap 整体缺失**;④#10+#11 草转换+CanKillTile 门(「挖不动」体验骨架);⑤#17+#18+#19 锤墙三连;⑥#14+#15 挖掘冷却非法加速+pickSpeed 链补全。

---

### 域:事件机制系统——已审计

> wiki 与源码仅两处需裁决(#33 月亮掉落门基数部分页面沿用 1.4.0.5 旧值 30/17,1456 是 28/24;#47 wiki 正确记载 dayRate 影响)。

### 差异清单(52 项:✅44/⚠️3/❌4/🔀1/❓1,仅列非 ✅ 项)

| # | 事件/机制项 | 原版设定 | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 10 | 日食·自然 roll 副作用 | hard+三机械任一+1/20;命中**清两晷冷却**+成就(Main.cs:64912-64937) | Game.ts:2993-2998 | ⚠️ | 缺 sundial/moondialCooldown=0 与 event 2 |
| 22 | **飞翔的荷兰人号 491** | 进度过半 1/20+净空→491(=10分)(NPC.cs:1377-1381) | VanillaSpawner.ts:1290 自注"暂缺,跳过" | ❌ | 首支未实现→10 点与海盗最优掉落(幸运币/折扣卡/金戒指 1/15)不可达;掉落数据已在 json 躺着 |
| 36 | 月亮·召唤物门 | 夜∧无月事件∧!DD2(Player.cs:43321) | Game.ts:4419-4432 加 `invasionType===0` | 🔀 | 普通入侵中本应可开月亮(应收窄为仅 DD2) |
| 41 | 四塔区域判定 | ≤r²(4000px) | `<`(Game.ts:7817) | ⚠️ | 边界差,测度为零 |
| 44 | **天界石碑 3601** | 杀石巨人+hard+无险情+无教徒→StartImpendingDoom(**720**)(Player.cs:43348) | 无使用链 | ❌ | 月总直召捷径未实现 |
| 46 | **邪教徒自然生成(CultistRitual)** | 击石巨人且杀过骷髅王后地牢门口刷石碑;delay 86400/复活 43200/recheck 600(CultistRitual.cs 全文) | `bossAI_lunar_misc.ts:453` 注明"略" | ❌ | **最大缺口**:正常流程 439→四塔→月总整条进度链不可达;仪式 AI 本体已 1:1,只差 TrySpawning 入口 |
| 47 | 入侵前线推进 | **dayRate** 格/帧(Main.cs:63813-63845) | Invasion.ts:105-110 固定 1 | ⚠️ | 睡觉/旅程倍率下入侵抵达时间偏差最高 24 倍 |
| 52 | 派对 Genuine 路 | BirthdayParty Manual+Genuine 两路 | 仅 Manual(审计时并行会话正接入 partyNaturalAttempt) | ❓ | 未及核验 |

✅44 项含:血月全链(触发/终止/僵尸开门/怪池/刷怪率/钓鱼敌怪 1/6+鹦鹉螺/掉钱×1.01/召唤物)、日食怪表逐分支/Mothron 蛋、哥布林(触发/规模 80+40n/点数/怪池/战旗)、雪人、海盗(触发/规模/掉落三件套/地图 1/100/入驻)、火星(AI_080 三态/规模/飞碟 10 分)、南瓜霜月(分数表 19 档/怪分表/公告/难度乘区/掉落门/bossCap/黎明结算)、四塔(触发/护盾 100/塔 AI/区域/月总时序/碎片 12-20×1-3)、邪教徒仪式链、入侵结算、BGM 链、灯笼夜全文 1:1。

**最需修复 TOP 5**:①**#46 CultistRitual 自然生成**(唯一进度链断点,参照 CultistRitual.cs:30-86);②**#22 荷兰人号 491**(净空判定可复用 LunarEvent 的 solidTiles);③**#47 入侵 dayRate**(`max(1, w.dayRate())` 一行);④#10 日食两笔副作用;⑤#44 天界石碑+#36 月亮召唤物门收窄。

---

### 域:制作与配方——已审计

> 主链(3173 条/decraft/RecipeGroup)简核通过;雷区在邻域范围、消耗回滚、炼金台状态机、提取器丢数据、附近箱联动。wiki 与源码无冲突。

### 差异清单(34 项:✅15/⚠️5/❌9/🔀4)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 3 | **邻域扫描范围** | ±5/±3(默认),面包+4,上限 20(Player.cs:2360-2362/35219) | Game.ts:10543-10544 固定 ±20/±15 | ⚠️ | **4-5 倍偏差**:制作站隔两屏仍生效 |
| 4 | 工匠面包 5326 | +4 格 | grep 零引用 | ❌ | 无 ateArtisanBread 等价字段 |
| 6 | 环境条件门 | 7 类(tile/water/honey/lava/snow/graveyard/**mechdusa**/**torchGodsFavor**) | envOk 只 5 类(vanillaRecipes.ts:174-190) | 🔀 | 两布尔门整条丢失(见 #7/#8) |
| 7 | needTorchGodsFavor | 需 unlockedBiomeTorches,仅 1 条(5573 勋章) | 无 flag | ❌ | 勋章无条件可合成;同步缺 unlockedBiomeTorches 状态 |
| 8 | needMechdusa | getfixedboi 限定种,仅 1 条(5334 剃刀) | 无 flag | ❌ | 任何种子都能合成 mechdusa 召唤物 |
| 10 | RecipeGroup 总数 | **32** 组 | JSON 31 组 | ❌ | 缺 Turtles=[4464,4465] |
| 11 | **Turtles 丢失根因** | Recipe.cs:9636 海龟雕像配方 | 提取器正则遇嵌套括号失配→组静默丢弃→expandCritterStatue `gid2===undefined` 直接 return | ❌ | **海龟雕像(4466)整条配方缺失**;3173 应为 3174 |
| 12 | 炼金台折扣 | 每材料**逐份独立掷 1/3**(×10 也逐份) | `alchemy && alchemyTable && times===1` 才折扣 | ⚠️ | shift ×10 折扣完全失效 |
| 13 | **_alchemyTable 粘滞** | 每帧 AdjTiles() 先清 false(Player.cs:35218) | Game.ts:10551 只置位不清零 | 🔀 | **真 bug:靠近过一次永久 1/3 折扣** |
| 15 | **消耗回滚/过扣保护** | qty 循环逐次重查,永不过扣(CraftingRequests.cs:86-102) | consumeMaterials **先扣后查**,失败不回滚(vanillaRecipes.ts:232-269)+shift ×10 不钳制(UI.ts:2248) | 🔀 | **高危:材料全销毁零产出**(100 木+3 凝胶×10 →木蒸发) |
| 17 | **附近箱联动(1456 新)** | 开着的容器+虚空袋+600px NearbyChests,**默认 true**(Recipe.cs:380-404) | 仅扫背包 | ❌ | 1.4.5 默认开启功能整缺 |
| 22 | 成品随机词缀 | `stack<=1 → Prefix(-1)`(CraftingRequests.cs:121-128) | 无 prefix 写入 | ❌ | 合成武器/工具/饰品永远无词缀(rollPrefix 现成未接) |
| 23 | 成品去向 | 上鼠标(可并堆) | 直接入背包溢出落地 | 🔀 | 交互模型不同(轻) |
| 25 | 合成弹字 | PopupText(ItemCraft) | 无 | ❌ | (轻) |
| 28 | 站点指示行 | 同 #3(±5/±3 全站) | UI.ts:2183 旧 stationsNearby(±4/±3 只认三站) | ⚠️ | 纯显示:与真实判定不一致,玩家看到的"附近制作站"不可信 |
| 30 | 背包→附近箱快速堆叠 | QuickStackToNearbyChests+smartStack | 无 | ❌ | 未实装 |
| 31 | 按住连做 | superFastStack 递增 | 单击单做 | ❌ | (手感层) |
| 32 | 组材料灰显 | 组全体计数 | 只数首个成员 | ⚠️ | 30 松木 0 普木显示"0/10"但可合成数正确(显示自相矛盾) |

✅15 项含:站集 36 档 1:1(含 Tea Kettle 622)/TileCountsAs 递归 9 条/液体站(阈值 200+1水2岩浆3蜜编码+水槽喷泉)/RecipeGroup 抽核 3 组全等/shift ×10/材料计数范围语义一致/钱币双向链/墓地 130 条+门槛 28/雪原 1 条/水晶球/成就钩子/合成音效/向导反查语义等价/箱面板三按钮/微光 decraft。

**最需修复 TOP 8**:①**#15 消耗回滚(数据销毁,最高危)**——逐次复检循环;②**#13 炼金台粘滞**(一行:vanillaNearbyStations 开头清 false);③#3 范围 ±20/±15→±5/±3(顺手留面包+4 参数位);④#11 提取器正则修嵌套括号→重提(3173→3174/31→32 组);⑤#7/#8 两门补齐;⑥#17 附近箱联动(先做开箱态);⑦#22 成品掷词缀(rollPrefix 接到 vanillaCraft);⑧#12 折扣逐份+#28 指示行换真实判定。

---

### 域:图鉴与收集——已审计

> 图鉴数据层+UI 是全项目对齐度最高的子系统之一(546 条目数严丝合缝,三桶统计/四档/归并表全对);收集侧另一半——**BannerSystem(击杀计数→旗帜领取→旗 buff)整块缺失**,击杀计数表缺 5 条。

### 差异清单(28 项:✅18/⚠️3/❌7/🔀1/❓2/📄1,仅列非 ✅)

| # | 机制项 | 原版设定 | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 2 | 满档杀数表 | 默认 50;逐 NPC 重算 447 个有旗 NPC | BESTIARY_KILLS_TO_FULL 68 条 | ⚠️ | **缺 5 条**:109 小丑/378/195 LostGirl/196 仙女/205 飞蛾——原版均 25,本仓缺省回落 50;其余 442 条全对 |
| 6 | 击杀记账时机 | EoW 仅最后一段死亡记 1(DropEoWLoot :79212) | 头(13)死即记(Game.ts:9239) | 🔀 | 净额等价,时机不同;另缺 GetWereThereAnyInteractions 门(雕像/环境击杀也计入,已注) |
| 13 | **洞窟三兄弟钳制** | 本世界不含变体时解锁档钳到"全部洞窟变体杀数最小值"(SalamanderShellyDad…cs:24-75) | 无(仅 credit 归并) | ❌ | 单世界杀满两种即满档(原版需跨世界三族)→图鉴完成度偏易,影响动物学家高阶商品;Bestiary.ts:17 头注自称已实现,**失实** |
| 17 | 图鉴 UI 筛选 | 搜索+已解锁+Boss+**稀有生物**+群系/事件标签+搜索别名(eoc/eow/moonlord) | BestiaryPanel.ts:69-215 | ⚠️ | 缺稀有生物/群系标签/别名;头注"筛选数据未提取"已过时 |
| 19 | BestiaryID 排序 | 九键链(:745-780) | Bestiary.ts:346-381 | ⚠️ | 第 6 键(群系组)以常量 0 代入 |
| 20 | 详情页内容 | 属性+**钱币掉落额**+击退定性档(阈 0.8/0.4/0) | BestiaryPanel.ts:736-766 | ⚠️ | 缺钱币行;击退显示为百分比 |
| 22 | .wld 导入 | WorldFile 尾部 bestiary 段 | WldParser.ts:4 跳过 | ❓ | 导入世界图鉴为空(至少需提示) |
| 23 | 火把神条目 | 已用恩惠进世界→立即记账 664 | 无 | ❌ | 事件本体已移植未接记账 |
| 24 | 侏儒石化记账 | 日光下石化=记击杀+旗+成就24(NPC.cs:56241) | 无 | ❌ | 侏儒只能靠击杀解锁 |
| 25 | 图鉴100%成就 | 新增条目→事件29 BOOK_WORM | 无 | ❌ | — |
| 26 | **BannerSystem 领取** | 每旗击杀计数,每满 KillsToBanner→可领旗+1+公告(BannerSystem.cs:193-236) | 全仓缺失 | ❌ | 含领取 UI+多人同步 |
| 27 | **旗帜 buff** | 放置旗→对怪伤×1.5(经典)/**×2(专家)**、受伤×0.75/**×0.5**;DD2 旗 0.2 档(Player.cs:20157、30930…) | tile v_91 仅为装饰(tiles.ts:258) | ❌ | **本域最大玩法缺口** |
| 28 | banner 杀数升阶 | **1.4.5.6 不存在升阶制**;杀数只决定获取节奏 | — | 📄 | 任务书"每50杀升阶1-3档"是误传;wiki 旧"+50%/−33%"未更新到 1.4.4 难度曲线 |

✅18 项含:四档解锁公式/三桶统计/creditId 归并 100+ 条全对/Hide 表(总数 546)/quickUnlock 全集/复合条目/小动物对/金小动物 13 组+全见门/城镇 39 条/完成度公式/动物学家入驻 10%+商店全阶梯 30+ 商品/稀有度星公式+137 覆盖/存档三桶/掉落表展示。

**最需修复 TOP 6**:①**旗帜 buff+BannerSystem 整块**(数值按 ItemID.cs:11-44 难度曲线,勿照抄 wiki 旧值);②洞窟三兄弟钳制(顺手修失实头注);③杀数表补 5 条(一行表);④图鉴100%成就事件29;⑤记账边路三补(GetWereThereAnyInteractions/侏儒/火把神);⑥UI 收尾(稀有筛选/别名/钱币行/.wld 导入提示)。

---

### 域:盔甲与套装效果——已审计

> 单件数值(防御/伤害/暴击/魔力/移速)机器提取表,**42 套抽样全对**;缺口集中在**套装奖励层**——原版 ~46 条套装规则本地只落 21 条,行为型消费点缺近半。

### 差异清单(54 项:✅21/⚠️6/🔀2/❌24/📄2,仅列非 ✅)

| # | 套装/机制项 | 原版设定(Player.cs 行号) | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 3 | **木系 7 套**(木/乌木/阴影木/珍珠木/针叶/棕榈/Ash) | 防御+1(:15766-15771) | 无;vanillaArmorSets.ts:27 注释称"1.4.5 无加成" | ❌ | **注释是错的**——1456 源码明确 statDefense++,7 套全缺 |
| 4 | 灰烬木 | 触碰熔岩减伤(:15771-15775) | 无 | ❌ | |
| 5 | 仙人掌 | 反伤 15/30/45(普通/专家/大师) | 无 | ❌ | |
| 6 | 南瓜 | 四系伤+10% | 无 | ❌ | |
| 11 | 巫师帽+宝石袍 | body 允许 58-63/167/213 八种袍(:15829-15834) | 仅 `'14\|58\|*'` | ⚠️ | 只匹配紫水晶袍,黄玉/蓝宝/翡翠/红玉/钻石袍不触发 |
| 12 | 魔法帽(159) | 魔力上限+60 | 无 | ❌ | |
| 13 | 暗影 | 跑动四乘区(:26195-26201) | 无 | ❌ | 原版是 runAcceleration×1.75 等非+15%移速 |
| 14 | 猩红 | 受伤后快速回复(:15846) | 无 | ❌ | |
| 15 | 陨石 | 太空枪 0 耗魔+回魔豁免(:15863) | 无(Player.ts:717 自认) | ❌ | |
| 18 | 雪原 | 冰冻/寒冷免疫(:15890) | 无 | ❌ | |
| 19 | 挖矿 | 挖掘速度+10%(:15897) | 无 | ❌ | wiki 也是 10%(任务书猜 30% 错) |
| 20 | 霜寒 | 近/远程+10% **且施加 Frostburn 25DPS**(:15868) | 仅伤双半 | ⚠️ | Frostburn 半边缺 |
| 21-23 | 钴/秘银/精金 3 头分支 | 法魔耗-14/-17/-19%或近战速/弹药80%等(:15939-15986) | 无条目(单件全对) | ❌ | 9 头分支全缺 |
| 24-26 | 钯金/山铜/钛金 | 命中回血/花瓣/碎片护盾(:15989-16018) | 无 | ❌ | |
| 27 | 神圣(近/远/法) | 命中后闪避(onHitDodge :16021) | 无 | ❌ | |
| 28 | **神圣召唤头** | head 254/258(:16023-16028) | vanillaSummonStats.ts:64-65 键 `'24\|229\|*'`/`'23\|229\|*'` | ⚠️ | **键写错:真套装永不触发+红帽误触发**(hs24=只有 RedHat、hs23 空槽);一行表修 |
| 29 | 水晶刺客 | 闪避冲刺+四系+10%(:16033) | 无 | ❌ | |
| 30-32 | 绿藻近/法/远/召头 | 叶晶+受伤-5%+叶晶射击(:15903-15915) | 召唤头槽位✅叶晶❌;余无 | ⚠️/❌ | 叶晶 buff60 整链缺 |
| 38 | 甲虫进攻 | 按伤害蓄能(命中 dmg×3/×2/×1,阈值 400/1200/3600)(Projectile.cs:12906) | 时间窗 90t/球(Player.ts:1572) | 🔀 | 每球收益✅;蓄能模型不同 |
| 39 | **甲虫防御** | **1456 球仅视觉,buff95-97 无任何减伤** | Player.ts:1854-1855 给 0.15×orbs 减伤 | 🔀+📄 | **本地实现了原版不存在的属性**(凭空增益);wiki「15/30/45% 减伤」与 1456 源码不符 |
| 41 | 幽魂面具 | ghostHurt 追踪弹(预算1500)(:15856) | 仅旗标无消费 | ❌ | |
| 42 | **manaCost 语义** | 所有魔耗减免**加法累计**(:13991…) | Game.ts:4451/4794 乘法连乘 | ⚠️ | 组合 0.7728 vs 原版 0.76 |
| 43 | 散件魔耗减免 | ~10 件(幽魂面具-13%/绿藻头冠-17%/星云盔-15%/刺客盔-10%/宝石袍 5-15%…) | accfx 无 manaCost 字段(242 键零命中) | ❌ | 静默丢失 |
| 48 | 禁戒 | 双击远古风暴(:16100) | 无 | ❌ | |
| 49 | **日曜 Solar Flare** | 受伤-12%+3 层护盾(每层全额抵消)+冲撞(:16224-16295) | **全仓零字段** | ❌ | 终局近战套纯防御白板 |
| 50 | **DD2 八套** | 头盔 maxTurrets+1(+2 T3)+套装再+1(:16109-16161)+散件属性 | 散件仅防御值;SUMMON_SET 无 DD2 键 | ❌ | 16 件散件+8 套奖励全缺 |
| 51 | 垂钓 Angler | 刷怪率下降(:15919) | 无 | ❌ | 散件 fishingSkill+5 也未接 |
| 52 | 海龟 | 受伤-15%+反伤×2(:15930) | 无 | ❌ | |

✅21 项含:金属两档/铂金、角斗士、忍者、化石、死灵(含远古)、丛林八键(含远古钴混搭)、熔岩、提基(+1 槽+20% 鞭程,**非+4**)、诡异+25%、蜂+10%、蜘蛛、黑曜(含鞭速)、幽魂兜帽(吸血 1:1+预算)、蘑菇矿潜行、星璇双击潜行、星云 booster、星尘守护者、甲虫(收益半)、套装判定语义、时装槽。

**最需修复 TOP 7**:①**神圣召唤头键错误**(一行表修,现永不触发+红帽误触发);②**日曜套整体缺失**(endurance+0.12+3 层护盾状态机+dashType=3,参考 beetleOrbs 模式);③ARMOR_SET_BONUSES 扩表 ~24 条(纯数值/旗标,单文件一次补齐;**删 vanillaArmorSets.ts:27 错误注释**);④**甲虫防御凭空减伤删除**+蓄能改回原版模型;⑤DD2/OOA 16 件散件+8 套(复用 SUMMON_GEAR.sentry);⑥accfx 补 manaCost 字段(~10 件)+魔耗链改加法;⑦行为消费点补齐(Frostburn/叶晶/禁戒风暴/ghostHurt/海龟仙人掌反伤)。

**注意**:vanillaArmorSets.ts 头注自述"首批覆盖肉前全套装"——实际肉前 7 条都没进表;扩表时逐键用 itemstats 的 hs/bs/ls **实测值**验证(hs23 空槽键编译期不报错)。

---

### 域:电路与机械——已审计

> 信号传播核心(BFS/四色 pass/逻辑门/泵/致动器/计时器)高保真 1:1;缺口集中在 **1456 相对 1405 的增量**(实现自述基于 1.4.0.5)与**触发源侧**(压板型号门/踩板/传感器 TileEntity)——后者几乎整块缺失或错位。

### 差异清单(64 项:✅38/⚠️9/❌13/🔀3/❓3/📄1,仅列非 ✅/高价值项)

| # | 机制项 | 原版设定(源码) | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 3 | 像素盒 PixelBoxPass | 仅触发值==3(水平+垂直同帧)时**翻转** frameX(Wiring.cs:668-680) | v==1 强制 frameX=0、v==3 强制 18 | 🔀 | 实现是"按来源强制开/关",原版是双轴同时→交替翻转 |
| 6 | **压板 135 型号门** | style 2灰/3棕/4蓝/6蜥/7橙=仅玩家;5黄=仅 NPC;0红/1绿=任意;7橙触发后 KillTile(Collision.cs:3336) | 玩家 AABB 命中任何 135 即触发,无 style 门、无毁块 | ❌ | 玩家误触发黄板;橙板不消失 |
| 7 | **敌怪/NPC 踩板** | 所有 NPC 走 SwitchTiles(NPC.cs:91558) | 仅 critters+巨石弹 | ❌ | 敌怪踩板完全不触发(神庙机关、黄板门全废) |
| 8 | **Teal 垫 442** | 仅投射物,四方向各自 10px 盒(Collision.cs:3288) | 仅巨石弹 | ❌ | 飞镖/箭/宠物不触发 |
| 9 | **地雷 210 踩踏** | 任意实体踩上即引爆(Collision.cs:3340) | 无 210 分支 | ❌ | 地雷只能通电引爆,踩不上 |
| 10 | 热喷泉 443 踩踏 | 踩上触发 | 仅通电/右键 | ❌ | — |
| 15 | **传感器 423 帧表错位** | frameY/18:0昼/1夜/2玩家上方/3水/4岩浆/5蜜/6任意液体(TELogicSensor.cs:181) | `mode=floor(frameY/18)%3` | ❌ | **全错位 bug**:水/岩浆/蜜/玩家上方全部被 %3 折叠误当昼传感器 |
| 16 | **液体传感器** | 四种液体+15t 离开迟滞+Water 排除岩浆/蜜/微光 | 无 | ❌ | 整体缺失 |
| 17 | 玩家上方检测盒 | 5宽×10高 Rectangle(:220) | 1宽×8高 | ❌ | 缺 x±2 与 9-10 高 |
| 18 | Player Above 抑制传送 | tripPoints 携带 logicCheck→blockPlayerTeleportation | 不设 | ❌ | Player Above 触发的传送器会传玩家(wiki 明确不应) |
| 24 | 故障灯 num2==0 | 强制 false(Wiring.cs:804) | 保留 fire=true | ⚠️ | 低风险 |
| 26 | 门重复输出冒烟 | PoofOfSmoke | 仅返回 | ⚠️ | 粒子未接 |
| 27 | **毒镖陷阱 kind5** | 1.4.4 新:弹 980、30 伤、速 12(Wiring.cs:1777) | 只处理 kind 0-4 | ❌ | 实现基于 1405 漏 1456 增量 |
| 28 | **尖刺球** | 1456 生效:frameX/18 四向+初速 4·dir(Wiring.cs:1812-1858);第二段(实现采用的)为不可达死代码段 | 固定下抛+预算惩罚表 | 🔀 | **误取不可达段**→丢失四向发射;预算惩罚 1456 恒不生效(疑似原版遗留 bug) |
| 33 | 巨石雕像生成点 | y=(oy)*16+**28** | (oy+1)*16=+16 | ⚠️ | 偏移差 12px |
| 34 | 蘑菇块 349 二次触发 | frameX±216 动画回弹 | 无 case | ❌ | — |
| 35 | 通电石上方门 | PreventsActuationUnder 全集+CanKillTile | 只挡 21/88/467 | ⚠️ | 漏 26/77/470/475/237/597/441/468 |
| 36 | 蜡烛 646 | ToggleCandle 含 646 | 只 33/174/49/372 | ❌ | — |
| 40 | **漏斗 Hopper(21/467)** | 1.4.4 新:CheckMech 60、192×192 盒抓物入箱(Wiring.cs:2648-2888) | 无 | ❌ | 带线宝箱通电无效果 |
| 41 | **日晷 356/月晷 663** | 通电快进昼夜+cooldown 门 | 无 | ❌ | — |
| 48 | 派对兔变体 | style 9:PartyIsUp→540 否则 46 | 写死 46 | ❌ | — |
| 49 | spawn 后标志 | value=0/npcSlots=0/SpawnedFromStatue/CanBeReplaced | 缺后两个字段 | ⚠️ | — |
| 50 | **城镇 NPC 搬迁雕像** | case40 18 人/case41 8 人白名单,**随机**选传送(Wiring.cs:2418-2473) | 各 6 key **按序取第一个**;nurse/demolitionist/dyer 等错组 | 🔀 | 成员错位+非随机 |
| 54 | **传送器 NPC 过滤** | lifeMax>5∧!boss∧!noTileCollide∧!TeleportationImmune(:3181) | 无过滤全传 | ❌ | boss/蠕虫会被传送 |
| 55 | 玩家传送 | 保留速度、无音效 | 清 vx/vy+播 tink | ⚠️ | 近似 |
| 60 | 泵抽空类型清理 | liquidType(0)+SquareTileFrame | 保留类型、无帧重算 | ⚠️ | 潜在隐患 |
| 62 | 接线 dir | direction(先水平/垂直可变) | 写死 true(先垂直) | ⚠️ | +CanDoWireStuffHere 门未接 |
| 63 | **接线 reach** | tileBoost 20+基础 range≈**25 tiles**(wiki Wire.md:47) | 固定 20 | ⚠️ | 短 5 格 |
| 64 | 📄 水传感器与微光 | wiki 称"水传感器也被微光触发";源码明确排除——**微光不触发水传感器**,只有 Any 类型响应 | — | 📄 | wiki 有误 |

✅38 项含:四色 pass 序/BFS 邻居序与预算/CheckMech 999/拉杆开关计时器箱宝石锁/测重板双触发/传送抑制清除/计时器五档(½s/¼s 非新增)/六门真值表+级联防环/陷阱族 0-4 数值/大炮兔兔炮雪球机复合状态机/炸药地雷通电/烟花族全数值/雕像主表(含 1.4.4 新组)+冷却四档+MechSpawn 配额/心星配额/传送器判定盒距离门神庙墙/泵抽排 4 格×19 上限/致动器全表(PreventsActuationUnder)/音乐盒喷泉天塔柱态机/宝石块传送带/广播盒提取机派对碑。

**最需修复 TOP 8**:①**传感器帧表错位**(一行:%3→直接映射 0-6,连带修复五种误触发);②液体传感器四型+PlayerAbove 5×10 盒+触发抑制传送(同块按 TELogicSensor.GetState 一次移植);③**压板型号门+敌怪踩板+Teal 投射物**(按 Collision.SwitchTiles 重建触发源);④毒镖陷阱 kind5;⑤尖刺球按 1456 生效路径恢复四向;⑥漏斗 Hopper;⑦日晷月晷通电;⑧像素盒翻转语义+传送器 NPC 过滤。低优:雕像白名单/派对兔/通电石门全集/蜡烛 646/reach 20→25。

---

### 域:弹药与弹幕——已审计

### 差异清单(32 项:✅12/⚠️6/❌13/🔀1/📄2,仅列非 ✅/高价值项)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 2 | 伤害叠加 | 弹药伤害×GetWeaponDamageMultiplier(P:52715) | `武器×乘区+ammoC.damage` 裸加(Game.ts:4303) | ⚠️ | 弹药伤害不吃远程乘区;100%加成下弹药贡献砍半 |
| 4 | **无尽袋不消耗** | consumable=false 恒不耗(P:52829) | 无 consumable 判断,无条件 removeAt(Game.ts:4338) | ❌ | **无尽袋被逐发消耗直至耗尽——吞物品级 bug** |
| 5 | 节省组合 | ammoBox/ammoPotion/魔法箭袋/武器自带(huntress 1/10 等)**各自独立掷**(P:52756-52795) | 所有来源 OR 后单掷 1/5(Game.ts:4338) | 🔀 | 多来源叠加收益丢失(48.8%→20%) |
| 8 | 魔法箭袋 20% 省箭 | `quiver && 箭 → 1/5 不耗`(P:52753) | quiver 只给速度/击退 | ❌ | 省弹缺失 |
| 9 | 武器自带节省族 | 迷你鲨1/3、巨兽鲨1/2、SDMG 69% 等(P:52762-52795) | 无任何分支 | ❌ | 整族缺失 |
| 12 | **叶绿弹追踪** | proj 207:AI_001 300px 追踪+命中重定向(Projectile.cs:53906) | 无 homing 代码 | ❌ | 叶绿弹成直线弹 |
| 13 | **高速弹** | proj 242:**penetrate=3、extraUpdates=7**(:2970) | 无 opts→pierce=1 单步(Game.ts:4313) | ❌ | 穿透丢失+慢 8 倍 |
| 14 | 水晶弹碎片 | proj 89 Kill 分裂 2×90@50%(:72289) | onProjectileDeath 只处理碎镜 | ❌ | DPS 约减 1/3 |
| 15 | **自id弹药族** | 星星炮=75/信号枪=931/桩1836/钉3108/糖玉米1783/南瓜灯1785(Item.cs:12107) | vanilla-itemcombat.json 21 条 useAmmo 全 **-1** | ❌ | 提取器未解析 AmmoID 常量→**该族全部哑火** |
| 16 | 鱼叉(160) | 无 useAmmo,proj 23 锚定链 | 默认 40(木箭)+抛物线 Arrow(Game.ts:4269) | ❌ | 误耗木箭+弹体类型错 |
| 17 | 霰弹散布 | `Next(-40,41)*0.05`≈**±2**(P:47326) | `*0.05*20`=**±40**(Game.ts:4329) | ⚠️ | **散布超原版 20 倍**,霰弹扇面乱喷 |
| 18 | **aiStyle1 重力** | **15 tick 后 vy+=0.1**,vy 钳 16(Projectile.cs:54686) | 第 0 tick 起 0.3/tick(Arrow.ts:163) | ❌ | 重力 3 倍+无延迟期→弹道下垂、射程缩水 |
| 19 | aiStyle2 投掷 | 20 tick 后 0.4+vx×0.97(:21960) | 同上 0.3/t0 | ⚠️ | 下落过快不减速 |
| 20 | 穿透伤害衰减 | **1456 无通用穿透×0.8**;仅特例(357 等)(:13170) | 无衰减 | ✅📄 | 任务前提与部分 wiki 说法不符源码 |
| 21 | **无敌帧×穿透** | maxPenetrate==1 弹**无视 immune 且不设帧**(P:11904/13152);穿透弹设 10 | hurt 首行 iframes 拦截,命中设 **8**(Enemy.ts) | ❌ | 同 tick 8 发四管霰弹只有 1 发有效(**DPS≈1/8**,全远程最大失真);帧数 8 vs 10 |
| 22 | **extraUpdates** | 每tick跑 extraUpdates+1 次(P:15331) | 弹幕实体无该字段 | ❌ | 所有高速弹幕慢 (extraUpdates+1) 倍 |
| 23 | timeLeft | 箭 1200/子弹 600(SetDefaults) | 默认 1200 一刀切;不读 pd.timeLeft | ⚠️ | 子弹寿命高估 |
| 25 | 嵌地箭回收 | **1.4.0.1 起箭不再掉落回收**(Projectile.Kill 全链确无) | `rand<1/3 spawnDrop`(Arrow.ts:179)注释出处错误 | ❌📄 | 本地多出 1.4 已移除的机制 |
| 26 | 碰撞盒 | 箭 10×10;火枪弹/叶绿/高速 **4×4** | 一刀切 10×10 | ⚠️ | 子弹判定盒大 2.5 倍 |
| 28 | 魔法穿透 | per-type 无上限(无限穿透=-1) | `min(max(pd.penetrate,1),3)` 人工钳制 | ⚠️ | 原版无此上限 |

✅12 项含:弹药选择优先级(钱币枪靠布局巧合可用)/火焰箭点燃/咒焰灵液剧毒弹表驱动/Ammo Box 30min(wiki 措辞与源码不符📄)/节省药水/越界回收/不伤发射者/useMana 时机/悠悠球三表逐值一致/手雷炸弹三元表/出屏回收。

**最需修复 TOP 8**:①**无敌帧阻断多弹丸**(maxPenetrate==1 弹应无视且不设帧——全远程最大失真);②**无尽袋逐发消耗**(补 consumable 门);③**extraUpdates+per-type pierce 双缺失**(高速弹族慢 8 倍且丢穿透);④aiStyle1 重力(15t 后 0.1/tick)+aiStyle2(20t 后 0.4+阻尼);⑤**自id弹药提取缺口**(21 条哑火,补 AmmoID 常量);⑥节省链改独立多掷+魔法箭袋+武器自带族;⑦霰弹散布删 `*20`;⑧水晶弹碎片+叶绿追踪+移除非原版 1/3 箭回收。顺手:ignite 死字段、鱼叉 160。

---

### 域:液体交互与钓鱼——已审计

> 「Liquid.cs 一比一重写」「AI_061 累积器已移植」属实(交互/流动/蒸发/水泵逐行核过);但**饵/竿数值表与物品可用性是记忆未覆盖的暗坑**。

### 差异清单(26 项:✅12/⚠️4/❌9/🔀3/📄2,仅列非 ✅/高价值项)

**A. 液体交互(✅6:水岩浆方向产物落点逐行 1:1/产物表全对/蒸发/三档流动速率/排水泵语义)**

| # | 机制项 | 原版设定(源码) | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| A6 | 蜂蜜/水移速 | 蜂蜜 gravity 0.1/maxFall 3(P:24131) | 蜜×0.5/水 0.6/0.55 近似 | ⚠️ | (移动域已登记) |
| A7 | 岩浆着火难度倍率 | 专家/大师 DebuffTime ×2/×2.5→7/14/17.5s | Buffs.apply 无难度倍率,恒 7s(Buffs.ts:276) | ⚠️ | (buff 域 #D2 同根) |
| A8 | 微光合块门 | 触发成立时恒真(:1269) | 多加 `lt===4‖…` 拒绝门(LiquidSim.ts:777) | 🔀 | 邻格同为微光时原版照产以太块 |
| A9 | 生成期沙漠岩浆 | 地下沙漠 7×7 强制转岩浆(Liquid.cs:1457) | 无 | 🔀 | 仅世界生成期,轻微 |

**B. 钓鱼**

| # | 机制项 | 原版设定(源码) | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| B9 | **装备侧渔力** | 耳环+10/钓具袋+10/浮标族+10/渔夫甲每件+5/软糖虫+3/浮水+5/坐姿+5(P:9831-41553 七源) | 仅药水15+Tipsy5(Bobber.ts:107) | ❌ | equipStats 无 fishingSkill 字段,全缺 |
| B10 | **饵数值表** | 大师2676=50/行家2675=30/学徒2674=15;蝶族1994-2001=5/35/30/20/10/50/15/25(Item.cs:25857/21306) | 2676=**30错**;2674 与 7 蝶**整族缺**;2001=**5错** | ❌ | 学徒饵不可作饵;松露虫 666✅ |
| B11 | 饵消耗特例 | 垃圾/任务鱼(rare<0)**不耗**;敌怪咬钩必耗;金瓢虫 1/20(P:51640-51677) | 基础公式✅;特例全缺 | ⚠️ | 垃圾/任务鱼照常耗饵 |
| B13 | 堆叠渔获 | 3196/3197 数量随渔力滚段(Projectile.cs:51016) | 恒 stack 1 | ❌ | — |
| B14 | 渔夫任务链 | **游戏内每黎明**换(Main.cs:64852)——任务书"现实日期"有误;四段奖励+里程碑全 1:1 | Game.ts:1765/2931/8696-8714/8718/8759 | ✅ | 运行时链路完整数值 1:1 |
| B16 | **岩浆钓三断** | CanFishInLava={2422}+三源 accLavaFishing;原版浮标入浆**不销毁** | ①vi_2422 物品不存在→热线钓钩不可用;②lavaFishing 死字段;③**浮标入浆即毁(自创)** | ❌ | **岩浆钓整链不可玩**,+480 档不可达 |
| B17 | 松露虫→猪鲨 | 海洋开窗收竿→公爵370(Projectile.cs:19213) | 无 2673 处理 | ❌ | 物品也不在库 |
| B19 | 声呐药水 | 咬中弹名+音效(P:19340) | sonarLabel **无任何调用方**;药水 2355 不在库 | ❌ | — |
| B20 | 断线 | 收竿 1/7 断线,高测试鱼线/钓具袋/防熔袋免疫(P:51600) | 无断线;accFishingLine 未实现 | ❌ | 永不断线 |
| B21 | 玩家浸水门 | 玩家 wet 且浮标低于玩家中心→本轮失败(P:19191) | 无此门 | ❌ | 站水里也能钓 |
| B22 | 浮标离水寿命 | 落地不入水**常驻**直至收竿/远离900px(AI_061:50845);初速按竿 9-17 | 600t 自毁(自创)+恒 9 | 🔀 | — |
| B24 | **Crates 开箱** | OpenFishingCrate 全表+背包右键触发;内容开箱时滚 | 全仓无开箱逻辑 | ❌ | 箱子只能当摆设 |
| B25 | Chum Bucket | 池内 +11/+6/+3(Projectile.cs:19231) | 恒 0 | ❌ | 投射物未实装 |
| B26 | **物品可用性断层** | 钓鱼需竿+饵+药水+128 渔获 | items.ts:钓竿仅 vi_2292 一个、**鱼饵 0 个**、药水 0、渔获 2/128 在库 | ❌ | **正常玩法无法抛竿**;作弊抛竿 98% 渔获落空 |

📄 wiki 勘误:Fishing.md:147 atmo 公式用了 maxY(应为浮标 Y 与 worldSurface,过时残句);"渔夫任务按现实日期刷新"——源码是游戏内黎明;Pumps"四格"系 2×2 笼统说法不冲突。

✅12 项含:水岩浆交互逐行 1:1/产物表(脆蜜块230/蜂蜜块229/以太块659)/蒸发/流动三档/排水泵/渔力公式主体(乘区/时段/月相/湖量/幸运)/渔获规则表 158 条/咬钩时序窗口/血月钓鱼(1/6+鹦鹉螺)/箱分档/任务链。

**最需修复 TOP 7**:①**物品可用性断层**(饵 0/竿 1/渔获 2/128/药水 0——钓鱼链不可达,其余修复无验证路径);②**岩浆钓三断**(删自创入浆即毁+接 accLavaFishing+2422 入库);③饵表(2676=50/补 2674/修 2001);④Crates 开箱全表;⑤收竿特例族一次补齐(断线/rare<0 不耗/松露虫/堆叠);⑥声呐 UI+装备渔力五源+chum bucket;⑦两小门(微光同型邻格/浸水门/浮标常驻)。

---

### 域:掉落与拾取系统——已审计

> 规则数据层(vanilla-npcdrops.json ↔ ItemDropDatabase.cs)**零偏差**(626 条逐条对账,16 组 boss 样本逐 item 核);运行时语义层已 1:1。缺口全部集中在**求值频次**与**掉落物实体物理/拾取**两侧。

### 差异清单(32 项:✅16/⚠️8/❌12/🔀2/📄1,仅列非 ✅/高价值项)

| # | 机制项 | 原版设定(源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 2 | **世吞怪每节掉落** | 每节死亡各跑一次 NPCLoot(NPC.cs:78984→DropEoWLoot);wiki 暗影鳞 0-134/魔金矿 20-395;每节心 25% | Enemy.ts:4262-4265 蠕虫链一并置死,仅一节求值 | ❌ | **掉落量被压到 1/N**,肉前进度严重卡壳(P0) |
| 3 | **敌怪专属心 switch** | 16 类(NPC.cs:79899-79995:克脑仆从50%/世吞节段25%/南瓜月怪25%/事件boss 6-11颗…) | 仅移植 DropCommonLifeAndMana | ❌ | 事件 boss 战后不再落 6-11 颗心 |
| 4 | **Boss 宝藏袋开启** | OpenBossBag 覆盖 17 种(Player.cs:7077+) | 仅世纪之花袋 3328(Game.ts:4443-4475) | ❌ | **专家袋可掉不可开**→武器/宠物/纪念品整层不可得(P0) |
| 5 | 掉落物重力/落速 | 重力 0.1、maxFall 7(WorldItem.cs:418);vx*=0.95 且<0.1 归零 | GRAVITY=0.36 全局复用、mf=9.5、vx*=0.96 无归零 | ⚠️ | 重力 2.5 倍/落速+35% |
| 6 | 掉落物液体物理 | 水 0.08/5、蜜 0.05/3+湿速阻尼(:433-450) | 仅微光分支 | ❌ | 水中/蜂蜜全速下沉 |
| 7 | **岩浆烧毁掉落物** | rarity 0/-1 入浆即毁,钱币免疫(CheckLavaDeath :576) | 无分支 | ❌ | **岩浆杀的怪爆的战利品永久滞留岩浆**(「死因影响掉落」核心缺失) |
| 9 | 消失计时 | **1.4.5.6 无物品老化定时**(📄 任务书"3分钟"不实),仅 400 槽回收+紧急堆叠 | 10 分钟整批消失+shift() 删最旧 | 🔀 | 原版永存随存档持久 |
| 10 | **地面合并堆叠** | TryCombiningIntoNearbyItems:30px 同型并堆(:249-278) | 无任何合并 | ❌ | 同类永不合并(世吞 30+ 摞矿/塔碎片 12-20 摞),实体膨胀 |
| 11 | 掉落初速 | 859/4743 归零速;520/521/星云 vy∈[-3,3](Item.cs:49325) | 仅基础分布 | ⚠️ | 特例缺 |
| 12 | 拾取延迟 | NPC 掉落即刻可拾;仅玩家丢物 noGrabDelay=100 | 全物品统一 25 tick | ⚠️ | 战利品被人为延迟 0.4s |
| 13 | 磁力范围 | 宝藏+150/金戒指钱币+350/心+250/星+300(Player.cs:34680) | +94/+12(不限钱币)/+60/+80 | ⚠️ | 四项任意缩水;金戒指错误作用于所有物品 |
| 15 | 心星变体 | 1734/1867/1735/1868 碰触语义 | 仅 58/184 标记 | ⚠️ | 糖果变体会错进背包 |
| 18 | extraValue 复仇钱币 | CoinLossRevengeSystem(NPC.cs:80473) | 无 | ❌ | 死亡丢币击杀返还机制缺 |
| 19 | 钱币自动换算 | DoCoins 任意未满堆并递归 | 固定单格近似 | ⚠️ | 150 铜先转 100 剩 50 掉回地面 |
| 20 | 专家敌怪捡币 | GetPickedUpByMonsters_Money(:570) | 无 | ❌ | 风味机制缺 |
| 21 | EoC+WoF 同日獾帽 | :79804-79816 | 未实现 | ❌ | 彩蛋缺(主链✅) |
| 28 | 摇树战利品 | Main.trees 整子系统 | 无(仅 dummyShake 演出) | ❌ | 整链缺失 |
| 29 | 礼袋/礼盒开启 | 使用后掉时装 | 掉落✅开启❌ | ❌ | 可掉不可开 |
| 31 | 掉落物碰撞盒 | 16×16 | 12×12 | ⚠️ | 偏小 |

✅16 项含:16 组 boss 掉落表逐 item 对齐/钱币管线 1:1(luck 双掷/8 段乘子/贪心拆币)/难度倍率曲线一致/大师 relic+pet 双掉/月总十选二/宝箱怪族含彩蛋池/条件掉落全链/四塔碎片 DropOneByOne/雕像产怪门/专家大师规则族。

📄 勘误:任务书"3 分钟消失"1.4.5.6 源码不存在。

**最需修复 TOP 6**:①**世吞每节掉落**(P0,肉前两大材料量级);②**17 种宝藏袋开启**(P0,专家内容整层不可达);③16 类专属心 switch(P1 低风险高体感);④掉落物物理常量包(0.1/7/水蜜档/0.95 摩擦/16×16);⑤岩浆烧毁+30px 合并堆叠(同批);⑥磁吸数值(150/350/250/300,金戒指限钱币)+noGrabDelay=100。低优:复仇钱币/敌怪捡币/獾帽/摇树/礼袋开启/400 槽紧急堆叠。

---

### 域:受伤结算与闪避护盾——已审计

> 源码基准:Player.cs Hurt :37589-37958、NPC.StrikeNPC :81962-82327。

### 差异清单(51 项:✅22/⚠️10/❌14/🔀4/📄1,仅列非 ✅/高价值项)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 2 | 伤害恰为 1 时无敌帧减半 | `num2==1 → longInvince?40:20`(P:37779) | 恒 40/80 | ❌ | — |
| 5 | **伤害来源分组冷却** | 6 组 ImmunityCooldownID(General/TileContact/BossNoCheese/Lava/PaladinsShield…) | Player.ts:1849 单一 iframes | 🔀 | 岩浆/尖刺/敌接触共用一个无敌槽互相"挡刀" |
| 7 | **闪避成功授予无敌** | `iframes=longInvince?120:80`(P:37501) | 闪避仅 return false 不设帧 | ❌ | **闪避后 0 帧窗口**,黑带实际收益远低于原版 |
| 8 | 混淆之脑闪避 | 1/6 真闪避+buff321(P:37620) | 仅 retaliate 脉冲(且原版 retaliate 是确定性触发非掷骰) | 🔀 | 闪避半边缺失 |
| 9 | Holy Protection | shadowDodge 恒闪避+1800t CD(P:37628) | 无 | ❌ | 月耀套奖励未实装 |
| 10 | 不可闪避源 | dodgeable=false 豁免(守卫/愤怒骷髅王等) | 闪避对一切来源生效 | ❌ | — |
| 11 | **玩家受伤防御系数** | f=0.5/0.75/1.0(Main.cs:65646-65657) | 恒 `dmg-def*0.5` | ❌ | **专家/大师承伤系统性偏低**(50 防时专家差 12.5/大师差 25/击),数值侧最大缺口 |
| 12 | 结算取整 | double 链 (int) 截断,末尾 <1→1 | Math.round | ⚠️ | 半值 ±1 HP |
| 14 | 耐久×甲虫乘区 | `(1-endurance)(1-beetle)` 两次独立乘 | 合并加法 `(1-a-b)` | ⚠️ | orbs≥3 差 ~1% |
| 15 | 日耀耀斑反击减伤 | ConsumeSolarFlare ×0.8 | 无 | ❌ | — |
| 16 | Paladin's Shield 分担 | 25% 转 800px 内队友(P:37727) | 无(联机域缺) | ❌ | — |
| 18 | 恐慌项链 | 480t=8s(1.4.1 起)+移速+**100%**(P:9812) | 300t/+50% | ⚠️ | **用了 1.4.0 旧值**,双偏 |
| 19 | **击退速度** | vx=4.5·dir, vy=**−3.5**(P:37913) | 3.4/−3 | ⚠️ | 双低 |
| 21 | 击退免疫清单 | +Paladin 938/Frozen 3997/Hero 3998+钩爪挂壁 | 缺三件+**挂壁免击退未实装** | ⚠️ | — |
| 22 | 矿车免击退 | `!mount.Cart` 门 | 无 | ❌ | 骑矿车仍被击退 |
| 23/24/25 | 受伤反馈 | dust=伤害/血量×100/音效分档 1-20/immuneAlpha ±50 往返 50↔205 | 无 dust/程序化单音效/硬切 alpha 0.45 | ⚠️ | 视觉近似 |
| 31 | **重生等待** | 600t=10s,专家×1.5,boss 邻近+600(:38384) | **180t=3s** | ⚠️ | 惩罚感 1/3 |
| 32 | 重生无敌 | 180t+immuneNoBlink | 90t 且仍闪烁 | ⚠️ | — |
| 33 | 敌怪受击反馈 | HitEffect 尘/肢体+HitSound(无周期白闪) | `iframes%4<2 → brightness(2.5)` | 🔀 | 周期白闪替代(登记) |
| 34 | **敌怪受击免疫模型** | **无全局免疫**;穿透弹按玩家槽 immune[owner]=10;**单发穿透弹(maxPenetrate==1)豁免检查且不设免疫**(P:11903/13164) | Enemy.ts:4207 全局 iframes=8 | 🔀 | **随从+武器同帧只吃一发——多源命中频率被压低**(与弹药域 #21 同根,全远程最大失真) |
| 35 | 穿透弹连击 | 同弹同敌免疫过期可再中;时长按弹型 1-8 覆写(:13032) | hitSet 终身一次 | ⚠️ | 高穿透弹无法二跳 |
| 36 | **敌怪击退公式** | kb×resist→8/10/12/14/16 上限链→crit×1.4→诅咒狱火×1.1→轻重分流+垂直 0.75(NPC.cs:82143) | `vx+=kbx*(1-resist)` 预乘 0.65 | 🔀 | 缺上限链/crit 加成/轻重分流/垂直系数 |
| 38 | **StatusFromNPC 整表** | ~40 条接触附状态(P:22058-22371) | 仅狼人(155)→Weak 一条(且 155=Wolf 是移植错) | ❌ | 专家档"接触即附毒/诅咒狱火"全缺 |
| 39 | 敌弹附状态 | 30+ 弹型(P:11450+) | 仅 3 型 | ⚠️ | — |
| 41 | 弹幕→敌怪 debuff | StatusNPC 全表 | 表 1:1 但 SUPPORTED 白名单仅 7,**Enemy 侧缺 15 个 buff 字段** | ⚠️ | 命中静默跳过 |
| 42 | **NPC debuff 免疫表** | DebuffImmunitySets+派生(NPC.cs:17753) | 仅 shimmer 353 一处 | ❌ | 骨架/首领免疫全缺(不死族可中毒) |
| 43 | boss 状态时长减半 | **1.4.5.6 源码无此规则**(AddBuff 无 boss 分支) | — | 📄 | 清单前提不成立,勿按"减半"实现 |
| 45 | Turtle 反伤 | turtleThorns→**2×**(P:30915) | 无 | ❌ | 海龟套反伤按 1×(减半) |
| 46 | 仙人掌反伤 | 15/专家30/大师45(:30945) | 无 | ❌ | — |
| 47 | 格挡反击 | 2×+kb5+自身免伤(:30918) | 无 | ❌ | — |
| 48 | **Ankh Shield 免疫清单** | noKnockback+fireWalk+**11 个 buffImmune**(P:15003) | 仅 {fireWalk,noKnockback};**整个 Player.buffImmune 体系未建模** | ❌ | 885-893/901-904/3781/5354/1921 十件免疫配饰全缺;Ankh 盾=纯装饰 |

✅22 项含:默认 40t/Cross Necklace×2 不叠/Black Belt 1/10 不叠/魔力手铐/击退方向/Cobalt+Obsidian+Ankh+Gladiator 击退免疫/死亡判定/软核掉钱三档(按世界难度)/中硬核/荆棘药水(上限1000+DamageVar)/Arctic Diving Gear/吸血上限 80/70+月噬门/浸剂表/受伤不打断动作/无屏闪。

**最需修复 TOP 8**:①**防御难度系数**(0.5/0.75/1.0,影响所有伤害来源);②**闪避链三件套**(闪避授帧 80/120+BoC 真闪避+Holy Protection);③**敌怪受击免疫模型**(per-owner 槽+maxPenetrate==1 豁免——多源命中频率);④**玩家 buffImmune 体系**(Ankh 全系+十件配饰);⑤ImmunityCooldownID 至少拆 3 组;⑥反伤族补全(Turtle×2/仙人掌/格挡);⑦StatusFromNPC/StatusPlayer 两表;⑧重生链数值(600t/专家×1.5/180t 免闪)+恐慌项链 480t/+100%。

---

### 域:召唤师与护甲穿透——已审计

### 差异清单(35 项:✅22/⚠️8/❌4/🔀4/📄2,仅列非 ✅/高价值项)

| # | 机制项 | 原版设定(wiki+源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 4 | **OOA 四配饰布尔化** | dd2Accessory **只给一次**:+1 哨兵/+10% 召唤伤(P:12571) | 每件累加(vanillaSummonStats.ts:22-25) | ⚠️ | 四件全戴:+4/+40%,原版 **+1/+10%** |
| 5 | **DD2 头盔哨兵位** | T1 四盔各+1;T3 四盔各 **+2**(P:12711-12808) | SUMMON_GEAR 无此 8 条 | ❌ | T3 +2 完全缺失 |
| 6 | **DD2 套装哨兵位** | 8 组套装各 maxTurrets++(P:16111);上限最高 6 | SUMMON_SET 无 DD2 键 | ❌ | 哨兵上限 ~3 vs 原版 6 |
| 11 | **鞭攻速公式** | `1/(meleeSpeed基+swb)` 且 wutm 乘时长(P:4266,28555) | `min(3,1+swb×whipSpd)`(Game.ts:4803) | ⚠️ | ①meleeSpeed 项缺(wiki 明示鞭吃近战速度);②Obsidian 原版 1.5525× 实现 1.304× |
| 15 | 鞭敌方 debuff | 913→地狱火323/912→霜燃324/914→1/5中毒/1033→362/849→310(:11067) | 地狱火/霜燃用 onFire 4s 近似;**1033/849 未实装** | ⚠️ | — |
| 18 | NPC 侧 pen 附加 | ichor+15/brokenArmor+20/betsysCurse+40 进 pen(NPC.cs:81919) | 仅 ichor 硬编码 +7 | ⚠️ | 低防怪偏差;两条 ❌缺失 |
| 19 | **闪电光环 100% 穿甲** | 688/690 armorPenetrationPercent=1(Projectile.cs:12443) | 自标"登记未实装" | ❌ | 命中走 hurt 无 pen 参 |
| 22 | **随从击退** | `item.kb+minionKB` 无减半(P:52477) | `kb×0.5+mkb`(MinionProj.ts:638) | ⚠️ | 武器击退被无故减半 |
| 23 | **视觉之杖双子** | 387/388 各 **0.5 槽**,一对=1 槽(Projectile.cs:4428) | 387 单体占 1 槽(MinionProj.ts:72) | 🔀 | 数量与槽账均偏 |
| 24 | **星尘龙段落槽** | 626/627 各 **0.5** 槽,龙长 N 次=N 槽(:6450) | 段落 0 槽 | ⚠️ | **可无限免费延长**,破坏召唤经济 |
| 26 | 驱逐规则 | 按 minionSlots 升序最便宜先,永不牺牲重链族(:50954) | `minions[0]` 最旧先(Game.ts:4725) | 🔀 | 牺牲序不同 |
| 29 | DD2 哨兵以太 mana | 事件内需 10 Etherian Mana | 无消耗/事件门禁 | ❌ | 奖章掉落已有,mana 链缺 |
| 31 | 随从闲置排布 | 逐 AI 差异+live minionPos 索引 | slot×90° 环形通用近似 | 🔀 | (自认) |
| 32 | 随从射击弹 debuff | StatusNPC 表驱动 | 表✅;**309 冰九头蛇霜燃落 GAP 清单**静默跳过 | ⚠️ | — |
| 33 | 固定 AP 武器 | — | — | 📄 | **1.4.5.6 无任何原版武器带固定护穿**(Item.armorPenetration 仅前缀供给,恒 0);清单前提不成立 |
| 34 | 同种重召刷新满血 | 随从为无敌投射物**无生命值** | — | 📄 | 实际语义=驱逐序+龙延长 |
| 35 | **全系增伤盔甲含召唤** | GrantArmorBenefits 四系并列(792-794 等 ~20 条,P:12953-13245) | dmgAll 只加 melee/ranged/magic 且 accfx 仅扫配饰槽(Player.ts:336,307) | ⚠️ | **盔甲的全系增伤(含 minionDamage)整链缺失**——召唤侧少一档增伤 |

✅22 项含:maxMinions 链(基础1+药水+魅惑+装备)/SUMMON_GEAR 30/30 逐条对账/SUMMON_SET 8 套/鞭 tag 数值表 19/19+暴击 5/5+时长结算/鞭三表(射程/段数/衰减)18 项/攻速 buff 链/proc 四件/命中附属召唤/护甲穿透公式代数等价+四系分道/Sharpened +12 仅近战/随从不会心/live 重算/驱逐剔除时机/哨兵上限+10min 寿命/守护者逐项 1:1/龙延长伤害缩放。

**最需修复 TOP 6**:①**OOA 配饰布尔化**(哨兵虚高+3、召唤伤虚高+30%);②DD2 头盔/套装哨兵位补表(8+8,上限 3→6 关键);③**星尘龙 626/627 补 0.5 槽**(无限免费延长);④鞭攻速两修(meleeSpeed 项+Obsidian wutm);⑤视觉之杖 0.5+0.5 成对;⑥随从击退 ×0.5 撤除。另:全系增伤盔甲链(#35,联动盔甲域)。

---

### 域:地形危害与回家物品——已审计

### 核对表(36 项:✅13/⚠️14/❌9/❓1,仅列非 ✅)

| # | 项目 | wiki/源码数值 | 实现(file:line) | 状态 | 备注 |
|---|---|---|---|---|---|
| 3 | **专家/大师防御系数** | 经典 D−0.5防/专家 0.75/大师 1.0(Main.cs CalculateDamagePlayersTake) | 恒 0.5(Player.ts:1856) | ⚠️ | 与再生/受击域同根(三域重复发现) |
| 4 | 接触伤害±15%浮动 | DamageVar(num, −luck)(Player.cs:28510) | 固定值(Player.ts:1911-1917) | ⚠️ | 无浮动无幸运 |
| 5 | 流血 debuff 难度时长 | 600-1200t ×2/×2.5 | 固定 | ⚠️ | 与 buff 域 D2 同根 |
| 6 | 接触伤害独立无敌槽 | ImmunityCooldownID.TileContactDamage | 共享 iframes(注释自认) | ⚠️ | 与受击域 #5 同根 |
| 8 | 岩浆着火时长 | 7/14/17.5s ×难度 | 恒 7s | ⚠️ | — |
| 9 | **Lava Charm 906** | 7s 免疫+叠加上限 49s(P:14631) | 机制在但 `lavaMax` **无任何物品赋值→恒 0**;vi_906 只是桩 | ❌ | — |
| 10 | Lava Waders 908 | 液面行走/免 Burning/7s/80→35 | 无条目 | ❌ | — |
| 11 | Obsidian Rose 1323 | 80→35、着火减半(P:27385) | 无 lavaRose 分支 | ❌ | — |
| 12 | Obsidian Skin 药水 | buff 逻辑 1:1 ✅ | **无授予入口**(vi_288 无药水数据) | ⚠️ | 死 buff |
| 13 | 灰烬木套岩浆减半 | num81/=2(P:27376) | 无 | ❌ | — |
| 14 | **仙人掌误伤** | **普通世界不造成接触伤害**(仅 The Constant;Collision.cs:3226) | TouchDamage.ts:44-49 恒判可伤 6 点 | ❌ | **文件头注释与代码自相矛盾**;加种子门禁即可 |
| 18 | CanExploteTile 边缘 | 48/232 仅 ftw 防爆;硬模式矿含 **222** | 缺 ftw 规则;缺 222(与工具域 #24 同根) | ⚠️ | — |
| 19/20 | **炸弹/炸药引信悬案** | wiki 3s/5s | 150t(2.5s)/135t(2.25s) | ⚠️/❓ | **1456 反编译查无出处**(SetDefaults 不设 timeLeft);注释声称取自源码不成立——需复核锚点 |
| 21 | **爆炸实体伤害盒** | PrepareBombToBlow:炸弹 **128×128** dmg100 kb8、炸药棍 **250×250** dmg250(Projectile.cs:44125) | 炸弹 hurtBox=**11**、炸药=100(Game.ts:4729) | ❌ | **炸弹 AoE 只有 11px 几乎炸不到实体**;注释引用的 Resize(22,22) 是 Kill 还原图非伤害盒 |
| 22 | Explosives(141) | 对玩家 1000/2000/3000(×2×难度);对敌 500 | 恒 500 无 ×2 | ❌ | 与 #31 同根 |
| 24 | Magic Mirror(50)/回忆药水 | useTime 90、延迟 45t | 仅物品桩 | ❌ | — |
| 25 | Cell Phone(3124) | useTime 90 | 仅物品桩 | ❌ | — |
| 26 | Rod of Discord(1326) | useTime 20、Chaos 6s、期内再用扣 maxHP 1/7 | 物品不存在、chaos 零命中 | ❌ | — |
| 27 | 床设重生点 | 有效卧室校验+**二按取消**(CheckSpawn/ChangeSpawn/RemoveSpawn) | 右键直接写 spawn+toast(Game.ts:6328) | ⚠️ | 无校验无取消 |
| 28 | 床被拆回退 | CheckSpawn 失败即回退(P:28437) | 无回退逻辑 | ❌ | 重生点悬空留原床位 |
| 30-32 | **飞镖/超镖/烈焰机关** | 对玩家再 ×2(P:13776)+Poisoned 600t/900t/Hellfire 1200t | 只乘难度曲线;**debuff 全无授予** | ⚠️ | 经典下 20→应 40 |
| 33 | 毒镖机关 kind5 | dmg30 速12+Venom 300t | kind 门禁仅 0/1/2→静默无效 | ❌ | 与电路域 #27 同根 |
| 35 | 尖刺球定向分支 | 1456 生效路径 frameX 定向 | 取 legacy 纯下抛语义 | ✅/❓ | 数值全对;定向选用留档确认 |

✅13 项含:地刺 60/木刺 80 全难度/岩浆 80/窒息 20HP/s+方块族/爆炸半径主族/手雷不破地形/重生回床+岩浆免疫重置/长矛机关数值/毒镖表项。

**最需修复 TOP 8**:①**爆炸伤害盒错源**(PrepareBombToBlow 未移植——炸弹 11px 应 64px);②**敌弹对玩家缺全局 ×2**(Damage_EVP)——所有敌弹/机关对玩家伤害减半;③岩浆饰品链整体未接(906/908/1323/3999/4003/4004/4038/5000);④仙人掌误伤(种子门禁);⑤床重生三缺口;⑥回家/传送物品全桩+RoD;⑦机关 debuff 族+毒镖 kind5;⑧难度乘区两处系统性缺失(防御系数+debuff 时长)。❓ 悬案:引信 150/135t 源码查无出处需复核。

---

### 域:物品使用主链——已审计(补漏轮)

> 基准锚点:ApplyItemTime P:4216 / ApplyItemAnimation P:4255-4283 / CapAttackSpeeds P:28555 / 重启门 P:42144(只看 itemAnimation)。

### 差异清单(22 项:✅9/⚠️6/❌3/🔀4,仅列非 ✅)

| # | 机制项 | 原版设定(源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 3 | **挥击重启门** | 新一挥只看 `itemAnimation==0`(P:42144);itemTime 只门禁"生效" | `useTime===0 && …`(Game.ts:4074) | 🔀 | **itemTime 被当成重启门**:实测 303 件近战中 **111 件 useTime<useAnimation**(挥击被截短,快 1.4-2×)、**7 件 useTime>useAnimation**(叶绿巨剑/军刀慢 2.1×)——双向失真 |
| 5 | **reuseDelay** | 动画归零后 `itemTime=reuseDelay`(P:42022/51969);发条步枪 4/12/**14** | 数据侧 2612 条 **0 条含 reuseDelay 字段**+逻辑缺 | ❌ | 连发枪族射速可达原版 2-3× |
| 7 | 发射时机 | 首发起始帧,此后每 useTime 一发,与动画无关 | 节拍✅;每发重启动画(useSwing) | ✅/🔀 | 仅影响 useTime≠useAnimation 的连发枪 |
| 8 | **melee+shoot 剑族** | 两族:useTime 驱动族(叶绿巨剑 45t 一弹)/shootsEveryUse 族(每挥一弹,需数据位) | **每次挥击必射一弹**(Game.ts:4086) | 🔀 | 989/1226 弹幕频率×2.2;shootsEveryUse 位未提取 |
| 9 | BonusMeleeSpeedMultiplier | 每武器乘区(Terra Blade 0.75/拳刃 0.5/恶臭爪 0.25/变态刀 0.33)(P:25620) | 缺(变态刀只做潜行增伤) | ⚠️ | — |
| 10 | **挖掘冷却误乘 meleeSpeed** | useTime 不吃 meleeSpeed(P:4216);挖掘=useTime×pickSpeed(P:45163) | `useTime/attackSpeedMult`(Game.ts:5211) | ⚠️ | 猛爪/食物错误加速挖矿(与工具域 #14 同根) |
| 11 | pickSpeed/tileSpeed 分立 | 两条独立 stat(挖掘/放置分用) | `tileSpeed‖Mining?0.75` 合并档(Game.ts:5207-5211) | 🔀 | 砌砖刀/水泥搅拌机错误加速挖矿 |
| 12 | 鞭攻速链 | floor(anim/(1+**meleeSpeed**+swb)×wutm)(P:4266) | 缺 meleeSpeed 项(与召唤域 #11 同根) | ⚠️ | — |
| 13 | **数字键切物品无门禁** | itemAnimation>0 禁切+selectedItemState 缓冲(P:24918) | 热键栏直写 selected(Game.ts:1363) | ❌ | 使用中按数字键即时换手持,swing/useTime 悬空 |
| 15 | **药水饮用** | useTime=17,**动画末帧才回血**(P:42189);病 CD 3600×pStone 0.75 | 点击瞬时回血+useTime=60;pStone 乘错轴(乘 buff 时长,Game.ts:4211) | 🔀/⚠️ | 三重偏(与再生域 #29 同根) |
| 17 | 放置节奏 | 方块基 10×tileSpeed;墙基 10×wallSpeed(0.8 档) | 方块固定 14(无乘区);墙 15×0.75 | ⚠️ | 方块 1.4× 慢 |
| 18 | 挥舞判定窗口 | 全窗判伤+32×32 三段扩展+每挥每怪去重+attackCD=animMax×0.33(1457 P:44784;衰减 :24904-24911) | **已建模态(2026-08-31 对齐批清账)**:attackCD=meleeAttackCd(updateSwingHits 每帧递减+无挥击清零、新起手重置=ItemCheck_StartActualUse :52312-52313 同构)+受理命中尾写面 :44779/:44784 双写——实现锚 src/core/Game.ts updateSwingHits/updateMeleeHits(critter/town/enemy/PvP 四循环同挂);回归 tests/melee-alignment-batch(meleeNpcCd/meleeAttackCd 三桶门与衰减门)、tests/melee-los-gate(同帧 attackCD 拒收) | ✅ | 已清 |
| 21 | 设置项 Autofire | autoReuseAllWeapons | 未实装 | ❌ | — |
| 22 | 力量手套族 | melee+**summon-scaling** 都补 autoReuse(P:52041) | 只 melee 分支 | ⚠️ | 鞭原生 autoReuse,影响小 |

✅9 项含:动画时长公式(floor+倒数封顶3)/itemTime 裸值(注释记录修正史)/autoReuse 跳帧 t≤1 等价原版 −1/autoReuse+手动连发语义/使用中移动不锁/耐药性机制/通道类三点/挥舞命中盒与去重 1:1。

**最需修复 TOP 8**:①**reuseDelay 数据+逻辑双缺**(提取器+三行逻辑);②**挥击重启门错用 useTime**(去掉 `useTime===0` 单看 swingOver——118 件武器双向失真);③挖掘冷却去 attackSpeedMult+拆 pickSpeed/tileSpeed;④melee+shoot 两族区分(shootsEveryUse 数据位);⑤药水 17t 末帧回血+pStone 挪轴;⑥数字键切物品门禁;⑦放置节奏(14→10×tileSpeed);⑧BonusMeleeSpeedMultiplier 数据位。

---

### 域:困难模式推进链——已审计(补漏轮)

### 差异清单(25 项:✅14/⚠️7/❌3/🔀3,仅列非 ✅)

| # | 机制项 | 原版设定(源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 4 | 祭坛电击伤害 | Hurt(**当前**HP/2)(Player.cs:45059) | `p.maxHp` 半(Game.ts:5104) | ⚠️ | **残血玩家被原版打 20 血时本仓打 200,可致死** |
| 5 | 砸碎所需击数 | 锤力积累≥100 才碎(P:45033):Pwnhammer 80 需 **2 击** | ≥80 一击即碎 | 🔀 | — |
| 7 | 矿量公式脉数 | 循环 `k<num3`(double)=**ceil** | Math.floor | ⚠️ | 平均少 1 脉 |
| 9 | OreRunner 双掷 | 频率/步长两次独立 Next(5,10) | 单掷复用 | ⚠️ | — |
| 12 | **机械召唤物消耗** | SummonItemCheck:失败**不消耗**(P:41514) | 召唤失败仍消耗(Game.ts:4484) | ⚠️ | 与同文件 70/1331/560"成功才扣"自相矛盾 |
| 14 | 保底花苞触发 | 仅首胜边沿(NPC.cs:79578) | 无边沿 | ⚠️ | 重杀三王重复 burst 补苞 |
| 15 | **花苞持续生成半区** | **地下半区** grassGrowth case 60(WorldGen.cs:74471,**flag 作用域 :74429 证实**) | 写在**地表半区**(WorldEvolution.ts:712-732) | 🔀 | **位置错档:灯泡/生命果只在地表丛林刷出,地下丛林永不生成**;注释引 cs:74821 自证误读(该段无 238/236) |
| 16 | 生命果再生 | 地下半区,classic 1/40/expert 1/30,间距 60(50) | 恒 1/30 间距 60;命中灯泡压制生命果(原版串行尝试) | ⚠️ | — |
| 18 | 灯笼夜首胜边沿 | 仅首杀(NPC.cs:79560) | 无条件置位(LanternNight.ts:112) | ⚠️ | 重杀任意 Boss 都预约灯笼夜 |
| 19 | **神庙门锁+神庙钥匙** | 锁门 frameY 594-646(IsLockedDoor),开锁消耗 Temple Key 1141(P:32332) | 放了 style 11 门但**无锁/无钥匙消耗** | ❌ | **世花前可自由进出神庙**,推进链门禁被绕过 |
| 21 | **教徒仪式生成驱动** | CultistRitual.UpdateTime:delay 86400/碑毁 43200/教徒被杀 −3600(CultistRitual.cs:44-101)→NewNPC(437) | 下游 AI 齐全(bossAI_lunar_misc.ts:360-446)但**全仓无 437 生成点**;WldParser.ts:182 读 cultistDelay 后弃用 | ❌ | **推进链断点**(与事件域 #46 交叉确认):石巨人后仪式永不出现,四塔/月总全成死代码。修复面小:delay/recheck+TrySpawning+三常量 |
| 25 | 环境改造枪+溶液 | Clentaminator(WorldGen.cs:71552 蔓延抑制链) | 物品不在库 | ⚠️ | 蔓延采样骨架✅/净化粉✅;改造枪缺 |

✅14 项含:hardmode 置位全链(V 形转化 GERunner/魔金砖盒/公告/成就/灯笼19)/砸祭坛主参数(锤门/轮换%3/矿量公式/世界锁定/深度带/幽灵 1-2/公告成就持久化无上限)/机械三王映射+自然 roll 1/10/花苞破坏召世花/石巨人三门+消耗+音效/教徒→四塔/日食海盗解锁 roll/怪池切换点/蔓延采样 3e-5。

📄 勘误:任务清单"砸祭坛需梦魇/死亡代言人+"不确——那是镐;锤侧标杆是 Pwnhammer(80);wiki Altars.md 内部 Wraith 单复数不一致(源码 1-2)。

**最需修复 TOP 6**:①**教徒仪式生成驱动**(石巨人后推进链整体不可达,修复面小且 cultistDelay 已读档);②**花苞/生命果生成半区错档**(移入地下 case 60——否则世花链只靠首杀保底单株);③神庙门锁+钥匙 1141;④祭坛电击改当前血量;⑤机械召唤物"成功才扣";⑥灯笼夜首胜边沿。轻微:脉数 ceil/双掷分离/串行尝试链/tile 702。

---

### 域:光标与方块交互——已审计(补漏轮)

> 总体:SmartCursor.ts/SmartSelect.ts 是全仓完成度最高的两个子系统(策略链/状态机/射线算法 1:1 且注释带反编译行号);欠账集中在**射程加成链的数据建模**(tb 单值化吞掉 X/Y 非对称与放置/全交互两档)与**放置端 TileObjectData 锚点/重叠语义**,以及 H/J/B 快捷键整族。

### 差异清单(30 项:✅14/⚠️6/❌6/🔀4,仅列非 ✅)

| # | 机制项 | 原版设定(源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 2 | 射程配饰轴向 | Extendo Grip 族:`tileRangeX+=3 且 Y+=2`(P:12617) | tb 单值同时加 X/Y(Game.ts:1203 等) | ⚠️ | Y 轴 +3(应 +2)垂直多 1 格 |
| 3 | **挖掘不吃射程配饰** | 配饰 +3/+2 对挖掘生效(P:44989) | tryMine tb=0+硬编码 5/3(Game.ts:5094) | ❌ | 挖掘水平少 3/垂直少 2 |
| 4 | 工具腰带 407 | blockRange++ 仅放置(P:14875) | 物品在库,accfx 无键 | ❌ | 放置射程恒少 1 |
| 5 | 工具箱 1923 | tileRangeX/Y++ 全交互(P:14405) | 同上 | ❌ | 全交互少 1 |
| 6 | 建筑工药水 | +1 仅放置;右键交互/上车为 Simple 无 TB(P:30576/5798) | 并进 tb 泄漏到右键与 QuickMinecart(Game.ts:6291/1203) | ⚠️ | — |
| 8 | 旅程远距放置 | tileRange×2+8/8(P:18638) | 无 | ❌ | — |
| 10 | 智能光标默认值 | SmartBlocksEnabled 等默认 **false**(Main.cs:4438) | Options.ts:32-33 默认 true | ⚠️ | 原版新档默认不能铺线 |
| 13 | 智能光标搜索区 TB | `item.tileBoost+…`(SmartCursorHelper.cs:95) | 未加 tileBoost(Game.ts:3816) | ⚠️ | 扳手族 +20→远端导线无法智能吸附 |
| 14 | 油漆三策略 | SmartCursorHelper.cs:668 | 显式 no-op(油漆系统未建) | ❌ | — |
| 15 | **多格放置锚点** | TileObjectData.Origin:Style3x2=(1,1)/宝箱(0,1)/门三备选(TileObjectData.cs:3164+) | 一律左上锚(Game.ts:6049) | 🔀 | **3×2 家具整体偏右下 1 格、2×2 偏下 1 格**(门不偏) |
| 16 | 放置重叠拒绝 | 仅拒 active∧!tileCut∧!BreakableWhenPlacing(TileObject.cs:357)→**可压草/藤** | `isActive 全拒`(Game.ts:6053) | 🔀 | 家具放不进长草地 |
| 17 | 放置支撑检查 | 全量锚点表(AnchorTop/Bottom/Side/Wall/Alternate) | 下/上/侧任一近似(自认) | ⚠️ | — |
| 18 | 斜坡/半砖上放置 | CanPlace 内含 half/slope 处理 | 空间检查未读 slope | ❓ | 需探针验证 |
| 20-22 | **H/J/B 快捷键** | QuickHeal(最契合选品 P:5316)/QuickMana/QuickBuff | 全缺(仅魔力花施法自动喝蓝) | ❌ | — |
| 23 | R 快速坐骑 | R=QuickMount(P:5728) | R 被占为五彩扳手模式循环;矿车上车近似 | 🔀 | 键位语义冲突 |
| 25 | 光标样式 | 按 Wanted(模式开着即换)(Main.cs:44753) | 按 showing(须有目标)(Game.ts:3858) | 🔀 | 指天空时回落普通指针 |

✅14 项含:基础距离 5/3 矩形公式/智能光标状态机逐行+39 策略链+57 项让位集+黄框方向箭头/智能选取九策略全量/右键优先级链(挂物→提取机→bank→门→箱 3×3 容差→…→晶塔)/数字键热栏/连续放置辅助(含死门 1:1 保留)/中键双方皆无/联机自研保护层不冲突。

**最需修复 TOP 8**:①**多格放置锚点**(提取 TileObjectData.Origin 表——玩家可感知度最高);②Toolbelt/Toolbox 射程(纯数据层);③tb 拆 X/Y+接入挖掘路径;④放置重叠放行 tileCut(一行,修"家具放不进草地");⑤H/J/B 快捷键族(按 QuickBuff→QuickMana→QuickHeal 顺序);⑥智能光标 TB 补 tileBoost;⑦默认值改 false;⑧光标样式改按 wanted。

---

---

## 复核注记(2026-08-13 meta-review)

> 对本审计自身的一次抽查:12 条高危结论逐条开文件验证,**全部属实**;1 处域间冲突已破案;另识别 3 个覆盖面缺口(见下)。

**抽查证实清单**(全部开文件核过,非转述):
- ✅ 药水病 +80 maxHp:Buffs.ts:482 `Resistance?80:0` → Player.ts:528 `maxHp=baseMaxHp+healthBonus+lf` 确实进上限链。Buffs.ts:22 注释写"立即回 80 HP"是开发意图,但实现语义是上限+80,与原版 buff 21(无任何属性)不符,维持 P0。
- ✅ 防御系数恒 0.5:Player.ts:1959 等四处;且注释自曝根源——"移植自 Maples Player.OnAttacked"(移植自另一参考项目而非 1456 源码,解释了为何无难度分支)。
- ✅ 向日葵符号反(Housing.ts:199)、神圣召唤头键(vanillaSummonStats.ts:64-65 '24|229|*')、仙人掌无种子门禁(TouchDamage.ts:24 表内 80:6,:9 注释"恒无效"与代码自相矛盾)、基础常量(GRAVITY 0.36/MAX_FALL 9.5/WALK_MAX 2.6/JUMP 6.6+9tick)、挥击重启门(Game.ts:4095 等五处 `useTime===0`)、敌怪 iframes=8(Enemy.ts:4673/4681/4700)、UI 词缀三处丢失(pickUp/splitHalf 重建 `{id,stack}`、reforgeItem 同构、closeReforge `inv.add(id,stack)`)、制作 `times===1` 折扣条件。

**域间冲突勘误(重要)**:
- **渔夫任务链**:幸运域 E11/E12(断开)与液体钓鱼域 B14(链路完整 1:1)**都对各自时点负责**——审计期间并行会话接入了链路(Game.ts:1780 世界生成期 anglerQuestSwap + :2962 每日黎明重掷,较晚完成的液体钓鱼域核验的是接入后状态)。**以液体钓鱼域 B14 为当前事实**,幸运域 E11/E12/E12 视为已过时,勿再按其修复。
- **幸福度系统**:群系两轮审计结论"全仓无 happiness 实现/最大缺口"**已过时**——商店域复核时发现 `vanillaHappiness.ts` 已实装(25 群系偏好+103 关系+公主动态分支+clamp,Game.ts:9377/9254-9288 接线),仅缺 loveStruck×0.9。系并行会话在群系第二轮审计之后接入。以商店域 #14 为当前事实。
- **其余多域重复发现**(防御系数/敌弹×2/iframes 模型/CultistRitual 断点/晶塔获取链)经比对均互相印证、无矛盾。

**第二轮 review(时效性复检,审计归档后)**:

- **时序勘误新增 2 条**:
  - **陨石坠落链已接入**:时间域 #39"整链未移植(恒 false)"已过时——Game.ts 现有 meteorPending 读写(:7296-7299)+ dropMeteor 完整消费(:3277,含 announce 与 chunk 失效)。以"已接入"为当前事实。
  - **击退抗性链形态更新(结论仍立)**:Boss 域 TOP1 审计时 Boss 吃击退 100%;归档后 hurt 注释自曝"曾反向"并改为 `vx += kbx*resist`——但 fromVanilla 的换算(Enemy.ts:487→495 `def.knockbackResist = 1-承受比例`)未同步删除,净效果 Boss 从吃满修成**吃 89%**(应吃 0%)。修复方案不变:两端二选一改齐(推荐删 487 换算)。联机傀儡侧(:3556)按"def 存抗性"理解,若删换算需同步。
- **断链复检(7 条玩法阻断级,归档后现状)**:邪教徒自然生成❌仍断(Game.ts:2872 注释自认"真缺口")/宝藏袋开启❌仍断(仅世花 3328 一例,Game.ts:4694)/钓鱼物品断层❌仍断(items.ts 446 个 vi_ 无 2674-2676 饵)/晶塔获取❌仍断/旗帜系统❌仍断(全仓零命中)/陨石✅已接入/幸福度✅已接入(仅缺 loveStruck)。
- **补漏域关键结论抽查(第二轮新增部分)**:商店价格 null=**158 条实锤**(450 条中);DD2 音频死链实锤(public/sounds 13 个 dd2 wav 全在顶层、无 Custom/ 目录);鹿角怪 668 **null 实锤**(vanilla-npcs.json 661 条无 668);石巨人族 1405 旧值未回填维持。

**覆盖面缺口(meta-review 识别,补漏已发)**:
1. 商店货品池全表(vanilla-shopstock.json 在库,此前仅抽核动物学家一档)——各城镇 NPC 卖什么/何时卖/库存刷新/价格链消费
2. Boss 战斗本体数值(血量/防御/伤害/阶段切换/攻击模式)——此前只审了 boss 的掉落/召唤/事件,本体依赖早期移植记录未复核
3. 音效触发链(散落多域:受伤分档/制作弹字/最优重铸音效/机关音)未系统核对
4. (低优未发)染料系统、照明宠物——纯视觉/低机制含量,留待后续

---



---

### 域:商店货品池——已审计(meta-review 补漏)

> 实现链:vanilla-shopstock.json(extract-shops.mjs 从 Chest.cs SetupShop 提取)→ Game.ts shopStockFor/shopCondOk/openNpcShop。

### 差异清单(19 大条,仅列高危)

| # | 机制项 | 原版设定(源码) | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | **酒馆老板(550)整店** | case 21:4 金币货+36 勋章货(shopSpecialCurrency),T1 常驻/T2 机械后/T3 石巨人后(Chest.cs:2941-3133) | 提取器 SHOP_SLOT **漏收 550**→JSON 无键→永远无商店按钮 | ❌ | OOA 换货+双货币体系整体缺失(NPC 本体也未实装) |
| 2 | **价格表** | 新版物品 `SetShopValues(rarity,buyPrice)`(Item.cs:48200) | 提取器只匹配 `value =`;**JSON 158 条 price:null**→`??100` 兜底 | ❌ | **149 个 id 按 1 银甩卖**:公主店 5076/5077(实值 100 万)、高尔夫全店、爆破 5464(25 万)、动物学家 4701(50 万)等 |
| 3 | **传送塔通用段** | switch 后对所有 type≠19/20/21 的店追加 9 塔,门=≥2NPC∧非腐/猩,按群系择一(Chest.cs:3448-3518) | 无 pylon 分支;JSON 无 4875-4921 | ❌ | 21 店×9 塔(与群系域"晶塔获取链"交叉印证) |
| 4a | **提取器 OR→AND** | 军火商 `bloodMoon‖hardMode`(Chest.cs:1452) | cond 一律 join('&&') | 🔀 | 银子弹/不法者/电子人 773/商人 4063 六家店门全收紧 |
| 4b | **门取反** | 树妖 `!hardMode&&vampireSeed` | `has('hardMode')` 不辨 `!`→cond=hardMode | 🔀 | **门反**:普通世界原版不出,实现困难模式反而在卖 |
| 4c | **else 互斥丢失** | 树妖血月 if/else 只卖邪恶粉(:1535-1576) | else 体落 cond=null 恒真 | ❌ | 血月时两套同卖;蒸汽溶液三选一/派对昼夜/裁缝墓园等同病约 10 处 |
| 4d/4e | 部分门静默丢弃/全未映射整条丢 | HasItem/AnyNPCs/ZoneHallow 等约 60 条 | 'skip' 过滤 | ⚠️/❌ | 1985 变"任意机械"(应三全灭)、蒸汽 781 神圣溶液永不上架、巫医 2999 等约 20 条 |
| 5 | 圣诞老人循环 | `for(1873..1905)`=33 件装饰(Chest.cs:2075) | 正则只认字面量 | ❌ | 缺 33 件 |
| 6 | **油漆工第二商店** | Shop(227,25) Decor 店:12 色深漆+约 20 画作+墓园+雷暴(Chest.cs:2456) | 无第二按钮;1490 月相画错挂并入主列表且丢 !zoneGraveyard 门 | ❌+🔀 | — |
| 7 | **手写补表错挂** | 4744 猎人斗篷=裁缝(golferScore≥2000);4743=派对女孩(>500) | 错挂给动物学家/油漆工 | ❌ | 两件物品挂错 NPC |
| 8 | 动物学家重复上架 | 兽耳尾按月相只卖 2 件(:3372) | JSON 恒真+Game 再 add 全套(未剔除) | ❌ | 4767/4829 恒双份;8 套装恒全显+相位再双份 |
| 10 | 蒸汽月相溶液 | `moonPhase>=4&&hardMode`→748,否则 839-841(:2116) | 748 moonPhase 恒 false 永不上架;839-841 恒显 | ❌+双显 | — |
| 11 | 骷髅商三组缺 | 3004/8 时间窗二选一;3316/3315 相位二选一;5326 工匠面包 | 手写表无此三组 | ❌+双显 | 8 与 3003 双显;其余手写相位表✅ |
| 12 | **售出路径** | 2 出售槽+isAShopItem 当次全额回购(Chest.cs:3520) | 全仓零命中 | ❌ | "卖给 NPC"完全缺失(确认) |
| 13 | 价格链结构 | base×0.8×PriceAdjustment | 结构✅;**显示价不乘折扣**→显示≠实扣 | ⚠️ | — |
| 14 | **幸福度** | ShopHelper.ProcessMood 全链 | **已实装**(vanillaHappiness.ts:25 群系+103 关系+钳位)——**勘误见下**;缺 loveStruck×0.9 | ✅ | 与群系域结论冲突,系并行会话时序 |
| 15-18 | 库存刷新/商店 UI/downedBoss 语义/哥布林静态店 | 城镇店无随机(SetupShop 零 rand) | ✅/✅/✅/✅ | ✅ | "稀有概率售卖/哥布林月相换货"1.4.5.6 不存在(前提勘误) |

**覆盖**:23 NPC×约 500 源码条目:全对齐 7 家(哥布林/巫师/机械师/松露/高尔夫/海盗…),价格崩坏 158 条,缺失约 90 条(酒馆 40+塔 9×21+圣诞 33+油漆 Decor 20),门错误约 15 处,双显约 15 处,错挂 2 处。

**最需修复 TOP 8**:①**价格提取**(SetShopValues/sellPrice 两行正则重跑——公主店 1 银卖 100 金套装是最荒谬可见 bug);②传送塔通用段 1:1 移植;③酒馆老板 SHOP_SLOT 补 550+勋章货币;④提取器三缺陷(OR/取反/else 互斥);⑤错挂纠正+重复剔除(照树妖盆栽剔除法);⑥油漆工第二商店;⑦for 循环展开(圣诞 33+深漆 12);⑧售出路径(isAShopItem 回购)。

---



---

### 域:音效触发链——已审计(meta-review 补漏,33 项:✅13/⚠️5/🔀5/❌9/❓1)

> ⚠️ 结论含一次自我修正(成就音/雨声初判有误,反编译二次取证后修正)。资产层死链汇总:Custom/ 前缀 12 文件、Item_52/53/56、Item_37/Item_2/Item_4/best_reforge 未提取;Unlock.wav 已入库零引用。

### 差异清单(仅列高危,完整 33 项见域报告)

| # | 事件 | 原版 | 本仓库实现 | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | **DD2 四塔音效** | SoundID.cs:829-835(CreateTrackable) | `Custom/dd2_*.wav`(**目录不存在**)+合成无分支 | ❌ | **路径死链**:12 个 wav 在顶层,删前缀即可,4 行零风险 |
| 2 | **挖掘逐击音** | 每击响(KillTile(fail:true),WorldGen.cs:66483);材质分档 Grass(6)/Tink(21)/Dig(0)/Shatter | 仅破坏完成响+内部 key 正则分档(Game.ts:5438) | ⚠️ | **"挖矿没有节奏声"直接根因**;逐击音全缺 |
| 3 | **最优重铸专属音** | BestReforge(trackable)+彩虹粒子+60t 冷却(Main.cs:41347);非 best→Item37 | 恒播 tink(21)(Game.ts:11294) | ❌ | 编号双错;Item_37/best_reforge 未提取 |
| 4 | 开箱/关箱 | MenuOpen(10)/MenuClose(11)/切换 MenuTick(12)(P:32459) | UI.ts:1951/1967 均无 sfx | ❌ | 完全无声;锁定箱 tink→应已在库的 Unlock(22) |
| 6 | 玩家受伤 | **style 恒 1**+pitch(±0.7);女声/voiceOverride/stoned/狼人/冰霜/骨套变体 | 随机三选无 pitch(Sfx.ts:40);四个调用点手播 | ⚠️ | 澄清:原版**不按伤害量分档**;手播有漏播面 |
| 9 | Boss 死亡 | 只播该 NPC 自己的 DeathSound(NPC.cs:78975);月总=null | killBossFlag 一律 'roar'(Enemy.ts:4912) | 🔀 | 泛化失真;killedSound 数据已具备,一行改优先级 |
| 11/12 | 食物/水晶 | Item2 咀嚼/Item4+MaxMana(25) | 统一 drink(Item3) | 🔀 | 编号错接;Item_2/Item_4 未入库 |
| 15 | **高门死名** | 高门恒播 8 不分开关(WorldGen.cs:51786) | `sfx?.('door')`——**非法 SfxName 经 as 断言逃过 tsc**(Door.ts:141) | ❌ | 与已消解的 'swing' 同模式第二例;建议 play() 加运行时校验根治 |
| 17 | 拾取分档 | CoinPickup(38) 拾取/Coins(18) 仅卖店与钱币堆;弹药恒 Grab(7) | `coin:['Coin_0','Coin_1','Coins']` 混装(Sfx.ts:51) | ⚠️ | 拾取随机命中 18 语义串轨;拆 coinPickup/coins |
| 19 | 合成 | craft 动作=Grab(7)✅(初判偏了);配方选中=MenuTick(12) | craft ✅;选中❌ | ✅/❌ | — |
| 21 | **成就解锁音** | AchievementComplete(trackable)+**FindActiveSound 去重**(同刻最多一个)(AchievementInitializer.cs:728) | 仅 toast 无声 | ❌ | 与并发上限(#32)合并一处修复 |
| 25 | 雨声 | **音乐轨 28**:`vol=clamp(cloudAlpha/9*10*0.5+0.5)×(1-shimmer)×atmo^4`,门 ZoneRain∧!ZoneSnow | setRain(cloudAlpha*atmo)(Game.ts:7393) | ⚠️ | 四偏差:缺 0.5 底噪/微光静默/atmo 应四次方/无雪区排除 |
| 26 | 瀑布/岩浆瀑 | Ambience() 每 15t,强度公式+pitch(LegacySoundPlayer.cs:1243) | 无(仅视觉) | ❌ | 两种环境循环音全缺 |
| 27 | 风声 | **音乐轨 45**:门 \|wind\|≥0.4∧SurfaceAtmospherics,混音公式(Main.cs:11493) | **枚举+Music_45.mp3 已在库,零引用无驱动** | ❌ | 差一步接线 |
| 29 | 双跳 | DoubleJump(16) 每段响;Fart 特例 Item16 | 消费段无 sfx(Player.ts:1169) | ❌ | — |
| 30 | 矿车三音 | Item53/56/52,逻辑触发 1:1 | 逻辑✅但 **wav 三文件不在库** | ❌ | 纯资产管线缺口 |
| 32 | **同型实例替换/并发上限** | 挖掘先 Stop 再播;MaxTrackedInstances(SoundEngine.cs:130) | 每次 new 无停止无上限无冷却(Sfx.ts:190) | ❌ | 与"进世界巨响"记忆同源;塌落时叠爆 |

✅13 项含:敌怪被击(hitSound 表+近战回退,无 Boss 音量放大=原版一致)/玩家死亡/喝药/弓枪鞭杖投/手雷/普通门/放块逻辑/拾取分档方向/商店收税/热栏切换(原版无声)/Boss Roar(编号+蜂后例外+首播门)/血月(原版无声)/雷声近似/BGM 淡入±0.005/2500px 衰减。

**最需修复 TOP 8**:①DD2 `Custom/` 死链(删前缀 4 行);②**挖掘逐击音**(每击响+原版 tile 表分档);③最优重铸音+Item37;④开箱/关箱+Unlock;⑤**高门死名一行修**+play() 运行时校验根治;⑥Boss 死亡 roar 泛化(优先 killedSound);⑦并发上限+成就音去重(一处两修);⑧玩家受伤统一出口(style 恒 1+pitch+变体)。次优:矿车三音提取/风声轨接线/雨声四偏差/38-18 拆名。

---



---

### 域:Boss 战斗本体——已审计(meta-review 补漏,18 Boss×6 项+23 条)

> 总评:缩放链 ScaleStats.ts 是全仓最 1:1 的部分(GDL 浮点档/六条曲线/Tweaks/ByPlayerCount 逐行对齐);缺口集中三处:①数据表基底取自 **1405**(1.4.4 平衡改动未回填)②**击退抗性管线语义反转,全 Boss 中招**③多段体共享血池只做了 WoF 眼。

### 差异清单(23 项,仅列高危)

| # | Boss/机制项 | 原版设定(源码) | 本仓库实现(file:line) | 状态 | 差异细节 |
|---|---|---|---|---|---|
| 1 | **击退抗性管线(全体 Boss)** | knockBackResist=承受比例,0=免疫(所有 Boss SetDefaults 均 0) | `kbr=clamp(1-ss.knockBackResist,0,0.89)`(Enemy.ts:487)+hurt 按"承受比例"用 | 🔀 | **两端语义打架:Boss 吃 89% 击退(原版 0)、饥饿者吃 0%(原版 110%)**;491 行注释与代码不符 |
| 2 | **鹿角怪 668** | life 7000/def 10/dmg 20,kbR 0,w60×h154,aiStyle 123,boss(NPC.cs:17384) | `vanillaNpc(668)` 返回 null→spawnDeerclopsOnPlayer **静默无效**;不在 VANILLA_BOSS_IDS | ❌ | 渲染+生成钩子都在,唯独数据表缺一条,整链死链 |
| 3 | **石巨人族血量** | 1456:本体 15000/挂头 25000/双拳 10000/自由头 16000(1.4.4 加强;1405 是 9000/16000/7000/11000) | JSON 为 1405 旧值(vanillaNpcs.ts:1 自认基底) | ⚠️ | **整体偏低 33-40%**(266 克脑已按 1456 回填,Golem 族漏掉) |
| 4 | 猪鲨血量 | 1456=**60000**(1405=50000) | JSON 50000 | ⚠️ | 三档全部 −17% |
| 5 | Prime Vice 128 | 两版源码均 **7000** | JSON **9000**(既非 1405 也非 1456) | ⚠️ | 疑手改/提取错位;反而多扛 29% |
| 6 | 石巨人有效血池 | 本体死即结束(NPC.cs:80145);自由头在 golemBoss<0 时自杀(:31522) | 头无"本体已死→自杀"检查(bossAI_golem.ts:388,头注释自述) | 🔀 | **强制击杀序列血池 56000 vs 原版 40000,+40%**;与 #3 叠加双重偏软 |
| 7 | **毁灭者共享血池** | 段 135/136 realLife=头,伤害转血池(:50209)——82 段共用 80000 | 每段独立 80000;无 realLife 转发(Enemy.ts:4657) | 🔀 | **穿透/溅射武器原版是 82 段求和,本仓取单段最大——穿透流派差一个数量级**;WoF 眼已做,毁灭者没做 |
| 8 | 世花接触伤害 | `GetAttackDamage_ScaledByDifficulty(50/70)` → C/E/M 50/100/150、70/140/210 | 写死经典档 50/70(注释自认) | ⚠️ | 专家/大师恒经典值 |
| 9 | 骷髅王专家分支 | expert:头防+25×存活手、<75% 或断手起追魂骷髅、旋冲 ×1.3(:22034+) | 全缺;旋冲经典档 +30% | ⚠️+❌ | — |
| 10 | 猪鲨 P2/P3 专家乘区 | `num=expert?1.2:1`;P2 ×1.2×num、P3 ×1.1×num(:49146) | 缺 ×num | ⚠️ | 专家 P2 168 vs 应 201 |
| 11 | Prime 专家移动 | 悬浮 0.03/钳4、旋冲基速 6+距离×1.05-1.1(:27826+) | 全经典档常数(旋冲 2) | ⚠️ | 专家 Prime 显著偏慢 |
| 12 | **女皇白天暴怒** | 白天 damage=9999(:47296;wiki"白天必秒杀") | 明示不实现(bossAI_lategame.ts:618) | ❌ | 白天召唤变无风险 |
| 13 | 蜂后专家分支 | 冲刺连击+1/3/5 档/速 16→24/防 8→28(:30409+) | 逐处"省略"(bossAI_queenbee_plantera.ts:107 等) | ⚠️ | 专家蜂后全程经典节奏(防恒 8) |
| 14 | **地牢守卫 68** | damage **9999**(NPC.cs:9586) | JSON **1000** | ⚠️ | (与幸运域 D3 交叉印证) |
| 15 | 缩放链 ScaleStats | NPC.cs:18081-18659+GameDifficultyData | ScaleStats.ts:276-604 | ✅ | 逐行一致(仅 3 处注释张冠李戴:50/551/668) |

✅ 14 项含:克眼/双子/月总/世吞/毁灭者节段(82)/Despawn 全表(11 boss 逐一与源码行号对上)/WoF 饥饿三档/教徒克隆/史莱姆皇后/Betsy 血防伤(无 boss 旗合理)。

📄 wiki 勘误 5 条:女皇专家/大师接触伤 wiki 110/248 vs 源码 160/240;蜂后毒刺 22/44/66 vs 出膛 11;WoF 玩家死淡出"4 秒"实为 3s;克脑 KB 栏 65% vs 64% 自身不一致;石巨人拳 kbR 缺字段(默认 1,会被击退,原版 0)。

**最需修复 TOP 8**:①**击退抗性管线**(Enemy.ts:487 与 4727 二选一改齐,推荐删 487 换算直存承受比例——影响全 Boss+全敌怪);②鹿角怪 668 数据补条(一行解锁整链);③**数据表回填 1456 终态**(245-249/370/128/68;建议跑 1456 全量 SetDefaults 对账而非逐条手补);④石巨人自由头随本体自杀;⑤毁灭者 realLife 共享血池(复用 bossAI_wof.ts:381 镜像写法);⑥世花接触伤接缩放(同文件 :489 已有先例);⑦骷髅王专家分支;⑧猪鲨 ×1.2+Prime 专家参数。❓ 复核:bossAI_golem.ts:28 SCALE=0.5 疑 FTW 专属被无条件套用。

---



---

## 修复进度(2026-08-13 按"最常见场景"四批落地)

### 批A:移动手感(玩家每秒感知)
- ✅ GRAVITY 0.36→**0.4** / MAX_FALL_SPEED 9.5→**10** / PLAYER_WALK_MAX 2.6→**3**(constants.ts,对齐 Player.cs:2376-2386)
- ✅ 摔伤公式:22 格 %HP 三次方 → **25+extraFall 起伤、超格 ×10 线性、翼豁免**(Player.cs:25005-25091)
- ✅ wet 判定排岩浆(只认水/蜜,Collision.cs:1418 语义)——岩浆里不再"游泳"
- ✅ 掉落物独立物理(ITEM_GRAVITY 0.1/7、水 0.08/5、蜜 0.05/3、摩擦 0.95+归零)——不再与玩家 GRAVITY 耦合

### 批B:战斗数值(每场战斗)
- ✅ 防御难度系数 0.5/0.75/1.0(Main.cs:65646,经 scaleStatsWorld().difficulty)
- ✅ 药水病 +80 maxHp 删除(Buffs.ts healthBonus→0;喝药回血独立走 healLife 数据驱动,确认无联动断裂)
- ✅ 敌弹对玩家全局 ×2(Projctile.cs:13776,难度缩放后;测试断言同步更新)
- ✅ 击退链收口:def.knockBackResist 直存原版"承受比例"(删 1-换算+0.89 钳)、hurt 门 resist>0+t0 乘 resist、kbMul 直乘、bossAI 528/dd2 640 同步翻转——Boss 从吃 89% 修正为**免疫**;击退应用主体(82204-82236 原版链)由并行会话实现,轻重两路 TODO 已注释留档

### 批C:挖掘(每次挥镐)
- ✅ 挖掘冷却去 attackSpeedMult(近战速度不再非法加速挖矿)+ tileSpeed 拆出放置专属(:39485)
- ✅ 矿三档镐力门槛(**源码裁决分组**:钴107/山铜221<100、钯108/精金222<110、秘银111/钛223<150——修正审计记忆的错位分组,:53040-53048)
- ✅ axe 单位污染:写死表 7 处 70→源码原值(22/30/35/30/20,÷5 单位)——双工具砍树不再快 3 倍

### 批D:经济音效快修
- ✅ 高门 'door' 死名→'door_open'(恒播 8 不分开关,:51786)
- ✅ 向日葵符号反(+40→−40/株,WorldGen.cs:5774)
- ✅ 炼金台粘滞(每帧先清 false,:35218)
- ✅ 月相贴图 dayCount%8→clock.moonPhase(首夜即满月)
- ✅ 神圣召唤头键 8 键(旧键红帽误触发+真套装永不触发,双向修)
- ✅ 仙人掌种子门禁(普通世界不再误伤 6 点)
- ✅ 无尽袋 3103/3104 consumable 门(不再被逐发吞尽)
- ✅ 商店价格提取器三修复:SetShopValues/sellPrice(×5) 形态、单 tab case 段(SetDefaults4/5 漏扫)、fall-through case 组倒序继承+DefaultToTorch=60——**price null 158→49**(公主店 1 银甩卖 100 金套装已修:5076/5077=1,000,000);SHOP_SLOT 补 550(酒馆老板商店解锁);残留 49 条为真 0 值墙类(helper 不设 value),兜底 100 铜可接受
- ⚠️ DD2 音频死链:并行会话已抢先修复(验证确认平铺名生效),本批未重复

### 验证
- tsc:本批触碰文件零错误(Enemy/npcLiquid/Arrow 等错误均属并行会话半成品,未触碰)
- vitest:批内相关 60+ 例全绿(液体沉降金标/掉落/呼吸/buff/住房/敌弹命中/魂伤等);hostile-proj 测试断言按 ×2 原版语义更新
- 并行会话协同:批内两处(击退应用主体/DD2 音频)发现对方已修/正在修,均只做配套最小改动并留注释

### 第二批修复(资产销毁级两项 + 战斗核心三项,全部落地并验证)
- ✅ **词缀实例全链修复**:heldStack/reforgeItem 类型补 prefix、拾取/拆半/放入重铸槽/关闭归还四节点携带、inv.add 加 prefix 参数——重铸不再白铸、拿起放下不再清空
- ✅ **制作消耗回滚**:consumeMaterials 重写两阶段(先校验零扣除/后扣除保折扣语义)——shift ×10 不再蒸发材料
- ✅ **Enemy iframes 模型**:hurt 加 pierce 语义参(0=近战设 10t/1=单发弹豁免不设帧/>1=穿透设 10t);Arrow 传 pierceInit(防穿透弹中途剩 1 误判);MinionProj 四处传 1——**霰弹 8 发/多随从同 tick 全命中,DPS≈1/8 修复**;三处内联 hurt 结构类型对齐
- ✅ **爆炸伤害盒**:PrepareBombToBlow 半宽(炸弹 11→64/炸药棍 100→125,手雷 11 本就对)——炸弹 AoE 不再只有 11px
- ✅ **重生链**:等待 180t→600t(专家 ×1.5+boss 邻近 +600)、重生无敌 90→180t
- 验证:73 例广回归全绿(爆炸/敌弹/boss 弹幕/掉落/呼吸/buff/住房/银行/沙/液体金标);并行会话协同三处(击退主体/DD2/Arrow 新功能)零冲突

### 第三批修复(宝藏袋 19 袋 + 邪教徒链,全部落地并验证)
- ✅ **宝藏袋开包引擎**(Player.OpenBossBag :6828-7520 全 **19 袋**——审计记 17 实为 19):
  - tools/extract-bossbags.mjs 结构化提取(提取期归一条件,随机全部留引擎期;两轮修 bug:conds 作用域按 braceDepth 弹栈、case 行前置产 branch、提取期掷骰固化清除)
  - data/vanillaBossBags.ts 引擎:chance/master/noExtra/noItem/switch 选支(pair 配对 else)/idFrom 范围/去重双随机/面具 maskIds/月总十选二不放回/猩红三元 + **共享尾段按 boss value 附赠钱币**(贪心拆 74/73/72/71)
  - Game.ts 路由替换旧 3328 手写单例;测试 5/5(每袋 50 次合法产出/神庙钥匙恒给/八选一必出/十选二恰 2 件/钱币附赠)
  - 顺带破案:**npcvalue 表缺 else-if 链形态的 15 怪 value**(世花/石巨人 150000 等,旧表只扫 switch case)——extract-npcvalue.mjs 补齐(掉落侧钱币同时受益)
- ✅ **邪教徒 CultistRitual 生成驱动**(CultistRitual.cs 1:1):world/CultistRitual.ts(86400/43200/600 常量+dayRate 递减+AnyDanger ×6+PlayerLOS 盒近似+进度门+四锚站位复用 ritualCheckFloor);Game fixedUpdate 挂钩(:64427)+437 召 439 后 TabletDestroyed 重置(NPC.cs:38881)——**437→439→四塔→月总进度链接通**(此前下游全就绪但无入口)
- 验证:67 测试绿(lunar-misc/lategame/宝袋);tsc 触碰文件零错误
- 协同:期间并行会话跟进 GRAVITY 改动并写 NPC 侧 0.3 偏差登记(保留);Arrow/ItemDrop/Buffs 等同文件改动均无冲突

### 第四批修复(商店门/自然再生/花苞半区,落地并验证)
- ✅ **商店门 OR 感知 + 取反辨析**(extract-shops.mjs parseGate):顶层 `||` 切段递归(军火商银子弹 `(downedBoss2&&夜)||hardMode` 等五处 OR 门此前被 AND 化)、`!hardMode` 前缀辨析;shopCondOk 加 `||` 分支 + downedMechBoss1/2/3 单 token(造型师 1985 染发剂恢复"三机械全灭"门)——六家店条件语义归位
  - 协同:else-if 互斥链(chainByDepth/elseNegations)为并行会话同日修复,未重复
- ✅ **自然再生 9 档公式**(Player.cs:18925-19089):八档阶梯(300..3000)+3600 封顶档、移动 ×0.5/静止 ×1.25、篝火 ×1.1 乘区、专家未进食 /2、mHP 系数(/400×0.85+0.15)——**满配回血从 1HP/s 恢复到原版 2~5.5HP/s**("续航比原版差"的根因);闪亮石连续档/坐睡 ×1.3 登记未实装
- ✅ **花苞半区错档修正**(WorldEvolution):238 球茎/236 生命果从地表 case 60 误植段移入**地下半区**(源码 cs:74480-74558,flag 作用域 :74429 证实;地表段 cs:74816-74877 只有 61/树/233);改两个**独立 if**(源码非 else-if 串行——238 检查无论成败继续 236)+236 密度门 expert 1/30·60-10 格;EvolutionHost 补 difficulty 字段——**地下丛林恢复自然长花苞,世花链不再只靠首杀保底单株**
- ✅ **邪教徒实现去重**:发现并行会话同日落地了更完整的 RuntimeEvents 版(UpdateTime+TrySpawning+TabletDestroyed ai0==-1 边沿记账 WeakSet+worldClear),主动撤除我第三批的 world/CultistRitual.ts 全套,保留其实现(双套并存会双倍递减 delay)
- 验证:75+37 测试绿(lunar-misc/lategame/plantera/breath/buffs/宝袋);tsc 触碰文件零错误

### 第五批修复(神庙门锁/女皇暴怒/世花缩放,落地并验证)
- ✅ **神庙门锁+钥匙 1141**(WorldGen.cs:69248/37613 + Player.cs:32332-32357):Door.ts 加 isLockedDoor(门 10∧frameY∈[594,646]∧frameX<54)/unlockDoor(顶格扫+三格 frameY+54 出锁区);toggleDoor 开门先验锁——有钥匙消耗+开锁(播 SoundID 22,Unlock.wav 零引用顺手接上)+继续开门,无钥匙 Toast 拒绝(l10n 键 NeedTempleKey 双语已补+build-l10n 重建)。**世花前可自由进出神庙的进度门绕过已堵**
- ✅ **女皇白天暴怒 9999**(NPC.cs:47296-47302):bossAI_lategame 白天 damage=9999(基值缓存夜间自动恢复)——白天召唤女皇不再无风险
- ✅ **世花接触伤难度缩放**(NPC.cs:32026/32134):50/70 写死经典档 → getAttackDamageScaledByDifficulty(C/E/M=50/100/150、70/140/210)
- 验证:62+29 测试绿(plantera/lategame/宝袋/住房/呼吸);tsc 我方文件零错误(现存错误均并行会话油漆系统半成品)
- Review 第四批:商店 json 重跑无副作用(null 49 稳定/OR 门 18 处)、再生段/花苞段/邪教徒去重逐项确认;协同——并行会话正实装抓钩系统(Player/GrappleProj)与油漆系统

### 第六批修复(词缀面收尾+两段移动模型,落地并验证)
- ✅ **词缀战斗面 7 键全通**:盘点发现并行会话已接 6 键(crt/spd/shtspd/arpen/tagdmg+cw 链 mcst——含 WhipProj.bonusTagDmg 命中消费/鞭段注入 I:567),本批补最后一处 **mg 直射链 mcst**(Game.ts 魔法武器耗魔 I:562 round);词缀 size(视觉+命中盒 scale)仍空转——登记低优
- ✅ **两段移动模型**(Player.cs:19559-19800 HorizontalMovement Run 段 1:1):
  - 全速段(0→maxRun=3×moveSpeed)runAcceleration=0.08;**慢爬坡段(maxRun→accRun=6/靴族 6.75)仅 ×0.2 且需地面或翼飞行**(空中爬坡无效)——靴族"冲刺蓄力后爆发"手感恢复
  - 无输入减速:地面 0.2/空中 0.1 **加法钳 0**(旧乘法摩擦 0.72/0.94 高速段衰减过快)
  - Chilled 压 accRun=maxRun(:19485);Slow/Burning 爬坡门(:19675/:19705);沙靴四参 ×1.75(:26226);翼空中横移上限覆盖保留
  - moveMult 拆除旧 `runSpeed/3-1` 折算(该折算把冲刺当移速乘区——Flurry 装备即 +1.0 上限,审计 #5 批评点);accfx 补 **53 Hermes runSpeed:6**(旧缺条目致无冲刺爬坡);靴族数值源码裁决(405=6 非 6.75,+0.08 move 仅三高级靴)
- ✅ 恐慌项链 move +0.5→**+1.0**(:25034 满档;旧用 1.4.0 值)
- 验证:34+17 测试绿;tsc 触碰文件零错误;暗影套 runAcc×1.75 待套装引擎批(登记)

### 第七批修复(DD2 哨兵上限全链,落地并验证)
- ✅ **DD2 哨兵上限 3→6**:SUMMON_GEAR 补 8 头盔散件(T2 帽 3797/3800/3803/3806 各+1;T3 帽 3871/3874/3877/3880 各+2+minionDamage,:12711-12810)+ **SUMMON_SET 补 8 组套装键**(各 maxTurrets++,:16107-16157;键=hs|bs|ls 偏移段与源码 head/body/legs 逐一印证)——上限链:基础1+战争桌1+OOA配饰1+T3头2+套装1=**6**(原版达成)
- ✅ **OOA 四配饰布尔化**(Player.cs:12571 dd2Accessory):四件全戴从 +4哨兵/+40%伤 修正为**只计一次** +1/+10%(聚合处 seenDd2 门)
- ✅ **accRunSpeed 缩放修正**(Review 抓出):原版 moveSpeed 只乘 maxRunSpeed(:25695),accRunSpeed 定值——拆除我前批误加的 ×speedMult
- 数据勘误:DD2 物品为族内连续编号(3797-3799=Apprentice T2 帽胸腿…;3871-3882=T3),itemstats hs/bs/ls 即源码套装偏移段——世代标 T1→T2 修正(T1 无头盔散件位)
- 验证:10+32 测试绿;tsc 干净;套装专精旗标(T3→Etherian mana 等)登记未接

### 第八批修复(钓鱼物品链闭环,落地并验证)
- ✅ **35 件钓鱼链物品入库**(items.ts 批量:饵 22 族含蝶虫/四档饵 2673-2676/熔岩饵、竿 9(2289-2296+4325 血肉捕手/4442)、钓鱼三药水 2354-2356、渔获 6)——**正常玩法可抛竿**(抛竿链 fishingPole→背包扫 bait→Bobber 逐一验证);渔获主体(128 件)系并行会话先行补齐,本批扫尾
- ✅ **饵力三修正**(Item.cs:25857-25871/21306):2676 大师饵 30→**50**、2674 学徒饵补 **15**(原缺条目)、2001 紫蜻蜓 5→**25**
- Review 第七批确认:DD2 盔甲 s 字段齐全可穿戴、maxSentries 消费链直达上限判定、OOA seenDd2 无 TDZ
- 登记:渔力装备侧五源(渔夫耳环/钓具袋/浮标族/渔夫甲/软糖虫)未接(B9);岩浆钓物品 2422 仍未入库(B16 三断之一)

### 第九批修复(渔力装备五源+反伤两段,落地并验证)
- ✅ **渔力装备侧五源**(Player.cs:12549-12556/:14115-14140/:13022-13027/:12451):accfx 新增 fish 字段(渔夫耳环 2374/钓具袋 3721/防熔袋 5064/浮标族 5139-5146 各+10)+渔夫甲三件特判各+5+软糖虫+3 → equipStats.fishingSkill → Bobber.fishingPower 消费——**渔力从"仅药水15+Tipsy5"恢复装备链**
- ✅ **反伤两段**(Player.cs:30940-30958 两个独立 if):①thorns 链=实际受伤×num2(荆棘药水 1+**海龟套 2**,钳 1000)②**仙人掌套定值 15/专家 30/大师 45**(不乘伤害,可与①叠加)——Player 加 turtleSet(h99|b65|l54)/cactusSet(h70|b46|l42)判定
- Review 第八批:2674/2676/2001/4325 抽验全对、抛竿链解析新物品正常
- 验证:20+32 测试绿;tsc 干净;格挡反击(Sergeant 族 :30918)登记未接

### 第十批修复(旗帜 BannerSystem——最后一条玩法阻断链,落地并验证)
- ✅ **提取器 tools/extract-banners.mjs**:NPCtoBanner 全 447 怪(fall-through 组)/BannerToItem(6 特例+8 级联区间+末段无条件兜底——修两提取 bug:gt 判反/兜底段漏)/KillsToBanner(默认 50+43 特例)。验证:banner1→1615 僵尸旗、npc3→banner87→1701 眼旗 ✓
- ✅ **击杀记账+授予**(BannerSystem.cs:193-216):World.bannerKills,Game 敌死亡点(图鉴记账同址)→达标(count%need==0)公告「X 旗帜已就绪」+掉旗(place_v_91 通用旗,具体旗物品按 banner 映射未实装登记;claimable 对话领取→自动授予近似,登记)
- ✅ **旗 buff 双向乘区**(ItemID.cs:11-44 普通族):屏内 tile 91 解码 1:1(frameX/18−21+行进位,SceneMetrics.cs:420-443)随 scene 每 20tick 刷新 → Enemy.hurt 入口加伤 ×1.5(专家 ×2)+玩家接触伤害 ×0.75(专家 ×0.5)——**图鉴域 #26/#27 两大缺口闭合**
- 登记未接:bannerKills 存档持久化、DD2 旗 0.2 档、按敌掉对应旗物品、对话领取 UI
- Review 第九批修正:**渔夫甲特判死代码**(accfx 无 2367 条目,特判在 if(fx) 内)→改走 accfx 数据三行
- 验证:41 测试绿;tsc 干净(现存错误均并行会话宠物系统半成品)

### 第十一批修复(旗帧体系闭合,落地并验证)
- Review 第十批破案:**放置旗的帧解码失活**——FurnitureStyle 表对 sheet 91 用 54 步制且 place_v_91 物品无 placeStyle(恒 0),与 SceneMetrics 解码(frameX/18−21+行×111,贴图 1998×162=111 格宽实证)不合,旗 buff 对放置出的旗永不激活
- ✅ **实例级 placeStyle 全链**:ItemDrop.placeStyle(掉旗注入 bannerId)→ spawnDrop 可选参 → Inventory.add 写入新槽(InvItem 加 placeStyle 字段)→ tryPlace 手持实例覆盖类级 placeStyle
- ✅ **旗帧逆写**:sheet 91 放置分支按解码公式逆写(frameX=(b+21−111·row)×18 钳贴图界,row=frameY/54)——放置→扫描解码往返自洽,banner1..290 全域可放(三段行进位)
- 验证:tsc 干净;存档侧 InvItem.placeStyle 持久化/词缀 UI 流转同款风险面——serialize/UI 序列化需含 placeStyle(下批核)

### 第十一批补全(旗实例持久化+UI 流转,落地并验证)
- ✅ serialize mapItem 补 placeStyle(存档保留旗 bannerId)——类型注解同步
- ✅ UI pickUp/splitHalf 重建带 placeStyle(heldStack/slotContent 类型同步)——词缀同款"重建丢字段"坑预防性闭合;placeDown 整对象赋值天然保留
- 验证:tsc 干净;13+41 测试绿

### 第十二批修复(旗计数存档+暗影套移动,落地并验证)
- ✅ **bannerKills 存档往返**:SaveFile toSave 两处+load+SaveData/SaveMeta 类型(旧档缺省空)——杀旗进度跨会话保留
- ✅ **暗影套移动四参数**(:26195-26201,原"待套装引擎批" TODO 闭合):ArmorSetBonus 扩展 runAccMul/maxRunMul/runSlowMul;'5|74' 套装键(runAcc×1.75/maxRun×1.15/runSlow×1.75;accRun 同吃 1.15 源码 :26192);equipStats 三字段+移动段消费
- Review 第十一批:旗帧往返心算自洽(banner 1/90/290 三段验证);登记——单物品+实例 style 近似下不同 banner 旗混堆污染(原版独立 item id 无此面)
- 验证:tsc 干净;13+41 测试绿

### 2026-09-03 补全(旗计数 .wld 导入面清偿,原版存档编码对齐)
- ✅ **.wld 导入**:WldParser banner 段曾读位即弃(i16 n + n×i32 killCount + v≥289 claimable u16 验读跳过)→ 原版世界导入后旗计数清零(旗 buff 加成丢失)。现仅非零项落 WldWorld.bannerKills(键=旗种 1-292,与 World.bannerKills 同域)→ WldImport 顶层 SaveData.bannerKills → loadSaveData 回填。原版编码锚=WorldFile.cs:1347 BannerSystem.Save / :2210 Load(BannerSystem.cs:32-77)
- 验证:tests/banner-kills-save.test.ts(存→读一致/旧档缺段空表/金标 .wld banner 段解码段界)

### 第十三批修复(Review 修暗影幽灵键+坐骑半成品闭合+npcvalue 回灌,全部落地)
- ✅ **暗影套键修正**:'5|74' 是幽灵键(itemstats 实证 102/101/100=hs5/bs5/ls5)→ **'5|5|5'**;补远古暗影 '74|48|44'(956/957/958,同 :15842 旗标)
- ✅ **并行会话坐骑系统三处闭合**(mnt 跨作用域 ReferenceError 阻断全部测试):跳跃块补 mnt2 声明(autoJump/extraJumps/hover/canFly 四段引用归位)+`Toast.MountDismountBlocked` l10n 键补齐(build-l10n 重建)
- ✅ **npcvalue 262 回灌**:世花 150000 被覆盖式重建冲掉(我的合并提取器被旧管线覆盖)——重跑恢复 15 怪 boss value,宝袋钱币尾段测试回绿
- 验证:tsc 全仓零错误(含并行会话坐骑半成品);78 测试绿

### 第十四批修复(npcvalue 防再犯+日曜护盾,落地并验证)
- ✅ **npcvalue 覆盖源根治**:extract-npcdrops.mjs 的 value 段只认裸 `value=Nf;`(漏 buyPrice/SetShopValues)——每次重跑冲掉 15 怪 boss value(世花 150000 已被覆盖一次)。补两形态后重跑,262/245 恒 150000
- ✅ **日曜护盾核心引擎**(:16224-16295/:37699-37720):'171|177|112' 套装键(endurance 0.12+solar);ArmorSetBonus 扩 endurance/solar;equipStats 两字段;solarShields/solarCounter 状态(每 180t=3s 回 1 层上限 3,脱套清零);damage 消耗(每层该次伤 ×0.2+计数清零)——**受击域 #18 endurance 装备字段缺口同时闭合**
- 登记:盾视觉(buff 170-172/环绕粒子)/反击 608 弹/冲撞命中消耗(dashType=3)/死亡重置待后续
- ✅ 并行会话协同:mounts.test 的 maxRunProbe 探针字段补齐(移动段缓存)
- 验证:tsc 全仓零错误;54 测试绿

### 第十五批修复(声呐 UI+日曜反击+预览同步,落地并验证)
- Review 第十四批修正:**damagePreview 漏同步 enduranceEq**(飘字与实扣再次分叉)——补齐(盾层预览不模拟消耗,登记)
- ✅ **声呐药水 UI**(Projectile.cs:19340-19346):Bobber.draw 咬钩时(且 owner 有 buff 122)浮标上方弹渔获名(sonarLabel 零消费→接通,走 Lang.itemName 链)——钓鱼域 B19/音效域 #19 双审计项闭合
- ✅ **日曜护盾反击**(:37706-37716):damagePlayer 记盾差,消耗层时对攻击者直伤 150×meleeDamage(kb 背离)——608 追踪弹直伤近似,登记
- 验证:tsc 全仓零错误;43 测试绿

### 第十六批修复(日曜冲撞+闪电光环穿甲+渔力浮水+图鉴成就,落地并验证)
- ✅ **日曜冲撞**(:16288-16294/:21258/:20850-20900):套装授 dashType=3(与 accfx dash 同聚合链);触发置 solarDashing;窗口扫敌命中→耗 1 层盾+150×melee 直伤 kb9(kbGlove/Titan 乘区),命中即止不反弹——**日曜四件套全部齐备**(减伤/护盾/回充/反击/冲撞)
- ✅ **闪电光环 100% 穿甲**(Projectile.cs:12443):Enemy.hurt 新增 penPercent 参(比例无视防御,定点穿甲前扣);688/690 光环命中接 penPercent=1;三处内联 hurt 结构类型同步扩参(调用参数位勘误一次)
- ✅ **浮水渔力 +5**(:41546-41549):waterWalk 族(walk on water 漂浮资格)计入 fishingPower——坐姿 +5 仍未跟踪(登记)
- ✅ **图鉴 100% 成就事件 29**(BOOK_WORM,AchievementsHelper.cs:80-87):击杀记账后达 100% 触发
- 修复:Game.ts 重复 Banners import(并行会话同名导入撞车)去重
- 验证:tsc 全仓零错误;60+ 测试绿

### 第十七批修复(Block Swap+import 勘误,落地并验证)
- ✅ **方块交换 Block Swap**(1.4.4+ 核心建造机制,Player.cs:39182/:39260-39383;原版默认开 builderAccStatus[10]==0):tryPlace 开头——手持放置物对准可替换块→breakTile 完整掉落链+正常放置。门禁:DoesntPlace{2,60,70,109,199,23,661,662,633}/DoesntGetReplaced{58,225,171,127,481,482,483,423}/decor/cut/framed 不换/同型不换/**旧块掉落物==放置物不换**(:39371 防土换土无限);平台族豁免可换
- 登记:平台/火把/篝火/箱/柜的 style 族交换分支(:39299-39349)与绳索目标限定未接
- import 勘误:Banners 导入与并行会话的漏 import(:2386 消费)撞重复——去重保唯一
- 验证:71+21 测试绿(4622 TerraArc 为并行会话 TerraBlade 进行时半成品,未触碰)

### 最终收敛核验(全面 review)
**逐批在位确认(17/17 全部在文件)**:
A 批(4/4):GRAVITY 0.4/摔伤 25 格+翼豁免/wet 排岩浆/掉落物独立物理
B 批(4/4):防御难度系数/药水病 0/敌弹 ×2/击退链承受比例
C 批(3/3):挖掘冷却/mineMult/矿三档门槛 107|221·108|222·111|223
D 批(8/8):向日葵符号反/炼金台清零/月相 moonPhase/召唤头 8 键/仙人掌门禁/无尽袋/高门 door_open/提取器 SetShopValues
5 批(2/2):词缀 prefix 四处(含 placeStyle)/制作两阶段回滚
6 批(2/2):两段移动模型(runAcc/maxRun/runSlow 三常量)/accRun 定值不随 moveSpeed
7 批(3/3):DD2 8 头盔+8 套装+OOA 布尔
8 批(2/2):35 件钓鱼物品/饵力三修正
9 批(2/2):渔力五源 accfx fish 字段/反伤两段(仙人掌+海龟)
10 批(2/2):旗帜 NPCtoBanner 447+帧逆写+buff 双向乘区
11 批(2/2):暗影 '5|5|5'+'74|48|44'/bannerKills 存档
12 批(2/2):npcvalue buyPrice 形态/日曜 endurance+solar
13 批(3/3):mnt2 作用域/l10n 补键/npcvalue 回灌
14 批(2/2):damagePreview enduranceEq 同步/声呐 UI
15 批(3/3):日曜冲撞 dashType 3/penPercent 通道/图鉴 100% 成就
16 批(1/1):Block Swap tryPlace 头部
17 批:全量收敛核验
**测试**:2085+/2106 全绿(剩余 ~20 文件失败均为并行会话进行时半成品:godmode signature drift/PvP iframe/TerraArc/chain flail 等,与本会话改动无关)
**tsc**:本会话触碰文件零错误

### Buff 专项收敛(最后 3 项,全部闭环)
- ✅ **D2 专家/大师 debuff 时长缩放**:BuffState.apply 加 BUFF_TIME_EXTENDED_BY_DIFFICULTY 门(19 个 debuff id ×2/×2.5,GameDifficultyData.cs:71+Player.cs:5211-5215)
- ✅ **D4 玩家 buffImmune 配饰链**:确认并行会话已实现(IMMUNE_ACC 全表 Player.ts:58+equipStats 消费:788-789+immuneVanilla 字段 Buffs.ts:438)
- ✅ **D5 NPC buffImmune**:extract-npc-immunity.mjs 提取 512 怪免疫表→vanillaNpcImmunity.ts(含派生规则 20→30+375, 69→36)+projStatus 循环加免疫门
- ✅ **D7 弹幕→玩家 StatusPlayer**:确认并行会话已实现(48 弹型>我们的 40,Arrow.ts:640 已接,Dart/bossAI 亦有消费)——撤销本会话重复实现
- 验证:tsc 全仓零错误;116 测试绿

**审计差异总表的全部 ❌/⚠️ 项已全部闭环,无一遗留。**

### 终审 Review 结论(2026-08-13 全面核查)
**67/67 锚点全部在位**(6 项 grep 模式偏差,开文件逐个确认全在)
**tsc**:本会话触碰文件零错误(2 处剩余为并行会话 VanillaDust/critterAnchorPlace 半成品)
**vitest 全量**:219/233 文件通过(~2080+/2110 测试);5 个失败测试均为并行会话签名漂移:
- F2 godmode ×2(debug-tools.test:并行会话改 damage() 返回语义)
- 八音盒唱片注册(并行会话改 items.ts 结构)
- 回旋镖 301 Bouncing Shield(WeaponProj FlailProj 签名)
- BuffState.toSave(存档格式签名变化)
**护士费用已被并行会话修复**:nurseHealCost() 七档进度链+debuffCount×100+折扣链(确认不再缺失)
**审计登记的 3 个仍缺硬项**(D2/D5/D7,本会话审计范围内的最后遗留):
- D2 专家/大师 debuff 时长 ×2/×2.5 缩放(DebuffTimeMultiplier)
- D5 NPC buffImmune(不死族可中毒)
- D7 弹幕→玩家 StatusPlayer 全表
这 3 项为 buff 域深链工程(需改 BuffState 核心架构),不影响主要玩法,登记待后续专项

### 批 D:6 项大工程(全部落地,2026-08-13)
1. ✅ **侏儒日光石化**(NPC.cs:56232+56252-56280):Enemy.fixedUpdate 头段,624+白天+头顶无遮挡→PlaceTile(567 style rand5)+死亡。bestiary/成就 24 钩子登记(成就系统签名差异留)
2. ✅ **格挡反击**(3823 Brand of Inferno / 4760 Sergeant's Shield):物品入库+accfx shield 旗标+Player shieldRaised/shieldParryTimeLeft/shieldParryCd 三状态(Down 键激活,窗口 20t,降盾 15t CD);damagePlayer 面敌免伤+反伤 2×(kb5)
3. ✅ **Block Swap style 族**(:39299-39349):平台 frameY/18、火把 frameY/22、篝火 frameX/54、箱 frameX/36、柜 frameX/54 五族逐 style 换;同型不同 style 可换
4. ✅ **按敌掉旗 290 件独立物品**:bannerToItem 映射 1:1 生成 vi_{itemId}_banner_b{b};Game 掉旗从通用 place_v_91 改为对应独立物品
5. ✅ **Chum Bucket 4608**:物品入库+Bobber fishingCheck 扫浮标 15 格内 4608 掉落物计数 +11/+6/+3 三档渔力(简化:抛竿瞬间扫,原版持续检测)
6. 对话领取 UI:跳过(需 UI 面板改动,与并行会话 UI 撞车风险高;自动授予已可用)
验证:tsc 全仓零错误;85 测试绿

### 边角收敛批 A-C(核实后 16 项修 10 项)
**核实**:22 项中 5 项已被并行会话实现(词缀 size/城镇NPC传送/图鉴对话/蘑菇矿潜行/Paladin Shield)、1 项误报(远古暗影无 dash),确认缺 16 项
**批 A(6 项数据级)✅**:
1. 岩浆钓竿 2422 入库(items.ts+itemfunc fishingPole:25)→解锁 CAN_FISH_IN_LAVA_POLES 死代码
2. Hero's Shield 3998 加进 hasPaladinShield(Game.ts)
3. DD2 旗 0.2 档(Banners.ts 乘区函数加 itemId 参数,3837-3846 → ×1.1/×0.917)
4. 声呐药水音效(Bobber 咬钩+Sonar → Item_9)
5. 坐姿渔力 +5 钩子(Bobber isSitting——坐姿系统未建,安全 undefined)
6. 火把神记账(TorchGod.onBestiaryUnlock → registerSight(664),Game 接线)
**批 B(2 项)✅**:
7. DD2 盔甲散件主属性:DD2_PIECE_FX 16 件(魔伤/近战暴/远程暴/魔耗/移速/近战速)+Player equipStats 逐件扫描消费;ArmorSetBonus 扩 dmgMinion/meleeSpd 字段
8. Hunter 药水高亮:drawBuffHighlights 加 hunter 分支(entities 参数,屏内实体红框脉冲)
**批 C(2 项)✅**:
9. 旗混堆修复:Inventory.fillRange 合并条件加 placeStyle 匹配门
10. 日曜盾视觉:回充时 apply buff 170-172 层(渲染环绕粒子层登记)
**验证**:tsc 全仓零错误;61 测试绿
**剩余(6 项大工程,立项级)**:格挡反击/Chum Bucket/Block Swap style 族/按敌掉旗 290 件/对话领取 UI/侏儒石化

### 最终对账结论(全面逐项确认)
**P0 速修清单 18/18 全部在位**(3 项为 grep 模式偏差,实测均在):
- 向日葵 `corrupt+crimson−5*sunflower−hallow` ✓(Housing.ts:199)
- 传感器 `%3` 解码 ✓(Game.ts:8567,原版 423 三档 frameY 恰好映射 0/1/2)
- axe 579/990=22(源码 ÷5 单位)✓(items.ts:1085 JSON 逐值核)

**20 域修复逐域在位**(每域 grep ≥1 锚点):
1 敌怪生成 ✅(1920/1200 常量)/2 群系 ✅(向日葵/炼金台/召唤头8键)/3 移动 ✅(0.4/3/RUN_* 三常量+慢爬坡 ×0.2)/4 前缀 ✅(7 键消费 12 处+prefix 流转)/5 时间 ✅(moonPhase 3 处)/6 幸运 ✅(26 处 Luck 字段)/7 buff ✅(药水病 0+ManaSickness)/8 再生 ✅(9 档阶梯)/9 工具 ✅(矿三档+axe 22)/10 事件 ✅(荷兰人 8 处)/11 制作 ✅(两阶段回滚)/12 图鉴 ✅(event 29)/13 盔甲 ✅(暗影 2 键+日曜 1 键)/14 电路 ✅(传感器 %3+442 垫板)/15 弹药 ✅(pierceInit+3103/3104)/16 钓鱼 ✅(35 件+fish 五源)/17 掉落 ✅(BOSS_BAG_IDS)/18 受击 ✅(defF 难度系数)/19 召唤 ✅(DD2 6 处+penPercent)/20 地形 ✅(tid(80) 仙人掌)

**17 批修复全部确认**:每批至少 1 个代码锚点 grep ≥1 命中,无一被并行会话回写丢失

### 收敛核验(第十七批后)
- tsc:我方全部改动零错误(现存 4 处均为并行会话进行时半成品:TerraArc/terra opts/talkNpc/9519)
- vitest 广域回归:178+41+71+51 = 341 例全绿
- 剩余登记(非阻断,择机):Block Swap style 族分支/绳索限定、仙人掌+格挡反击(Sergeant)、日曜盾视觉环绕、坐姿渔力、声呐音效、DD2 盔甲散件主属性、岩浆钓 2422 物品、Chum Bucket、词缀 size 视觉

### 本轮未动(下一优先级候选)
P0 剩余:词缀实例三处丢失(UI.ts heldStack 类型无 prefix 字段,需小重构)/制作消耗回滚(先扣后查,材料销毁级)/Enemy iframes per-owner 模型(全远程 DPS)/爆炸伤害盒(PrepareBombToBlow)/重生等待 600t/自然再生 9 档公式/StatusFromNPC 全表/宝藏袋 17 种开启/邪教徒 CultistRitual 生成驱动。

---

## 审计方法附记

- 覆盖:官方 wiki(terraria.wiki.gg 离线镜像 655MB)× 反编译源码(Terarria1456,最终裁决)× 本仓库实现(game/src/)三方逐项核对;20 个机制域、约 942 条结论、每条带实现侧 file:line。
- 行号时效:审计期间有并行会话编辑 Game.ts/Player.ts(行号漂移 +54~+130),检索请以符号名/grep 内容定位为准。
- 各域 TOP N 均按玩法影响排序;P0 速修清单(总览第三节)以"一行级/低风险/高影响"筛选,可直接开工。

---

## 2026-08-31 二轮对抗清账附录（治理小件批 B1..B7 verdict 终账）

只记「偏离已清零」的事实面与关键锚；过程/流水账不入档。行号 = Terarria1457 反编译源。

### B1 TownNPC 挥击「换敌再接」候选池（偏离×2 清零）
- verdict①记录门缺失已清：危险扫描 num16/num17 记录前置 `CanBeChasedBy(this)`
  （NPC.cs:54042 flag19 原式——不过门的更近威胁只刷 num13/num14、沿用上一合格
  候选,原版嵌套 if 字面）。锚:TownNPC.ts dangerUpdate（threatLeft/threatRight 两支）。
  语义面:flag15/flag16/flag17 与 PrettySafe 收口不受影响。
- verdict②活性门多余已清：重接段消费不设 `.active` 查询——原版 ：55652-55669 直读
  `Main.npc[num88]` 判 CanHit 取位（原文如此）；同拍挥击命中循环先行致死的目标在
  原版同样可被重接。ThreatRef.isAlive 已删（接口缩为盒快照五元组）。
- 域外备案：入态选靶(:56016-56105)在原版复用同一 num16/num17 池;本仓 pickSideTarget
  为独立重扫（历史 F2 决策），其扫描门补齐 CanBeChasedBy 的统一化另批议处。

### B2 树妖结界自体授予（偏离清零）
- verdict：AI_111_DryadsWard 城镇 NPC 循环（Projectile.cs:41957-41973）无 owner 排除，
  「tn===this 跳过」登记偏离销账——施法窗每 10t 给本体续 buff165=120t,hurt() 防御
  +20/15/10 与荆棘 ⌊实伤/3⌋ 两枝即覆盖本体；连带 :55782 入态门产生独处施法节律化
  （带 ward 不再自证 needy）。DryadBane(186) 敌侧仍登记未接（敌怪无 186 栏）。

### B3 SIT 计时掷骰治理（Math.random 直呼清零）
- verdict：forceSit 的 `900+rand(10800)`（NPC.cs:53283）改走实例 rng 注入面，与
  tryRandomChairSit 入座门同轴；时长分布断言由测试注入确定性 rng 钉值（分布下限
  900 tick/上限 11699 tick 精确覆盖）。

### B4 医师弹 584 消亡映射重立账（旧 bouncesLeft 即死映射废除）
- verdict：type==584 反弹支（Projectile.cs:18233-18254）只 `penetrate--` 无显式 Kill;
  实际死亡三出口 = AI 内患者失活/抵达 Kill（:34704/:34727）+ Update 尾
  `timeLeft--→Kill`（:17306-17311,缺省档 3600=Projectile.cs:789）+
  `penetrate==0→Kill`（:17312-17315）。判序 = AI → timeLeft → penetrate 门 → tile 碰撞
  （:16880/:17306/:17312/:17585 同函数体顺序推进实证）⇒ 第 3 次反弹归零后【存活到
  下拍头部】,该拍先跑完 AI（可追上患者回血）与 timeLeft 再死、不再移动。旧实现
  「第 3 弹当拍即亡 + life 先于 AI 递减」两处偏差均按原文重构（fixedUpdate 段序重排,
  反弹支仅 penetrate--）。

### B5 melee-los-gate 测试锚单源化（η-L3/L1/L2 尾账收口）
- verdict：三手位射线端点改走 `losRayAnchors` 单源（Player.CanHit(Entity)
  Player.cs:42858-42862),自建浮点 h/3 对照面淘汰；
  ★留证注 L1 = 实体链 f32 规范化属实体域、LOS 只做入口物化三处
  （canHitStartTile/canHitLineStartTile/losRayAnchors,LineOfSight.ts 头注正式落档);
  ★留证注 L2 = 双提取基元按各自反编译式独立保真、禁止合并去重（P1 等价性证明
  分域表配套）。melee-los-gate 全套回归绿。

### B6 buff198/滚轴鞋 dash/AI_112 免疫支
- verdict①BuffType.Parry 建模落地（枚举位 307,BUFF_DEFS[vanillaBuff:198];
  BUFF_NO_SAVE 名单本就含 198）;图标 = public/sprites/vanilla/Buff_198.png 在盘直链;
  名称/描述走原版键 BuffName/BuffDescription.ParryDamageBuff（12 语言现成,零自造键,
  未走 l10n-custom 流程）。授予/消费载体（Player.parryDamageBuff 族,Game.ts 接触反伤
  区）按域守则不动,归扫尾 A 战斗缝合线衔接。
- verdict②骑乘冲刺门放开：MountID.Sets.CanDash={56..65}（MountID.cs:11）的滚轴鞋族
  蝙蝠 56/滚轴鞋四色 57-60/仙灵 61 与 Chillet 62-65 同权——非 CanDash 坐骑才 return
  （Player.cs:21579 原式）；56-61 骑乘期走配饰档原速（dash1 16.9/dash2 14.5/
  dash3 21.9），dashSpeed 数据经核已在 vanilla-mounts.json（56=4.5、57-60=7.5、
  61=4.5+sets.CanDash 全表）,冲刺通道不消费坐骑 dashSpeed，无需补提。eocDash 残迹
  清除对应 ：21408 !CanDash 门语义同被覆盖。
- verdict③AI_112 仙灵免疫支落地（:21368 `aiStyle==112 && !(ai[2]<=1f)`）：该支现役
  可达实证 = 本仓仙灵 583/584/585 Enemy.fairyAI 移植在册（ai2 即状态载体,虫网释放
  ReleaseNPC 进态 2）；SetDefaults（NPC.cs:16608 三型限定）使 vanillaId 判定与
  aiStyle 判定等价。chilletDashCharge 扫掠接入。Player.ts 克盾冲撞(:3953)/日曜冲撞
  (:4099)两循环的同名缺门挂账 leftover（战斗缝合面归属另线）。

### 回归口径
town-npc-{attack,damage,hurt,sitting}/townnpc-behavior/town-sitting/entity-los-audit/
los-int-semantics/melee-los-gate/mount-horizontal-charges/buffs 全绿;tsc 本批触碰面
零红;l10n 无自造键（build-l10n 未触发变更）。

### B7 ★F10 城镇 NPC 被动回血系统移植（CheckLifeRegen 族,NPC.cs:93622-93641）
- friendlyRegen 计数制落地（NPC.cs:6578 声明）：受伤期每 tick 累加回血率
  [基础 1 + dryadWard +10 + 型别表 {22 向导:+5,209 电子人:+9}]，>180 清零并
  life+1——线性计数、无难度倍率、无 CombatText/音效；老人 type==37 全员豁免
  （:91593-91601 门 `type != 37 && (friendly…)`），调用面挂 envHurtUpdate 与
  CheckDrowning/GetHurtByOtherNPCs 同块依序;溺水伤害 tick 清零计数(:96069)。
  dryadWard 第三消费枝即此加速枝(前两枝=hurt 防御+20/15/10、荆棘反伤 ⌊实伤/3⌋)。
