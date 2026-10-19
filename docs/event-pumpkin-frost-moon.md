# 南瓜月 / 霜月（Frost Moon）1:1 移植设计（对齐 Terarria1456 / 1.4.5.6）

> 反编译字段名：南瓜月 = `Main.pumpkinMoon`，霜月 = `Main.snowMoon`（**不是** frostMoon）。
> 两事件共用一套 20 波分数表、同一黎明结算、同一进度条管线，只差触发物品与怪池/计分表。

## 1. 机制摘要

| 项 | 南瓜月 Pumpkin Moon | 霜月 Frost Moon | 源码锚点 |
|---|---|---|---|
| 触发物品 | 1844 PumpkinMoonMedallion（ItemID.cs:5227） | 1958 NaughtyPresent（ItemID.cs:5455） | Item.cs:20377-20385 / 21121-21128（consumable, useStyle 4, useTime 45, rare 8） |
| 使用条件 | `!dayTime && !pumpkinMoon && !snowMoon && !DD2Event.Ongoing` | 同左 | Player.cs:43294 / 43361（ItemCheck 使用）；CanUseItem 门 Player.cs:51423 / 51427 |
| 使用效果 | `Main.startPumpkinMoon()` + Lang.misc[31] | `Main.startSnowMoon()` + Lang.misc[34] | Main.cs:10903-10921 / 10923-10940 |
| 波次 | 20 波（waveNumber 1..20；wave 20 为终波，lookup[20]=0 不再推进） | 同左 | NPC.waveNumber NPC.cs:5982 |
| 计分 | 击杀即加 waveKills；`waveKills >= lookup[wave]` → waveKills=0、waveNumber++、广播下一波文案（**溢出分数不结转**） | 同左 | NPC.cs:79350-79372（霜）/ 79485-79507（南瓜）；分数表 NPC.cs:6534-6538 |
| 难度乘区 | `GetMoonEventPointScalar()`：专家 ×2 / 大师 ×2.5 | 同左 | NPC.cs:79230-79241 |
| 结束 | 黎明（UpdateTime_StartDay）：先广播总分（Misc.PumpkinMoonScore），wave≥15 则当日强制季节（forceHalloween/XMasForToday + 公告），最后 `stopMoonEvent()` 清零三字段 | Misc.FrostMoonScore / forceXMas | Main.cs:64868-64871（结算顺序固定：分数→季节→stop）；10865-10877 / 10827-10863 / 10879-10901 |
| 掉落 | 击杀时即时掉（无波次结算奖励），四类 wave-gate 条件控制稀有掉落 | 同左 | ItemDropDatabase.cs:337-365 / 367-391；Conditions.cs:55-229 |
| 进度条 | 复用入侵进度条：`ReportInvasionProgress(waveKills, lookup[wave], icon=2, wave)`，显示门=屏内±5000px 有本组 NPC（组号 -2） | icon=1，组号 -1 | Main.cs:46975-47012；组号 NPC.GetNPCInvasionGroup NPC.cs:79140-79174 |
| BGM | MusicID.PumpkinMoon = **30** | MusicID.FrostMoon = **32** | MusicID.cs:72/76；选曲 Main.cs:12914-12921（屏幕在地表 worldSurface+10 格内时覆盖一切） |
| 月亮贴图 | TextureAssets.PumpkinMoon（按 moonPhase 帧） | TextureAssets.SnowMoon | Main.cs:62400-62408（无天空滤镜，天色同普通夜） |

**原版怪癖（勿照抄）**：`Main.SyncAnvasion`（Main.cs:47027-47046）给客户端同步用的霜月表是错的（`{0,25,15,10,30,100,...}`），权威表只有 `MoonEventRequiredPointsPerWaveLookup`。Otherworld 换曲分支两事件都写成 82（Main.cs:12091-12098），单机实现忽略。

## 2. 波次分数表（两事件共用，NPC.cs:6534-6538）

