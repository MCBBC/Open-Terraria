# C13c 波场 GLSL 化设计案（shimmerWaves 公式翻译清单 + 对拍方案 + 风险）

状态：**设计案（二期开工面,本期不实现）**。2026-09-30,C13b 液体 op-batch 收官后立项。
上游判例：C13b（非微光浸润带/亮线/坡面增强批化,`?c13b=0` 逃生门）、liqgl 刀2
（微光基色顶点色调制,`LiquidRenderer.cs:745-759` SetShimmerVertexColors）、
liqpolish A（波值场单源+跨 pass 缓存 `_wvArr`,f64 容器位等锁
`tests/liqpolish-shimmer-field.test.ts`）。

---

## 0. 目标与不目标

**目标**：把微光液体场的 CPU 逐 tile 求值（`shimmerWaves4` 8 sin/tile + 双线性
张量 + `_wvArr` 跨 pass 缓存流量）迁入 GPU——基色/闪纹透明度改为着色器内
逐像素解析场,CPU 侧微光 tile 只剩几何+α。

**不目标**：
- 不动 glint（obj19 波光,WaterWaves 场,另一子系统）;
- 不动 sparkle 的 16 档色相量化与 16 帧带选择（贴图源矩形已承载帧;色相表
  `sparkHueRGB` 量化语义必须保持,见 §3.3）;
- 不动 CPU 原链（`?liqgl=0`/`?c13c=0`/CPU 渲染三重回退全部保留）。

## 1. 现状基线（C13b 收官后）

| 面 | 现状 | 残余成本 |
|---|---|---|
| 微光基体 quad | liqgl 刀2 顶点色调制单 quad（GPU 插值≈原版逐顶点） | CPU 每格 `shimmerCornersFromWaves`：4 节点波值=8 sin（bg 写/fg 读缓存）+ 双线性张量 12 f32 |
| 微光浸润带 | liqpolish 带批臂（同上顶点色） | 同上,每带 tile 一份 |
| sparkle ADD | liqpolish 批（单白度带+顶点色相） | CPU:波值共享已零重复;余 `shimmerFrame`+hue 纯算术 |
| 跨 pass 缓存 | `_wvArr` Float64Array(n×8) bg 写/fg 读 | 帧内一次写、一次读;内存 n×64B |

trace 口径（txr-shimmer3,20260929）：微光湖场构造残余 ≈ drawVanillaLiquids
self 5.17% 中的波值/张量段（C13b 后占比略升）。C13c 预期收益主要在
**数百列大湖**场景：每帧 ~8 sin×(湖 tile 数) + 12 f32×4 角写入 + 缓存读写,
估算 0.5–1.5ms/帧量级;并消除 fg 复用环的微光段整段拷贝（顶点色改 GPU 出,
fg 重发射只做 α 缩放）。

## 2. 翻译清单（公式 → GLSL 逐条）

源：`VanillaLiquidRenderer.ts`（ LiquidRenderer.cs 对应行号随注）。GLSL ES 3.00
（WebGL2,项目基线）,`precision highp float` 强制。

### 2.1 波值（VS 不做,FS 逐像素）

```
// shimmerWave (cs:761-763)
float shimmerWave(vec2 tile, float tVis) {
  return sin(((tile.x + tile.y / 6.0) / 10.0 - tVis / 360.0) * 6.283185307179586);
}
```
- 入参 tile = 像素所在世界 tile 坐标（**非格点整值**——逐像素场,取
  `tileFloor + vTexelFract`,见 §3.1 属性面）。
- tVis = `visEffectFrames()`（渲染段内不变）→ uniform `uTVis`（float;
  JS 侧 `Number` 直传,帧界更新一次）。

### 2.2 白噪声（uint 混淆,cs:793-797）

