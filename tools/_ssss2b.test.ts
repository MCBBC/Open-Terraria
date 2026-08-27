// SSSSSSSS2 探针 v2（用毕删）：JS 侧 DeadMansChestBiome 逐站点记账。
// 与 rig SW_DMLOG 同格式：PLACE(origin rc fail|ok) + SPOTS(D/B/E/W) + 候选扫描 CAND/ADDED/DCNT
// 计数口径 = UnifiedRandom.prototype.internalSample 调用数（=rig MainRolls）。
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const OUT = '/tmp/sss2-out/m12345';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const SEED = process.env.SW_M8_SEED ?? '12345';
const EVIL = process.env.SW_M8_EVIL !== undefined ? Number(process.env.SW_M8_EVIL) : 1;
const RUN = true;

interface SpotLog { line: string }
(RUN ? it : it.skip)('ssss2b deadmans account', async () => {
  let n = 0;
  const URp = (await import('../src/core/rng')).UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: unknown) => number;
  URp.internalSample = function (this: unknown): number {
    n++;
    return oIS.call(this);
  };
  // DeadMansChestBiome 挂账（静态 import 防双实例分叉）
  const mod = await import('../src/world/gen/vanilla/MicroBiomesPass');
  const DMB = mod.DeadMansChestBiome as unknown as { prototype: Record<string, unknown> };
  const logs: string[] = [];
  const proto = DMB.prototype;
  let candRC0 = -1, placeCount = 0;

  const fmtSpots = (self: any) => {
    const d = (self.darts ?? []).map((x: any) => `D${x.x}:${x.y}:${x.directionX}@${x.xPush}`);
    const b = (self.boulders ?? []).map((x: any) => `B${x.x}:${x.y}yp${x.yPush}:${x.bestType}`);
    const e = (self.explosives ?? []).map((x: any) => `E${x.x}:${x.y}`);
    const w = (self.wires ?? []).map((x: any) => `W${x.x}:${x.y}:${x.dirX},${x.dirY}*${x.steps}`);
    return `${d.join(' ')} ${b.join(' ')} ${e.join(' ')} ${w.join(' ')}`.trim();
  };

  const oGet = proto.getPossibleChests as (...a: unknown[]) => Array<{ x: number; y: number }>;
  proto.getPossibleChests = function (this: any, ...a: unknown[]) {
    const out = oGet.apply(this, a);
    logs.push(`DCANDS n=${out.length} rc=${n - candRC0} list=${out.map((c: { x: number; y: number }) => c.x + ':' + c.y).join('|')}`);
    return out;
  };
  void candRC0;

  const oPlace = proto.place as (this: any, x: number, y: number) => boolean;
  proto.place = function (this: any, ox: number, oy: number) {
    const p0 = n;
    const ret = oPlace.call(this, ox, oy);
    placeCount++;
    logs.push(`PLACE ${ox},${oy} rc=${n - p0} ${ret ? 'ok' : 'fail'}`);
    if (ret) logs.push(`SPOTS ${ox},${oy} rc=${n - p0} ${fmtSpots(this)}`);
    else logs.push(`SPOTS ${ox},${oy} rc=${n - p0} fail(see above)`);
    return ret;
  };
  mkdirSync(OUT, { recursive: true });
  const recSeed = (tag: string) => logs.push(`RESEED ${tag} rc=${n}`);
  // 主线：在 Micro_Biomes pass 头打 reseed 锚（stack 含 MicroBiomesPass）
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    if (stack.includes('MicroBiomesPass')) recSeed('micro-head');
    return oReseed.call(this, s);
  };
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: () => { /* 无需 dump */ },
  });
  RNGp.reseed = oReseed;
  URp.internalSample = oIS;
  writeFileSync(`${OUT}/j-dmlog.txt`, logs.join('\n') + '\n');
  console.log(`[probe] dmlog lines=${logs.length} totalSamples=${n}`);
}, 900_000);
