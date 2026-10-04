// @ts-nocheck
// 光照 blur+scan 核 AssemblyScript 实现 —— WASM 管线第二/四刀(blur 2026-10-03,
// scan 2026-10-04)。ABI 版本 lightVersion()=2(scan 导出面扩入,旧 v1 模块拒载)。
//
// ============ blur 核(第二刀) ============
// 移植源(唯一真值):src/lighting/LightMap.ts 的 blurPass(L79-93)+ blurLine(L101-167)
// ——逐语句 1:1,行号锚 LightMap.ts(2026-10-03 盘上版本)。present 不移植
// (实测占 compute 1% 不值得)。
//
// ★位级策略(验收线):blurLine 的 running 光值 zr/zg/zb 是 f64 链式累加器——
//   JS 侧 Float32Array 只承载存储舍入,链式传递全程 f64(`zr *= air` 在 f64 域,
//   `r[i] = zr` 才落 f32 舍入)。故本实现全程 f64 算术(load<f32> 后 promote),
//   仅 store 落 f32(f64→f32 IEEE round-to-nearest-even,与 JS 同式)。
//   **f32x4 SIMD 在此不可用**:链式累加器降 f32 = 每次衰减乘法丢尾,~2e-6 相对
//   漂移经 ×255 量化后在量化边界翻转 1/255(23k 格×3 通道统计期望 ~10 格/帧),
//   位级验收不过——f64x2 双线并行亦因 f32→f64 通道搬运开销(~9 ops/通道)不敌
//   标量(~8 ops/通道)而放弃。本核=纯标量 f64。
// - 比较语义:NaN 比较恒 false(JS 同);±0:0 > -0 = false(JS 同);wasm f64
//   比较/乘法 = IEEE,V8 同源,无舍入差。
// - 死标记/阈值链逐语句照抄(含冗余的 `mr <= zr` 守卫——审计性优先)。
// - 衰减常数经 ABI f64 形参传入(JS 侧读 lightTables live binding 当前值),
//   不内嵌常量:updateLightDecay 每帧覆盖 DECAY_*,内嵌即漂移源。
// - 水 flick LUT:JS 侧 buildWaterFlick 先建(LUT 依赖 FastRandom 种子链,留在
//   JS 保种子链单源),本核只读 u8 LUT(0|1)。
//
// 内存布局/ABI 总表见 src/wasm/README.md;ABI 版本 lightVersion()=1(era guard)。

// ---------------- 缓冲基址(线性内存;lightInit 一次性分配) ----------------
let rBuf: usize = 0;      // f32×cap   光图 R(LightMap.r 镜像)
let gBuf: usize = 0;      // f32×cap   光图 G
let bBuf: usize = 0;      // f32×cap   光图 B
let maskBuf: usize = 0;   // u8×cap    遮挡 mask(LightMap.mask;值域 0-4)
let lutBuf: usize = 0;    // u8×cap    水 flick LUT(LightMap.flickLut;0|1)
let capCells: i32 = 0;    // 已分配容量(格)

// ---- scan 核缓冲(v2;lightInit 一次性分配) ----
let typeBuf: usize = 0;      // u16×cap  tile type
let flagsBuf: usize = 0;     // u8×cap   flags(bit0=active)
let fxBuf: usize = 0;        // u16×cap  frameX
let fyBuf: usize = 0;        // u16×cap  frameY
let wallBuf: usize = 0;      // u16×cap  wall id
let liqBuf: usize = 0;       // u8×cap   liquid 量
let liqTBuf: usize = 0;      // u8×cap   liquidType
let halfBuf: usize = 0;      // u8×cap   halfBrick
let slopeBuf: usize = 0;     // u8×cap   slope
let wireBuf: usize = 0;      // u8×cap   wire 位(WIRE_ACTUATED=32)
let paintBuf: usize = 0;     // u8×cap   tile paint
let paintWallBuf: usize = 0; // u8×cap   wall paint
let coatBuf: usize = 0;      // u8×cap   coat(COAT_INVISIBLE_BLOCK=2/WALL=4)
let spListBuf: usize = 0;    // u32×cap  特例格索引(③b 路由;map 系 li)
let spCount: i32 = 0;        // 本帧特例格数

// ---- 表区(加载器一次上传;TileLightScanner 构造器烘焙同源) ----
let tblBlocks: usize = 0;     // u8×65536  挡光(TILE_BLOCK_LIGHT_SHEETS;718 动态经形参)
let tblNoSun: usize = 0;      // u8×65536  挡阳(TILE_NO_SUN_LIGHT_SHEETS)
let tblCracked: usize = 0;    // u8×65536  裂砖(CRACKED_SHEETS)
let tblAllowWater: usize = 0; // u8×65536  AllowLightInWater
let tblMush: usize = 0;       // u8×65536  蘑菇组发光
let tblFlicker: usize = 0;    // u8×65536  FLICKER_SHEETS(405/215/592)
let tblHasLight: usize = 0;   // u8×65536  d.light 存在
let tblSpecial: usize = 0;    // u8×65536  SPECIAL_LIGHT_SHEETS(③b 路由门)
let tblSheet: usize = 0;      // i16×65536 内部 id → vanilla sheet(-1=无)
let tblLightR: usize = 0;     // f32×65536 d.light/255(★f32 舍入=JS Float32Array 同式)
let tblLightG: usize = 0;     // f32×65536
let tblLightB: usize = 0;     // f32×65536
let tblWallLight: usize = 0;  // u8×512    WALL_LIGHT ∪ {73,227}
let tblWallEmHas: usize = 0;  // u8×512    WALL_EMISSIVE 键存在
let tblWallEmGated: usize = 0;// u8×512    WALL_EMISSIVE_GATED
let tblWallEmR: usize = 0;    // f32×512   (★f32 舍入=JS Float32Array 同式)
let tblWallEmG: usize = 0;    // f32×512
let tblWallEmB: usize = 0;    // f32×512
let tblTorch: usize = 0;      // f64×72    TORCH_COLORS(24×3;JS 数组 f64 原值)
let tblGlass: usize = 0;      // f64×21    GLASS_TINT(7×3;f64 原值)
let tblPaint: usize = 0;      // f64×768   paintColor(256×3;255 域全枚举,尾=White)
let tblTogAxis: usize = 0;    // u8×65536  LIGHT_TOGGLE 轴(0=x,1=y)
let tblTogDelta: usize = 0;   // u16×65536 LIGHT_TOGGLE δ(0=非灯器件)
let tablesReady: bool = false;
let pixelBlockId: i32 = -1;

