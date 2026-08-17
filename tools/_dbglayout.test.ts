// 一次性诊断：dgLayout 逐迭代掷数轨迹（globalThis.__dgLayoutTrace）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { generateWorld } from '../src/world/gen/WorldGen';

it('layout trace', async () => {
  const seed = process.env.SW_LT_SEED || '4444';
  const trace: Array<Record<string, number>> = [];
  (globalThis as Record<string, unknown>).__dgLayoutTrace = trace;
  const world = await generateWorld({ size: 0, width: 4200, height: 1200, seedText: seed, evil: 0 });
  const t = (globalThis as Record<string, unknown>).__dgLayoutTrace as Array<Record<string, number>>;
  console.log(`dungeon=(${world.dungeonX},${world.dungeonY}) iters=${t.length}`);
  for (const r of t) console.log(`IT ${r.it} rolls=${r.rolls} gate=${r.gate} roomDelayBefore=${r.rd} branch=${r.branch}`);
}, 300000);
