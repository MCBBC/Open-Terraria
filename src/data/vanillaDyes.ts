// 染料运行时（tools/extract-dyes.mjs ← DyeInitializer.cs → vanilla-dyes.json）。
// 数据 1:1：116 条 id → {tech, color?, secondary?, saturation?}。
//
// 像素执行走 SM2Effect 解释器：直接跑 PixelShader.cso 导出的原始字节码
// （src/data/fxPixelShader.json，63 pass 全量）——含基础 ArmorColored 族与全部
// 特效染料（彩虹/活火/反射/凝胶/HallowBoss 等），逐指令 1:1，无近似公式。
// uniform 注入对齐 ArmorShaderData.Apply（C# 可读侧）；uLightSource 的 4 点光照
// 梯度对齐 ReflectiveArmorShaderData.Apply。
import dyeJson from './vanilla-dyes.json';
import { defaultUniforms, getPass, runPassOnImageData, type SM2Sampler, type SM2Uniforms } from '../fx/SM2Effect';

export interface DyeEntry {
  tech: string;
  color?: [number, number, number];
  secondary?: [number, number, number];
  saturation?: number;
}

const TABLE = (dyeJson as unknown as { dyes: Record<string, DyeEntry> }).dyes;

/** 染料 vid → 可执行描述（tech + 已装配 uniforms 基底）；无表项/无字节码 pass 返回 null */
export interface DyeApply {
  vid: number;
  tech: string;
  uniforms: SM2Uniforms;
  /** 需要调用方提供 s1 采样器（HallowBoss 染料 4778 → Extra_156 彩虹渐变） */
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
    needsImage1: pass.name === 'ArmorHallowBoss',
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
 * 返回是否实际染色（false = pass 缺失/数据异常 → 原样）。
 */
export function applyDyePass(data: Uint8ClampedArray, w: number, h: number,
  apply: DyeApply, extraSamplers: Array<SM2Sampler | undefined> = []): boolean {
  const pass = getPass(apply.tech);
  if (!pass) return false;
  runPassOnImageData(pass, data, w, h, apply.uniforms, extraSamplers);
  return true;
}
