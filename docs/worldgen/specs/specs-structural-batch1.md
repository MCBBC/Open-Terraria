# 结构性 pass 掷骰规格 · Batch 1（#36-#47，oracle 转录蓝图）

> 2026-08-16。逐 pass 抄录 `Terarria1456/Terraria/WorldGen.cs` 的 **genRand 消费清单**：
> 每次调用的顺序 / 区间 / 条件门 / 拒绝采样循环结构。这是 C# oracle 转录的蓝图——
> 掷骰流错位是历史 21 严重里 13 条的主因（pass-audit-2026-08.md 六节），本规格按
> 「调用点逐个编号」的粒度写，转录时照抄即可。
>
> **约定**：
> - `Next(a,b)` = C# 上界开区间 [a,b)；本仓 `rng.int(a, b-1)`（闭区间）≡ `Next(a,b)`；`Next(n)`≡`rng.int(0,n-1)`。
> - `NextDouble()` = 1 次采样（UnifiedRandom.NextDouble → Sample 内部一次 NextDouble()，位级等价 `(float)NextDouble()` 同）。
> - **每 pass 头重播**：`Main.rand = new UnifiedRandom(_seed)`（WorldGenerator.cs:497）——pass 内第一条骰从 stream(seed) 第 0 掷开始，与 Reset 期消费无关。
> - `ws`=worldSurface、`rl`=rockLayer、`w/h`=maxTilesX/Y、`bd`=beachDistance。
> - 条件门里 `‖`/`&&` 均为 C# 短路序（左→右求值；**循环条件里的掷骰每迭代重新求值**——Pyramid 出口隧道是历史翻车点）。
> - 秘密种子分支（drunk/remix/tenth/notTheBees/dual/errorWorld/extra*/skyblock）标注 §，普通种子不触发但**改变了掷骰位形的须照抄**。
> - `DungeonSide`（Terraria.WorldBuilding/DungeonSide.cs）：`Left=-1、None=0、Right=1`（short 常量非枚举）——
>   故 `dungeonSide < Right` ≡ 左侧、`dungeonSide > Left` ≡ 右侧，与本仓 GenState 的 -1/+1 约定一致；Temple 的
>   `(-dungeonSide)` 符号翻转按此数值计算。

---

## #36 GravitatingSandCleanup（cs:15198-15226）——零掷骰

```
门: !Skyblock.denyAllGeneration && !SecretSeed.roundLandmasses.Enabled
for i in [0, w):                      # 逐列
  flag = false; num = 0
  for num2 in (h-1 → 1]:              # 自底向上
    if SolidOrSlopedTile(i, num2):
      type = tile[i,num2].type
      if flag && num2 < ws && num2 != num-1 && TileID.Sets.Falling[type]:
        for j in [num2, num): tile[i,j].ResetToType(type)   # 空腔整段落定
      flag = true; num = num2
```
Falling 表（TileID.cs:391）：53,234,112,116,224,123,330,331,332,333,495。
我们实现：`GravitatingSandPass.ts`（零掷骰已核）。

---

## #37 OceanCaves（cs:15228-15255）+ oceanCave（cs:76686-76980）

```
门: !denyAll && !roundLandmasses && !noSurface
maxValue = 3   (§remix: 2)
for i in {0, 1}:                                   # 0=左 1=右
  sideGate = (i==0 ? dungeonSide < Right : true) && (i==1 ? dungeonSide > Left : true)
  # ★sideGate 为假 → 本侧【零掷骰】直接跳过
  if sideGate && (R1: Next(maxValue) == 0 ‖ §drunk ‖ §tenth):
    R2: num = Next(55, 95)                         # 左侧入口 x
       (i==1: R2': num = Next(w-95, w-55))
    j = 自 0 向下首个 active(num, j)                # 无掷骰
    oceanCave(num, j)
```

### oceanCave(i, j) 掷骰序（每次成功入口调用一条子流）