```
索引:     0    1   2   3   4    5    6    7    8    9    10   11   12   13   14   15   16    17    18    19    20
需要分数: 0,  25, 40, 50, 80, 100, 160, 180, 200, 250, 300, 375, 450, 525, 675, 850, 1025, 1325, 1550, 2000, 0
```

**每怪分值**（乘难度 scalar 后累加；未列出的 id = 0 分）：

| 南瓜月（NPC.cs:79453-79484） | 分 | 霜月（NPC.cs:79274-79305） | 分 |
|---|---|---|---|
| 稻草人 305-314 | 1 | 精灵僵尸 338-340 | 1 |
| 树怪 Splinterling 326 | 2 | 姜饼人 342 | 2 |
| 地狱犬 329 | 5 | 精灵弓手 350 | 3 |
| 胡闹鬼 330 | 10 | 弗洛科 Flocko 352 / 胡桃夹子 348-349 | 5 / 4 |
| 无头骑士 315 | 50 | 玩具直升机 347 | 8 |
| 悲木 MourningWood 325 | 75 | 坎卜斯 351 | 10 |
| 南瓜王 Pumpking 327 | 150 | 雪怪 Yeti 343 | 18 |
| | | 礼物窃贼 PresentMimic 341 | 20 |
| | | 常世吼 Everscream 344 | 50 |
| | | 圣诞坦克 SantaNK1 346 | 100 |
| | | 冰雪女王 345 | 150 |

**波次公告**：wave+1 时按下一波号广播 `Lang.GetInvasionWaveText`（Lang.cs:1131-1153：FirstWave/Wave {n}/FinalWave + 1-6 个怪名，本地化键 `Game.InvasionWave_TypeN` 已在 zh-Hans.json）。启动时也广播 wave 1：南瓜 `GetInvasionWaveText(1, 305)`、霜月 `(1, 338, 342)`（Main.cs:10919 / 10939）。wave 19 的文案用 FinalWave（wave 参数 -1）。

## 3. 逐波怪池（选怪分支：霜月 NPC.cs:2707-3132，南瓜月 NPC.cs:3134-3455）

记号：`1/N` = `rand.Next(N)==0`；`<k` = `CountNPCS(id)<k`；`唯一` = `!AnyNPCs(id)`；`bossCap` = `reachedInvasionBossCap`（NPC.cs:159-183：场上 315/325/327/328/344/345/346 的 npcSlots 总和 ≥ 玩家数 × maxSpawns 上限时置位，当帧不刷 Boss）。两事件刷怪前置门相同：`(spawnTileY<=worldSurface || remixWorld) && !dayTime && 事件开启`；霜月任意波先掷 `1/30 && CountNPCS(341)<4 → 礼物窃贼 341`。

