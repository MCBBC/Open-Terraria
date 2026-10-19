# 地牢生成域 1457 对齐（dungeon-1457-alignment）

基准 `../Terarria1457/`（对照 `../Terarria1456/`）；JS 侧落点
`game/src/world/gen/vanilla/DungeonPass.ts`（4559 行,Default 单样式转录）+关联 pass。
42/104 文件 differ ≈2978 行（根 9 / Entrances 3 / Features 12 / Halls 6 / LayoutProviders 1 / Rooms 11）。

分类：**A**=内部重构输出不变（无需转录）；**B**=输出 affecting（本批实装对象）；
**C**=存疑需运行对拍。

---

## 阶段一：42 文件分类清单（增量登记）

### 根目录 Terraria.GameContent.Generation.Dungeon（9）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| DungeonBounds.cs | 6 | **A** | 仅加 `ToString()` 调试输出,零生成逻辑 |
| DungeonGenVars.cs | 3 | **B** | +`bool[] isDungeonWallEdge`（双地牢族:窗缘墙标记,DungeonCrawler.Setup 填充） |
| DungeonRoomSearchSettings.cs | 3 | **B** | +`bool UseOuterBounds`（双地牢族:房间搜索界域改用外圈） |
| DungeonDoorData.cs | 7 | **B** | `OverrideBrickTileType/WallType: ushort?` 两字段 → `OverrideGenerationStyle: DungeonGenerationStyleData` 单字段（门洞覆盖从"瓦/墙各自覆盖"变"整样式覆盖"） |
| DungeonGenerationStyleData.cs | 40 | **B** | +`ExtraTileTypes/ExtraWallTypes: ushort[]`、+`TilePaintColor/WallPaintColor: byte?`;`TileIsInStyle/WallIsInStyle` 加 `includeExtras` 形参 |
| DungeonGenerationStyles.cs | 41 | **B** | 各风格档扩表:Snow(2)+tile147/wall40、Desert(3)+tile397,404/wall216,223、Corruption(4)+wall188-191、Crimson(5)+wall192-195、Hallow(6)+wall200-203、Jungle(8)+wall204-207,15、LivingMahogany(14)+WallPaintColor=12;`GetStyleForTile/Wall` 改 includeCracked:false+includeExtras:true,GetStyleForWall 增 `Style==0 && Main.wallDungeon[wall]` 快路径 |
| DungeonCrawler.cs | 48 | **B** | ①Setup 填 `isDungeonWallEdge=Main.wallDungeon` 克隆后窗缘墙置 true;②ExtraTile/WallTypes 并入 `isDungeonTile/isDungeonWall`;③DualDungeon 时 LegacyEntranceHall `CrackedBrickChance=0`;④一处 `&&`→`&`（两侧无副作用,**等价**→A） |
| DungeonData.cs | 173 | **B**(主体A) | 字段初始化器→显式构造器=纯A;`IsRoomInBounds` 重构守卫+新 `UseOuterBounds` 分支=**B**;新增 `IsAnyRoomInBounds`(OuterBounds.Intersects 版)=**B**（均双地牢族消费） |
| DungeonUtils.cs | 327 | **B**(大半A) | A侧:DOORSTYLE_GOTHIC=53/PLATFORMSTYLE_GOTHIC=54 新常量(常量本身零输出,消费点另计)、删未引用常量(CHANDELIERSTYLE_27/28/29、HALLWAY_DOOR_PLACEMENT_VARIANCE、MOSAIC_*)、`paint:int=-1`→`int?`(HasValue&&>=0 与旧 `>=0` 等价)、多处 `&&`→`&` 无副作用、GenerateDungeonStairs `(tileType,wallType)`→`styleData` 参数打包(Default 无 paint 时逐位等价);B侧:①`GenerateDungeonStairs` 新增 styleData.Tile/WallPaintColor 应用(Default=null 不触发)②新 `IsConsideredAnyDungeonWall`/`IsConsideredDungeonWallEdge`(wall+wallEdge+wallGlass 判定)③`IsHigherOrEqualTieredDungeonTile/Wall`+`GetTierForDungeonTile/Wall` 加 `genStyleID/includeCracked/includeExtras` 维度,LivingWood/LivingMahogany 加 `genStyleID==-1\|\|==13/14` 门。★关键:整个多风格 tier 循环 1456 已存在且 **dualDungeons 门控**——非双地牢世界两版同走 `Main.tileDungeon?1:-1` 单行,故 tier 扩展对普通世界零影响 |

