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
import { defaultUniforms, getPass, runPassOnImageData, sampleImageInto, type SM2SamplerOut, type SM2Uniforms } from '../fx/SM2Effect';

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
 *  惰性 Image 加载（applyDyePass 同步、不 await）；onload 后常驻；onerror 静默
 *  降级到中性灰。寻址=clamp（SM2Effect 头注：染料 SpriteBatch LinearClamp 语义）。
 *  ★R33 回归轮：加载单例化已复核（noiseStarted 旗，Image 只建一次=无加载风暴）；
 *  就绪前回退改中性灰（0.5）而非放行消费端 hallowRamp——Extra_156 彩虹渐变对
 *  noise 族是错纹理（曾致相位染料彩虹污染+不可预期 alpha）。 */
let noiseSam: SM2SamplerOut | null = null;
let noiseStarted = false;
const NOISE_SIZE = 256;                       // Misc_noise.png 256²（资产实测）
const noiseNeutral: SM2SamplerOut = (u, v, o4) => { o4[0] = 0.5; o4[1] = 0.5; o4[2] = 0.5; o4[3] = 1; };   // 中性灰回退
let noiseRetried = false;
function noiseSampler(): SM2SamplerOut {
  if (noiseSam) return noiseSam;
  if (noiseStarted || typeof document === 'undefined') return noiseNeutral;
  noiseStarted = true;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        if (!cx || !cv.width || !cv.height) return;   // 维持中性灰
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        const w = cv.width, h = cv.height;
        noiseSam = (u, v, o4) => { sampleImageInto(d, w, h, u - Math.floor(u), v - Math.floor(v), false, o4); };
      } catch { /* 解码失败：维持中性灰 */ }
    };
    img.onerror = () => {
      // ★失败重试一次(2026-08-25 同类扫描):瞬时失败不留永久中性灰
      if (!noiseRetried) {
        noiseRetried = true;
        setTimeout(() => { noiseStarted = false; noiseSampler(); }, 1000);
      }
    };
    img.src = '/sprites/vanilla/Misc_noise.png';
  } catch { /* 无 DOM：维持中性灰 */ }
  return noiseNeutral;
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
 * ★R33 C1：noise 族染料（s1 pass 但非 HallowBoss）的 s1 一律覆写——就绪用真
 * Misc_noise，未就绪用中性灰（0.5）——【不放行】消费端误传的 hallowRamp
 * (Extra_156 彩虹渐变=错纹理，曾污染相位染料)。noiseOverride 供测试/上层注入。
 * ★噪声族 uImageSize1 强制 [256,256]：ArmorPhase 等 preshader 对噪声尺寸取
 * rcp（默认 [0,0] → rcp(0)=Infinity → 相位 UV 中毒，2026-08-26 回归轮定谳）。
 * 返回是否实际染色。
 */
export function applyDyePass(data: Uint8ClampedArray, w: number, h: number,
  apply: DyeApply, extraSamplers: Array<SM2SamplerOut | undefined> = [],
  t0Rect?: { sx: number; sy: number; sheetW: number; sheetH: number },
  noiseOverride?: SM2SamplerOut): boolean {
  const pass = getPass(apply.tech);
  if (!pass) return false;
  let extra = extraSamplers;
  if (S1_PASSES.has(pass.name)) {
    if (pass.name === 'ArmorHallowBoss') {
      apply.uniforms.uImageSize1 = [256, 256];   // Extra_156 同为 256²（噪声尺寸 rcp 消费面）
    } else {
      const nz = noiseOverride ?? noiseSampler();
      extra = [nz, ...extraSamplers.slice(1)];
      apply.uniforms.uImageSize1 = [NOISE_SIZE, NOISE_SIZE];
    }
  }
  runPassOnImageData(pass, data, w, h, apply.uniforms, extra, t0Rect);
  return true;
}

