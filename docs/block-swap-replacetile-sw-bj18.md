# SW-BJ18：块换写面架构债——ReplaceTile 原位重写（2026-09-07）

> 阶段一侦查产出 + 阶段二落地记录。标杆：`Terarria1457/Terraria/WorldGen.cs`
> `ReplaceTile`(:63061-63283) 族；增量对照 1458（ReplaceTile 本体与 Player 块换面
> **逐字节全等**，仅 GetBestPickaxe 定义位次平移——/tmp 对拍 2026-09-07，零语义差）。
> 上游：SW-BJ12（块换门禁矩阵，`// SW-BJ12` 标记区 Game.ts:22041-22204）、
> SW-BJ10（squareTileFramePlatform 平台帧面）。
> 方法论：campaign-playbook 每刀 Checklist（先定谳再动刀/最小刀/守卫测试）。

---

## 0. 原版拓扑（调用方全景）

| 调用方 | 位置 | 参数 | 备注 |
|---|---|---|---|
| Player 块换 | Player.cs:40218 `WorldGen.ReplaceTile(tileTargetX, tileTargetY, type, style)` | createTile+placeStyle（群系炬/篝火 style 覆写 :40210-40217） | 外门 = PlaceThing_ValidTileForReplacement(:40232-40360) 全段；成功 → canUse=false + SendData(17,21) + SetItemTime(num4+num5) + SetItemAnimation + PlaceIt_AutoPaintAndActuate(:40221-40227)。**不经 PlaceTile/清格/支撑/实体门** |
| 联机中继 | MessageBuffer.cs:1262 case 21 | 网络参数直传 | ReplaceTile 自带 WouldTileReplacementWork 内门（:63064）= 对远端操作的权威复验 |
| 液体合并 | Liquid.cs:1372 `!tile.active() || !ReplaceTile(x,y,liquidMergeTileType,0)` | style 恒 0 | **拒绝即回落** `KillTile+PlaceTile`（:1374-1375）——证明拒绝表是承载面；tileSolid[546] Swap 技巧（:1371）绕格栅误判 |
| 墙替换 | WorldGen.cs:63044 区（ReplaceWall，独立函数） | — | 同族不同函，本刀不涉 |

1458 增量：`WorldGen.ReplaceTile`(:63069) / `WouldTileReplacementWork`(:63217) /
`PlaceThing_TryReplacingTiles`(:40154) / `PlaceThing_ValidTileForReplacement`(:40230)
与 1457 逐字节全等（diff 实证），数值面零变更。

---

## 1. 三张表（逐字段行号，1457）

### 1.1 保留表（ReplaceTile 写面【不触碰】的旧格字段）

| 字段 | 行号锚 | 语义 |
|---|---|---|
| `active()` 位 | :63111-63151 全函数无写 | 原 Tile 对象原位改写，格保持活性 |
| `wire()` 四色位 | 同上（全函数无 wire 访问） | 红蓝绿黄导线穿越态逐位保留 |
| `actuator()` 挂件位 | 同上 | 致动器挂件保留（新块仍挂致动器） |
| `inActive()` 致动态 | 同上 | **F2**：已致动（隐形）旧块 → 新块保持已致动；未致动 → 保持未致动 |
| `slope()` / `halfBrick()` | :63125-63134 | **F3**：`flag=!CanPoundTile(x,y)` 以【新 type】求值（:63115 已先改型）；CanPoundTile 过门 → slope/half **原值保留**；拒 → `t.slope(0); t.halfBrick(false)`。平台↔平台恒保（:63126-63129 `flag=false`） |
| `frameX`（单格路径） | :63114-63123 | 单格重写只改 frameY（平台/火把），frameX **不动**——火把锚帧(:63120-63123 只写 frameY=style*22)、普通块纹理变体随之保留 |
| 液体 `liquid/liquidType` | 全函数无访问 | 液体数据驻留本格（与放置链「液体零写入」同口径） |
| `wall` 墙体 | 全函数无访问 | 背景墙不动 |
| 命中积累 HitTile | Player.cs:40205 `ClearMiningCacheAt(...,1)` | 交换成功拍清积累（本仓 hitTiles.clear :22205 已接） |

