// PPPPPPP 一次性诊断：#97 DeadMans 三件套（sink 缺箱/后置门拒/IsAGoodSpot 拒）
// 用法：cd game && SW_PPP=1 SW_PPP_SEED=9293480 SW_PPP_EVIL=0 npx vitest run tools/_ppp1.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';

const RUN = process.env.SW_PPP === '1';
const SEED = process.env.SW_PPP_SEED ?? '9293480';
const EVIL = Number(process.env.SW_PPP_EVIL ?? 0);
const W = Number(process.env.SW_PPP_W ?? 4200), H = 1200;
const OUT = process.env.SW_PPP_OUT ?? '/tmp/ppp-out/ppp1-g.json';

(RUN ? it : it.skip)('ppp1 deadmans sink/gate dump', async () => {
  const sinkDump: Array<{ x: number; y: number }> = [];
  const places: Array<{ p: string; ok: boolean; darts: number; boulders: number; expl: number }> = [];

  const proto = DeadMansChestBiome.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  // 包装 getPossibleChests：抓 sink 全量序（零额外掷）
  const oGetPoss = proto.getPossibleChests as (this: DeadMansChestBiome) => Array<{ x: number; y: number }>;
  proto.getPossibleChests = function (this: never) {
    const self = this as unknown as { chestList: Array<{ x: number; y: number }> };
    for (const c of self.chestList) sinkDump.push({ x: c.x, y: c.y });
    return oGetPoss.call(self) as Array<{ x: number; y: number }>;
  };
  // 包装 place：抓受理面内部计数（place 本身就要跑，零额外掷）
  const oPlace = proto.place as (this: any, ox: number, oy: number) => boolean;
  proto.place = function (this: any, ox: number, oy: number) {
    const ok = oPlace.call(this, ox, oy) as boolean;
    places.push({ p: `${ox},${oy}`, ok, darts: this.darts.length, boulders: this.boulders.length, expl: this.explosives.length });
    return ok;
  };

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
  });
  writeFileSync(OUT, JSON.stringify({ seed: SEED, evil: EVIL, sinkSize: sinkDump.length, sink: sinkDump, places }));
  console.log(`sink=${sinkDump.length} places=${places.length} -> ${OUT}`);
}, 600_000);
