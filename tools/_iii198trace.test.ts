// IIII198: 追踪 (2655,486) 箱的诞生槽位
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('iii198 chest origin', async () => {
  const TARGET = '2655,486';
  let prev = false;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    onWorldPartial: (w, i, pn) => {
      const chests = (w as unknown as { chests: Array<{ x: number; y: number } | null> }).chests;
      const has = chests.some((c) => c && `${c.x},${c.y}` === TARGET);
      if (has && !prev) console.log(`[trace] 箱 ${TARGET} 出现于槽#${i} 「${pn}」(累计 ${chests.filter(Boolean).length} 箱)`);
      prev = has;
    },
  });
}, 900_000);
