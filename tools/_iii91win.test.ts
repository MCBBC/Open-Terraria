// IIII87 批（五迷你链接力收尾）反演重放窗口仪：
//   相 1：全管线跑到目标带/槽头捕获（WorldGen.ts i91Cap 全槽钩 + i87Cap 七带钩），
//         快照 (store 八通道+帧 / gs / chests) 后 .swAbort 停管。
//   相 2：truth dump(基座 idx=exit-1，带帧)→TileStore + 捕获 gs/chests + fresh RNG
//         单跑目标 pass → 对拍 truth 出口 dump 八通道（帧差仅信息位）。
//   seg = dungeon(sparkle/rainbow #32) / vines(sgis #89) / microbiomes(sgis #97) /
//         stalac(sgis #103) / finalcleanup(fishmox #105)
// 用法：cd game && SW_I91=1 SW_I91_SEG=dungeon \
//         SW_I91_G2=/tmp/iii80-out/x86-sparkle SW_I91_SEED=771004 \
//         SW_I91_EVIL=0 SW_I91_FLAGS=hallowOnTheSurface npx vitest run tools/_iii91win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runVinesPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { finalizeSecretSeedDoEnds } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { finalSeedCleanup } from '../src/world/gen/vanilla/FinalSeedCleanupPass';
import { finalGenMergeScan } from '../src/world/liquid/settle';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_I91;
// ★IIIII87 双端步骰仪：SW_I91_ROLLLOG=<out> 时跑全管线并按 ▶label 边界切分样本流，
//   仅输出 SW_I91_RLSEG 标签段（如 Dungeon）的主流值序列 `ln|value`，与 rig
//   SW_TAGLOG 逐行对齐 —— 首个分歧 ln 即真凶消费点。
const ROLLOUT = process.env.SW_I91_ROLLLOG ?? '';
const RLSEG = process.env.SW_I91_RLSEG ?? 'Dungeon';
// 槽名邻接表：开窗=上一槽结束后、关窗=目标槽结束
const PREV_OF: Record<string, string> = {
  '生物群系': '洞穴', '微群系': '钟乳石宝石树',
};const G2 = process.env.SW_I91_G2 ?? '/tmp/iii80-out/x86-sparkle';
const SEED = process.env.SW_I91_SEED ?? '771004';
const EVIL = Number(process.env.SW_I91_EVIL ?? 0);
const W = Number(process.env.SW_I91_W ?? 4200), H = Number(process.env.SW_I91_H ?? 1200);
const N = W * H;
const SEG = process.env.SW_I91_SEG ?? 'dungeon';
const OUT = process.env.SW_I91_OUT ?? `/tmp/iii91-out/win-${SEG}.json`;
const TRACE = process.env.SW_I91_TRACE === '1';

const M8_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I91_FLAGS ?? '').split(',').filter(Boolean)) {
  M8_FLAGS[f] = true;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

interface Ch {
  t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
  frx?: Uint16Array; fry?: Uint16Array;
}
function le16(path: string): Uint16Array {
  const b = readFileSync(path);
  return new Uint16Array(b.buffer.slice(0));
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
const chCache = new Map<number, Ch>();
function chOf(idx: number): Ch {
  const hit = chCache.get(idx);
  if (hit) return hit;
  const nm = DUMPNAME.get(idx);
  if (!nm) throw new Error(`seg ${SEG}: 缺 dump 名 #${idx}`);
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  let frames = false;
  try { readFileSync(`${pre}.frx`); frames = true; } catch { /* 无帧链 */ }
  const c: Ch = {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
    ...(frames ? { frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) } : {}),
  };
  chCache.set(idx, c);
  return c;
}

function loadStore(c: Ch): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    if (c.frx && c.fry) { st.frameX[i] = c.frx[i]; st.frameY[i] = c.fry[i]; }
    if (c.ia[i]) st.wire[i] |= 32;
  }
  return st;
}

interface StoreView {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  frameX?: Uint16Array; frameY?: Uint16Array;
}
function jsSheet(st: StoreView, i: number): number {
  if (!st.flags[i]) return 0;
  return SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999;
}