export function lightVersion(): i32 { return 2; }

/** 一次性分配(幂等;1=ok 0=拒)。cells=格容量(JS 侧 1<<18,覆盖 4K zoom-out)。
 *  ★v2:追加 scan 核缓冲(13 通道 tile 窗口 + 特例格列表)与表区(u16 type 全域
 *  65536——OOB type 生产不可达(TileStore.setTile 只写注册表 id),全域 sizing
 *  免逐格边界守卫,加载永不越界)。 */
export function lightInit(cells: i32): i32 {
  if (capCells !== 0) return 1;          // 幂等(sm2Init 同款)
  if (cells <= 0 || cells > 1 << 24) return 0;
  rBuf = heap.alloc(<usize>cells * 4);
  gBuf = heap.alloc(<usize>cells * 4);
  bBuf = heap.alloc(<usize>cells * 4);
  maskBuf = heap.alloc(<usize>cells);
  lutBuf = heap.alloc(<usize>cells);
  // ---- scan 核:tile 通道窗口(u16×4 + u8×9 = 17B/格) + 特例格列表(u32×cap) ----
  typeBuf = heap.alloc(<usize>cells * 2);
  flagsBuf = heap.alloc(<usize>cells);
  fxBuf = heap.alloc(<usize>cells * 2);
  fyBuf = heap.alloc(<usize>cells * 2);
  wallBuf = heap.alloc(<usize>cells * 2);
  liqBuf = heap.alloc(<usize>cells);
  liqTBuf = heap.alloc(<usize>cells);
  halfBuf = heap.alloc(<usize>cells);
  slopeBuf = heap.alloc(<usize>cells);
  wireBuf = heap.alloc(<usize>cells);
  paintBuf = heap.alloc(<usize>cells);
  paintWallBuf = heap.alloc(<usize>cells);
  coatBuf = heap.alloc(<usize>cells);
  spListBuf = heap.alloc(<usize>cells * 4);
  // ---- 表区(per-type u16 全域 65536 / wall 512 与 JS WN 同域) ----
  tblBlocks = heap.alloc(65536);
  tblNoSun = heap.alloc(65536);
  tblCracked = heap.alloc(65536);
  tblAllowWater = heap.alloc(65536);
  tblMush = heap.alloc(65536);
  tblFlicker = heap.alloc(65536);
  tblHasLight = heap.alloc(65536);
  tblSpecial = heap.alloc(65536);
  tblSheet = heap.alloc(65536 * 2);
  tblLightR = heap.alloc(65536 * 4);
  tblLightG = heap.alloc(65536 * 4);
  tblLightB = heap.alloc(65536 * 4);
  tblWallLight = heap.alloc(512);
  tblWallEmHas = heap.alloc(512);
  tblWallEmGated = heap.alloc(512);
  tblWallEmR = heap.alloc(512 * 4);
  tblWallEmG = heap.alloc(512 * 4);
  tblWallEmB = heap.alloc(512 * 4);
  tblTorch = heap.alloc(72 * 8);
  tblGlass = heap.alloc(21 * 8);
  tblPaint = heap.alloc(768 * 8);
  tblTogAxis = heap.alloc(65536);
  tblTogDelta = heap.alloc(65536 * 2);
  capCells = cells;
  return 1;
}

export function lightRBuf(): usize { return rBuf; }
export function lightGBuf(): usize { return gBuf; }
export function lightBBuf(): usize { return bBuf; }
export function lightMaskBuf(): usize { return maskBuf; }
export function lightLutBuf(): usize { return lutBuf; }
/** 容量回读(u64 格) */
export function lightCaps(): u64 { return <u64>capCells; }

// ---- scan 核缓冲/表指针(加载器以 typed-array 视图直写直读) ----
export function lightTypeBuf(): usize { return typeBuf; }
export function lightFlagsBuf(): usize { return flagsBuf; }
export function lightFxBuf(): usize { return fxBuf; }
export function lightFyBuf(): usize { return fyBuf; }
export function lightWallBuf(): usize { return wallBuf; }
export function lightLiqBuf(): usize { return liqBuf; }
export function lightLiqTBuf(): usize { return liqTBuf; }
export function lightHalfBuf(): usize { return halfBuf; }
export function lightSlopeBuf(): usize { return slopeBuf; }
export function lightWireBuf(): usize { return wireBuf; }
export function lightPaintBuf(): usize { return paintBuf; }
export function lightPaintWallBuf(): usize { return paintWallBuf; }
export function lightCoatBuf(): usize { return coatBuf; }
export function lightSpListBuf(): usize { return spListBuf; }

export function lightTblBlocks(): usize { return tblBlocks; }
export function lightTblNoSun(): usize { return tblNoSun; }
export function lightTblCracked(): usize { return tblCracked; }
export function lightTblAllowWater(): usize { return tblAllowWater; }
export function lightTblMush(): usize { return tblMush; }
export function lightTblFlicker(): usize { return tblFlicker; }
export function lightTblHasLight(): usize { return tblHasLight; }
export function lightTblSpecial(): usize { return tblSpecial; }
export function lightTblSheet(): usize { return tblSheet; }
export function lightTblLightR(): usize { return tblLightR; }
export function lightTblLightG(): usize { return tblLightG; }
export function lightTblLightB(): usize { return tblLightB; }
export function lightTblWallLight(): usize { return tblWallLight; }
export function lightTblWallEmHas(): usize { return tblWallEmHas; }
export function lightTblWallEmGated(): usize { return tblWallEmGated; }
export function lightTblWallEmR(): usize { return tblWallEmR; }
export function lightTblWallEmG(): usize { return tblWallEmG; }
export function lightTblWallEmB(): usize { return tblWallEmB; }
export function lightTblTorch(): usize { return tblTorch; }
export function lightTblGlass(): usize { return tblGlass; }
export function lightTblPaint(): usize { return tblPaint; }
export function lightTblTogAxis(): usize { return tblTogAxis; }
export function lightTblTogDelta(): usize { return tblTogDelta; }
/** 表上传完成闩(上传前 lightExport 拒) */
export function lightTablesReady(): i32 { return tablesReady ? 1 : 0; }
export function lightMarkTablesReady(): void { tablesReady = true; }
/** 自研像素方块内部 id(③ 静态支直判;TileLightScanner.pixelBlockId 同值) */
export function lightSetPixelBlock(id: i32): void { pixelBlockId = id; }

