// 一次性:JS 侧 SmoothWorld 动作追踪 vs vanilla swtrace.log 对拍——首条分叉即移植差根因。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const TV = '/tmp/sw-hsv';
const W = 4200, H = 1200, N = W * H;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

function streamHashOf(ur: UnifiedRandom): string {
  const sac = (ur as unknown as { seedArray: Int32Array; inext: number });
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < sac.seedArray.length; i++) {
    const v = sac.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = sac.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}

(RUN ? it : it.skip)('SmoothWorld action trace vs vanilla', async () => {
  const t52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.typ`).buffer.slice(0));
  const a52 = readFileSync(`${VG}/052_Shell_Piles.act`);
  const w52 = new Uint16Array(readFileSync(`${VG}/052_Shell_Piles.wal`).buffer.slice(0));
  const l52 = readFileSync(`${VG}/052_Shell_Piles.liq`);
  const half = rd(`${TV}/hs52.half`), slope = rd(`${TV}/hs52.slope`), lty = rd(`${TV}/hs52.lty`);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t52[i]!) ?? 0;
    st.flags[i] = a52[i] ? 1 : 0;
    st.wall[i] = w52[i]!;
    st.liquid[i] = l52[i]!;
    st.liquidType[i] = lty[i];
    st.half[i] = half[i]; st.slope[i] = slope[i];
  }
  const rng = new RNG(9293480);
  // #53 入口 GenSolid 时点态（cs:12537 484=f / cs:16212 137=f / cs:16324 192=T /
  // cs:11500 659=f;481-483 数据预翻）——隔离重放必须还原,否则 137 等实心门漂移
  const { resetGenSolid, flipGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  resetGenSolid();
  flipGenSolid([484, 137, 659], false);
  flipGenSolid([192], true);
  const ur = (rng as unknown as { ur: UnifiedRandom }).ur;
  const origSample = ur.internalSample.bind(ur);
  let draws = 0;
  ur.internalSample = () => { draws++; return origSample(); };
  const lines: string[] = [];
  let n = 0;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let q = 0; q < TILE_DEFS.length; q++) { const s = TILE_DEFS[q]?.vanilla?.sheet; if (typeof s === 'number') SHEET[q] = s; }
  (globalThis as { __swSWAct?: unknown }).__swSWAct = (fn: string, x: number, y: number, e: number) => {
    lines.push(`${n}|${fn}|${x}|${y}|${fn === 'T' ? SHEET[e] : e}|${draws}|${streamHashOf(ur)}`);
    n++;
  };
  (globalThis as { __swSWCell?: unknown }).__swSWCell = (x: number, y: number) => {
    if (x !== 55 || y !== 1083) return;
    const g = (dx: number, dy: number) => {
      const i = (y + dy) * W + x + dx;
      return `(${x + dx},${y + dy})=${t52[i]}${a52[i] ? '' : '⁻'}h${st.half[i]}s${st.slope[i]}`;
    };
    console.log('CELL (55,1083) during-scan:', [g(-1, 0), g(1, 0), g(-1, 1), g(1, 1), g(0, 1), g(0, -1), g(1, -1)].join(' '));
  };
  try {
    runSmoothWorldPass(st, rng, { seed: 9293480 } as GenState);
  } finally {
    (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
    (globalThis as { __swSWCell?: unknown }).__swSWCell = undefined;
  }
  writeFileSync('/tmp/sw-hsv/jstrace.log', lines.join('\n') + '\n');
  const vanAll = readFileSync('/tmp/sw-hsv/swtrace.log', 'utf8').split('\n').filter(Boolean);
  const van = vanAll.filter((l) => ['K', 'T', 'S', 'P'].includes(l.split('|')[1]));
  console.log(`js actions=${lines.length} vanilla actions=${van.length}`);
  // vanilla hash→N 映射(同流 fresh(seed) 全程增量)
  const mapUr = new UnifiedRandom(9293480);
  const sac = (mapUr as unknown as { seedArray: Int32Array; inext: number });
  const hash2n = new Map<string, number>();
  {
    const step = (h: number, b: number) => Math.imul(h ^ (b & 0xff), 16777619) >>> 0;
    let h = 0x811c9dc5;
    for (let nn = 0; nn <= 5_200_000; nn++) {
      h = 0x811c9dc5;
      for (let q = 0; q < sac.seedArray.length; q++) {
        const v = sac.seedArray[q] | 0;
        for (let b = 0; b < 4; b++) h = step(h, v >>> (8 * b));
      }
      const ix = sac.inext >>> 0;
      for (let b = 0; b < 4; b++) h = step(h, ix >>> (8 * b));
      hash2n.set(h.toString(16).padStart(8, '0'), nn);
      (mapUr as unknown as { internalSample: () => number }).internalSample();
    }
  }
  const vanN = van.map((l) => hash2n.get(l.split('|')[5]) ?? -1);
  console.log('vanilla #0..#6 drawN:', vanN.slice(0, 7).join(','), ' js #0..#6 drawN:', lines.slice(0, 7).map((l) => l.split('|')[5]).join(','));
  let d = -1;
  for (let k = 0; k < Math.min(lines.length, van.length); k++) {
    const ja = lines[k].split('|'), jb = van[k].split('|');
    const a = ja[1]+'|'+ja[2]+'|'+ja[3]+'|'+ja[4]+'|'+ja[6], b = jb[1]+'|'+jb[2]+'|'+jb[3]+'|'+jb[4]+'|'+jb[5];
    if (a !== b) { d = k; break; }
  }
  if (d < 0 && lines.length === van.length) { console.log('★动作序列全等★'); return; }
  console.log(`首分叉动作 #${d}:`);
  for (let k = Math.max(0, d - 3); k <= Math.min(Math.max(lines.length, van.length) - 1, d + 3); k++) {
    console.log(`  #${k}: js=${lines[k] ?? '-'} | van=${van[k] ?? '-'}`);
  }
  // 分叉格邻域(dump052 输入)
  if (d >= 0) {
    const [fx, fy] = [ +van[d].split('|')[2], +van[d].split('|')[3] ];
    console.log(`vanilla 动作格 (${fx},${fy}) 7×7 输入邻域 [typ/act/half/slope]:`);
    for (let dy = -3; dy <= 3; dy++) {
      let row = `y${fy + dy}: `;
      for (let dx = -3; dx <= 3; dx++) {
        const i = (fy + dy) * W + fx + dx;
        row += `[${t52[i]}${a52[i] ? '' : '⁻'}h${half[i]}s${slope[i]}] `;
      }
      console.log(row);
    }
  }
}, 240000);
