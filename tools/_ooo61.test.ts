// OOOOO 批一次性探针（2026-08-19）：三链 #61/62 水箱/海底箱域定量。
// 捕获 JS 侧 reseed 点通道快照（全量）+ 箱槽切片 + placeBuriedChest 尝试流
// （__swChestEv 钩子），与金标 dump 全格对拍 + 段间 delta。
// 用法：cd game && SW_OOO=1 SW_OOO_SEED=12345 SW_OOO_EVIL=1 SW_OOO_W=4200 SW_OOO_H=1200 \
//   SW_OOO_G2=/tmp/sw-slp/g12345 SW_OOO_CAPS=UnderwaterChests:61,SpiderCaves:62 \
//   npx vitest run tools/_ooo61.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_OOO === '1';
const SEED = process.env.SW_OOO_SEED ?? '12345';
const EVIL = Number(process.env.SW_OOO_EVIL ?? 0);
const W = Number(process.env.SW_OOO_W ?? 4200), H = Number(process.env.SW_OOO_H ?? 1200);
const N = W * H;
const G2 = process.env.SW_OOO_G2 ?? '/tmp/sw-slp/g12345';
// "Label:dumpIdx,Label:dumpIdx" —— 在该 reseed 点快照并对拍该 dump
const CAPS = (process.env.SW_OOO_CAPS ?? 'UnderwaterChests:61,SpiderCaves:62')
  .split(',').map(s => { const [lab, idx] = s.split(':'); return { lab, idx: Number(idx) }; });

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
const le8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));

interface Snap {
  label: string; idx: number;
  t: Int32Array; a: Uint8Array; l: Uint8Array; lt: Uint8Array;
  sl: Uint8Array; hf: Uint8Array; w: Uint16Array;
  nChests: number;
}
const snaps: Snap[] = [];

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

// chest 尝试流（placeBuriedChest 现有 __swChestEv 钩子）
interface ChestEv { seg: string; kind: string; i: number; j: number; ok: number }
const chestEvs: ChestEv[] = [];
let curLabel = '(pre)';

// 掷骰流日志（SW_OOO_ROLLSEG 指定段）
const ROLLSEG = process.env.SW_OOO_ROLLSEG ?? '';
const rollLog: string[] = [];
let rollIdx = 0;