### 南瓜月
| 波 | 选怪链（按序短路） |
|---|---|
| 1 | 稻草人 rand(305..314) |
| 2 | 1/3 树怪 326，否则稻草人 |
| 3 | 1/3 地狱犬 329，否则树怪 |
| 4 | 1/8 唯一→悲木 325；否则 1/2 树怪，否则稻草人 |
| 5 | 1/10 唯一→无头骑士 315；否则地狱犬 |
| 6 | 1/7 <2→悲木；否则 1/2 树怪，否则稻草人 |
| 7 | 1/7 <2→悲木；否则 1/4 胡闹鬼 330，否则地狱犬 |
| 8 | 1/8 <2→无头骑士；否则 1/4 胡闹鬼，否则地狱犬 |
| 9 | 1/10 <2→悲木；1/8 胡闹鬼；1/5 地狱犬；1/2 树怪；否则稻草人 |
| 10 | 1/10 唯一→南瓜王 327；否则 1/3 地狱犬，否则稻草人 |
| 11 | 1/7 <2→悲木；否则 1/3 胡闹鬼，否则树怪 |
| 12 | 1/5 唯一→南瓜王；否则胡闹鬼 |
| 13 | 1/7 <2→悲木；1/10 <2→无头骑士；1/6 胡闹鬼；1/3 地狱犬；否则树怪 |
| 14 | 1/10 唯一→南瓜王；然后 1/7 <2→悲木；否则 1/10 唯一→无头骑士；1/10 胡闹鬼；1/7 地狱犬；1/3 树怪；否则稻草人 |
| 15 | 1/10 唯一→南瓜王；然后 1/7 <2→悲木；否则 1/5 胡闹鬼；否则 1/3 树怪；否则稻草人 |
| 16 | 1/10 <2→南瓜王；1/10 <2→无头骑士；1/6 胡闹鬼；1/3 地狱犬；否则树怪 |
| 17 | 1/7 <2→南瓜王；1/7 <2→悲木；否则 1/7 <2→无头骑士；否则 1/3 胡闹鬼，否则地狱犬 |
| 18 | 1/7 <2→南瓜王；1/7 <2→悲木；否则 1/7 <3→无头骑士；否则胡闹鬼 |
| 19 | 1/5 <2→南瓜王；1/5 <2→悲木；否则 !bossCap && <5→无头骑士；都可能失败（当帧不刷） |
| 20+ | !bossCap：1/2 <2→南瓜王；否则 2/3 <2→悲木；否则 <3→无头骑士 |

### 霜月
| 波 | 选怪链 |
|---|---|
| 1 | 1/3 姜饼人 342，否则精灵僵尸 rand(338..340) |
| 2 | 1/3 精灵弓手 350，否则精灵僵尸 |
| 3 | 1/8 胡桃夹子 348；1/4 弓手；1/3 姜饼人；否则精灵僵尸 |
| 4 | 1/10 唯一→常世吼 344；1/4 弓手；1/3 姜饼人；否则精灵僵尸 |
| 5 | 1/10 唯一→常世吼；1/4 弓手；1/8 胡桃夹子；否则精灵僵尸 |
| 6 | 1/10 <2→常世吼；1/4 直升机 347；1/2 胡桃夹子；否则弓手 |
| 7 | 1/10 唯一→圣诞坦克 346；1/3 姜饼人；1/4 弓手；否则精灵僵尸 |
| 8 | 1/10 唯一→圣诞坦克；1/8 坎卜斯 351；1/3 胡桃夹子；1/3 直升机；否则弓手 |
| 9 | 1/10 唯一→圣诞坦克；1/10 唯一→常世吼；1/2 胡桃夹子；1/3 直升机；否则姜饼人 |
| 10 | 1/10 唯一→圣诞坦克；1/10 <2→常世吼；1/6 坎卜斯；1/3 胡桃夹子；1/3 直升机；否则精灵僵尸 |
| 11 | 1/10 唯一→冰女王 345；1/6 弗洛科 352；1/2 姜饼人；否则精灵僵尸 |
| 12 | 1/10 唯一→冰女王；1/10 唯一→常世吼；1/8 雪怪 343；1/3 姜饼人；否则精灵僵尸 |
| 13 | 1/10 唯一→冰女王；1/10 唯一→圣诞坦克；1/3 弗洛科；1/6 雪怪；1/3 姜饼人；否则直升机 |
| 14 | 1/10 唯一→冰女王；1/10 唯一→圣诞坦克；1/10 唯一→常世吼；1/3 雪怪；否则**不刷** |
| 15 | 1/10 唯一→冰女王；然后 1/10 <2→圣诞坦克；1/10 <3→常世吼；1/3 直升机；否则雪怪 |
| 16 | 1/10 <2→冰女王；1/10 <2→圣诞坦克；1/10 <4→常世吼；1/2 弗洛科；否则雪怪 |
| 17 | 1/10 <2→冰女王；1/10 <3→圣诞坦克；1/10 <5→常世吼；1/4 直升机；1/2 坎卜斯；否则雪怪 |
| 18 | 1/10 <3→冰女王；1/10 <4→圣诞坦克；1/10 <6→常世吼；1/3 胡桃夹子；1/3 坎卜斯；否则雪怪 |
| 19 | 1/10 <4→冰女王；1/10 <5→圣诞坦克；1/10 <7→常世吼；否则雪怪 |
| 20+ | !bossCap：rand(3) → 冰女王 / 圣诞坦克 / 常世吼 |