// ---------------- 水 flick 乘积常数(与 JS 每 pass 局部 const 同值) ----------------
// LightMap.ts:14 WATER_FLICK = [98/100, 99/100](精确除法定义 double,位级等值);
// LightMap.ts:107-109 乘积 wA0..wB1 = DECAY_WATER[k]×WATER_FLICK[f](f64 乘,
// 每次调用重算同值——JS 每 blurLine 调用算一次,本核每 blur 调用算一次,值同)。
const WF0: f64 = 98.0 / 100.0;
const WF1: f64 = 99.0 / 100.0;

/** BlurLine(LightMap.ts:101-167)stride 形态逐语句移植。
 *  自 i0 起以 stride 步进走 count 格;衰减常数/水乘积经形参传入(f64)。 */
function blurLine(i0: i32, stride: i32, count: i32,
  air: f64, solid: f64, cracked: f64,
  wR0: f64, wR1: f64, wG0: f64, wG1: f64, wB0: f64, wB1: f64,
  h0: f64, h1: f64, h2: f64): void {
  let i = i0;
  let zr: f64 = 0, zg: f64 = 0, zb: f64 = 0;
  let dr: bool = true, dg: bool = true, dbb: bool = true; // 死标记(true=已死)
  for (let n = count; n !== 0; n--) {
    const mr: f64 = f64(load<f32>(rBuf + (<usize>i << 2)));   // L114(f32→f64 精确)
    const mg: f64 = f64(load<f32>(gBuf + (<usize>i << 2)));
    const mb: f64 = f64(load<f32>(bBuf + (<usize>i << 2)));
    // ① 源格判定 + 复活(L116-118;NaN 比较恒 false=JS 同)
    if (mr > zr) { zr = mr; dr = false; }
    if (mg > zg) { zg = mg; dg = false; }
    if (mb > zb) { zb = mb; dbb = false; }
    // ② 写入 / 死亡判定(L120-131;含冗余 mr<=zr 守卫照抄)
    if (!dr) {
      if (zr < 0.0185) dr = true;                 // DEAD_THRESHOLD(LightMap.ts 导入值)
      else if (mr <= zr) store<f32>(rBuf + (<usize>i << 2), f32(zr));   // f64→f32 舍入=JS
    }
    if (!dg) {
      if (zg < 0.0185) dg = true;
      else if (mg <= zg) store<f32>(gBuf + (<usize>i << 2), f32(zg));
    }
    if (!dbb) {
      if (zb < 0.0185) dbb = true;
      else if (mb <= zb) store<f32>(bBuf + (<usize>i << 2), f32(zb));
    }
    // ③ 按当前格 mask 衰减(L133-164;None 提首=最常见档)
    if (!dr || !dg || !dbb) {
      const m: u8 = load<u8>(maskBuf + <usize>i);
      if (m == 0) {            // Mask.None
        if (!dr) zr *= air;
        if (!dg) zg *= air;
        if (!dbb) zb *= air;
      } else if (m == 1) {     // Mask.Solid
        if (!dr) zr *= solid;
        if (!dg) zg *= solid;
        if (!dbb) zb *= solid;
      } else if (m == 2) {     // Mask.Water(逐格 LUT 读回,L146-154)
        if (load<u8>(lutBuf + <usize>i) != 0) {
          if (!dr) zr *= wR1;
          if (!dg) zg *= wG1;
          if (!dbb) zb *= wB1;
        } else {
          if (!dr) zr *= wR0;
          if (!dg) zg *= wG0;
          if (!dbb) zb *= wB0;
        }
      } else if (m == 3) {     // Mask.Honey(逐通道异值,L155-158)
        if (!dr) zr *= h0;
        if (!dg) zg *= h1;
        if (!dbb) zb *= h2;
      } else {                 // Mask.CrackedBricks 及其余(L159-163 else 档)
        if (!dr) zr *= cracked;
        if (!dg) zg *= cracked;
        if (!dbb) zb *= cracked;
      }
    }
    i += stride;
  }
}

/** Blur()(LightMap.ts:55-60 的 pass 段)+ BlurPass(L79-93)逐语句移植。
 *  两遍 × (列上→下/下→上 + 行左→右/右→左),pad 语义与 JS 同式(调用方传入
 *  已按 JS 式钳制的值;此处防御重查)。返回 1=ok / 0=拒(容量/几何不合法)。 */
export function lightBlur(w: i32, h: i32, pad: i32,
  air: f64, solid: f64, cracked: f64,
  dwr: f64, dwg: f64, dwb: f64,
  dh0: f64, dh1: f64, dh2: f64): i32 {
  if (capCells === 0) return 0;
  if (w <= 0 || h <= 0 || w > 65536 || h > 65536) return 0;
  const n: i32 = w * h;                 // w,h ≤ 65536 → n < 2^32 但 i32 域 ≤ 2^30 安全
  if (n > capCells) return 0;
  const m: i32 = w < h ? w : h;
  if (pad < 0 || pad > (m >> 1)) return 0;    // JS pad= min(nvp, max(0, min>>1)) 调用方已钳;防御
  // 水 flick 乘积(每 blur 一次 = JS 每 blurLine 局部 const 同值同乘序)
  const wR0: f64 = dwr * WF0, wR1: f64 = dwr * WF1;
  const wG0: f64 = dwg * WF0, wG1: f64 = dwg * WF1;
  const wB0: f64 = dwb * WF0, wB1: f64 = dwb * WF1;
  // pass 1(L57 blurPass)
  blurPass(w, h, pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);
  // pass 2(L58)
  blurPass(w, h, pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);
  return 1;
}

/** BlurPass(LightMap.ts:79-93):列(上→下/下→上)后行(左→右/右→左)。
 *  线覆盖格集合与 JS 逐式同源(起始索引+步长+格数,注释同款换算)。 */
