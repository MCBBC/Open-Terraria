// SW-FX33（2026-09-11）：tileFrameImportant 位图金标 + tile 753 导出勘误守卫。
// 金标提取（2026-09-11，逐行亲读）：Terarria1457/Terraria/Main.cs 三类赋值——
//   ① `tileFrameImportant[n] = true;` 数字直写 403 行（唯一 id 398）；
//   ② 循环 Main.cs:10125-10134 `for (num2 = 435; num2 <= 439; ...)`（团队平台五件）；
//   ③ AddEchoFurnitureTile 调用 Main.cs:8551-8559（Echo 家族九件，:8565-8570 置位）。
// 合计唯一 412 id（下 :GOLDEN_IDS）。全仓仅此三处写点（全树 grep：其余全为读侧）；
// 对拍 public/sprites/vanilla.json tiles[x].framed：唯一分歧 = 753（Giant Tiki，
// Main.cs:9950 置 true 而 json 写 false——json 侧债另行登记）。
// 危害链（缺失本勘误时）：FileFormatHeader 位图 753 位写 0 + encodeTiles 对 753 活格
// 不写 frameX/frameY 4 字节 → 原版 LoadWorldTiles 按位图消费帧数据 → 该格起全流错位
// → BadSectionPointer（WF:996-1012 段指针断言）整档拒载。
import { describe, it, expect } from 'vitest';
import { exportWld } from '../src/wld/WldExport';
import { parseWld } from '../src/wld/WldParser';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { TILE_STABLE_OF_INTERNAL, TILE_DEFS } from '../src/data/tiles';

// ---- 金标 412 id（源与提取法见文件头；禁无锚增删）----
const GOLDEN_IDS: number[] = [
  3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 24, 26, 27, 28, 29, 31, 33, 34, 35, 36, 42, 49, 50,
  55, 61, 71, 72, 73, 74, 77, 78, 79, 81, 82, 83, 84, 85,
  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  100, 101, 102, 103, 104, 105, 106, 110, 113, 114, 125, 126, 128, 129,
  132, 133, 134, 135, 136, 137, 138, 139, 141, 142, 143, 144, 149, 165,
  171, 172, 173, 174, 178, 184, 185, 186, 187, 201, 207, 209, 210, 212,
  215, 216, 217, 218, 219, 220, 227, 228, 231, 233, 235, 236, 237, 238,
  239, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 275,
  276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290,
  291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304,
  305, 306, 307, 308, 309, 310, 314, 316, 317, 318, 319, 320, 323, 324,
  334, 335, 337, 338, 339, 349, 354, 355, 356, 358, 359, 360, 361, 362,
  363, 364, 372, 373, 374, 375, 376, 377, 378, 380, 386, 387, 388, 389,
  390, 391, 392, 393, 394, 395, 405, 406, 410, 411, 412, 413, 414, 419,
  420, 423, 424, 425, 427, 428, 429, 435, 436, 437, 438, 439, 440, 441,
  442, 443, 444, 445, 452, 453, 454, 455, 456, 457, 461, 462, 463, 464,
  465, 466, 467, 468, 469, 470, 471, 475, 476, 480, 484, 485, 486, 487,
  488, 489, 490, 491, 493, 494, 497, 499, 505, 506, 509, 510, 511, 518,
  519, 520, 521, 522, 523, 524, 525, 526, 527, 529, 530, 531, 532, 533,
  538, 542, 543, 544, 545, 547, 548, 549, 550, 551, 552, 553, 554, 555,
  556, 558, 559, 560, 564, 565, 567, 568, 569, 570, 571, 572, 573, 579,
  580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593,
  594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607,
  608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 619, 620, 621, 622,
  623, 624, 629, 630, 631, 632, 634, 637, 639, 640, 642, 643, 644, 645,
  646, 647, 648, 649, 650, 651, 652, 653, 654, 656, 657, 658, 660, 663,
  664, 665, 693, 694, 695, 696, 698, 699, 700, 701, 702, 703, 704, 705,
  706, 707, 709, 710, 711, 712, 713, 714, 715, 716, 720, 721, 723, 724,
  725, 726, 733, 751, 752, 753,
];

const W = 24, H = 20;