### 1.2 清除表（ReplaceTile 写面【主动清除/重写】的字段）

| 字段 | 行号锚 | 语义 |
|---|---|---|
| `type` | :63115（单格）/:63175（域格） | `t.type = targetType` 原位重写 |
| `frameY`（平台/380） | :63116-63119 | `= targetStyle * 18` |
| `frameY`（火把） | :63120-63123 | `= targetStyle * 22`（frameX=锚保留） |
| 块漆+块涂层 | :63124 `t.ClearBlockPaintAndCoating()`；域路径 :63178 逐格 | Tile.cs:934-939 三清（color/invisibleBlock/fullbrightBlock，**只清方块侧**，墙漆/墙涂层不动） |
| 域路径全帧 | :63175-63177 | `frameX = style*(areaW*18)+i*18+offsetX; frameY = j*18+offsetY`（箱 2×2/柜 3×2/篝火 3×2） |
| 邻接植物 | :63113 `ReplaceTile_EliminateNaturalExtras`(:63153-63166) | 上邻 ∈ ReplaceTileBreakUp（TileID.cs:245，36 件：苗/草/药草/小饰族）或 165@frameY{36,54,90} → KillTile(x,y-1)；下邻 ∈ ReplaceTileBreakDown（:247，9 件藤蔓/垂饰族）或 165@frameY{0,18,72} → KillTile(x,y+1)。**注意在 type 重写之前**执行 |
| 邻墙帧 | :63146-63149 `TruncatesWalls[target] != TruncatesWalls[type]` → SquareWallFrame | TruncatesWalls（TileID.cs:365）={54,328,459,748}。本仓墙帧绘制期虚拟化 = 架构 no-op（Game.ts:20163-20170 同判登记），不移植 |
| 尾帧重算 | :63150 `SquareTileFrame(topLeftX, topLeftY)`（域路径 :63181-63187 逐格） | TileFrame 3×3：普通块 cosmetic 帧按邻域重算（本仓绘制期虚拟化等效）；平台连接帧 = TileFrameImportant 平台支（本仓 squareTileFramePlatform，SW-BJ10） |
| 旧块物品 | :63079 `KillTile_DropItems(x, y, tileSafely, includeLargeObjectDrops: true)`(:64461-64475) | **掉旧块物一次**。includeLarge=true 使箱 21/467/柜 88/篝火 215 走 GetItemDrop_Chests(:58489)/Dressers(:50297)/Campfire(:50481) 按【旧帧 style】掉真物品（:64485-64501）；普通块走 GetItemDrops switch（苔→石 3、苔砖→灰砖 129、草族→泥 2、灰烬草→172…:64503-64549） |

### 1.3 拒绝表（ReplaceTile 及其前置门【拒绝交换】的条件）