function blurPass(w: i32, h: i32, pad: i32,
  air: f64, solid: f64, cracked: f64,
  wR0: f64, wR1: f64, wG0: f64, wG1: f64, wB0: f64, wB1: f64,
  dh0: f64, dh1: f64, dh2: f64): void {
  // 列扫描(行主序:stride=w)
  for (let x: i32 = 0; x < w; x++) {
    blurLine(x, w, h - pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);                    // (x,0)→(x,h-1-pad) 上→下
    blurLine((h - 1) * w + x, -w, h - pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);     // (x,h-1)→(x,pad)   下→上
  }
  // 行扫描(行主序:连续内存)
  for (let y: i32 = 0; y < h; y++) {
    const row: i32 = y * w;
    blurLine(row, 1, w - pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);                  // (0,y)→(w-1-pad,y) 左→右
    blurLine(row + w - 1, -1, w - pad, air, solid, cracked, wR0, wR1, wG0, wG1, wB0, wB1, dh0, dh1, dh2);         // (w-1,y)→(pad,y)   右→左
  }
}

// ====================================================================
// scan 核(第四刀 2026-10-04;exportTo 播种扫描主循环)
// ====================================================================
// 移植源(唯一真值):src/lighting/TileLightScanner.ts 的 exportTo 主循环
// (L898-1124)+ surfaceSky(L811-841)+ hellSky(L845-859)——逐语句 1:1,行号锚。
//
// ★拆分定谳(本刀核心):exportTo = [WASM 主循环] + [JS 特例尾段] 两段:
//   · WASM(本段):GetTileMask/①天空·地狱·彩玻璃/②发光墙/③静态 tile 光/
//     ④液体光——纯算术+查表;产出 r/g/b/mask + specialList(特例格索引)。
//   · JS 尾段(TileLightScanner.exportWasmTail):③b specialTileLight 60-case
//     大 switch(动态帧条件/局部 RNG/邻格读/世界旗标/trig——位级 1:1 留 TS 零
//     移植风险)+ ④补支(特例格液体光)+ ⑤ perFrame 点光。
//   · 等价性:③b/④ 均为 max-merge(可交换);唯一例外 case 125 'gb-override'
//     (G/B 直接覆写)——故 WASM 对特例格【跳过 ④】,尾段按 JS 原序 ③b→④ 补跑,
//     最终值逐位同。
// ★RNG 链定谳:master 种子每 exportTo 恰推进 1 步(reseed,TS 侧持有);循环内
//   所有局部掷 = localRandom(x,y) ≡ modifiedSeedOf((y*2654435761+x)|0, masterSeed)
//   纯函数(TileLightScanner.ts:702-705 + FastRandom.reseedWithModifierFrom)
//   ——种子 f64 形参上传,本段复刻 nextSeed48/modifiedSeedOf/nextBits/next/
//   nextFloat(全部 48 位整值 f64 精确)。RNG 链位级可达,无需钉种子历史。
//   ★哈希坐标=【绝对世界坐标】(worker 切片 store 经 hashOrigin 平移还原,
//   与 JS 尾段 localRandom shim 同锚)。
// ★FlickerClock 定谳:scan 主循环=纯读(mouseTextColor/disco/demonTorch)——
//   标量形参上传;timeForVisualEffects/globalTimeWrappedHourly/水母笼态机/
//   shimmerBaseColor(sin) 消费面全在 JS 尾段,trig 零入 AS(hellV 的 sin 在
//   JS 侧预折算成 hellR/G/B 形参)。
// ★OOB type 登记:tile type ∈ u16 全域表尾(≥TILE_DEFS.length)生产不可达
//   (TileStore.setTile 只写注册表 id);JS 对该域读 undefined 的强制转换怪癖
//   与 AS 0 尾的微差=死路径偏差(位级金标不可达面,不构成生产行为差)。
// ====================================================================

// ---------------- FastRandom 复刻(FastRandom.ts:19-117 f64 全程整值精确) ----------------
const R_MASK48: f64 = 281474976710656.0;   // 2^48
const R_TWO24: f64 = 16777216.0;           // 2^24
let rndSeed: f64 = 0;                      // scratch(=scanner.scratch 值域)
let masterSeed: f64 = 0;                   // scanner.random.getSeed()(本帧恒定)

/** NextSeed(FastRandom.ts:20-29 nextSeed48):48 位 LCG 一步 */
function nextSeed48(seed: f64): f64 {
  const m = seed < 0.0 ? seed + R_MASK48 : seed;
  const sh = Math.floor(m / R_TWO24);
  const sl = m - sh * R_TWO24;
  // X = sh*15525485 + sl*1502(< 2^49 精确)取 mod 2^24;Y = sl*15525485(< 2^48)
  const mid = (sh * 15525485.0 + sl * 1502.0) % R_TWO24;
  let s = mid * R_TWO24 + sl * 15525485.0;
  s += 11.0;
  return s >= R_MASK48 ? s - R_MASK48 : s;
}

/** modifiedSeedOf(FastRandom.ts:69-74):NextSeed(m) ^ baseSeed(24 位半逐段异或) */
function modifiedSeedOf(m: f64, baseSeed: f64): f64 {
  const base = nextSeed48(m);
  const bh: i32 = <i32>Math.floor(base / R_TWO24);
  const bl: i32 = <i32>(base - <f64>bh * R_TWO24);
  const sh: i32 = <i32>Math.floor(baseSeed / R_TWO24);
  const sl: i32 = <i32>(baseSeed - <f64>sh * R_TWO24);
  return <f64>(bh ^ sh) * R_TWO24 + <f64>(bl ^ sl);
}

/** (y*2654435761+x)|0 的 JS ToInt32 语义(TileLightScanner.ts:703)。
 *  v=整值 f64(< 2^53 精确);除以 2^32(2 的幂)精确 → floor 精确 → mod 精确。 */
function toInt32Hash(ty: f64, tx: f64): i32 {
  const v: f64 = ty * 2654435761.0 + tx;
  const M32: f64 = 4294967296.0;
  let t: f64 = v - Math.floor(v / M32) * M32;   // [0,2^32)
  if (t >= 2147483648.0) t -= M32;              // → [-2^31,2^31)
  return <i32>t;
}

/** localRandom(x,y)(TileLightScanner.ts:702-705):scratch 原地重播种。
 *  坐标=窗口系 + hashX0/Y0(窗口原点绝对世界坐标)=绝对世界坐标。 */
