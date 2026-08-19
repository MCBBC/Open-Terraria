// YYYY 诊断②d：两侧金字塔 carve 掩膜 ASCII（045 时点）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
const G2 = '/tmp/sw-slp/g-s22222';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
it('carve masks ascii', async () => {
  const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const g45t = le16(`${G2}/045_Wet_Jungle.typ`), g45a = readFileSync(`${G2}/045_Wet_Jungle.act`);
  const g39t = le16(`${G2}/039_Clean_Up_Dirt.typ`), g39a = readFileSync(`${G2}/039_Clean_Up_Dirt.act`);
  let st: { type: Uint16Array; flags: Uint8Array; w: number; h: number } | null = null;
  let snapT: Uint16Array | null = null, snapA: Uint8Array | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const wgSrc = readFileSync('src/world/gen/WorldGen.ts', 'utf8').split('\n');
  RNGp.reseed = function (this: unknown, s: number) {
    if (st && !snapT) {
      const m = (new Error().stack ?? '').match(/WorldGen\.ts:(\d+):/);
      if (m) for (let l = Number(m[1]) - 1; l >= Number(m[1]) - 4; l--) {
        if (wgSrc[l]?.includes('▶LihzahrdTemple')) { snapT = Uint16Array.from(st.type); snapA = Uint8Array.from(st.flags); break; }
      }
    }
    return oReseed.call(this, s);
  };
  try { await generateWorld({ width: W, height: H, seedText: '22222', evil: 1, onWorldPartial: (w) => { if (!st) st = w.store as never; } }); }
  finally { RNGp.reseed = oReseed; }
  const jS = new Int16Array(N); for (let i = 0; i < N; i++) jS[i] = SHEET[snapT![i]!]!;
  // carve 掩膜：039 活性非沙岩砖 → 045 非活性（被掏）或 045 仍活性但类型变
  const carve = (act0: Uint8Array, typ0: Uint16Array, act1: Uint8Array, typ1: Uint16Array) => (i: number) =>
    (act0[i]! === 1 && typ0[i] !== 151 && act1[i]! === 0) || (act0[i]! === 1 && typ0[i] !== 151 && typ1[i] === 53);
  const vc = carve(g39a, g39t, g45a, g45t), jc = carve(g39a, g39t, snapA!, snapT!);
  console.log('图例: V=vanilla掏 J=JS掏 B=两侧都掏 .=都没掏（列2690-2760，行237-300）');
  let hdr = '      ';
  for (let x = 2690; x <= 2760; x += 10) hdr += String(x).padStart(10).slice(-10).replace(/./g, (c, i) => (i === 0 ? '|' : ' '));
  console.log(hdr);
  for (let y = 237; y <= 300; y++) {
    let row = `${String(y).padStart(5)} `;
    for (let x = 2690; x <= 2760; x++) {
      const i = y * W + x;
      const v = vc(i), j = jc(i);
      row += v && j ? 'B' : v ? 'V' : j ? 'J' : '.';
    }
    console.log(row);
  }
}, 600_000);
