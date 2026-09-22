// ★BJ270 2026-09-22 WaterWaves._step 内域快路径守卫(Windows 丛林卡顿 trace 定谳:
//  _step 全 trace self 2.27s/6.8%——走动帧走原路径=每像素 3 次 x 钳制 min/max+分支)。
//
// 【机制】内域像素 sx0=x-dx∈[1,w-2] 且 sy0=y-dy∈[1,h-2] ⇒ xL/xM/xR 与 yU/yM/yD
//  钳制全部不缚(逐值同)+中性出界支不可达 ⇒ 免钳制免分支,核公式与原路径逐字同序。
//  swPerf 门控(?swperf=0 回退原路径逐字不动=W3 同款豁免契约)。
// 【四层】
//  ① 行为面:随机种子波场 × dx,dy 组合(走动 ±1/斜走/大跳/出界级跳/W3 域 0,0)
//    swPerf 关/开 R/G Float32 逐步逐位一致(两步:shift 步 + W3/内域 (0,0) 步)。
//  ② 非空泛性:Math.min/max 调用计数——开臂显著少于关臂(内域免钳制真实发生)。
//  ③ 结构锁(源文本锚):新快路径块存在、原路径逐字保留(豁免臂)、swPerf 门序
//    (W3 → 内域 → 原路径)防静默回退。
//  ④ 波场单例卫生:afterAll 归还 swPerf 缺省开态。
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { waterWaves, setWaveTextures } from '../src/render/WaterWaves';
import { swPerfSetForTest } from '../src/render/perfFlags';

const after: Array<() => void> = [];
afterAll(() => {
  swPerfSetForTest(true);           // 归还缺省(★转正后缺省开)
  setWaveTextures(null, null);      // 归还波纹单例纹理态
  for (const f of after) f();
});

const BASE = { zoom: 1, viewW: 64, viewH: 64, tileX: 30, tileY: 30,
  maxTilesX: 120, maxTilesY: 80, worldSurface: 30, rockLayer: 60, windAbs: 0.4, rain: 0 };

/** 建格+随机种子波场(LCG 可复现)——供行为面/计数面共用 */
function setupScenario(swPerfOn: boolean, seed: number) {
  swPerfSetForTest(swPerfOn);
  waterWaves.resetForTest();
  waterWaves.setQuality(3);
  waterWaves.frame({ ...BASE, camX: 0, camY: 0, dt: 1 / 60 });
  const R = waterWaves.readGridR(), G = waterWaves.readGridG();
  let s = seed >>> 0;
  for (let i = 0; i < R.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    R[i] = s / 4294967296;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    G[i] = s / 4294967296;
  }
}

/** 跑 _step(dx,dy) 一步 + _step(0,0) 一步,返回两步各自 R/G 快照 */
function runScenario(swPerfOn: boolean, dx: number, dy: number, seed: number) {
  setupScenario(swPerfOn, seed);
  const step = (waterWaves as unknown as { _step: (dx: number, dy: number) => void })._step;
  step.call(waterWaves, dx, dy);
  const snapR1 = waterWaves.readGridR().slice();
  const snapG1 = waterWaves.readGridG().slice();
  step.call(waterWaves, 0, 0);
  return {
    r1: snapR1, g1: snapG1,
    r2: waterWaves.readGridR().slice(), g2: waterWaves.readGridG().slice(),
  };
}

