// YYYYY 批·任务①（s22222 #97 二次沉降）：金标基座 settle 重放。
// SW_YY2=cap：跑 22222(evil1) 管线到槽 48（蜂巢幼虫）末，落 gs/GenSolid/frames/chests。
// SW_YY2=rep：golden dump96 八通道 + 帧两态（SW_YY2_FR=js|gold）→ settleWorldLiquids('gen')
//   → 与 g-s22222 dump97 八通道对拍。gold 帧 = /tmp/yyyyy-fr-b/097_Settle_Liquids_Again.fr。
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { generateWorld, __setGenStateForProbe, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_YY2 === 'cap' || process.env.SW_YY2 === 'rep';
const G2 = process.env.SW_YY2_G2 ?? '/tmp/sw-slp/g-s22222';
const DIR = process.env.SW_YY2_DIR ?? '/tmp/yyyyy-22222';
const W = 4200, H = 1200, N = W * H;
const SEED = Number(process.env.SW_YY2_SEED ?? 22222);
const EVIL = Number(process.env.SW_YY2_EVIL ?? 1) as 0 | 1;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
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
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); if (r.samples.length < 12) r.samples.push(`L(${i % W},${(i / W) | 0}) v${c.l[i]} j${st.liquid[i]}`); }
    if (c.hf[i]! !== st.half[i]!) { r.dHf++; mark(i); }
    if (c.sl[i]! !== st.slope[i]!) { r.dSl++; mark(i); }
    const vl = c.l[i]! > 0 ? c.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; mark(i); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const via = c.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; mark(i); }
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => [k, n] as [string, number]);
  console.log(`${tag} vs #${idx} ${DUMPNAME.get(idx)}: A=${r.dA} T=${r.dT} W=${r.dW} L=${r.dL} Hf=${r.dHf} Sl=${r.dSl} Lt=${r.dLt} Ia=${r.dIa} ${r.first || '✓'}`);
  if (r.pairs.length) console.log(`  pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}\n  samples: ${r.samples.join(' | ')}`);
  return r;
}

