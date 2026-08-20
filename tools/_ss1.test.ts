// SSSSS 批临时探针（用毕即删）：#76 Traps / #79 Grass_Wall 金标基座捕获+重放。
// 方法：捕获全管线槽末快照（'倒木水景'=Traps 入口 / '出生点'=GrassWall 入口，
// 8 通道全绿槽 ⇒ 快照与 golden 同构）→ 单 pass 重放（new RNG(seed) 镜像 RunPass
// 重播）→ 与 golden 下一槽 8 通道对拍。差 = pass 自身自因（上游被基座隔离）。
// 用法（cd game）：
//   SW_SS=cap SW_SS_SEED=12345 SW_SS_EVIL=1 SW_SS_G2=/tmp/sw-slp/g12345 SW_SS_KEY=ss12345 \
//     npx vitest run tools/_ss1.test.ts
//   SW_SS=rep SW_SS_KEY=ss12345 SW_SS_SLOT=traps SW_SS_G2=/tmp/sw-slp/g12345 \
//     npx vitest run tools/_ss1.test.ts
//   （m 链加 SW_SS_W=6400 SW_SS_H=1800；重放 traps 时对拍 golden 076，
//    grasswall 对拍 079；__ssLog 伴跑落盘 /tmp/ss-b/<key>/<slot>.log）
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runTrapsPass, __setSsLog } from '../src/world/gen/vanilla/TrapsPass';
import { runGrassWallPass } from '../src/world/gen/vanilla/GrassWallPass';

const MODE = process.env.SW_SS ?? '';
const SEED = process.env.SW_SS_SEED ?? '12345';
const EVIL = Number(process.env.SW_SS_EVIL ?? 0);
const W = Number(process.env.SW_SS_W ?? 4200), H = Number(process.env.SW_SS_H ?? 1200), N = W * H;
const G2 = process.env.SW_SS_G2 ?? '/tmp/sw-slp/g';
const KEY = process.env.SW_SS_KEY ?? 'ss12345';
const SLOT = process.env.SW_SS_SLOT ?? 'traps';
const BDIR = `/tmp/ss-b/${KEY}`;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

// ---- 快照落盘/回读（全通道原样，含帧/线/漆） ----
const ARRS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall'] as const;
type Snap = { st: TileStore; gs: GenState; gensolid: Array<[number, boolean]> };
function saveSnap(dir: string, st: TileStore): void {
  mkdirSync(dir, { recursive: true });
  for (const k of ARRS) writeFileSync(`${dir}/${k}.bin`, Buffer.from((st as unknown as Record<string, Uint8Array>)[k]!.buffer.slice(0)));
  console.log(`[cap] ${dir}`);
}
function loadSnap(dir: string): Snap {
  const st = new TileStore(W, H);
  const U16 = new Set(['type', 'frameX', 'frameY', 'wall']);
  for (const k of ARRS) {
    const buf = readFileSync(`${dir}/${k}.bin`);
    if (U16.has(k)) {
      (st as unknown as Record<string, Uint16Array>)[k]!.set(new Uint16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
    } else {
      (st as unknown as Record<string, Uint8Array>)[k]!.set(new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
    }
  }
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>;
  return { st, gs, gensolid };
}

// ---- 八通道 diff（_mile8 口径） ----
interface Row { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: Array<[string, number]>; samples: string[] }
function diffStore(idx: number, st: TileStore): Row {
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(0)); };
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const c = { t: le16(gPath(idx, 'typ')), a: b8('act'), w: le16(gPath(idx, 'wal')), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };
  const r: Row = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, first: '', pairs: [], samples: [] };
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 24) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { r.dT++; mark(i); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 24) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; mark(i); const k = `W${c.w[i]}>${st.wall[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 24) r.samples.push(`W(${i % W},${(i / W) | 0}) v${c.w[i]} j${st.wall[i]}`); }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); if (r.samples.length < 24) r.samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; mark(i); const k = `H${c.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 24) r.samples.push(`H(${i % W},${(i / W) | 0}) v${c.hf[i]} j${st.half[i]}`); }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; mark(i); const k = `S${c.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 24) r.samples.push(`S(${i % W},${(i / W) | 0}) v${c.sl[i]} j${st.slope[i]}`); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); if (r.samples.length < 24) r.samples.push(`I(${i % W},${(i / W) | 0}) v${via} j${jia}`); }
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => [k, n] as [string, number]);
  return r;
}

(MODE === 'cap' ? it : it.skip)(`SSSSS cap ${KEY}`, async () => {
  mkdirSync(BDIR, { recursive: true });
  const want: Record<string, string> = { '倒木水景': 'trapsIn', '出生点': 'grassIn' };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: (world, _i, name) => {
      const slug = want[name];
      if (!slug || existsSync(`${BDIR}/${slug}/gs.json`)) return;
      const gs = lastGenState()!;
      saveSnap(`${BDIR}/${slug}`, world.store as unknown as TileStore);
      writeFileSync(`${BDIR}/${slug}/gs.json`, JSON.stringify(gs));
      writeFileSync(`${BDIR}/${slug}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
      writeFileSync(`${BDIR}/${slug}/chests.json`, JSON.stringify(world.chests));
      console.log(`[cap] ${name} -> ${slug} (seed=${gs.seed} ws=${gs.worldSurface} chests=${world.chests.length})`);
    },
  });
  console.log('cap done');
}, 900_000);

