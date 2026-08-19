// 一次性诊断（GGGGG）：spawn-tree-regression x=2936 树段对比 + 写者定位
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

const RUN = process.env.SW_G5T === '1';
const TREE = TILE_BY_KEY['tree']!;

(RUN ? it : it.skip)('x=2936 trunk segments + writer trace', async () => {
  // 写者追踪：store listeners 捕获 (2936, 615..635) 写入时的调用栈
  const writes: string[] = [];
  let armed = false;
  (globalThis as Record<string, unknown>).__g5ArmWriter = () => { armed = true; };
  try {
    const world = await generateWorld({
      width: 4200, height: 1200, seedText: 'spawn-tree-regression', name: 't',
      onWorldPartial: (w) => {
        const st = w.store;
        if (!armed) {
          armed = true;
          st.listeners.push((x: number, y: number) => {
            if (x === 2936 && y >= 610 && y <= 640) {
              const stack = (new Error().stack ?? '').split('\n').slice(2, 4).map(l => l.trim()).join(' <= ');
              writes.push(`(${x},${y}) -> t${st.type[y * 4200 + x]} @${stack}`);
            }
          });
        }
      },
    } as never);
    const st = world.store;
    for (const x of [2935, 2936, 2937]) {
      const segs: Array<[number, number]> = [];
      let y = 20;
      while (y < 800) {
        const i = y * 4200 + x;
        if (st.type[i] === TREE) {
          let y2 = y;
          while (y2 + 1 < 800 && st.type[(y2 + 1) * 4200 + x] === TREE) y2++;
          segs.push([y, y2]);
          y = y2 + 1;
        } else y++;
      }
      console.log(`x=${x} segs=${JSON.stringify(segs)}`);
    }
    console.log(`writer hits=${writes.length}`);
    for (const w of writes.slice(0, 25)) console.log('  ' + w);
  } finally { delete (globalThis as Record<string, unknown>).__g5ArmWriter; }
}, 600_000);