### Entrances（3）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| DomeDungeonEntrance.cs | 71 | **A**(普通世界等价) | 全部=paint 通道(StyleData.Tile/WallPaintColor,Default=null 不触发)+`&&`→`&`/`\|\|`→`\|`(无副作用)+GenerateDungeonStairs 签名打包;paint 通道属 B 基建(仅 dual 风格有 paint) |
| TowerDungeonEntrance.cs | 143 | **A**(同上) | 同 Dome:纯 paint 通道+`&`+签名打包,零逻辑变更 |
| LegacyDungeonEntrance.cs | 425 | **A**(同上) | 425 行 diff 中 IL 注释churn+`Main.tile[m,n]`→局部变量缓存+paint 通道+`zero.X -= 1.0`→`X--`;零掷序/逻辑变更 |

★GOTHIC 定谳（修正）:`DOORSTYLE_GOTHIC=53`/`PLATFORMSTYLE_GOTHIC=54` 常量本身全库零按名消费,但 **字面量 53/54 有真实消费点**（见 DungeonGlobalLateDualDungeonFeatures/DungeonGlobalPlatforms/DungeonGlobalLights）——"94..105 墙→GOTHIC 家具"是 1457 新增的**普通世界也生效**的视觉行为族。

### Features（12）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| DungeonTileClump.cs | 4 | **A** | `num2 -= 1.0`→`num2--`（double 等价） |
| DungeonGlobalGroundFurniture.cs | 4 | **A** | `&&`→`&`（无副作用） |
| DungeonGlobalTraps.cs | 6 | **B**(双地牢族) | Traps 窗口首尾设 `GenVars.DualDungeon_AllowTrapGenerationInDungeon=true/false`;消费点=1457 WorldGen.PlaceTrap:8865 `dualDungeons.Enabled && !flag && InAnyPotentialDungeonBounds→拒`（JS TrapsPass.placeTrapCanContinue 已留桩注释） |
| DungeonGlobalPlatforms.cs | 11 | **B**(普通世界生效) | 平台锚点 `wall∈[94,105]`（地牢 slab/tile 墙变体,普通世界 dgWallVariants 铺的 94-99 属之）→平台 style 强制 54（GOTHIC 平台,frameY=54*18）。仅帧通道,不改掷序 |
| ConnectionPointQuality.cs | 5 | 待定(B?) | 枚举 +`VeryBad`;消费点在 Rooms 侧（DungeonRoom/ConnectionPoint 判定）,随 Rooms 定谳 |
| DungeonGlobalLights.cs | 22 | **B**(普通世界生效,★掷序) | ①吊灯:Default+`wall∈[94,105]`→GothicChandelier(5744),无掷;②★灯笼:新增**无条件 `genRand.Next(3)` 掷**（1456 无此掷）,==0 且墙∈[94,105]→GOTHIC 灯笼(style53)——**普通世界 RNG 流移位**,dgLights 必须补掷 |
| DungeonWindowBasic.cs | 21 | **A**(paint 通道等价) | 窗玻璃区 `wallColor(0)` 显式清漆+`overrideGlassPaint >= 0`→`> 0`（=0 落 else 清漆支）;JS 无 paint 通道模型,现态即逐位等价——paint 通道入库批（FinalSeedCleanup 涂装族）再补 |
| DungeonGlobalDoors.cs | 119 | **A**(普通世界等价) | `OverrideBrickTile/WallType`→`OverrideGenerationStyle` 整样式覆盖+paint 通道;Default 覆盖值=同 brick/wall,paint=null ⇒ 等价;`genVars.brickTileType`→`genVars.dungeonStyle.BrickTileType`（genvars 持样式引用,纯重构） |
| DungeonGlobalLateDualDungeonFeatures.cs | 65 | **B**(普通世界生效,★掷序) | 1456 该特征在普通世界≈no-op;1457 新增 style==0 支:**门(tile10 顶格)墙∈[94,105] → KillTile+PlaceTile(10,style 53)=GOTHIC 门替换**——PlaceTile(10) 内部 3×Next(3) 帧掷（JS dgPlaceDoorAt 同模型）⇒ 每替换门 +3 掷,RNG 流移位。JS 管线现止于 dgBanners,**缺整段 Late 特征**（1456 普通世界仅剩 per-room GenerateLateDungeonFeaturesInRoom,JS 是否已建模待查 Rooms 段） |
| DungeonDropTrap.cs | 131 | **A**(普通世界等价) | paint 通道+if/else→guard-continue 重构（逐支等价）+genvars 样式引用化 |
| DungeonPitTrap.cs | 77 | **B**(双地牢门控) | 新增 `flag(=Type==DualDungeon) && !outerPotentialDungeonBounds.Contains(i,num) → return false` 拒坑陷阱;其余=参数打包(tileType/pitTrapTileType/wallType→styleData)+paint |
| DungeonPillar.cs | 199 | **A**(普通世界等价) | GenerateTileStrip `(tileType,wallType)`→`styleData` 打包+paint 通道;OverridePaint 语义保持（stylePaint=null 时 b=OverridePaint,与旧 `num2>=0` 判定等价） |
| DungeonWindowMosaic.cs | 85 | **A**(paint 通道等价) | `paint != 0`→`paint > 0`+玻璃区 `wallColor(0)` 显式清漆;无漆世界零输出差,无掷;JS 现态即等价 |

