// 光传播核心:2 pass × 4 向单调线扫描"Blur"(LightMap.cs:86-254 一比一)。
// 非洪泛:每条扫描线携带一路 running 光值 + 三通道死标记,逐格
//   ① cell>zero → zero=cell(源格,复活)
//   ② 否则 !dead → zero<0.0185 死 / cell=zero
//   ③ 按当前格 mask 衰减 zero
// 双缓冲由引擎层持有(本类单图);行主序布局(与导出面一致)。
import { FastRandom } from './FastRandom';
import { DEAD_THRESHOLD, DECAY_AIR, DECAY_CRACKED, DECAY_HONEY, DECAY_SOLID, DECAY_WATER } from './lightTables';

/** 遮挡类型(LightMaskMode.cs;注意 Water=2 Honey=3 CrackedBricks=4) */
export const enum Mask { None = 0, Solid = 1, Water = 2, Honey = 3, CrackedBricks = 4 }

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

  /** Blur()(L86-91):两遍 BlurPass + NextSeed */
  blur(): void {
    this.blurPass();
    this.blurPass();
    this.random = this.random.withModifier(++this.cycleIndex);
  }

  /** BlurPass()(L93-115):列(上→下 / 下→上)后行(左→右 / 右→左) */
  private blurPass(): void {
    const { w, h, mask } = this;
    const pad = Math.min(this.nonVisiblePadding, Math.max(0, Math.min(w, h) >> 1));
    // 列扫描(行主序:跨行跳 rw)
    for (let x = 0; x < w; x++) {
      this.blurLine(x, 0, x, h - 1 - pad, 1);
      this.blurLine(x, h - 1, x, pad, -1);
    }
    // 行扫描(行主序:连续内存)
    for (let y = 0; y < h; y++) {
      this.blurLine(0, y, w - 1 - pad, y, 1);
      this.blurLine(w - 1, y, pad, y, -1);
    }
    void mask;
  }

  /**
   * BlurLine(L117-254):从 (x0,y0) 到 (x1,y1) 单调走格。
   * dx/dy ∈ {(±1,0),(0,±1)};行主序索引 idx = y*w+x。
   */
  private blurLine(x0: number, y0: number, x1: number, y1: number, dir: number): void {
    const { w, r, g, b, mask } = this;
    const dx = y0 === y1 ? dir : 0;
    const dy = x0 === x1 ? dir : 0;
    let x = x0, y = y0;
    let zr = 0, zg = 0, zb = 0;
    let dr = true, dg = true, dbb = true; // 死标记(true=已死)
    for (;;) {
      const i = y * w + x;
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
      // ③ 按当前格 mask 衰减(全通道死则跳过;L177-252)
      if (!dr || !dg || !dbb) {
        const m = mask[i];
        if (m === Mask.Solid) {
          if (!dr) zr *= DECAY_SOLID;
          if (!dg) zg *= DECAY_SOLID;
          if (!dbb) zb *= DECAY_SOLID;
        } else if (m === Mask.CrackedBricks) {
          if (!dr) zr *= DECAY_CRACKED;
          if (!dg) zg *= DECAY_CRACKED;
          if (!dbb) zb *= DECAY_CRACKED;
        } else if (m === Mask.Water) {
          // 逐格随机 [98,100)/100(L221-237)
          const flick = this.random.withModifier(i).next(98, 100) / 100;
          if (!dr) zr *= DECAY_WATER[0] * flick;
          if (!dg) zg *= DECAY_WATER[1] * flick;
          if (!dbb) zb *= DECAY_WATER[2] * flick;
        } else if (m === Mask.Honey) {
          if (!dr) zr *= DECAY_HONEY[0];
          if (!dg) zg *= DECAY_HONEY[1];
          if (!dbb) zb *= DECAY_HONEY[2];
        } else {
          if (!dr) zr *= DECAY_AIR;
          if (!dg) zg *= DECAY_AIR;
          if (!dbb) zb *= DECAY_AIR;
        }
      }
      if (x === x1 && y === y1) break;
      x += dx; y += dy;
    }
  }
}
