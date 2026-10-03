// 光传播核心:2 pass × 4 向单调线扫描"Blur"(LightMap.cs:86-254 一比一)。
// 非洪泛:每条扫描线携带一路 running 光值 + 三通道死标记,逐格
//   ① cell>zero → zero=cell(源格,复活)
//   ② 否则 !dead → zero<0.0185 死 / cell=zero
//   ③ 按当前格 mask 衰减 zero
// 双缓冲由引擎层持有(本类单图);行主序布局(与导出面一致)。
import { FastRandom } from './FastRandom';
import { DEAD_THRESHOLD, DECAY_AIR, DECAY_CRACKED, DECAY_HONEY, DECAY_SOLID, DECAY_WATER } from './lightTables';
import { ensureLightWasm, lightWasmBlur, lightWasmEnabled, lightWasmReady } from '../wasm/lightWasm';

/** 遮挡类型(LightMaskMode.cs;注意 Water=2 Honey=3 CrackedBricks=4) */
export const enum Mask { None = 0, Solid = 1, Water = 2, Honey = 3, CrackedBricks = 4 }

/** 水 flick 值域(L221-237 next(98,100)/100:98|99 → 精确除法定义的 double,位级等值) */
const WATER_FLICK = [98 / 100, 99 / 100];

export class LightMap {
  w = 0; h = 0;
  /** 三通道 SoA(浮点保真:Uint8 会把 0.0185 死阈值量化成可见条带) */
  r = new Float32Array(0);
  g = new Float32Array(0);
  b = new Float32Array(0);
  mask = new Uint8Array(0);
  /** 不可见边距(LightMap.cs:30 引擎注入;Blur 扫描跳过外圈该厚度) */
  nonVisiblePadding = 0;
  /** 水 flicker 随机源(每格 WithModifier(i)) */
  private random = new FastRandom((Math.random() * 1e9) | 0);
  /** 水 flicker scratch(2026-08-24 零分配重写:原每水格 withModifier 分配一实例,
   *  现原地 reseedWithModifier 值等价;金标 tests/lighting-scan-blur-golden 锁位级) */
  private scratch = new FastRandom(0);
  /** 水 flicker LUT(2026-09-08 性能刀):flick(i)=f(seed,i) 在单次 blur 内恒定
   *  (cycleIndex 固定),而每格被 2pass×4向 访问 8 次——旧实现每访问重播种 RNG
   *  (水格主导场景=blur 主成本,用户 250%细缝案 trace 实测 blurLine 18%)。预计算
   *  每水格一次,LUT 读回=位级等值(金标锁)。0→flick 0.98 / 1→0.99 */
  private flickLut = new Uint8Array(0);
  /** 周期索引(引擎每 Present 递增;掺进水随机种子 → 每 4 tick 换一批微光) */
  cycleIndex = 0;

  setSize(w: number, h: number): void {
    if (this.w === w && this.h === h && this.r.length >= w * h) return;
    this.w = w; this.h = h;
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.mask = new Uint8Array(n);
  }

  clear(): void {
    this.r.fill(0); this.g.fill(0); this.b.fill(0);
    this.mask.fill(0); // LightMap.cs:70-79 Clear 连 mask 一起清(世界边缘 1 格环陈旧 mask)
  }

  /** Blur()(L86-91):两遍 BlurPass + NextSeed(★NextSeed 在 passes 后=原版顺序;
   *  LUT 预计算用【当前】seed=passes 实际消费的种子,位级等值)。
   *  ★WASM 第二刀(2026-10-03):blur 核 AS 化(src/wasm/light.as.ts,旗 ?lightwasm=1
   *  缺省关)。调用点模式③(wasm∧旗 ? wasm : js):JS 支(下方)零改动逐位保留;
   *  wasm 拒/失败/未就绪 → 静默落回 JS(fail-closed);未就绪时 fire-and-forget
   *  预热(幂等),就绪后新帧自动切 WASM。位级锁 tests/light-wasm.test.ts。
   *  旗关时零网络/零实例化/单次布尔短路零开销。 */
  blur(): void {
    this.buildWaterFlick();
    if (lightWasmEnabled()) {
      // pad 与 blurPass(L81)同式:JS 侧钳制后传入(AS 侧防御重查)
      const pad = Math.min(this.nonVisiblePadding, Math.max(0, Math.min(this.w, this.h) >> 1));
      if (lightWasmReady()
        && lightWasmBlur(this.r, this.g, this.b, this.mask, this.flickLut, this.w, this.h, pad,
          DECAY_AIR, DECAY_SOLID, DECAY_CRACKED,
          DECAY_WATER[0], DECAY_WATER[1], DECAY_WATER[2],
          DECAY_HONEY[0], DECAY_HONEY[1], DECAY_HONEY[2])) {
        this.random = this.random.withModifier(++this.cycleIndex);
        return;
      }
      ensureLightWasm();   // fire-and-forget 幂等预热(④:未就绪帧走 JS,就绪后自动切)
    }
    this.blurPass();
    this.blurPass();
    this.random = this.random.withModifier(++this.cycleIndex);
  }

