// IIIII113b 一次性仪：winter #97 MINE attempt#46 (origin 1018,990) 门级重演。
// hydrate CAP 基座(capture @微群系 pass head) → 重建到 attempt#46 的受保护矩形态
// （头部 89 + 本 pass 已受理事件按族补加）→ 逐门重演 placeMiningExplosives 的
// 门序（MS1 solid / MS2 wall / SelectRandom+dir / rl+Down 搜索 / shape 比例门 /
// canPlace 交矩形+内容扫描），并输出每门的实判值。
// 用法：cd game && SW_I113MB=1 npx vitest run tools/_iii113mb46.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { canPlaceStructure, GENERAL_PLACEMENT_FORBID } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I113MB === '1';
const OUT = process.env.SW_I113MB_OUT ?? '/tmp/iii113b-out/cap-winmb';
const W = 4200, H = 1200;

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as GenState;
  return { st, gs };
}

(RUN ? it : it.skip)('mine attempt 46 gate replay', () => {
  const { st, gs } = hydrate();
  const OX = Number(process.env.SW_I113MB_X ?? 1018), OY = Number(process.env.SW_I113MB_Y ?? 990);
  const log: string[] = [];
  const solidTileStrict = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const t = st.type[i]!;
    // mbTileSolidGen: active && tileSolid 直读（sheet 0 alias 按实心）
    const sh = SHEET_OF[t];
    return sh === 0 ? true : TILE_DEFS[t]?.solid === true;
  };
  // MS1
  log.push(`MS1 SolidTile(${OX},${OY}) = ${solidTileStrict(OX, OY)} (tile sheet=${SHEET_OF[st.type[st.idx(OX, OY)]!]} flags=${st.flags[st.idx(OX, OY)]})`);
  // MS2
  const wl = st.wall[st.idx(OX, OY)]!;
  log.push(`MS2 wall(${OX},${OY}) = ${wl} (216/187 门禁=${wl === 216 || wl === 187})`);
  // rl + Down 搜索（ Conditions.IsSolid 直读 tileSolid）
  const condIsSolid = (x: number, y: number): boolean => {
    if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sh = SHEET_OF[st.type[i]!];
    return sh === 0 ? true : TILE_DEFS[st.type[i]!]?.solid === true;
  };
  for (const step of [-1, 1]) {
    let hit = -1;
    for (let k = 0; k < 40; k++) if (condIsSolid(OX + k * step, OY)) { hit = k; break; }
    log.push(`MS3 dir=${step > 0 ? 'Right' : 'Left'} firstSolid k=${hit}${hit >= 0 ? ` -> (${OX + hit * step},${OY})` : ''}`);
  }
  const anchorX = OX - 13; // JS 实测 dir<0 k=13
  let dhit = -1;
  for (let k = 0; k < 80; k++) if (condIsSolid(anchorX, OY + k)) { dhit = k; break; }
  log.push(`MS4 Down from (${anchorX},${OY}) firstSolid k=${dhit} -> anchor=(${anchorX},${OY + dhit})`);
  const AX = anchorX, AY = OY + dhit;
  const area = { x0: AX - 15, y0: AY - 10, x1: AX + 15, y1: AY + 10 };
  log.push(`area = (${area.x0}..${area.x1}, ${area.y0}..${area.y1})`);
  // 内容扫描（canPlace 第③门）
  const bad: string[] = [];
  for (let x = area.x0; x < area.x1; x++) {
    for (let y = area.y0; y < area.y1; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && GENERAL_PLACEMENT_FORBID.has(st.type[i]!)) bad.push(`(${x},${y}) sheet=${SHEET_OF[st.type[i]!]} key=${TILE_DEFS[st.type[i]!]?.key}`);
    }
  }
  log.push(`内容扫描: 违禁 tile = ${bad.length ? bad.join(' ') : '无'}`);
  // 受保护矩形：头部 89 + 本 pass 已受理 camp (979,971) num=8 pad4
  const rects = gs.protectedRects.map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
  const campRect = { x0: 979 - 8 - 4, y0: 971 - 8 - 4, x1: 979 + 8 + 4, y1: 971 + 8 + 4 };
  rects.push(campRect);
  log.push(`camp(979,971,num=8,pad4) rect = (${campRect.x0}..${campRect.x1}, ${campRect.y0}..${campRect.y1})`);
  const hits = rects.filter((r) => area.x0 < r.x1 && r.x0 < area.x1 && area.y0 < r.y1 && r.y0 < area.y1);
  log.push(`与 area 相交的保护矩形: ${hits.length ? JSON.stringify(hits) : '无'}`);
  log.push(`canPlaceStructure(默认态) = ${canPlaceStructure(gs, area, 0, st)}`);
  log.push(`canPlaceStructure(+camp rect) = ${canPlaceStructure(gs, area, 0, st) && hits.length === 0}`);
  // 就近 camp 事件：js-seg 中 CAMP (979,971) ok=1 @rc=88132（先于本 attempt rc=110894）
  console.log(log.join('\n'));
  void existsSync;
}, 120_000);
