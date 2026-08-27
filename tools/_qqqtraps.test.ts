// QQQQQQQQ 一次性诊断（2026-08-27）：Traps pass 隔离重放——以 x86 notraps 链
// dump075_Place_Fallen_Log 八通道重建 TileStore，rng.reseed(seed) 后单跑
// runTrapsPass，与 dump076_Traps 逐格 diff。用法：
//   SW_QTRAPS=1 npx vitest run tools/_qqqtraps.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_QTRAPS === '1';
const G2 = process.env.SW_QG2 ?? '/tmp/rrrr-out/x86-notraps';
const SEEDTXT = process.env.SW_QSEED ?? '1896728457';
const EVIL = Number(process.env.SW_QEVIL ?? 1);
const PRE = Number(process.env.SW_QPRE ?? 75), POST = Number(process.env.SW_QPOST ?? 76);
const NAMES: Record<number, string> = { 75: 'Place_Fallen_Log', 76: 'Traps' };
const W = 4200, H = 1200;

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
  const lty = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.lty`);   // vanilla 0 基
  const ia = readFileSync(`${G2}/${p3(idx)}_${NAMES[idx]}.inact`);
  for (let i = 0; i < W * H; i++) {
    st.liquidType[i] = st.liquid[i]! > 0 ? lty[i]! + 1 : 0;
    if ((ia[i] ?? 0) !== 0) st.wire![i] = (st.wire![i] ?? 0) | (1 << 5);
  }
}

(RUN ? it : it.skip)('traps replay vs x86 dump', () => {
  // gs 语境补齐：同种子 evil 同旗标跑 reset+terrain 拿 GenState/worldSurface 等
  const seedFlags = { noTraps: true } as Record<string, boolean>;
  const base = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1, seedFlags });
  const gs = base.gs;
  const world = base.world;
  const st = world.store;
  chan8(st, PRE);
  console.log(`worldSurface=${gs.worldSurface} rockLevel=${gs.rockLevel} beach=${gs.beachDistance}`);
  base.rng.reseed(base.seed);
  const t0 = Date.now();
  runTrapsPass(st, base.rng, gs, undefined);
  console.log(`runTrapsPass done ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 目标通道读取与 diff（typ 需映射回 sheet 比较；act/wall/half/slope/liq 直比）
  const tv = new Uint16Array(readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.typ`).buffer.slice(0));
  const av = readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.act`);
  const wv = new Uint16Array(readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.wal`).buffer.slice(0));
  const lv = readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.liq`);
  const hv = readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.half`);
  const sv = readFileSync(`${G2}/${p3(POST)}_${NAMES[POST]}.slope`);
  const pair = new Map<string, number>();
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, firstI = -1;
  const samples: string[] = [];
  for (let i = 0; i < W * H; i++) {
    let bad = false;
    const va = av[i]!, ja = st.flags[i];
    if (va !== ja) { bad = true; dA++; }
    const vtp = va ? tv[i]! : 0;
    const jtp = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (vtp !== jtp) {
      bad = true; dT++;
      const k = `T${vtp}>${jtp}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    } else if (bad && vtp === 0) {
      // 纯 act 差也归类
      pair.set('A-only', (pair.get('A-only') ?? 0) + 1);
    }
    if (wv[i]! !== st.wall[i]) { bad = true; dW++; pair.set(`W${wv[i]!}>${st.wall[i]}`, (pair.get(`W${wv[i]!}>${st.wall[i]}`) ?? 0) + 1); }
    if (lv[i]! !== st.liquid[i]) { bad = true; dL++; }
    if (hv[i]! !== st.half[i]) { bad = true; dHf++; }
    if (sv[i]! !== st.slope[i]) { bad = true; dSl++; }
    if (bad) {
      if (firstI < 0) firstI = i;
      if (samples.length < 10) samples.push(`(${i % W},${Math.floor(i / W)}) v${va ? vtp : '·'} j${ja ? jtp : '·'} w${wv[i]}/${st.wall[i]} a${va}${ja}`);
    }
  }
  console.log(`diff A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} first=${firstI >= 0 ? `(${firstI % W},${Math.floor(firstI / W)})` : '-'}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`samples: ${samples.join(' | ')}`);
}, 600000);

// ---- QQQQQQQQ 二期：样本流录制（SW_QROLL=1 时启用）——与 x86 SW_ROLLWIN/
//      SW_TAGRANGE 同格式（ln|v|api|frames）逐行对拍用。----
(RUN ? it : it.skip)('traps roll-stream capture', async () => {
  if (process.env.SW_QROLL !== '1') return;
  const seedFlags2 = { noTraps: true } as Record<string, boolean>;
  const base2 = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: EVIL as -1 | 0 | 1, seedFlags: seedFlags2 });
  const st2 = base2.world.store;
  chan8(st2, PRE);
  let ln = 0;
  let on = false;
  const lines: string[] = [];
  const tagOf = (): string => {
    const stack = new Error().stack ?? '';
    const frames: string[] = [];
    for (const l of stack.split('\n')) {
      const m = l.match(/src\/(world|core|data)\/[^\s()]+\.ts:\d+:\d+/);
      if (!m) continue;
      const fn = l.match(/at (\S+?) \(/)?.[1] ?? '?';
      if (fn.includes('Object.__swOnRoll') || fn.includes('tagOf')) continue;
      frames.push(fn + '@' + m[1].replace(/.*\/(\w+)\.ts$/, '$1') + ':' + m[0].match(/:(\d+):\d+$/)?.[1]);
      if (frames.length >= 4) break;
    }
    return frames.join('|');
  };
  (globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = () => {};
  const outPath = process.env.SW_QROLL_PATH ?? '/tmp/qqqqq2-out/j-traps-roll.txt';
  const slim = process.env.SW_QROLL_SLIM === '1';   // 只写 ln|v（无栈标签）
  base2.rng.reseed(base2.seed);
  on = true;
  try {
    if (!slim) throw new Error('tagged mode retired——用 SW_QROLL_SLIM=1 轻量模式');
    // 手写文件流，避免内存峰值
    const fh = await import('node:fs');
    const ws = fh.createWriteStream(outPath);
    let buf: string[] = [];
    (globalThis as unknown as { __swOnRollS?: (n: number, v: number) => void }).__swOnRoll = () => {};
    const origEmit = (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v: number) => {
      if (!on) return;
      buf.push(`${++ln} ${v}`);
      if (buf.length >= 65536) {
        ws.write(buf.join('\n') + '\n');
        buf = [];
        if ((ln >> 20) !== ((ln - 1) >> 20)) console.log(`ln~${ln}`);
      }
    };
    void origEmit;
    runTrapsPass(st2, base2.rng, base2.gs, undefined);
    if (buf.length) ws.write(buf.join('\n') + '\n');
    buf = [];
    await new Promise<void>((res) => ws.end(() => res()));
    console.log(`total ln=${ln} → ${outPath}`);
  } finally { on = false; }
}, 600000);
