// SM2 解释器位级金标快照网（2026-09-01，四方案评估 PR#0）。
// 目的：把当前解释器对全部 63 pass × 12 uniform 场景的输出【按位定格】为固件
// JSON——这是后续一切重构（采样出参化 / P3 fround / codegen）的唯一对照真值，
// 也是 QueenSlime/RainbowTownSlime/ForceField 等 ~55 个长期零数值覆盖 pass 的
// 首次兜底（覆盖矩阵缺口由 2026-08-31 四子代理评估定谳）。
//
// 快照层级：
//   direct —— 直连 execPixel 的 Float64 四分量 getBigUint64 位串滚动 FNV-1a-64
//             （捕捉任何中间运算顺序/舍入漂移，比 uint8 断言严 255 倍）
//   stack  —— runPassOnImageData 全栈后的 Uint8ClampedArray 字节 FNV（捕捉写路径/
//             t0Rect 映射/量化链回归）
//   kill   —— texkill 位图(库内 0 条,防线仍在)
//   dup    —— 同场景两次独立执行哈希自洽断言（暴露任何跨调用状态泄漏）
//
// 重生成：SM2_GOLDEN_REWRITE=1 npx vitest run tests/fx-sm2-bit-golden.test.ts
// （重生成必须走人工审阅流程——diff 固件后确认差异面在预期集合内再提交）
import { describe, it, expect, vi } from 'vitest';
// 本机多会话常态高负载(load 80+):默认 5s testTimeout 把 63×12 金标网打成伪红——显式放宽
vi.setConfig({ testTimeout: 600000 });
import * as fs from 'node:fs';
import path from 'node:path';
import {
  defaultUniforms, getPass, passNames, runPassOnImageData,
  sampleImageData, SM2Pass, SM2Uniforms, SM2Sampler,
} from '../src/fx/SM2Effect';

const FIXTURE = path.join(__dirname, 'fixtures', 'sm2-bit-golden.json');

// ---------- 宿主指纹：Math.* 各引擎 ulp 级实现差异兜底 ----------
function hostFingerprint(): string {
  const probes = [
    Math.sin(1.23456789012345), Math.cos(2.71828182845905),
    Math.sin(1e7), Math.cos(-1e7),
    Math.pow(0.3, 1.9), Math.log2(3.77), Math.exp(1.1),
    Math.atan2(3, -7), 2 ** -19.25, Math.sqrt(2) * Math.sqrt(2) - 2,
    Math.hypot(3, 4, 5), Math.sin(Math.PI), 1e7 + 0.3 - 1e7,
  ];
  return probes.map((v) => Object.is(v, -0) ? '-0' : v.toString(17)).join(',');
}

// ---------- FNV-1a 64 ----------
const FNV_OFF = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
type Hasher = { feedByte(b: number): void; hex(): string };
function fnv(): Hasher {
  let h = FNV_OFF;
  return {
    feedByte(b: number) { h ^= BigInt(b & 0xff); h = (h * FNV_PRIME) & 0xffffffffffffffffn; },
    hex() { return h.toString(16).padStart(16, '0'); },
  };
}
const DV = new DataView(new ArrayBuffer(8));
/** double → 位串喂给哈希（逐分量 Object.is 级）。
 * ★非有限值按【值类】而非位类捕获：NaN 的符号/负载位硬件与 JIT 分层间不保证稳定
 *   （实证 2026-09-01：ArmorAcid/S01 直接产出 NaN——preshader c0=Infinity 参与
 *    Inf−Inf 类运算，rep0 与 rep1 的 NaN 位型即互异）；下游 Uint8ClampedArray 对
 *    NaN 恒钳 0，视觉上无位级意义，故归一为标记字节。 */
function feedDouble(fn: Hasher, v: number): void {
  if (Number.isNaN(v)) { fn.feedByte(0x6e); fn.feedByte(0xc1); return; }       // 'N''Á'
  if (v === Infinity) { fn.feedByte(0x49); fn.feedByte(0x46); return; }        // 'I''F'
  if (v === -Infinity) { fn.feedByte(0x69); fn.feedByte(0x6e); return; }       // 'i''n'
  DV.setFloat64(0, v);
  for (let k = 0; k < 8; k++) fn.feedByte(DV.getUint8(k));
}

