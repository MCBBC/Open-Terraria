// RRRRRRR2 一次性诊断（2026-08-27）：Traps pass 隔离重放＋分段掷流标定——与 x86
// rig JJHook.HashMark（traps-head/post-mainloop/post-tnt/sand-head/sand-gN/post-sand）
// 同名同位标定逐段对拍；__swOnRoll 原始值流写盘供前缀对拍。
// 用法：cd game && SW_TRAPREPLAY=1 npx vitest run tools/_rrrr2traps.test.ts
import { it } from 'vitest';
import { readFileSync, createWriteStream } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_TRAPREPLAY === '1';
const G2 = process.env.SW_TG2 ?? '/tmp/rrrr-out/x86-notraps';
const SEEDTXT = process.env.SW_TSEED ?? '1896728457';
const EVIL = Number(process.env.SW_TEVIL ?? 1);
const PRE = Number(process.env.SW_TPRE ?? 75), POST = Number(process.env.SW_TPOST ?? 76);
const NAMES: Record<number, string> = { 75: 'Place_Fallen_Log', 76: 'Traps' };
const W = 4200, H = 1200;
const OUT = process.env.SW_TROLL_PATH ?? '/tmp/rrrr2-out/j-traps-roll.txt';

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

(RUN ? it : it.skip)('traps replay + hashmark stream', async () => {
  const seedFlags = { noTraps: true } as Record<string, boolean>;
  const base = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1, seedFlags });
  const gs = base.gs;
  const st = base.world.store;
  chan8(st, PRE);
  console.log(`worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel}`);

  // 样本流＋分段标定写入同一文件（# 行为标定，其余为 "ln v"）
  const ws = createWriteStream(OUT);
  let buf: string[] = [];
  const push = (l: string) => {
    buf.push(l);
    if (buf.length >= 65536) { ws.write(buf.join('\n') + '\n'); buf = []; }
  };
  let ln = 0;
  let on = false;
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v: number) => {
    if (!on) return;
    push(`${++ln} ${v}`);
    (globalThis as unknown as { __swRollN?: number }).__swRollN = ln;
  };
  (globalThis as unknown as { __swTrapHm?: (l: string) => void }).__swTrapHm = (label: string) => {
    push(`#HM ${label} ln=${ln}`);
    if (buf.length >= 100) { ws.write(buf.join('\n') + '\n'); buf = []; }
  };

  base.rng.reseed(base.seed);
  on = true;
  const t0 = Date.now();
  try {
    runTrapsPass(st, base.rng, gs, undefined);
  } catch (e) {
    push(`#EXC ${String(e)}`);
    throw e;
  } finally {
    on = false;
  }
  console.log(`runTrapsPass done ${((Date.now() - t0) / 1000).toFixed(1)}s total_rolls=${ln}`);
  await new Promise<void>((res) => {
    if (buf.length) ws.write(buf.join('\n') + '\n');
    buf = [];
    ws.end(() => res());
  });
  console.log(`stream=${OUT} lines=${ln}`);
}, 600000);
