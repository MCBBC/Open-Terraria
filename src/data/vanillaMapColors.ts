// 原版地图色全表运行时（tools/extract-mapcolors.mjs 从 MapHelper.cs Initialize 提取）。
// 原版地图模型（MapHelper.cs）：活性 tile → array[type][option]；无 tile 有液体 →
// liquids[type]（0水1岩浆2蜂蜜3微光）；无 tile 无液体有墙 → wallLookup[wall]；
// 全空 → 背景（y<worldSurface 天空渐变 lerp((50,40,255)→(145,185,255), j/worldSurface)；
// 世界面~岩石层 土层底色 (88,61,46)；岩石层以下 石层底色 (74,67,60)；雪原时向
// 蓝白雪色 lerp（snowiness 通道，此处取 0）。
import mapJson from './vanilla-mapcolors.json';

const DOC = mapJson as {
  tiles: Record<string, number[][]>;
  walls: Record<string, number[][]>;
  liquids: number[][];
  sky: { from: number[]; to: number[] };
};

/** 原版 tile sheet id → 地图色（option 0；无条目 null=原版不画） */
export function vanillaTileMapColor(sheet: number): number[] | null {
  const e = DOC.tiles[String(sheet)];
  return e?.[0] ?? null;
}

/** 原版 wall id → 地图色（option 0；无条目 null=原版不画该墙） */
export function vanillaWallMapColor(wallId: number): number[] | null {
  const e = DOC.walls[String(wallId)];
  return e?.[0] ?? null;
}

/** 液体色（索引：0水 1岩浆 2蜂蜜 3微光——MapHelper array3 :1271） */
export function vanillaLiquidColor(idx: number): number[] {
  return DOC.liquids[idx] ?? DOC.liquids[0];
}

/** 天空渐变（CalcSkyGradient :2067：index = 255 × j/worldSurface，端点 lerp） */
export function vanillaSkyColor(j: number, worldSurface: number): number[] {
  const t = Math.max(0, Math.min(1, worldSurface > 0 ? j / worldSurface : 0));
  const { from, to } = DOC.sky;
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

/** 土层背景底色（array6[0]，snowiness=0）与石层背景底色（array7[0]） */
export const VANILLA_DIRT_BG = [88, 61, 46];
export const VANILLA_ROCK_BG = [74, 67, 60];
