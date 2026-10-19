# LivingTrees + OceanCaves JS 侧审计与修复（2026-08-16）

模式同 Dungeon JS 审计（docs/worldgen/dungeon-js-audit-2026-08-13.md）：只改 JS，
oracle 侧留同步清单。裁决工具链：

1. **原版服务器探针**（/tmp/sw-num4/patch + probelib）：`growtree2` 模式给
   `WorldGen.GrowLivingTree` 做改名包装（Enter/Exit 记 i/j/patch + Main.rand 流指纹），
   `Place3x2` 同款包装（Pre/Post 记足迹/支撑态 + tileSolid 快照 + 是否写入）。
   种子 9293480 全程 P|42 四哈希与既有 dump 逐位一致（探针零扰动）。
2. **原版输入重放**（tools/_ltaudit.test.ts，`LT_VAN_REPLAY=1`/`LT_OC_REPLAY=1`）：
   把原版 041（9293480）/036（8888）四平面 dump 覆写进 JS TileStore 再跑本 pass，
   与 042/043/037 dump 全网格逐位对拍——**输入零分歧，任何输出差=JS 转写 bug 的精确定位**。
   终态：三检查点全部 `act=0 typ=0 wal=0 liq=0`（5,040,000 格 × 4 平面全等）。

## 一、修复清单

### OceanCavesPass.ts（原版 WorldGen.cs:15228-15254 + oceanCave cs:76686-76990）

| # | 位置 | 原版依据 | 内容 |
|---|------|---------|------|
| O1 | OceanCavesPass.ts:180-188 | cs:15249-15252 | **右洋双掷**：`int num = genRand.Next(55, 95); if (i == 1) num = Next(maxTilesX-95, maxTilesX-55);`——右洋（i==1）首掷 `Next(55,95)` 被**丢弃但消耗掷骰流**。JS 曾只掷一次 → 右洋蠕虫全部后续掷骰错位（8888 对拍：壳层 HARDSAND/SAND 错写 ~13k 格、act 12768/liq 18385 差）。修后全等。 |
| O2 | OceanCavesPass.ts:113-121 | cs:76886 | **竖井断轴门**：`if (SolidTile(m, n) && Main.tile[m, n].type != num2) break;`——实心判定是 tileSolid 族（SolidTile，cs:70155），非实心活性格（海草等）**不挡轴**。JS 曾用 `active && type!==SAND` → 提前断轴、竖井变浅。改为 `activeAt && genSolidType(type) && !==SAND`（本阶段无 slope/half/solidTop 残留，genSolidType 等价 SolidTile）。 |

两处 oracle（tools/golden/caves-oracle.cs:7141-7142 与 OceanCaveFn 内 `SolidTileGen(m,n) && typ!=sand`）**本来就正确**——本次是把 JS 拉回与 oracle/原版一致，**oracle 无需同步**。

审计过无偏差的其余项（依 cs 行号逐行核过）：pass 级 1/3 掷与左右门
（DungeonSide Left/Right ↔ JS ±1 映射等价，短路序一致）；oceanCave 内
num4/num5 衰减（×0.96 后判 big，cs:76760-76767）；盒体 (int) 截断与
clamp 等价；腔体 264 幽灵写；上壳只写 type 不激活（cs:76834/:76839）与
下半壳 active(true)（cs:76849）；竖井 xa/xb 取缩放前 len（cs:76856-76862）；
两档缩放（cs:76863-76875）；灌水 r*1.3+1 与 y>j-10 门（cs:76908-76912）；
flag4 中心水柱 5×100（cs:76913-76930）；前进/steep 退出/中档
`(worldSurface*4+rockLayer)/5`（cs:76962-76989，gs.worldSurface/rockLevel=
Main 值✓）；UnderwaterChests（cs:17343-17368，NextFromList/扩窗/回折/
liquid>250+水门）。近似备案（本阶段不可达）：`Math.hypot` vs
`Vector2D.Length()`（sqrt(x²+y²)）的 ULP 级差异；badOceanCaveTiles 越界
按 true（原版会越界异常，实际盒内不可达）；setTileSilent 重置帧（dump 无
帧平面，后续 pass 若读帧属另案）。

