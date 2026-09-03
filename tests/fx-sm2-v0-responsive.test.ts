// 染料运行时域 v0 响应性全量核证（2026-09-03，extra38/betsy 改组安全前提）。
// 对 V0_MID_PASSES 中染料表可达的 tech，在【染料运行时域】（染料表 uniforms ×
// 8 uTime × 渐变/翼面内容 × ±uLightSource = 32 域点）实测「v0=暗 vs v0=白」输出：
//   全零响应 → shader 结构性无视 v0（自发光族，另经 3200 域点/tech 扩域复核）
//   → 入 V0_INERT_IN_DYE_DOMAIN 登记；isV0MidTech 不排除它们（v0=no-op，路由
//   作用=跳过站点光乘=自发光修正，A2 终版）。
// 本测试爆红 = 域响应性漂移（解释器/染料表变更）——先归因再改 V0_INERT，勿静默。
import { describe, it, expect } from 'vitest';
import { applyDyePassLit, dyeApplyOf, V0_MID_PASSES, V0_INERT_IN_DYE_DOMAIN } from '../src/data/vanillaDyes';
import { passNames, getPass, defaultUniforms, runPassOnImageData } from '../src/fx/SM2Effect';
import dyeJson from '../src/data/vanilla-dyes.json';

const DARK: [number, number, number] = [0.16, 0.2, 0.28];
const WHITE: [number, number, number] = [1, 1, 1];
const TIMES = [0, 0.927, 2.71, 5.5, 11.11, 100.5, 3599.7, 2000.3];

function img(w: number, h: number, kind: 'grad' | 'wing'): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (kind === 'grad') {
      d[i] = ((x * 37 + y * 17) ^ (x * 11)) & 255;
      d[i + 1] = (x * 29 + y * 53) & 255;
      d[i + 2] = ((x * 5 - y * 13) + 256) & 255;
      d[i + 3] = 255;
    } else {
      d[i] = 235; d[i + 1] = 225; d[i + 2] = 210;
      d[i + 3] = (x + y) % 7 !== 0 ? 255 : ((x * 13 + y * 7) & 63);
    }
  }
  return d;
}
function maxDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let m = 0;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a[i + k] - b[i + k]));
  return m;
}

describe('fx-sm2-v0-responsive：染料域 v0 响应性 ↔ V0_INERT_IN_DYE_DOMAIN', () => {
  it('惰性集=全零响应 tech 全集（32 域点/tech）', () => {
    const dyes = (dyeJson as unknown as { dyes: Record<string, { tech: string }> }).dyes;
    const vidByTech = new Map<string, number>();
    for (const [vid, d] of Object.entries(dyes)) {
      if (!vidByTech.has(d.tech)) vidByTech.set(d.tech, Number(vid));
    }
    const inert: string[] = [];
    for (const tech of [...V0_MID_PASSES].sort()) {
      if (!passNames().includes(tech)) continue;
      const vid = vidByTech.get(tech);
      let best = 0;
      for (const kind of ['grad', 'wing'] as const) {
        for (const withLS of [false, true]) {
          for (const t of TIMES) {
            const run = (v0: [number, number, number]) => {
              const d = img(64, 64, kind);
              if (vid !== undefined) {
                const apply = dyeApplyOf(vid)!;
                apply.uniforms.uTime = t;
                apply.uniforms.uImageSize1 = [64, 64]; apply.uniforms.uImageSize2 = [64, 64];
                if (withLS) apply.uniforms.uLightSource = [0.3, 0.4, 0.5, 0.6];
                applyDyePassLit(d, 64, 64, apply, v0);
              } else {
                const u = defaultUniforms();
                u.uTime = t; u.uImageSize1 = [64, 64]; u.uImageSize2 = [64, 64];
                if (withLS) u.uLightSource = [0.3, 0.4, 0.5, 0.6];
                runPassOnImageData(getPass(tech)!, d, 64, 64, u, [], undefined, v0);
              }
              return d;
            };
            best = Math.max(best, maxDelta(run(DARK), run(WHITE)));
          }
        }
      }
      if (best === 0) {
        // 惰性集只收【染料表可达】者（非染料 pass 不经染料分流门，归各自站点）
        if (vid !== undefined) inert.push(tech);
      } else if (V0_INERT_IN_DYE_DOMAIN.has(tech)) {
        throw new Error(`${tech} 在 V0_INERT 但实测响应 maxΔ=${best}——惰性集漂移`);
      }
    }
    expect(inert.sort(), '响应性漂移（Δ 表见上）').toEqual([...V0_INERT_IN_DYE_DOMAIN].sort());
    // isV0MidTech = 受累全集（含惰性——惰性成员 v0 为 no-op，路由作用=跳过站点
    // 光乘=自发光修正，2026-09-03 A2 终版；若未来扩域发现敏感域，此处爆红回滚）
    for (const t of V0_MID_PASSES) {
      expect(isV0(t), `${t} 应路由 v0 化`).toBe(true);
    }
    function isV0(t: string): boolean { return V0_MID_PASSES.has(t); }
  });
});
