// v0 受累名单【经验定谳】扫描（2026-09-03，取代 SM2Effect 头注 2026-08-24 r15
// R15-14 字节码分类学的手抄名单）。
//
// 方法：对全部 63 pass × 12 场景（fx-sm2-bit-golden 同款域）× 2 光色，同输入
// 对比两条光路（合成链现行语义 vs 原版 v0 语义）：
//   A = runPassOnImageData(v0=白) 后逐字节乘光 L（染后光乘）
//   B = runPassOnImageData(v0=L)                （光进 v0）
// RGB 最大字节差 maxΔ：尾乘族（v0 只出现在尾段乘法）两路数学等价，仅剩 ±1~2
// 字节双重舍入噪声；v0 中段消费族（max/lrp/mad/add 位）非等价，Δ 大。
// 判界 ≥3 = 受累。VM 与 codegen 双引擎各自扫描，名单必须一致。
//
// ★首扫教训：s1/s2 缺省黑场会让噪声/相位族的 v0 中段路径不触发（Acid/Hades/
//   Fog/Loki 等漏报）——采样器域必须带合成噪声（mkNoise）。实测分离度极净：
//   受累 minΔ=16（ArmorColoredRainbow），可交换 maxΔ=1。
// ★op 级"v0 中段消费"静态判定有盲区（数据路径活性），以本经验扫描为准：
//   32 pass 受累（含渐变族/ArmorPhase/FinalFractal/MouseItem/WaterProcessor），
//   Aurora 实测 Δ=0 完全可交换，MagicMissile Δ=0（FlameLash obj55 用）。
//
// 锁定物 = vanillaDyes.V0_MID_PASSES（生产分流判据）——本测试爆红 = 名单漂移，
// 先查字节码/解释器是否变更，再决定改名单还是修解释器（勿静默重生成）。
import { describe, it, expect, afterAll } from 'vitest';
import {
  defaultUniforms, getPass, passNames, runPassOnImageData, setSm2CodegenEnabled,
  type SM2Uniforms,
} from '../src/fx/SM2Effect';
import { V0_MID_PASSES } from '../src/data/vanillaDyes';

const W = 8, H = 8;
/** 判界：≥3 = 受累（≤2 为白烘/光乘/字节写回三段双重舍入的合法噪声带） */
const AFFECTED_DELTA = 3;

/** 光色（0..1 UNORM）：暗洞蓝灰 + 暖中光——染后光乘与 v0 偏差最敏感的两档 */
const LIGHTS: Array<[number, number, number]> = [
  [0.16, 0.20, 0.28],
  [0.55, 0.50, 0.45],
];