```
0. if numOceanCaveTreasure >= maxOceanCaveTreasure: numOceanCaveTreasure = 0
1. vel.X = (i < w/2) ? 0.25 + R:NextDouble()*0.25      : -0.35 - R:NextDouble()*0.5
2. vel.Y = 0.4 + R:NextDouble()*0.25
3. radius = R:Next(17, 25)                              # num4
4. life   = R:Next(600, 800)                            # num5
   while radius > 4 && life > 0:
     a. radius -= (flag ? 0.01 + R:NextDouble()*0.01    : 0.02 + R:NextDouble()*0.02)
        life   -= (flag ? 0.5 : 1.0)                    # flag=入陆标志
     b. if radius >= 6 && life >= 20（flag5）:
          oceanCaveTreasure[numTreasure++].X/Y = (int)pos.X/Y    # 宝藏登记（#62 消费）
     c. bbox [pos±radius*3]（钳 [1, w/h-1]）逐格:
        - 腔体: 距离 < radius*0.5+1 → 清空(active=false, type=264 幽灵) + 灌水
        - 壳层: < radius*1.5+1 → type 397(硬沙)/53(沙) 内外分层
        - 竖井段（k==pos.X && flag3 首次）: num12=50+R:Next(3); num13=43+R:Next(3);
          num14=20+R:Next(3)                             # 内室高/宽/深
          内室铺设循环内: R:Next(3)==0 判 ×2 处（装饰位）
     d. pos.X += R:NextDouble()*0.1 - 0.05
        pos.Y += R:NextDouble()*0.1 - 0.05
```
我们实现：`OceanCavesPass.ts`（B3 批修过 flag 复位；宝藏点跨槽给 #62）。

---

## #38 Shimmer（cs:15256-15308）+ ShimmerMakeBiome（cs:34889-35083）

```
门: !denyAll
num2 = (int)(ws + rl)/2 + 50                          # y 下限
num3 = (int)((h-250)*2 + rl)/3
if num3 > h-460: num3 = h-460                         # 330+100+30
if num3 <= num2: num3 = num2 + 50
R1: num4 = Next(num2, num3)                           # y ★先掷 y
R2: num5 = (dungeonSide < Right) ? Next((int)(w*0.89), w-200) : Next(200, (int)(w*0.11))
num6 = (int)ws + 150; num7 = (int)(rl + ws + 200)/2
if num7 <= num6: num7 = num6 + 50
§tenth: num4 = Next(num6, num7)                       # 覆写重掷（额外消费）
num8 = 0
while !ShimmerMakeBiome(num5, num4):                  # ★拒绝采样：失败重掷
  num8++
  if §tenth && num8 < 10000:   num4 = Next(num6, num7);            num5 = 侧带掷(0.89/0.11 版)
  elif num8 > 20000:           num4 = Next((int)ws+120, num3);     num5 = 侧带掷(0.8/0.2 版)
  else:                        num4 = Next((int)(ws+rl)/2 + 20, num3); num5 = 侧带掷(0.89/0.11 版)
GenVars.shimmerPosition = (num5, num4); structures.AddProtectedStructure(200×200 中心盒)
```
侧带掷 = `dungeonSide<Right ? Next((int)(w*K), w-200) : Next(200, (int)(w*K))`，K∈{0.89, 0.8}。

### ShimmerMakeBiome(X, Y) 每次尝试的掷骰（成功/失败都要照掷的部分）

