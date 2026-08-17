// 一次性：#71 Pots 隔离重放（dump070(Quick_Cleanup 末) → runPotsPass → dump071(Pots 末)）。
// 用法：SW_POTISO=1 npx vitest run tools/_potiso.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_POTISO === '1';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runPotsPass } from '../src/world/gen/vanilla/PotsPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const IDX_IN = 70, IDX_OUT = 71;
const NAMES: Record<number, string> = { 70: 'Quick_Cleanup', 71: 'Pots' };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function buildStore(idx: number): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let lt: Uint8Array | null = null;
  try { lt = readFileSync('/tmp/sw-pot-liqtype.bin'); } catch { /* ignore */ }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = lt ? (lt[i] ?? 0) : (l[i]! > 0 ? 1 : 0);
  }
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

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

let gsPot: GenState | null = null;

(RUN ? it : it.skip)('#71 Pots isolated replay', async () => {
  const g0 = globalThis as { __swPotCap?: (gs: GenState, st: TileStore) => void };
  g0.__swPotCap = (gs, st) => {
    if (!gsPot) {
      gsPot = cloneGs(gs);
      try { writeFileSync('/tmp/sw-pot-liqtype.bin', st.liquidType); } catch { /* ignore */ }
    }
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g0.__swPotCap = undefined;
  }
  if (!gsPot) throw new Error('gs capture failed');

  const st = buildStore(IDX_IN);
  const { rng, box } = countedRng(gsPot.seed);
  const tIn = new Uint16Array(load(IDX_IN, 'typ').buffer.slice(0));
  const aIn = load(IDX_IN, 'act');
  const tOut = new Uint16Array(load(IDX_OUT, 'typ').buffer.slice(0));
  const aOut = load(IDX_OUT, 'act');
  const potLog: string[] = [];
  const scanLog: string[] = [];
  let curAtt = '?';
  const g1 = globalThis as { __swPotTrace?: (s: string) => void; __swPotScan?: (s: string) => void };
  g1.__swPotTrace = (s) => potLog.push(s);
  g1.__swPotScan = (s) => {
    const m = /^A n=(\d+) att=(\d+) y0=(\d+) x=(\d+)/.exec(s);
    if (m) {
      if (+m[1]! === 3) { scanLog.push(`== ${s}`); curAtt = `att${m[2]}`; }
      return;
    }
    if (scanLog.length && scanLog.length < 900) scanLog.push(`[${curAtt}] ${s}`);
  };
  try {
    runPotsPass(st, rng, gsPot);
  } finally {
    g1.__swPotTrace = undefined;
    g1.__swPotScan = undefined;
  }
  // pot3 各 attempt 摘要：首/末候选行
  const atts: string[] = [];
  for (let k = 0; k < scanLog.length; k++) {
    if (!scanLog[k]!.startsWith('== ')) continue;
    let last = '';
    for (let q = k + 1; q < scanLog.length && !scanLog[q]!.startsWith('== '); q++) last = scanLog[q]!;
    atts.push(`${scanLog[k]} … ${last}`);
  }
  console.log('  pot3 attempts:', atts.join('\n    '));
  console.log(`JS draws=${box.n} pots=${potLog.length}`);
  // 前 400 个罐：v=vanilla dump 同位有罐？
  const head: string[] = [];
  let firstBad = -1;
  for (let k = 0; k < potLog.length && k < 400; k++) {
    const m = /(\d+),(\d+)/.exec(potLog[k]!)!;
    const x = +m[1]!, y = +m[2]!;
    const i0 = y * W + x;
    const van = tOut[i0] === 28 && aOut[i0];
    if (!van && firstBad < 0) firstBad = k;
    if (k < 40 || (!van && head.length < 12)) head.push(`#${k}@${x},${y}${van ? '' : ' ✗'}`);
  }
  console.log(`  first mismatched pot idx=${firstBad}`);
  console.log('  head:', head.join(' '));
  let vpots = 0, jpots = 0, both = 0;
  const samples: string[] = [];
  for (let i = 0; i < W * H; i++) {
    const v = tOut[i] === 28 && aOut[i] && tIn[i] !== 28 ? 1 : 0;
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    const j = st.flags[i] && jT === 28 && tIn[i] !== 28 ? 1 : 0;
    if (v) vpots++;
    if (j) jpots++;
    if (v && j) both++;
    if (v !== j && samples.length < 10) samples.push(`(${i % W},${(i / W) | 0})v${v}j${j}`);
  }
  console.log(`new pots: vanilla=${vpots} js=${jpots} both=${both} | mismatch=${vpots + jpots - 2 * both}`);
  console.log('  samples:', samples.join(' '));
}, 600_000);