function diffBoard(tag: string, xs: Ch, st: StoreView, cellCap = 30): Record<string, unknown> {
  const chs = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, dFx: 0, dFy: 0 };
  const pair = new Map<string, number>();
  const reg = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  let first = '';
  for (let i = 0; i < N; i++) {
    const va = xs.a[i], ja = st.flags[i] & 1;
    let bad = false;
    if (va !== ja) { chs.dA++; bad = true; }
    const vt = va ? xs.t[i] : 0, jt = ja ? jsSheet(st, i) : 0;
    if (vt !== jt) {
      chs.dT++; bad = true;
      pair.set(`T${vt}>${jt}`, (pair.get(`T${vt}>${jt}`) ?? 0) + 1);
    }
    if (xs.w[i] !== st.wall[i]) {
      chs.dW++; bad = true;
      pair.set(`W${xs.w[i]}>${st.wall[i]}`, (pair.get(`W${xs.w[i]}>${st.wall[i]}`) ?? 0) + 1);
    }
    if (xs.l[i] !== st.liquid[i]) { chs.dL++; bad = true; }
    if (xs.hf[i] !== st.half[i]) { chs.dHf++; bad = true; }
    if (xs.sl[i] !== st.slope[i]) { chs.dSl++; bad = true; }
    if ((xs.ia[i] ? 1 : 0) !== ((st.wire[i] >>> 5) & 1)) { chs.dIa++; bad = true; }
    const vl = xs.l[i] > 0 ? xs.lt[i] + 1 : 0;
    const jl = st.liquid[i] > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) { chs.dLt++; bad = true; }
    if (!bad && xs.frx && xs.fry && st.frameX && st.frameY
      && (xs.frx[i] !== st.frameX[i] || xs.fry[i] !== st.frameY[i])) {
      if (xs.frx[i] !== st.frameX[i]) chs.dFx++;
      if (xs.fry[i] !== st.frameY[i]) chs.dFy++;
    }
    if (!bad) continue;
    if (!first) first = `(${i % W},${Math.floor(i / W)})`;
    const rk = `${Math.floor((i % W) / 200)}_${Math.floor((i / W) / 200)}`;
    reg.set(rk, (reg.get(rk) ?? 0) + 1);
    if (cells.length < cellCap) cells.push([i % W, Math.floor(i / W)]);
  }
  console.log(`[${tag}] ${JSON.stringify(chs)} first=${first}`);
  console.log('  pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `${k}×${v}`).join(' ') || '(none)');
  console.log('  regions:', [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `b${k}=${v}`).join(' ') || '(none)');
  return { tag, ...chs, first, pairs: [...pair.entries()], cells, regions: [...reg.entries()] };
}

interface Cap { store: StoreView; gs: GenState; chests: unknown[] }
let cap: Cap | null = null;

function deepCopyGs(g: GenState): GenState {
  try { return structuredClone(g); } catch { return JSON.parse(JSON.stringify(g)); }
}

const SLOT_OF: Record<string, string | null> = {
  dungeon: null, vines: '藤蔓', microbiomes: '微群系', stalac: '钟乳石宝石树', finalcleanup: '终清理',
};
const EXIT_IDX: Record<string, number> = { dungeon: 32, vines: 89, microbiomes: 97, stalac: 103, finalcleanup: 105 };

