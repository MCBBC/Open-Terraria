// IIII58 取证：REMIX UW 窗口 cut-kill 事件普查（__swCutProbe 由 LiquidSim 三处
// 情形 B 触发点上报）。用途：对照 x86 七杀签名 {(1843..1893),(518..573)}。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I60CUT === '1';

(RUN ? it : it.skip)('i60 cut-kill census', async () => {
  const evs: Array<{ x: number; y: number; t: number }> = [];
  (globalThis as unknown as { __swCutProbe?: (x: number, y: number, t: number) => void }).__swCutProbe =
    (x: number, y: number, t: number) => evs.push({ x, y, t });
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1138154190', evil: -1,
      seedFlags: { remix: true },
    });
  } finally {
    delete (globalThis as unknown as { __swCutProbe?: unknown }).__swCutProbe;
  }
  const byT: Record<number, number> = {};
  for (const e of evs) byT[e.t] = (byT[e.t] ?? 0) + 1;
  console.log('[i60cut] total cut-kill triggers:', evs.length);
  console.log('[i60cut] by sheet:', JSON.stringify(byT));
  const c484 = evs.filter((e) => e.t === 484);
  console.log('[i60cut] 484 events:', c484.length);
  console.log('[i60cut] 484 coords:', JSON.stringify(c484.slice(0, 30)));
  writeFileSync('/tmp/iii60-out/cut-events.json', JSON.stringify(evs));
}, 600_000);
