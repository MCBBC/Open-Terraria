# 移交报告：TileFrame 地表型邻格掷骰缺口 → worldgen 域

> 移交方：HM 探针/肉后条带认证批（HardmodePass 域）
> 接收方：worldgen 会话
> 日期：2026-09-02
> 优先级：**P1**（HM 探针 L3 归零的唯一阻塞项）

---

## 1. 发现概要

x86 对拍探针（/tmp/hm1458-rig/）实证：`genSquareTileFrame`（FinalCleanupPass.ts）在**地表型邻格分支**（草/丛草/植株/藤/树族 KillTile）**零掷 genRand**，而原版 `TileFrame`（Collision.cs→WorldGen.cs cs:156530 同族）在这些分支**每格消费 1~n 掷**。掷差导致 geRunner V 带行走 dx 扰动取值漂移 → V 带路径分叉 → 转化集差 + 回填洪泛受理差 = **L3 残差 42,851 格**（act=3/typ=26,999/wal=15,849）。

**RNG 面已排除**：22,475,354 样本（JS 全 pass）与 x86 initializeHardMode 掷流 **bit 级全等**——抖动区间/菱形判据/GERunner 掷序在样本层全部正确。残差非 RNG 面问题。

---

## 2. 缺口精确定位

### 2.1 原版 TileFrame 掷骰分支（WorldGen.cs TileFrame 族）

以下分支在`genSquareTileFrame`（=原版 SquareTileFrame→TileFrame 链的 JS 镜像）中**零掷**，但原版每格消费：

| 邻格类型条件 | 原版掷骰 | 原文锚（1457） |
|---|---|---|
| **草族退化**（type 2/23/199 且下格非实心） | `genRand.Next(15)` = damage 采样 → KillTile | TileFrame 内草退化支（WorldGen.cs:4777 等） |
| **丛草**（type 3） | `genRand.Next(15)` 同族 | 同 |
| **植株**（type 24/52/61） | `genRand.Next(15)` | 同 |
| **藤**（type 52 且上方非同型） | KillTile 级联 | 同 |
| **树族 KillTile**（tree 族 base 被挖） | `genRand.Next(15)` + SquareTileFrame 级联 | TreeGrow/TreeKill 面 |

### 2.2 精确定位方法（红五已验证）

NB-A2 的 /tmp/hm1458-rig/ 探针已装备 `SW_ROLLLOG`（UnifiedRandom.InternalSample 观察钩）+ `MARK HM_BEGIN/HM_END` 段界标记。运行步骤：

```bash
# x86 侧
bash /tmp/hm1458-rig/run-hm-probe.sh hm-probe 9293480
# 产出 /tmp/hm1458-rig/out/hm-probe/roll-x86-hm.txt（HM 段掷流）

# JS 侧
cd game && SW_HM=1 SW_HM_OUT=/tmp/hm1458-rig/out/hm-probe/js \
  SW_HM_SEED=9293480 npx vitest run tools/_hmprobe.test.ts
# 产出同目录 roll-js-hm.txt

# 比较
node tools/_hmprobe-compare.mjs /tmp/hm1458-rig/out/hm-probe /tmp/hm1458-rig/out/hm-probe/js
```

**首差格定位**：g2 run 实证首差在 `T(2281,229)`——x86 post 仍 type=2（草），JS post 已变 23（腐化草）。反推：x86 该位置的 TileFrame 级联消耗了骰子使行走 dx 扰动偏移，V 带路径在此分叉。

---

## 3. 修复规格

### 3.1 改什么

`genSquareTileFrame`（FinalCleanupPass.ts）内，以下邻格分支补 `rng` 消费：

1. **草族退化**：邻格 type∈{2,23,109,199} 且下格非实心 → 原版 KillTile 草退化（`type = 0` 即泥土）——掷 `Next(15)` 伤害采样
2. **丛草**：邻格 type==3 → 同上
3. **植株/藤**：同族 KillTile 掷
4. **树族**：树干基座被挖 → 树整体 KillTile 级联（多格多掷）

