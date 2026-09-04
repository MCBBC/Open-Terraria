// ★IIIII107 一次性仪④：REMIX 终清理槽水袋写面堆栈取证——Proxy 包裹 liquid/liquidType
// 通道，池区 (1640..1660,704..716) 首若千写入打印调用栈，定位动水的函数。
// 用法：cd game && SW_I130S=1 npx vitest run tools/_iii130pool.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I130S === '1';
const X0 = 1640, X1 = 1660, Y0 = 704, Y1 = 716, W = 4200;
const inPool = (i: number) => { const x = i % W, y = (i / W) | 0; return x >= X0 && x <= X1 && y >= Y0 && y <= Y1; };

(RUN ? it : it.skip)('iii130 pool stack trace', async () => {
  const logs: string[] = [];
  let tracing = false;
  let hits = 0;
  const origSet = TileStore.prototype.setTileSilent;
  TileStore.prototype.setTileSilent = function (this: TileStore, x: number, y: number, t?: number, fx?: number, fy?: number) {
    if (tracing && hits < 40 && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      hits++;
      logs.push(`[setTileSilent] (${x},${y}) t=${t} @${new Error().stack?.split('\n').slice(2, 8).join(' | ')}`);
    }
    return origSet.call(this, x, y, t, fx, fy);
  } as typeof TileStore.prototype.setTileSilent;

  let swapped = false;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1138154190', evil: 0,
    seedFlags: { remix: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn === '断线陷阱清理' && !swapped) {
        swapped = true;
        tracing = true;
        const st = w.store as unknown as Record<string, Uint8Array>;
        for (const chan of ['liquid', 'liquidType']) {
          const orig = st[chan]!;
          const p = new Proxy(orig, {
            set(target, prop, value) {
              if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                const i = Number(prop);
                if (inPool(i) && hits < 40) {
                  hits++;
                  logs.push(`[${chan}] idx=${i} (${i % W},${(i / W) | 0}) ${target[i]}→${value} @${new Error().stack?.split('\n').slice(2, 9).join(' | ')}`);
                }
              }
              return Reflect.set(target, prop, value);
            },
          });
          Object.defineProperty(st, chan, { value: p, configurable: true, writable: true });
        }
      }
      if (pn === '终清理') {
        tracing = false;
        console.log(logs.slice(0, 40).join('\n---\n'));
        writeFileSync('/tmp/iii130-out/pool-stack.txt', logs.join('\n---\n') + '\n');
        // 还原通道（防后续槽异常）
        const st = w.store as unknown as Record<string, Uint8Array>;
        for (const chan of ['liquid', 'liquidType']) {
          const p = st[chan] as unknown as { __orig?: Uint8Array };
        }
      }
    },
  });
}, 900_000);