```
uint shimmerNoise(vec2 tile) {
  uint ux = uint(abs(floor(tile.x)));          // |floor(x)| >>> 0（tile 恒 ≥0 域可直 uint）
  uint uy = uint(abs(floor(tile.y)));
  ux = 36469u * (ux & 0xffffu) + (ux >> 16u);  // GLSL uint 乘加自然 mod 2^32 ≙ >>>0
  uy = 18012u * (uy & 0xffffu) + (uy >> 16u);
  return (ux << 16u) + uy;                     // 溢出回绕 ≙ ((ux<<16)>>>0 + uy)>>>0
}
float noiseSin(vec2 tile, float tVis) {
  return sin(float(shimmerNoise(tile)) / 10.0 + tVis / 180.0);
}
```
- **位语义**：GLSL ES 3.00 uint 溢出回绕（mod 2^32）与 JS `>>>0` 逐位同;
  `36469×0xffff < 2^31` 无中间溢出差。tile 负域（世界外）由消费端钳制,
  JS 侧 `Math.abs(Math.floor(x))` 的 abs 必须保留语义 → GLSL 用 `uint(abs(int(floor(x))))`
  双保险（floor→int 截断→abs→uint,四步各自精确定义）。
- **`float(noise)` 高位损失定谳（本节核心风险）**：noise ∈ [0, 2^32),
  f32 尾数 24 位 ⇒ `float(noise)` 对 N≈2^32 的绝对误差达 2^8=256;
  除 10 后 sin 入参误差 ≤25.6 rad——**周期级相位差,位等不可达**。
  （hash 本体的 uint 乘加是精确整数运算,损失只发生在 uint→float 转换步。）
  ⇒ **定谳案：noise hash+noiseSin 保留 CPU 逐 tile 求值,经每顶点属性
  `aNoise` 上 GPU**（折衷细节与 CPU sin 量变化见 §3.2 方案 H）。

### 2.3 基色（cs:803-807）

```
vec3 shimmerBase(vec2 tile, float tVis) {
  float k = 0.1 + shimmerWave(tile, tVis) * 0.4;
  // A=(0.64705884, 26/51, 14/15)  D=(41/51, 41/51, 1.0)
  return vec3(0.64705884, 0.50980393, 0.93333333)
       + (vec3(0.80392158, 0.80392158, 1.0) - vec3(0.64705884, 0.50980393, 0.93333333)) * k;
}
```
- 常量预析与 JS 侧 `SHIM_A_R/SHIM_D_R` 同源（f32 常量编入着色器源）。
- 输出即"未乘 α 的顶点.rgb"——quad α 的预乘在 FS 尾统一（out.rgb × vCol.a,
  PRECIP_FS 同式）。

### 2.4 逐像素场合成（FS 主式）

```
// 逐像素基色场（替代 CPU 双线性张量——真正逐像素,非顶点插值）
vec3 field = shimmerBase(vTile, uTVis);
// 乘 vCol.rgb 退役:批侧 vCol.rgb 恒 1(预乘恒等),调制全部进 FS
outColor = vec4(tex_p.rgb * field * vCol.a, tex_p.a * vCol.a);
```

### 2.5 glitter 透明度（cs:773-790）

> **★四期定谳批注（2026-10-07,用户实报「果冻感/下水波动变小」翻案）**:本节处方
> （noiseSin 顶点插值 + FS 内 `remap(remap(w)×n)` 逐像素）已**证伪废弃**——原版
> `SetShimmerVertexColors_Sparkle`（LiquidRenderer.cs:732-743）= GetShimmerGlitterOpacity
> **逐角终值（含钳制）置位 quad 角** → TileBatch 顶点色插值（TileBatch.cs:175-187
> 索引表 TL,TR,BR,BL/对角线 TL-BR）。FS 内对插值后的噪声再做 remap×remap =
> **插值后钳制 ≠ 原版钳制后插值**:四角噪声异号格（常态）`E[max(Σw·n,0)] <
> Σw·E[max(n,0)]` = 亮纹插值均值系统性折半 + 钳制零线折痕高频化（软斑破碎）。
> 活机+冻结双 A/B 定谳:基体场两臂逐像素等价（ptp B/A≈1.03/同频同相/静态 maxd=2）,
> 差域全集中亮纹（S1 子窗运动像素互相关 0.391=插值 vs 均值的 cos(Δφ) 结构域）。
> 修复=四角 glitter 终值经 aNoise 槽上 GPU,FS uSpark=1 支 `g=vNoise` 纯硬件插值
> （LIQSHIM_FS 四期注;场值闸 mode② 改验插值域）。§2.2 的 noise hash 留 CPU 定谳
> 不变（终值仍在 CPU 逐角求值,hash→f32 损失面随之消解）。