### 3.2 改什么（不改）

- `genSquareTileFrame` 的**框架语义**（3×3 TileFrame 重框 + resetFrame）不动
- `st.setTile` 调用不动（此函数不写 type，只做 framing）
- 调用方（geRunner/GemPasses/TileCleanupPass/SecretSeedDoEndsPass）不改——他们只传坐标

### 3.3 注意

- **掷骰源一致性**：genSquareTileFrame 内部 rng 参数必须是调用方传入的同一 RNG 实例（=世界种子 fresh 流），不能另起 Math.random
- **不影响七链**：修后七链金标可能翻色（掷流多出 TileFrame 骰）——如实列出归属，按 memory `seven-chains-full-green` 陈账惯例处置

---

## 4. 验证步骤（修后必跑）

```bash
# 1. x86 重跑（如 x86 侧未动则复用已有 dump）
bash /tmp/hm1458-rig/run-hm-probe.sh hm-verify 9293480

# 2. JS 重跑
cd game && SW_HM=1 SW_HM_OUT=/tmp/hm1458-rig/out/hm-verify/js \
  SW_HM_SEED=9293480 npx vitest run tools/_hmprobe.test.ts

# 3. 比较
node tools/_hmprobe-compare.mjs /tmp/hm1458-rig/out/hm-verify /tmp/hm1458-rig/out/hm-verify/js
```

**验收标准**：
- L0 pre：全零（不变）
- L1 条带：两翼锚点 ±0 列（如仍偏 → 还有其他掷差源，逐段二分）
- L2 回填：斑数/墙 id 直方图收敛
- **L3 post：逐格差 → 0**（或残余逐格列明归属且不影响主流游戏路径）

---

## 5. 工具清单（全在盘可复用）

| 工具 | 位置 | 用途 |
|------|------|------|
| x86 rig | /tmp/hm1458-rig/ | Terarria1458+HardmodeProbeHook，run-hm-probe.sh 启动 |
| JS 驱动 | game/tools/_hmprobe.test.ts | SW_HM=1 驱动 generateWorld+initializeHardMode |
| 比较器 | game/tools/_hmprobe-compare.mjs | 四层判定（L0/L1/L2/L3） |
| 二分仪 | game/tools/_hmbisect.test.ts | 逐槽掷数对拍（NB-A2 建） |
| 基线 dump | /tmp/hm1458-rig/out/g2/g3/ | 认证对照参考（36,288/42,851 基线） |

---

## 6. 修复后验收口径

1. `tools/_hmprobe-compare.mjs` L3 = **0**
2. hardmode 四件套（hardmode-init/wof-hardmode/wof-hardmode-chain/hardmode-chain-five-fixes）全绿
3. 掷流总长 x86 ≈ JS（±0 = 完美；如仍有微差逐格列明）
4. 七链金标：如翻色如实列明归属（本修复合法改变了 TileFrame 掷骰消费）

---

## 7. 执行回执(IIIII216 批,2026-09-03,系统重启断点版)

> 执行方:worldgen 会话(IIIII216)。**完整台账章=XCIX(content-parity-vs-vanilla-2026-08-16.md),重启后落笔;断点=/tmp/iii216-out/NOTES.md。**

