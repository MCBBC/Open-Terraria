// SSSSSSSS2 一次性诊断（2026-08-27）：Traps pass 隔离重放 + 与 x86 rig 同构双仪——
//   ①HashMark 分组账本（att/pt/ptr + 滚动 FNV,格式逐字节同 JJHook.HashMark 输出）
//   ②TrapEv placeTrap 事件流（A/C/E/D/T/K/BXC/VID/DTW 锚,rig WorldGen.cs 同位插入）
// 用法：cd game && SW_TRAPREPLAY=1 npx vitest run tools/_sss2traps.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_TRAPREPLAY === '1';
const G2 = process.env.SW_TG2 ?? '/tmp/jjj-out/g1457-notraps';
const SEEDTXT = process.env.SW_TSEED ?? '1896728457';
const EVIL = Number(process.env.SW_TEVIL ?? 1);
const PRE = Number(process.env.SW_TPRE ?? 75);
const NAMES: Record<number, string> = {
  75: 'Place_Fallen_Log', 76: 'Traps',
};
const FLAGS = (process.env.SW_TFLAGS ?? 'noTraps').split(',').filter(Boolean)
  .reduce<Record<string, boolean>>((m, f) => ((m[f] = true), m), {});
const W = 4200, H = 1200;
const OUTDIR = process.env.SW_SSS2OUT ?? '/tmp/sss2-out';

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

const p3 = (n: number) => String(n).padStart(3, '0');
function chan8(st: TileStore, idx: number) {
  st.type = new Uint16Array(readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.typ`).buffer.slice(0)).map(t => REV.get(t) ?? 0);
  st.flags = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.act`);
  st.wall = new Uint16Array(readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.wal`).buffer.slice(0));
  st.liquid = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.liq`);
  st.half = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.half`);
  st.slope = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.slope`);
  const lty = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.lty`);
  const ia = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.inact`);
  for (let i = 0; i < W * H; i++) {
    st.liquidType[i] = st.liquid[i]! > 0 ? lty[i]! + 1 : 0;
    if ((ia[i] ?? 0) !== 0) st.wire![i] = (st.wire![i] ?? 0) | (1 << 5);
  }
}

(RUN ? it : it.skip)('traps replay + hmark/trapEv dual stream', async () => {
  const base = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS });
  const gs = base.gs;
  const st = base.world.store;
  chan8(st, PRE);
  console.log(`worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel}`);

  const hm = createWriteStream(`${OUTDIR}/j-hmark-sss2.txt`);
  const tr = createWriteStream(`${OUTDIR}/j-traptrace.txt`);
  const TEVMAX = Number(process.env.SW_TEVMAX ?? 3000000);
let tbuf: string[] = [], ebuf: string[] = [];
  const flushT = () => { if (tbuf.length) { hm.write(tbuf.join('\n') + '\n'); tbuf = []; } };
  const flushE = () => { if (ebuf.length) { tr.write(ebuf.join('\n') + '\n'); ebuf = []; } };

  // FNV-1a 滚动（C# uint 算术,Math.imul 位级一致——RRR2 教训③）
  let fnv = 2166136261 >>> 0;
  let ln = 0;
  let on = false;
  let eseq = 0;
  const G_ = globalThis as unknown as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swTrapHm?: (l: string) => void;
    __swTrapEv?: (kind: string, a: number, b: number, v: number) => void;
    __swRollN?: number;
  };
  G_.__swOnRoll = (v: number) => {
    if (!on) return;
    ++ln;
    G_.__swRollN = ln;
    fnv = Math.imul((fnv ^ v) >>> 0, 16777619) >>> 0;
    // 74M 行原始流仅按需开启
  };
  G_.__swTrapHm = (label: string) => {
    if (!on) return;
    tbuf.push(`${label} ln=${ln} hash=${fnv}`);
    flushT();
  };
  G_.__swTrapEv = (kind: string, a: number, b: number, v: number) => {
    if (!on || eseq >= TEVMAX) return;
    ebuf.push(`++${++eseq}|${kind}|${a}|${b}|${v}|ln${ln}|rc${ln}`);
    if (ebuf.length >= 65536) flushE();
  };

  base.rng.reseed(base.seed);
  on = true;
  const t0 = Date.now();
  try {
    runTrapsPass(st, base.rng, gs, undefined);
  } catch (e) {
    pushExc(String(e));
    throw e;
  } finally {
    on = false;
  }
  function pushExc(s: string): void { tbuf.push(`#EXC ${s}`); }

  await new Promise<void>((res) => {
    flushT();
    flushE();
    hm.end(() => res());
  });
  console.log(`runTrapsPass done ${((Date.now() - t0) / 1000).toFixed(1)}s total_rolls=${ln}`);
  console.log(`hmark=${OUTDIR}/j-hmark-sss2.txt traptrace=${OUTDIR}/j-traptrace.txt ev=${eseq}`);
}, 600000);
