// YYYYY 批·任务③（m20260811 #77 Piles 残 17 / 段⑥）：中世界金标基座重放。
// SW_YY4=cap：跑 20260811(6400×1800,evil0) 管线到槽 31（陷阱）末，落全通道快照。
// SW_YY4=rep：golden dump76 八通道 + JS 帧 → runPilesPass → 对拍 dump77。
//   SW_YY4_SPAN=/path → 掷流 a/b 行记录（对拍 x86 SW_TT_SPAN_PASSES=Piles）。
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { generateWorld, __setGenStateForProbe, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { runVinesPass, runFlowersPass, runLongMossPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runTileCleanupPass } from '../src/world/gen/vanilla/TileCleanupPass';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_YY4 === 'cap' || process.env.SW_YY4 === 'rep';
const G2 = process.env.SW_YY4_G2 ?? '/tmp/sw-slp/g-m20260811';
const DIR = process.env.SW_YY4_DIR ?? '/tmp/yyyyy-m20260811';
const W = Number(process.env.SW_YY4_W ?? 6400), H = Number(process.env.SW_YY4_H ?? 1800), N = W * H;
const SEED = Number(process.env.SW_YY4_SEED ?? 20260811);
const EVILN = Number(process.env.SW_YY4_EVIL ?? 0);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
if (RUN) for (const f of readdirSync(G2))   // ★套件门(2026-09-02):夹具目录缺省不扫 { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
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
    if (vt !== jt) { r.dT++; mark(i); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 12) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.w[i]! !== st.wall[i]!) { r.dW++; mark(i); }
    if (c.l[i]! !== st.liquid[i]!) { r.dL++; mark(i); }
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
  if (process.env.SW_YY4_DUMPCELLS) {
    const out: string[] = [];
    for (let i = 0; i < N; i++) {
      const vt = c.a[i]! ? c.t[i]! : 0;
      const jt = (st.flags[i]! & 1) ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt || c.a[i]! !== (st.flags[i]! & 1)) out.push(`(${i % W},${Math.floor(i / W)}) v${vt}/a${c.a[i]} j${jt}/a${st.flags[i]! & 1}`);
    }
    writeFileSync(process.env.SW_YY4_DUMPCELLS, out.join('\n') + '\n');
  }
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => [k, n] as [string, number]);
  console.log(`${tag} vs #${idx} ${DUMPNAME.get(idx)}: A=${r.dA} T=${r.dT} W=${r.dW} L=${r.dL} Hf=${r.dHf} Sl=${r.dSl} Lt=${r.dLt} Ia=${r.dIa} ${r.first || '✓'}`);
  if (r.pairs.length) console.log(`  pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}\n  samples: ${r.samples.join(' | ')}`);
  return r;
}

