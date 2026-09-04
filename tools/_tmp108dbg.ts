import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } })?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const S2I = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = SHEET[i]!; if (s >= 0 && !S2I.has(s)) S2I.set(s, i); }
const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const act = readFileSync(G2 + '/039_Clean_Up_Dirt.act');
const typ = le16(G2 + '/039_Clean_Up_Dirt.typ');
const W = 4200, N = W * 1200;
const kinds = new Map<string, number>();
for (let i = 0; i < N; i++) {
  if (!act[i]) continue;
  const sh = typ[i]!;
  const tI = sh === 0 ? 0 : S2I.get(sh);
  const back = tI === undefined ? -99 : SHEET[tI]!;
  if (back !== sh) { const k = `sheet ${sh} -> internal ${tI} -> back ${back}`; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
}
console.log('mismatch kinds:', [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
console.log('total mismatches:', [...kinds.values()].reduce((a, b) => a + b, 0));