```
float glitter(vec2 tile, float tVis, float noiseSinV) {
  float w = shimmerWave(tile, tVis);
  float n1 = clamp((w + 0.5) / 1.5, 0.0, 1.0) * 0.35;   // remap(w,-0.5,1,0,0.35)
  float n2 = clamp((n1 * noiseSinV) / 0.5, 0.0, 1.0);   // remap(·,0,0.5,0,1)
  return n2;
}
```
- `remap(v,a,b,c,d) = c + (d−c)×clamp((v−a)/(b−a),0,1)`（单调区间,与 JS 逐式同;
  b==a 分支 JS 返回 c——此处 a≠b 恒成立,无需分支）。
- **noiseSin 输入**（§2.2 定谳案）：hash 在 GLSL 内不可精确复刻 float(noise)
  的高位损失 ⇒ **noiseSin 由 CPU 逐 tile 算好,作为每顶点属性 aNoise 传入**
  （4 节点/tile → 属性取本像素所属节点值的插值? 否——noiseSin 是逐节点离散量,
  原版即逐顶点/逐节点语义）。折衷定谳见 §3.2。

### 2.6 sparkle 色相/帧（**保持 CPU,不迁移**）

- `shimmerFrame`（cs:791-801）决定源矩形 Y（16 帧带）——CPU 批构建时已选好
  源矩形,GL 侧无感。
- hue（cs:766-771）16 档量化 + `hslToRgb` 表——保持顶点色方案（现有
  `_spCols` 路径零改动）。若二期想连 hue 也上 GPU：需 LUT 纹理（16×1 RGB）
  + `texture(uHueLut, vec2(hueIdx/16 + 0.5/16, 0.5))`——**列为可选项**
  （收益仅省每 tile 3 次表查,风险=量化边界翻档,不进一期）。

## 3. 管线设计

### 3.1 程序与顶点布局

- 新程序 `sprite:liqshimmer`（VS=PRECIP_VS 复用 + 新 FS;GLSpriteLayer 程序注册
  判例 `sprite:precip` 同族）。
- 顶点环：新 `LIQ_SHIM_STRIDE = 10`（x,y,u,v,r,g,b,a + **tileX,tileY**）——
  在 PRECIP stride-8 基础上加 2 float（像素的世界 tile 坐标,FS 内
  `tileFloor + fract(vUvInTile)` 或直传像素级 tile 坐标由 VS 插值）。
  **定谳**：传 `aTile = (x*16+px_in_tile)/16` 的连续坐标（VS 插值逐像素线性,
  FS 取 `floor(aTile)` 得 tile 域,`fract` 得格内域——**线性插值与 CPU 逐像素
  floor 的差**：跨界像素（u 恰在 16px 边界）插值坐标 floor 结果与 CPU 逐像素
  独立 floor 一致（同一线性坐标轴）✓）。
- ring 复用判例：C13b `_batRing` 同构新环 `_shimRing`;段=微光表纹理同质
  （`liqshim:<texId>` 键族,flushBandRun/flushRun 同式收口）。

### 3.2 noiseSin 的折衷（§2.2 定谳落地）

- **方案 H（采纳）**：hash+noiseSin 保留 CPU 逐 **节点** 求值（每 tile 4 次
  noise+sin）,结果作为每顶点属性 `aNoise` 传入（stride 11）。FS 的 glitter
  读 `aNoise`——顶点间插值 ≙ 原版「4 角节点值→顶点间插值」语义 ✓。
  成本：CPU 每 tile 4 sin（现状 8 sin——波值 4 sin 上 GPU,噪声 4 sin 留
  CPU）,**CPU sin 减半**,且双线性张量/`_wvArr` 跨 pass 缓存全退役。
- **方案 F（否决备案）**：噪声也全 GPU——`float(noise)` 高位舍入造成相位级差
  （§2.2）,位等不可达,弃。

### 3.3 着色器契约（防 C13b 同族回归）

- PRECIP_FS 契约 `outColor = vec4(c.rgb×vCol.rgb, c.a×vCol.a)` 不动;
  新 FS 的调制项在 FS 内（field × vCol.a）,**顶点 rgb 仍走预乘恒等
  （rgb===α）**——`tests/liquid-gl-batch.test.ts` 的预乘锁判别面继续成立
  （微光段 rgb===a 域）。