### LivingTreePass.ts（原版 cs:15551-15824 + GrowLivingTree cs:28123-28759 全链）

| # | 位置 | 原版依据 | 内容 |
|---|------|---------|------|
| L1 | LivingTreePass.ts:185-273 | cs:59366（头）/cs:59497-59499（锚 Clear）/cs:60026-60027（case 187 尾）/cs:80924（SquareTileFrame）/cs:86732→49190-49438（Check3x2）/cs:63559+63955-63960（KillTile） | **PlaceTile(187) 全链缺失**（本次最大债）：原版每次石堆放置（成败皆然）尾部跑 `SquareTileFrame(i,j)` → 3×3 逐格 TileFrame → 187 格 `Check3x2` 一致性校验（六格 type+帧一致 + 支撑行实心）→ 失败 `KillTile` 清残件；且 PlaceTile 头对 inactive 锚格做 `Clear(Tile\|TilePaint\|Slope)`（幽灵归零）。叶簇逐簇推进时后写叶会部分覆写已放石堆，原版在下一次该区域的 SquareTileFrame 把残件 KillTile；JS 残件永生 → 树冠多 187 残格（9293480 树 A (414,154) 单格幸存 + 树 B (511-513,140)，均原版服务器探针实证）。新增 `killTileGen`/`check3x2Pile`/`squareTileFrameGen`/`placeTilePile`（叶相位两处石堆调用换 placeTilePile）。帧重建算法与 place3x2 样式布局解耦（vanilla 54*style 平铺 / 本仓 35-wrap 均自洽）。CheckTileBreakability/type51 掷骰分支不触及（无 genRand 消耗，树 A 全程流指纹一致实证）。 |
| L2 | LivingTreePass.ts:315,321,439,450,455 | cs:59889/59907（case 10 门两支尾）/cs:60063（case 15）/cs:59964（case 106-308 组尾） | 门/椅/织机 PlaceTile 尾的 `SquareTileFrame(i,j)` 接线（活树语境仅 187 清除链有语义；case 19 平台原版**无** SquareTileFrame 不接）。门的接线只在 PlaceDoor 实际尝试的两支（cs:59901-59904 的 `return false` 路径原版不帧）。 |
| L3 | LivingTreePass.ts:608-612 | Main.cs:2863 `UnderworldLayer => maxTilesY-200` | MakePassage 地狱截断门曾用 `gs.lavaLine`（=GenVars.lavaLine≈waterLine+50..79≈h-340±）→ 树井提前 60-140 行截断。改 `st.h - 200`。两链种子树井止于 y<400 未触界，链绿曾掩盖（oracle caves-oracle.cs:8378 一直正确）。 |

注（免修澄清，勿再当债）：
- 树选址/主树形状/补种树（457/478 双拒）/树 A 全部掷骰与原版**逐哈希一致**
  （enter 47d34e93→exit 6828f30d 等全对上）——「JS 192 棵 vs 原版 191 棵互不重叠」
  的已知分歧主体是**继承分歧**：JS 第二主干树长在 x2337，原版因 x2369 处
  y103 云层（浮空岛 pass 分歧，JS 缺该云）在 r5 净空检查拒掉该候选——修
  浮空岛后此处自然收敛，LivingTrees pass 本身无选址转写债。
- 187 帧布局（furnitureStyleBase 35-wrap）与 vanilla 平铺帧不同是**渲染修正**
  （vanilla style≥35 越界表宽是原版瑕疵）；Check3x2 端口与布局解耦不受影响。
- 187→186 草变体转化（cs:49382，frameX∈[756,900]）不移植：vanilla 帧平铺下
  仅 style 14-16 可达，活树只用 47-51。

## 二、oracle 同步清单（caves-oracle.cs）