```
1. num = Next(2)                                      # 石笋柱变体门
2. num2 *= 1.05 - NextDouble()*0.1                    # 椭圆三轴抖动（3 连掷）
   num3 *= 1.05 - NextDouble()*0.1
   num4 *= 1.0  - NextDouble()*0.1
3. num5 = Next(105, 125)                              # 主半径
4. num8 = Next(9, 13)                                 # 高度
5. 预检扫描（type 203/25 → return false，无掷骰）
6. if Next(4)==0: num13 = Y - Next(2)                 # 顶界抖动（2 掷，命中才第 2 掷）
7. if Next(4)==0: num14 = Y - num8 - Next(2)
8. 主体逐格循环（列 k × 行 l）:
   - if Next(4)==0: num13 = Y - Next(2)               # 逐格重抖（每格最多 4 掷）
   - if Next(4)==0: num14 = Y - num8 + Next(2)
   - 椭圆距离 num15：每式 1-2 个 NextDouble()*0.02 系数（k<=Y 用 1.4/1.2 双轴；
     石笋柱式用 ×2 轴 + 0.025 系数）
   - 底缘腐蚀门: k <= Y+2 && num15 == num6-1 && Next(2)!=0
9. (num==0 分支) 石笋柱:
   num9 = (int)(X - num5*num4) - Next(-15,1) - 5
   num10 = (int)(X + num5*num4) + Next(0,16)
   柱体铺设 + aether 宝石树（500 次 X±70/Y±2 采样，两侧整砖即 TryGrowingTreeByType）
```
我们实现：`ShimmerPass.ts`——已有 `tests/shimmer-checkpoint.test.ts` 四段金标（shell/pillars/open/shimmer）+RNG 流指纹全绿，**无需重转录**；本规格供 oracle 扩段时比对。

---

## #39 DirtWallCleanup（cs:15310-15425）

```
门: !denyAll；§noSurface → DoNoSurfaceFillTheTop（秘密种子）
遍① 列 i: 3 → w-4（左→右）; flag = true
  for j in [0, ws):
    if flag:
      if wall(i,j) ∈ {2,40,64,86}: wall = 0                      # 中央列
      if !active ‖ type ∉ {53,112,234}:                          # 邻列清理门
        i-1 列: wall ∈ {2,40} → 清（无掷骰）
        i-2 列: wall ∈ {2,40} && Next(2)==0 → 清                  # ★骰仅在墙命中时消费（短路）
        i-3 列: 同上
        i+1 / i+2 / i+3 列: 同 i-1/i-2/i-3 规则
        if active: flag = false
    elif 「本列 j..j+4 五行 + i±1/i±2 四列墙全 0 且 j..j+3 无活性格」: flag = true   # 竖井重开
遍② 列 num2: w-5 → 5（右→左）; flag2 = true                        # 第二遍镜像
  中央列清 {2,40,64}（★不含 86）; 邻列门 = !active ‖ type != 53（★仅沙 53）; 邻列清 {2,40}
```
**原版怪癖（照抄）**：
- 邻列判定 `wall==2 ‖ wall==40 ‖ wall==40`——40 写两遍，**64/86 永不在邻列清除列**（cs:15345 等 6 处）；
- 遍①中央清 {2,40,64,86}、遍②中央清 {2,40,64}（蜂巢墙 86 只在遍①清）；
- 遍①门 type∉{53,112,234}（三沙系）、遍②门 type!=53（仅沙）。
掷骰总量 = 命中墙的 ±2/±3 邻列数 × Next(2)。
我们实现：`CleanupPass.ts`（邻列掷骰门控 B3 批已修；含 ScanTileColumnAndRemoveClumps <20 连通块清除段——该段零掷骰）。

---

## #40 Pyramids（cs:15426-15535）+ Pyramid()（cs:27816-28120）

### pass 体（常态零掷骰——全部骰在 Pyramid() 内）

```
门: !denyAll && !noSurfaceNoPyramids
§tenth && !dualDungeons: Pyramid(地下沙漠中心X, 沙漠顶-10)          # 无前置骰
for i in [0, GenVars.numPyr):                                     # 候选 = Dunes pass(#2) 预登记的 PyrX/PyrY
  num = PyrX[i]; k = PyrY[i]; minDepth=75; maxDepth=125; noTunnel=false
  门1: 300 < num < w-300
  门2: dungeonSide > Left → num ≥ dungeonX + 0.15w；dungeonSide < Right → num ≤ dungeonX - 0.15w
       （dungeonX = generatingDungeonPositionX = DungeonCrawler 最高房中心，非 Reset 锚点!）
  门3: §tenth && !dual && 地下沙漠盒.Contains(num,k) → 拒
  k 自候选 y 向下扫到首个 active（k < ws 为限）；k ≥ ws ‖ type != 53 → 拒（沙列门）
  num3 = min_l<i |num - PyrX[l]|                                   # 与全部先序候选最小距
  num5 = 220（§drunk: 110）
  if num3 >= num5:
    k--
    §dualDungeons: InAnyPotentialDungeonBounds(num, k+125, 5) → k-=50, maxDepth=100; 复查命中 → continue
    Pyramid(num, k, 75, 125, false)
§surfaceIsDesert / §errorWorld: 各自的额外金字塔串（含 Next(5,8)*(w/4200) 计数 + 中心带/微光距离拒绝环）
```

