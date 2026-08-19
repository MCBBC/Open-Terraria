// YYYY 批诊断①：s22222 神庙锚错位定罪。
// 方法：▶LihzahrdTemple reseed 时点截 JS pre-temple 状态快照 →
//  (1) 快照 vs golden045 逐格差 → pre-temple 债的空间分布（地牢家具 vs 金字塔）；
//  (2) 同一 RNG 流重放锚点循环于 golden045 与 JS 快照两侧 → 双锚点对比；
//  (3) golden046/final store 各取 226 砖盒 = 双方神庙盒实证。
// 用法：cd game && SW_D1=1 npx vitest run tools/_yyyy_diag1.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_D1 === '1';
const G2 = '/tmp/sw-slp/g-s22222';
const W = 4200, H = 1200, N = W * H;
const SHEET2KEY = new Map<number, string>();
for (const d of TILE_DEFS) if (d?.vanilla?.sheet !== undefined) SHEET2KEY.set(d.vanilla.sheet!, d.key);
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const js2sheet = (t: Uint16Array): Int32Array => { const o = new Int32Array(t.length); for (let i = 0; i < t.length; i++) o[i] = SHEET[t[i]!]!; return o; };

const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const NAME = (sheet: number) => SHEET2KEY.get(sheet) ?? `sheet${sheet}`;

