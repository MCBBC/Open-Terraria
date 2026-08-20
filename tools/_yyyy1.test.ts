// YYYYY 批·任务②（12345 #90 残 1）：Flowers pass 金标基座重放。
// SW_YY1=cap：跑 12345(evil1) 管线到槽 42（藤蔓）末，落全通道快照+gs+GenSolid。
// SW_YY1=rep：装快照 → new RNG(12345) → runFlowersPass → 与 g12345 dump90 八通道对拍。
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { generateWorld, __setGenStateForProbe, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runFlowersPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_YY1 === 'cap' || process.env.SW_YY1 === 'rep';
const G2 = '/tmp/sw-slp/g12345';
const DIR = '/tmp/yyyyy-12345';
const W = 4200, H = 1200, N = W * H;
const SEED = 12345;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

const save = (name: string, arr: Uint8Array | Uint16Array) =>
  writeFileSync(`${DIR}/${name}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));

interface Row { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: Array<[string, number]>; samples: string[] }
function diffStore(tag: string, idx: number, st: TileStore): Row {
  const c = {
    t: new Uint16Array(readFileSync(gPath(idx, 'typ')).buffer.slice(0)),
    a: new Uint8Array(readFileSync(gPath(idx, 'act')).buffer.slice(0)),
    w: new Uint16Array(readFileSync(gPath(idx, 'wal')).buffer.slice(0)),
    l: new Uint8Array(readFileSync(gPath(idx, 'liq')).buffer.slice(0)),
    hf: new Uint8Array(readFileSync(gPath(idx, 'half')).buffer.slice(0)),
    sl: new Uint8Array(readFileSync(gPath(idx, 'slope')).buffer.slice(0)),
    lt: new Uint8Array(readFileSync(gPath(idx, 'lty')).buffer.slice(0)),
    ia: new Uint8Array(readFileSync(gPath(idx, 'inact')).buffer.slice(0)),
  };
  const r: Row = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, first: '', pairs: [], samples: [] };
  const pair = new Map<string, number>();
  let firstI = -1;
  const mark = (i: number) => { if (firstI < 0) firstI = i; };
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; mark(i); if (r.samples.length < 10) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { r.dT++; mark(i); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 10) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; mark(i); }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); if (r.samples.length < 10) r.samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; mark(i); }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; mark(i); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); }
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k, n] as [string, number]);
  console.log(`${tag} vs #${idx} ${DUMPNAME.get(idx)}: A=${r.dA} T=${r.dT} W=${r.dW} L=${r.dL} Hf=${r.dHf} Sl=${r.dSl} Lt=${r.dLt} Ia=${r.dIa} ${r.first || '✓'}`);
  if (r.pairs.length) console.log(`  pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}\n  samples: ${r.samples.join(' | ')}`);
  return r;
}

(RUN ? it : it.skip)('yyyy1 flowers capture/replay', async () => {
  mkdirSync(DIR, { recursive: true });
  if (process.env.SW_YY1 === 'cap') {
    let done = false;
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: 1,
      onWorldPartial: (w, i, name) => {
        if (done || name !== '藤蔓') return;
        done = true;
        const st = w.store;
        save('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
        save('liquid.bin', st.liquid); save('liquidType.bin', st.liquidType);
        save('half.bin', st.half); save('slope.bin', st.slope);
        save('frameX.bin', st.frameX); save('frameY.bin', st.frameY);
        save('wire.bin', st.wire); save('paint.bin', st.paint);
        writeFileSync(`${DIR}/gs.json`, JSON.stringify(lastGenState()));
        writeFileSync(`${DIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        console.log(`captured slot ${i} (藤蔓) end state → ${DIR}`);
      },
    });
    return;
  }
  // rep
  const st = new TileStore(W, H);
  const ld = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
  const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
  st.type.set(ld16('type.bin')); st.flags.set(ld('flags.bin')); st.wall.set(ld16('wall.bin'));
  st.liquid.set(ld('liquid.bin')); st.liquidType.set(ld('liquidType.bin'));
  st.half.set(ld('half.bin')); st.slope.set(ld('slope.bin'));
  st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
  st.wire.set(ld('wire.bin')); st.paint.set(ld('paint.bin'));
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);
  runFlowersPass(st, rng, gs);
  __setGenStateForProbe(null);
  diffStore('replay-flowers', 90, st);
  // 目标格现场（before = dump89）
  if (existsSync(gPath(89, 'typ'))) {
    const t89 = new Uint16Array(readFileSync(gPath(89, 'typ')).buffer.slice(0));
    const a89 = new Uint8Array(readFileSync(gPath(89, 'act')).buffer.slice(0));
    for (const [x, y] of [[2184, 232]]) {
      const i = y * W + x;
      console.log(`cell(${x},${y}): dump89=${a89[i] ? t89[i] : 'x'} js-replay=${st.flags[i] ? SHEET[st.type[i]!] : 'x'} fx=${st.frameX[i]} fy=${st.frameY[i]}`);
    }
  }
}, 600_000);