(RUN ? it : it.skip)('yyyy2 s22222 settle replay', async () => {
  mkdirSync(DIR, { recursive: true });
  if (process.env.SW_YY2 === 'cap') {
    let done = false;
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: EVIL,
      onWorldPartial: (w, i, name) => {
        if (done || name !== '蜂巢幼虫') return;
        done = true;
        const st = w.store;
        save('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
        save('liquid.bin', st.liquid); save('liquidType.bin', st.liquidType);
        save('half.bin', st.half); save('slope.bin', st.slope);
        save('frameX.bin', st.frameX); save('frameY.bin', st.frameY);
        save('wire.bin', st.wire); save('paint.bin', st.paint);
        writeFileSync(`${DIR}/gs.json`, JSON.stringify(lastGenState()));
        writeFileSync(`${DIR}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        writeFileSync(`${DIR}/chests.json`, JSON.stringify(w.chests ?? []));
        console.log(`captured slot ${i} (蜂巢幼虫) end state → ${DIR}`);
      },
    });
    return;
  }
  // rep：golden dump96 基座
  const st = new TileStore(W, H);
  {
    const c = {
      t: new Uint16Array(readFileSync(gPath(96, 'typ')).buffer.slice(0)),
      a: new Uint8Array(readFileSync(gPath(96, 'act')).buffer.slice(0)),
      w: new Uint16Array(readFileSync(gPath(96, 'wal')).buffer.slice(0)),
      l: new Uint8Array(readFileSync(gPath(96, 'liq')).buffer.slice(0)),
      hf: new Uint8Array(readFileSync(gPath(96, 'half')).buffer.slice(0)),
      sl: new Uint8Array(readFileSync(gPath(96, 'slope')).buffer.slice(0)),
      lt: new Uint8Array(readFileSync(gPath(96, 'lty')).buffer.slice(0)),
      ia: new Uint8Array(readFileSync(gPath(96, 'inact')).buffer.slice(0)),
    };
    for (let i = 0; i < N; i++) {
      const act = c.a[i]!;
      st.flags[i] = act;
      st.type[i] = act || c.t[i]! ? (REV.get(c.t[i]!) ?? 0) : 0;
      st.wall[i] = c.w[i]!;
      st.liquid[i] = c.l[i]!;
      st.liquidType[i] = c.l[i]! ? c.lt[i]! + 1 : 0;
      st.half[i] = c.hf[i]!;
      st.slope[i] = c.sl[i]!;
      st.wire[i] = c.ia[i]! ? 0x20 : 0;
    }
  }
  const frMode = process.env.SW_YY2_FR ?? 'js';
  if (frMode === 'js') {
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    const ld8 = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`).buffer.slice(0));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld8('wire.bin')); st.paint.set(ld8('paint.bin'));
  } else {
    // 金标帧注入（097_Settle_Liquids_Again.fr = pass 头快照；rig A=9293480 / B=s22222）
    const frPath = process.env.SW_YY2_FRPATH ?? '/tmp/yyyyy-fr-b/097_Settle_Liquids_Again.fr';
    const b = readFileSync(frPath);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const cnt = dv.getUint32(0, true);
    let set = 0;
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const idx = dv.getUint32(off, true);
      st.frameX[idx] = dv.getUint16(off + 4, true);
      st.frameY[idx] = dv.getUint16(off + 6, true);
      set++;
    }
    // 金标 wire 通道（0x1f）
    const wb = readFileSync(frPath.replace(/\.fr$/, '.wire'));
    const gwire = new Uint8Array(wb.buffer, wb.byteOffset, wb.byteLength);
    for (let i = 0; i < N; i++) st.wire[i] = (st.wire[i]! & ~0x1f) | (gwire[i]! & 0x1f);
    console.log(`  [goldframes] injected ${set} frames`);
  }
  const gs = JSON.parse(readFileSync(`${DIR}/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const world = new World(W, H, SEED);
  world.store = st;
  world.shimmerX = gs.shimmerX; world.shimmerY = gs.shimmerY;
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
  }
  const rng = new RNG(SEED);
  const killLog: string[] = [];
  (globalThis as { __swLqKill?: (x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number) => void })
    .__swLqKill = (x, y, sheet, fx, fy, liq, lty) => { killLog.push(`LQ ${x},${y} s${sheet} f${fx},${fy} l${liq}/${lty}`); };
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void })
    .__swKillCap = (x, y, sheet) => { killLog.push(`FCP ${x},${y} s${sheet}`); };
  let rollCount = 0;
  const rngC = new Proxy(rng, {
    get(t, p, r2) {
      const v = Reflect.get(t, p, t);
      if (typeof v === 'function' && ['nextInt', 'int', 'nextIntRange', 'next', 'chance', 'range'].includes(String(p))) {
        return (...args: number[]) => { rollCount++; return (v as (...a: number[]) => number).apply(t, args); };
      }
      return v;
    },
  }) as RNG;
  const t0 = Date.now();
  await settleWorldLiquids(world, 'gen', undefined, rngC);
  console.log(`  settle done ${((Date.now() - t0) / 1000).toFixed(0)}s rolls=${rollCount} (vanilla P|97 = 59528) kills=${killLog.length}`);
  writeFileSync(`/tmp/yyyyy-kill-${SEED}-${frMode}.txt`, killLog.join('\n') + '\n');
  __setGenStateForProbe(null);
  (globalThis as { __swLqKill?: unknown }).__swLqKill = undefined;
  (globalThis as { __swKillCap?: unknown }).__swKillCap = undefined;
  const r = diffStore(`replay-settle[${frMode}]`, 97, st);
  writeFileSync(`/tmp/yyyyy-22222-rep-${frMode}.json`, JSON.stringify(r));
}, 900_000);