(RUN ? it : it.skip)('s22222 temple anchor diagnosis', async () => {
  // golden 045(pre-temple)/046(post-temple)
  const g45t = le16(`${G2}/045_Wet_Jungle.typ`), g45a = readFileSync(`${G2}/045_Wet_Jungle.act`);
  const g46t = le16(`${G2}/046_Jungle_Temple.typ`), g46a = readFileSync(`${G2}/046_Jungle_Temple.act`);
  const g39t = le16(`${G2}/039_Clean_Up_Dirt.typ`), g39a = readFileSync(`${G2}/039_Clean_Up_Dirt.act`);
  const g40t = le16(`${G2}/040_Pyramids.typ`), g40a = readFileSync(`${G2}/040_Pyramids.act`);

  // vanilla 神庙盒（046 内 226 活性格）
  const vBox = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
  for (let i = 0; i < N; i++) if (g46a[i] && g46t[i] === 226) {
    const x = i % W, y = (i / W) | 0;
    if (x < vBox.x0) vBox.x0 = x; if (x > vBox.x1) vBox.x1 = x;
    if (y < vBox.y0) vBox.y0 = y; if (y > vBox.y1) vBox.y1 = y;
  }
  // vanilla 金字塔建造区（039→040 typ 变化聚合 bbox）
  const pBox = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 }; let pChange = 0;
  for (let i = 0; i < N; i++) {
    const va = g40a[i] ? g40t[i] : 0, pv = g39a[i] ? g39t[i] : 0;
    if (va !== pv) { pChange++; const x = i % W, y = (i / W) | 0;
      if (x < pBox.x0) pBox.x0 = x; if (x > pBox.x1) pBox.x1 = x;
      if (y < pBox.y0) pBox.y0 = y; if (y > pBox.y1) pBox.y1 = y; }
  }

  // JS pre-temple 快照 + final store
  let st: { type: Uint16Array; flags: Uint8Array; w: number; h: number; idx(x: number, y: number): number } | null = null;
  let snapT: Uint16Array | null = null, snapA: Uint8Array | null = null;
  let finalT: Uint16Array | null = null, finalA: Uint8Array | null = null;
  let seedNum = 0;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let armed = false;
  const wgSrc = readFileSync('src/world/gen/WorldGen.ts', 'utf8').split('\n');
  RNGp.reseed = function (this: unknown, s: number) {
    if (st && !armed) {
      const stack = new Error().stack ?? '';
      const m = stack.match(/WorldGen\.ts:(\d+):(\d+)/);
      if (m) {
        // 调用点向上 3 行内找 ▶LihzahrdTemple 标记（reseed 行自身常带注释）
        for (let l = Math.min(Number(m[1]), wgSrc.length) - 1; l >= Math.max(0, Number(m[1]) - 4); l--) {
          if (wgSrc[l]!.includes('▶LihzahrdTemple')) {
            armed = true;
            snapT = Uint16Array.from(st.type); snapA = Uint8Array.from(st.flags);
            break;
          }
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    const world = await generateWorld({ width: W, height: H, seedText: '22222', evil: 1, onWorldPartial: (w) => { if (!st) st = w.store as never; } });
    seedNum = (world as unknown as { seed: number }).seed;
    finalT = Uint16Array.from((world.store as never as typeof st)!.type); finalA = Uint8Array.from((world.store as never as typeof st)!.flags);
  } finally { RNGp.reseed = oReseed; }

  // JS 神庙盒（final 226——SHEET 映射后比较）
  const finalS = js2sheet(finalT!);
  const jBox = { x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
  for (let i = 0; i < N; i++) if (finalA![i] && finalS[i] === 226) {
    const x = i % W, y = (i / W) | 0;
    if (x < jBox.x0) jBox.x0 = x; if (x > jBox.x1) jBox.x1 = x;
    if (y < jBox.y0) jBox.y0 = y; if (y > jBox.y1) jBox.y1 = y;
  }
  console.log(`seed=${seedNum}`);
  console.log(`vanilla 神庙盒(046): x[${vBox.x0},${vBox.x1}] y[${vBox.y0},${vBox.y1}]`);
  console.log(`JS 神庙盒(final):    x[${jBox.x0},${jBox.x1}] y[${jBox.y0},${jBox.y1}]`);
  console.log(`vanilla 039→040 变化=${pChange} 格 bbox x[${pBox.x0},${pBox.x1}] y[${pBox.y0},${pBox.y1}]`);

  // (1) pre-temple 债分布：快照(SHEET 映射) vs golden045，按 x 分桶 + 类型聚合
  const snapS = js2sheet(snapT!);
  const JG = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 60);
  {
    let n = 0; const byType = new Map<string, number>(); const byX = new Map<number, number>();
    let dx0 = 1e9, dx1 = -1, dy0 = 1e9, dy1 = -1;
    for (let i = 0; i < N; i++) {
      const va = g45a[i]!, ja = snapA![i]!;
      const vt = va ? g45t[i]! : 0, jt = ja ? snapS[i]! : 0;
      if (vt !== jt || va !== ja) {
        n++;
        const k = `${va ? NAME(vt) : `inact:${NAME(vt)}`}>${ja ? NAME(jt) : `inact:${NAME(jt)}`}`;
        byType.set(k, (byType.get(k) ?? 0) + 1);
        const x = i % W, y = (i / W) | 0;
        byX.set((x / 300) | 0, (byX.get((x / 300) | 0) ?? 0) + 1);
        if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y;
      }
    }
    console.log(`pre-temple 债=${n} bbox x[${dx0},${dx1}] y[${dy0},${dy1}]`);
    console.log(`  类型 top: ${[...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `${k}×${c}`).join(' ')}`);
    const xs = [...byX.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`  x 桶(300格) top: ${xs.map(([k, c]) => `x${Number(k) * 300}-${Number(k) * 300 + 299}:${c}`).join(' ')}`);
    // 关键格 (2694,426) 三时点状态
    const ki = 426 * W + 2694;
    const g39v = g39a[ki]! ? NAME(g39t[ki]!) : `inact:${NAME(g39t[ki]!)}`;
    const g40v = g40a[ki]! ? NAME(g40t[ki]!) : `inact:${NAME(g40t[ki]!)}`;
    const g45v = g45a[ki]! ? NAME(g45t[ki]!) : `inact:${NAME(g45t[ki]!)}`;
    const jsv = snapA![ki]! ? NAME(snapS[ki]!) : `inact:${NAME(snapS[ki]!)}`;
    console.log(`  关键格(2694,426): 039=${g39v} 040=${g40v} 045=${g45v} JS快照=${jsv}`);
  }

  // (2) 锚点循环重放：golden045 侧 vs 快照侧
  const rockLevel = 415, dungeonSide = -1, yBot = H - 600;
  const replay = (getType: (i: number) => number, getAct: (i: number) => number): { x: number; y: number; iter: number } => {
    const rng = new RNG(seedNum);
    let band = 0.25, fails = 0, giveups = 0, iter = 0;
    for (;;) {
      let yTop = Math.floor(rockLevel);
      if (yTop > yBot - 1) yTop = yBot - 1;
      const y = rng.int(yTop, yBot - 1);
      const x = Math.floor(((rng.next() * band + 0.1) * -dungeonSide + 0.5) * W);
      iter++;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        const i = y * W + x;
        if (getAct(i) && getType(i) === 60) return { x, y, iter };
      }
      if (fails++ > 1000000) {
        if (band === 0.35 && ++giveups > 10) break;
        band = Math.min(0.35, band + 0.05); fails = 0;
      }
    }
    return { x: -1, y: -1, iter };
  };
  const aG = replay((i) => g45t[i]!, (i) => g45a[i]!);
  const aJ = replay((i) => snapS[i]!, (i) => snapA![i]!);
  console.log(`锚点重放: golden045 → (${aG.x},${aG.y}) @iter${aG.iter} | JS快照 → (${aJ.x},${aJ.y}) @iter${aJ.iter} | JS内部id60=${JG}`);
  if (aG.x !== aJ.x || aG.y !== aJ.y) {
    // 差异样本定位：两侧在 iter 双方间被拒/被受的采样点类型
    const rng = new RNG(seedNum);
    let band = 0.25, fails = 0, giveups = 0, iter = 0;
    for (;;) {
      let yTop = Math.floor(rockLevel); if (yTop > yBot - 1) yTop = yBot - 1;
      const y = rng.int(yTop, yBot - 1);
      const x = Math.floor(((rng.next() * band + 0.1) * -dungeonSide + 0.5) * W);
      iter++;
      if (x >= 0 && x < W && y >= 0 && y < H) {
        const i = y * W + x;
        const gOK = g45a[i]! && g45t[i]! === 60, jOK = snapA![i]! && snapS[i]! === 60;
        if (gOK !== jOK) console.log(`  首个分歧采样 iter${iter} (${x},${y}): golden=${gOK ? 'grass60' : `${NAME(g45t[i]!)}/act${g45a[i]}`} js=${jOK ? 'grass60' : `${NAME(snapS[i]!)}/act${snapA![i]}`}`);
        if (gOK) break;
      }
      if (fails++ > 1000000) { if (band === 0.35 && ++giveups > 10) break; band = Math.min(0.35, band + 0.05); fails = 0; }
    }
  }
}, 600_000);
