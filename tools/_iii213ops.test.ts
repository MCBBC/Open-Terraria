// ★IIIII213 一次性仪⑨：#98 迭代 77-79 AddWater/DelWater 事件流（JS 侧）——
// 镜像 rig SW_LIQOPS（OpAdd=AddWater 成功路径 numLiquid++ 后 / OpDel=DelWater 入口 /
// SetCur=切片循环 Update 前上下文）。与 /tmp/iii213-out/x86-liqops.txt 对拍。
// 另记 B（AddBuffer）/BD（DelBuffer）为 JS 侧扩展行（x86 无此流,不参与对拍）。
// 用法：cd game && SW_I213OPS=1 npx vitest run tools/_iii213ops.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { setBoulderSolidity } from '../src/world/gen/vanilla/TrapsPass';
import { flipGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const RUN = process.env.SW_I213OPS === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';
const FROM = Number(process.env.SW_I213_FROM ?? 77), TO = Number(process.env.SW_I213_TO ?? 79);

(RUN ? it : it.skip)('iii213 liqops js', async () => {
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
  let opsN = 0;
  let opsOn = false;
  let curX = -1, curY = -1, curDelay = -1;
  let rel = 0;
  type SimT = LiquidSim & {
    numLiquid: number; bufCount: number;
    bufX: Int32Array; bufY: Int32Array;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
    world: { store: TileStore };
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  const oAdd = proto.addWater;
  const oDel = proto.delWater;
  const oUpdCell = proto.update;
  proto.update = function (this: unknown, e: { x: number; y: number; delay: number }) {
    curX = e.x; curY = e.y; curDelay = e.delay;   // SetCur（切片循环 Update 前）
    return oUpdCell.apply(this, arguments as never);
  };
  proto.delWater = function (this: unknown, l: number) {
    if (opsOn) { opsN++; lines.push(`D ${opsN} ${l}`); }
    return oDel.apply(this, arguments as never);
  };
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments as never);
    const sim = this as unknown as SimT;
    rel++;
    if (opsOn && rel >= TO) { opsOn = false; lines.push(`---OFF after ${rel}`); }
    else if (!opsOn && rel + 1 >= FROM && rel + 1 <= TO) { opsOn = true; opsN = 0; lines.push(`---ON before ${rel + 1}`); }
    if (opsOn || (rel >= FROM - 1 && rel <= TO)) lines.push(`---IT ${rel} nl=${sim.numLiquid} nb=${sim.bufCount}`);
    void sim;
    return r;
  };
  // AddBuffer 逐格观测：包装 bufX 写入太重，改为在 addWater 包装里检查 bufCount 增量
  proto.addWater = function (this: unknown, x: number, y: number) {
    const sim = this as unknown as SimT;
    const b0 = sim.bufCount, n0 = sim.numLiquid;
    const r = oAdd.apply(this, arguments as never);
    if (opsOn) {
      if (sim.numLiquid > n0) { opsN++; lines.push(`A ${opsN} ${x} ${y} @${curX},${curY} d${curDelay}`); }
      else if (sim.bufCount > b0) { opsN++; lines.push(`B ${opsN} ${x} ${y} @${curX},${curY}`); }
    }
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
    proto.updateLiquid = oUpd;
    proto.addWater = oAdd;
    proto.delWater = oDel;
    proto.update = oUpdCell;
  }
  writeFileSync(`${OUT}/j-liqops.txt`, lines.join('\n') + '\n');
  console.log(`ops lines=${lines.length}`);
  const on = lines.findIndex(l => l.startsWith('---ON'));
  console.log(lines.slice(Math.max(0, on), on === -1 ? 0 : on + 40).join('\n').slice(0, 3000));
}, 600_000);
