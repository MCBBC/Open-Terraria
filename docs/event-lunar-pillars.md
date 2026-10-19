# 星璇塔 / 天界入侵（Lunar Pillars / Lunar Events）1:1 移植设计（对齐 Terarria1456 / 1.4.5.6）

> 反编译字段：塔 = `NPC.LunarTowerSolar(517) / LunarTowerVortex(422) / LunarTowerNebula(507) / LunarTowerStardust(493)`，
> 事件总开关 `NPC.LunarApocalypseIsUp`，护盾 `NPC.ShieldStrengthTower{Solar,Vortex,Nebula,Stardust}`。
> 塔是 **NPC（aiStyle 94）**，不是 tile entity —— 无需 Wiring/TileEntity 基建。

## 1. 机制摘要

| 项 | 值 | 源码锚点 |
|---|---|---|
| 触发 | 教徒 439 死亡 → `WorldGen.TriggerLunarApocalypse()`（月总 398 死亡则是收尾：downedMoonlord + LunarApocalypseIsUp=false） | NPC.cs:80194-80203 |
| 塔位置 | 4 个**等距列**：x = maxTilesX/5 ×(1+j)（j=0..3），每列 x 抖动 ±100 格；自 worldSurface 向下找首个非实心窗口（x±10 格 / 上 20 下 15 格净空）；30 次尝试失败兜底 (列x, worldSurface-40)。四塔 id 洗牌分配 | WorldGen.cs:87371-87436 |
| 护盾上限 | `LunarShieldPowerNormal=100`；`ShieldStrengthTowerMax = downedMoonlord ? 50 : 100` | NPC.cs:6324-6326 / 6723-6733 |
| 塔受击 | `dontTakeDamage = 本塔盾 > 0`；盾破前完全免伤 | NPC.cs:41164-41178 |
| 扣盾 | 本组专属怪死亡 → 发射 projectile 629 TowerDamageBolt（aiStyle 122，5px/t 追塔、红尘尾），命中塔：盾 -1、塔 ai[3]=1（闪光 120t） | 发弹 NPC.cs:80080-80121；命中 Projectile.cs:69783-69819 |
| 塔血尽 | StrikeNPC：ai[2]≠1 时 → ai[2]=1、ai[1]=0、life 回满并无敌，进入 180t 上升渐隐演出后才真死 | NPC.cs:78864-78873；演出 NPC.cs:41030-41133 |
| 塔真死 | downedTower_X=true、TowerActive_X=false、`UpdateLunarApocalypse()` + `MessageLunarApocalypse()`，并走常规 NPCLoot（碎片） | NPC.cs:80122-80146 |
| 四塔全灭 | UpdateLunarApocalypse：场上无 517/422/507/493 且无 398 → `StartImpendingDoom(3600)`：LunarApocalypseIsUp=false、MoonLordCountdown=Max=3600（60s）、播 Lang.misc[52]、清教徒 | WorldGen.cs:87438-87503 |
| 月总降临 | 每帧倒计时 -1，归零 → `NPC.SpawnOnPlayer(最近玩家, 398)`；期间 MoonLordShake 震屏滤镜；BGM 强制 38 | Main.cs:64436-64459 |
| 公告 | 每倒一塔播 `Lang.misc[43+已倒数]`：43 天界入侵 / 44 头脑麻木 / 45 痛苦 / 46 阴森低语（47 需 num=4 不可达） | WorldGen.cs:87523-87550 |
| 碎片 | DropOneByOne：12-20 块，每块 1-3（专家 2-4，每多 1 玩家每块 +1）；517→3458 日耀 / 422→3456 星旋 / 507→3457 星云 / 493→3459 星尘 | ItemDropDatabase.cs:610-629 |
| 持久化 | 存 downedTower_*、TowerActive_*、LunarApocalypseIsUp；**盾值不存**（读档 TowerActive=true 重置满盾） | WorldFile.cs:1352-1360 / 2220-2245 |
| BGM | 任意塔入镜 → MusicID.LunarPillars=34（num3=10 → flag11）；398 入镜优先 MoonLord=38 | Main.cs:12243-12247 / 12479-12493 |
| 护盾视觉 | Perlin 噪声 + ForceField 着色器，强度 = 盾/Max，塔 ai[3]≤30 时 +5% 闪光 | Main.cs:23760-23830 |

## 2. 塔实体（NPC，aiStyle 94，NPC.cs:41029-41443）

四塔 SetDefaults 一致：lifeMax 20000 / def 20 / dmg 0 / 130×270 / noGravity / noTileCollide / kbResist 0 / **npcSlots 0**（不占刷怪槽）。

