// IIII168 一次性：41 非神庙幽灵格在**每个 reseed 锚**（=x86 dump 粒度）的 (act,internal) 态
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I168FINE=1 npx vitest run tools/_iii168fine.test.ts
const RUN = process.env.SW_I168FINE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
const OUT = process.env.SW_I168_OUT ?? '/tmp/iii168-out';
const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';
it('fine trace at reseed anchors', async () => {
  const all = JSON.parse(readFileSync(`${OUT}/ghost-cells.json`, 'utf8')) as Array<{ i: number; x: number; y: number }>;
  // 只追非神庙 41 格
  const idxs = all.filter((c) => c.grp !== 'temple').map((c) => c.i);
  const anchors: Array<{ lab: string; file: string; line: number; st: Array<[number, number]> }> = [];
  const cur: Array<[number, number]> = [];
  let world: { store: { flags: Uint8Array; type: Uint16Array } } | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const seen = new Set<string>();
  RNGp.reseed = function (this: unknown, s: number) {
    if (world) {
      const stack = (new Error().stack ?? '').split('\n');
      for (const line of stack) {
        const m = line.match(/(src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          // 采「上一 pass 末态」：reseed 前 world.store 即上一 vanilla pass 末态
          const key = `${m[1]}:${m[2]}`;
          if (!seen.has(key)) {
            seen.add(key);
            const st = world.store;
            const snap: Array<[number, number]> = idxs.map((i) => [st.flags[i]! & 1, st.type[i]!]);
            anchors.push({ lab: key, file: m[1], line: Number(m[2]), st: snap });
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: 0,
      seedFlags: { errorWorld: true },
      onWorldPartial: (w) => { if (!world) world = w as never; },
    });
  } finally { RNGp.reseed = oReseed; }
  writeFileSync(`${OUT}/fine-trace.json`, JSON.stringify({ idxs, anchors }));
  console.log(`[i168] anchors=${anchors.length} -> ${OUT}/fine-trace.json`);
}, 600_000);