### Pyramid(i, j, pyramidMinDepth=75, pyramidMaxDepth=125, noTunnel=false) 掷骰序

```
P0. 早退: 命中格 active && (type==151 ‖ wall==151) → false；§dual bounds → false（无骰）
P1. num2 = j - Next(0, 7)                       # 塔顶
P2. num3 = Next(9, 13)                          # 半宽
P3. num5 = j + Next(minDepth, maxDepth)         # 塔底（75..124）
    主体砖壳铺设/平滑（零骰）
P4. if Next(2)==0: 入口侧分支
P5. num11 = Next(5, 8); num12 = Next(20, 30)    # 密室高/深
P6. 密室两 while（左右壁推进，条件循环——推进步进不含骰，壁型判定零骰）
P7. num17 = Next(7, 13); num18 = Next(23, 28)   # 内室宽/高; while num18>0 逐行挖（零骰）
P8. num25 = Next(3); if num25==0: num25 = Next(3)          # ★重掷怪癖（0 必重掷一次）
    §tenth && num25==0 → 再处理
P9. num26 = Next(1, 10)                         # 小堆数
    for num27 in [0, num26):
      i2 = Next(num23, num24); PlaceSmallPile(i2, j2, Next(16,19), 1, 185)
    PlaceTile(...91..., Next(4,7)) ×4            # 四角火把
    for num28 in [num23..num24]: PlacePot(num28, num10+num11, 28, Next(25,28))   # 罐样式
P10. 密室变体深度: num12 = Next(15,20) / Next(10,15) / Next(20,40)（按 num25 分支）
P11. 出口隧道（noTunnel → 在 P10 后直接 return true）:
    num29 = Next(100, 200)                      # 长度
    num30 = Next(500, 800)                      # 长度上限2
    num12 = Next(10, 50)                        # 折返周期
    num32 = Next(5, 10)                         # 隧道半宽
    while flag2:
      num29--; num30--; num12--
      for num33 in [num9 - num32 - Next(0,2)  →  num9 + num31 + num32 + Next(0,2)]:   # ★循环初值与上界各含 1 骰——每次进入该 for 前求值一次（非每迭代）
          隧道行铺设（零骰）
      num10++; num9 += num8
      if num29 <= 0: 出口检查（零骰）
      if num12 < 0: num12 = Next(10, 50); num8 *= -1     # 折返重掷
      if num30 <= 0: flag2 = false
```
我们实现：`StructuresPass.ts` `runPyramidPass`（B3 批修过出口隧道条件掷；候选预登记在 Dunes）。

---

## #41 DirtRockWallRunner（cs:15536-15550）+ DirtyRockRunner（cs:77503-77579）

```
门: !denyAll
for i in [0, w):                       # w 次，i 仅计数
  R1: num  = Next(10, w-10)            # x —— 无条件
  R2: num2 = Next(10, (int)ws)         # y —— 无条件（wall 判定在其后）
  if tile[num, num2].wall == 2: DirtyRockRunner(num, num2)
```

```
DirtyRockRunner(i, j):
  num  = Next(2, 6)                    # 斑厚
  num2 = Next(5, 50)                   # 步数
  vel.X = Next(-10, 11) * 0.1; vel.Y = Next(-10, 11) * 0.1
  while num > 0 && num3 > 0:
    bbox 逐格: |k-pos.X| + |l-pos.Y| < num*0.5*(1.0 + Next(-10,11)*0.015) && wall==2 → wall=59
              # ★该 Next(-10,11) 在 wall 判定之前、每格无条件消费（cs:77544）
    vel.X += Next(-10, 11)*0.05; vel.Y += Next(-10, 11)*0.05; ±1 钳制
    pos += vel; num--; num3--
```
我们实现：`DirtRockWallRunnerPass.ts`（掷骰流 1:1，文件头注已含全部要点）。

