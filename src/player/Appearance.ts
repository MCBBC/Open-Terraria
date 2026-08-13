// 角色外观数据（对齐原版 Player 的外观字段）。
// 颜色为 0xRRGGBB（不含 alpha）；默认值 = Player.cs:199-205 的原版默认色。
export interface RGBColor { r: number; g: number; b: number; }

export type Difficulty = 0 | 1 | 2 | 3; // 0 软核 1 中核 2 硬核 3 旅程

export interface Appearance {
  name: string;
  hair: number;              // 1..228 → Player_Hair_N
  /** 皮肤/衣服组合变体（0 男 1 女 2-9 特殊套装；UICharacterCreation._validClothStyles） */
  skinVariant: number;
  hairColor: RGBColor;
  skinColor: RGBColor;
  eyeColor: RGBColor;
  shirtColor: RGBColor;
  undershirtColor: RGBColor;
  pantsColor: RGBColor;
  shoeColor: RGBColor;
  difficulty: Difficulty;
  /** 硬核角色已消亡（Player.cs:38255 HardcoreDeathPenalty 的本仓持久化标记：
   *  死亡后置 true → respawnPlayer 拒绝重生 + 角色列表灰显；原版直接删 .plr 档） */
  hardcoreDead?: boolean;
  /** 队伍 0-5（Player.cs:53809 存档 byte team——原版持久化;hostile 不存档纯会话态） */
  team?: number;
}

/** 死亡是否掉全部物品（Player.cs:38254 DropItems(gemsOnly=false)：中核 1 / 硬核 2；
 *  软核/旅程走 gemsOnly=true 只掉宝石） */
export function dropsAllItemsOnDeath(charDifficulty: number): boolean {
  return charDifficulty === 1 || charDifficulty === 2;
}

/** 死亡是否走掉钱管线（Player.cs:38318 difficulty==0||3 才调 DropCoins：
 *  软核 0 / 旅程 3；中核硬核的钱币作为普通物品随 DropItems 全掉） */
export function dropsCoinsOnDeath(charDifficulty: number): boolean {
  return charDifficulty === 0 || charDifficulty === 3;
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
    hair: 0,               // 0 基（贴图 Player_Hair_1.png）
    skinVariant: 0,
    ...structuredClone(DEFAULT_COLORS),
    difficulty: 0,
    team: 0,
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
    // 1.4.5.6 保护（Player.cs:54209）：hair >= 228 → 0
    hair: clampInt(a.hair, 0, HAIR_COUNT - 1, d.hair),
    skinVariant: clampInt(a.skinVariant, 0, 11, d.skinVariant),
    hairColor: c(a.hairColor, d.hairColor),
    skinColor: c(a.skinColor, d.skinColor),
    eyeColor: c(a.eyeColor, d.eyeColor),
    shirtColor: c(a.shirtColor, d.shirtColor),
    undershirtColor: c(a.undershirtColor, d.undershirtColor),
    pantsColor: c(a.pantsColor, d.pantsColor),
    shoeColor: c(a.shoeColor, d.shoeColor),
    difficulty: ([0, 1, 2, 3] as number[]).includes(a.difficulty as number) ? (a.difficulty as Difficulty) : 0,
  team: (typeof a.team === 'number' && a.team >= 0 && a.team <= 5) ? Math.trunc(a.team) : 0,
    hardcoreDead: a.hardcoreDead === true ? true : undefined,   // 硬核消亡标记（旧数据缺省未消亡）
  };
}

/** UICharacterCreation.cs:58 的有效衣服样式（1.4.5.6：前 5 男装 / 后 5 女装） */
export const VALID_CLOTH_STYLES = [0, 2, 1, 3, 8, 9, 7, 5, 6, 4];

/** PlayerVariantID.Sets.Male / VariantOrderFemale（1.4.5.6） */
export const MALE_VARIANTS = [0, 1, 2, 3, 8, 10];
export const FEMALE_VARIANTS = [4, 5, 6, 7, 9, 11];

/** 发型 id 为 0 基（0..227）；贴图 = Player_Hair_{id+1}.png（AssetInitializer:455） */
export const HAIR_COUNT = 228;

/** 角色创建可用发型白名单（HairstyleUnlocksHelper.RebuildList：0-50 + 136-144,147-151,154,155,157,158,161
 *  + 51-122 + 134,135,146,152,153,156,159,165,160 + 166-227） */
export const CHAR_CREATION_HAIRS: number[] = (() => {
  const list: number[] = [];
  for (let i = 0; i <= 50; i++) list.push(i);
  list.push(136, 137, 138, 139, 140, 141, 142, 143, 144, 147, 148, 149, 150, 151, 154, 155, 157, 158, 161);
  for (let i = 51; i <= 122; i++) list.push(i);
  list.push(134, 135, 146, 152, 153, 156, 159, 165, 160);
  for (let i = 166; i < HAIR_COUNT; i++) list.push(i);
  return list;
})();

/** 女性发型表（UICharacterCreation 随机逻辑的 switch(hair+1)，case-1 还原为 0 基 id） */
export const FEMALE_HAIRS = new Set([4, 5, 6, 9, 11, 18, 21, 22, 25, 26, 29, 32, 33, 34, 36, 37, 38, 39, 40,
  43, 44, 45, 46, 47, 48, 50, 55, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 78, 79, 80, 81, 83, 84, 85, 86, 87,
  89, 90, 91, 92, 94, 95, 97, 99, 101, 103, 106, 107, 112, 123, 125, 132, 133, 134, 143, 145, 146, 162, 164]);

/** 后发层判定（Player.GetHairSettings:16771，0 基 id） */
export function backHairDraw(hair: number): boolean {
  if (hair === 133 || hair === 134 || hair === 146 || hair === 162 || hair === 6) return true;
  return hair > 50 && (hair < 56 || hair > 63) && (hair < 74 || hair > 77) && (hair < 88 || hair > 89)
    && hair !== 94 && hair !== 100 && hair !== 104 && hair !== 112 && hair < 116;
}

/** 随机外观（对齐 1.4.5.6 CreateCharacter：从白名单随机发型，
 *  性别由发型判定表推导（FEMALE_HAIRS），变体从对应性别列表取） */
export function randomAppearance(name = ''): Appearance {
  const a = defaultAppearance(name);
  a.hair = CHAR_CREATION_HAIRS[Math.floor(Math.random() * CHAR_CREATION_HAIRS.length)];
  const pool = FEMALE_HAIRS.has(a.hair) ? FEMALE_VARIANTS : MALE_VARIANTS;
  a.skinVariant = pool[Math.floor(Math.random() * pool.length)];
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