### 阶段一小结（截至 Features 完）
- **A 型（普通世界逐位等价,无需转录）**:DungeonBounds、DungeonTileClump、DungeonGlobalGroundFurniture、DomeDungeonEntrance、TowerDungeonEntrance、LegacyDungeonEntrance、DungeonGlobalDoors、DungeonDropTrap、DungeonPillar = 9
- **B 型**:DungeonGenVars、DungeonRoomSearchSettings、DungeonDoorData、DungeonGenerationStyleData、DungeonGenerationStyles、DungeonCrawler、DungeonData、DungeonUtils、DungeonGlobalTraps、DungeonGlobalPlatforms、DungeonGlobalLights、DungeonWindowBasic、DungeonGlobalLateDualDungeonFeatures、DungeonPitTrap、DungeonWindowMosaic = 15（其中 ConnectionPointQuality 待 Rooms 定谳）
- **B 中普通世界也生效（非 dual 门控,优先实装）**:Lights 的 Next(3) 掷+GOTHIC 吊灯/灯笼、Platforms 的 94..105→style54、LateDual 的 GOTHIC 门替换（掷序!）、WindowBasic/Mosaic 清漆（仅 paint 通道）
- **B 中 dual 门控（普通世界零影响）**:tier 扩展、isDungeonWallEdge、UseOuterBounds、IsAnyRoomInBounds、pit trap 界拒、trap genvar、OverrideGenerationStyle