(RUN ? it : it.skip)('yyyy4 m Piles replay', async () => {
  mkdirSync(DIR, { recursive: true });
  if (process.env.SW_YY4 === 'cap') {
    let done = false;
    await generateWorld({
      width: W, height: H, seedText: String(SEED), evil: EVILN as 0 | 1,
      onWorldPartial: (w, i, name) => {
        const SLOT = Number(process.env.SW_YY4_SLOT ?? 31);
        if (done || i !== SLOT) return;
        done = true;
        const st = w.store;
        mkdirSync(`${DIR}/s${SLOT}`, { recursive: true });
        const save2 = (name: string, arr: Uint8Array | Uint16Array) =>
          writeFileSync(`${DIR}/s${SLOT}/${name}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
        (globalThis as { __yy4Save?: typeof save }).__yy4Save = save2;
        save2('type.bin', st.type); save('flags.bin', st.flags); save('wall.bin', st.wall);
        save2('liquid.bin', st.liquid); save2('liquidType.bin', st.liquidType);
        save2('half.bin', st.half); save2('slope.bin', st.slope);
        save2('frameX.bin', st.frameX); save2('frameY.bin', st.frameY);
        save2('wire.bin', st.wire); save2('paint.bin', st.paint);
        writeFileSync(`${DIR}/s${SLOT}/gs.json`, JSON.stringify(lastGenState()));
        writeFileSync(`${DIR}/s${SLOT}/gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
        writeFileSync(`${DIR}/s${SLOT}/chests.json`, JSON.stringify(w.chests ?? []));
        console.log(`captured slot ${i} (${name}) end state → ${DIR}`);
      },
    });
    return;
  }
  // rep：golden dump76 基座 + JS 帧
  const st = new TileStore(W, H);
  {
    const c = {
      t: new Uint16Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'typ')).buffer.slice(0)),
      a: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'act')).buffer.slice(0)),
      w: new Uint16Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'wal')).buffer.slice(0)),
      l: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'liq')).buffer.slice(0)),
      hf: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'half')).buffer.slice(0)),
      sl: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'slope')).buffer.slice(0)),
      lt: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'lty')).buffer.slice(0)),
      ia: new Uint8Array(readFileSync(gPath(Number(process.env.SW_YY4_BASE ?? 76), 'inact')).buffer.slice(0)),
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
    const BDIR = `${DIR}/s${process.env.SW_YY4_SLOT ?? 31}`;
    const ld16 = (n: string) => new Uint16Array(readFileSync(`${BDIR}/${n}`).buffer.slice(0));
    const ld8 = (n: string) => new Uint8Array(readFileSync(`${BDIR}/${n}`).buffer.slice(0));
    st.frameX.set(ld16('frameX.bin')); st.frameY.set(ld16('frameY.bin'));
    st.wire.set(ld8('wire.bin')); st.paint.set(ld8('paint.bin'));
  }
  const gs = JSON.parse(readFileSync(`${DIR}/s${process.env.SW_YY4_SLOT ?? 31}/gs.json`, 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/s${process.env.SW_YY4_SLOT ?? 31}/gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);
  // 掷流 + ⑥放置探针
  const spanPath = process.env.SW_YY4_SPAN;
  const spanLines: string[] = [];
  const rngW = spanPath ? new Proxy(rng, {
    get(t, p) {
      const v = Reflect.get(t, p, t);
      if (typeof v !== 'function') return v;
      const f = String(p);
      return (...args: number[]) => {
        const r = (v as (...a: number[]) => number).apply(t, args);
        if (f === 'nextInt') spanLines.push(`a ${args[0]}`);
        else if (f === 'int') spanLines.push(`b ${args[0]} ${args[1]! + 1}`);
        else if (f === 'nextIntRange') spanLines.push(`b ${args[0]} ${args[1]}`);
        return r;
      };
    },
  }) as RNG : rng;
  const pileLog: string[] = [];
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void })
    .__swPilesCap = (x, y, t, s, z, k) => { pileLog.push(`${spanLines.length} ${x},${y} t${t} s${s} z${z}`); };
  if (process.env.SW_YY4_PASS === 'tilecleanup') {
    const chests = JSON.parse(readFileSync(`${DIR}/s${process.env.SW_YY4_SLOT ?? 31}/chests.json`, 'utf8'));
    const kc: string[] = [];
    (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap = (x, y, sh) => {
      if ((x >= 616 && x <= 623 && y >= 1068 && y <= 1074) || (x >= 3716 && x <= 3722 && y >= 1090 && y <= 1096) || (x >= 2444 && x <= 2452 && y >= 585 && y <= 591)) kc.push(`${x},${y} s${sh}\n${(new Error().stack ?? '').split('\n').slice(1, 9).join(' <- ')}`);
    };
    runTileCleanupPass(st, rngW, gs, chests);
    (globalThis as { __swKillCap?: unknown }).__swKillCap = undefined;
    console.log('  [killwin] ' + (kc.join(' | ') || '(none)'));
  } else if (process.env.SW_YY4_PASS === 'longmoss') {
    const lmRolls = { n: 0 };
    const rngM = new Proxy(rngW, { get(t, p2) { const v = Reflect.get(t, p2, t); if (typeof v === 'function') return (...a: number[]) => { lmRolls.n++; return (v as (...b: number[]) => number).apply(t, a); }; return v; } }) as RNG;
    runLongMossPass(st, rngM, gs);
    console.log(`  [longmoss] rolls=${lmRolls.n}`);
  } else if (process.env.SW_YY4_PASS === 'flowers') {
    const flLog: string[] = [];
    (globalThis as { __swFlCap?: (m: number, n: number, tag: string) => void }).__swFlCap = (m, n, tag) => { flLog.push(`${spanLines.length} ${m},${n} ${tag}`); };
    runFlowersPass(st, rngW, gs);
    (globalThis as { __swFlCap?: unknown }).__swFlCap = undefined;
    writeFileSync('/tmp/yyyyy-m-flowers-cells.txt', flLog.join('\n') + '\n');
  } else if (process.env.SW_YY4_PASS === 'vines') {
  } else if (process.env.SW_YY4_PASS === 'vines') {
    const vLog: string[] = [];
    (globalThis as { __swVinesCap?: (s: string) => void }).__swVinesCap = (s2) => { vLog.push(`${spanLines.length} ${s2}`); };
    runVinesPass(st, rngW, gs);
    (globalThis as { __swVinesCap?: unknown }).__swVinesCap = undefined;
    writeFileSync('/tmp/yyyyy-m-vines-calls.txt', vLog.join('\n') + '\n');
  } else {
    runPilesPass(st, rngW, gs);
  }
  (globalThis as { __swPilesCap?: unknown }).__swPilesCap = undefined;
  __setGenStateForProbe(null);
  if (spanPath) { writeFileSync(spanPath, spanLines.join('\n') + '\n'); console.log(`  [span] rolls=${spanLines.length} → ${spanPath}`); }
  writeFileSync('/tmp/yyyyy-m-piles-calls.txt', pileLog.join('\n') + '\n');
  diffStore(process.env.SW_YY4_PASS === 'vines' ? 'replay-vines' : 'replay-piles', Number(process.env.SW_YY4_DUMP ?? 77), st);
}, 900_000);