---

## #42 LivingTrees（cs:15551-15791）+ GrowLivingTree（cs:28123-28759）

```
门: !denyAll && !noSurfaceNoLivingTrees
num = 200（中心排除带）; num2 = 0; num3 = w/4200
R1: num4 = Next(0, (int)(2*num3)+1)              # 树数（小世界 num3=1 → Next(0,3)）
R2: if num4==0 && Next(2)==0: num4++             # 0 时 50% 升 1（骰照掷）
§extraFloatingIslands: num2 = FindLowestCloud()+1（起 y）
for i in [0, num4):
  flag = false; num5 = 0
  while !flag:
    num5++; if num5 > w/2: flag = true           # 放弃上限（走完本轮后退出）
    R3: num6 = Next(bd, w-bd)                    # 采样 x
    [§tenth&&!remix: num6 = Next((int)(w*0.15), (int)(w*0.85))]
    if num6 <= w/2-200 ‖ num6 >= w/2+200:        # 中心排除带
      j = num2; 自 j 向下扫到首个 active（j < ws 为限）; j ≥ ws → continue（★骰已消费，白掷）
      if type==0 ‖ (§notTheBees 分支):
        j--
        if j > 150:
          flag2 = true
          if IsTileNearby(191,10) ‖ IsTileNearby(192,10): flag2 = false
          if flag2 && !§errorWorld:
            50×50 排斥: {41,43,44,481,482,483}→拒; {189,196,460,717,718,719}→拒（§extra 除外）
          if !§extraLivingTrees:
            for m in [0, numMCaves): |num6 - mCaveX[m]| < 50 → flag2 = false
          if flag2:
            flag = GrowLivingTree(num6, j)       # ★主树
            if flag:
              for n in {-1, +1}:                 # 两侧翼树链
                num7 = num6
                R4: num8 = Next(4)               # 翼树步数
                for num9 in [0, num8):
                  R5: num7 += Next(13, 31) * n
                  if num7 <= w/2-200 ‖ num7 >= w/2+200:
                    num10 = j → 归位（active 上行 / 非active 下行后 -1; §noSurface: +Next(-10,11)）
                    50×50 排斥复扫（!§errorWorld）
                    if flag2: GrowLivingTree(num7, num10, patch: true)
Main.tileSolid[192] = false                      # 尾翻转
```

### GrowLivingTree(i, j, patch=false) 掷骰位形（分段，行号≈cs 实址）

| 段 | 骰 | 说明 |
|---|---|---|
| 锚点归位（:28130-28148） | 无 | 上跳/下落循环 |
| 干基宽（:28179-28181） | `num3=i-Next(2,3)`、`num4=i+Next(2,3)` | 两骰 |
| 主干收窄循环（:28185-28195） | 每轮 `num3-=Next(0,3)`、`num4+=Next(0,3)`；窄干分支 `Next(0,2)`×2 | 条件段各自独立 |
| 宽干门（:28200-28202） | `Next(5)==0` → 内 `Next(2)==0` | 宽干再收窄 `Next(1,3)`×2 + `Next(0,2)`×2 |
| 干内清腔（:28238-28260） | 无 | |
| 顶/枝参数（:28265-28267） | `num12=Next(-8,-4)`、`num13=Next(2)`、`num14=Next(5,15)` | 枝起点/方向/长度 |
| 枝生成循环（:28269-28300） | 每轮 `num11+Next(5)` 落枝位；`Next(5)==0`、按 maxValue 的 `Next(maxValue)==0` ×2 | maxValue 随进度递减 |
| 枝行走（:28391-28405） | 每枝 `(int)(array4[n]*(1+Next(20,30)*0.1))`、`Next(3,5)`；每步 `Next(10)==0` → `Next(2)` 转向 | |
| 根系/横向根（:28510-28600） | 惯性步进（零骰为主，个别 Next(2)） | 转录时照源 |
| 叶簇（:28601-28720） | LargePiles/SmallPiles 放置（含 Next） | |
| 贯通竖井 MakePassage（:29019-29290） | 宽干 flag 才走；腔内 Next(2) 等 | |
| 密室房 PassageRoom（:29306-29510） | 门/织机/宝箱 style 骰 | |

