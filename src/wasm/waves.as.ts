// @ts-nocheck
// 水波网格模拟推进核 AssemblyScript 实现 —— WASM 管线第三刀(2026-10-03)。
// 移植源(唯一真值):src/render/WaterWaves.ts 的 WaterWaveSystem._step——泛形路径
// (「原路径」,2026-10-03 盘上 L1281-1317)+ W3 快路径(dx=dy=0,L1172-1195)。
// BJ270 内域路径(L1217-1277)不另实现:tests/bj78-waves-swperf.test.ts /
// tests/bj270-waves-interior.test.ts 已锁 W3/内域/原路径三支【逐位同值】,本核
// 实现「快路径 + 泛形」两支即覆盖全部 dx/dy 域(内域 ⊂ 泛形值域)。
//
// ★位级策略(验收线=与 JS 逐位同值,非容差):
// - 内核纯 f64 数值步进(全文件零 Math.random——定谳③,无 RNG 流分叉面);
//   JS Float32Array 只承载存储舍入:load<f32> 后 promote 到 f64 参与全式,
//   store 前 demote f32(f64→f32 IEEE round-to-nearest-even = JS 写入同式)。
// - Math.round:AS stdlib round = ceil(x) - (ceil(x)-0.5 > x)(-O3 shrink 分支)
//   ≡ JS Math.round 精确语义——round-half-up、0.49999999999999994 artifact、
//   ±0 区间逐点核对全同(Math.round(-0.5)=-0 两侧一致;R 通道 `rq <= 0` 收 −0、
//   G 通道 `gq < 0` 不收 −0 的**不对称守卫逐字照抄**,−0 值面语义保留)。
// - Math.sign:AS = select 链,±0 返回原值(−0→−0)=JS 同;Math.sqrt/abs/floor
//   = IEEE 精确单指令,V8 同源零差。
// - 常数面:10/3 = f64 编译期除法(位级=JS 运行时 10/3);WATER_DAMP **经 ABI f64
//   形参传入,禁内嵌**——JS 侧 Math.pow(2,−0.05514…) 是 V8 libm 产物,wasm libm
//   pow 末位可差 1 ulp(sm2 刀 §4 语义差清单同款),内嵌即漂移源(lightWasm 刀
//   「衰减常数不内嵌」同纪律)。JS 侧模块级 const 只算一次,形参传递零漂移。
// - 出界语义两级(★BJ89 定谳,泛形路径 L1287-1294):①中心源出界(swap 未覆盖
//   区)=中性 0.5;②邻居/中心越界=clamp 边缘复制(hardware sampler Clamp)。
// - NaN 面不动点:生产场值恒 k/256(量化不变式,C8-D);若 NaN 入场,S/newH 全链
//   NaN、比较恒 false(JS 同)→ NaN 出场,两侧一致(防御面非生产行为)。
//
// 内存布局/ABI 总表见 src/wasm/README.md §9;ABI 版本 wavesVersion()=1(era guard)。
// 调用方(wavesWasm.ts):R/G 拷入 → wavesStep → R2/G2 拷回,JS 侧自行 ping-pong
// swap(_step 尾 swap 语义不动)。

// ---------------- 缓冲基址(线性内存;wavesInit 一次性分配) ----------------
let rSrc: usize = 0;      // f32×cap   本步读 R(WaterWaves._R 拷入)
let gSrc: usize = 0;      // f32×cap   本步读 G(_G 拷入)
let rDst: usize = 0;      // f32×cap   本步写 R2(_R2;拷回后调用方 swap)
let gDst: usize = 0;      // f32×cap   本步写 G2(_G2)
let capCells: i32 = 0;    // 已分配容量(格)

export function wavesVersion(): i32 { return 1; }

