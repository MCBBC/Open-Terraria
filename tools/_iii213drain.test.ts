// ★IIIII213 一次性仪⑫：回灌决策流（JS 侧）——drainSink → "n k x,y A|R amtN nlN"
// 与 rig SW_LIQDRAIN（x86-drain.txt）逐行对拍（全程所有 tail 的 drain）。
// 用法：cd game && SW_I213DR=1 npx vitest run tools/_iii213drain.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I213DR === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';

(RUN ? it : it.skip)('iii213 drain decisions js', async () => {
  const snap = JSON.parse(readFileSync(`${OUT}/snap97-remix.json`, 'utf8'));
  const dec = (k: string): ArrayBuffer => Buffer.from(snap.store[k], 'base64').buffer;
  const st = new TileStore(snap.w, snap.h, {
    type: dec('type'), flags: dec('flags'), frameX: dec('frameX'), frameY: dec('frameY'),
    wall: dec('wall'), liquid: dec('liquid'), liquidType: dec('liquidType'),
    half: dec('half'), slope: dec('slope'), wire: dec('wire'),
    paint: dec('paint'), paintWall: dec('paintWall'), coat: dec('coat'),
  });
  restoreGenSolid(new Map<number, boolean>(snap.genSolidOverrides));
  const p = snap.gsPick;
  const gs = {
    w: snap.w, h: snap.h, seed: p.seed, seedFlags: { ...p.seedFlags },
    worldSurface: p.worldSurface, rockLevel: p.rockLevel, lavaLine: p.lavaLine,
    beachDistance: p.beachDistance, dungeonSide: p.dungeonSide ?? 1,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1, waterLine: p.waterLine ?? 0,
  } as unknown as GenState & Record<string, number>;
  const world = {
    w: snap.w, h: snap.h, seed: p.seed, store: st,
    groundLevel: p.worldSurface, rockLevel: p.rockLevel,
    shimmerX: p.shimmerX ?? -1, shimmerY: p.shimmerY ?? -1,
    genWaterLine: 0, genDungeonExempt: null as never, genRemixWater: null as never,
  };
  const lines: string[] = [];
  LiquidSim.drainSink = (k, x, y, accepted, amt, nl) => {
    lines.push(`${lines.length + 1} ${k} ${x},${y} ${accepted ? 'A' : 'R'} amt${amt} nl${nl}`);
  };
  const rng = new RNG(p.seed);
  rng.reseed(p.seed);
  world.genWaterLine = gs.waterLine;
  if ((gs.dungeonSide as number) === 0) world.genDungeonExempt = null as never;
  else {
    const edge = Math.floor(world.w * 0.05), mid = Math.floor(world.w * 0.55);
    world.genDungeonExempt = (gs.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
      : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }) as never;
  }
  world.genRemixWater = { lavaLine: gs.lavaLine, rockLevel: gs.rockLevel, oceanLevel: (gs.worldSurface + gs.rockLevel) / 2 + 40 } as never;
  try {
    flipGenSolid([379], true);
    setBoulderSolidity(false);
    flipGenSolid([546], false);
    await settleWorldLiquids(world as never, 'gen', undefined, rng, false);
    setBoulderSolidity(true);
    flipGenSolid([546], true);
    flipGenSolid([10, 192, 191, 190], true);
    flipGenSolid([484], false);
  } finally {
    LiquidSim.drainSink = null;
  }
  writeFileSync(`${OUT}/j-drain.txt`, lines.join('\n') + '\n');
  console.log(`drain lines=${lines.length}`);
}, 600_000);