### Halls（6）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| DungeonHall.cs | 95 | **B**(dual) | 新 `AddExtraPlatformsIfNeeded`（首行 `Type!=DualDungeon return`）;`GenerateDungeonSquareHall` (tile,cracked,wall)→styleData 打包+paint+`IsHigherOrEqualTieredDungeonTile(-1,style)` 新参;`&&`→`&`。★普通世界走廊=Legacy 族,Regular/Sine/Stairwell/DungeonHall.AddExtra 仅 dual provider 实例化 |
| LegacyEntranceDungeonHall.cs | 56 | **A** | 纯 IL 注释 churn（87-122 区）,零逻辑 |
| StairwellDungeonHall.cs | 49 | **A**(dual-only) | IL churn+打包（locals 移入 GenerateDungeonSquareHall） |
| RegularDungeonHall.cs | 118 | **B**(dual) | GenerateHall 加 `AddExtraPlatformsIfNeeded(data)` 调用;余 IL churn |
| SineDungeonHall.cs | 154 | **B**(dual) | `PotentialPlatformPoints.Add` 加 `!Processed` 门（1456 calculate+generate 两阶段各加一次=点重复,1457 只加一次）;打包。★Sine 走廊仅 dual provider 用 |
| LegacyDungeonHall.cs | 285 | **B**(普通世界生效) | ①AddExtraPlatformsIfNeeded 调用（dual 门,普通世界 no-op）②paint ③`&&`→`&` ④★`resetTile: true`→`bool resetTile = m∈[num15+1,num16-1)&&n∈[num17+1,num18-1)`——走廊砖环**边界格不再 ClearEverything**（墙保留 vs 全清,walls 通道差,1457 真实行为变更） |

### LayoutProviders（1）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| DualDungeonLayoutProvider.cs | 424 | **B**(dual) | 整文件 dual-only:hallType 提前掷+`GetHallRadius(hallType)`(≥8)、LiquidType≥0 厅线→hallType 强制 Regular+CrackedBrickChance=1、ConnectionPointQuality.VeryBad=1000 计分、liquid 厅连接点 Y 界拒、CarveOnly 恒真化 |

### Rooms（11）

| 文件 | diff行 | 型 | 要点 |
|---|---|---|---|
| ConnectionPointQuality.cs | 5 | **A** | 枚举 +VeryBad;消费点全在 dual provider（随上行） |
| RegularDungeonRoom.cs | 17 | **A**(dual-only) | (tile,wall)→styleData 打包+改名 |
| BiomeDungeonRoom.cs | 52 | **B**(dual) | 保护判定 `!InnerBounds.Contains→Walls else TilesAndWalls` → **恒 Walls**;paint 通道 |
| BiomeSquareDungeonRoom.cs | 88 | **B**(dual) | 外圈环 `if(!edge) ChangeWallType` → **无条件写砖墙**;paint;变量改名 |
| BiomeStructuredDungeonRoom.cs | 42 | **B**(dual) | 同 Square:边环墙无条件化+paint |
| BiomeRuggedDungeonRoom.cs | 73 | **B**(dual) | 同上+`ChangeWallType(tile,0,…,0)` 显式 paint0+speleothems/floatingRocks paint 通道 |
| DungeonRoom.cs | 121 | **B**(普通世界生效) | ①新虚方法 `CanRemoveTileAt`（wall==350 微光保护墙→false;普通世界地牢域无 350≈无操作）②新虚方法 `CanPlaceTileAt`（wall==350→false;else `!IsHigherOrEqualTieredDungeonWall(…,newStyleID,newStyleID,false,true)`——非 dual 与旧 tier 检查等价）③★`GenerateDungeonSquareRoom` 重构:else 支（inactive 格）1456=tier 检查只门 tile 写、墙写无条件在外;1457=CanPlaceTileAt 门 tile+墙写,且 `ChangeTileType(resetTile: flag)`（flag=genWalls&&within-total）——**外圈环（\|i\|==total）1456 ClearEverything 墙清零 vs 1457 墙保留**,walls 通道真实差;④首环墙写加 `!CanRemoveTileAt→continue`;⑤删 cracked 变体 overload（Wormlike 改调 bounds 版） |
| LegacyDungeonRoom.cs | 148 | **B**(普通世界生效) | 同 DungeonRoom 重构落地:CanRemoveTileAt 门墙写、CanPlaceTileAt 门 tile 写、resetTile 计算化（房间砖环边界墙保留）;paint 通道 |
| LivingTreeDungeonRoom.cs | 180 | **B**(dual) | BasePosition→Positions[0] 数组化+Processed 门+覆写方法 Early→PreHallways+paint |
| WormlikeDungeonRoom.cs | 47 | **B**(dual) | Processed 门（Positions/shape 缓存 calculate/generate 去重,同 Sine 模式）+打包+删 overload 改调 |
| GenShapeDungeonRoom.cs | 81 | **A**(dual-only) | paint 通道重构（Blank→SetTilePaint(paintID) 等价） |