function reseedLocal(tyWin: i32, txWin: i32): void {
  rndSeed = modifiedSeedOf(
    <f64>toInt32Hash(<f64>(tyWin + gHashY0), <f64>(txWin + gHashX0)), masterSeed);
}

/** NextBits(FastRandom.ts:80-83):floor(seed / 2^(48-bits))。
 *  seed<2^48 整值 → i64 右移=同式(floor 除以 2 的幂),且无 libm 依赖。 */
function rndNextBits(bits: i32): f64 {
  rndSeed = nextSeed48(rndSeed);
  return <f64>(<i64>rndSeed >> (48 - bits));
}

/** Next(min,max)(FastRandom.ts:93-97) */
function rndNext(min: f64, max: f64): f64 {
  const range = max - min;
  if (range <= 0.0) return min;
  return rndNextBelow(range) + min;
}

/** NextBelow(FastRandom.ts:100-112):2 的幂快路径 + 原版溢出带拒绝采样 */
function rndNextBelow(max: f64): f64 {
  const mi: i32 = <i32>max;
  if ((mi & -mi) == mi) {
    return Math.floor((max * rndNextBits(31)) / 2147483648.0);
  }
  let out: f64 = 0;
  for (let done = false; !done;) {
    const num = rndNextBits(31);
    const rem = num % max;
    if (num <= 2147483647.0 - (max - 1.0)) { out = rem; done = true; }
  }
  return out;
}

/** NextFloat(FastRandom.ts:115-117) */
function rndNextFloat(): f64 {
  return rndNextBits(24) / 16777216.0;
}

// ---------------- 帧标量(lightExport 头部一次写入;单线程) ----------------
let gGl: f64 = 0;        // groundLevel(窗口系)
let gLava: f64 = 0;      // lavaLine(窗口系)
let gSkyR: f64 = 0; let gSkyG: f64 = 0; let gSkyB: f64 = 0;
let gDk: f64 = 0;        // 1-shimmerDarken(:3243-3246 全扫描恒定)
let gSwa: f64 = 0;       // shimmerWaterAlpha(深水微光支)
let gHellR: f64 = 0; let gHellG: f64 = 0; let gHellB: f64 = 0;
let gLavaV: f64 = 0;     // 岩浆发射色基值
let gOsc: f64 = 0;       // mouseTextColor
let gDr: f64 = 0; let gDg: f64 = 0; let gDb: f64 = 0;   // discoColor()
let gDemon: f64 = 0;     // demonTorch
let gCloudType: i32 = -1; let gCloudDay: i32 = 0;       // 718 昼云动态挡光
let gShowInv: i32 = 0;   // showInvisibleBlocks
let gWw: i32 = 0; let gWh: i32 = 0;                     // 窗口尺寸
let gHashX0: i32 = 0; let gHashY0: i32 = 0;             // 窗口原点绝对世界坐标

// surfaceSky 返回值暂存(JS ret() 共享三元组同款)
let sRetR: f64 = 0; let sRetG: f64 = 0; let sRetB: f64 = 0;

function minI(a: i32, b: i32): i32 { return a < b ? a : b; }
function minF(a: f64, b: f64): f64 { return a < b ? a : b; }
function clamp01(v: f64): f64 { if (v < 0.0) return 0.0; if (v > 1.0) return 1.0; return v; }

/** JS Math.max 精确语义(NaN 传播/±0 记号)——③ 静态支合并(:1087)专用;
 *  ①②④⑤ 合并在 JS 侧是 if-守卫(:989/:1022/:1115/:1129)非 Math.max,
 *  沿用 if-守卫即可。可达域无 −0(lr/er 只经严格大于守卫写入),零规则面兜底。 */
function maxJs(x: f64, y: f64): f64 {
  if (x != x) return x;
  if (y != y) return y;
  if (x > y) return x;
  if (y > x) return y;
  if (x == 0.0 && y == 0.0) {
    if (1.0 / x > 0.0 || 1.0 / y > 0.0) return 0.0;
    return y;   // 双 −0
  }
  return y;
}

/** lightIsOn(devices.ts:659-665):LIGHT_TOGGLE 查表(on = frame%(2δ)<δ) */
function lightIsOnAs(sheet: i32, fx: i32, fy: i32): bool {
  if (sheet < 0) return true;
  const d: i32 = load<u16>(tblTogDelta + (<usize>sheet << 1));
  if (d == 0) return true;
  const v: i32 = load<u8>(tblTogAxis + <usize>sheet) == 0 ? fx : fy;
  return (v % (2 * d)) < d;
}

/** ApplySurfaceLight 天空支路(TileLightScanner.ts:811-841 逐语句)。
 *  结果写 sRetR/G/B。坐标=窗口系;邻格读界内性由折叠区间保证(ly≥1/ly≤wh-2)。 */
function surfaceSkyAs(tx: i32, ty: i32): void {
  const ww = gWw;
  const i: i32 = ty * ww + tx;
  const type: i32 = load<u16>(typeBuf + (<usize>i << 1));
  const flags: i32 = load<u8>(flagsBuf + <usize>i);
  const wall: i32 = load<u16>(wallBuf + (<usize>i << 1));
  // wallPasses(:796-800):wall==0 || wallLight[wall] || (隐形墙涂层 && !显示)
  if (!(wall == 0 || (wall < 512 && load<u8>(tblWallLight + <usize>wall) != 0)
    || ((load<u8>(coatBuf + <usize>i) & 4) != 0 && gShowInv == 0))) {
    sRetR = 0; sRetG = 0; sRetB = 0; return;
  }
  // :3159-3168 AllowLightInWater 族(活动即播,不限液量/半砖)
  if (flags != 0 && type != 0 && load<u8>(tblAllowWater + <usize>type) != 0) {
    sRetR = gSkyR; sRetG = gSkyG; sRetB = gSkyB; return;
  }
  // :3170-3172 挡阳门(坡/半砖/隐形 && 四邻全干 放行)
  if (flags != 0 && type != 0 && load<u8>(tblNoSun + <usize>type) != 0) {
    const invisible: bool = (load<u8>(coatBuf + <usize>i) & 2) != 0 && gShowInv == 0;
    const sloped: bool = load<u8>(slopeBuf + <usize>i) != 0
      || load<u8>(halfBuf + <usize>i) != 0 || invisible;
    if (!sloped) { sRetR = 0; sRetG = 0; sRetB = 0; return; }
    if (load<u8>(liqBuf + <usize>(i - ww)) != 0 || load<u8>(liqBuf + <usize>(i + ww)) != 0
      || load<u8>(liqBuf + <usize>(i - 1)) != 0 || load<u8>(liqBuf + <usize>(i + 1)) != 0) {
      sRetR = 0; sRetG = 0; sRetB = 0; return;
    }
  }
  const liq: i32 = load<u8>(liqBuf + <usize>i);
  if (liq < 200) {
    // :3174-3179 半砖要求上邻液<200
    if (load<u8>(halfBuf + <usize>i) != 0 && load<u8>(liqBuf + <usize>(i - ww)) >= 200) {
      sRetR = 0; sRetG = 0; sRetB = 0; return;
    }
    sRetR = gSkyR; sRetG = gSkyG; sRetB = gSkyB; return;
  }
  // :3181-3188 深水微光支:num3 = B×0.175×(1+NextFloat×0.13)×liquidAlpha[13]
  // (★乘序逐式:((B*0.175)*(1+rf*0.13))*swa;RNG hash=绝对世界坐标)
  if (gSwa > 0.0) {
    reseedLocal(ty, tx);
    const rf: f64 = rndNextFloat();
    sRetR = 0; sRetG = 0;
    sRetB = gSkyB * 0.175 * (1.0 + rf * 0.13) * gSwa;
    return;
  }
  sRetR = 0; sRetG = 0; sRetB = 0;
}

