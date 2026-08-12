// 一次性诊断：完整 generateWorld 60s 超时定位卡点。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('full gen hang repro', async () => {
  console.log('start full gen seed 12345');
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  console.log('DONE', world.store.w, world.store.h);
}, 240000);
