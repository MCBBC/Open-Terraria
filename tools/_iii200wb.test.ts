// IIIIRS200: 残差格 (2665,487) 工作台 / (2668,486)(2668,488) 501 / (1723,300) 沙块
// pass105 写侧监视（flags/type/frameX/coat 四通道 Proxy set 陷阱;SW_I200WB=1 门）。
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I200WB=1 npx vitest run tools/_iii200wb.test.ts
const RUN = process.env.SW_I200WB === '1';
const it = RUN ? itRaw : itRaw.skip;

import { generateWorld } from '../src/world/gen/WorldGen';

const T = (x: number, y: number): number => x + y * 4200;
const TARGET = new Set([T(2665, 487), T(2668, 486), T(2668, 488), T(1723, 300), T(2666, 487)]);

it('iii200 residual tile watchpoint', async () => {
  if (process.env.SW_I200WB !== '1') return;
  let wrapped = false;
  const allLogs: string[] = [];
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i, pn) => {
      const st = w.store as unknown as Record<string, unknown> & { w: number };
      if (i < 103) return;
      for (const arr of ['flags', 'type', 'frameX', 'coat'] as const) {
        if (st[`__wp_${arr}`]) continue;
        const raw = st[arr] as Uint8Array | Uint16Array;
        const log: string[] = [];
        allLogs.push(...log);
        const proxy = new Proxy(raw, {
          set(t: unknown, prop: string | symbol, value: number): boolean {
            if (typeof prop === 'string' && TARGET.has(Number(prop))) {
              const old = (t as unknown as Record<string, number>)[prop];
              const stk = (new Error().stack ?? '').split('\n').slice(2, 9).map((s) => {
                const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/);
                return m ? `${m[1]!.split('/').pop()}:${m[2]}` : s.trim().slice(0, 44);
              }).join('<');
              log.push(`p${i}「${pn}」${arr}[${prop}] ${old}->${value} @ ${stk}`);
            }
            (t as unknown as Record<string, number>)[prop as string] = value;
            return true;
          },
        });
        Object.defineProperty(st, `__wp_${arr}`, { value: true, configurable: true });
        Object.defineProperty(st, arr, { get: () => proxy, configurable: true });
      }
    },
  });
  console.log(`[wp] ${allLogs.length} writes`);
  for (const l of allLogs.slice(0, 80)) console.log('  ' + l);
}, 900_000);
