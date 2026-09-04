// ★IIIII110b 一次性取证仪：逐 pass 观察指定格的 tile 演变（定位写入 pass）。
// SW142_SEED / SW142_FLAGS / SW142_WX / SW142_WY
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SEED = process.env.SW142_SEED ?? '';
const WX = Number(process.env.SW142_WX ?? 1050), WY = Number(process.env.SW142_WY ?? 943);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW142_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;
const W = Number(process.env.SW142_W ?? 4200), H = Number(process.env.SW142_H ?? 1200);
const EVIL = Number(process.env.SW142_EVIL ?? 0);

(!!SEED ? it : it.skip)('III142 watch cell', { timeout: 900_000 }, async () => {
  let prevT = -1, prevA = -1;
  const world = await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
    onWorldPartial: (w, i, pn) => {
      const idx = (w.store as never as { idx(x: number, y: number): number }).idx(WX, WY);
      const s = w.store as never as { type: Uint16Array; flags: Uint8Array };
      const t = s.type[idx], a = s.flags[idx];
      if (t !== prevT || a !== prevA) {
        const sheet = TILE_DEFS[t]?.vanilla?.sheet;
        console.log(`[watch] pass#${i} ${pn}: (${WX},${WY}) act ${prevA}->${a} type ${prevT}->${t} (sheet ${sheet})`);
        prevT = t; prevA = a;
      }
    },
  });
  console.log('[watch] final spawn', world.spawnX, world.spawnY);
});