| 门 | 行号锚 | 拒绝条件 |
|---|---|---|
| WouldTileReplacementWork 族配对 | :63237-63244 | 放置物/目标至少同属一有效族：双 validSolid(:63247-63258 = tileSolid&&!solidTop&&(rope‖!frameImportant)) / 双炬(:63260) / 双篝火(:63265) / 双平台(:63280) / flag4（两侧皆「实心或平台」，:63241）/ 双箱(:63270) / 双柜(:63275) |
| Conversion.Grass / 633 | :63216-63218 | 放置物为草族 {2,23,199,109,477,492} 或 633 → 拒 |
| 绳邻特例（D6） | :63220-63236 | 目标为绳（tileRope）且 InWorld(±2)：放置物 314 且邻格有 314 → 放行；放置物平台且邻格有平台 → 放行；放置物 380 且邻格有 380 → 放行。**仅当外门 :40328-40334 先放行才可达** |
| Chest.IsLocked | :63242（flag5 尾项） | 目标为锁定箱（Chest.cs:295-307：21 型 frameX 锁带域 / 467 style13）→ 拒。⚠️ 仅 WouldTileReplacementWork 消费面可达——Player 双箱族支 :40311-40317 先早退，**箱↔箱交换不查锁** |
| IsTileReplaceable | :62825-62872（:63068 内门 + Player.cs:40182 外门） | wall==350 保护墙拒；上邻 80 仙人掌/488 倒木拒；上邻 PreventsTileReplaceIfOnTopOfIt（树干帧域/棕榈 323 帧域）异型拒 |
| 玩家侧黑名单 | Player.cs:40245-40271 | 绳类物品（SortingPriorityRopes {85,965,2996,3077,3078}）/苔放置(:40249)/DoesntPlace{2,60,70,109,199,23,661,662,633}(:40253)/DoesntGetReplaced{58,225,171,127,481,482,483,423}(:40257)/tileCut 目标(:40269) |
| 重力/格栅 | Player.cs:40376-40411（CheckSpecificValidtyCaseForBlockSwap） | C1：目标受重力 ∧ 放置物非受重力 ∧ 镐力<110 ∧ 上邻受重力 → 拒；C7：目标 546/557 格栅含液 → 拒 |
| 平台实体门 | Player.cs:40363-40374 | 目标平台/380 ∧ 放置物非平台 ∧ 玩家盒相交 → 拒 |
| 掉落门 | Player.cs:40348-40354 | !IgnoresTileReplacementDropCheck{158,30} ∧ GetItemDrops(旧)==放置物品 → 拒（防土换土） |
| FTW 脆蜂蜜 | Player.cs:40344-40346 | 目标 230 ∧ getGoodWorld → 拒 |
| 同型 | Player.cs:40340-40342 | 通用段同型拒（族段同型异 style 放行 :40273-40325） |
| **无「非空箱」拒绝支** | —（反证） | ReplaceTile 全函数 + WouldTileReplacementWork **无箱内容物检查**：非空箱可换，内容保留（Chest 实体按锚格定位存续，仅帧重写），旧箱物品经 :63079 掉落。锁定箱在箱↔箱族支不查（见上） |

---

## 2. 本仓两段写 vs 原位重写：语义差清单（BJ12 缺口 → ReplaceTile 行号映射）

本仓现役写面（Game.ts:22109-22224 + 回落通用放置链）= `breakTile(掉旧块) + 通用 place(放新块)`。
`breakTile` = 原版 KillTile 1:1（含 CheckTileBreakability==2 上邻保护门 :19531 /
CheckTileBreakability2 非空箱存活门 :19539 / 成就窗 :19551-19559 / DropBait / 掉落 /
KillTile 尾液体灌填 :20150-20183 / setTile(0) 清 half+slope+漆+WIRE_ACTUATED
TileStore.ts:262-276）。与 ReplaceTile 的逐项差：

| 缺口 | 本仓两段写行为 | 原版行为（行号） | 映射 |
|---|---|---|---|
| **F2 致动态不保** | breakTile→setTile(0) 清 WIRE_ACTUATED（bit32）→ 新块复活为可见/实体 | ReplaceTile 全函数不写 wire/inActive 位（:63111-63151 反证）——旧块已致动则新块保持已致动，挂件位(bit16)两边都保留 | :63111-63151（无写位=保留面） |
| **F3 坡保留** | setTile(0) 无条件清 slope+half → 坡上块换后变整块 | :63125-63134 以新 type 求 CanPoundTile(:81972)，过门则坡/半砖原值保留 | :63125-63134 |
| **D2 篝火燃态不保** | break 清帧 → 通用放置重写 frameY=dy*18 → 燃态(frameY≥36)丢失 | :63102-63103 `flag = t.frameY >= 36` → frameOffsetY=36（燃态跨 style 交换保留） | :63100-63103 |
| **D3 非空箱不可换** | breakTile 头 :19539 shouldTileSurviveAt（CheckTileBreakability2 :62515）非空箱存活 → 早退；且清格相 placeObstructionClearable 拒箱 → 整个交换静默无效 | 无内容物检查——非空箱可换、内容保留、旧箱物品掉落（:63079 includeLarge 面） | :63079+:63094（反证见 1.3 末行） |
| **D4 亡命箱信号未接** | 同上根本不可达 | :63089-63093 `IsChestRigged(anchor)`(:36127 = 467 frameX/36==4) → `Wiring.HitSwitch(anchor)` + SendData(59) | :63089-63093 |
| **D6 绳目标互换不接** | 通用门 `solidish(目标)` 拒绳目标（314 非实心）→ 平台上绳/380 上绳不可换 | :63220-63236 绳邻特例 + 外门 :40328-40334（目标绳 ∧ 放置物∈{314,380,平台} 放行） | :63220-63236 |
| **F4 级联保全面** | break 的瞬时失撑可误杀邻件（后置放置虽恢复支撑但级联已跑）；且回落通用链继承【支撑门/实体门/清格相】——原版 ReplaceTile 无这三门：悬空块可换、敌怪占格可换 | ReplaceTile 不破坏中心格 → 无瞬时失撑级联；无支撑/实体/清格门 | 反证（:63061-63083 无 KillTile(中心)） |
| 交换音 | break 音 + 'place' 音（通用尾 :23072） | 仅 KillTile_PlaySounds(:63078，旧块破坏音)，无放置音 | :63078 |
| 箱实体 | 空箱 swap：dumpChest + 通用链重登记（:20056/:22847） | Chest 实体存续不动 | 反证 |
| 亡命箱点击面 | （openChest :24126-24142 已有 IsChestRigged 式 hitSwitch——**仅开箱面**，交换面缺） | 交换面独立触发 | :63089 |