---

## 阶段一定谳总表（42 文件全量）

**A 型 = 16**（零转录;含"仅 paint 通道/打包/dual-only 房间类"的输出等价项）:
根 DungeonBounds;Entrances Dome/Tower/Legacy 三入口;Features TileClump/GroundFurniture/GlobalDoors/DropTrap/Pillar/WindowBasic/WindowMosaic（后两者=纯 paint 通道,JS 无 paint 模型现态即等价）;Halls LegacyEntranceDungeonHall（纯 IL churn）/StairwellDungeonHall（打包,dual-only 类）;Rooms ConnectionPointQuality（枚举加成员,消费点全在 dual provider）/RegularDungeonRoom（打包,dual-only 类）/GenShapeDungeonRoom（paint,dual-only 类）

**B 型 = 26**,再分两档:
- **B-dual（dualDungeons 门控,普通世界零输出差）= 20**:根 GenVars/RoomSearchSettings/DoorData/StyleData/Styles/Crawler/Data/Utils（8）;Features Traps/PitTrap（2）;Halls DungeonHall（AddExtraPlatforms）+RegularHall/SineHall（调用与 Processed 门,dual-only 走廊）（3）;Provider DualDungeonLayoutProvider（1）;Rooms BiomeDungeonRoom/BiomeSquare/BiomeStructured/BiomeRugged/LivingTree/Wormlike（6）
- **B-normal（普通世界真实生效）= 6**:Features Lights（Next(3) 新掷+变体墙吊灯资格+GOTHIC 吊灯/灯笼）/Platforms（94..105→style54,仅帧通道,本批已落）/LateDual（GOTHIC 门替换,KillTile+PlaceTile 掷）;Rooms DungeonRoom/LegacyDungeonRoom（CanRemoveTileAt/CanPlaceTileAt 门+resetTile 计算化=砖环边界墙保持）;Halls LegacyDungeonHall（resetTile 计算化）

**C 型 = 0**:全部 diff 均已语义定谳（B-normal 中"wall-350 门在普通世界是否无操作"以"地牢域无 350 墙"为前提,oracle 对拍批可复核——这是最接近 C 的一项,已按 A 前提归 B-normal 备注处理）

**★修正任务书两处预设**:①DOORSTYLE_GOTHIC/PLATFORMSTYLE_GOTHIC 非死常量——字面量 53/54 有真实消费（Late 门替换/Platforms style54/Lights 灯笼53/吊灯 item5744→tile34 style53）;②DualDungeonUnbreakableWallTiers.cs/DungeonType.cs 非新文件——1456 已存在（本批 differ 集不含）。

**★普通世界生效链的统一根因**：1457 把"地牢 slab/tile 墙变体(94-105)"升格为一等公民（GOTHIC 家具族触发器）+ GetStyleForWall 对 wallDungeon 墙全返回 Default（1456 仅 brickWallType）。逐消费点核实:Banners/Paintings/GroundFurniture/Bookshelves 四处 Default 路径与 null 路径**值等价零掷差**（GetCurrentDungeonStyle 全 item 数组=int[0]→GetFurnitureItem/GetPlatformStyle 短路不掷;Paintings case0 再查 wallVariants[0]）,唯 Lights 吊灯资格门（`styleForWall != null`）真实扩宽。

---

## 阶段二：B 型实装（本批落地）

