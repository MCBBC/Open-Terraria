// IIIII214b：天顶 UI 生成卡死 — 终清理槽重放 + FinishRemixWorld ④ 出生腔清液 while 遥测
// 用法: SW_III214B_REPLAY=1 npx vitest run tools/_iii214breplay.test.ts
// 遥测: LiquidSim.quickWater 逐调用计时 + ④ 复检窗 (spawnX, spawnY-14..+10) 湿格账
import { it } from 'vitest';
import { readFileSync, appendFileSync } from 'node:fs';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { finalGenMergeScan } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_III214B_REPLAY;
const BASE = process.env.SW_III214B_CAPDIR ?? '/tmp/iii214b-out/cap';
// 直写文件（vitest console 拦截有缓冲,挂死时尾段丢失）
const TLOG = process.env.SW_III214B_TLOG ?? '/tmp/iii214b-out/replay-tel.log';
const P = (s: string): void => { appendFileSync(TLOG, s + '\n'); };

function hydrate(): { st: TileStore; gs: GenState; chests: unknown[]; spawn: { x: number; y: number; seed: number } } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')) as unknown[];
  const spawn = JSON.parse(readFileSync(`${BASE}/base_spawn.json`, 'utf8')) as { x: number; y: number; seed: number };
  return { st, gs, chests, spawn };
}

(RUN ? it : it.skip)('replay FinalCleanup slot with remix-④ telemetry', () => {
  const { st, gs, chests, spawn } = hydrate();
  const w = st.w, h = st.h;
  P(`[iii214b] hydrate ${w}x${h} spawn=${spawn.x},${spawn.y} seed=${spawn.seed} shimmer=${gs.shimmerX},${gs.shimmerY}`);

  // ── ④ 复检窗湿格账（runFinishRemixWorld cs:26908-26912 同窗）──
  const windowWet = (): { n: number; cells: string } => {
    let n = 0;
    const cells: string[] = [];
    for (let num7 = -10; num7 < 15; num7++) {
      const sy = spawn.y - num7;
      if (sy < 0 || sy >= h || spawn.x < 0 || spawn.x >= w) continue;
      const liq = st.liquid[st.idx(spawn.x, sy)]!;
      if (liq > 0) {
        n++;
        cells.push(`+${num7}:${sy}=${liq}t${st.liquidType[st.idx(spawn.x, sy)]}`);
      }
    }
    return { n, cells: cells.join(',') };
  };
  const bandWet = (): number => {
    // ④ 清扫带 [0.38w, 0.62w+15) × [h-200, h-125)
    const x0 = Math.trunc(w * 0.38), x1 = Math.trunc(w * 0.62) + 15;
    let n = 0;
    for (let x = x0; x < x1; x++) for (let y = h - 200; y < h - 125; y++) if (st.liquid[st.idx(x, y)]! > 0) n++;
    return n;
  };
  const totalWet = (): number => {
    let n = 0;
    for (let i = 0; i < st.liquid.length; i++) if (st.liquid[i]! > 0) n++;
    return n;
  };

  // ── LiquidSim.quickWater 逐调用遥测（不改变行为,仅旁路记账）──
  let qwCalls = 0;
  const origQW = LiquidSim.prototype.quickWater;
  const t0 = Date.now();
  LiquidSim.prototype.quickWater = function (this: LiquidSim & { __iii214b_t?: number }, ...args: []) {
    const id = ++qwCalls;
    const tA = Date.now();
    const r = origQW.apply(this, args);
    const dt = Date.now() - tA;
    const win = windowWet();
    P(`[iii214b] qw#${id} ${dt}ms (总+${((Date.now() - t0) / 1000).toFixed(1)}s) 窗湿=${win.n}${win.n ? ' [' + win.cells + ']' : ''} 带湿=${bandWet()} 全图湿=${totalWet()}`);
    return r;
  };

  // 槽头 RNG 重播（RunPass 每 pass 头 Main.rand = new UnifiedRandom(_seed)）
  const rng = new RNG(spawn.seed);
  try {
    runFinalCleanupPass(st, gs, rng, {
      chests: chests as never,
      spawnX: spawn.x,
      spawnY: spawn.y,
      beforeShimmer: () => {
        P(`[iii214b] +${((Date.now() - t0) / 1000).toFixed(1)}s beforeShimmer reached (Remix ④ 已穿过)`);
      },
    });
    P(`[iii214b] +${((Date.now() - t0) / 1000).toFixed(1)}s runFinalCleanupPass returned OK (quickWater 调用 ${qwCalls})`);
    finalGenMergeScan(st, rng);
    P(`[iii214b] +${((Date.now() - t0) / 1000).toFixed(1)}s finalGenMergeScan OK`);
  } catch (e) {
    P(`[iii214b] +${((Date.now() - t0) / 1000).toFixed(1)}s ERROR after qwCalls=${qwCalls}: ${(e as Error)?.message}`);
    throw e;
  } finally {
    LiquidSim.prototype.quickWater = origQW;
  }
}, 3_600_000);