/**
 * v0 非可交换族（受累名单，36 pass）——2026-09-03 经验定谳：同输入下
 * 「白烘×染后光乘」≠「v0=光烘」的 pass 集，由 tests/fx-sm2-v0-commute.test.ts
 * 对全部 63 pass × 15 场景 × 2 光色双引擎（codegen/VM）扫描锁死（测试爆红=名单
 * 漂移，先查解释器是否变更再改名单，勿静默重生成）。实测分离度极净：受累
 * minΔ=32（ArmorColoredRainbow），可交换 maxΔ=1（双重舍入噪声带）。
 *
 * ★域边界 = 染料运行时域（uOpacity≡1——染料站从不设 >1；uLightSource 仅
 * reflective 族翼站真实设置）。uOpacity 4-8（FlameLash 等 Misc 面）超域：那会
 * 连 ArmorBasicColor 都判受累（_sat 中间档 × opacity>1 破坏一切尾乘可交换），
 * 名单将无界膨胀——Misc 超域消费面的 v0 事务归各自站点，不进本表。
 *
 * ★取代 SM2Effect 头注 2026-08-24 r15 R15-14 字节码分类学的手抄 13 名——该名单
 * 真名映射后全部实证受累，但漏了渐变族（ArmorColoredGradient / ArmorBrightness
 * Gradient）/ArmorPhase/ArmorLivingOcean/reflective 族等共 36 个；头注点名的
 * Aurora 实测 Δ=0 完全可交换。字节码 op 级"v0 中段消费"静态判定有盲区（数据
 * 路径活性），以本经验扫描为准。
 *
 * ★名单含非染料 pass（ForceField/RainbowTownSlime/WaterProcessor/MouseItem/
 * FinalFractal/HorizonClouds/WaterDistortionObject）=全消费面真值登记；染料
 * 分流（applyDyePassLit）只对以染料 tech 流入本表成员者生效。
 */
export const V0_MID_PASSES: ReadonlySet<string> = new Set([
  'ArmorAcid', 'ArmorBrightnessGradient', 'ArmorBrightnessRainbow',
  'ArmorColoredAndBlackGradient', 'ArmorColoredGradient', 'ArmorColoredRainbow',
  'ArmorFog', 'ArmorForceField', 'ArmorHades', 'ArmorHighContrastGlow',
  'ArmorLivingFlame', 'ArmorLivingOcean', 'ArmorLivingRainbow', 'ArmorLoki',
  'ArmorMartian', 'ArmorMidnightRainbow', 'ArmorMushroom', 'ArmorNebula',
  'ArmorPhase', 'ArmorReflective', 'ArmorReflectiveColor',
  'ArmorShiftingPearlsands', 'ArmorShiftingSands', 'ArmorSolar', 'ArmorStardust',
  'ArmorTwilight', 'ArmorVoid', 'ArmorVortex', 'ArmorWisp', 'FinalFractal',
  'ForceField', 'HorizonClouds', 'MouseItem', 'RainbowTownSlime',
  'WaterDistortionObject', 'WaterProcessor',
]);

/** tech 是否 v0 中段消费族（消费端分流判据；名单本体见上注） */
export function isV0MidTech(tech: string): boolean {
  return V0_MID_PASSES.has(tech);
}

/**
 * 光感知染料应用：受累 13 tech 把【顶点色=v0】喂进 pass（0..1 UNORM），光照不再
 * 由调用方染后乘——返回 true 表示光已被消费，调用方【必须跳过】后续光乘。
 * 非受累 tech 返回 false 且零写入，调用方照常走旧链（白烘×光乘，逐位不变）。
 *
 * ★架构前提：调用点必须位于 compositeLight 全屏乘光【之外】（wingGlowQueue 族）。
 * 预合成面（玩家本体/尘埃/NPC）喂 v0=光后仍被全屏乘光再乘一次 = light² 二次压暗
 * （观感回归），故该面本批不接——须逐站逃逸队列后启用（Renderer 登记注）。
 * 采样器/uImageSize1 装配与 applyDyePass 完全同款（noise 族覆写语义共享）。
 */
export function applyDyePassLit(data: Uint8ClampedArray, w: number, h: number,
  apply: DyeApply, v0Rgb: readonly [number, number, number],
  extraSamplers: Array<SM2SamplerOut | undefined> = [],
  t0Rect?: { sx: number; sy: number; sheetW: number; sheetH: number },
  noiseOverride?: SM2SamplerOut): boolean {
  const pass = getPass(apply.tech);
  if (!pass || !V0_MID_PASSES.has(pass.name)) return false;
  let extra = extraSamplers;
  if (S1_PASSES.has(pass.name)) {
    if (pass.name === 'ArmorHallowBoss') {
      apply.uniforms.uImageSize1 = [256, 256];
    } else {
      const nz = noiseOverride ?? noiseSampler();
      extra = [nz, ...extraSamplers.slice(1)];
      apply.uniforms.uImageSize1 = [NOISE_SIZE, NOISE_SIZE];
    }
  }
  runPassOnImageData(pass, data, w, h, apply.uniforms, extra, t0Rect, v0Rgb);
  return true;
}
