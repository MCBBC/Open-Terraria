// IIII67b 批一次性诊断脚本：导出 pass#53 时点谓词表（python 模拟器用），stdout JSON。
// 运行：SW_III67T=1 npx vitest run tools/_iii67tables.test.ts （stdout 重定向收 JSON）
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { resetGenSolid, flipGenSolid, genSolidType } from '../src/world/gen/vanilla/GenSolid';
import { NOT_CLEARABLE, idsByVanillaSheet } from '../src/world/gen/vanilla/TileRunner';

const dump = () => {
  resetGenSolid();
  // Pass#53 时点的生成期翻转态（GenSolid.ts 时间线：截至 cs:16510 头）
  flipGenSolid([137], false);          // JungleShrines 尾 cs:16212
  flipGenSolid([192], true);           // RemoveSurfaceWaterAboveSand cs:16324（窗口到 16694）
  flipGenSolid([481, 482, 483], true); // SmoothWorld 头 cs:16510
  const maxT = TILE_DEFS.length;
  const solidArr: number[] = [];
  const platArr: number[] = [];
  const framedArr: number[] = [];
  for (let t = 0; t < maxT; t++) {
    const d = TILE_DEFS[t];
    solidArr.push(genSolidType(t) ? 1 : 0);
    platArr.push(d?.platform ? 1 : 0);
    framedArr.push(d?.framed ? 1 : 0);
  }
  const sheets: number[] = new Array(maxT).fill(-1);
  for (let t = 0; t < maxT; t++) {
    const s = (TILE_DEFS[t] as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
    if (typeof s === 'number') sheets[t] = s;
  }
  const pick = (arr: readonly number[]) => arr;
  console.log(JSON.stringify({
    maxT,
    solid: solidArr,
    platform: platArr,
    framed: framedArr,
    sheetOf: sheets,
    notClearable: Array.from(NOT_CLEARABLE),
    prevents: [48, 137, 232, 191, 151, 274, 135, 442, 428],
    forbids: [21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597],
    boulders: [138, 484, 664, 665, 711, 712, 713, 714, 715, 716],
    trunk: [5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634],
    loopBSkip: [137, 48, 232, 191, 151, 274, 75, 76],
    noFillSide: [190, 48, 232],
    sand: [53, 112, 116, 234],
    switch136: [136],
    shell495: [495],
    placeRefuse: pick(Array.from(idsByVanillaSheet(
      2, 23, 60, 70, 109, 199, 633, 661, 662,
      179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627))),
    poundBlacklist: [10, 48, 137, 232, 380, 387, 388, 476, 484],
    poundGenSkip: [190, 30],
  }));
};
(process.env.SW_III67T === '1' ? it : it.skip)('iii67 tables dump', () => { dump(); });
