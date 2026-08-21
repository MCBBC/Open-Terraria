// DDDDDD 批·③c：444 门值 + kill 事件双钩追踪（9293480 全管线）
// SW_D3=1 npx vitest run tools/_dddd3.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_D3 === '1';

(RUN ? it : it.skip)('dddd3 dual trace', async () => {
  const log: string[] = [];
  const g = globalThis as { __swSuper444?: (s: string) => void; __swSuperKill?: (s: string) => void };
  g.__swSuper444 = (s: string) => log.push('V ' + s);
  g.__swSuperKill = (s: string) => log.push('K ' + s);
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  } finally {
    delete g.__swSuper444;
    delete g.__swSuperKill;
  }
  writeFileSync('/tmp/dddd3-dual.txt', log.join('\n') + '\n');
  const kills444 = log.filter((l) => l.startsWith('K KILL sheet=444'));
  console.log(`visits=${log.filter((l) => l.startsWith('V ')).length} kills444=${kills444.length}`);
  console.log(kills444.slice(0, 4).join('\n'));
}, 900_000);
