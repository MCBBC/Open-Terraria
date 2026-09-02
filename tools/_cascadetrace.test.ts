// 一次性诊断（cascade-fix 2026-09-02）：geRunner 级联写格溯源。
// 重生成同 seed 世界 → 挂 TileStore 监听记录 [REG] 内每次写入（含同步栈归因）→
// initializeHardMode → 打印区域写入日志（区分：GERunner 转化支 vs genSquareTileFrame
// 级联内 TileFrame/killTile 写面）。
// 用法：cd game && SW_TRACE=1 SW_TRACE_OUT=/tmp/cascade-fix/trace.txt npx vitest run tools/_cascadetrace.test.ts
import { it } from 'vitest';
process.env.SW_MB_1457 = '1'; // ★VVVVVV 双态门：与 _hmprobe 同口径（1457 形认证线）
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const RUN = process.env.SW_TRACE === '1';
const OUT = process.env.SW_TRACE_OUT ?? '/tmp/cascade-fix/trace.txt';
const SEED = process.env.SW_TRACE_SEED ?? '9293480';
const W = Number(process.env.SW_TRACE_W ?? 4200);
const H = Number(process.env.SW_TRACE_H ?? 1200);
// 追踪矩形（首个分歧区）
const X0 = Number(process.env.SW_TRACE_X0 ?? 2260), X1 = Number(process.env.SW_TRACE_X1 ?? 2310);
const Y0 = Number(process.env.SW_TRACE_Y0 ?? 210), Y1 = Number(process.env.SW_TRACE_Y1 ?? 245);

(RUN ? it : it.skip)('cascade-trace: 区域写入溯源', async () => {
  const world: World = await generateWorld({ width: W, height: H, seedText: SEED, evil: 0 });
  const st = world.store;
  const log: string[] = [];
  let total = 0;
  console.log(
    `[cascade-trace] world seed=${world.seed} dungeonX=${world.dungeonX} groundLevel=${world.groundLevel} ` +
      `crimson=${world.crimson} listeners=${st.listeners.length} seedFlags=${JSON.stringify(world.seedFlags ?? {})}`,
  );
  const sheetOf = (i: number): number => {
    const t = st.type[i]!;
    const s = (globalThis as never as { __swSheetOf?: (t: number) => number });
    void s;
    return t;
  };
  const listener = (x: number, y: number): void => {
    total++;
    if (x < X0 || x > X1 || y < Y0 || y > Y1) return;
    const i = st.idx(x, y);
    const stk = (new Error().stack ?? '').split('\n').slice(2, 9)
      .map((s) => { const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
      .filter(Boolean).join('<');
    log.push(`W ${x},${y} a=${st.flags[i]} t=${sheetOf(i)} w=${st.wall[i]} by=${stk}`);
  };
  st.listeners.push(listener);
  // SQ/TF/KT 探针钩（genSquareTileFrame/tileFrameGen/killTileGen 发射点）：抓级联事件流
  // rc = __swOnRoll 计数（本段只有 initializeHardMode 的单 RNG 实例在消费）
  let rollCount = 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number, i: object) => void; __swFntProbeI39?: { emit?: (l: string) => void; rc?: () => number } };
  const prevRoll = g.__swOnRoll;
  g.__swOnRoll = () => { rollCount++; };
  const sqEvents: string[] = [];
  g.__swFntProbeI39 = {
    emit: (l: string) => { if (sqEvents.length < 4000000) sqEvents.push(l); },
    rc: () => rollCount,
  };
  const famCount = (): string => {
    const fams: Record<string, number> = { h109: 0, h117: 0, c23: 0, c25: 0, c112: 0 };
    for (let i = 0; i < st.w * st.h; i++) {
      if (!st.flags[i]) continue;
      const sh = TILE_DEFS[st.type[i]!]?.vanilla?.sheet;
      if (sh === 109) fams.h109!++; else if (sh === 117) fams.h117!++;
      else if (sh === 23) fams.c23!++; else if (sh === 25) fams.c25!++; else if (sh === 112) fams.c112!++;
    }
    return JSON.stringify(fams);
  };
  const before = famCount();
  const cellState = (x: number, y: number): string => {
    const i = st.idx(x, y);
    return `a=${st.flags[i]} t=${TILE_DEFS[st.type[i]!]?.vanilla?.sheet}`;
  };
  const regionBefore: string[] = [];
  for (const [cx, cy] of [[2281, 229], [2283, 229], [2292, 229], [2278, 230], [2289, 229]] as const) {
    regionBefore.push(`(${cx},${cy}) ${cellState(cx, cy)}`);
  }
  initializeHardMode(world, new RNG(world.seed));
  g.__swOnRoll = prevRoll;
  (g as { __swFntProbeI39?: unknown }).__swFntProbeI39 = undefined;
  st.listeners.pop();
  // SQ 事件分析：按 rc 段切分 runner1/runner2（sim 口径：r1 掷 [3,10126144) r2 [10126144,22375185)）
  const R1_END = Number(process.env.SW_TRACE_R1END ?? 10126144);
  const R2_END = Number(process.env.SW_TRACE_R2END ?? 22375185);
  const split = (pred: (rc: number) => boolean): Array<[number, number]> => {
    const xs: Array<[number, number]> = [];
    for (const l of sqEvents) {
      const parts = l.split('|');
      if (parts[0] !== 'SQ') continue;
      const rc = Number(parts[parts.length - 1]);
      if (!pred(rc)) continue;
      const [x, y] = parts[1].split(',').map(Number);
      xs.push([x, y]);
    }
    return xs;
  };
  for (const [tag, pred] of [['r1', (rc: number) => rc < R1_END], ['r2', (rc: number) => rc >= R1_END && rc < R2_END], ['post', (rc: number) => rc >= R2_END]] as const) {
    const xs = split(pred);
    if (xs.length === 0) { console.log(`[cascade-trace] ${tag}: SQ=0`); continue; }
    const xss = xs.map((p) => p[0]);
    const ymin = Math.min(...xs.map((p) => p[1]));
    const ymax = Math.max(...xs.map((p) => p[1]));
    const dense = new Map<number, number>();
    for (const x of xss) dense.set(x, (dense.get(x) ?? 0) + 1);
    const cols = [...dense.keys()].sort((a, b) => a - b);
    console.log(
      `[cascade-trace] ${tag}: SQ=${xs.length} x=[${cols[0]}..${cols[cols.length - 1]}] y=[${ymin}..${ymax}] ` +
        `cols=${cols.length}`,
    );
  }
  writeFileSync(OUT + '.sq', sqEvents.join('\n') + '\n');
  const regionAfter: string[] = [];
  for (const [cx, cy] of [[2281, 229], [2283, 229], [2292, 229], [2278, 230], [2289, 229]] as const) {
    regionAfter.push(`(${cx},${cy}) ${cellState(cx, cy)}`);
  }
  console.log(`[cascade-trace] family counts before=${before} after=${famCount()}`);
  console.log(`[cascade-trace] region before: ${regionBefore.join(' | ')}`);
  console.log(`[cascade-trace] region after : ${regionAfter.join(' | ')}`);
  writeFileSync(OUT, log.join('\n') + '\n');
  console.log(
    `[cascade-trace] total listener fires=${total} writes in [${X0}..${X1}]x[${Y0}..${Y1}] = ${log.length} -> ${OUT}`,
  );
}, 600000);
