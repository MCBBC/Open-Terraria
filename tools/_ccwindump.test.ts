// 一次性（II 批 #98）：JS pass-98 末同窗口网格 dump → 与 vanilla ccwin.* diff。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { runCactusPalmTreesAndCoralPass } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
const load = (e: string) => readFileSync(`/tmp/sw-num4/van_x86_g/097_Settle_Liquids_Again.${e}`);
function buildStore(): TileStore {
  const t = new Uint16Array(load('typ').buffer.slice(0));
  const a = load('act');
  const w = new Uint16Array(load('wal').buffer.slice(0));
  const l = load('liq');
  const half = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.half').buffer.slice(0));
  const slope = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.slope').buffer.slice(0));
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  st.slope.set(slope);
  st.half.set(half);
  return st;
}

(RUN ? it : it.skip)('js pass-98 window dump', () => {
  const gs = JSON.parse(readFileSync('/tmp/sw-ddfin-js/cap.json', 'utf8')) as GenState;
  const st = buildStore();
  const rng = new RNG(gs.seed);
  runCactusPalmTreesAndCoralPass(st, rng, gs);
  const [x0, y0, w, h] = [2770, 230, 191, 71];
  const typ = Buffer.alloc(w * h * 2), act = Buffer.alloc(w * h), fx = Buffer.alloc(w * h * 2), liq = Buffer.alloc(w * h);
  let i = 0;
  for (let x = x0; x <= x0 + w - 1; x++) {
    for (let y = y0; y <= y0 + h - 1; y++) {
      const k = st.idx(x, y);
      const ty = st.flags[k] ? SHEET[st.type[k]]! : 0;
      typ.writeUInt16LE(ty & 0xFFFF, i * 2);
      act[i] = st.flags[k] ? 1 : 0;
      fx.writeInt16LE(st.frameX[k] ?? 0, i * 2);
      liq[i] = st.liquid[k]!;
      i++;
    }
  }
  writeFileSync('/tmp/sw-ddfin-js/ccwin.typ', typ);
  writeFileSync('/tmp/sw-ddfin-js/ccwin.act', act);
  writeFileSync('/tmp/sw-ddfin-js/ccwin.fx', fx);
  writeFileSync('/tmp/sw-ddfin-js/ccwin.liq', liq);
  // diff
  for (const f of ['typ', 'act', 'fx', 'liq'] as const) {
    const v = readFileSync(`/tmp/sw-ddfin/ccwin.${f}`);
    const j = readFileSync(`/tmp/sw-ddfin-js/ccwin.${f}`);
    let n = 0;
    const samples: string[] = [];
    for (let q = 0; q < v.length; q++) {
      if (v[q] === j[q]) continue;
      n++;
      const cell = q / (f === 'typ' || f === 'fx' ? 2 : 1) | 0;
      const x = x0 + (cell / h | 0), y = y0 + (cell % h);
      if (samples.length < 12) samples.push(`(${x},${y}) v=${v[q]} js=${j[q]}`);
    }
    console.log(`${f}: ${n} diff bytes`, samples.join(' '));
  }
}, 240000);