1. **必改**：`PlaceTileGen` case 187（:7456-7473 附近）补 L1 等价链——
   ① 入口对 inactive 锚格 `typ=0`（幽灵归零，帧清零）；
   ② 写尝试后对 (i,j) 3×3 跑 Check3x2(187)：由帧重建 3×2 原点，六格
   `type==187 && frameX==(k-n5)*18+n6*54 && frameY==(l-num)*18+(fy/36)*36`
   + 支撑行 `SolidTileGen` 校验，失败则六格中仍为 187 的 active 格置
   inactive（type 保留=幽灵 187，frameX/frameY=-1）。注意 oracle 的
   PlaceTileGen 无帧写入——需先在 case 187 写入帧（54*style 平铺即可，
   自洽即可被 Check3x2 重建）或照 JS 的 wrap 布局。
   **不改的后果**：JS（已修）与 oracle 在石堆 KillTile 生效的种子上
   livingtrees 网格哈希分叉（9293480 即差 1 格 (414,154)）。
2. **无需同步**：O1/O2（oracle 本来就对）；L3（oracle 本来就对）；
   L2 门/椅/织机 SquareTileFrame 接线（活树语境 grid-中性，oracle 缺席
   无行为差；若同步 1 时顺手补上也无妨）。
3. `tests/golden/caves-chain-*.json` 在 1 落地后需重生成
   （`SW_DUMP_SHIMMER=1 dotnet run tools/golden/caves-oracle.cs <seed> <evil> out.json`）。

## 三、验证记录

- tools/_ltaudit.test.ts（一次性对拍，保留复跑）：
  - `LT_VAN_REPLAY=1`：9293480 原版 041 输入 → LivingTrees/LivingTreeWalls
    输出 vs 042/043 dump：**四平面 0 差异**。
  - `LT_OC_REPLAY=1`：8888 原版 036 输入（该种子 1/3 门掷中、原版实写
    36,862 格）→ OceanCaves 输出 vs 037 dump：**四平面 0 差异**。
  - 默认模式：JS 链 vs van_x86_g 逐 pass 全网格差 + Δ 单 pass 写入隔离
    （pre 态匹配格上的写入对账）——oceancaves 在 9293480 原版零写（双门
    掷不中），JS 同零写（pass 级门控等价）。
- 相关单测：tests/living-tree.test.ts 8/8 ✓；tests/_living-wood-forensic{,2}.test.ts ✓。
- caves-checkpoint / shimmer-checkpoint 现红在 gems:stream——系并行会话
  在制（GenState 14:55/JunglePass 15:26/TreePass/WorldGen.ts 15:21 等），
  先于本审计的 pass，非本次两 pass 引入（本次改动仅涉 livingtrees 之后
  与 oceancaves 内部，且 oceancaves:stream 两链种子仍 ✓）。

## 四、方法论存档（下轮复用）

1. 单 pass 转写债定位的最短路径 = **原版输入重放**（原版 pre-pass dump 覆写
   JS store → 跑 pass → 与 post-pass dump 逐位比）：继承分歧免疫，输出差即
   转写差。ghost 无 dump 平面，重放会把 inactive 格 type 清 0——幽灵敏感门
   （如 badOceanCaveTiles 读 ghost type）在该法下不可证，需服务器探针补。
2. 服务器探针 v2 模板：/tmp/sw-num4/patch/Program.cs `growtree2`（改名包装,
   勿用逐 ret 注入——栈序/异常路径会炸）；Cecil `InsertBefore(body[0])`
   逐条前插会把**后插的排前面**（arg 加载序反了会 InvalidProgramException）；
   Cecil 改名不重写引用——调用方仍直连 _impl，必须全模块（含嵌套类型）重指。
3. 原版 passchain 流指纹（/tmp/sw-num4/home/passchain_*.txt）可跨 pass 二分
   掷骰分歧；van_s8888/ 为 8888 全 pass dump（本次为 OceanCaves 实写样本新采）。
