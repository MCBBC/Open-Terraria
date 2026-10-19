# DungeonPass.ts ↔ 1456 反编译源码 1:1 审计（2026-08-16 执行，按 08-13 立项）

范围：普通世界（非秘密种子）Legacy 链
`SetupDungeonDataVariables → MakeDungeon → LegacyDungeonLayoutProvider →
LegacyDungeonHall / LegacyDungeonRoom / LegacyEntranceDungeonHall / LegacyDungeonEntrance`
+ 它们调用的 DungeonUtils 函数 + MakeDungeon 特征管线逐段。
权威：`Terarria1456/Terraria.GameContent.Generation.Dungeon*` + `Terraria/WorldGen.cs:14816` 注册段。
1405（`Terarria1405/WorldGen.cs:18040-18140` 旧 Dungeon 链）仅作交叉参照。

**结论：8 处真偏差已修（JS 侧），4 处已核实为可接受近似（未动，含理由），
oracle（tools/golden/caves-oracle.cs）与 JS 共享其中 7 处偏差——转录时须逐条同步，清单见 §5。**

---

## 1. 调用图（普通世界路径，掷骰按消耗序）

```
WorldGen 注册段 cs:14816（Dungeon pass #36；Pyramids #44 / LihzahrdTemple #50 都在其后！）
├─ SetupDungeonData(i, i==0)                      无掷
├─ SetupDungeonDataVariables(i, genRand)          [world 流]
│   ├─ wallVariants / platformItemType / chandelierItemType / doorItemType   无掷
│   ├─ shelfStyles[0..2] = Next(9,13)×3（互异重掷）              DungeonCrawler.cs:243-254
│   ├─ lanternStyles[0..2] = Next(7)×3（互异重掷）               :255-266
│   └─ bannerStyles 固定 10-15；useSkewedDungeonEntranceHalls = Next(4)==0   :267-274
│      （PrecalculateEntrancePosition=false → 入口位置预掷段整段跳过）
├─ 深度锚 cs:14828-14870：y0 = trunc((ws+rock)/2)+Next(-200,200)；
│   10 格实心探针 / 下扫 / 60 格回推（无其他掷）
└─ MakeDungeon(x, y)                              [world 流] DungeonCrawler.cs:327-505
    ├─ SetCrackedBrickSolidity(false)（481-483 非实心，pass 头 flipGenSolid）
    ├─ dungeonEntranceStrengthX/Y/X2/Y2 = Next(25,30)/Next(20,25)/Next(35,50)/Next(10,15)
    ├─ num = maxTilesX/60；num += Next(0,num/3)；Steps=MaxSteps=num
    ├─ LegacyDungeonLayoutProvider.ProvideLayout → LegacyDungeonLayout(:25-98)
    │   ├─ （Legacy 入口 Precalculate=false → 无 -10+Next(20) 位移段）
    │   ├─ hallSettings.RandomSeed=Next()；roomSettings.RandomSeed=Next()   ← 2 颗纯耗
    │   ├─ 起始房 RoomSettings{StartingRoom, RandomSeed=Next()}→GenerateRoom
    │   └─ while steps>0：bounds.Upd；steps--；roomDelay--；
    │       (roomDelay==0) & Next(3)==0   ← 非短路 &，恒耗一骰（:61）
    │       ├─ 真：roomDelay=5；Next(2)==0 →
    │       │    存 pos；hall(Next())；[Next(2)==0→hall(Next())]；room(Next())；还原 pos
    │       └─   否 → room(Next())（**pos 不动**）
    │       └─ 假：hall(Next())
    │   └─ 尾房 room(Next())（pos 不动）
    ├─ generatingDungeonPositionX/Y = 最高已生成房 InnerBounds 顶部中心（:374-396，瞬态）
    ├─ 爬升入口走廊循环（:415-449，guard=100）：
    │   ├─ roomDelay==0 && Next(5)==0 && posY>ws+100（&&短路）→
    │   │    存 pos；hall(Next())；room(Next())；还原 pos
    │   └─ LegacyEntranceDungeonHall（RandomSeed=world Next()）
    │       ├─ num2 = Next(5,9)                       :131
    │       ├─ num4 = Next(10,30)                     :136   ← 在方向掷之前！
    │       ├─ Next(3)!=0→×(1+Next(0,200)*0.01) / else Next(3)==0→×Next(50,76)*0.01
    │       │   / else Next(6)==0→vy×2                :148-158
    │       ├─ 逐循环：Next(6)×4（外圈盒）；敞开检测→TileRunner(Next(25,35),Next(10,20))
    │       │   [world 流内部]；Next(num2)→Next(1,3)
    │       └─ 收尾回写 genVars.generatingDungeonPositionX/Y = 走廊终点 :367-368
    │           ★**每条爬升走廊都覆写**——pass 终值=爬升终点（入口 X），非 :394 瞬态
    ├─ LegacyDungeonEntrance（RandomSeed：MakeDungeon_GetEntranceSettings 先耗 world
    │   Next() 一颗随即被 preSettings.RandomSeed 覆盖=纯耗）
    │   └─ 掷序（自种子）：Next(2,5)×3 → Next(8,16) → Next(4)/Next(3)×2 → Next(4)/Next(3)×2
    │       → Next(4)→Next(2) → Next(2)→Next(4) → Next(2)→Next(4) → Next(4)/Next(3)×2
    │       → Next(4)/Next(3)×2 → Next(2)→Next(4) → Next(2)→Next(4) → PlaceTile 门(3×Next(3))
    ├─ 全房/全廊 CalculatePlatformsAndDoors（Default 样式 Style=0：门/平台样式均**无掷**）
    └─ 特征序（每个 new DungeonGlobal* 自注册 dungeonFeatures）：
        EarlyDual(pit 循环) → Spikes → Doors → WallVariants → Platforms → BiomeChests
        → Bookshelves → BasicChests → bounds.Inflate(25) → Lights → Traps
        → GroundFurniture → Paintings → Banners → LateDual（Default 全空转）
```