/** 一次性分配(幂等;1=ok 0=拒)。cells=格容量(JS 侧 1<<20,覆盖 5K css 全屏) */
export function wavesInit(cells: i32): i32 {
  if (capCells !== 0) return 1;          // 幂等(lightInit/sm2Init 同款)
  if (cells <= 0 || cells > 1 << 22) return 0;
  rSrc = heap.alloc(<usize>cells * 4);
  gSrc = heap.alloc(<usize>cells * 4);
  rDst = heap.alloc(<usize>cells * 4);
  gDst = heap.alloc(<usize>cells * 4);
  capCells = cells;
  return 1;
}

export function wavesRBuf(): usize { return rSrc; }
export function wavesGBuf(): usize { return gSrc; }
export function wavesR2Buf(): usize { return rDst; }
export function wavesG2Buf(): usize { return gDst; }
/** 容量回读(u64 格) */
export function wavesCaps(): u64 { return <u64>capCells; }

/** 10/3(JS `(cg - 0.5) * (10 / 3)` 逐字;f64 除法编译期舍入=JS 运行时同值) */
const C10D3: f64 = 10.0 / 3.0;

/** wavesStep(泛形路径 WaterWaves.ts L1281-1317 逐语句 + dx=dy=0 快路径
 *  L1172-1195 逐语句)。返回 1=ok / 0=拒(容量/几何)。
 *  dx/dy = 滚动增量 vector3 = F_n−F_{n−1}(texel;源索引 x−dx ≙ 新[p]=旧[p−v3])。 */
