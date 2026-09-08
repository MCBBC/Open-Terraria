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

/** 原版 tile sheet id → 指定 option 地图色（缺条目/越界 null）——★IIIII223 F-3
 *  184 长苔 frameX/22==10 → 627 换色支用（MapHelper.cs GetTileBaseOption
 *  :2105-2108：`case 160/627/628/692: baseOption = (x + y) % 9` 九档彩移） */
export function vanillaTileMapColorOption(sheet: number, option: number): number[] | null {
  return DOC.tiles[String(sheet)]?.[option] ?? null;
}

/** 原版墙域上界（WallID.Count=367，WallID.cs:803；原版墙 id 域 0..366） */
export const VANILLA_WALL_COUNT = 367;

/** ★IIIII223 F-2：wallLookup=0 哨兵集（MapHelper.cs Initialize :1737-1754——
 *  wallOptionCounts[wall]==0 ⇒ wallLookup[wall]=0 ⇒ GetWallType baseType=0 ⇒
 *  CreateMapTile :1913-1917 落穿背景）。原版墙域内无色表条目者=玻璃族
 *  （21 玻璃/88-93 染色玻璃/168 彩带/241 橙染色/318 回声）：GetWallType :2003
 *  取色即得 0，:2005-2015 的 newColor=0 switch 系同域 belt-and-braces（218 批曾把
 *  该集误读为「不吃漆墙族」，实为玻璃族不上图）。原版地图玻璃墙不画——JS 三路径
 *  （MapColors.mapColor24 / Renderer.colorFor / Renderer.fillBand+ensureLUT）同构
 *  落穿液体/背景；WALL_DEFS.mapColor 兜底只保留给原版墙域外的自研墙。
 *  从 JSON 缺口派生 = extract-mapcolors 重产自动跟随 */
export const VANILLA_WALL_LOOKUP0: ReadonlySet<number> = (() => {
  const s = new Set<number>();
  for (let id = 1; id < VANILLA_WALL_COUNT; id++) if (!DOC.walls[String(id)]) s.add(id);
  return s;
})();

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