房间/走廊共用谓词（DungeonUtils）：
`IsConsideredDungeonWall = Main.wallDungeon[{7,8,9,94..99}]`（Main.cs:10505-10515）；
`IsConsideredDungeonTile = Main.tileDungeon[{41,43,44,677,678,679}]`（Main.cs:7941-7946）；
Default 样式（GetCurrentDungeonStyle，DungeonGenerationStyles.cs:670-716）：Style=0、
全部 ItemTypes 数组空 → 门样式掷/平台样式掷/GetPlatformStyle **全不掷**；
`TileIsInStyle = type∈{brick,cracked}`、`WallIsInStyle = wall==brickWall`（:100-120）。

---

## 2. 逐条差异与修复（JS 侧行号=修复后）

### A. 结构链（严重度递减）

**A1【已修·严重】房间不该推进 generatingDungeonPosition** — `DungeonPass.ts:406-412`
- 原版：**全 Rooms 目录零赋值**（grep 实证），仅 `LegacyDungeonHall.cs:862` 与
  `LegacyEntranceDungeonHall.cs:367` 两处写；1405 的 DungeonRoom 同样只记 dRoomX 数组
  （Terarria1405/WorldGen.cs:20715）。房间后位置停在原地 → 循环 room-only 分支反复在
  同点叠房（原版地牢"房团"形态的来源）。
- JS 曾 `posX=trunc(px)`：起始房后首走廊起点、room-only 分支后续走廊全部瞬移错位。
- 修复：删除回写（EndPosition/Strength 仍存给 BasicChests 用）。
- ★oracle 共享此偏差（caves-oracle.cs:4495 `dgPosX=(int)px`），转录时须同步摘除。

**A2【已修·严重】入口走廊 steps 掷序** — `DungeonPass.ts:641-645`
- 原版：`Next(5,9)`(:131) → `Next(10,30)`(:136) → 方向/增幅掷(:148-158)。
- JS 曾把 steps 挪到方向掷后：strength 吃方向骰、方向骰吃 steps 骰，整条爬升走廊
  轨迹错位。1405 DungeonStairs（:19857-19863）同序佐证。
- 修复：`const steps = hri(10, 29);` 上移到 `num` 掷之后。★oracle 同步偏差（:4787）。

**A3【已修】入口门洞内半边墙回写缺失** — `DungeonPass.ts:979-994`
- 原版 LegacyDungeonEntrance.cs:600-613：门洞 15×3 清空时，
  `(num2>0 && x<val.X)||(num2<0 && x>val.X)`（val.X=num2<0 偏移-1 后的 zero.X）
  的格写 `wall=brickWallType`。JS 曾只清 active → 门洞内半边墙缺失
  （渲染 + wallDungeon 判定双差）。★oracle 同步偏差（:5117-5127）。

**A4【已修】gs.generatingDungeonPositionX 终值错** — `DungeonPass.ts:2507-2513`
（同步修注释：`GenState.ts:49-55`、`StructuresPass.ts:575-581`）
- pass 序：Dungeon #36 → Pyramids #44 → LihzahrdTemple #50（cs:14816/15426/15911 注册序）。
  cs:15450 金字塔回避带 / cs:15991 神庙镜像读到的 `generatingDungeonPositionX` 是
  **爬升走廊终点**（A2 引用的 :367 每条走廊覆写），:394 最高房中心只是瞬态。