(RUN ? it : it.skip)('IIIII87 五迷你链反演重放窗口仪', async () => {
  console.log(`seg=${SEG} G2=${G2} flags=${Object.keys(M8_FLAGS).join(',')} seed=${SEED}`);
  // ── 双端步骰仪模式：全管线跑通；reseed 调用点 ▶label 扫描定位 pass 边界，
  //    仅当 curLabel===RLSEG 时记主实例样本值（与 rig SW_TAGLOG 对齐）。──
  if (ROLLOUT) {
    const srcCache = new Map<string, string[]>();
    const labelOf = (file: string, line: number): string | null => {
      let src = srcCache.get(file);
      if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
      for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
        const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
        if (m) return m[1].trim();
      }
      return null;
    };
    let curLabel = '(pre)';
    const RNGp = RNG.prototype as unknown as Record<string, unknown>;
    const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
    RNGp.reseed = function (this: unknown, s: number) {
      try {
        const stack = new Error().stack ?? '';
        for (const line of stack.split('\n')) {
          const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
          if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii91win')) {
            const lb = labelOf(m[1], Number(m[2]));
            if (lb !== null && lb !== '') curLabel = lb;
            break;
          }
        }
      } catch { /* noop */ }
      return oReseed.call(this, s);
    };
    const vals: number[] = [];
    const valsB: number[] = [];
    let g = 0;
    const calls: Array<Record<string, unknown>> = [];
    const RLB = process.env.SW_I91_RLSEGB ?? '';
    (globalThis as { __swOnRoll?: (v?: number) => void }).__swOnRoll = (v) => {
      g++;
      if (curLabel === RLSEG && v !== undefined) vals.push(v);
      if (RLB && curLabel === RLB && v !== undefined) valsB.push(v);
    };
      if (process.env.SW_I91_TRTRACE === '1') {
      (globalThis as unknown as {
        __swTrCall?: (o2: Record<string, unknown>) => void;
      }).__swTrCall = (o2) => {
        const kOrd = calls.filter((c) => c.lb === curLabel && c.type === -1).length;
        calls.push({ g: g, lb: curLabel, kOrd, ...o2 });
      };
    }
    const t0 = Date.now();
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
    });
    if (calls.length && process.env.SW_I91_TRTRACE === '1') {
      for (const f of calls) f.e = f.s;
      writeFileSync(process.env.SW_I91_OUT ?? '/tmp/iii91-out/tr-calls.json', JSON.stringify({ firstVals: vals.length, calls: calls.filter((c: Record<string, unknown>) => c.lb === RLSEG) }, null, 1));
    }
    if (RLB) {
      const fd = require('node:fs').openSync(`${ROLLOUT}.B`, 'w');
      require('node:fs').writeSync(fd, `# seg=${RLB}\n`);
      const b2 = Buffer.alloc(16);
      for (let i = 0; i < valsB.length; i++) {
        require('node:fs').writeSync(fd, `${i + 1}|${valsB[i]}\n`);
      }
      void b2;
      require('node:fs').closeSync(fd);
    }
    console.log(`rolllog done ${(Date.now() - t0) / 1000}s lastLabel=${curLabel} samples=${vals.length}/${valsB.length} trCalls=${calls.length}`);
    writeFileSync(ROLLOUT, [`# seg=${RLSEG} seed=${SEED}`, ...vals.map((v, i) => `${i + 1}|${v}`)].join('\n') + '\n');
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
    RNGp.reseed = oReseed;
    return;
  }

  // ── 相 1：管线捕获 ──
  const rc = { n: 0 };
  (globalThis as { __swOnRoll?: () => void }).__swOnRoll = () => { rc.n++; };
  let done = false;
  let capSeenDg = false;
  const slotName = SLOT_OF[SEG] ?? '__never__';
  const grab = (stRaw: unknown, gRaw: unknown, chRaw: unknown): void => {
    if (done) return;
    done = true;
    cap = {
      store: stRaw as StoreView,
      gs: deepCopyGs(gRaw as GenState),
      chests: JSON.parse(JSON.stringify(chRaw ?? [])),
    };
  };
  (globalThis as { __swI91Cap?: unknown }).__swI91Cap =
    (st: unknown, g: unknown, ch: unknown, nm: string) => {
      if (done || nm !== slotName) return;
      grab(st, g, ch);
      const e = new Error('SW_I91_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
  if (SEG === 'dungeon') {
    (globalThis as { __swI87Seen?: number }).__swI87Seen = -1;
    (globalThis as { __swI87Cap?: unknown }).__swI87Cap = (stRaw: unknown, gRaw: unknown, chRaw: unknown) => {
      const seen = ((globalThis as { __swI87Seen?: number }).__swI87Seen ?? -1) + 1;
      (globalThis as { __swI87Seen?: number }).__swI87Seen = seen;
      if (seen !== 4 || done) return;
      grab(stRaw, gRaw, chRaw);
      capSeenDg = true;
      const e = new Error('SW_III87_ABORT');
      (e as Error & { swAbort?: boolean }).swAbort = true;
      throw e;
    };
  }
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(M8_FLAGS).length > 0 ? M8_FLAGS : undefined,
      onProgress: () => {},
    });
    if (!cap) throw new Error('capture failed：目标槽未到达');
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('ABORT')) throw e;
  }
  delete (globalThis as { __swI91Cap?: unknown }).__swI91Cap;
  delete (globalThis as { __swI87Cap?: unknown }).__swI87Cap;
  delete (globalThis as { __swI87Seen?: unknown }).__swI87Seen;
  delete (globalThis as { __swDgDecor?: unknown }).__swDgDecor;
  if (!cap) throw new Error('capture failed');
  console.log(`phase1 done ${(Date.now() - t0) / 1000}s rollCount=${rc.n} dgHead=${capSeenDg}`);

  // ── 相 2：真值基座装载 + 单段重放 ──
  const exitIdx = EXIT_IDX[SEG];
  if (exitIdx === undefined || !DUMPNAME.has(exitIdx)) throw new Error(`seg ${SEG}: 缺出口 dump`);
  const baseIdx = exitIdx - 1;
  const baseX = chOf(baseIdx);
  const st = loadStore(baseX);
  const sanity = diffBoard(`sanity:${baseIdx}_${DUMPNAME.get(baseIdx)}`, baseX, st as unknown as StoreView, 3);
  const tot = (sanity.dA as number) + (sanity.dT as number) + (sanity.dW as number)
    + (sanity.dL as number) + (sanity.dHf as number) + (sanity.dSl as number)
    + (sanity.dLt as number) + (sanity.dIa as number);
  if (tot > 0) console.log(`  ⚠ loader sanity 差 tot=${tot}——若上批该基座行非绿,后续读数不可解读`);
  else console.log(`loader sanity ✓ dump#${baseIdx}_${DUMPNAME.get(baseIdx)} 与 JS 捕获逐格相等`);

  // 帧踪仪装载（phase2 才收集——phase1 管线已在 DG 头停管）
  const liveDecor: unknown[] = [];
  if (TRACE) (globalThis as { __swDgDecor?: unknown[] }).__swDgDecor = liveDecor;
  const rng = new RNG(cap.gs.seed ?? Number(SEED));
  switch (SEG) {
    case 'dungeon':
      flipGenSolid([481, 482, 483], false);
      runDungeonPass(st, rng, cap.gs, cap.chests as never);
      flipGenSolid([481, 482, 483], true);
      break;
    case 'vines': runVinesPass(st, rng, cap.gs); break;
    case 'microbiomes': runMicroBiomesPass(st, rng, cap.gs, cap.chests as never); break;
    case 'stalac': runGemTreesPass(st, rng, cap.gs); break;
    case 'finalcleanup': {
      runFinalCleanupPass(st, cap.gs, rng, {
        chests: cap.chests as never,
        beforeShimmer: () => {
          finalizeSecretSeedDoEnds(st, rng, cap!.gs, { chests: cap!.chests, flags: {} } as never);
          finalSeedCleanup(st, cap!.gs.seedFlags ?? {}, cap!.chests as never);
        },
      });
      finalGenMergeScan(st, rng);
      break;
    }
    default: throw new Error(`unhandled seg ${SEG}`);
  }

  const row = diffBoard(`replay ${SEG}(${baseIdx}→${exitIdx})`, chOf(exitIdx), st as unknown as StoreView);
  if (TRACE && SEG === 'dungeon' && liveDecor.length) {
    for (const e of liveDecor) console.log('DECOR', JSON.stringify(e));
    writeFileSync(OUT.replace(/\.json$/, '') + '-decor.json', JSON.stringify(liveDecor));
    console.log(`decor accepts total=${liveDecor.length} -> ${OUT.replace(/\.json$/, '')}-decor.json`);
  }
  writeFileSync(OUT, JSON.stringify({ seg: SEG, seed: SEED, flags: Object.keys(M8_FLAGS), rows: [row] }, null, 1));
  console.log(`written ${OUT}`);
}, 900_000);
