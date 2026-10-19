# 全动物(99 只 critter)四维审查 — 2026-08-17

范围:`public/sprites/vanilla-npcs.json` 中 `critter=true` 全部 99 只(+594 风气球
critter=None 特例)。对照 `Terarria1456` 反编译源码逐维核对。

## 物种 × aiStyle 分布(99)

| aiStyle | 数量 | 族 | 路由 |
|---|---|---|---|
| 7 行走族 | 41 | 兔/松鼠/鼠/蛙/鸭/海鸥/䴙䴘/蝎/龟/企鹅/宝石双族/节日变体/687 | townCritterWalkAI |
| 24 鸟 | 11 | 鸟/松鸦/红雀/鹦鹉族/玄凤/猫头鹰/金猫头鹰 | birdAI |
| 66 蠕虫 | 8 | 蚯蚓/金蚯蚓/魔夜爬虫/Grubby 三色/蛆/松露虫 | wormCritterAI |
| 114 蜻蜓 | 7 | 七变体 | dragonflyAI |
| 16 鱼泳 | 5 | 金鱼双态/金金鱼/鳉鱼/海豚/河鲀 | swimAI |
| 64 萤族 | 4 | 萤火虫/闪电虫/熔岩蝇/仙灵蛾 | fireflyAI |
| 65 蝶族 | 4 | 蝴蝶/金/地狱/彩光蜻蛉 | butterflyAI |
| 68 鸭飞形 | 4 | 鸭/䴙䴘飞形(Transform 派生) | duckFlyAI |
| 67 蜗牛 | 3 | 蜗牛/发光/熔岩 | snailAI |
| 112 仙灵 | 3 | 三色(独立物品!) | fairyAI |
| 115 瓢虫 | 3 | 瓢虫/金/椿象 | ladybugAI |
| 116 水黾 | 2 | 水黾/金 | waterStriderAI |
| 118 海马 | 2 | 海马/金 | seahorseAI |
| 1 弹跳 | 2 | 蚱蜢/金蚱蜢 | slimeAI |

路由覆盖 14/14 ✓(594 风气球 aiStyle 113 无 critter 旗走主 switch,双门已接)。

## A. 捕获/释放表(已修)

- **捕获表 17→98 条**:原版 SetDefaults catchItem 全量(标量+公式族展开:蝎
  2156+t-366/魔夜爬虫 3191+t-484/蜻蜓 4334+t-595/瓢虫 4361+t-604/水黾 4418+t-612/
  龟 4464+t-616/宝石松鼠 4831+t-639/宝石兔 4838+t-646 + 内层覆写:鸟三分/海马/
  **仙灵三色 4068/4069/4070 独立**/鸭走飞形)。螃蟹 67/海豚 615/海龟 625 原版
  无 catchItem=不可捕 ✓。687 catchItem=2121 是死数据(网捕走传送特例)。
- **释放表 93 条显式**(原 `捕获表逆推` 有 17 处错:共享物品族原版一律释放
  基础/走形——261→55 而非 230、2019→46 而非节日变体、2121→361 而非 687、
  2122→362、2673→374 等;另缺蝴蝶八物种/金系/蜻蜓/宝石双族共 26 条)。
  数据源:Item.cs DefaultToCapturedCritter 公式族展开(金系 2889+t→442+t 四层
  缩进 case 堆,提取器须放宽缩进)。

## B. 出生可达性(修 4 族)