AI 94 逐段：
1. ai[2]==1 死亡演出：垂直上升（±0.25 钳速）、ai[1]>120 渐隐、三组粒子 + dust 分塔（517→127 / 422→229 / 507→242 / 493→135）、每 60t 音效；ai[1]≥180 → life=0 + checkDead。
2. ai[3]>0 受击闪光：播音效（NPCDeath58 / ai[3]==1 时 NPCDeath3），ai[3]>120 归零。
3. 盾判定：dontTakeDamage = 本塔 ShieldStrength>0（每帧重算）。
4. 远离自愈：目标玩家距离 >2000px 连续 60t → life +200（钳 lifeMax）。
5. 悬停：velocity.Y = sin(2π·ai[0]/300)·0.5；ai[0] 满 300 归零。贴地：底部向下 10/20/30 格探测，近下沉 1.5、远上浮。
6. 世界边界钳制（四向 60 格边距）；普通世界塔底 ≤ worldSurface·16 - 100。
7. 分塔支线：
   - 493 星尘：`SpawnStardustMark_StardustTower`（NPC.cs:44142-44228）——从 {405<2, 402<2, 407<1} 选一种，投射物 540 星尘标记落点，末端生成该 NPC；冷却 ai[1]=30×rand(5,16)。门：玩家 1080px 内且低于塔顶 400px。
   - 507 星云：仅环境粒子（怪全靠 Zone 刷怪表）。
   - 422 星旋：玩家 3240px 内且无视线 → 玩家头顶开传送门 579（场上 428+427+426<14）否则 578，cd 60+rand(120)；另支：玩家 1080px 内 → 空中随机点 579（场上 427+426×3+428<20），cd 420+rand(360)。
   - 517 日耀：玩家 1080px 内且位于塔上方 700px → 塔顶直接 NewNPC 519 日耀黏液（斜抛 7-12px/t），cd 60。
   简化许可：540/578/579 传送门系统可折叠为"延迟 X 帧后在标记点 spawnNPC(id)"，注释声明偏差。

## 3. Zone 与刷怪段（SpawnAnNPC 链**第一**分支，NPC.cs:1204-1289）

- Zone 判定：`SceneMetrics.CloseEnoughTo{Solar,Vortex,Nebula,Stardust}Tower = WithinRangeOfNPC(塔id, 4000px)`（SceneMetrics.cs:130/276-282）。本仓等价 = 玩家与场上塔 NPC 距离 <4000px。
- SetSpawnFlags（NPC.cs:303-318）：任一 ZoneTower* → `invaders=true; ignoreSafeWalls=true`；GetSpawnRate（:691-695）：invaders → spawnRate=20、maxSpawns=11（单人）。

逐塔选怪表（SelectRandom 权重；`<k` = CountNPCS<k 重掷）：

| 塔 | 表（重复项即权重） | 上限 | 塔内加刷 |
|---|---|---|---|
| 星云 507 | 424×3, 423×3, 421×3, 420×2 | 424<3, 423<3, 420<3（421 无上限） | 无 |
| 星旋 422 | 429×4, 427×2, 425×2, 426×1 | 425<3, 426<3, 429<4 | 传送门 579/578（§2） |
| 星尘 493 | 411×3, 409×2, 407×1, 402×1, 405×1 | 无 | 投射物 540 落点生怪（§2） |
| 日耀 517 | 518,419,418,412,417,416,415 各 1；掷中 418 再 1/2 重选 {415,416,419,417} | 518<2, 412<1 | 塔顶直投 519（§2） |

**扣盾归属表**（本组怪死亡 → 629 → 对应塔，NPC.cs:80080-80121）：
日耀 412/413/414/415/416/417/418/419/518 → 517；星旋 425/426/427/429 → 422；
星云 420/421/423/424 → 507；星尘 402/405/407/409/411 → 493。
（406/408/410/413/414/416/428 是分裂/伴生怪，**不扣盾**。）

## 4. 四组专属怪与 AI 家族清单