(MODE === 'rep' ? it : it.skip)(`SSSSS rep ${KEY} ${SLOT}`, async () => {
  const slug = SLOT === 'traps' ? 'trapsIn' : 'grassIn';
  const goldIdx = SLOT === 'traps' ? 76 : 79;
  const snap = loadSnap(`${BDIR}/${slug}`);
  (globalThis as { __ssGwLog?: string[] }).__ssGwLog = [];
  restoreGenSolid(new Map(snap.gensolid));
  const log: string[] = [];
  __setSsLog(log);
  const rng = new RNG(snap.gs.seed);
  if (SLOT === 'traps') {
    const chests = existsSync(`${BDIR}/${slug}/chests.json`)
      ? JSON.parse(readFileSync(`${BDIR}/${slug}/chests.json`, 'utf8')) as Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>
      : [];
    runTrapsPass(snap.st, rng, snap.gs, chests);
  }
  else runGrassWallPass(snap.st, rng, snap.gs);
  __setSsLog(null);
  writeFileSync(`${BDIR}/${SLOT}.log`, log.join('\n'));
  const gwlog = (globalThis as { __ssGwLog?: string[] }).__ssGwLog ?? [];
  if (gwlog.length) writeFileSync(`${BDIR}/${SLOT}.gw.log`, gwlog.join('\n'));
  (globalThis as { __ssGwLog?: string[] }).__ssGwLog = undefined;
  const r = diffStore(goldIdx, snap.st);
  if (process.env.SW_SS_CELLS) {
    const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(0)); };
    const gw = le16(gPath(goldIdx, 'wal')), gt = le16(gPath(goldIdx, 'typ'));
    const cells: string[] = [];
    for (let i = 0; i < N; i++) {
      if (gw[i] !== snap.st.wall[i] || gt[i] !== SHEET[snap.st.type[i]!]) cells.push(`${i % W},${(i / W) | 0} w${gw[i]}>${snap.st.wall[i]} t${gt[i]}>${SHEET[snap.st.type[i]!] ?? -1}`);
    }
    writeFileSync(process.env.SW_SS_CELLS, cells.join('\n'));
    console.log(`  cells file: ${cells.length} -> ${process.env.SW_SS_CELLS}`);
  }
  const bad = r.dA || r.dT || r.dW || r.dL || r.dHf || r.dSl || r.dLt || r.dIa;
  console.log(`${SLOT} vs golden ${String(goldIdx).padStart(3)} ${DUMPNAME.get(goldIdx)}: ${bad ? '✗ ' + r.first : '✓ 全零'}`);
  console.log(`  A=${r.dA} T=${r.dT} W=${r.dW} L=${r.dL} Hf=${r.dHf} Sl=${r.dSl} Lt=${r.dLt} Ia=${r.dIa}`);
  console.log(`  pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`  samples: ${r.samples.join(' | ')}`);
  console.log(`  log lines: ${log.length} -> ${BDIR}/${SLOT}.log`);
}, 900_000);