- JS 曾回填 topX（把瞬态当终值）→ 金字塔回避带整体平移数百格。
- 修复：回填 `posX`（爬升终点=入口 X）。StructuresPass 消费端逻辑不变（仍读该字段）。

### B. 特征管线

**B1【已修】走廊门扫描窗 fluff** — `DungeonPass.ts:1027-1036`
- 原版 DungeonGlobalDoors.cs:56-64：`num4=10` 缺省（20 列窗）；仅房间门覆写
  OverrideWidthFluff=3。JS 走廊门曾 fluff=0（只扫门位单列）→ 大量走廊门在 JS 放不出。
  ★oracle 同步偏差（DDoor 默认 Fluff=0，:5435）。

**B2【已修】房间平台高度 fluff** — `DungeonPass.ts:172, 854/857, 1010/1013, 1034/1036, 1451-1454`
- 原版 DungeonGlobalPlatforms.cs:44-57：`num3=5` 缺省；房间候选带
  OverrideHeightFluff=3（CalculatePlatformsAndDoorsOnEdgesOfRoom 的 platformFluff=3）→
  房间平台扫 y±3、走廊/入口候选 ±5。JS 曾恒 5。DPlat 增 `hf` 字段承载。

**B3【已修】书架平台样式用错表** — `DungeonPass.ts:1759-1766`
- 原版 Bookshelves.cs:112-138：`frameY = 18 * shelfStyles[墙变体三档]`
  （shelfStyles=SetupDungeonDataVariables 的 Next(9,13)×3；GetPlatformStyle 对 Default
  恒 -1 不覆写）。JS 曾写 `18*platformStyle`（6/8/7——那是 dgPlatforms 平台件的样式，
  引用注释错指 DungeonGlobalPlatforms:158）→ 书架全部长成主题平台贴图。

**B4【已修】吊灯资格门** — `DungeonPass.ts:1842-1855`
- 原版 Lights.cs:77-78：吊灯支要求 `GetStyleForWall!=null`＝墙==主砖墙（Default
  WallIsInStyle 只有 brickWall 命中）；变体墙(94-99)返 null → 跳过吊灯直接落灯笼。
  JS 曾变体墙也试吊灯（Next(7) 掷序两侧一致，仅放置集分叉）。★oracle 同步偏差。

---

## 3. 已核实为一致的段落（抽样列举，防复审重复劳动）

- **LayoutProvider 主循环**：`(roomDelay==0)&Next(3)==0` 非短路恒耗、两颗模板种子
  纯耗、hall+room 分支存/还 pos、room-only 分支不动 pos（A1 修复后全对齐）。
- **LegacyDungeonHall**：掷序（4+Next(2)→35+Next(45)→NextDouble(0.166)→Next(5)→
  方向 do-while→边界 else-if 链→num 调整）；float32 逐运算 fround 已复刻（:549）；
  D2 残留偏差（else-if 链只写 zero 不重算 zero2）已在 z2=-zero 约定下对齐；截停四门
  用 zero（=sd）非 val2；zigzag 翻转 `cnt>Next(10,20)` 短路语义一致。
- **LegacyDungeonRoom 主体**：15+Next(15)/10+Next(10)/斜率 Next(-10,11)×0.1、
  0.8/0.5 双盒、IsHigherOrEqualTieredDungeonWall（普通世界=wallDungeon 判定）等价。
- **pit 陷阱**（EarlyDual 尾循环 + DungeonPitTrap）：掷序 x3→y2→Next(8)→Next(6,10)→
  Next(8,19)→Next(19,46)→Next(6,10)（makeNextPitTrapFlooded 短路不掷）；
  `protectedDungeonBounds` 恒空（grep 实证）——C# 实际挡板是 DungeonPitTrap 自身
  Bounds + CanGenerateFeatureAt(仅 Paintings/WallVariants 放行)，JS pits/feat!==2
  建模等价；压力板段 flag3=true 整段跳过 ✓。
- **Doors 主体**：style 掷 Next(3)→13/16/17/18；选择窗/上下扫/双清侧/尾 8 行/端点两砖
  全对齐（B1 修复后）；CanKillTile 近似见 §4-B。
- **Spikes/WallVariants/Platforms/Banners/Paintings/BasicChests**：采样掷序、
  near 检查、选型重掷、GetDungeonLootAndChestStyle（lootStyle 8 循环+ws+50 覆写；
  itemType 恒非 0 → `Next(2)` 早退掷永不触发）逐项核对一致；
  PlaceWall=`(1..w-2/j:1..h-2)&&wall==0`（cs:75189）与 JS 门一致。
