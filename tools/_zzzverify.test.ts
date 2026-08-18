// ZZZ 验收探针：槽105 重放后 ⑭ 668 格 + 苔藓/苔藓块计数 vs golden
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

it('zzz verify 668 + moss counts', () => {
  const pre = `${G2}/104_Remove_Broken_Traps`;
  const c = {
    t: new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0)),
    a: new Uint8Array(readFileSync(`${pre}.act`).buffer.slice(0)),
    w: new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0)),
    l: new Uint8Array(readFileSync(`${pre}.liq`).buffer.slice(0)),
    lt: new Uint8Array(readFileSync(`${pre}.lty`).buffer.slice(0)),
    hf: new Uint8Array(readFileSync(`${pre}.half`).buffer.slice(0)),
    sl: new Uint8Array(readFileSync(`${pre}.slope`).buffer.slice(0)),
    ia: new Uint8Array(readFileSync(`${pre}.inact`).buffer.slice(0)),
  };
  const gs = JSON.parse(readFileSync(`${BDIR}/s56/gs.json`, 'utf8'));
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s56/gensolid.json`, 'utf8')));
  const fw = new Uint32Array(readFileSync(`${BDIR}/s56/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N);
  for (let q = 0; q < fw.length; q += 4) { fx[fw[q]!] = fw[q + 1]!; fy[fw[q]!] = fw[q + 2]!; }
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = c.a[i]!;
    st.type[i] = c.a[i] || c.t[i] ? (REV.get(c.t[i]!) ?? 0) : 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const rng = new RNG(9293480);
  const before = { m184: 0, m625: 0 };
  for (let i = 0; i < N; i++) {
    if (st.flags[i] && SHEET[st.type[i]!] === 184) before.m184++;
    if (st.flags[i] && SHEET[st.type[i]!] === 625) before.m625++;
  }
  runFinalCleanupPass(st, gs, rng, { frameSparse: true });
  let m184 = 0, m625 = 0;
  const cells668: string[] = [];
  for (let i = 0; i < N; i++) {
    if (st.flags[i] && SHEET[st.type[i]!] === 184) m184++;
    if (st.flags[i] && SHEET[st.type[i]!] === 625) m625++;
    if (st.flags[i] && SHEET[st.type[i]!] === 668) cells668.push(`(${i % W},${(i / W) | 0})`);
  }
  console.log(`moss184: pre=${before.m184} post=${m184} (golden105=10697)`);
  console.log(`moss625: pre=${before.m625} post=${m625} (golden105 kept≈?)`);
  console.log(`668 cells: ${cells668.join(' ')}  (golden: (1049,412) (471,479) (514,535))`);
  console.log(cells668.length === 3 && cells668.join(' ') === '(1049,412) (471,479) (514,535)'
    ? '★ ⑭ 位点全等' : '✗ ⑭ 位点不等');
});