**波次公告的怪名 id 列表**（CheckProgress* 内 switch，南瓜 NPC.cs:79399-79452 / 霜月 79252-79315）：按上表"新登场怪"取；实现时照抄源码各 case 的 `GetInvasionWaveText(wave, ...ids)`。

## 4. 掉落（击杀即时；ItemDropDatabase.cs:337-391 + Conditions.cs:55-229）

- **PumpkinMoonDropGatingChance**（稀有掉落总门）：`denom = max(1, int((24-wave)/2.5) - (expert?1:0))`，wave 先 `+5`（专家）；`RollLuck(denom)==0` 才掉。
- **FrostMoonDropGatingChance**：同式但基数 28，专家再 `-2`。
- **Trophy 门**（两事件同式）：`wave>=15`；`denom = 4(w15/16)/3(w17/18)/2(w19/20+)`，专家 1/3 概率再 -1；`rng.Next(denom)==0`。
- **FromCertainWaveAndAbove(15)**：冰女王专属掉落 1914（1/15）。
- 注册明细：无头骑士 315→1857(1/20)；稻草人 305-314→1/10 三选一 1788/1789/1790；悲木 325→Spooky 木链（1835→1836 30-60；one-of 1829/1831/1835/1837/1845）+ 纪念碑 1855 + 专家 4444(1/5) + 大师 4941/4793；南瓜王 327→one-of 1782(+1783 50-100)/1784(+1785 25-50)/1811/1826/1801/1802/4680/1798 + 纪念碑 1856 + 大师 4942/4812；树怪 326→1729 木 1-3(专家1-4/大师2-4)，悲木额外 1729 15-30/25-40/30-50。霜月：常世吼 344→纪念碑 1962 + 1871(1/15) 否则 one-of 1916/1928/1930 + 大师 4944/4813；冰女王 345→纪念碑 1960 + 1914(1/15, wave≥15) + 1959(1/15) 否则 one-of 1931/1946/1947 + 大师 4943/4814；圣诞坦克 346→纪念碑 1961 + one-of 1910/1929 + 大师 4945/4794；精灵僵尸 338-340→1/200 one-of 1943/1944/1945；礼物窃贼 341→1869（仅圣诞季）。
- **游戏侧数据已全**：`src/data/vanilla-npcdrops.json` 含上述 25 条规则树；仅 `src/drops/NpcDrops.ts:123-126` 四条件硬编码 `return false`（注释"月事件未实现"）。

## 5. 推荐架构（game 侧）

**独立事件状态，复用四条既有管线**。原版把月事件建模为「负入侵组号（-1/-2）+ 两个 bool + 波次三字段」，与 `invasionType>0` 的军队入侵（前线推进/规模扣减）完全正交——塞进 invasionType 会污染 `invasionActive`/`tickInvasion`/公告文案，得不偿失。

新建 `src/world/MoonEvent.ts`（仿 `src/world/Invasion.ts` 的纯函数风格），状态挂 `World` 运行时字段（不存档，对齐原版：pumpkinMoon/snowMoon/waveNumber 均不进 WorldFile；Main.cs:48332 菜单即重置）：

```ts
// World.ts（Clock 之后、invasion 五元组之前）
moonEvent = { kind: 0, waveNumber: 0, waveKills: 0, totalInvasionPoints: 0 }; // kind: 1=霜月 2=南瓜月（对齐 ReportInvasionProgress icon）
```