尘埃/成就/事件面：ReplaceTile :63073-63080 = 尘（KillTile_GetTileDustAmount fail:false
default=10）+ 破坏音 + 掉落 + AttemptFossilShattering(:63996, 404 化石连锁)；**无**
NotifyTileDestroyed/HandleMining 成就面（F6，本仓 byPlayer=false 已对齐 :22222 注）。

## 3. 风险面定谳

1. **BJ10 squareTileFramePlatform 组合顺序**：ReplaceTile 单格路径尾 :63150
   SquareTileFrame 的平台面 = TileFrameImportant 平台支。落刀序：先 setTile（frameY=
   style*18）→ 后 squareTileFramePlatform(x,y)（其 3×3 直写 frameX 连接帧 + markDirty）。
   与通用放置链（:22839-22841）同位次，平台换平台/块换平台两向均覆盖。
2. **BJ12 例外门组合位次**：例外矩阵（C1 重力/C5 掉落/C6 黑名单/C7 格栅/A 冷却/B2 伤害）
   全部保持在 ReplaceTile 之前（:22046-22204 原位不动）——语义=「拒绝在进入 ReplaceTile
   之前」；replaceTileInPlace 体内仅保留 :63068 IsTileReplaceable 内门复验（纯函数，
   :22112 已同判，运行时不可达拒绝态，按原文带入作防御面）。门序零重排 = BJ12 29 测
   零回归的结构保证。
3. **幽灵格净化（2026-09-07 已落盘）**：净化后世界无 active(false)+type≠0 格；本刀
   写面按裸 active()（st.hasTile/flags bit0）判读 = 原文 tile.active() 口径，与净化
   语义无耦合。Swap 入口 :22020 `flags!==0` 门 + replaceTile 体内无幽灵特判。
4. **D3/D4/D6 取舍**：D3（非空箱可换）、D4（亡命箱信号）随原位重写**本刀自然获得**
   （原位路径不存在 shouldTileSurvive 门；hitSwitch 消费面已有 Wiring.hitSwitch 1:1）。
   D6（绳目标互换）**分期**——需重排通用门 `solidish` 表达式（BJ12 29 测锁定面）+
   外门绳支 :40328-40334 + WouldTileReplacementWork 绳邻支 :63220-63236 三件套，
   且收益面窄（平台/380 上绳邻接互换）；坐标见 §6。
5. **AttemptFossilShattering**（:63080）：本仓破坏域整体未建 404 化石连锁
   （breakTile 亦无），单在交换面接入会造成域不对称——随破坏域债统一登记不移植。
6. **MP 面**：写面经 setTile/setSlope → netReporter（TileOp SetTile/SetSlope）逐格
   上报；原版单消息 17/21 → 本仓多操作等效终态。漆无 TileOp 通道=域内既有登记。