  /** 水 flicker 预计算(每水格一次 reseed+next;位级等值于逐访问重播种——
   *  单次 blur 内 cycleIndex/seed 恒定,同 (i,seed) 的 next 值各访问相同) */
  private buildWaterFlick(): void {
    const n = this.w * this.h;
    if (this.flickLut.length < n) this.flickLut = new Uint8Array(n);
    const lut = this.flickLut, mask = this.mask, seed = this.random.getSeed();
    for (let i = 0; i < n; i++) {
      if (mask[i] !== Mask.Water) continue;
      this.scratch.reseedWithModifierFrom(i, seed);
      lut[i] = this.scratch.next(98, 100) - 98;   // 0|1(→0.98|0.99)
    }
  }

  /** BlurPass()(L93-115):列(上→下 / 下→上)后行(左→右 / 右→左)。
   *  2026-09-19 热路径重排:四向线统一成「起始索引+步长+格数」的 stride 循环
   *  (消每格 y*w+x 乘法与端点双比较;线覆盖格集合与旧参逐式换算恒等:
   *   行 fwd (0,y)-(w-1-pad,y) = 起行首,步 1,共 w-pad 格;列/逆向同理)。 */
  private blurPass(): void {
    const { w, h } = this;
    const pad = Math.min(this.nonVisiblePadding, Math.max(0, Math.min(w, h) >> 1));
    // 列扫描(行主序:stride=w)
    for (let x = 0; x < w; x++) {
      this.blurLine(x, w, h - pad);                    // (x,0)→(x,h-1-pad) 上→下
      this.blurLine((h - 1) * w + x, -w, h - pad);     // (x,h-1)→(x,pad)   下→上
    }
    // 行扫描(行主序:连续内存)
    for (let y = 0; y < h; y++) {
      const row = y * w;
      this.blurLine(row, 1, w - pad);                  // (0,y)→(w-1-pad,y) 左→右
      this.blurLine(row + w - 1, -1, w - pad);         // (w-1,y)→(pad,y)   右→左
    }
  }

  /**
   * BlurLine(L117-254)stride 形态:自 i0 起以 stride 步进走 count 格
   * (stride ∈ {±1,±w},与旧 (x0,y0)→(x1,y1,dir) 四向一一对应,见 blurPass)。
   * 每格运算序与旧实现逐条同源(L117-254);衰减常数与水 flicker 乘积提升为
   * 每 pass 局部 const——单 pass 内模块值恒定,同值乘法=位级等值。
   */
  private blurLine(i0: number, stride: number, count: number): void {
    const { r, g, b, mask } = this;
    const lut = this.flickLut;
    const air = DECAY_AIR, solid = DECAY_SOLID, cracked = DECAY_CRACKED;
    const h0 = DECAY_HONEY[0], h1 = DECAY_HONEY[1], h2 = DECAY_HONEY[2];
    // 水 flicker 乘积(原每格 DECAY_WATER[k]*flick 两次乘 → 每 pass 一次乘,值等)
    const wA0 = DECAY_WATER[0] * WATER_FLICK[0], wA1 = DECAY_WATER[0] * WATER_FLICK[1];
    const wG0 = DECAY_WATER[1] * WATER_FLICK[0], wG1 = DECAY_WATER[1] * WATER_FLICK[1];
    const wB0 = DECAY_WATER[2] * WATER_FLICK[0], wB1 = DECAY_WATER[2] * WATER_FLICK[1];
    let i = i0;
    let zr = 0, zg = 0, zb = 0;
    let dr = true, dg = true, dbb = true; // 死标记(true=已死)
    for (let n = count; n !== 0; n--) {
      const mr = r[i], mg = g[i], mb = b[i];
      // ① 源格判定 + 复活
      if (mr > zr) { zr = mr; dr = false; }
      if (mg > zg) { zg = mg; dg = false; }
      if (mb > zb) { zb = mb; dbb = false; }
      // ② 写入 / 死亡判定
      if (!dr) {
        if (zr < DEAD_THRESHOLD) dr = true;
        else if (mr <= zr) r[i] = zr;
      }
      if (!dg) {
        if (zg < DEAD_THRESHOLD) dg = true;
        else if (mg <= zg) g[i] = zg;
      }
      if (!dbb) {
        if (zb < DEAD_THRESHOLD) dbb = true;
        else if (mb <= zb) b[i] = zb;
      }
      // ③ 按当前格 mask 衰减(全通道死则跳过;L177-252;None 提首=最常见档)
      if (!dr || !dg || !dbb) {
        const m = mask[i];
        if (m === Mask.None) {
          if (!dr) zr *= air;
          if (!dg) zg *= air;
          if (!dbb) zb *= air;
        } else if (m === Mask.Solid) {
          if (!dr) zr *= solid;
          if (!dg) zg *= solid;
          if (!dbb) zb *= solid;
        } else if (m === Mask.Water) {
          // 逐格随机 [98,100)/100(L221-237)——★LUT 读回(2026-09-08 预计算一次,
          //  位级等值,见 buildWaterFlick);2026-09-19 乘积前移(见上 wA0..wB1)
          if (lut[i] !== 0) {
            if (!dr) zr *= wA1;
            if (!dg) zg *= wG1;
            if (!dbb) zb *= wB1;
          } else {
            if (!dr) zr *= wA0;
            if (!dg) zg *= wG0;
            if (!dbb) zb *= wB0;
          }
        } else if (m === Mask.Honey) {
          if (!dr) zr *= h0;
          if (!dg) zg *= h1;
          if (!dbb) zb *= h2;
        } else {
          if (!dr) zr *= cracked;
          if (!dg) zg *= cracked;
          if (!dbb) zb *= cracked;
        }
      }
      i += stride;
    }
  }
}
