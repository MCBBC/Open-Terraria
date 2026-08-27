// SSSSSSSS2 g线 探针②：逐迭代（rel 口径）与 x86 xrel dumps 逐格对拍（用毕删）
// rel8 = XXXX 批首插入分歧迭代；现在应全等。残留 dL 漂移源在此定位。
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';
import type { RNG as RNGT } from '../src/core/rng';

const W = 4200, H = 1200;
const REPLAY = '/tmp/vvv-out/replay';
const CAPTURE = '/tmp/w27-out/panel-call2.json';
const XREL = '/tmp/w27-out/xrel';

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

function loadBins(st: TileStore): void {
  const put = (name: string, arr: Uint8Array | Uint16Array, stride: number) => {
    const buf = readFileSync(`${REPLAY}/${name}`);
    if (stride === 2) (arr as Uint16Array).set(new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2).subarray(0, W * H));
    else (arr as Uint8Array).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).subarray(0, W * H));
  };
  put('type.bin', st.type as unknown as Uint16Array, 2);
  put('flags.bin', st.flags, 1);
  put('frameX.bin', st.frameX as unknown as Uint16Array, 2);
  put('frameY.bin', st.frameY as unknown as Uint16Array, 2);
  put('wall.bin', st.wall as unknown as Uint16Array, 2);
  put('liquid.bin', st.liquid, 1);
  put('liquidType.bin', st.liquidType, 1);
  put('half.bin', st.half, 1);
  put('slope.bin', st.slope, 1);
  put('wire.bin', st.wire, 1);
}

class CountingRNG implements RNGT {
  draws = 0;
  constructor(private inner: RNGT) {}
  next(): number { this.draws++; return this.inner.next(); }
  int(min: number, max: number): number { this.draws++; return this.inner.int(min, max); }
  pick<T>(arr: T[]): T { this.draws++; return this.inner.pick(arr); }
  nextInt(maxValue: number): number { this.draws++; return this.inner.nextInt(maxValue); }
  reseed(seed: number): void { this.inner.reseed(seed); }
  nextIntRange(minValue: number, maxValue: number): number { this.draws++; return this.inner.nextIntRange(minValue, maxValue); }
  get vanilla(): RNGT['vanilla'] { return this.inner.vanilla; }
}

it('ssss2g2 per-iteration parity', () => {
  const cfg = { width: W, height: H, seedText: '9293480', evil: 0 as const };
  const ctxR = runResetAndTerrain(cfg);
  const world = ctxR.world;
  const gs = ctxR.gs as unknown as Record<string, number>;
  loadBins(world.store);

  const crng = new CountingRNG(ctxR.rng);
  const caps = JSON.parse(readFileSync(CAPTURE, 'utf8')) as Array<[number, boolean]>;
  const capMap = new Map<number, boolean>(caps);

  world.genWaterLine = gs.waterLine;
  {
    const ds = gs.dungeonSide, surf = Math.floor(gs.worldSurface);
    if (ds === 0) world.genDungeonExempt = null;
    else {
      const edge = Math.floor(W * 0.05), mid = Math.floor(W * 0.55);
      world.genDungeonExempt = ds < 0
        ? { x0: edge, x1: Math.floor(W * 0.45), y0: surf + 10, y1: (H - 200) - 10 }
        : { x0: mid, x1: W - edge, y0: surf + 10, y1: (H - 200) - 10 };
    }
  }
  (world as unknown as { shimmerX: number }).shimmerX = 3966;
  (world as unknown as { shimmerY: number }).shimmerY = 724;

  const sim = new LiquidSim(world);
  sim.passRand = (max: number) => crng.nextInt(max);
  sim.passRng = crng;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.shimmerCenter = { x: 3966, y: 724 };
  sim.genWaterLine = world.genWaterLine;
  {
    const d = world.genDungeonExempt;
    sim.dungeonWaterExempt = d ? (x: number, y: number, w: number) =>
      x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1 && (w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99)) : null;
  }
  sim.applyGenSolidOverrides(capMap);
  sim.worldGenTilesIgnoreWater(true);

  const out: string[] = [];
  sim.quickWater();
  sim.waterCheck();
  sim.quickSettle = true;

  // 每 iter 一跑；有 x86 dump 的 iter 直接逐格 diff
  const rels = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 45, 60];
  let nextRelIdx = 0;

  const cmpWith = (rel: number): void => {
    const dir = `${XREL}/rel${rel}`;
    if (!existsSync(`${dir}/K.liq`)) return;
    const xl = readFileSync(`${dir}/K.liq`);
    const xa = readFileSync(`${dir}/K.act`);
    const xt = readFileSync(`${dir}/K.typ`, null);
    const xlt = readFileSync(`${dir}/K.lty`);
    void xt;
    const st = world.store;
    let dLiq = 0, dAct = 0, dLt = 0, dTyp = 0;
    const samples: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const y = (i / W) | 0, x = i % W;
      const mAct = st.flags[i] & 1;
      const xAct = xa[i];
      if ((mAct ? 1 : 0) !== xAct && samples.length < 40) {
        dAct++;
        if (samples.length < 25) samples.push(`A(${x},${y}) X=${xAct} J=${mAct} typX=${SHEET_OF[st.type[i]]} liqJ=${st.liquid[i]}/${st.liquidType[i]} liqX=${xl[i]}/${xlt[i]}`);
        continue;
      }
      if (mAct) {
        const sh = SHEET_OF[st.type[i]];
        const xSh = (new Uint16Array(xt!.buffer, xt!.byteOffset, xt!.byteLength / 2))[i];
        if (sh !== xSh) {
          dTyp++;
          if (samples.length < 25) samples.push(`T(${x},${y}) X=${xSh} J=${sh} liq=${st.liquid[i]}/${xl[i]}`);
        }
      }
      if (st.liquid[i] !== xl[i]) {
        dLiq++;
        if (samples.length < 25) samples.push(`L(${x},${y}) X=${xl[i]} J=${st.liquid[i]} lt=${xlt[i]}/${st.liquidType[i]} act=${xAct}`);
      } else if (st.liquidType[i] > 0 && xlt[i] > 0 && st.liquidType[i] !== xlt[i] + 1) {
        dLt++;
        if (samples.length < 25) samples.push(`LT(${x},${y}) X=${xlt[i]} J=${st.liquidType[i]}`);
      }
    }
    out.push(`REL${rel}: dAct=${dAct} dTyp=${dTyp} dLiq=${dLiq} dLt=${dLt} draws=${crng.draws}` +
      (samples.length ? `\n   ` + samples.join('\n   ') : ''));
  };

  for (let it = 1; it <= 60; it++) {
    sim.updateLiquid();
    while (nextRelIdx < rels.length && rels[nextRelIdx] === it) {
      cmpWith(rels[nextRelIdx]);
      nextRelIdx++;
    }
  }

  console.log('\n===== SSSS2G2 PER-ITER PARITY =====\n' + out.join('\n') + '\n===== END =====\n');
}, 600000);
