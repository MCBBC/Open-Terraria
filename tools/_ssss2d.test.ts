// SSSSSSSS2 探针 v4d（用毕删，产物 /tmp/sss2-12345line/j-candlog.txt）：
// 候选扫描逐箱账本——零行为差异包装：isAGoodSpot/findBoulder/findDart/enough 观测
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { countWires } from '../src/world/gen/vanilla/MicroBiomesPass';

const OUT = '/tmp/sss2-12345line';
const W = 4200, H = 1200;
const RUN = true;
(RUN ? it : it.skip)('ssss2d candidate gates', async () => {
  let n = 0;
  const URp = (await import('../src/core/rng')).UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = URp.internalSample as (this: unknown) => number;
  URp.internalSample = function (): number { n++; return oIS.call(this); };
  const mod = await import('../src/world/gen/vanilla/MicroBiomesPass');
  const DMB = mod.DeadMansChestBiome as unknown as { prototype: Record<string, any> };
  const proto = DMB.prototype;
  mkdirSync(OUT, { recursive: true });
  const logs: string[] = [];
  // 每次 getPossibleChests 调用一个 block
  const oGood = proto.isAGoodSpot as (...a: unknown[]) => boolean;
  proto.isAGoodSpot = function (this: any, x: number, y: number): boolean {
    const r = oGood.call(this, x, y);
    logs.push(`GOOD ${x},${y} r=${r ? 1 : 0} wires=${countWires(this.st, x, y, 20)} chestListN=${this.chestList.length}`);
    return r;
  };
  const oB = proto.findBoulderTrapSpots as (...a: unknown[]) => void;
  proto.findBoulderTrapSpots = function (this: any, px: number, py: number) {
    oB.call(this, px, py);
    logs.push(`FB ${px},${py} b=${this.boulders.length} w=${this.wires.length}`);
  };
  const oD = proto.findDartTrapSpots as (...a: unknown[]) => void;
  proto.findDartTrapSpots = function (this: any, px: number, py: number) {
    oD.call(this, px, py);
    logs.push(`FD ${px},${py} d=${this.darts.length}`);
  };
  const oE = proto.areThereEnoughTraps as (...a: unknown[]) => boolean;
  proto.areThereEnoughTraps = function (this: any): boolean {
    const r = oE.call(this);
    logs.push(`EN d=${this.darts.length} b=${this.boulders.length} e=${this.explosives.length} r=${r ? 1 : 0}`);
    return r;
  };
  const oGet = proto.getPossibleChests as (...a: unknown[]) => Array<{ x: number; y: number }>;
  proto.getPossibleChests = function (this: any): Array<{ x: number; y: number }> {
    const out = oGet.call(this);
    logs.push(`DCANDS n=${out.length} list=${out.map((c) => c.x + ':' + c.y).join('|')}`);
    logs.push(`CHESTREG ${JSON.stringify((this.chestList ?? []).map((c: any) => `${c.x},${c.y}`))}`);
    return out;
  };
  await generateWorld({
    width: W, height: H, seedText: '12345', evil: 1,
    onWorldPartial: () => {},
  });
  URp.internalSample = oIS;
  writeFileSync(`${OUT}/j-candlog.txt`, logs.join('\n') + '\n');
  console.log(`[probe] cand lines=${logs.length} samples=${n}`);
}, 900_000);