export function wavesStep(w: i32, h: i32, dx: i32, dy: i32, damp: f64): i32 {
  if (capCells === 0) return 0;
  // 防御闸:8192² = 2^26 i32 无溢出(→ 由 n>capCells 拒);加载器先行同判,双保险
  if (w <= 0 || h <= 0 || w > 8192 || h > 8192) return 0;
  const n: i32 = w * h;
  if (n > capCells) return 0;
  // 滚动增量防御(真实域 ≤ 视口 texel;越界值本身语义安全,此为拒口非截断)
  if (dx < -(1 << 20) || dx > (1 << 20) || dy < -(1 << 20) || dy > (1 << 20)) return 0;

  if (dx == 0 && dy == 0) {
    // ---- W3 快路径(L1172-1195;dx=dy=0 ⇒ 钳制塌缩,与泛形逐位同) ----
    for (let y: i32 = 0; y < h; y++) {
      const yU: i32 = y > 0 ? y - 1 : 0;
      const rowM: i32 = y * w;
      const rowU: i32 = yU * w;
      const rowD: i32 = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x: i32 = 0; x < w; x++) {
        const xL: i32 = x > 0 ? x - 1 : 0;
        const xR: i32 = x < w - 1 ? x + 1 : w - 1;
        const i: usize = <usize>(rowM + x) << 2;
        // 内联核(公式段与泛形支逐字同序——位恒等 by construction)
        const c: f64 = f64(load<f32>(rSrc + i));
        const cg: f64 = f64(load<f32>(gSrc + i));
        const signedC: f64 = 2.0 * c - 1.0;
        const S: f64 = (2.0 * f64(load<f32>(rSrc + (<usize>(rowM + xL) << 2))) - 1.0)
          + (2.0 * f64(load<f32>(rSrc + (<usize>(rowM + xR) << 2))) - 1.0)
          + (2.0 * f64(load<f32>(rSrc + (<usize>(rowU + x) << 2))) - 1.0)
          + (2.0 * f64(load<f32>(rSrc + (<usize>(rowD + x) << 2))) - 1.0);
        const wv: f64 = (cg - 0.5) * C10D3;
        const newH: f64 = (signedC + 2.0 * (S * 0.25 - signedC) + wv * abs(wv)) * damp;
        const q: f64 = Math.round(512.0 * (newH * 0.5 + 0.5));
        let rq: f64 = Math.round((q < 0.0 ? 0.0 : q > 512.0 ? 1.0 : q / 512.0) * 256.0);
        if (rq <= 0.0) rq = 0.0; else if (rq > 256.0) rq = 256.0;   // ★C8-D `<=` 收 −0(JS 同)
        store<f32>(rDst + i, f32(rq / 256.0));
        const dv: f64 = newH - signedC;
        let gq: f64 = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256.0);
        if (gq < 0.0) gq = 0.0; else if (gq > 256.0) gq = 256.0;   // G 支 `<` 不收 −0(JS 同)
        store<f32>(gDst + i, f32(gq / 256.0));
      }
    }
    return 1;
  }

  // ---- 泛形路径(L1281-1317;滚动增量 + 两级出界语义) ----
  for (let y: i32 = 0; y < h; y++) {
    const sy0: i32 = y - dy;
    const yU: i32 = min<i32>(h - 1, max<i32>(0, sy0 - 1));   // 上邻(uv y 向下)
    const yM: i32 = min<i32>(h - 1, max<i32>(0, sy0));
    const yD: i32 = min<i32>(h - 1, max<i32>(0, sy0 + 1));
    const rowM: i32 = yM * w;
    const rowU: i32 = yU * w;
    const rowD: i32 = yD * w;
    const rowI: i32 = y * w;
    // ★BJ89 ①中心源覆盖判定:源出界 = swap 未被 copy 覆盖的中性区(先于内核);
    //   ②邻居/中心越界仍 clamp(dx=0 时与 W3 快路径逐位一致)
    const yIn: bool = sy0 >= 0 && sy0 < h;
    for (let x: i32 = 0; x < w; x++) {
      const sx0: i32 = x - dx;
      const i: usize = <usize>(rowI + x) << 2;
      if (!yIn || sx0 < 0 || sx0 >= w) {
        store<f32>(rDst + i, f32(0.5));   // ① 未覆盖区中性(非 clamp 条带)
        store<f32>(gDst + i, f32(0.5));
        continue;
      }
      const xL: i32 = min<i32>(w - 1, max<i32>(0, sx0 - 1));
      const xM: i32 = min<i32>(w - 1, max<i32>(0, sx0));
      const xR: i32 = min<i32>(w - 1, max<i32>(0, sx0 + 1));
      // 内联核(与快路径/JS 泛形路径公式段逐字同序)
      const c: f64 = f64(load<f32>(rSrc + (<usize>(rowM + xM) << 2)));
      const cg: f64 = f64(load<f32>(gSrc + (<usize>(rowM + xM) << 2)));
      const signedC: f64 = 2.0 * c - 1.0;
      const S: f64 = (2.0 * f64(load<f32>(rSrc + (<usize>(rowM + xL) << 2))) - 1.0)
        + (2.0 * f64(load<f32>(rSrc + (<usize>(rowM + xR) << 2))) - 1.0)
        + (2.0 * f64(load<f32>(rSrc + (<usize>(rowU + xM) << 2))) - 1.0)
        + (2.0 * f64(load<f32>(rSrc + (<usize>(rowD + xM) << 2))) - 1.0);
      const wv: f64 = (cg - 0.5) * C10D3;
      const newH: f64 = (signedC + 2.0 * (S * 0.25 - signedC) + wv * abs(wv)) * damp;
      const q: f64 = Math.round(512.0 * (newH * 0.5 + 0.5));
      let rq: f64 = Math.round((q < 0.0 ? 0.0 : q > 512.0 ? 1.0 : q / 512.0) * 256.0);
      if (rq <= 0.0) rq = 0.0; else if (rq > 256.0) rq = 256.0;     // ★C8-D `<=` 收 −0(JS 同)
      store<f32>(rDst + i, f32(rq / 256.0));
      const dv: f64 = newH - signedC;
      let gq: f64 = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256.0);
      if (gq < 0.0) gq = 0.0; else if (gq > 256.0) gq = 256.0;     // G 支 `<` 不收 −0(JS 同)
      store<f32>(gDst + i, f32(gq / 256.0));
    }
  }
  return 1;
}
