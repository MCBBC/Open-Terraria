// @ts-nocheck
// 光照 blur 核 AssemblyScript 实现 —— WASM 管线第二刀(2026-10-03)。
// 移植源(唯一真值):src/lighting/LightMap.ts 的 blurPass(L79-93)+ blurLine(L101-167)
// ——逐语句 1:1,行号锚 LightMap.ts(2026-10-03 盘上版本)。scan(exportTo)/present
// 不移植:scan 重对象耦合(FlickerClock/specialTileLight ~60 case/Math.random 态机,
// 位级移植=巨型刀,登记债);present 实测占 compute 1% 不值得。
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

export function lightVersion(): i32 { return 1; }

/** 一次性分配(幂等;1=ok 0=拒)。cells=格容量(JS 侧 1<<18,覆盖 4K zoom-out) */
export function lightInit(cells: i32): i32 {
  if (capCells !== 0) return 1;          // 幂等(sm2Init 同款)
  if (cells <= 0 || cells > 1 << 24) return 0;
  rBuf = heap.alloc(<usize>cells * 4);
  gBuf = heap.alloc(<usize>cells * 4);
  bBuf = heap.alloc(<usize>cells * 4);
  maskBuf = heap.alloc(<usize>cells);
  lutBuf = heap.alloc(<usize>cells);
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
