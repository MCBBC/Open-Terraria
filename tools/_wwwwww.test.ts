// 一次性诊断（WWWWW 批 2026-08-23）：三彩蛋首差反事实定罪探针。
//   SW_WWWW=const   → CONST 1321365005/theConstant：▶LivingTreeWalls 时点 vs 042_Living_Trees，
//                     输出 8 通道差 + 活木(191)列段对照（树位位移定位）
//   SW_WWWW=ntb     → NTB 1372357239/notTheBees：▶Dungeon 时点 vs 031_Slush，
//                     对 v224/j123 差格扫 ±3 丛林草族（60/70/71/72）——验证「淤泥误挂泥豁免」
//   SW_WWWW=notraps → NOTRAPS 1896728457/notraps：▶JungleShrines(前)+槽8末(后) vs 048_Jungle_Chests，
//                     对 S 差格报前坡/后坡/原版坡 + 腔墙值——验证「入口掏空抹坡」
// 用法：cd game && SW_WWWW=<mode> npx vitest run tools/_wwwwww.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { parseWld } from '../src/wld/WldParser';

const MODE = process.env.SW_WWWW ?? '';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface Snap { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; half: Uint8Array; slope: Uint8Array; liquidType: Uint8Array; wire: Uint8Array }
function snap(w: { store: Snap }): Snap {
  const s = w.store;
  return {
    type: s.type.slice(), flags: s.flags.slice(), wall: s.wall.slice(), liquid: s.liquid.slice(),
    half: s.half.slice(), slope: s.slope.slice(), liquidType: s.liquidType.slice(), wire: s.wire.slice(),
  };
}
interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function chans(dir: string, idx: number, nm: string): Ch {
  const pre = `${dir}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.half`)) throw new Error(`no dump ${pre}`);
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
    hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`), lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}
function diff8(c: Ch, s: Snap): { rows: Array<[string, number]>; first: string; cells: number[] } {
  const pair = new Map<string, number>();
  const cells: number[] = [];
  let firstI = -1;
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = s.flags[i]! & 1;
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[s.type[i]!] >= 0 ? SHEET[s.type[i]!]! : 9999) : 0;
    let bad = va !== ja || vt !== jt || c.w[i]! !== s.wall[i] || c.l[i]! !== s.liquid[i]
      || c.hf[i]! !== s.half[i] || c.sl[i]! !== s.slope[i] || c.ia[i] !== ((s.wire[i]! >>> 5) & 1);
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = s.liquid[i]! > 0 ? s.liquidType[i]! : 0;
    if (vl !== jl) bad = true;
    if (bad) {
      if (firstI < 0) firstI = i;
      if (cells.length < 4000) cells.push(i);
      const k = va !== ja ? `A` : vt !== jt ? `T${vt}>${jt}` : c.sl[i]! !== s.slope[i] ? `S${c.sl[i]}>${s.slope[i]}`
        : c.w[i]! !== s.wall[i] ? `W${c.w[i]}>${s.wall[i]}` : c.l[i]! !== s.liquid[i] ? `L${c.l[i]}>${s.liquid[i]}`
        : c.hf[i]! !== s.half[i] ? `H${c.hf[i]}>${s.half[i]}` : `Y${vl}>${jl}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
  }
  return { rows: [...pair.entries()].sort((a, b) => b[1] - a[1]), first: firstI < 0 ? '-' : `(${firstI % W},${(firstI / W) | 0})`, cells };
}
/** 活木(191)列段：含活性 191 格的 x 列 → 合并成段 */
function woodRuns(t: Uint16Array, act: Uint8Array): Array<[number, number]> {
  const cols: number[] = [];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (act[i] && t[i] === 191) { cols.push(x); break; }
    }
  }
  const runs: Array<[number, number]> = [];
  for (const x of cols) {
    if (runs.length && x - runs[runs.length - 1]![1] <= 6) runs[runs.length - 1]![1] = x;
    else runs.push([x, x]);
  }
  return runs;
}
function installHook(target: RegExp, lo: number, hi: number, tag: string, onHit: () => void): () => void {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const seen = new Set<string>();
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m) {
        if (m[1].match(target) && Number(m[2]) >= lo && Number(m[2]) <= hi && !seen.has(tag)) {
          seen.add(tag);
          onHit();
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  return () => { RNGp.reseed = oReseed; };
}
const WG = /world\/gen\/WorldGen\.ts$/;

(MODE === 'san' ? it : it.skip)('wwwwww 12345 rig sanity: dump slot105 vs fresh plain wld', () => {
  const w = parseWld(new Uint8Array(readFileSync('/tmp/wwwwww-home/s12345san.wld')));
  const d = chans('/tmp/sw-slp/g12345', 105, 'Final_Cleanup');
  console.log(`wld: ${w.tilesWide}x${w.tilesHigh} ground=${w.groundLevel} rock=${w.rockLevel} dungeon=(${w.dungeonX},${w.dungeonY}) moon=${w.moonType} crimson=${w.isCrimson} seed=${w.seed}`);
  const t = w.tiles;
  const n = w.tilesWide * w.tilesHigh;
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0, shim = 0;
  let first = -1;
  const pairs = new Map<string, number>();
  const mark = (i: number, k: string) => {
    if (first < 0) first = i;
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  };
  for (let i = 0; i < n; i++) {
    const va = d.a[i]!, wa = t.active[i];
    if (va !== wa) { dA++; mark(i, `A${va}>${wa}`); }
    if (va && wa && d.t[i]! !== t.type[i]) { dT++; mark(i, `T${d.t[i]}>${t.type[i]}`); }
    if (!va && d.t[i]! !== 0) dGh++; // 幽灵豁免口径：dump 保幽灵、wld 不落非活性 type
    if (d.w[i]! !== t.wall[i]) { dW++; mark(i, `W${d.w[i]}>${t.wall[i]}`); }
    if (d.l[i]! !== t.liquid[i]) { dL++; mark(i, `L${d.l[i]}>${t.liquid[i]}`); }
    if (d.hf[i]! !== t.half[i]) { dHf++; mark(i, `H${d.hf[i]}>${t.half[i]}`); }
    if (d.sl[i]! !== t.slope[i]) { dSl++; mark(i, `S${d.sl[i]}>${t.slope[i]}`); }
    const via = d.ia[i]! ? 1 : 0;
    const wia = (t.wire[i]! >>> 5) & 1;
    if (via !== wia) { dIa++; mark(i, `I${via}>${wia}`); }
    if (d.l[i]! > 0) {
      // 微光豁免：dump lty==3（微光）在 wld=水类型+独立位
      if (d.lt[i] === 3) { if (t.liquidType[i] !== 1) { dLt++; mark(i, `Yshim${t.liquidType[i]}`); } else shim++; }
      else if (d.lt[i]! + 1 !== t.liquidType[i]) { dLt++; mark(i, `Y${d.lt[i]! + 1}>${t.liquidType[i]}`); }
    }
  }
  console.log(`8ch diff: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt}(shimmer-ok=${shim}) Ia=${dIa} | ghost(豁免域)=${dGh}`);
  console.log(`first=${first < 0 ? '-' : `(${first % w.tilesWide},${(first / w.tilesWide) | 0})`}`);
  console.log(`pairs: ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, c]) => `${k}×${c}`).join(' ')}`);
}, 300_000);

(MODE === 'const' ? it : it.skip)('wwwwww const LivingTrees conviction', async () => {
  const G2 = '/tmp/sw-slp/g-secret-const';
  let gRef: { store: Snap } | null = null;
  let cap: Snap | null = null;
  const restore = installHook(WG, 917, 923, 'ltw', () => { if (gRef) cap = snap(gRef); });
  try {
    await generateWorld({
      width: W, height: H, seedText: '1321365005', evil: -1,
      seedFlags: { theConstant: true },
      onWorldPartial: (w) => { if (!gRef) gRef = w as never; },
    });
  } finally { restore(); }
  if (!cap) throw new Error('capture missed (LivingTreeWalls reseed)');
  const c = chans(G2, 42, 'Living_Trees');
  const d = diff8(c, cap);
  console.log(`const#42 diff n=${d.cells.length} first=${d.first}`);
  console.log(`pairs: ${d.rows.slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  const vRuns = woodRuns(c.t, c.a);
  const jRuns = woodRuns(cap.type, cap.flags);
  console.log(`vanilla wood runs (${vRuns.length}): ${vRuns.map(([a, b]) => `${a}-${b}`).join(' ')}`);
  console.log(`js      wood runs (${jRuns.length}): ${jRuns.map(([a, b]) => `${a}-${b}`).join(' ')}`);
}, 900_000);

(MODE === 'ntb' ? it : it.skip)('wwwwww ntb Slush conviction', async () => {
  const G2 = '/tmp/sw-slp/g-secret-ntb';
  let gRef: { store: Snap } | null = null;
  let cap: Snap | null = null;
  const restore = installHook(WG, 851, 857, 'dun', () => { if (gRef) cap = snap(gRef); });
  try {
    await generateWorld({
      width: W, height: H, seedText: '1372357239', evil: -1,
      seedFlags: { notTheBees: true },
      onWorldPartial: (w) => { if (!gRef) gRef = w as never; },
    });
  } finally { restore(); }
  if (!cap) throw new Error('capture missed (Dungeon reseed)');
  const c = chans(G2, 31, 'Slush');
  const d = diff8(c, cap);
  console.log(`ntb#31 diff n=${d.cells.length} first=${d.first}`);
  console.log(`pairs: ${d.rows.slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  const GRASS = new Set([60, 70, 71, 72]);
  let withGrass = 0, without = 0;
  const samples: string[] = [];
  for (const i of d.cells) {
    const va = c.a[i]!, ja = cap.flags[i] & 1;
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? SHEET[cap.type[i]!] : 0;
    if (!(vt === 224 && jt === 123)) continue;
    const x = i % W, y = (i / W) | 0;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x2 = x + dx, y2 = y + dy;
        if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
        const j = y2 * W + x2;
        if (!(cap.flags[j] & 1)) continue;
        if (GRASS.has(SHEET[cap.type[j]]!)) { near = true; break; }
      }
    }
    if (near) { withGrass++; if (samples.length < 6) samples.push(`(${x},${y})`); }
    else without++;
  }
  console.log(`v224/j123 cells: withGrass=${withGrass} withoutGrass=${without}`);
  console.log(`samples: ${samples.join(' | ')}`);
}, 900_000);

(MODE === 'notraps' ? it : it.skip)('wwwwww notraps JungleShrines conviction', async () => {
  const G2 = '/tmp/sw-slp/g-secret-notraps';
  let gRef: { store: Snap } | null = null;
  let pre: Snap | null = null;
  let post: Snap | null = null;
  const restore = installHook(WG, 932, 938, 'js', () => { if (gRef) pre = snap(gRef); });
  try {
    await generateWorld({
      width: W, height: H, seedText: '1896728457', evil: 1,
      seedFlags: { notraps: true },
      onWorldPartial: (w, i) => {
        if (!gRef) gRef = w as never;
        if (i === 8 && !post) post = snap(w as never);
      },
    });
  } finally { restore(); }
  if (!pre || !post) throw new Error(`capture missed pre=${!!pre} post=${!!post}`);
  const c = chans(G2, 48, 'Jungle_Chests');
  const d = diff8(c, post);
  console.log(`notraps#48 diff n=${d.cells.length} first=${d.first}`);
  console.log(`pairs: ${d.rows.slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const i of d.cells.slice(0, 24)) {
    const x = i % W, y = (i / W) | 0;
    const va = c.a[i]!, ja = post.flags[i] & 1;
    const vt = va ? c.t[i]! : 0, jt = ja ? SHEET[post.type[i]!] : 0;
    console.log(`  (${x},${y}) vS=${c.sl[i]} jS=${post.slope[i]} preS=${pre.slope[i]} | vT=${vt} jT=${jt} preSheet=${SHEET[pre.type[i]]} vWall=${c.w[i]} jWall=${post.wall[i]} preWall=${pre.wall[i]}`);
  }
}, 900_000);
