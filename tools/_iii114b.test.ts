// IIII99d：残差簇逐格读数仪（只读）。
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const CAP = process.env.SW_I89_OUT ?? '/tmp/iii99-out/cap-rainbow';
const G2 = process.env.SW_I89_G2 ?? '/tmp/iii80-out/x86-rainbow';
const CMP_IDX = Number(process.env.WIN_CMP ?? 32);
const W = 4200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV: Record<number, string> = {};
for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] >= 0) REV[SHEET[i]] = `${TILE_DEFS[i].name}#${i}`;
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor((o.d ?? []).length) as Uint8Array & { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
const BOXES: Array<[string, number, number, number, number]> = [
  ['A-first', 908, 216, 916, 208],
  ['A-233', 871, 240, 879, 230],
  ['A-281', 912, 288, 922, 278],
  ['T-550', 805, 556, 815, 546],
  ['T-661', 875, 668, 886, 657],
  ['B-trio', 688, 712, 700, 698],
  ['G-874', 868, 568, 881, 555],
];
(RUN ? it : it.skip)(`IIII99d rainbow #33 cell-readout`, () => {
  const hdr = JSON.parse(readFileSync(`${CAP}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const buf = readFileSync(`${CAP}/base_${c}.bin`);
    const per = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (per === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, buf.length / per));
  }
  const gs = desVal(JSON.parse(readFileSync(`${CAP}/base_gs.json`, 'utf8'))) as GenState;
  try { dualSnakes.length = 0; } catch { /* non-dual */ }
  void runDualDungeonsDitherSnakePass;
  const NAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) NAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${NAME.get(CMP_IDX)}`;
  const xt = new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0));
  const xa = readFileSync(`${pre}.act`);
  const xfX = existsSync(`${pre}.frx`) ? new Uint16Array(readFileSync(`${pre}.frx`).buffer.slice(0)) : null;
  runDungeonPass(st, new RNG(gs.seed), gs, [] as never);
  for (const [tag, x0, y1, x1, y0] of BOXES) {
    console.log(`=== ${tag} (x${x0}..${x1}, y${y0}..${y1}) ===`);
    for (let y = y0; y <= y1; y++) {
      let row = `y${y}: `;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const va = xa[i]!, ja = st.flags[i]! & 1;
        const vt = va ? xt[i]! : -1;
        const jt = ja ? SHEET[st.type[i]!] : -1;
        if (va === ja && vt === jt) { row += '.'; continue; }
        row += ` [${x},${y}]X=${va ? `a${vt}` : '-'}/J=${ja ? `${jt}${REV[jt] !== undefined ? '(' + REV[jt] + ')' : ''}` : '-'} fX:${xfX ? xfX[i] : '-'}/${ja ? st.frameX[i] : '-'} w${st.wall[i]}`;
      }
      if (!row.endsWith(': ')) console.log(row);
    }
  }
}, 600_000);