// ---------- 场景表（设计依据：2026-08-31 A 报告 §5 金标网最小集）----------
interface Scene { id: string; uni: (u: SM2Uniforms) => void; rect?: { sx: number; sy: number; sheetW: number; sheetH: number } }
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
  { id: 'S10-direction',    uni: (u) => { u.uDirection = -1; u.uRotation = 2.31; u.uImageSize1 = [256, 256]; u.uImageSize2 = [64, 32]; } },
  { id: 'S11-size0-explicit', uni: (u) => { u.uImageSize0 = [97, 51]; u.uTime = 11.11; } },
  { id: 'S12-lightsource',  uni: (u) => { u.uLightSource = [0.1, 0.2, 0.3, 0.4]; u.uLegacyArmorSourceRect = [4, 6, 40, 56]; u.uLegacyArmorSheetSize = [128, 192]; } },
];
const W = 8, H = 8;

/** 渐变输入源；rect 场景用 16×16 母表(runPassOnImageData 只吃切片视角) */
function srcBytes(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    d[i] = ((x * 37 + y * 17) ^ (x * 11)) & 255;
    d[i + 1] = (x * 29 + y * 53) & 255;
    d[i + 2] = ((x * 5 - y * 13) + 256) & 255;
    d[i + 3] = x === w - 1 ? 26 : 255;      // 尾列低 alpha 练采样混色
  }
  return d;
}

/** 与 SM2Effect.runPassOnImageData 的 s0/t0of 语义镜像(逐字同式)；仅测试用 */
function mkProbeSamplers(srcData: Uint8ClampedArray, sw: number, sh: number,
  rect?: Scene['rect']): SM2Sampler[] {
  const s0: SM2Sampler = rect
    ? (uu, vv) => sampleImageData(srcData, sw, sh, (uu * rect.sheetW - rect.sx) / sw, (vv * rect.sheetH - rect.sy) / sh, false)
    : (uu, vv) => sampleImageData(srcData, sw, sh, uu, vv, false);
  return [s0];
}
function probeT0(x: number, y: number, rect?: Scene['rect']): [number, number] {
  return rect ? [(rect.sx + x + 0.5) / rect.sheetW, (rect.sy + y + 0.5) / rect.sheetH]
              : [(x + 0.5) / W, (y + 0.5) / H];
}

/** 直连 execPixel 全网格捕获(direct 哈希)。返回 null 计入 kill 位图。 */
function captureDirect(pass: SM2Pass, u: SM2Uniforms, scene: Scene): { hash: string; kill: string } {
  const c = pass.setupConstants(u);
  const regs = new Float64Array(32 * 4);
  const tex = new Float64Array(8 * 4);
  const o = new Float64Array(4);
  const sheetW = scene.rect ? scene.rect.sheetW : W;
  const sheetH = scene.rect ? scene.rect.sheetH : H;
  const srcData = srcBytes(sheetW, sheetH);
  // rect 时语义=切片视角(s0 只见 8×8 数据,坐标反变换回到切片局部)——与
  // runPassOnImageData L450-453 一致:srcData 是目标切片本身的拷贝
  const sliceSrc = scene.rect
    ? (() => { const d = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const si = ((scene.rect!.sy + y) * sheetW + scene.rect!.sx + x) * 4;
          const di = (y * W + x) * 4;
          d[di] = srcBytes(sheetW, sheetH)[si]; d[di+1] = srcBytes(sheetW, sheetH)[si+1];
          d[di+2] = srcBytes(sheetW, sheetH)[si+2]; d[di+3] = srcBytes(sheetW, sheetH)[si+3];
        } return d; })()
    : srcData;
  const samplers = mkProbeSamplers(sliceSrc, W, H, scene.rect);
  const v0Variants: Array<[number, number, number, number]> =
    [[1, 1, 1, 1], [0.53, 0.61, 0.47, 0.81], [0, 0, 0, 1]];
  const fnMain = fnv(); const killBits: string[] = [];
  for (let vi = 0; vi < v0Variants.length; vi++) {
    const fullGrid = vi === 0;                     // 白场全网格,其余只探中心像素
    const cells = fullGrid ? [...Array(W * H).keys()] : [4 * W + 4];
    for (const cell of cells) {
      const x = cell % W, y = (cell / W) | 0;
      const [t0x, t0y] = probeT0(x, y, scene.rect);
      const regsL = new Float64Array(regs);        // 隔离各次调用
      const oL = new Float64Array(o);
      const v0 = new Float64Array(8);
      for (let k = 0; k < 4; k++) v0[k] = v0Variants[vi][k];
      const texL = new Float64Array(tex);
      texL[0] = t0x; texL[1] = t0y;
      let out = null as ReturnType<SM2Pass['execPixel']>;
      try {
        out = pass.execPixel(c, regsL, texL, v0, oL, t0x, t0y, samplers);
      } catch { /* 与主捕获一致:异常即位级事实 */ }
      if (!out) { killBits.push(`${vi}:${x},${y}`); continue; }
      feedDouble(fnMain, out[0]); feedDouble(fnMain, out[1]);
      feedDouble(fnMain, out[2]); feedDouble(fnMain, out[3]);
    }
  }
  return { hash: fnMain.hex(), kill: killBits.join('|') || '-' };
}

