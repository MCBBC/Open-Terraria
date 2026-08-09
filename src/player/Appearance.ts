// 角色外观数据（对齐原版 Player 的外观字段）。
// 颜色为 0xRRGGBB（不含 alpha）；默认值 = Player.cs:199-205 的原版默认色。
export interface RGBColor { r: number; g: number; b: number; }

export type Difficulty = 0 | 1 | 2 | 3; // 0 软核 1 中核 2 硬核 3 旅程

export interface Appearance {
  name: string;
  hair: number;              // 1..228 → Player_Hair_N
  skinVariant: 0 | 1;        // 0 男 1 女
  hairColor: RGBColor;
  skinColor: RGBColor;
  eyeColor: RGBColor;
  shirtColor: RGBColor;
  undershirtColor: RGBColor;
  pantsColor: RGBColor;
  shoeColor: RGBColor;
  difficulty: Difficulty;
}

/** 原版默认色（Player.cs:199-205） */
export const DEFAULT_COLORS = {
  hairColor: { r: 215, g: 90, b: 55 },
  skinColor: { r: 255, g: 125, b: 90 },
  eyeColor: { r: 105, g: 90, b: 75 },
  shirtColor: { r: 175, g: 165, b: 140 },
  undershirtColor: { r: 160, g: 180, b: 215 },
  pantsColor: { r: 255, g: 230, b: 175 },
  shoeColor: { r: 160, g: 105, b: 60 },
};

export const HAIR_COUNT = 228;

/** 难度文本与颜色（UIDifficultyButton：软核青 / 中核 Main.mcColor / 硬核 Main.hcColor / 旅程 creativeModeColor） */
export const DIFFICULTY_INFO: Array<{ label: string; color: RGBColor }> = [
  { label: '软核', color: { r: 0, g: 255, b: 255 } },
  { label: '中核', color: { r: 255, g: 153, b: 0 } },
  { label: '硬核', color: { r: 255, g: 38, b: 25 } },
  { label: '旅程', color: { r: 255, g: 125, b: 187 } },
];

export function defaultAppearance(name = ''): Appearance {
  return {
    name,
    hair: 1,
    skinVariant: 0,
    ...structuredClone(DEFAULT_COLORS),
    difficulty: 0,
  };
}

/** 旧数据/损坏数据补默认；颜色钳到 0-255 */
export function validateAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const d = defaultAppearance();
  if (!a) return d;
  const c = (v: unknown, fallback: RGBColor): RGBColor => {
    if (typeof v !== 'object' || v === null) return fallback;
    const o = v as Partial<RGBColor>;
    const cl = (n: unknown) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return { r: cl(o.r), g: cl(o.g), b: cl(o.b) };
  };
  return {
    name: typeof a.name === 'string' ? a.name.slice(0, 20) : d.name,
    hair: clampInt(a.hair, 1, HAIR_COUNT, d.hair),
    skinVariant: a.skinVariant === 1 ? 1 : 0,
    hairColor: c(a.hairColor, d.hairColor),
    skinColor: c(a.skinColor, d.skinColor),
    eyeColor: c(a.eyeColor, d.eyeColor),
    shirtColor: c(a.shirtColor, d.shirtColor),
    undershirtColor: c(a.undershirtColor, d.undershirtColor),
    pantsColor: c(a.pantsColor, d.pantsColor),
    shoeColor: c(a.shoeColor, d.shoeColor),
    difficulty: ([0, 1, 2, 3] as number[]).includes(a.difficulty as number) ? (a.difficulty as Difficulty) : 0,
  };
}

/** 随机外观（对齐原版 CreateCharacter 的随机范围：低饱和肤色、随机发型与衣色） */
export function randomAppearance(name = ''): Appearance {
  const a = defaultAppearance(name);
  a.hair = 1 + Math.floor(Math.random() * HAIR_COUNT);
  a.skinVariant = Math.random() < 0.5 ? 0 : 1;
  const hsl = (h: number, s: number, l: number) => {
    const [r, g, b] = hslToRgb(h / 360, s, l);
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };
  a.skinColor = hsl(20 + Math.random() * 20, 0.45, 0.55 + Math.random() * 0.25);
  a.hairColor = hsl(Math.random() * 360, 0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4);
  a.eyeColor = hsl(Math.random() * 360, 0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.3);
  a.shirtColor = hsl(Math.random() * 360, 0.3 + Math.random() * 0.4, 0.45 + Math.random() * 0.2);
  a.undershirtColor = hsl(Math.random() * 360, 0.3 + Math.random() * 0.4, 0.45 + Math.random() * 0.2);
  a.pantsColor = hsl(Math.random() * 360, 0.25 + Math.random() * 0.35, 0.35 + Math.random() * 0.3);
  a.shoeColor = hsl(Math.random() * 360, 0.3 + Math.random() * 0.4, 0.25 + Math.random() * 0.25);
  a.difficulty = 0;
  return a;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** HSL → RGB（0-1 输入/输出） */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return [h, s, l];
}
