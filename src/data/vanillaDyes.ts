// 染料运行时（tools/extract-dyes.mjs ← DyeInitializer.cs → vanilla-dyes.json）。
// 数据 1:1：116 条 id → {tech, color?, secondary?, saturation?}。
//
// 像素执行走 SM2Effect 解释器：直接跑 PixelShader.cso 导出的原始字节码
// （src/data/fxPixelShader.json，63 pass 全量）——含基础 ArmorColored 族与全部
// 特效染料（彩虹/活火/反射/凝胶/HallowBoss 等），逐指令 1:1，无近似公式。
// uniform 注入对齐 ArmorShaderData.Apply（C# 可读侧）；uLightSource 的 4 点光照
// 梯度对齐 ReflectiveArmorShaderData.Apply。
import dyeJson from './vanilla-dyes.json';
import fxShaderJson from './fxPixelShader.json';
import { defaultUniforms, getPass, runPassOnImageData, sampleImageData, type SM2Sampler, type SM2Uniforms } from '../fx/SM2Effect';

export interface DyeEntry {
  tech: string;
  color?: [number, number, number];
  secondary?: [number, number, number];
  saturation?: number;
}

const TABLE = (dyeJson as unknown as { dyes: Record<string, DyeEntry> }).dyes;

// ---- R33 review C1 修复：texld-s1 pass 检测（字节码扫描）----
// opcode 0x42(texld) 的 src1(第 3 operand token) 寄存器文件=SAMPLER(regtype 10)
// 且 reg=1 → 该 pass 消费 s1 采样器。命中集 = DyeInitializer `.UseImage("Images/
// Misc/noise")` 染料族（ArmorGel×4/Twilight/Phase/Nebula/Vortex/Stardust/
// ShiftingSands/ShiftingPearlsands/Fog）+ ArmorHallowBoss(Extra_156)。
// 曾写 `pass.name === 'ArmorHallowBoss'` 硬编码 → 其余 12 项 s1 落 (0,0,0,1)
// 黑回退（凝胶丢噪声高光/次色路径塌平）。
// token 步进需全表 opcode→operand 计数（与 SM2Effect.decodeProgram 同源）。
const SM2_OP_OPERANDS: Record<number, number> = {
  0x00: 0, 0x01: 2, 0x02: 3, 0x03: 3, 0x04: 4, 0x05: 3, 0x06: 2, 0x07: 2,
  0x08: 3, 0x09: 3, 0x0A: 3, 0x0B: 3, 0x0C: 3, 0x0D: 3, 0x0E: 2, 0x0F: 2,
  0x12: 4, 0x13: 2, 0x1F: 2, 0x20: 3, 0x21: 3, 0x23: 2, 0x24: 2, 0x25: 4,
  0x41: 1, 0x42: 3, 0x51: 5, 0x58: 4, 0x5A: 4,
};
const S1_PASSES: Set<string> = (() => {
  const passes = (fxShaderJson as unknown as { passes: Array<{ pass: string; tokens: number[] }> }).passes;
  const fileOf = (t: number): number => ((t >> 28) & 7) | ((t >> 8) & 0x18);
  const out = new Set<string>();
  for (const p of passes) {
    const toks = p.tokens;
    let i = 0;
    let usesS1 = false;
    while (i < toks.length) {
      const tok = toks[i++];
      const op = tok & 0xFFFF;
      if (op === 0xFFFF) break;
      const n = SM2_OP_OPERANDS[op];
      if (n === undefined) break;         // 未知 opcode：截断（与解释器同防御）
      const raw = toks.slice(i, i + n);
      i += n;
      if (op === 0x1F) continue;          // dcl
      if (op === 0x42) {
        const smp = raw[2];
        if (fileOf(smp) === 10 && (smp & 0x7FF) === 1) { usesS1 = true; break; }
      }
    }
    if (usesS1) out.add(p.pass);
  }
  return out;
})();

/** s1=noise 内建采样器（Images/Misc/noise → /sprites/vanilla/Misc_noise.png）。
 *  惰性 Image 加载（applyDyePass 同步、不 await）：加载完成前返回 undefined
 *  （=今日黑回退，不劣化）；onload 后常驻；onerror 静默降级同今日行为。
 *  寻址=clamp（SM2Effect 头注：染料 SpriteBatch LinearClamp 语义）。 */
let noiseSam: SM2Sampler | null = null;
let noiseStarted = false;
function noiseSampler(): SM2Sampler | undefined {
  if (noiseSam) return noiseSam;
  if (noiseStarted || typeof document === 'undefined') return undefined;
  noiseStarted = true;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        if (!cx || !cv.width || !cv.height) return;
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        const w = cv.width, h = cv.height;
        noiseSam = (u, v) => sampleImageData(d, w, h, u - Math.floor(u), v - Math.floor(v), false);
      } catch { /* 解码失败：维持黑回退 */ }
    };
    img.src = '/sprites/vanilla/Misc_noise.png';
  } catch { /* 无 DOM：维持黑回退 */ }
  return undefined;
}

/** 染料 vid → 可执行描述（tech + 已装配 uniforms 基底）；无表项/无字节码 pass 返回 null */
export interface DyeApply {
  vid: number;
  tech: string;
  uniforms: SM2Uniforms;
  /** 该 pass 字节码消费 s1 采样器（texld-s1 检测）：HallowBoss 染料 4778 →
   *  Extra_156（消费端 hallowRampSampler 供）；noise 族 → applyDyePass 内建
   *  Misc_noise 采样器覆写（R33 C1——消费端零改动收敛点） */
  needsImage1: boolean;
}

export function dyeApplyOf(vid: number): DyeApply | null {
  const e = TABLE[String(vid)];
  if (!e) return null;
  const pass = getPass(e.tech);
  if (!pass) return null;
  const u = defaultUniforms();
  if (e.color) u.uColor = e.color;
  if (e.secondary) u.uSecondaryColor = e.secondary;
  if (e.saturation !== undefined) u.uSaturation = e.saturation;
  return {
    vid, tech: e.tech, uniforms: u,
    needsImage1: S1_PASSES.has(pass.name),
  };
}

/** 表查询（测试用） */
export function dyeEntryOf(vid: number): DyeEntry | null {
  return TABLE[String(vid)] ?? null;
}

export function dyeCount(): number {
  return Object.keys(TABLE).length;
}

/**
 * 对 ImageData 执行染料 pass（原地）。extraSamplers 供 s1/s2（见 needsImage1）。
 * ★R33 C1：noise 族染料（s1 pass 但非 HallowBoss）的 s1 一律覆写为内建
 * Misc_noise 采样器——消费端传来的 hallowRamp(Extra_156) 仅对 HallowBoss 正确；
 * noiseOverride 供测试/上层注入（生产走内建惰性加载）。返回是否实际染色。
 */
export function applyDyePass(data: Uint8ClampedArray, w: number, h: number,
  apply: DyeApply, extraSamplers: Array<SM2Sampler | undefined> = [],
  t0Rect?: { sx: number; sy: number; sheetW: number; sheetH: number },
  noiseOverride?: SM2Sampler): boolean {
  const pass = getPass(apply.tech);
  if (!pass) return false;
  let extra = extraSamplers;
  if (S1_PASSES.has(pass.name) && pass.name !== 'ArmorHallowBoss') {
    const nz = noiseOverride ?? noiseSampler();
    if (nz) extra = [nz, ...extraSamplers.slice(1)];
    // nz 未就绪：保持调用方原样（=今日黑回退，不劣化）
  }
  runPassOnImageData(pass, data, w, h, apply.uniforms, extra, t0Rect);
  return true;
}
