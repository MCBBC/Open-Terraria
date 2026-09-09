// IIII198: 箱 push 监视——slot18 域内 (2655,486) 箱的创建者
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198CPUSH=1 npx vitest run tools/_iii198cpush.test.ts
const RUN = process.env.SW_I198CPUSH === '1';
const it = RUN ? itRaw : itRaw.skip;

import { generateWorld } from '../src/world/gen/WorldGen';

it('iii198 chest push trace', async () => {
  let wrapped = false;
  const logs: string[] = [];
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i) => {
      const world = w as unknown as { chests: Array<unknown> };
      if (wrapped) return;
      wrapped = true;
      const raw = world.chests;
      const proxy = new Proxy(raw, {
        set(t: unknown, prop: string | symbol, value: unknown): boolean {
          if (prop === 'length') return true;
          const idx = Number(prop);
          if (!Number.isNaN(idx)) {
            const stk = (new Error().stack ?? '').split('\n').slice(2, 7).map((s) => {
              const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/);
              return m ? `${m[1]!.split('/').pop()}:${m[2]}` : '';
            }).filter(Boolean).join('<');
            const c = value as { x: number; y: number } | null;
            logs.push(`push[${idx}] (${c?.x},${c?.y}) @ ${stk}`);
          }
          (t as unknown as Record<string, unknown>)[prop] = value;
          return true;
        },
      });
      (world as unknown as Record<string, unknown>).chests = proxy;
    },
  });
  console.log(`[cpush] ${logs.length} pushes`);
  for (const l of logs.slice(0, 30)) console.log('  ' + l);
}, 900_000);
