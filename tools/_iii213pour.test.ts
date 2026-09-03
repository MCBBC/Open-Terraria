// ★IIIII213 一次性仪⑭：#98 迭代 78 体（LiqIter==77 体=iter78）下灌流（JS 侧）
// ——(x,y n s d) 与 rig SW_LIQPOUR 同格式。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I213POUR === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';
const POUR_REL = Number(process.env.SW_I213_POURREL ?? 78);

(RUN ? it : it.skip)('iii213 pour stream js', async () => {
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
  let rel = 0;
  let pourOn = false;
  LiquidSim.pourSink = (x, y, n, src, dst) => {
    if (pourOn) lines.push(`${x},${y} n${n} s${src} d${dst}`);
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    rel++;
    pourOn = rel + 1 === POUR_REL;
    return r;
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
    LiquidSim.pourSink = null;
    proto.updateLiquid = oUpd;
  }
  writeFileSync(`${OUT}/j-pour78.txt`, lines.join('\n') + '\n');
  console.log(`pour78 lines=${lines.length}`);
}, 600_000);