(RUN ? it : it.skip)('OOOOO #61/62 JS 侧全量对拍', async () => {
  const g0 = globalThis as Record<string, unknown>;
  g0.__swChestEv = (kind: string, i: number, j: number, x?: number) => {
    chestEvs.push({ seg: curLabel, kind, i, j, ok: x ?? -2 });
  };
  const chestDbg: string[] = [];
  g0.__swChestDbg = (i: number, gy: number, why: string) => {
    chestDbg.push(`  [${curLabel}] place fail (${i},${gy}): ${why}`);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oInt = RNGp.int as (this: unknown, min: number, max: number) => number;
  const oNextInt = RNGp.nextInt as (this: unknown, max: number) => number;
  const oNextIntRange = RNGp.nextIntRange as (this: unknown, min: number, max: number) => number;
  const oNext = RNGp.next as (this: unknown) => number;
  if (ROLLSEG) {
    const wrap = <T,>(name: string, orig: (this: unknown, ...a: number[]) => T, argc: number) =>
      function (this: unknown, ...a: number[]): T {
        const r = orig.apply(this, a);
        if (curLabel === ROLLSEG) rollLog.push(`#${rollIdx++} ${name}(${a.slice(0, argc).join(',')}) => ${String(r)}`);
        return r;
      };
    RNGp.int = wrap('int', oInt as never, 2);
    RNGp.nextInt = wrap('nextInt', oNextInt as never, 1);
    RNGp.nextIntRange = wrap('range', oNextIntRange as never, 2);
    RNGp.next = wrap('next', oNext as never, 0);
  }
  let curStore: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array } | null = null;
  let curChests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> | null = null;
  const want = new Map(CAPS.map(c => [c.lab, c.idx] as const));
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_ooo61')) {
        const lab = labelOf(m[1], Number(m[2]));
        curLabel = lab;
        const idx = want.get(lab);
        if (idx !== undefined && curStore && !snaps.some(sp => sp.label === lab)) {
          const t = new Int32Array(N), a = new Uint8Array(N), l = new Uint8Array(N),
            lt = new Uint8Array(N), sl = new Uint8Array(N), hf = new Uint8Array(N), w = new Uint16Array(N);
          for (let q = 0; q < N; q++) {
            t[q] = SHEET[curStore.type[q]!]! >= 0 ? SHEET[curStore.type[q]!]! : 9999;
            a[q] = curStore.flags[q]! & 1; l[q] = curStore.liquid[q]!;
            lt[q] = curStore.liquidType[q]!; sl[q] = curStore.slope[q]!;
            hf[q] = curStore.half[q]!; w[q] = curStore.wall[q]!;
          }
          snaps.push({ label: lab, idx, t, a, l, lt, sl, hf, w, nChests: curChests ? curChests.length : -1 });
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (world) => {
        if (!curStore) {
          curStore = world.store as never;
          curChests = world.chests as never;
        }
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    if (ROLLSEG) {
      RNGp.int = oInt; RNGp.nextInt = oNextInt; RNGp.nextIntRange = oNextIntRange; RNGp.next = oNext;
      console.log(`### roll stream seg=${ROLLSEG} (${rollLog.length} draws):`);
      for (const ln of rollLog) console.log('  ' + ln);
    }
    console.log(`### chest place-fail reasons (${chestDbg.length}):`);
    for (const ln of chestDbg.filter(l => l.includes(`[${ROLLSEG || "x"}]`))) console.log(ln);
    delete g0.__swChestEv;
    delete g0.__swChestDbg;
  }

  // ---- ① 各捕获点 vs 金标 dump 全格对拍 ----
  for (const sp of snaps) {
    const gt = le16(gPath(sp.idx, 'typ')), ga = le8(gPath(sp.idx, 'act')),
      gl = le8(gPath(sp.idx, 'liq')), glt = le8(gPath(sp.idx, 'lty')),
      gsl = le8(gPath(sp.idx, 'slope')), ghf = le8(gPath(sp.idx, 'half')), gw = le16(gPath(sp.idx, 'wal'));
    const lines: string[] = [];
    let n = 0;
    for (let q = 0; q < N; q++) {
      const d: string[] = [];
      if (ga[q] !== sp.a[q]) d.push(`A${ga[q]}>${sp.a[q]}`);
      const vt = ga[q] ? gt[q] : 0, jt = sp.a[q] ? sp.t[q] : 0;
      if (vt !== jt) d.push(`T${vt}>${jt}`);
      if (gw[q] !== sp.w[q]) d.push(`W${gw[q]}>${sp.w[q]}`);
      if (gl[q] !== sp.l[q]) d.push(`L${gl[q]}>${sp.l[q]}`);
      const vl = gl[q] > 0 ? glt[q] + 1 : 0, jl = sp.l[q] > 0 ? sp.lt[q] : 0;
      if (vl !== jl) d.push(`Y${vl}>${jl}`);
      if (gsl[q] !== sp.sl[q]) d.push(`S${gsl[q]}>${sp.sl[q]}`);
      if (ghf[q] !== sp.hf[q]) d.push(`H${ghf[q]}>${sp.hf[q]}`);
      if (d.length) { n++; lines.push(`(${q % W},${(q / W) | 0}) ${d.join(' ')}`); }
    }
    console.log(`### ${sp.label} vs dump${String(sp.idx).padStart(3, '0')}_${DUMPNAME.get(sp.idx)}: ${n} diff cells (chests=${sp.nChests})`);
    for (const ln of lines) console.log('  ' + ln);
  }

  // ---- ② 段间 JS delta（连续快照） ----
  for (let k = 1; k < snaps.length; k++) {
    const A = snaps[k - 1]!, B = snaps[k]!;
    const lines: string[] = [];
    for (let q = 0; q < N; q++) {
      const d: string[] = [];
      if (A.a[q] !== B.a[q]) d.push(`act ${A.a[q]}>${B.a[q]}`);
      if (A.t[q] !== B.t[q]) d.push(`typ ${A.t[q]}>${B.t[q]}`);
      if (A.l[q] !== B.l[q]) d.push(`liq ${A.l[q]}>${B.l[q]}`);
      if (A.sl[q] !== B.sl[q]) d.push(`sl ${A.sl[q]}>${B.sl[q]}`);
      if (A.hf[q] !== B.hf[q]) d.push(`hf ${A.hf[q]}>${B.hf[q]}`);
      if (A.w[q] !== B.w[q]) d.push(`wal ${A.w[q]}>${B.w[q]}`);
      if (d.length) lines.push(`(${q % W},${(q / W) | 0}) ${d.join(',')}`);
    }
    console.log(`### JS delta ${A.label} -> ${B.label}: ${lines.length} cells`);
    for (const ln of lines) console.log('  ' + ln);
  }

  // ---- ③ chest 尝试流（尾段三段） ----
  const segs = new Set(chestEvs.map(e => e.seg));
  const order = [...segs];
  for (const seg of order) {
    const evs = chestEvs.filter(e => e.seg === seg);
    const ok = evs.filter(e => e.kind === 'abx' && e.ok === 1);
    console.log(`### seg ${seg}: attempts=${evs.filter(e => e.kind === 'ab').length} ok=${ok.length}`);
    for (const e of evs) {
      if (e.kind === 'ab') console.log(`  try(${e.i},${e.j})`);
      else console.log(`  -> ${e.ok === 1 ? 'OK' : 'FAIL'}`);
    }
  }
  // 成功位（i,j → 箱左上 (i-1, gy-2)；gy 未知,仅记尝试点序）
  console.log(`### chest ok stream (seg, i, j):`);
  for (const e of chestEvs.filter(e => e.kind === 'abx' && e.ok === 1)) console.log(`  ${e.seg} (${e.i},${e.j})`);
}, 900_000);
