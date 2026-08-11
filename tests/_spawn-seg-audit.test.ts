// 一次性采样审计（跑完即删）：seed 'spawn-seg-audit' 4200x1200，
// 地表夜 / 洞穴 / 地狱 各 300 次 spawn，统计出怪 id 分布与 null 样本
import { describe, it } from 'vitest';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';

function findSpot(w: Awaited<ReturnType<typeof generateWorld>>, yTarget: number, xStart: number) {
  const st = w.store;
  for (let r = 0; r < 4000; r++) {
    const x = xStart + ((r % 2 === 0) ? r / 2 : -(r / 2)) | 0;
    if (x < 60 || x > st.w - 60) continue;
    for (let y = Math.max(10, yTarget - 60); y < Math.min(st.h - 60, yTarget + 60); y++) {
      if (st.isSolid(x, y)) continue;
      if (st.isSolid(x, y + 1) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        return { x, y };
      }
    }
  }
  return null;
}

describe('spawn-seg-audit', () => {
  it('samples three zones', async () => {
    const w = await generateWorld({ width: 4200, height: 1200, seedText: 'spawn-seg-audit' });
    const st = w.store;
    // 地狱：找地狱层空气最开阔的列
    let hellX = Math.floor(w.spawnX) + 1500, bestAir = -1;
    for (let x = 200; x < st.w - 200; x += 25) {
      let air = 0;
      for (let y = st.h - 200; y < st.h - 30; y++) if (!st.isSolid(x, y)) air++;
      if (air > bestAir) { bestAir = air; hellX = x; }
    }
    const zones: Array<[string, number, number, number]> = [
      // [名, yTarget, xStart, timeOfDay(0.75+ = 夜)]
      ['surface-night', Math.floor(w.groundLevel), Math.floor(w.spawnX) + 300, 0.85],
      ['cavern', Math.floor((w.rockLevel + st.h - 190) / 2), Math.floor(w.spawnX) + 900, 0.4],
      ['hell', st.h - 120, hellX, 0.4],
    ];
    for (const [name, yTarget, xStart, tod] of zones) {
      const spot = findSpot(w, yTarget, xStart);
      if (!spot) { console.log(`[${name}] no spot found`); continue; }
      w.clock.timeOfDay = tod;
      const spawner = new VanillaSpawner(w);
      spawner.setPlayerFlags(false, false);
      const px = (spot.x + 0.5) * TILE, py = (spot.y - 1) * TILE;
      const tally = new Map<number, number>();
      let nulls = 0, total = 0, foundTile = 0;
      for (let k = 0; k < 300; k++) {
        const e = spawner.spawn(px, py, new RNG(k * 104729 + 17), 60, 35);
        if ((spawner as unknown as { currentSpawnY: number }).currentSpawnY > 0) foundTile++;
        if (!e) { nulls++; continue; }
        total++;
        const id = e.vanillaNetId ?? e.vanillaId ?? -99;
        tally.set(id, (tally.get(id) ?? 0) + 1);
      }
      const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`[${name}] spot=(${spot.x},${spot.y}) spawned=${total} null=${nulls} tileFound=${foundTile}`);
      console.log(`[${name}] ` + rows.map(([id, n]) => `${id}x${n}`).join(' '));
    }
    // 地狱 findSpawnTile 阶段探针
    {
      const spot = findSpot(w, st.h - 120, 425)!;
      const spawner = new VanillaSpawner(w);
      spawner.setPlayerFlags(false, false);
      const s = spawner as unknown as {
        pX: number; pY: number; findSpawnTile: (r: RNG, vw: number, vh: number) => boolean;
      };
      s.pX = spot.x; s.pY = spot.y - 1;
      let ok = 0;
      for (let k = 0; k < 500; k++) if (s.findSpawnTile(new RNG(k), 60, 35)) ok++;
      // 随机点统计：spawnArea 内空气占比与向下找得到落脚面的比例
      let air = 0, landed = 0, n = 0;
      for (let k = 0; k < 2000; k++) {
        const r = new RNG(k * 31 + 5);
        const tx = r.int(Math.max(2, spot.x - 84), Math.min(st.w - 3, spot.x + 84));
        const ty = r.int(Math.max(2, spot.y - 1 - 49), Math.min(st.h - 3, spot.y - 1 + 49));
        n++;
        if (st.isSolid(tx, ty)) continue;
        air++;
        let j = ty;
        const areaB = Math.min(st.h - 3, spot.y - 1 + 49);
        while (j < areaB && !st.isSolid(tx, j)) j++;
        if (j < areaB) landed++;
      }
      console.log(`[hell-probe] findSpawnTile ok=${ok}/500 air=${air}/${n} landed=${landed}/${n}`);
      // 阶段归因（复制 findSpawnTile 逻辑逐门计数）
      {
        const px = spot.x, py = spot.y - 1;
        const c = { solid: 0, land: 0, safe: 0, space: 0, ok: 0, lava: 0 };
        for (let k = 0; k < 3000; k++) {
          const r = new RNG(k * 977 + 3);
          const areaL = Math.max(2, px - 84), areaR = Math.min(st.w - 3, px + 84);
          const areaT = Math.max(2, py - 49), areaB = Math.min(st.h - 3, py + 49);
          const tx = r.int(areaL, areaR);
          let ty = r.int(areaT, areaB);
          if (st.isSolid(tx, ty)) { c.solid++; continue; }
          let j = ty;
          while (j < areaB && !st.isSolid(tx, j)) j++;
          if (j >= areaB) { c.land++; continue; }
          ty = j;
          if (Math.abs(tx - px) < 62 && Math.abs(ty - py) < 36) { c.safe++; continue; }
          let bad = false;
          for (let dx = -1; dx <= 0 && !bad; dx++) {
            for (let dy = -3; dy <= -1 && !bad; dy++) {
              const i2 = st.idx(tx + dx, ty + dy);
              if (st.isSolid(tx + dx, ty + dy)) bad = true;
              else if (st.liquid[i2] > 0 && st.liquidType[i2] === 2) { bad = true; c.lava++; }
            }
          }
          if (bad) { c.space++; continue; }
          c.ok++;
        }
        console.log(`[hell-stages]`, JSON.stringify(c));
      }
    }
  }, 240000);
});