/** 全栈 runPassOnImageData 双跑（stack 哈希 + 自洽断言） */
function captureStack(pass: SM2Pass, scene: Scene): string {
  const data = new Uint8ClampedArray(W * H * 4);
  const sheet = srcBytes(scene.rect ? scene.rect.sheetW : W, scene.rect ? scene.rect.sheetH : H);
  const crop = (sx: number, sy: number, w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((sy + y) * (scene.rect ? scene.rect.sheetW : W) + sx + x) * 4;
      const di = (y * w + x) * 4;
      d[di] = sheet[si]; d[di + 1] = sheet[si + 1]; d[di + 2] = sheet[si + 2]; d[di + 3] = sheet[si + 3];
    }
    return d;
  };
  const seed = scene.rect ? crop(scene.rect.sx, scene.rect.sy, W, H)
                          : srcBytes(W, H);
  data.set(seed);
  const uni = defaultUniforms();
  scene.uni(uni);
  const p1 = new Uint8ClampedArray(data);
  runPassOnImageData(pass, data, W, H, uni, [], scene.rect);
  const f1 = fnv();
  for (const b of data) f1.feedByte(b);
  // 第二跑换一份数据副本重放,验证解释器无跨调用状态依赖
  const data2 = new Uint8ClampedArray(p1);
  runPassOnImageData(pass, data2, W, H, uni, [], scene.rect);
  for (let i = 0; i < data.length; i++) expect(data2[i]).toBe(data[i]);
  return f1.hex();
}

/** v0≠白 全栈捕获（2026-09-03 v0 化批）：dim 光色经 runPassOnImageData v0Rgb
 *  入口——锁 v0 注入写路径/量化链回归（direct 层 v0 变体已存在，见 captureDirect
 *  v0Variants）。光色取暗洞蓝灰（受累族偏差最敏感域）。 */
const STACK_LIT_V0: [number, number, number] = [0.3, 0.35, 0.42];
function captureStackLit(pass: SM2Pass, scene: Scene): string {
  const data = new Uint8ClampedArray(W * H * 4);
  const sheet = srcBytes(scene.rect ? scene.rect.sheetW : W, scene.rect ? scene.rect.sheetH : H);
  if (scene.rect) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = ((scene.rect.sy + y) * scene.rect.sheetW + scene.rect.sx + x) * 4;
      const di = (y * W + x) * 4;
      data[di] = sheet[si]; data[di + 1] = sheet[si + 1]; data[di + 2] = sheet[si + 2]; data[di + 3] = sheet[si + 3];
    }
  } else data.set(sheet);
  const uni = defaultUniforms();
  scene.uni(uni);
  runPassOnImageData(pass, data, W, H, uni, [], scene.rect, STACK_LIT_V0);
  const f = fnv();
  for (const b of data) f.feedByte(b);
  return f.hex();
}

