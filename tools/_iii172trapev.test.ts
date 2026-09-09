import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I172TRAPEV=1 npx vitest run tools/_iii172trapev.test.ts
const RUN = process.env.SW_I172TRAPEV === '1';
const it = RUN ? itRaw : itRaw.skip;

import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
const GX = 205;
it('trapev3', async () => {
  let st: { frameX: Uint16Array; idx: (x: number, y: number) => number } | null = null;
  const evs: string[] = [];
  const fx = () => st ? st.frameX[st.idx(GX, 0)] : -1;
  let prev = -1;
  (globalThis as unknown as { __swTrapEv?: (k: string,a: number,b: number,v: number) => void }).__swTrapEv =
    (k, a, b, v) => {
      const f = fx();
      if (f !== prev) { evs.push(`FX→${f} BEFORE ${k} a=${a} b=${b} v=${v}`); prev = f; }
      if (a === GX && k === 'C') evs.push(`${k} a=${a} b=${b} v=${v}`);
    };
  (globalThis as unknown as { __swTntEv?: (m: string) => void }).__swTntEv =
    (m) => { const f = fx(); if (f !== prev) { evs.push(`FX→${f} BEFORE TNT ${m}`); prev = f; } };
  let hm = '';
  (globalThis as unknown as { __swTrapHm?: (l: string) => void }).__swTrapHm = (l: string) => {
    const f = fx();
    if (f !== prev) { evs.push(`FX→${f} AT HM ${l}`); prev = f; }
    if (l.startsWith('traps-main-g205') || l === 'traps-head') hm = `${l} fx=${f}`;
  };
  await generateWorld({ width: 4200, height: 1200, seedText: '1896728457', evil: 1, seedFlags: { noTraps: true },
    onWorldPartial: (w) => { st = w.store as never; } });
  writeFileSync('/tmp/iii172-out/trace/trapev-205.json', JSON.stringify(evs));
  const t18 = evs.findIndex(e => e.includes('FX→18'));
  console.log(`events=${evs.length} first18Idx=${t18}`);
  console.log(evs.slice(Math.max(0, (t18 >= 0 ? t18 - 3 : 0)), (t18 >= 0 ? t18 + 3 : 5)).join('\n'));
}, 900_000);