describe('★BJ270 WaterWaves._step 内域快路径', () => {
  // ① 行为面:swPerf 关(原路径)/开(内域臂)逐位一致
  const cases: Array<[string, number, number]> = [
    ['水平走动 dx=1,dy=0', 1, 0],
    ['水平走动 dx=-1,dy=0', -1, 0],
    ['垂直走动 dx=0,dy=1', 0, 1],
    ['垂直走动 dx=0,dy=-3', 0, -3],
    ['斜走 dx=1,dy=1', 1, 1],
    ['斜走 dx=-2,dy=3', -2, 3],
    ['大跳 dx=5,dy=-7', 5, -7],
    ['出界级跳 dx=-100,dy=0', -100, 0],
    ['出界级跳 dx=0,dy=1000', 0, 1000],
    ['W3 域 dx=0,dy=0(上方专路接管)', 0, 0],
  ];
  for (const [name, dx, dy] of cases) {
    it(`双支逐位一致:${name}`, () => {
      const off = runScenario(false, dx, dy, 0xB2700001);
      const on = runScenario(true, dx, dy, 0xB2700001);
      expect(on.r1).toEqual(off.r1);
      expect(on.g1).toEqual(off.g1);
      expect(on.r2).toEqual(off.r2);
      expect(on.g2).toEqual(off.g2);
    });
  }

  // ② 非空泛性:内域真实免钳制(开臂 min/max 计数显著少于关臂)
  it('Math.min/max 计数:开臂 < 关臂(内域免钳制真实发生,非 vacuous)', () => {
    const countMinMax = (body: () => void): number => {
      const M = Math as unknown as { min: (...a: number[]) => number; max: (...a: number[]) => number };
      const oMin = M.min, oMax = M.max;
      let n = 0;
      M.min = (...a: number[]) => { n++; return oMin(...a); };
      M.max = (...a: number[]) => { n++; return oMax(...a); };
      try { body(); } finally { M.min = oMin; M.max = oMax; }
      return n;
    };
    // 计数窗只包 shift 步(_step(1,0));建格 frame(强度公式/涟漪等含 min/max)
    // 移出窗外
    setupScenario(false, 0xB2700002);
    const step = (waterWaves as unknown as { _step: (dx: number, dy: number) => void })._step;
    const offN = countMinMax(() => { step.call(waterWaves, 1, 0); });
    setupScenario(true, 0xB2700002);
    const onN = countMinMax(() => { step.call(waterWaves, 1, 0); });
    expect(offN).toBeGreaterThan(0);
    expect(onN).toBeGreaterThan(0);        // 边缘带钳制仍在(非整体拆除)
    expect(onN).toBeLessThan(offN);        // 内域免钳制
    // 量化(16×16 格,dx=1,dy=0;每钳=min+max 2 次调用):
    //  关臂:每行 yU/yM/yD 3 钳=6 次;每像素 xL/xM/xR 3 钳=6 次,但 x=0 走中性支
    //        (sx0=-1<0)零钳 → 15 px/行 → 16×6 + 16×15×6 = 1536
    //  开臂:内域行 14 行,每行边缘 x=0 中性(0 次)+x=1 缚边钳(6 次)→ 84;
    //        非内域行 2 行(y=0,15):6 + 15×6 = 96/行 → 192;
    //        内域边界式 xLo/xHi/yLo/yHi 自身 6 次(max/min)→ 合计 282
    expect(offN).toBe(16 * 6 + 16 * 15 * 6);
    expect(onN).toBe(14 * 6 + 2 * (6 + 15 * 6) + 6);
  });

  // ③ 结构锁(源文本锚)
  it('结构锁:内域快路径存在且原路径豁免臂逐字保留、门序 W3→内域→原路径', () => {
    const src = readFileSync(resolve(__dirname, '../src/render/WaterWaves.ts'), 'utf8');
    expect(src).toContain('★BJ270 内域快路径');
    // 门序:W3 分支在内域分支之前,内域分支在原路径 for 循环之前
    const w3 = src.indexOf('if (swPerf && dx === 0 && dy === 0)');
    const interior = src.indexOf('★BJ270 内域快路径');
    const general = src.indexOf('const yU = Math.min(h - 1, Math.max(0, sy0 - 1));');
    expect(w3).toBeGreaterThan(-1);
    expect(interior).toBeGreaterThan(w3);
    expect(general).toBeGreaterThan(interior);
    // 原路径核心逐字保留(豁免臂字节面不变)
    expect(src).toContain('const xL = Math.min(w - 1, Math.max(0, sx0 - 1));');
    expect(src).toContain('R2[i] = 0.5; G2[i] = 0.5;        // ① 未覆盖区中性(非 clamp 条带)');
    expect(src).toContain("const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;");
  });
});