/** ApplyHellLight 地狱支路(TileLightScanner.ts:845-859 逐语句)。
 *  无 AllowLightInWater 门/无 invisibleBlock 析取支;液量<200+半砖上邻<200。 */
function hellSkyAs(tx: i32, ty: i32): bool {
  const ww = gWw;
  const i: i32 = ty * ww + tx;
  const type: i32 = load<u16>(typeBuf + (<usize>i << 1));
  const wall: i32 = load<u16>(wallBuf + (<usize>i << 1));
  if (!(wall == 0 || (wall < 512 && load<u8>(tblWallLight + <usize>wall) != 0)
    || ((load<u8>(coatBuf + <usize>i) & 4) != 0 && gShowInv == 0))) return false;
  const flags: i32 = load<u8>(flagsBuf + <usize>i);
  if (flags != 0 && type != 0 && load<u8>(tblNoSun + <usize>type) != 0) {
    const sloped: bool = load<u8>(slopeBuf + <usize>i) != 0 || load<u8>(halfBuf + <usize>i) != 0;
    if (!sloped) return false;
    if (load<u8>(liqBuf + <usize>(i - ww)) != 0 || load<u8>(liqBuf + <usize>(i + ww)) != 0
      || load<u8>(liqBuf + <usize>(i - 1)) != 0 || load<u8>(liqBuf + <usize>(i + 1)) != 0) return false;
  }
  if (load<u8>(liqBuf + <usize>i) >= 200) return false;
  if (load<u8>(halfBuf + <usize>i) != 0 && load<u8>(liqBuf + <usize>(i - ww)) >= 200) return false;
  return true;
}

/** exportTo 播种扫描主核(TileLightScanner.ts:898-1124 逐语句)。
 *  输入:窗口=store 的 [wx0,wx0+ww)×[wy0,wy0+wh) 切片(加载器行拷贝上传);
 *  px/py=区域原点在窗口内(=rx-wx0/ry-wy0);glWin/lavaWin=窗口系行锚;
 *  hashX0/Y0=窗口原点的绝对世界坐标(RNG 哈希锚);seed=master 种子(reseed 后)。
 *  输出:r/g/b/mask 前 mw*mh 格 + specialList;返回值=特例格数,-1=拒。 */
