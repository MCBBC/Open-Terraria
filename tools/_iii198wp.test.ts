// IIII198: flags 数组写监视（Proxy set 陷阱 + 堆栈）——定位 (1435,521)/(21,832) 的凶手
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const TARGET = new Set([1435 + 521 * 4200, 1435 + 520 * 4200, 1436 + 520 * 4200, 1436 + 521 * 4200, 21 + 832 * 4200, 20 + 832 * 4200]);

it('iii198 watchpoint', async () => {
  let wrapped = false;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i) => {
      const st = w.store as unknown as { flags: Uint8Array; w: number };
      if (wrapped || i < 57) return;
      wrapped = true;
      const raw = st.flags;
      const log: string[] = [];
      const proxy = new Proxy(raw, {
        set(t: Uint8Array, prop: string | symbol, value: number): boolean {
          if (typeof prop === 'string' && TARGET.has(Number(prop))) {
            const old = t[Number(prop) as unknown as number];
            const stk = (new Error().stack ?? '').split('\n').slice(2, 8).map((s) => {
              const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/);
              return m ? `${m[1]!.split('/').pop()}:${m[2]}` : s.trim().slice(0, 40);
            }).join('<');
            log.push(`idx=${prop} ${old}->${value} @ ${stk}`);
          }
          (t as unknown as Record<string, number>)[prop as string] = value;
          return true;
        },
      });
      Object.defineProperty(st, 'flags', { get: () => proxy, configurable: true });
      (globalThis as unknown as { __swI198Log?: string[] }).__swI198Log = log;
    },
  });
  const log = (globalThis as unknown as { __swI198Log?: string[] }).__swI198Log ?? [];
  console.log(`[wp] ${log.length} writes`);
  for (const l of log.slice(0, 40)) console.log('  ' + l);
}, 900_000);