| 缺口 | 原版 | 处置 |
|---|---|---|
| 蚱蜢 377/446、蚯蚓 357/448、蛆 606、魔夜爬虫 485-487 | **不走刷怪链**——WorldGen.cs:66304 KillTile_DropBait 割草/割植物掷骰(分母表:草 3 worm400/hop100、腐草 73 200/50、装饰组 185-187 帧带 worm6、丛林/蘑菇/孢植物 61/74/62/233 grub 80/40/250/10、狱草 637 lavaBait100;caps 5/5/8/8;金 1/400;墓地 worm→蛆;出生弹跳背玩家) | ✅ 已接 Game 割植物分支(vy=Next(-50,-21)×0.1/grubby 序贯两掷 1/4→486、1/12→487) |
| 猫头鹰 611/金猫头鹰 689 | NPC.cs:2345 夜+无雨+1/5,1/100 厄运→689 | ✅ spawner case 2 链 |
| 蓝松鸦 297/红雀 298/金鸟 442 | 晨表(:2358 <9:30 且 2/3)+鸟表二(:2442 1/2 无昼夜门) | ✅ 同上 |
| 蝎 366/367 | case 53 黄沙落脚即出 Next(366,368) | ✅ 同上 |
| **旧"森林概率表"(蚯蚓/蚱蜢/鼠混编)整体是自创近似** | 原版尾部表=金兔→金松鼠→万圣/圣诞/派对→1/3 松鼠 299|538→兜底兔 46,且链无昼夜门(夜间兔/松鼠/鸟照出) | ✅ 已按原版真序重构(N(15) 包裹+dayTime 外门均摘除) |

可达性复验:其余各族出生位全在(企鹅 148/149 雪原、鹦鹉族 671-675 丛林昼前半、
水黾 612/613 水面线、䴙䴘 608/609、鳉鱼 607 内带沙、海龟 625、龟 616/617、
海马 626/627、河鲀 688、地狱三饵 653-655、蜻蜓 595-601 雨天香蒲、瓢虫 604/605
起风替换、椿象 669、松露虫 374 丛林硬模式、仙灵 583-585 地下、墓地形 610/606、
飞形 363/365/603/609 与逃形 375 走 Transform、节日 303/337/540、614 爆炸兔走
兔炮 Wiring)。

## C. 转化/特殊语义

- **微光**:数据驱动(vanilla-shimmer.json npcTransformTo)——小动物全表→677
  微光蝇 ✓;594 无表项=原版不转化 ✓。
- **血月**:BLOOD_MOON_EVIL 兔族→47|464、金鱼族→57|465、企鹅→168|470 ✓
  (原版仅此三族)。
- **CritterThatCanTurnOnPlayers**(NPCID.cs:4779:松鼠族 299/538/539+宝石松鼠
  639-645):玩家 160px 内 1/3000 厄运掷 → ai[3]=2 → lifeMax 25/防+6/damage 20/
  aiStyle=3 反咬(NPC.cs:53797-53810 松鼠彩蛋)。**未实现,登记**。
- **松露虫链**:374 玩家 160px 内 90t→Transform(375 穿墙逃形) 已接(08-11 批)✓。

## D. 渲染/数据

- 帧数三方闸门(json×npcFrameCount×贴图高)既有测试覆盖 ✓。
- 释放蝴蝶 placeStyle 物种变体未接(恒基础款)——渲染侧登记,影响仅外观。

## 遗留登记 → 已全部修完(2026-08-17 三轮,"禁止登记不修")

1. **CritterThatCanTurnOnPlayers 已实装**:Enemy.townCritterWalkAI 头部——
   松鼠族 {299,538,539,639-645} 玩家 CanHit 内 RollOnlyBadLuckExtreme(3000)
   (★非负运恒 -1 不触发——须负运才反咬,原版语义)→ ai3=2 → maxHp 25/防+6/
   伤 20 → 永久转 fighterAI。测试锁定(luck=-0.5 强制命中)。
2. **释放 placeStyle 已接**:spawnNpcByVanilla(style 参)→ 蝴蝶 ai2=Style;
   butterflyAI ai2=物种槽(出生加权掷 25/22/19/15/10/6/2/1%,cs:45292-45307);
   漂移计时挪 lai0(原版 localAI[0]——曾误写 ai2 会覆写物种带);渲染
   vanillaFrameIdx aiStyle 65 分支:带=(ai2-1)×3+拍翅 [0,1,2,1](cs:73452-55),
   修复了此前 24 帧连播跨物种变脸的视觉 bug;661 渐隐槽不受影响(测试锁定)。