export function lightExport(
  ww: i32, wh: i32, px: i32, py: i32, mw: i32, mh: i32,
  glWin: f64, lavaWin: f64, hashX0: i32, hashY0: i32,
  seed: f64, skyR: f64, skyG: f64, skyB: f64,
  dk: f64, swa: f64,
  hellR: f64, hellG: f64, hellB: f64,
  lavaV: f64, osc: f64,
  dr: f64, dg: f64, db: f64, demon: f64,
  cloudType: i32, cloudDay: i32, showInv: i32,
): i32 {
  if (capCells === 0 || !tablesReady) return -1;
  if (ww <= 0 || wh <= 0 || mw <= 0 || mh <= 0) return -1;
  if (ww > 65536 || wh > 65536 || mw > 65536 || mh > 65536) return -1;
  const nMap: i32 = mw * mh;
  const nWin: i32 = ww * wh;
  if (nMap > capCells || nWin > capCells) return -1;
  if (px < 0 || py < 0 || px + mw > ww || py + mh > wh) return -1;
  // 帧标量
  gGl = glWin; gLava = lavaWin;
  gSkyR = skyR; gSkyG = skyG; gSkyB = skyB;
  gDk = dk; gSwa = swa;
  gHellR = hellR; gHellG = hellG; gHellB = hellB;
  gLavaV = lavaV; gOsc = osc;
  gDr = dr; gDg = dg; gDb = db; gDemon = demon;
  gCloudType = cloudType; gCloudDay = cloudDay; gShowInv = showInv;
  gWw = ww; gWh = wh; gHashX0 = hashX0; gHashY0 = hashY0;
  masterSeed = seed;
  spCount = 0;
  // map.clear()(LightMap.ts:49-52:三通道+mask 前 nMap 格清零)
  memory.fill(rBuf, 0, <usize>nMap << 2);
  memory.fill(gBuf, 0, <usize>nMap << 2);
  memory.fill(bBuf, 0, <usize>nMap << 2);
  memory.fill(maskBuf, 0, <usize>nMap);
  // InWorld(x,y,1) 折叠成行/列区间(:916-919;px/py=窗口系区域原点)
  const lxLo: i32 = px >= 1 ? 0 : 1 - px;
  const lxHi: i32 = minI(mw - 1, ww - 2 - px);
  const lyLo: i32 = py >= 1 ? 0 : 1 - py;
  const lyHi: i32 = minI(mh - 1, wh - 2 - py);
  for (let ly = lyLo; ly <= lyHi; ly++) {
    const tyW: i32 = py + ly;            // 窗口系 ty(=store 系 ty)
    const rowBase: i32 = tyW * gWw;
    const liRow: i32 = ly * mw;
    const surface: bool = <f64>tyW <= gGl;          // :924(窗口系行锚已 rebase)
    const hell: bool = !surface && <f64>tyW > gLava; // :925
    // 彩玻璃覆写基色(:926-927;行内恒定)
    const glassR: f64 = surface ? gSkyR : gHellR;
    const glassG: f64 = surface ? gSkyG : gHellG;
    const glassB: f64 = surface ? gSkyB : gHellB;
    for (let lx = lxLo; lx <= lxHi; lx++) {
      const txW: i32 = px + lx;
      const i: i32 = rowBase + txW;
      const li: i32 = liRow + lx;
      const flags: i32 = load<u8>(flagsBuf + <usize>i);
      const type: i32 = load<u16>(typeBuf + (<usize>i << 1));
      const wall: i32 = load<u16>(wallBuf + (<usize>i << 1));
      const liquid: i32 = load<u8>(liqBuf + <usize>i);
      const liquidType: i32 = load<u8>(liqTBuf + <usize>i);
      const coat: i32 = load<u8>(coatBuf + <usize>i);
      // ---- GetTileMask 融合(:932-946;718 昼云动态挡光 :866-868 经形参) ----
      const blocksV: i32 = type == gCloudType ? gCloudDay : load<u8>(tblBlocks + <usize>type);
      let mv: i32 = 0;
      if (type != 0 && flags != 0 && blocksV != 0
        && ((coat & 2) == 0 || gShowInv != 0)
        && (load<u8>(wireBuf + <usize>i) & 32) == 0
        && load<u8>(slopeBuf + <usize>i) == 0) {
        mv = load<u8>(tblCracked + <usize>type) != 0 ? 4 : 1;
      } else if (liquidType != 2 && liquid > 128) {
        mv = liquidType == 3 ? 3 : 2;
      }
      store<u8>(maskBuf + <usize>li, <u8>mv);
      // LightIsBlocked 单读形态(:948-950;②墙支路消费)
      const blocked: bool = wall != 0 && type != 0 && flags != 0 && blocksV != 0
        && ((coat & 2) == 0 || gShowInv != 0);

      let lr: f64 = 0, lg: f64 = 0, lb: f64 = 0;
      // ---- ① 天空/地狱 + 彩色玻璃墙(:956-992) ----
      {
        let sr: f64 = 0, sg: f64 = 0, sb: f64 = 0;
        if (surface) {
          surfaceSkyAs(txW, tyW);
          sr = sRetR; sg = sRetG; sb = sRetB;
        } else if (hell) {
          if (hellSkyAs(txW, tyW)) { sr = gHellR; sg = gHellG; sb = gHellB; }
        }
        // 彩色玻璃墙(:3190-3242 表面/:3282-3338 地狱)——覆写语义,门=(!active||半砖||!挡阳)&&liquid<255
        if (((wall >= 88 && wall <= 93) || wall == 241) && liquid < 255) {
          if (flags == 0 || load<u8>(halfBuf + <usize>i) != 0
            || load<u8>(tblNoSun + <usize>type) == 0) {
            const k: i32 = wall == 241 ? 6 : wall - 88;
            let tr: f64, tg: f64, tb: f64;
            if (k == 5) {
              // Main.Disco 轮转(:3229-3233)——帧标量上传(0.5+dc*0.2)
              tr = 0.5 + gDr * 0.2; tg = 0.5 + gDg * 0.2; tb = 0.5 + gDb * 0.2;
            } else {
              tr = load<f64>(tblGlass + (<usize>(k * 3) << 3));
              tg = load<f64>(tblGlass + (<usize>(k * 3 + 1) << 3));
              tb = load<f64>(tblGlass + (<usize>(k * 3 + 2) << 3));
            }
            sr = glassR * tr; sg = glassG * tg; sb = glassB * tb;
          }
        }
        if (surface) { sr *= gDk; sg *= gDk; sb *= gDk; }   // :3243-3246 微光渐灭
        if (sr > lr) lr = sr;
        if (sg > lg) lg = sg;
        if (sb > lb) lb = sb;
      }
      // ---- ② 发光墙(:996-1025) ----
      if (wall != 0) {
        let wr: f64 = 0, wg: f64 = 0, wb: f64 = 0;
        if (wall < 512 && load<u8>(tblWallEmHas + <usize>wall) != 0) {
          if (load<u8>(tblWallEmGated + <usize>wall) == 0 || !blocked) {
            wr = f64(load<f32>(tblWallEmR + (<usize>wall << 2)));   // ★f32 值域=JS Float32Array
            wg = f64(load<f32>(tblWallEmG + (<usize>wall << 2)));
            wb = f64(load<f32>(tblWallEmB + (<usize>wall << 2)));
          }
        } else if (wall == 137) {
          // 岩浆瀑布墙(:229-239):0.4+(270-mt)/1500+Next(0,50)×0.0005
          if (!blocked) {
            reseedLocal(tyW, txW);
            const n4: f64 = 0.4 + (270.0 - gOsc) / 1500.0 + rndNext(0.0, 50.0) * 0.0005;
            wr = n4; wg = 0.5 * n4; wb = 0.1 * n4;
          }
        } else if (wall == 44 || wall == 346) {
          // 彩虹砖墙 ×0.15(:240-247)/彩虹苔砖墙 ×0.25(:314-321) Disco
          if (!blocked) {
            const s: f64 = wall == 44 ? 0.15 : 0.25;
            wr = gDr * s; wg = gDg * s; wb = gDb * s;
          }
        }
        // 涂装覆写(:206-220 175 / :169-176+323-329 357):paintColor/765
        if ((wall == 175 || wall == 357) && load<u8>(paintWallBuf + <usize>i) != 0 && !blocked) {
          const p: i32 = load<u8>(paintWallBuf + <usize>i);
          wr = load<f64>(tblPaint + (<usize>(p * 3) << 3)) / 765.0;
          wg = load<f64>(tblPaint + (<usize>(p * 3 + 1) << 3)) / 765.0;
          wb = load<f64>(tblPaint + (<usize>(p * 3 + 2) << 3)) / 765.0;
        }
        if (wr > lr) lr = wr;
        if (wg > lg) lg = wg;
        if (wb > lb) lb = wb;
      }
      // ---- ③ 发光 tile 静态支(:1031-1089) ----
      let isSpecial: bool = false;
      if (flags != 0 && type != 0) {
        const sheet: i32 = load<i16>(tblSheet + (<usize>type << 1));
        const fx: i32 = load<u16>(fxBuf + (<usize>i << 1));
        const fy: i32 = load<u16>(fyBuf + (<usize>i << 1));
        // 蘑菇雕像 349 门控(:2940):frameX<36 的 style 完全不发光
        const shroomGateOk: bool = !(sheet == 349 && fx < 36);
        if ((load<u8>(tblHasLight + <usize>type) != 0 || load<u8>(tblMush + <usize>type) != 0
          || type == pixelBlockId) && shroomGateOk) {
          // 接线灯门控:关帧不发光(LIGHT_TOGGLE)
          const on: bool = type == pixelBlockId || sheet < 0 || lightIsOnAs(sheet, fx, fy);
          if (on) {
            let er: f64, eg: f64, eb: f64;
            if (type == pixelBlockId) {
              // 自研像素方块自发光:min(1, c/255×2.5);RGB 解码 r=fx>>8/g=fx&255/b=fy
              er = minF(1.0, <f64>((fx >> 8) & 255) / 255.0 * 2.5);
              eg = minF(1.0, <f64>(fx & 255) / 255.0 * 2.5);
              eb = minF(1.0, <f64>fy / 255.0 * 2.5);
            } else if (sheet == 4) {
              // 火把 24 色动态(:1536-1542;原版无闪烁)
              const style: i32 = <i32>Math.floor(<f64>fy / 22.0) % 24;
              if (style == 7) {
                er = 0.5 * gDemon + 1.0 * (1.0 - gDemon);
                eg = 0.3;
                eb = 1.0 * gDemon + 0.5 * (1.0 - gDemon);
              } else if (style == 14) {
                er = gDr; eg = gDg; eb = gDb;
              } else if (style == 23) {
                // 微光火把(TorchID:48-62):num=clamp(0.9+(270-mt)/900)
                const num: f64 = clamp01(0.9 + (270.0 - gOsc) / 900.0);
                er = num * 0.9; eg = 0.55; eb = num * 1.2;
              } else {
                er = load<f64>(tblTorch + (<usize>(style * 3) << 3));
                eg = load<f64>(tblTorch + (<usize>(style * 3 + 1) << 3));
                eb = load<f64>(tblTorch + (<usize>(style * 3 + 2) << 3));
              }
            } else if (load<u8>(tblMush + <usize>type) != 0) {
              // 蘑菇组(:2938-2960):R=0、G=0.2+num11/2、B=1(num11=Next(28,42)*0.005+(270-mt)/1000)
              reseedLocal(tyW, txW);
              const num11: f64 = rndNext(28.0, 42.0) * 0.005 + (270.0 - gOsc) / 1000.0;
              er = 0; eg = 0.2 + num11 / 2.0; eb = 1;
            } else {
              er = f64(load<f32>(tblLightR + (<usize>type << 2)));   // ★f32 值域
              eg = f64(load<f32>(tblLightG + (<usize>type << 2)));
              eb = f64(load<f32>(tblLightB + (<usize>type << 2)));
              if (load<u8>(tblFlicker + <usize>type) != 0) {
                // FLICKER_SHEETS(405/215/592)三通道叠加(:689-720 系)
                reseedLocal(tyW, txW);
                const f: f64 = rndNext(28.0, 42.0) * 0.005 + (270.0 - gOsc) / 700.0;
                er += f; eg += f; eb += f;
              }
              // 涂装门 1:1(:2510-2511/:2578-2580/:2962-2967/:3131-3141)
              if (sheet == 22 || sheet == 140 || sheet == 204 || sheet == 347) {
                const pv: i32 = load<u8>(paintBuf + <usize>i);
                if (pv == 26 || pv == 27) er = 0;
              } else if (sheet == 739 && load<u8>(paintBuf + <usize>i) != 0) {
                const pv: i32 = load<u8>(paintBuf + <usize>i);
                er = load<f64>(tblPaint + (<usize>(pv * 3) << 3)) / 255.0;
                eg = load<f64>(tblPaint + (<usize>(pv * 3 + 1) << 3)) / 255.0;
                eb = load<f64>(tblPaint + (<usize>(pv * 3 + 2) << 3)) / 255.0;
              }
            }
            // ③ 静态支合并(:1087)——JS 是 Math.max(NaN 传播语义,如 mouseTextColor
            // NaN 时 er/eg NaN 直窜输出),非 if-守卫:必须 maxJs
            lr = maxJs(lr, er);
            lg = maxJs(lg, eg);
            lb = maxJs(lb, eb);
          }
        }
        // ---- ③b 路由(:1093-1105):特例格记入列表,JS 尾段按原序 ③b→④ 合并 ----
        if (load<u8>(tblSpecial + <usize>type) != 0) {
          store<u32>(spListBuf + (<usize>spCount << 2), <u32>li);
          spCount++;
          isSpecial = true;
        }
      }
      // ---- ④ 液体光(:1107-1122)——特例格由 JS 尾段补跑(gb-override 序保真) ----
      if (!isSpecial) {
        if (liquid > 0 && liquidType == 4) {
          // 微光液体(ApplyLiquidLight:133-151;FX62 内联逐式)
          const n2: f64 = 0.7 + (270.0 - gOsc) / 900.0;
          const n3: f64 = 0.7 + (270.0 - gOsc) / 125.0;
          const er2: f64 = n2 * 0.6, eg2: f64 = n3 * 0.25, eb2: f64 = n2 * 0.9;
          if (er2 > lr) lr = er2;
          if (eg2 > lg) lg = eg2;
          if (eb2 > lb) lb = eb2;
        } else if (liquid > 0 && liquidType == 2) {
          // 岩浆(:116-131):num=0.55+(270-mt)/900
          if (gLavaV > lr) lr = gLavaV;
          if (gLavaV * 0.6 > lg) lg = gLavaV * 0.6;
          if (gLavaV * 0.2 > lb) lb = gLavaV * 0.2;
        }
      }
      store<f32>(rBuf + (<usize>li << 2), f32(lr));
      store<f32>(gBuf + (<usize>li << 2), f32(lg));
      store<f32>(bBuf + (<usize>li << 2), f32(lb));
    }
  }
  return spCount;
}
