// 一次性诊断（IIIII101e 批）：DeadMans IsAGoodSpot 三门数值镜像——
// 定位 [1983,859] 分类翻转（JS good / x86 not-good）落在哪扇门。
// 基座=IIIII101e CAP@微群系槽头（/tmp/iii131-out/base_*.bin，与 G2 #096 八通道全零）。
// 用法：cd game && npx vitest run tools/_iii131isg.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { countTiles, countWires } from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';

const OUT = process.env.SW_I121_OUT ?? '/tmp/iii131-out';
const W = Number(process.env.SW_I118_W ?? 4200), H = Number(process.env.SW_I118_H ?? 1200);
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

const CHANS2 = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS2) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  return { st };
}

it('ISG gate mirror over DM candidate heads', () => {
  const { st } = hydrate();
  // 全枚举 sink 里出现在两侧 CHEST 行上的"金箱候选面"坐标（本批对账焦点）
  const spots: Array<[number, number]> = [
    [3941, 599], [275, 825], [1465, 790], [112, 674], [4123, 702], [1983, 859],
    [852, 950], [2137, 564], [2096, 889], [2749, 907], [699, 729], [4112, 615],
    [1797, 827], [2192, 574], [855, 950], [3361, 882], [4008, 599], [4121, 614],
    [2113, 677], [1127, 448], [347, 556],
  ];
  const gsLike = { worldSurface: 337, rockLevel: 499, beachDistance: 380 } as never;
  void gsLike;
  for (const [x, y] of spots) {
    const idx = st.idx(x, y);
    const below = st.idx(x, y + 2);
    const belowSheet = SHEET_OF[st.type[below]!];
    const cbClear = !NOT_CLEARABLE.has(st.type[below]);
    const cw = countWires(st, x, y, 20);
    const ct = countTiles(st, x, y);
    console.log(`ISGM ${x},${y} t=${SHEET_OF[st.type[idx]!]} fx=${st.frameX[idx]} fy=${st.frameY[idx]} act=${st.flags[idx] & 1} | cb=${belowSheet}(${cbClear ? 1 : 0}) cw=${cw} ct=${ct}`);
  }
}, 120_000);
