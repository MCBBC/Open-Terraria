import { it } from 'vitest';
import { generateWorld } from '/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/gen/WorldGen';
(it)('ws probe', async () => {
  const g = globalThis as { __swSpiderGsCap?: (gs: unknown) => void };
  let ws = -1, rl = -1;
  (g as never as { __swSpiderGsCap?: (gs: { worldSurface: number; rockLevel: number }) => void }).__swSpiderGsCap = (gs) => { if (ws < 0) { ws = gs.worldSurface; rl = gs.rockLevel; } };
  await generateWorld({ width: 4200, height: 1200, seedText: '22222', evil: 1 });
  console.log(`s22222: worldSurface=${ws} rockLevel=${rl}`);
}, 300_000);