/** 最小 SaveData 夹具（仅 header/tiles 域——本测试只看 FileFormatHeader 与 tiles 流） */
function mkSave(type?: Uint16Array, frameX?: Uint16Array, frameY?: Uint16Array): SaveData {
  const n = W * H;
  const t = type ?? new Uint16Array(n);
  const fx = frameX ?? new Uint16Array(n);
  const fy = frameY ?? new Uint16Array(n);
  return {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: 'FI金标', seed: 1, width: W, height: H,
      spawn: [10, 10], groundLevel: 10, rockLevel: 14,
      crimson: false, dungeonX: 2, dungeonY: 8,
      treeX: [5, 10, 15], treeStyle: [0, 0, 0, 0],
      created: 1700000000000, playTimeMs: 0, moonType: 0, difficulty: 0,
      bgStyles: { cave: [0, 0, 0, 0], ice: 0, jungle: 0, hell: 0, mushroom: 0, underworld: 0, bg10: 0, bg11: 0, bg12: 0, forest: [0, 0, 0], desert: 0, ocean: 0, corrupt: 0, snow: 0, hallow: 0, crimson: 0 },
    },
    clock: { timeOfDay: 0.25, dayCount: 1, moonPhase: 0, bloodMoon: false, eclipse: false },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type: t, frameX: fx, frameY: fy }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(new Uint16Array(n))),
    liquid: bytesToB64(rlePairs(new Uint16Array(n))),
    liquidType: bytesToB64(rlePairs(new Uint8Array(n))),
    wire: bytesToB64(rlePairs(new Uint16Array(n))),
    blocks: bytesToB64(rlePairs(new Uint8Array(n))),
    paint: bytesToB64(rlePairs(new Uint8Array(n))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(n))),
    coat: bytesToB64(rlePairs(new Uint8Array(n))),
    chests: [], signs: [], npcs: [], flags: {},
  } as unknown as SaveData;
}

/** 导出流 FileFormatHeader 的 tileFrameImportant 位图（原版 WF:1188-1210：u16 count 后
 *  LSB-first 位流，754 位 → 95 字节；起点 = 4(i32 325)+20(meta)+2(short 11)+44(11×i32)
 *  +2(u16 count) = 72） */
function readBitmap(bytes: Uint8Array): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < 754; i++) {
    out.push(((bytes[72 + (i >> 3)] >> (i & 7)) & 1) !== 0);
  }
  return out;
}

/** v_753_gianttiki 稳定 id = TILE_DEFS 中 vanilla.sheet===753 的下标（SaveData tiles 域） */
const STABLE_753 = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 753);

describe('SW-FX33 tileFrameImportant 金标（Main.cs 412 id）', () => {
  it('导出位图与反编译金标 754 位全等（多一位/少一位/错位皆红）', () => {
    const bitmap = readBitmap(exportWld(mkSave()));
    const got = bitmap.reduce<number[]>((a, b, i) => (b ? [...a, i] : a), []);
    expect(got).toEqual(GOLDEN_IDS);
    expect(new Set(GOLDEN_IDS).size).toBe(412);   // 金标自检：列表无重复
  });

  it('tile 753（Giant Tiki,Main.cs:9950）位图位=1', () => {
    const bitmap = readBitmap(exportWld(mkSave()));
    expect(bitmap[753]).toBe(true);   // byte 94 bit 1（LSB-first）
  });

  it('753 活格导出带 4 字节帧数据（tiles 流字节级）', () => {
    expect(STABLE_753).toBeGreaterThan(0);   // 注册表自检
    const n = W * H;
    const type = new Uint16Array(n), fx = new Uint16Array(n), fy = new Uint16Array(n);
    const at = 5 * W + 3;   // (x=3,y=5)
    type[at] = STABLE_753; fx[at] = 36; fy[at] = 54;
    const bytes = exportWld(mkSave(type, fx, fy));
    // 单一活格编码确定：header1 = 0x22（active|type>255）、type lo=753&0xff=0xF1、
    // hi=0x02、帧对 (36,0)(54,0)。段内必现完整 7 字节序（缺勘误时无帧对 → 红）。
    const needle = [0x22, 753 & 0xff, (753 >> 8) & 0xff, 36, 0, 54, 0];
    let hit = false;
    outer: for (let i = 72 + 95; i < bytes.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      hit = true;
      break;
    }
    expect(hit).toBe(true);
  });

  it('753 格回环：parseWld 读回 type/帧值保真（位图位与帧字节双修复缺一即红）', () => {
    const n = W * H;
    const type = new Uint16Array(n), fx = new Uint16Array(n), fy = new Uint16Array(n);
    const at = 5 * W + 3;
    type[at] = STABLE_753; fx[at] = 36; fy[at] = 54;
    const wld = parseWld(exportWld(mkSave(type, fx, fy)));
    expect(wld.tiles.type[at]).toBe(753);   // sheet 域直读
    expect(wld.tiles.frameX[at]).toBe(36);
    expect(wld.tiles.frameY[at]).toBe(54);
    // 后续格不错位：下一格 (x=3,y=6) 仍是空气（错位时残留帧/类型字节会污染）
    expect(wld.tiles.type[at + W]).toBe(0);
    expect(wld.tiles.active[at + W]).toBe(0);
  });
});
