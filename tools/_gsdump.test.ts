import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';   // ★C档可移植:改仓库内相对
const RUN = !!process.env.SW_PARITY;
(RUN ? it : it.skip)('dump gs at temple', async () => {
  const g0 = globalThis as { __swWallCap?: (tag: string, gs: object, st: object) => void };
  let gsAny: Record<string, unknown> | null = null;
  g0.__swWallCap = (tag, gs) => { if (tag === 'temple' && !gsAny) gsAny = gs as unknown as Record<string, unknown>; };
  try { await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0, onWorldPartial: () => { } }); } catch { }
  g0.__swWallCap = undefined;
  if (gsAny) {
    for (const k of ['rockLevel', 'rockLevelLow', 'rockLevelHigh', 'worldSurface', 'worldSurfaceLow', 'worldSurfaceHigh', 'lavaLine', 'genRockLayer', 'genWorldSurface', 'dungeonSide', 'generatingDungeonPositionX', 'seed'])
      console.log(`gs.${k} =`, gsAny[k]);
  }
  void readFileSync;
}, 300000);
