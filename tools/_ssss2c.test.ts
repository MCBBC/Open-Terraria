// SSSSSSSS2 探针 v3（用毕删）：DeadMansChestBiome 分级记账（与 rig-v2 DmLog 同构）
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const OUT = '/tmp/sss2-out/m12345';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const SEED = process.env.SW_M8_SEED ?? '12345';
const EVIL = process.env.SW_M8_EVIL !== undefined ? Number(process.env.SW_M8_EVIL) : 1;
const RUN = true;
(RUN ? it : it.skip)('ssss2c deadmans staged', async () => {
  let n = 0;
  const URp = (await import('../src/core/rng')).UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: unknown) => number;
  URp.internalSample = function (): number { n++; return oIS.call(this); };
  const mod = await import('../src/world/gen/vanilla/MicroBiomesPass');
  const DMB = mod.DeadMansChestBiome as unknown as { prototype: Record<string, any> };
  const proto = DMB.prototype;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-9999);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (t: number): number => (SHEET[t] ?? -1);
  const logs: string[] = [];
  const wrap = (name: string, tag?: (ret: unknown, self: any) => string | undefined) => {
    const o = proto[name] as (...a: unknown[]) => unknown;
    proto[name] = function (this: any, ...a: unknown[]) {
      const p0 = n;
      const ret = o.apply(this, a);
      const line = `${name} rc=${n - p0}`;
      const extra = tag ? tag(ret, this) : undefined;
      logs.push(`${line}${extra ? ' ' + extra : ''}`);
      return ret;
    };
  };
  let curPlaceBase = -1;
  const wrapP = (name: string) => {
    const o = proto[name] as (this: any, ox: number, oy: number) => boolean;
    proto[name] = function (this: any, ox: number, oy: number) {
      curPlaceBase = n;
      const ret = o.call(this, ox, oy);
      logs.push(`PLACE ${ox},${oy} rc=${n - curPlaceBase} ${ret ? 'ok' : 'fail'}`);
      return ret;
    };
  };
  wrap('findBoulderTrapSpots');
  const fmtSpots = (self: any, pre: boolean) => {
    const d = (self.darts ?? []).map((x: any) => `D${x.x}:${x.y}:${x.directionX}@${x.xPush}`);
    const b = (self.boulders ?? []).map((x: any) => `B${x.x}:${x.y}yp${x.yPush}:${sh(x.bestType)}`);
    const e = (self.explosives ?? []).map((x: any) => `E${x.x}:${x.y}`);
    let w = (self.wires ?? []).map((x: any) => `W${x.x}:${x.y}:${x.dirX},${x.dirY}*${x.steps}`);
    if (!pre) return `${d.join(' ')} ${b.join(' ')} ${e.join(' ')} ${w.join(' ')}`.trim();
    return '';
  };
  // 需要在 FindExplosive 完成后打 SPOTS（pre-writes 版本）——包 areThereEnoughTraps 恰在其后调用
  const oAre = proto.areThereEnoughTraps as (...a: unknown[]) => boolean;
  proto.areThereEnoughTraps = function (this: any, ...a: unknown[]) {
    const r = oAre.apply(this, a);
    if (r) logs.push(`SPOTS pre rc=${n - curPlaceBase} ${fmtSpots(this, true)}|${fmtSpots(this, false)}`);
    void fmtSpots;
    return r;
  };
  wrap('turnGoldChestIntoDeadMansChest');
  const dartLog: string[] = [];
  const oDart = proto.actuallyPlaceDartTrap as (this: any, d: any) => void;
  proto.actuallyPlaceDartTrap = function (this: any, d: any) {
    const p0 = n;
    oDart.call(this, d);
    dartLog.push(`DART ${d.trapX}:${d.trapY} dir=${d.directionX} push=${d.xPush} rc=${n - p0}`);
  };
  wrap('placeWireLine');
  const bldLog: string[] = [];
  const oBld = proto.actuallyPlaceBoulderTrap as (this: any, b: any) => void;
  proto.actuallyPlaceBoulderTrap = function (this: any, b: any) {
    const p0 = n;
    oBld.call(this, b);
    bldLog.push(`BOULD ${b.x}:${b.y} best=${sh(b.bestType)} rc=${n - p0}`);
  };
  const exLog: string[] = [];
  const oEx = proto.actuallyPlaceExplosive as (this: any, e: any) => void;
  proto.actuallyPlaceExplosive = function (this: any, e: any) {
    const p0 = n;
    oEx.call(this, e);
    exLog.push(`EXPL ${e.x}:${e.y} rc=${n - p0}`);
  };
  wrapP('place');
  mkdirSync(OUT, { recursive: true });
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: () => { /* none */ },
  });
  URp.internalSample = oIS;
  writeFileSync(`${OUT}/j-dmlog.txt`, logs.join('\n') + '\n---DART---\n' + dartLog.join('\n') + '\n---BOULD---\n' + bldLog.join('\n') + '\n---EXPL---\n' + exLog.join('\n') + '\n');
  console.log(`[probe] staged dmlog lines=${logs.length} samples=${n}`);
}, 900_000);