### 已落刀(全部在盘)
- 根因翻案:文档 §2.1 表(Next(15)/草退化)与原文不符——HM 窗 generatingWorld=true ⇒ TileFrameCosmetic 不走 ⇒ 实心格级联零掷;真根=**geRunnerGen 28 条 tile 转化支从未调用已 import 的 genSquareTileFrame**(NB-A3/LXVIII 接线被 IIII177 重构窗口冲掉)。
- 落刀:HardmodePass.ts cascade 闭包(inext 回写/读回)+28 支尾接线(1458 cs:77033-77202 逐支锚)+NB-A 备注改正+SW_HM_ALT_STATS 取证桩(env 门控)。
- 验收①:HM L3 36,839→**3,825**(act/typ/liq/lty/half/slope/inact 全零,条带几何逐值全等;残 wal=回填斑域)。
- 验收②:tooeasy #105 T165 **归零达成**(_iii207stal:[C]2727/2727 同族、[D] 两侧逐值全等 20566/474);mile8 tooeasy #105 A=0/T=0(修复前 A=1,326/T=12,165)。
- DSEG 复跑:GER1 13,438,434/GER2 10,816,606/ALT 92,324/post-HM 全 eq(LXVIII 口径复现)。
- 回归:hardmode 四件套 46/46+金标十件套+护卫五件+seed-parity+esbuild+tsc+spot 十链 10/10+g 链 mile8 全绿。

### 唯一残余(L3 残 3,825,单斑)
- x86 SW_ALT(alt216f,pre 与 JS L0 全零同态):ok=**21** vs JS ok=**22**——前 21 斑全等,唯一分叉=JS 第 22 斑(attempt 53588: 1568,451 w202 n115)在 x86 侧无匹配行。M 差(4508 vs 3720)表明 match 序分叉点更早,与"tile 态一致+采样序一致"矛盾——重启后用 tools/_iiiii216-altcmp.mjs 对齐两侧 m/f 行序列定谳(断点 NOTES.md 待完成①)。
- 提示:run216-min.sh 免 roll log 后 x86 生成仅 ~3 分钟(此前 45 分钟全为 roll log I/O)——复跑成本极低。

### ★IIIII216b 收口回执(2026-09-04,待完成①已闭案,台账章=CIV)
- **定谳**:「单斑」非斑,是 **ALT 回填段 PlaceWall 帧掷债**——vanilla `Actions.PlaceWall`(Actions.cs:537-548)每次调用尾随 `SquareWallFrame(self)+邻4组`,每组 9×`Framing.WallFrame` 仅组中心带 `resetFrame:true`(Framing.cs:389-395)⇒ 每漆格消耗 `genRand.Next(0,3)`×5(wall==21 再 Next(2);wallLargeFrames 查表/WallFrame 头守卫界外/wall==0 均零掷);JS `paintBackfillOutline` setWall 直写零掷 ⇒ spot#1 漆后流位 r5977→7177 实测 +1,197 掷、全批缺 4.5 万掷 ⇒ attempt 边界漂移、点序分歧,JS 第 22 斑=流错位幽灵斑。旧「M 差 4508 vs 3720」之谜=3720 系按 2A+M 纯节奏反解的伪 M(真实 match 两侧 4,508 全同);值流前缀 110,896 值逐位全同与点序分歧并存的原因=值流对撞不见条件掷差,必须绑 per-attempt 流位结构锚(p 行 r 仪)。
- **修**:paintBackfillOutline 重写=OuterOutline 迭代序 1:1+每 PlaceWall 5 组中心掷骰镜像(HardmodePass.ts,★IIIII216b;调用面 HardmodePass.ts:498+tests/wof-hardmode.test.ts:216 随迁)。
- **验收**:JS attempts=64,711/successes=21/c15000=4/floods=106 与 x86 全同;**L3 逐格八通道全 0**(wal digest 两侧同=0bd843cb);斑序 #1..#21 按 attempt 号全等;p 行 64,711 行 0 错配、流位差恒定 23566807。§6 验收口径 1-4 全达(hardmode 四件套 46/46;金标十件套 81/81;五点 12/12 绿+登记红 skyblock/pumpkin 维持)。仪具与产物=/tmp/iii216b-out(rig 血统 /tmp/iii216b-rig-src+/tmp/iii216b-rig.app,SW_EVIL 钩=serverconfig 无 evil 键的替代面)。
