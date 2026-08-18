// CCCC 批·诊断⑤:(1129,537) 逐门测量 + countTiles 修正版对照。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '5';

(itIs ? it : it.skip)('cccc gate measure', async () => {
  const gt = b16(100, 'typ'), ga = b8(100, 'act'), gw = b16(100, 'wal'), gl = b8(100, 'liq');
  const ghf = b8(100, 'half'), gsl = b8(100, 'slope'), glt = b8(100, 'lty'), gia = b8(100, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chestList = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as Array<{ x: number; y: number }>;

  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw[i]!; st.liquid[i] = gl[i]!;
    st.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st.half[i] = ghf[i]!; st.slope[i] = gsl[i]!;
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);

  // 修正版 countTiles(SolidTile 1:1):active && genSolid && !solidTop && !half && slope==0 && !inAct
  const solidTopTable = (t: number): boolean => !!TILE_DEFS[t]?.platform;
  const solidTileVan = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return true;
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && vanGenSolidType(st.type[i]!) && !solidTopTable(st.type[i]!)
      && st.half[i] === 0 && st.slope[i] === 0 && !(st.wire[i]! & 0x20);
  };
  const MAX = 3500;
  function countTilesVan(x0: number, y0: number): number {
    let count = 0;
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[x0, y0]];
    while (stack.length > 0) {
      if (count >= MAX) return count;
      const [x, y] = stack.pop()!;
      if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) return MAX;
      const k = y * W + x;
      if (seen.has(k)) continue;
      seen.add(k);
      const i = st.idx(x, y);
      if (st.wall[i] === 244) return MAX;
      if (st.liquid[i] > 0 && st.liquidType[i] === 4) return MAX;
      if (st.wall[i] !== 0) return MAX;
      if (!solidTileVan(x, y)) { count++; stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]); }
    }
    return count;
  }

  const dmc = new DeadMansChestBiome(st, new RNG(SEED), gs, chestList);
  void dmc;
  const solidTileStrictJS = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    const d = TILE_DEFS[st.type[i]];
    return st.flags[i] !== 0 && !!d?.solid && !d.platform && st.half[i] === 0 && st.slope[i] === 0;
  };
  const countWiresJS = (x: number, y: number, size: number): number => {
    let n = 0;
    for (let i = x - size; i <= x + size; i++) {
      for (let j = y - size; j <= y + size; j++) {
        if (!st.inBounds(i, j)) continue;
        const b = st.wire[st.idx(i, j)]! & 15;
        n += (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
      }
    }
    return n;
  };
  function countTilesJS(x0: number, y0: number): number {
    let count = 0;
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[x0, y0]];
    while (stack.length > 0) {
      if (count >= MAX) return count;
      const [x, y] = stack.pop()!;
      if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) return MAX;
      const k = y * W + x;
      if (seen.has(k)) continue;
      seen.add(k);
      const i = st.idx(x, y);
      if (st.wall[i] === 244) return MAX;
      if (st.liquid[i]! > 0 && st.liquidType[i] === 4) return MAX;
      if (st.wall[i] !== 0) return MAX;
      if (!solidTileStrictJS(x, y)) { count++; stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]); }
    }
    return count;
  }
  for (const [x, y] of [[1129, 537], [1546, 552]] as Array<[number, number]>) {
    const i = st.idx(x, y);
    const below = st.idx(x, y + 2);
    console.log(`\n== (${x},${y})`);
    console.log(`   type=${TILE_DEFS[st.type[i]!]?.key} fx=${st.frameX[i]} fy=${st.frameY[i]} | below(y+2) type=${TILE_DEFS[st.type[below]!]?.key} notClearable=${NOT_CLEARABLE.has(st.type[below]!)}`);
    console.log(`   countWires(±20)=${countWiresJS(x, y, 20)} | countTiles(JS现行)=${countTilesJS(x, y)} | countTiles(修正SolidTile)=${countTilesVan(x, y)}`);
  }
  // 修正版全候选重扫:哪些箱子过/不过
  const pass: Array<[number, number]> = [];
  for (const c of chestList) {
    if (!st.inBounds(c.x, c.y)) continue;
    if (countTilesVan(c.x, c.y) < 40) continue;
    pass.push([c.x, c.y]);
  }
  console.log(`\ncountTiles修正版 ≥40 的箱子数=${pass.length}`);
  const i1129 = pass.findIndex(c => c[0] === 1129 && c[1] === 537);
  const i1546 = pass.findIndex(c => c[0] === 1546 && c[1] === 552);
  console.log(`(1129,537) 在修正版 flood 候选中的位置=${i1129};(1546,552)=${i1546}`);
  // (1129,537) 周边实心差异格(JS 现行判实心 vs 修正判非实心)——找 inActive/half 类
  let inactNear = 0, halfNear = 0;
  for (let dx = -20; dx <= 20; dx++) for (let dy = -20; dy <= 20; dy++) {
    const px = 1129 + dx, py = 537 + dy;
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    if (!st.flags[i]) continue;
    if (st.wire[i]! & 0x20) inactNear++;
    if (st.half[i]) halfNear++;
  }
  console.log(`(1129,537) ±20 内 inActive 格=${inactNear}, halfBrick 格=${halfNear}`);
  __setGenStateForProbe(null);
}, 300_000);