- y 镜像 gate 重发射（emitVanillaLiquidGate）：aTile/aNoise 属性随顶点镜像
  不变（场依赖 tile 坐标非屏幕 y）✓——gate 环需同步扩 stride。

## 4. 对拍方案

1. **场值离线对拍**（实现前可行性闸）：小 FBO(256×256) 渲染 field×255,
   readPixels 对照 JS 参照（`shimmerBaseColorF` 逐像素）,网格
   x∈[0,256)×tVis∈{0..3599 步 30}。验收：maxd ≤ 2/255（highp sin vs f64 sin
   域;超域=mediump 漏入或常量错）。
2. **整帧 A/B**（`scripts/_c13c-ab.mjs`,C13b 同式）：臂 A=`?c13c=0`
   （CPU 场现行链）,臂 B=GLSL 场;微光湖场景（`_liqpolish-ab` 场面构造复用,
   zoneShimmer 门）。判据：census maxd ≤ 72（liqgl LA 同族登记域;真域以
   实测收紧）∧ n%<20;LB 批真在走（emitBatchQuads↑/fb=0/rp=0/
   accFailLedger 空）;LE 帧耗 B≤A×1.02。
3. **单元锁**：`tests/liquid-c13c-shimmer-glsl.test.ts`——结构锚
   （`sprite:liqshimmer` 程序/stride/aNoise 属性/`?c13c` 逃生门）+ 数学锚
   （glitter remap 纯函数与旧 `glitter4FromWaves` 位等——CPU 侧保留部分）。
4. **源锚锁**：`?liqgl=0`/`?c13b=0`/`?c13c=0` 三逃生门独立;CPU 场路径
   （`shimmerCornersFromWaves`/`applyShimmerBaseTint`）原样保留。

## 5. 风险清单

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| 1 | `float(noise)` 高位舍入 → sin 相位差（§2.2） | 已定谳规避 | noiseSin 留 CPU（方案 H） |
| 2 | mediump 精度（移动 GPU 默认 FS 精度） | 高 | FS 强制 `precision highp float`;离线对拍闸(§4.1)前置 |
| 3 | 逐像素场 vs CPU 双线性张量的**系统性差**（对角线/裁剪角两备案域消失,换成逐像素真场） | 中 | 域内登记:census 实测定谳;视觉上更贴原版连续场（XNA 顶点插值近似）,方向中性。★四期实测批注（2026-10-07）:本条对【基体场】成立（静态 maxd=2/振幅比 1.03=方向中性实证）;对【亮纹 glitter 段】**不成立**（随机节点场的插值/钳制次序非中性,见 §2.5 四期批注——已按原版顶点插值语义修复） |
| 4 | 顶点 stride 变更波及 gate 环/fg 复用环（三环同步扩） | 中 | 环扩容一次性改;`tests/liquid-gl-batch` 全套回归 |
| 5 | ANGLE/D3D uint 位运算回绕语义 | 低 | GLSL ES 3.00 规范定义 mod 2^32;离线对拍覆盖 |
| 6 | tVis uniform 帧界错拍（跨相位时钟管线判例——hell-bg dt0 冻结案同族） | 中 | uTVis 在批发射点取值（渲染段内 visEffectFrames 不变,与 tVisPass 同源单点） |
| 7 | 收益偏小（场构造已半批化） | 中 | 定位为**大湖场景**专项;开工前先以 `_liqpolish-ab` FNS 口径复测 residual（若 <0.5ms/帧 可降级不开工） |

## 6. 开工顺序（二期）

1. §4.1 离线场值对拍 harness（纯 GL 侧,不动游戏管线）→ 验收线过再动刀;
2. stride-11 环 + `sprite:liqshimmer` 程序 + 微光基体段迁移;
3. 浸润带微光段/gate 环/fg 复用环同步;
4. `?c13c=0` 逃生门 + 三层测试 + `_c13c-ab.mjs` 整帧对拍;
5. C13b 同款收官流程（定格→金标→独立复核→判语+边界声明→登记债→档案）。