describe('SM2 位级金标快照网', () => {
  const fp = hostFingerprint();

  it('金标网覆盖全部 63 pass 且固件与当前解释器逐位一致', () => {
    let fixture: Record<string, unknown>;
    try {
      fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    } catch {
      throw new Error(`固件缺失(${FIXTURE}):先跑 SM2_GOLDEN_REWRITE=1 生效并人工审阅 diff`);
    }
    expect(fixture.meta && typeof fixture.meta === 'object').toBe(true);
    const meta = fixture.meta as Record<string, unknown>;
    // 跨引擎 Math ulp 差异门控(electron JSC vs dev V8 亚 LSB 不一致,MEMORY 在案):
    // 引擎指纹不同属预期外——本网只服务 V8 vitest 环境
    expect(String(meta.hostFingerprint)).toBe(fp);

    const passes = passNames().sort();
    const recorded = Object.keys(fixture.passes as object).sort();
    expect(recorded).toEqual(passes);               // 无缺漏无多余

    const mismatches: string[] = [];
    for (const name of passes) {
      const pass = getPass(name)!;
      const rec = (fixture.passes as Record<string, Record<string, { direct: string; stack: string; stackLit: string; kill: string }>>)[name];
      for (const sc of SCENES) {
        const u = defaultUniforms();
        sc.uni(u);
        const got = captureDirect(pass, u, sc);
        const exp = rec[sc.id];
        if (!exp) { mismatches.push(`${name}/${sc.id}: 固件缺场景`); continue; }
        if (exp.direct !== got.hash || exp.kill !== got.kill) {
          mismatches.push(`${name}/${sc.id} direct ${exp.direct.slice(0, 10)}…→${got.hash.slice(0, 10)}…(kill ${exp.kill}→${got.kill})`);
        }
        const gotStack = captureStack(pass, sc);
        if (exp.stack !== gotStack) mismatches.push(`${name}/${sc.id} stack ${exp.stack.slice(0, 10)}…→${gotStack.slice(0, 10)}…`);
        if (exp.stackLit === undefined) { mismatches.push(`${name}/${sc.id}: 固件缺 stackLit 家族`); continue; }
        const gotStackLit = captureStackLit(pass, sc);
        if (exp.stackLit !== gotStackLit) mismatches.push(`${name}/${sc.id} stackLit ${exp.stackLit.slice(0, 10)}…→${gotStackLit.slice(0, 10)}…`);
      }
    }
    if (mismatches.length) {
      throw new Error([
        `SM2 金标失配 ${mismatches.length} 处(前 12 条):`,
        ...mismatches.slice(0, 12),
        '确认属预期行为变更(如 P3 舍入/P1 出参化重构通过锚测)后,',
        '以 SM2_GOLDEN_REWRITE=1 重生成并人工审阅 diff 提交。',
      ].join('\n'));
    }
  });

  it('重生成通道(SM2_GOLDEN_REWRITE=1)', () => {
    if (!process.env.SM2_GOLDEN_REWRITE) { expect(true).toBe(true); return; }
    const passes: Record<string, Record<string, { direct: string; stack: string; stackLit: string; kill: string }>> = {};
    for (const name of passNames()) {
      const pass = getPass(name)!;
      passes[name] = {};
      for (const sc of SCENES) {
        const u = defaultUniforms();
        sc.uni(u);
        const got = captureDirect(pass, u, sc);
        passes[name][sc.id] = { direct: got.hash, stack: captureStack(pass, sc), stackLit: captureStackLit(pass, sc), kill: got.kill };
      }
    }
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify({
      meta: {
        comment: 'SM2 解释器位级金标(PRD:#0)。寄存值=生成时刻解释器逐位输出;重生成需人工审阅。',
        hostFingerprint: fp,
        engine: process.version,
        sceneCount: SCENES.length,
      },
      passes,
    }, null, 1));
    console.log('[fx-sm2-bit-golden] fixture rewritten:', FIXTURE);
    expect(true).toBe(true);
  });
});