interface Scene { id: string; uni: (u: SM2Uniforms) => void; rect?: { sx: number; sy: number; sheetW: number; sheetH: number } }
/** 场景域 = fx-sm2-bit-golden 12 场景同款（最大 uniform 覆盖） */
const SCENES: Scene[] = [
  { id: 'S01-white',        uni: (u) => { u.uTime = 1.35; } },
  { id: 'S02-gradient',     uni: (u) => { u.uColor = [0.13, 0.87, 0.5]; u.uSecondaryColor = [0.9, 0.25, 0.66]; u.uSaturation = 1.7; u.uTime = 2.71; } },
  { id: 'S03-t0',           uni: () => {} },
  { id: 'S04-t0927',        uni: (u) => { u.uTime = 0.927; } },
  { id: 'S05-negfold',      uni: (u) => { u.uTime = -0.7; } },
  { id: 'S06-bigtime',      uni: (u) => { u.uTime = 3599.7; } },
  { id: 'S07-spatial',      uni: (u) => { u.uDrawPosition = [131.5, 77.25]; u.uTargetPosition = [88, 401]; u.uShaderSpecificData = [0.25, -0.75, 2, 3]; u.uOpacity = 0.37; } },
  { id: 'S08-sat-eps',      uni: (u) => { u.uSaturation = 1e-3; u.uColor = [0.8, 0.1, 0.35]; } },
  { id: 'S09-rect',         uni: (u) => { u.uTime = 1.35; }, rect: { sx: 2, sy: 3, sheetW: 16, sheetH: 16 } },
  { id: 'S10-direction',    uni: (u) => { u.uDirection = -1; u.uRotation = 2.31; u.uImageSize1 = [64, 64]; u.uImageSize2 = [64, 64]; } },
  { id: 'S11-size0-explicit', uni: (u) => { u.uImageSize0 = [97, 51]; u.uTime = 11.11; } },
  { id: 'S12-lightsource',  uni: (u) => { u.uLightSource = [0.1, 0.2, 0.3, 0.4]; u.uLegacyArmorSourceRect = [4, 6, 40, 56]; u.uLegacyArmorSheetSize = [128, 192]; } },
  { id: 'S13-lightsource2', uni: (u) => { u.uLightSource = [0.7, 0.3, 0.9, 0.5]; u.uTime = 7.77; } },
  { id: 'S14-opacity0',     uni: (u) => { u.uOpacity = 0; u.uTime = 3.3; } },
  { id: 'S15-sat3-dark',    uni: (u) => { u.uSaturation = 3; u.uColor = [0.05, 0.05, 0.35]; u.uSecondaryColor = [0.9, 0.85, 0.1]; u.uTime = 100.5; } },
  { id: 'S16-srct-rect',    uni: (u) => { u.uSourceRect = [1, 2, 6, 6]; u.uDrawPosition = [-40, 300]; u.uTime = 13.7; } },
  { id: 'S17-dir-rot',      uni: (u) => { u.uDirection = 1; u.uRotation = -1.1; u.uOpacity = 0.5; u.uTime = 59.9; } },
  { id: 'S18-polar',        uni: (u) => { u.uColor = [1, 0, 0]; u.uSecondaryColor = [0, 1, 1]; u.uSaturation = 0.1; u.uTime = 0.05; } },
  { id: 'S19-flamelash',    uni: (u) => { u.uLightSource = [1, 1, 1, 1]; u.uSaturation = -2; u.uTime = 2; } },
  { id: 'S20-legacy',       uni: (u) => { u.uImageSize0 = [40, 56]; u.uLegacyArmorSourceRect = [0, 0, 40, 56]; u.uLegacyArmorSheetSize = [40, 560]; u.uTime = 5.5; } },
];
// ★域边界（定谳依据）：本扫描的域 = 【染料运行时域】——染料消费站从不设
// uOpacity>1（全链 uOpacity≡1，vanillaDyes 表也只给 color/secondary/saturation），
// 故 uOpacity 4-8（FlameLash 等 Misc 面）不在域内：S21-opacity4/S22-opacity8
// 曾入域时连 ArmorBasicColor 都被判受累（_sat 中间档 × opacity>1 破坏一切尾乘
// 可交换性）——那是真语义但【不是染料门的域】，名单会无界膨胀。Misc 超域
// 消费面（FlameLash/ForceFieldBubble 等 opacity>1）的 v0 事务归各自站点，不进
// 本表。uLightSource 保留在域内（reflective 族翼站真实设置）。

/** 合成噪声 s1/s2 采样器（64² 确定性伪噪声，镜像 applyDyePass 噪声族装配——
 *  相位族染料的 v0 中段路径在 s1 缺省黑场上不触发，2026-09-03 首扫教训） */
function mkNoise(seed: number): (u: number, v: number, out: Float64Array) => void {
  const N = 64;
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    px[i] = ((x * 67 + y * 31 + seed * 7) ^ (x * 13 + seed)) & 255;
    px[i + 1] = ((x * 41 + y * 23 + seed * 3) & 255);
    px[i + 2] = ((x * 19 + y * 71 - seed * 11) + 512) & 255;
    px[i + 3] = 255;
  }
  return (u, v, out) => {
    const u2 = u - Math.floor(u), v2 = v - Math.floor(v);
    const x = Math.min(N - 1, (u2 * N) | 0), y = Math.min(N - 1, (v2 * N) | 0);
    const o = (y * N + x) * 4;
    out[0] = px[o] / 255; out[1] = px[o + 1] / 255; out[2] = px[o + 2] / 255; out[3] = px[o + 3] / 255;
  };
}
const EXTRA_SAMPLERS = [mkNoise(1), mkNoise(2)];   // s1/s2（wrap 语义与 Misc_noise 一致）

function srcBytes(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = ((x * 37 + y * 17) ^ (x * 11)) & 255;
    d[i + 1] = (x * 29 + y * 53) & 255;
    d[i + 2] = ((x * 5 - y * 13) + 256) & 255;
    d[i + 3] = x === w - 1 ? 26 : 255;
  }
  return d;
}