## 4. 集成图（阶段二落点）

```
tryPlace
 └─ 方块交换段 Game.ts:22003-22224（BJ12 门矩阵：C1/C5/C6/C7/A1/B2 原位保留）
     ├─ swapOk / styleVerdict（族 verdict，:22046-22108 不动）
     ├─ isTileReplaceable + 冷却闸 + 镐门 + tileHitDamage + addDamage（:22112-22204 不动）
     ├─ hitTiles.clear + pickSeg 暂存（:22205-22218 不动）
     └─ ★SW-BJ18：this.replaceTileInPlace(tx, ty, tileIdHere, style)   ← 替代 breakTile+回落
         ├─ isTileReplaceable 复验（:63068）
         ├─ moveReplaceTileAnchor（:63190-63207：箱 frameX%36/18、柜/篝火 %54/18+%36/18）
         ├─ 尘（10 粒，:63073-63077 GetTileDustAmount fail:false default）+ killTileBreakSound（:63078）
         ├─ replaceTileDropOld（:63079 includeLargeObjectDrops 面：styleDropVidOfFrames
         │   覆盖 21/467/88/215/19/4 + def.drop + place_v_ 兜底=breakTile 同链）
         ├─ 单格路径（:63111-63151）：
         │    eliminateNaturalExtras（:63153-63166 → breakTile(x,y±1)）
         │    → setTile(type, 旧帧; 平台/380 frameY=style*18, 火把 frameY=style*22)
         │    → paint=0 + coat &= ~COAT_BLOCK_MASK（:63124）
         │    → !canPoundTile(new)（平台↔平台豁免）→ setSlope(x,y,0)（含清 half）
         │    → 平台目标 squareTileFramePlatform（:63150 平台面）
         ├─ 域路径（:63168-63188）：箱 2×2 / 柜 3×2 / 篝火 3×2+燃态 offset
         │    亡命箱（旧锚 467 frameX/36==4）→ wiring.hitSwitch（:63089-63093，D4）
         │    箱/柜实体登记存续（D3：无 dumpChest/重登记）
         └─ 调用位尾奏（vanilla :40221-40226）：消耗门 + useTime=方块段+blockSwapPickSeg
             + placeItAutoAcc（AutoPaintAndActuate 等价）+ return（不回落通用放置链）
```

## 5. 分期计划

- **本刀（BJ18）**：replaceTileInPlace 族 + 块换调用位接入 + F2/F3/D2/D3/D4 +
  交换音/箱实体/级联面收敛；守卫测试 tests/sw-bj18-replace-tile.test.ts。
- **分期（登记）**：① D6 绳目标互换（§6 坐标）；② AttemptFossilShattering（随破坏域
  化石连锁债）；③ MP 单消息 17/21 合并上报（协议面，现多操作等效）；④ 墙帧
  SquareWallFrame 臂（虚拟化架构 no-op，永不动）。

## 6. D6 分期坐标（后车任务书）

> ★SW-BN5 2026-09-08 清偿：本节三件套已落刀（swapOk 基门 ropeTargetArm +
> wouldTileReplacementWorkRopeArm 模块层 + refine 块 ⑤ 位分流），守卫 =
> tests/sw-bn5-shop-drop-closeout.test.ts D6 段。下文坐标保留作实施记录。

1. Game.ts 通用门 `swapOk` 表达式（:22046-22048）：加绳目标支——目标 sheet ∈
   Main.tileRope 仓表 且 placeTileSheet ∈ {314, 380} ∪ PLATFORMS_SHEETS → 放行
   （外门原文 :40328-40334）；绳物品侧 ROPE_ITEM_VIDS 拒门（:22061）**保留**
   （原文 :40245-40247 优先于一切）。
2. Game.ts 模块层新增 `wouldTileReplacementWorkRopeArm`（:63220-63236 1:1）：
   InWorld(±2) 内左右邻格 active 且同型（314↔314 / 平台↔平台 / 380↔380）→ true。
3. 拒绝面回归：非绳目标零影响（支路以「目标为绳」为前置， 现 solidish 门对绳目标
   恒 false=本支现状）。
