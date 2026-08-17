// 一次性（II 批 #98）：pass 98 独立重放 + P(2789) 窗口逐掷/列级账本。
// 真值 = /tmp/sw-ddfin/cactus.txt；FNV 锚（vanilla P 掷位）：P2789@833049 / P2940@878875。
// gs 快照缓存 /tmp/sw-ddfin-js/cap.json。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runCactusPalmTreesAndCoralPass, setCcTrace } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string) => readFileSync(`${VG}/097_Settle_Liquids_Again.${ext}`);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

function buildStore(): TileStore {
  const t = new Uint16Array(load(97, 'typ').buffer.slice(0));
  const a = load(97, 'act');
  const w = new Uint16Array(load(97, 'wal').buffer.slice(0));
  const l = load(97, 'liq');
  const half = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.half').buffer.slice(0));
  const slope = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.slope').buffer.slice(0));
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  st.slope.set(slope);
  st.half.set(half);
  return st;
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}
function urFnv(rng: RNG): string {
  const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    v = v >>> 0;
    for (let s = 0; s < 32; s += 8) { h = (h ^ ((v >>> s) & 0xff)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  };
  for (let k = 0; k < ur.seedArray.length; k++) mix(ur.seedArray[k]!);
  mix(ur.inext);
  return h.toString(16).padStart(8, '0');
}

interface Draw { at: number; kind: string; v: number }

(RUN ? it : it.skip)('cc P(2789) window ledger', async () => {
  let gs: GenState;
  const CAP = '/tmp/sw-ddfin-js/cap.json';
  if (existsSync(CAP)) {
    gs = JSON.parse(readFileSync(CAP, 'utf8')) as GenState;
  } else {
    let cap: GenState | null = null;
    const g0 = globalThis as { __swCcCap?: (gs: GenState, st: TileStore) => void };
    g0.__swCcCap = (g) => { if (!cap) cap = g; };
    try { await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } }); }
    catch (e) { console.log('pipeline EX(忽略):', String(e).slice(0, 160)); }
    finally { g0.__swCcCap = undefined; }
    if (!cap) throw new Error('gs capture failed');
    gs = cap;
    writeFileSync(CAP, JSON.stringify(gs));
  }

  const vanAll = readFileSync('/tmp/sw-ddfin/cactus.txt', 'utf8').split('\n')
    .filter((l) => l.startsWith('P ') || l.startsWith('K '));

  // ── 跑 1：P/K 链对拍 + P(2789) 逐试掷 ──
  {
    const st = buildStore();
    const { rng, box } = countedRng(gs.seed);
    const events: string[] = [];
    const trace: { i2: number; j2: number; drawsAt: number }[] = [];
    let loopEnd = 0, inP = false;
    setCcTrace({
      plant: (i, j) => { events.push(`P ${i} ${j} ${urFnv(rng)}@${box.n}`); inP = i === 2789 && j === 251; },
      kill: (i, j) => events.push(`K ${i} ${j}`),
      grow: (i2, j2) => {
        if (!inP) return;
        trace.push({ i2, j2, drawsAt: box.n });
        if (trace.length === 150) { loopEnd = box.n; inP = false; }
      },
    });
    runCactusPalmTreesAndCoralPass(st, rng, gs);
    setCcTrace(null);
    let firstMis = -1;
    const n = Math.min(events.length, vanAll.length);
    for (let k = 0; k < n; k++) {
      const a = events[k]!.split(' '), b = vanAll[k]!.split(' ');
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) { firstMis = k; break; }
    }
    console.log(`run1: draws=${box.n} P=${events.filter((e) => e[0] === 'P').length} firstMismatch=${firstMis}`);
    for (let k = Math.max(0, firstMis - 1); k < Math.min(n, firstMis + 3); k++) {
      console.log(`${k === firstMis ? '>>' : '  '}[${k}] js=${events[k]} van=${vanAll[k]}`);
    }
    const dist: Record<number, number> = {};
    for (let k = 0; k < trace.length; k++) {
      const g = (k + 1 < trace.length ? trace[k + 1]!.drawsAt - trace[k]!.drawsAt : loopEnd - trace[k]!.drawsAt) - 2;
      dist[g] = (dist[g] ?? 0) + 1;
    }
    console.log(`P2789 loop: entry@${trace.length ? '?' : ''}${833049} end@${loopEnd} (Δ=${loopEnd - 833049}) growRolls=${JSON.stringify(dist)}`);
  }

  // ── 跑 2：逐掷账本（列骰/燕麦/绿洲/棕榈/位置掷形态分类）──
  {
    const st = buildStore();
    const { rng, box } = countedRng(gs.seed);
    const draws: Draw[] = [];
    const marks: { at: number; tag: string }[] = [];
    const r2 = rng as unknown as Record<string, (...a: number[]) => number>;
    const oInt = r2.nextInt.bind(rng), oRange = r2.int.bind(rng);
    r2.nextInt = (mv: number) => { const v = oInt(mv); if (box.n > 830000) draws.push({ at: box.n, kind: `I${mv}`, v }); return v; };
    r2.int = (a: number, b: number) => { const v = oRange(a, b); if (box.n > 830000) draws.push({ at: box.n, kind: `R${a}_${b}`, v }); return v; };
    let pcount = 0;
    setCcTrace({
      plant: () => { pcount++; marks.push({ at: box.n, tag: `P#${pcount}` }); },
      kill: (i, j) => marks.push({ at: box.n, tag: `K${i},${j}` }),
      place: (x, y) => marks.push({ at: box.n, tag: `L${x},${y}` }),
    });
    runCactusPalmTreesAndCoralPass(st, rng, gs);
    setCcTrace(null);
    // 逐掷账本落盘(按区间)
    const win = draws.filter((d) => d.at >= 833049 && d.at <= 880500);
    writeFileSync('/tmp/sw-ddfin-js/ledger.txt',
      win.map((d) => `${d.at} ${d.kind}=${d.v}`).join('\n') + '\n' +
      marks.filter((m) => m.at > 833000 && m.at < 880500).map((m) => `@${m.at} ${m.tag}`).join('\n') + '\n');
    // 形态统计 + 列骰序列(段内)
    const kinds: Record<string, number> = {};
    for (const d of win) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
    console.log('window kinds:', JSON.stringify(kinds));
    const dice = win.filter((d) => d.kind === 'I8');
    console.log(`I8 dice count=${dice.length} first.at=${dice[0]?.at} hits=${dice.filter((d) => d.v === 0).length}`);
    // P(2789) 前后列骰值序列(2780..2950 段)
    console.log('dice seq:', dice.slice(-30).map((d) => `${d.at % 100000}:${d.v}`).join(' '));
    const pm = marks.filter((m) => m.at > 833000 && m.at < 880500);
    console.log('marks:', pm.slice(0, 12).map((m) => `${m.at} ${m.tag}`).join(' | '), '...', pm.slice(-4).map((m) => `${m.at} ${m.tag}`).join(' | '));
  }
}, 480000);
