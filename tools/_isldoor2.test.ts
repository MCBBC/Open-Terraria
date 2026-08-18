// 一次性:三岛屋箱内容对账(golden wld chests vs JS world.chests)+帧步。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser.ts';
import { generateWorld } from '../src/world/gen/WorldGen';

it('island chest contents', async () => {
  const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld')));
  const islChests = g.chests.filter((c) => c.y < 120).sort((a, b) => a.x - b.x);
  for (const c of islChests) {
    console.log('[golden chest]', c.x, c.y, JSON.stringify(c.items.map((it) => it ? `${it.id}x${it.stack}` : '-')));
  }
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  const jsChests = (world.chests as Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>)
    .filter((c) => c.y < 120).sort((a, b) => a.x - b.x);
  for (const c of jsChests) {
    console.log('[js chest]', c.x, c.y, JSON.stringify(c.items.map((it) => it ? `${it.id}x${it.stack}` : '-')));
  }
}, 600000);