4. 测试：绳上放平台（邻有平台/无平台两态）、380 上绳、绳物品仍拒。

## 7. 阶段二落地记录（2026-09-07）

- Game.ts 模块层（:1336-1346 区）：`REPLACE_TILE_BREAK_UP_SHEETS`/
  `REPLACE_TILE_BREAK_DOWN_SHEETS`（TileID.cs:245/:247 原表逐项,sheet 域）。
- Game.ts `replaceTileInPlace`/`moveReplaceTileAnchor`/`replaceTileDropOld`/
  `eliminateNaturalExtras`/`replaceTileSingle`/`replaceTileArea`
  （:21704-21878 区,`// SW-BJ18 2026-09-07` 标记 + 原文行号锚）。
- Game.ts 块换段调用位（:22447-22477）：breakTile 退役（其它 30 处 breakTile
  调用方零触碰）,尾奏消耗/双段冷却/自动附件 1:1,成功即 return 不回落通用放置链；
  行为录制单条 `cause:'block-swap'`（from=旧 to=新）。
- tests/sw-bj18-replace-tile.test.ts（11 测）：坡保留/坡清除(ForbidsSloping)/
  致动+挂件+导线位保持/漆+块涂层清除/未致动保持/非空箱可换+实体存续+锚归一/
  亡命箱信号/篝火燃态两态/旧块掉落一次/平台帧/EliminateNaturalExtras/尾奏双段冷却。
- 结构锁随刀更新：tests/sw-bj10-platform-place-render.test.ts
  「squareTileFramePlatform 消费位」3→4（+replaceTileSingle = ReplaceTile :63150
  平台面）；「块换录制」两段录制锁改单条 block-swap 锁（原版成功拍不经
  KillTile/PlaceTile 的行为面）。

## 8. 回归矩阵（2026-09-07 实测）

| 域 | 文件 | 结果 |
|---|---|---|
| 块换 | sw-bj18(11)+sw-bj12(29)+blockswap-style-families | 全绿 |
| 平台（BJ10 组合） | sw-bj10/platform-hammer/sw-bj3/sw-be1-autoslope/platform-stair-transition/platform-stairs-draw | 155 全绿 |
| 挖掘 | mining/ghost-tile-mine-gate/kill-tile-consumers-k1/killtile-tail-liquid/multi-tile-drop/can-kill-tile-full-gate | 全绿 |
| 放置 | cage-placement/assorted-place-gate/dye-plant-place/moss-place/block-tile-backfill/gf-cuttiles-pot/melee-cancutile-gate/net-cutextratiles | 50 全绿 |
| 存读档 | load-progress/load-settle-dedupe/banner-kills-save/lazyload-guards/loadout-share-parity/golden-wld-meta/ghost-purge-accept/ghost-preserve | 见下登记 2 红 |
| tsc | 全仓 `npx tsc --noEmit`（game/tsconfig include src+tests） | core/Game.ts **0 错**（全仓存量红见下） |

**域外存量红（他刀在途,本刀零涉,登记不落刀）**：
1. `tests/ghost-place-swap.test.ts:585`「活性铁矿照常闪光 expected 0 to be greater
   than 0」——矿物闪光族 2026-09-07「闪光可见度批」（src/render/TileParticles.ts
   17:03,`dust:43` 原版尘渲染改道 dust 池）后 `g2.particles` 面陈旧；归属闪光可见度批。
2. `tests/banner-kills-save.test.ts:302`「旗杀记账包在交互门内」结构锁——平行刀
   落「石化旁路（H2-2）」（`opts?.petrifyBypassInteractionGate` 并臂）未同步锁文本
   （锁期待 `if (enemy.playerInteracted === true) {` 单臂）；归属石化旁路刀。
3. 全仓 tsc 存量 ~380 错（src/fx/gen/px_*.gen.ts 家族 + tests/ 诸文件）——与本刀
   无涉（core/Game.ts 零诊断,本刀改动仅该文件内私有方法+两 Set+调用位,无新增
   导出面）；「全仓 1 错」基线与本实测的出入归属并行在途车道（18:03 仍有他人
   编辑落盘）。