3. **Flower Boots 全链已实装**:3017/3993(accfx 提取器六轮模式 flowerBoots=
   true 再生)+equipStats.flowerBoots+DoBootsEffect 1:1(每 2t/落地/无钩爪/
   |vx|+|vy|>1)+PlaceFlowersOnTile 四草族帧带 1:1(森林 NextFromList 22 值/
   神圣 110/113 ≠90 重掷/丛林 74/灰烬 637)+DropBait ×10000 门接通。
4. **刷怪帽计数已对齐原版**:nearby 并入 critters 桶 slot 和(NPC.cs:78709-14
   全体 NPC 语义);Boss 豁免移除(原版无);史莱姆雨蓝史莱姆 ×0.65
   (Main.cs:8800/1114);释放出生 releaseOwner!=255 不计(Enemy.
   releasedFromItem)。594 风气球留 enemies 桶=与原版 Main.npc 一体计数同义,
   偏差消解。
5. **DropBait 挂点重构**:从 TILE_CUT(剑割)分支提到 breakTile 顶部独立方法
   killTileDropBait——185-187 装饰组**非 tileCut**(38 项表核查),原版走镐破坏
   也掷;noItem(裂砖连锁)不掷。E2E 探针 _cutbait-probe(breakTile 直调)。
6. 261 金鱼空地释放=原版行为,无需改(维持备注)。

## 测试

- tests/critter-spawn-parity.test.ts(21 例:沙蝎/夜猫头鹰/晨鸟表/尾部表/
  夜间兔 + 15 物种 Enemy 数据可达性)
- tests/critter-walker-parity.test.ts(5 例,前批)
- 全量相关:spawn-friendly-cycle/snow/jungle/shimmer-spawn/dungeon/a-batch1-2
  全绿


## 四轮 review（2026-08-17 夜，自审回读——5 处真偏差全修）

1. **企鹅/蝎被 surfaceSpawn 门误拦**：原版 switch case 147/161/53【无 flag10/深度门】
   ——地下雪原/沙漠照样出企鹅和蝎。两支挪出 surfaceSpawn 门（新增深度出生测试
   两例锁定）。
2. **外门 tile 集偏差**：补 HALLOW_GRASS/HALLOW_MOWED_GRASS（原版 case 2 四草族
   109/492 此前整体缺席=神圣草永不产小动物）；摘 DIRT（原版 case 2 不含泥土，
   地表泥土落 default 空过——旧超集使泥土出兔）。
3. **critter npcSlots 兜底 0.1→1**：NPC 类字段默认 1f——json 无显式赋值的
   （兔 46/企鹅 148 等）原版各占 1 槽。
4. **洞穴段（flag11）补金兔 443 掷+摘 dayTime**：原版尾部对洞穴落点同样先滚
   1/400 金兔（无门掷）；尾部链无昼夜门。同时修正我自己上一轮的误读——
   flag11 宝石掷未中=空过，**无**普通兔兜底（else 46 只属地表支）。
5. **DropBait cap 计数按基型**：原版 CountNPCS(num7)=357|606（金蚯蚓 448 不计）、
   蚱蜢只数 377；grubby/地狱饵才是族合计。曾写成含金的族计数。
6. **香蒲蜻蜓门拆分**：原版独立块（tile {2,477,53}+day+!windy+**Next(2)==0**，
   含沙不含土/神圣）——曾并入雨块共用门且缺 1/2 掷；雨天替换块（蚯蚓/上岸金鱼）
   则无昼夜/风门，夜间雨天照出。两块拆开各归其门。

验证：critter 全家 31 例+spawn 族 81 例全绿；_cutbait-probe 4/4（cap 修正后
恰好钉在 5）；_bunny-ai 6/6。
