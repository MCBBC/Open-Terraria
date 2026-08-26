// W27 批·rel8 邻域逐 Update 迹（_w27a 的 dissect 续作）
// 目标：抓出把饱和格 255→254 的精确操作分支（sig 位标对照 JJHook TRKBOX 表）。
// 用法：cd game && SW_W27B=1 npx vitest run tools/_w27b.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { World } from '../src/world/World';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_W27B === '1';
const RE = '/tmp/vvv-out/replay';
const OUT = '/tmp/w27-out';
const W = 4200, H = 1200, N = W * H;
const SEEDTEXT = process.env.SW_W27_SEEDTEXT ?? '9293480';

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const le8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

interface Params { waterLine: number; dungeonSide: number; worldSurface: number; shimmerX: number; shimmerY: number }

(RUN ? it : it.skip)('W27 rel8 box trace', async () => {
  const prm: Params = JSON.parse(readFileSync(`${OUT}/params.json`, 'utf8'));
  const panel = new Map(JSON.parse(readFileSync(`${OUT}/panel-call2.json`, 'utf8')) as Array<[number, boolean]>);

  const { world } = runResetAndTerrain({ width: W, height: H, seedText: SEEDTEXT, evil: 0 });
  world.genWaterLine = prm.waterLine;
  if (prm.dungeonSide === 0) world.genDungeonExempt = null;
  else {
    const edge = Math.floor(W * 0.05);
    const mid = Math.floor(W * 0.55);
    world.genDungeonExempt = prm.dungeonSide < 0
      ? { x0: edge, x1: Math.floor(W * 0.45), y0: Math.floor(prm.worldSurface) + 10, y1: (H - 200) - 10 }
      : { x0: mid, x1: W - edge, y0: Math.floor(prm.worldSurface) + 10, y1: (H - 200) - 10 };
  }
  world.shimmerX = prm.shimmerX; world.shimmerY = prm.shimmerY;
  const st = world.store;
  st.type.set(le16(`${RE}/type.bin`));
  st.flags.set(le8(`${RE}/flags.bin`));
  st.frameX.set(le16(`${RE}/frameX.bin`));
  st.frameY.set(le16(`${RE}/frameY.bin`));
  st.wall.set(le16(`${RE}/wall.bin`));
  st.liquid.set(le8(`${RE}/liquid.bin`));
  st.liquidType.set(le8(`${RE}/liquidType.bin`));
  st.half.set(le8(`${RE}/half.bin`));
  st.slope.set(le8(`${RE}/slope.bin`));
  st.wire.set(le8(`${RE}/wire.bin`));

  // 盒迹：x 2900..3000 / y 300..360 默认（env SW_W27B_BOX 可换）
  const box = (process.env.SW_W27B_BOX ?? '2900,3000,300,360').split(',').map(Number);
  const lines: string[] = [];
  const RNGmod = await import('../src/core/rng');
  const rng = new RNGmod.RNG(Number(process.env.SW_W27_RNGSEED ?? '9293480'));
  const sim = new LiquidSim(world);
  sim.passRand = (max) => rng.nextInt(max); sim.passRng = rng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = world.shimmerX > 0 ? { x: world.shimmerX, y: world.shimmerY } : null;
  if (world.genWaterLine > 0) {
    sim.genWaterLine = world.genWaterLine;
    const d = world.genDungeonExempt;
    if (d) sim.dungeonWaterExempt = (x, y, w2) =>
      x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1
      && (w2 === 7 || w2 === 8 || w2 === 9 || (w2 >= 94 && w2 <= 99));
  }
  sim.applyGenSolidOverrides(panel);
  sim.worldGenTilesIgnoreWater(true);

  LiquidSim.trkBox = { x0: box[0], x1: box[1], y0: box[2], y1: box[3] };
  LiquidSim.trkProbe = (iter, x, y, sig, amtA, ltyA, kill, delay, pre) => {
    lines.push(sig < 0
      ? `P ${iter} ${x} ${y} ${pre?.amt ?? ''} ${pre?.lty ?? ''}`
      : `T ${iter} ${x} ${y} ${sig.toString(16)} ${amtA} ${ltyA} ${kill} ${delay}`);
  };

  const maxRel = Number(process.env.SW_W27B_REL ?? '12');
  let rel = 0;
  const TAGS = new Set((process.env.SW_W27B_TAGS ?? '').split(',').filter(Boolean));
  sim.quickSettle = true;
  sim.quickWater();
  sim.waterCheck();
  for (let round = 0; round < 3; round++) {
    const maxIter = (sim.numLiquid + sim.bufferLen) * 5;
    let iter = 0;
    while (sim.numLiquid > 0 && iter < maxIter) {
      rel++;
      if (TAGS.size === 0 || TAGS.has(String(rel)) || TAGS.has(`a${rel}`)) {
        lines.push(`=== PRE-IT ${rel} ===`);
        for (let yy = box[2]; yy <= Math.min(box[3], H - 1); yy++) {
          for (let xx = box[0]; xx <= Math.min(box[1], W - 1); xx++) {
            const i = yy * W + xx;
            if (st.liquid[i] > 0) lines.push(`W ${rel} ${xx} ${yy} ${st.liquid[i]} ${st.liquidType[i]}`);
          }
        }
      }
      LiquidSim.trkIterCur = rel;
      sim.updateLiquid();
      iter++;
      if (TAGS.size === 0 || TAGS.has(String(rel))) {
        lines.push(`=== POST-IT ${rel} ===`);
        for (let yy = box[2]; yy <= Math.min(box[3], H - 1); yy++) {
          for (let xx = box[0]; xx <= Math.min(box[1], W - 1); xx++) {
            const i = yy * W + xx;
            if (st.liquid[i] > 0) lines.push(`V ${rel} ${xx} ${yy} ${st.liquid[i]} ${st.liquidType[i]}`);
          }
        }
      }
      if (rel >= maxRel) break;
    }
    sim.waterCheck();
    if (rel >= maxRel) break;
  }
  writeFileSync(`${OUT}/j-boxtrace.txt`, lines.join('\n') + '\n');
  console.log(`trace lines=${lines.length} -> ${OUT}/j-boxtrace.txt`);
  LiquidSim.trkProbe = null; LiquidSim.trkBox = null;
  sim.dispose();
}, 600_000);