### 新模块 `src/world/gen/vanilla/DungeonStyles1457.ts`（1457 地牢风格/tier 机器转录）
- `DungeonGenerationStyleID`（0-15）/`DualDungeonUnbreakableWallTiers`（0-5）/`DungeonType1457`
- 15 档风格注册表 `DungeonGenerationStyles`（核心身份字段:Brick/Cracked/Wall/PitTrap/Window 三墙/ExtraTile·WallTypes/Tile·WallPaintColor/LiquidType/PlatformItemTypes/UnbreakableTier;★家具 item 表未转录——消费端=双地牢陈设管线,备案）
- `getCurrentDungeonStyle(genvars)`（GetCurrentDungeonStyle 工厂,全 item 表空语义保留）
- `dualDungeonStyles(currentDungeon, crimson, default)`（SetupDungeonGenVarVariables :111-128 装配序:0=[Cavern,Crimson|Corruption,Jungle,Default]/1=[Snow,Desert,Hallow,Temple]）
- `tileIsInStyle/wallIsInStyle`（includeCracked/includeWindows/includeExtras 1457 形）+`getPlatformStyle`（空表 -1 零掷语义）
- `getStyleForTile/getStyleForWall`（1457 终态:includeCracked:false+includeExtras:true;GetStyleForWall 的 `Style==0 && wallDungeon` 快路径）
- `getTierForDungeonTile/Wall`+`isHigherOrEqualTieredDungeonTile/Wall`（dual 门控循环+genStyleID 维度;非 dual 恒走 1456 单行公式）
- `buildDungeonGenVars`（:133-183:非 dual=基表引用不克隆;dual=克隆+Extra 并表+窗墙三族）
- `isConsideredAnyDungeonWall/isConsideredDungeonWallEdge`（:1905-1974 新增族）
- `dualDungeonTrapWindow`+`dualDungeonState`+`inAnyPotentialDungeonBounds`+`placeTrapDualDungeonReject`（WorldGen.cs:8865 三因子门）

### 旗→行为接线（普通世界零扰动约束下）
1. **TrapsPass.placeTrapCanContinue**（WorldGen.cs:8865 门落位）:`placeTrapDualDungeonReject(x,y)` 真门替换原"恒不拒"桩——普通世界旗关首因子假恒过;双地牢世界由 ② 的窗口时序放行。
2. **DungeonPass.dgTraps**:窗口首尾 `dualDungeonTrapWindow.allowTrapGenerationInDungeon = true/false`（DungeonGlobalTraps.cs:33/:154 时序还原）。
3. **DungeonPass.runDungeonPass 头**:潜在地牢界域回填 `dualDungeonState`（outerPotentialDungeonBounds JS 投影,potContains 同构半开矩形预钳）;`enabled=seedFlags.dualDungeons`。
4. **DungeonPass.dgPlatforms**:锚点墙∈[94,105] → 平台档 54（GOTHIC,`platStyleEff`）——**仅 frameY 通道**（caves-checkpoint 哈希不含帧,零金标影响;DungeonGlobalPlatforms.cs:42-45）。
5. Sine/Regular/Stairwell 走廊与 AddExtraPlatformsIfNeeded、Biome 房间族、DualDungeonLayoutProvider:JS 侧本就只建模 Legacy 走廊/房间族（普通世界路径）,dual-only 类**无需也无法**在现管线落地——归入双地牢完整实装批。

### 验证结果
- **tests/caves-checkpoint.test.ts 3/3 绿**（9293480+SandboxWorld 全 pass 哈希逐项全等,含 dungeon 17 段检查点）——★与任务书"预期金标红"不同:**金标未红**。原因:本批实装子集全部为 dual 门控（普通世界短路）或仅帧通道（不入哈希）,1456 链逐位无扰。**无需 oracle 地牢段同步+金标再生**（若后续实装下方"待实装"清单则需）。
- **普通世界零扰动（seed 9293480）:成立**——上项即证;另有 B6/B19 全 id 扫描断言（非 dual 下 tier 判定 ≡ 1456 单行公式,0-719 tile/0-359 wall）。
- **tests/dungeon-1457-alignment.test.ts 23/23 绿**（A 型抽样 4/B 型 14/零扰动守卫 2+真值表 3）。
- **tests/dungeon-ai/dungeon-spawn/dungeon-walls/cavewalls 8/8 绿**;`npx tsc --noEmit` 触碰三文件+新测试**零新增错误**（仓库既有错误均在未触碰文件,如 WhipProj.ts/tests/_ghost 等,与本批无关）。