复用点（已通，直接挂接）：
1. 刷怪率覆盖：`VanillaSpawner.getSpawnRate` 的 invaders 覆盖旁加同式分支（原版 NPC.cs:681-685：rate=20、max=⌊5×(2+0.3n)⌋=11），门=玩家在地表。
2. 进度条 UI：Game.ts 渲染注入入侵进度条处加 moonEvent 分支（name 走 Lang；pct=`waveKills/lookup[wave]`；显示门同 ±5000px 组号判定，用 `-kind`）。
3. 掉落 ctx：`NpcDrops.ts` 的 `NpcDropCtx` 加 `moonEvent?: { kind, wave }`，四条件按第 4 节公式实现。
4. BGM：`Music.ts` 的 `MusicInput` 加 `moonMusic`；选曲链尾（最高优先级，对齐 Main.cs:12914-12921），仅地表。

## 6. 实施步骤清单（每步：文件 / 锚点 / 要点）

1. **新建 `src/world/MoonEvent.ts`**：`REQUIRED_POINTS`（第 2 节表）、`POINTS_BY_NPC`（两表合并，key=vanillaId）、`WAVE_ANNOUNCE_IDS`（两事件各 20 条）、`startMoonEvent(w, kind)`（置位+wave=1+广播 wave1 文案+清 bloodMoon，Main.cs:10903-10940）、`stopMoonEvent(w)`（10879-10901）、`addMoonEventKill(w, vanillaId)`（79350-79372 计分/进波/公告）、`moonEventActive(w)`。
2. **`src/world/World.ts`**：加 `moonEvent` 运行时字段（不进序列化；serialize/load 均不碰）。
3. **`src/core/Game.ts`**（入侵物品链后、魔法武器分支前）：加 `vi_1844_PumpkinMoonMedallion` / `vi_1958_NaughtyPresent` 分支——门 `!clock.isDay && moonEvent.kind===0 && invasionType===0`（失败且非夜晚 → 复用 Toast.NightOnly）；成功 → `startMoonEvent` + 消耗 1 个 + `useTime=45`。
4. **`src/core/Game.ts`**（`crossed(0.25)` 黎明块，eclipse roll 之前）：moonEvent 激活 → 广播总分文案（Lang 键 `Misc.PumpkinMoonScore`/`Misc.FrostMoonScore`）；`waveNumber>=15` → 当日强制季节置位 + 公告（10827-10863）；`stopMoonEvent(w)`；随后对场上组号 -1/-2 的怪做 EncourageDespawn（对齐 NPC.cs:63029）。
5. **`src/core/Game.ts`**（`onEnemyKilled`）：入侵扣分之后调 `addMoonEventKill(w, enemy.vanillaId)`（内部查 POINTS_BY_NPC，0 分怪直接 return）。
6. **`src/world/spawn/VanillaSpawner.ts`**：
   - `setPlayerFlags` 加 `moonEvent?: { kind: number; wave: number }` 参数（Game 调用处传入）。
   - `getSpawnRate`：moon 激活且玩家在地表 → `{ spawnRate: 20, maxSpawns: 11 }`（NPC.cs:681-685）。
   - invaders 分支**之前**加月事件分支（原版顺序：DD2 → snowMoon → pumpkinMoon → eclipse，NPC.cs:2707/3134）：门 `spawnTileY <= groundLevel && !isDay`；按第 3 节两表实现 `pickFrostMoonSpawn(wave, rng, count, any)` / `pickPumpkinMoonSpawn(...)`；bossCap 用 `activeIds` 现算（315/325/327/328/344/345/346 的 npcSlots 和 ≥ 玩家数×11）。