- **入口结构**：垛口/顶齿/下延/0.5 塔/平台候选/第二段全链掷序与边界一致；
  `Math.Min(maxTilesX-1,…)` 误钳 Y 的原版 bug（:469-470）在实际值域内不可达，不仿。
- **入口三掷归位 Dunes**（主题掷+2 颗入口类型掷+entrance 种子）已由 DunesPass 落盘
  gs.dungeonTheme/gs.dungeonEntSeed，本 pass 头只剩 shelf→lantern→skewed（头部注释
  本次已同步改写，原注释描述的"延后到本 pass 头"是 08-16 改造前的旧状态）。

## 4. 已核实但不修的近似（留档）

- **A. prot() 房间保护返 Walls**（:279-288）：Legacy 管线从不调 CalculateRoom →
  shape data 恒空 → 原版 GetProtectionTypeFromPoint 恒 None。JS 返 Walls 只影响
  "同值重刷跳过"，最终方块态零差（既有 2026-08-13 结论，维持）。
- **B. dgDoorsF canKill**：C# CanKillTile 只挡 IsLockedDoor（frameY∈[594,646]——本
  pass 造的门 style 13/16/17/18 均不在该带 → 生成期不可达）与"上方是箱族"支撑保护
  （JS 挡箱体本身，语义不同但走廊 ±1/±2 列撞箱支撑属罕见边角）。不修，转录 oracle
  时保持同款。
- **C. dgPitTrap 裂砖集**：C# 挡全部 481-483，JS 只挡本主题 crack——单地牢内只有一种
  裂砖存在，等价。
- **D. ClearEverything 与 JS"flags=0 保留 type"**：C# 清 type 归 0，JS 留旧 type
  （inactive 态）。哈希若按全字段比会差、按 active+wall+type of active tiles 比为零差。

## 5. oracle 转录清单（tools/golden/caves-oracle.cs，主线占用中，待同步）

行为修正（与 JS 本次修复一一对应）：
1. `DgRoom` 尾部 `dgPosX=(int)px; dgPosY=(int)py;`（:4495）删除（A1）。
2. `DgEntHall` `steps=Next(10,30)` 上移到 `num=Next(5,9)` 之后（:4776-4790）（A2）。
3. 入口门洞 15×3 清空循环补 `(num2>0&&x<valX)||(num2<0&&x>valX)→wall=dgWall`
   （valX=num2<0 时 cx-1 后）（A3）。
4. `DDoor` 走廊门 Fluff=10（房间 3 不变）（B1）。
5. 平台候选带高度 fluff：房间 3 / 走廊·入口 5（B2）。
6. 书架平台 frameY=18*shelfStyles[墙变体档]（B3）。
7. 吊灯资格门：wall==主砖墙（B4）。
8. `dgPosX` 终值（爬升终点）作为金字塔/神庙段消费的 generatingDungeonPositionX（A4）。

转录所需 GenState/参数字段（oracle 侧需等价承载）：
- 读：`dungeonTheme`（Dunes 掷）、`dungeonEntSeed`（Dunes 掷）、`dungeonSide`、
  `dungeonLocation`（Reset 掷）、`crimson`、`lavaLine`、`worldSurface`、`rockLevel`。
- 写（本 pass 收尾回填）：`generatingDungeonPositionX`=爬升终点、`dungeonY`=老头锚 Y
  （=Main.dungeonY，第二段 0.5 盒底）、`dungeonEntX/dungeonEntY`=入口门厅站立点。
- 结构参数（1456 常量，Default 世界全部=1.0/0.5）：hallStrengthScalar=hallStepScalar=
  roomStrengthScalar=roomStepScalar=globalFeatureScalar=dungeonStepScalar=1.0、
  hallInteriorToExteriorRatio=roomInteriorToExteriorRatio=0.5、
  hallSlantVariantScalar=roomSlantVariantScalar=1.0、CrackedBrickChance=0.166、
  ZigzagChance=0.66（DungeonHallSettings.cs:14-21）。

## 6. 验证

- `npx tsc --noEmit`：DungeonPass/StructuresPass/GenState 零错（余错均为未触碰的
  既有测试文件）。
- `npx vitest run tests/dungeon-walls.test.ts`（砖 21088/墙 28548，结构完整）✓
- `npx vitest run tests/chest-frames.test.ts` ✓
- `npx vitest run tests/dungeon-spawn.test.ts`（守卫 68 池 + 常规池双用例）✓
- 未跑 tests/caves-checkpoint.test.ts（主线占用；A1/A2/A3/B1/B4 会使 dungeonL 及
  后续检查点哈希相对**当前** oracle 漂移——属预期，待 oracle 按 §5 同步后回归）。