### 待实装清单（定谳 B-normal,本批不落——落则破 1456 金标,须与 oracle 地牢段同步+金标再生同批）
按依赖序（每项附落点与机制）:
1. **Lights 灯笼 Next(3) 新掷**（DungeonGlobalLights.cs:115-119）:dgLights 灯笼支在 `lStyle` 三档判定后、Place1x2Top 前插 `rn(3)`（无条件掷,首因子短路墙判定）;==0 且 wallAt∈[94,105] → 灯笼档 53（frameY=53*36）。★掷序移位=金标红根因①。
2. **Lights 变体墙吊灯资格+GOTHIC 吊灯**（:77-92）:`chGate` 从 `wallAt===wall` 扩为 `getStyleForWall([default], wallAt, wallDungeon) != null`（即 wallDungeon 全族）;命中且墙∈[94,105] → 吊灯 item 5744→tile34 style53（placeChand 帧式按 style53 重算:分页/行列步进需按 34 号帧表核）。金标红根因②（放置集变化）。
3. **Late GOTHIC 门替换**（DungeonGlobalLateDualDungeonFeatures.cs:49-69）:dgBanners 之后新增 dgLate 段——扫 outerProgressionBounds（JS 侧=bounds?需按 outerPotentialDungeonBounds 语义核对）内 tile10 顶格且墙∈[94,105] → KillTile+PlaceTile(10,style53)（每门 3×Next(3) 帧掷,fx=54*1、fy=54*17 基）。金标红根因③（掷序+tile）。
4. **DungeonRoom/LegacyDungeonRoom GenerateDungeonSquareRoom 重构**（DungeonRoom.cs 1457 else 支）:CanRemoveTileAt（wall350 门）/CanPlaceTileAt（wall350+tier）门+`resetTile=genWalls&&within-total`——房间砖环外圈格墙保留（1456 ClearEverything 清零）。walls 通道差=金标红根因④。
5. **LegacyDungeonHall resetTile 计算化**（:756）:同④语义,走廊砖环边界格墙保留。金标红根因⑤。
6. **WindowBasic/Mosaic 清漆**（wallColor(0) 族+`>=0`→`>0`）:JS 无 paint 通道模型,现态即等价——若 paint 通道入库（FinalSeedCleanup 涂装批）时一并补。
7. **双地牢完整生成**（DualDungeonLayoutProvider 424 行+DitherSnake 蛇形布局+Biome 房间五族+第二地牢 SetupDungeonGenVarVariables@Dunes+风格家具 item 表全量+SubStyles 展开）——独立大批,前置=上述 1-5。
8. **oracle 侧同步段**（本批未动 tools/golden/caves-oracle.cs,将来对拍时需同步）:DungeonUtils tier 机器段、DungeonGenerationStyles 扩表段、DungeonGlobalPlatforms 94..105 段、DungeonGlobalLights Next(3) 段、DungeonGlobalLateDualDungeonFeatures 门替换段、DungeonRoom/LegacyDungeonRoom/Hall resetTile 段、DungeonGlobalTraps genvar 窗口段、WorldGen.cs:8865 placeTrap 门段、DungeonCrawler.SetupDungeonGenVarVariables 数组扩表段。

### 域外备案（dualDungeons 旗族的非地牢消费点,不在本批域）
CorruptionPass:197/210（微光心距/数量减半）、TrackPass:1052、HardmodePass:135、QuickCleanupPass:4、FinalCleanupPass:14/2620、LivingTreePass:13、LiquidSim.ts:1046、VanillaSpawner.ts:333/1600、Player.ts:781-790（UpdateUnbreakableWallScan）——各处明注"未接",归双地牢完整实装批统一接线。