/** rect 场景的切片种子（与金标 captureStack 同式） */
function seedFor(rect?: Scene['rect']): Uint8ClampedArray {
  if (!rect) return srcBytes(W, H);
  const sheet = srcBytes(rect.sheetW, rect.sheetH);
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((rect.sy + y) * rect.sheetW + rect.sx + x) * 4;
    const di = (y * W + x) * 4;
    d[di] = sheet[si]; d[di + 1] = sheet[si + 1]; d[di + 2] = sheet[si + 2]; d[di + 3] = sheet[si + 3];
  }
  return d;
}

/** A 路：白烘字节 × L（与消费点 `data[i] *= light` 同语义，Uint8Clamped 钳制舍入） */
function whiteBakeThenMultiply(pass: Parameters<typeof runPassOnImageData>[0],
  uni: SM2Uniforms, L: [number, number, number], rect?: Scene['rect']): Uint8ClampedArray {
  const data = seedFor(rect);
  runPassOnImageData(pass, data, W, H, uni, EXTRA_SAMPLERS, rect);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i] * L[0];
    data[i + 1] = data[i + 1] * L[1];
    data[i + 2] = data[i + 2] * L[2];
  }
  return data;
}

/** B 路：v0=光烘 */
function bakeWithV0(pass: Parameters<typeof runPassOnImageData>[0],
  uni: SM2Uniforms, L: [number, number, number], rect?: Scene['rect']): Uint8ClampedArray {
  const data = seedFor(rect);
  runPassOnImageData(pass, data, W, H, uni, EXTRA_SAMPLERS, rect, L);
  return data;
}

function maxDeltaRGB(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a[i + k] - b[i + k]);
      if (d > max) max = d;
    }
  }
  return max;
}

describe('fx-sm2-v0-commute：白烘×光乘 vs v0=光烘 全 63 pass 定谳扫描', () => {
  /** 扫描单引擎，返回 pass → maxΔ（跨场景×光色取最大） */
  function scan(): Map<string, number> {
    const deltas = new Map<string, number>();
    for (const name of passNames()) {
      const pass = getPass(name)!;
      let max = 0;
      for (const sc of SCENES) {
        const uni = defaultUniforms();
        sc.uni(uni);
        uni.uImageSize1 = [64, 64]; uni.uImageSize2 = [64, 64];   // s1/s2 噪声尺寸(缺省 [0,0] 的 rcp 中毒与两路同腐,但取真实值更贴消费面)
        for (const L of LIGHTS) {
          const a = whiteBakeThenMultiply(pass, uni, L, sc.rect);
          const b = bakeWithV0(pass, uni, L, sc.rect);
          max = Math.max(max, maxDeltaRGB(a, b));
        }
      }
      deltas.set(name, max);
    }
    return deltas;
  }

  it('名单=V0_MID_PASSES（双引擎一致；非受累全部 ≤ 判界）', () => {
    const report: string[] = [];
    for (const engine of ['codegen', 'vm'] as const) {
      setSm2CodegenEnabled(engine === 'codegen');
      const deltas = scan();
      const affected = [...deltas.entries()].filter(([, d]) => d >= AFFECTED_DELTA).map(([n]) => n).sort();
      const expected = [...V0_MID_PASSES].sort();
      for (const [name, d] of [...deltas.entries()].sort((x, y) => y[1] - x[1])) {
        report.push(`${d >= AFFECTED_DELTA ? '受累' : '交换'} ${name} maxΔ=${d}`);
      }
      // 报告落控制台供人工审阅（分类边界证据）
      console.log(`[fx-sm2-v0-commute] engine=${engine}\n  ${report.join('\n  ')}`);
      expect(affected, `engine=${engine} 受累集与 V0_MID_PASSES 不一致（Δ 表见上）`).toEqual(expected);
      // 可交换侧紧界：非受累 pass 的 maxΔ 必须落在舍入噪声带内
      for (const [name, d] of deltas) {
        if (!V0_MID_PASSES.has(name)) {
          expect(d, `${name} 非受累但 maxΔ=${d} 超出舍入噪声带`).toBeLessThanOrEqual(AFFECTED_DELTA - 1);
        }
      }
    }
  });

  afterAll(() => setSm2CodegenEnabled(true));   // 恢复生产默认
});
