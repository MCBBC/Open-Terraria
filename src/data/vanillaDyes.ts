// 染料运行时（tools/extract-dyes.mjs ← DyeInitializer.cs → vanilla-dyes.json）。
// 数据 1:1：116 条 id → {tech, color?, secondary?, saturation?}。
//
// ===== 像素语义可得性（重要） =====
// 全部染料技术（含"基础" ArmorColored 族）都是编译期 effect 技术——HLSL 不在
// 反编译 C# 源内。本仓只对"单色重着色"可静态推演的族做仿真，公式为近似并逐项
// 登记；其余技术（彩虹/活火/反射/凝胶等 ~35 条）登记为 effect 二进制缺口，
// 消费端跳过（= 未染原色，与无染料等价）。
//
// 仿真族（EMULABLE）：
//   ArmorColored / AndBlack / AndSilverTrim：lum = 0.299r+0.587g+0.114b（XNA 权重
//     未得，取 BT.601）；colored = lum×color；final = colored + (orig−colored)×sat
//     （sat=1.2 基础族 → 超取样回原色 20%）
//   ArmorBrightnessColored：final = orig × color（颜色可为 >1 提亮）
//   ArmorColoredGradient / AndBlackGradient / AndSilverTrimGradient / BrightnessGradient：
//     c = lerp(color, secondary, lum)；final = c + (orig−c)×sat（Brightness 无 sat）
import dyeJson from './vanilla-dyes.json';

export interface DyeEntry {
  tech: string;
  color?: [number, number, number];
  secondary?: [number, number, number];
  saturation?: number;
}

const TABLE = (dyeJson as unknown as { dyes: Record<string, DyeEntry> }).dyes;

/** 仿真族技术集（其余 = effect 登记缺口） */
const EMULABLE = new Set([
  'ArmorColored', 'ArmorColoredAndBlack', 'ArmorColoredAndSilverTrim',
  'ArmorColoredGradient', 'ArmorColoredAndBlackGradient', 'ArmorColoredAndSilverTrimGradient',
  'ArmorBrightnessColored', 'ArmorBrightnessGradient',
]);

export interface DyeEmulation {
  /** 'solid' = lum×color 族；'bright' = ×color；'gradient' = lerp(color,secondary,lum) */
  kind: 'solid' | 'bright' | 'gradient';
  color: [number, number, number];
  secondary?: [number, number, number];
  saturation: number;
}

/** dye 物品 vid → 仿真参数；不可仿真（effect 缺口）或未知 id 返回 null */
export function dyeEmulationOf(vid: number): DyeEmulation | null {
  const e = TABLE[String(vid)];
  if (!e || !EMULABLE.has(e.tech)) return null;
  const color = e.color ?? [1, 1, 1];
  if (e.tech === 'ArmorBrightnessColored') {
    return { kind: 'bright', color, saturation: 1 };
  }
  if (e.tech.endsWith('Gradient')) {
    return { kind: 'gradient', color, secondary: e.secondary ?? color, saturation: e.saturation ?? 1 };
  }
  return { kind: 'solid', color, saturation: e.saturation ?? 1 };
}

/** 表查询（测试/登记用） */
export function dyeEntryOf(vid: number): DyeEmulation & { tech: string } | null {
  const e = TABLE[String(vid)];
  if (!e) return null;
  const emu = dyeEmulationOf(vid);
  return { tech: e.tech, ...(emu ?? { kind: 'solid', color: [1, 1, 1], saturation: 1 }) };
}

/** effect 二进制缺口染料 id 全集（登记清单） */
export function effectDyeIds(): number[] {
  return Object.entries(TABLE)
    .filter(([, e]) => !EMULABLE.has(e.tech))
    .map(([k]) => +k)
    .sort((a, b) => a - b);
}

/** 染料仿真像素公式（近似，见头注；RGBA ImageData 原地改写） */
export function applyDyeEmulation(data: Uint8ClampedArray, emu: DyeEmulation): void {
  const sat = emu.saturation;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (emu.kind === 'bright') {
      data[i] = r * emu.color[0]; data[i + 1] = g * emu.color[1]; data[i + 2] = b * emu.color[2];
      continue;
    }
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const base = emu.kind === 'gradient'
      ? [emu.color[0] + (emu.secondary![0] - emu.color[0]) * lum,
         emu.color[1] + (emu.secondary![1] - emu.color[1]) * lum,
         emu.color[2] + (emu.secondary![2] - emu.color[2]) * lum]
      : [lum * emu.color[0], lum * emu.color[1], lum * emu.color[2]];
    data[i] = base[0] * 255 + (r - base[0] * 255) * sat;
    data[i + 1] = base[1] * 255 + (g - base[1] * 255) * sat;
    data[i + 2] = base[2] * 255 + (b - base[2] * 255) * sat;
  }
}