我们实现：`LivingTreePass.ts`（1058 行，主干/枝/根/叶簇/竖井/密室全链已 1:1）。

---

## #43 LivingTreeWalls（cs:15792-15824）——零掷骰

```
门: !denyAll
for i in [25, w-25):
  for j in [25, ws):
    if tile[i,j].type==191 ‖ 上/下/左/右邻 type==191:
      flag = true
      for (k,l) ∈ 3×3 邻域, k!=i && l!=j（十字四格）:
        if (!(active && type==191) && wall != 244): flag = false
      if flag: tile[i,j].wall = 244
```
我们实现：`LivingTreePass.ts` `runLivingTreeWallsPass`。

---

## #44 DemonAndCrimsonAltars（cs:15825-15886）

```
门: !denyAll；头翻转 tileSolid[484]=false（DesertBiome 头已翻过，冗余重放）
num = (int)(w*h*3.3e-06)         # 小世界 4200×1200 → 16 坛（§remix ×3 / §dual ÷2）
for i in [0, num):
  for j in [0, 10000):
    R1: num2 = Next(281, w-3-280)
    while num2 > w*0.45 && num2 < w*0.55: R1' → 重掷 x（仅 x）      # 中央带拒绝
    R2: num3 = Next((int)(ws*2+rl)/3, (int)(rl+(h-350)*2)/3)        # y 带
    while oceanDepths(num2,num3) ‖ dist((num2,num3), shimmerPos) < 150 ‖ (§dual bounds):
      R1'' 全套重掷（x + 中央带环 + y）                              # 两点全重掷
    style = crimson ? 1 : 0（§drunk: 按 crimsonLeft 半场定）
    if !IsTileNearby(num2, num3, 26, 3): Place3x2(num2, num3, 26, style)   # Place3x2 零骰
    if tile[num2,num3].type == 26: break
```
`shimmerSafetyDistance = 150`（cs:4104 readonly）。
我们实现：`CorruptionPass.ts` `runAltarsPass`（含 484 翻转时间线存档；★与 Corruption pass 内猩红逐组祭坛 cs:14241 是原版两处放置，勿合并）。

---

## #45 SurfaceWaterInJungle（cs:15887-15910）——零掷骰

```
门: !denyAll && !noSurface
for i in [0, w):
  for j in [worldSurfaceLow, ws-1):
    if active(i,j):
      if type==60: tile[i,j-1] 与 tile[i,j-2] → liquid=255, liquidType=水   # 两格灌水
      break
```
我们实现：`StructuresPass.ts` `runWetJunglePass`（本仓液体编码水=1，原版=0——liquidType+1 陷阱在案）。

---

## #46 LihzahrdTemple（cs:15911-16004）+ makeTemple（cs:33573-33700+）

```
门: !denyAll
num=0; attempts=0; band=0.25; placed=false
while true:
  num4 = (int)rl; num5 = h-600; if num4 > num5-1: num4 = num5-1
  R1: num6 = Next(num4, num5)                                    # y ∈ [rl, h-600)
  R2: num7 = (int)(((NextDouble()*band + 0.1) * (-dungeonSide) + 0.5) * w)   # x：地牢异侧带
  [§remix&&!noSurface: 大段重掷（notTheBees 0.6-0.8w / 0.2-0.4w 或中心带拒绝 + 上浮扫）]
  常态分支: if tile[num7,num6].active && type==60:                 # 丛林草锚
      placed=true; makeTemple(num7, num6); break
  if attempts++ > 1000000:
    if band==0.35: num++; if num>10: break                        # 10 轮放宽后放弃
    band = min(0.35, band+0.05); attempts = 0
if !placed: makeTemple(w - generatingDungeonPositionX, (int)rl+100)  # 兜底（§remix 变体）
```