| 怪 | id | aiStyle | 现状（Enemy.ts 分发表） |
|---|---|---|---|
| 星尘蠕虫头/身/尾 | 402/403/404 | 6（蠕虫） | 头已有 wormAI；403/404 json 缺条目（补 json 即可） |
| 星细胞大/小 | 405/406 | 85 / 95 | 已有（bossAI_lunar_misc starCellAI/smallStarCellAI；95 涨大 Transform→405） |
| 水流入侵者大/小 | 407/408 | 96 | 已有（flowInvaderAI + LunarOrb 539）。**勘误：408 无 NewNPC 调用源**（全树核对），"由投射物 539 生成"不成立——539 只盘旋 210t 后冲玩家、亡时 80×80 范围伤害（Projectile.cs:32040-32280/:69366-69405） |
| 星尘蜘蛛大/小 | 409/410 | 3 / 26 | 已有 |
| 星尘士兵 | 411 | 3 | 已有 |
| 千足蜈蚣头/身/尾 | 412/413/414 | 6 | 头已有 |
| 日耀掠兽/骑手 | 415/416 | 3 / 75 | 415 已有；416 已有（bossAI_martian martianSaucerPartAI） |
| 滚球蜥蜴 | 417 | 39 | 已有 |
| 穿心者 | 418 | 74 | 已有（bossAI_martian martianDroneAI，悬浮俯冲） |
| 日耀战士 | 419 | 3 | 已有 |
| 星云悬浮脑 | 420 | 97 | 已有（nebulaFloaterAI：瞬移 + 环绕球 574→弹 576；Obstructed 遮屏未实装） |
| 星云头蟹 | 421 | 85 | 已有（starCellAI 六态 + 头顶吸附） |
| 星云野兽/士兵 | 423/424 | 26 / 3 | 已有 |
| 星旋步枪手/蜂后/蜂/幼虫/士兵 | 425-429 | 3 | 均已有 |
| 日耀长矛手 / 日耀黏液 | 518 / 519 | 3 / 99 | 518 已有；519 已有（solarSlimeAI 坠落自爆） |
| 四塔 | 493/507/422/517 | 94 | **缺 94**（§2） |

## 5. 实施清单

1. `src/world/LunarEvent.ts` 新建（仿 MoonEvent.ts 风格）：状态 `World.lunarEvent = { active, towerActive:{...4}, shield:{...4} }`（运行时，盾不存档）；`triggerLunarApocalypse`（WorldGen.cs:87371-87436 1:1：洗牌+四列+±100 抖动+地表窗口 30 次+兜底）；`updateLunarApocalypse`（:87438-87478）；`onTowerKilled`（NPC.cs:80122-80146）；`onMinionKilled(id)`（§3 归属表，同步扣盾+视觉追踪弹）；`startImpendingDoom(3600)` + moonLordCountdown 递减 + 归零生 398；`shieldMax = downed_398 ? 50 : 100`。
2. `src/entities/Enemy.ts`：分发表加 `case 94`（towerAI：盾=iframes 每 tick 刷新、死亡演出 ai2 状态机 180t、sin 悬停+贴地钳制、免 despawn、不进 VANILLA_BOSS_IDS 不劫持 game.boss）+ `case 74/75/85/95/96/97/99`。
3. `src/world/spawn/VanillaSpawner.ts`：`spawnAnNPC` **链头**（天空怪之前）插四塔 Zone 段（§3 表 1:1）；`setPlayerFlags`/`getSpawnRate` 加塔 Zone → invaders 语义（rate 20/max 11 复用既有 invaders 支）。
4. `src/core/Game.ts`：击杀链 `downed_439` 置位处追加 `lunarEvent.trigger()`；塔死走 onTowerKilled；主循环月总倒计时递减+归零召唤；选曲任一塔入镜 → 34（bossMusic 之后、群系之前；MusicInput 新增 `lunarMusic` 与 `moonMusic` 同层其后判定）。
5. `src/drops/NpcDrops.ts`：实现 `dropOneByOne` 规则 kind（数据已就绪 vanilla-npcdrops.json；12-20 块每块 1-3、专家 2-4、每多 1 玩家 +1）。
6. 渲染：塔护盾半球（透明度 0.2+0.8×盾/Max+闪光脉冲）；629 红色追踪弹+尘尾。
7. 存档：flags.downedTower_* + TowerActive 四 bool + LunarApocalypseIsUp；读档 TowerActive=true 重置满盾。

## 6. 数据缺口

- vanilla-npcs.json 缺 403/404（蠕虫身/尾）、408（小水母）——PNG 已在，补 json（字段复制 402 改宽高）。
- items.ts 未注册碎片 3456-3459（先注册占位 maxStack 999，避免掉落未知物品）。
- 本地化 LegacyMisc.43-47/52 已在；BGM 常量 34/38 已在 Music.ts。

## 7. 串行约束

冲突文件：VanillaSpawner.ts / World.ts / Game.ts / Music.ts / NpcDrops.ts——与南瓜月/霜月任务重叠。
**顺序：南瓜月/霜月合入 → 星璇塔实施**。塔 Zone 段插链头（原版先于天空怪与月事件段），不重排选曲优先级链。