7. **`src/drops/NpcDrops.ts`**：`NpcDropCtx` 加 `moonEvent?: { kind: 1|2; wave: number }`；四个 gate 条件按第 4 节公式实现（`ctx.isExpert/isMaster` 已有）；Game 掉落调用处注入 moonEvent。
8. **`src/core/Game.ts`**（进度条 IIFE）：moonEvent 分支——pct=`waveKills/REQUIRED_POINTS[wave]`，name 走 Lang；显示门 ±5000px（组号 `-kind`；MOON_EVENT_GROUP：305-315/325-330→-2，338-352→-1，原版 GetNPCInvasionGroup 尾段 NPC.cs:79140-79174）。
9. **BGM**：`src/data/Music.ts` `MusicInput` 加 `moonMusic?: number`；`pickMusic` 链尾落地；Game 音乐块计算 `moonMusic = kind===2 ? 30 : 32`（仅相机在地表带内）。
10. **（可选/二期）月亮贴图**：渲染端地表月亮绘制处按 kind 换 PumpkinMoon/SnowMoon 帧条（Main.cs:62400-62408），素材在 terraria-assets。
11. **（二期）Boss AI 家族**：aiStyle 57（悲木/常世吼）、58（南瓜王）、60（冰女王）、61（圣诞坦克）、62（玩具直升机）、63（弗洛科）未移植（Enemy.ts 分发表无 case）。一期可接受近似（fighter+弹幕），二期按 NPC.cs 对应 AI_XXX 1:1 补。
12. **城镇 NPC 抑制**（可选）：事件中旅行/无家 NPC 不生成（Player.cs:31954 flag6），对齐 Invasion.ts `invasionActive` 已有压制点平移。

## 7. 依赖缺口核对

| 项 | 状态 |
|---|---|
| 物品 1844/1958 | **已注册**（`vi_1844_PumpkinMoonMedallion`、`vi_1958_NaughtyPresent`；配方在 vanilla-recipes.json）。缺使用分支（步骤 3） |
| 波怪 NPC 305-352 | **vanilla-npcs.json 全齐**（含 339/340、349 变体；315/325/327/344/345/346 lifeMax 齐备） |
| 掉落规则 | **vanilla-npcdrops.json 25 条全在**；仅 gate 条件求值待实现（NpcDrops.ts:123-126） |
| BGM | MUSIC 表已有 30/32；`public/audios/music/Music_30.mp3`、`Music_32.mp3` 存在 |
| 本地化 | `Game.FirstWave/Wave/FinalWave/InvasionWave_Type1..6`、`Misc.PumpkinMoonScore/FrostMoonScore` 均在 zh-Hans.json |
| AI 家族 | 3/22/25/26 已有（稻草人/树怪/僵尸系=fighter、胡闹鬼=ghost、礼物窃贼=mimic、地狱犬+无头骑士=charger）；**缺 57/58/60/61/62/63** |

## 8. 风险点与并行改文件顺序

- **与日食代理的冲突面**：日食改 Game.ts 的物品分支/crossed 钩子/音乐/VanillaSpawner eclipse 段——与本任务步骤 3/4/9 同文件同函数。**串行**：日食代理先落，本任务再上（月事件分支全部插在日食分支之后，语义上原版也是 eclipse 在 pumpkin/snow 之后）。
- **计分注意**：进波时 waveKills 直接清零（不结转），且 `addMoonEventKill` 必须在掉落结算之后同帧调用（原版 checkDead：NPCLoot → CheckProgress，NPC.cs:79020-79021），避免"本波掉落用了旧 wave"。
- **霜月 wave 14 可能空刷**、南瓜月 wave 19 同理——是原版行为（无 else 兜底），不要"修"。
- **专家/大师**：项目当前 `weather.update` 传 `expertMode: false`（Game.ts），大师乘区 2.5 暂不可达，公式仍按原版实现。
- **血月互斥**：startMoonEvent 会清 `bloodMoon`（Main.cs:10905-10906/10925-10926），且 UpdateTime 每帧 pumpkinMoon 时也压 snowMoon/bloodMoon（Main.cs:64300-64306）——在 Game 的血月 roll 前加 `moonEvent.kind===0` 门。

**串行顺序**：①日食代理完成 → ②本方案（Game.ts 挂钩最后落） → ③Boss AI 家族二期（57/58/60/61/62/63）。