### makeTemple(x, y) 掷骰（房间链）

```
num = w/4200 尺度
R1: num2 = Next((int)(num*10), (int)(num*16))                     # 房间数（§drunk/getGood/remix 调整）
R2: if Next(2)==0: 方向翻转
R3: num9 = Next(1, 3)                                             # 行程步长
for i in [0, num2):
  while 未放置:
    R4: num17 = Next(25, 50); R5: num18 = Next(20, 35); if num18>num17 交换
    if i==num2-1 ‖ flag2: 末房加大: num17=Next(55,65); num18=Next(45,50); 交换
    行进: num16 += Next(5,10) / Next(num18+1, num18+3)+num19 / num15 += (Next(num17+1, num17+3)+num19)*num14 / num16 += Next(-5,6)
    if Next(100)==0: 1% 大改向
    与全部已放房 Rectangle.Intersects → 重试（回到 R4）
  放房/连线/双遍游走挖腔(墙87)/通道/封壳/入口隧道+门框/清腔/祭坛 237（末间中心 ±15）
```
我们实现：`TemplePass.ts` `runTemplePass`（陈设五段在 #66 独立槽 `runTemplePart2Pass`）。

---

## #47 Beehives（cs:16005-16058）+ HiveBiome.Place + RandomWorldPoint

```
门: !denyAll
num = w/4200
R1: num2 = 1 + Next((int)(5*num), (int)(8*num))     # 目标巢数（小世界 Next(5,8)+1 → 6-8）
   (§drunk: num2 *= 0.667)
budget = 10000                                      # 固定预算（与巢数无关）
while num2 > 0 && budget > 0:
  budget--
  R2/R3: origin = RandomWorldPoint((int)(ws+rl)>>1, 20, 300, 20)
       # 参数序 (top, right, bottom, left): X = Next(20, w-20)，Y = Next((ws+rl)/2, h-300)
  [§drunk: 额外 RandomWorldPoint((int)ws, 20, 300, 20) 消费且弃置（+2 骰）]
  if HiveBiome.Place(origin, structures):
    num2 -= 1
    R4: num6 = Next(5)                              # 蜂蜜斑目标数（§extraLiquid: 0）
    inner 预算 10000:
      while num7 < num6 && num8 > 0:
        R5: dist = NextDouble()*60 + 30
        R6: ang  = NextDouble()*2π                  # 6.2831854820251465
        num11 = (int)(cos(ang)*dist) + origin.X; y = (int)(sin(ang)*dist) + origin.Y
        num8--
        if 界内 && HoneyPatchBiome.Place(Point): num7++     # 16×16 确定性放置（零骰）
```

### HiveBiome.Place(origin)（HiveBiome.cs）成功路径掷骰

```
门（零骰）: structures.CanPlace(100×100 pad50) / TooCloseToImportantLocations /
            泥比率 ≥ 0.75 且 现存蜂数 ≥ 2
R1: num2 = Next(2, 5)                               # 隧道簇数（§drunk +Next(7,10) / §remix +Next(2,5)）
for i in [0, num2):
  R2: num3 = Next(2, 5)                             # 每簇隧道数
  for j in [0, num3): CreateHiveTunnel((int)pos.X, (int)pos.Y, genRand)   # 内部独立掷骰流
蜂蜜下落位: for k in [0, num): if Next(2)==0 → 蜂蜜滴落点扫描（BadSpotForHoneyFall while）
§drunk: 1000 次 Next(-50,51)×2 随机走（秘密种子）
```
我们实现：`HiveSpiderPass.ts` `runBeehivePass`（预算 10000 固定语义+RandomWorldPoint 参数序两坑已修，文件头注在案；结构互斥走全局 StructureMap）。

---

## 附：#35 Gems（cs:15109，批次锚点）

非本批规格对象（已移植对账），仅记锚：注册序 Beaches(14947) < **Gems(15109)** < GravitatingSand(15198)。
我们的实现 `ShiniesPass.ts` `runGemsPass` 在 vanillaBiomes 尾（Beaches 后）✅。
