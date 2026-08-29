// IIIII49：pass59 前后双快照（v4：reseed 标签定位，标签=basename:line 与 _i49winlen 同法）。
//   A = ▶UndergroundHousesAndBuriedChests（WorldGen.ts:1146）入口 = slot58 末
//   B = ▶SurfaceChests（WorldGen.ts:1158）入口 = slot59 末（vanilla pass59 出口同位）
// SW_I49S2=1 启用。产出 /tmp/iii50-out/js-snap{A,B}-*.bin
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I49S2 === '1';

type RefT = {
  wall: Uint16Array; type: Uint16Array; flags: Uint8Array; liquid: Uint8Array;
  liquidType: Uint8Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array;
  w: number; h: number;
};

(RUN ? it : it.skip)('I49 dual snapshot around pass 59 (v4)', async () => {
  const StoreP = TileStore.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oIdx = StoreP.idx;
  let ref: RefT | null = null;
  StoreP.idx = function (this: unknown, ...a: unknown[]) {
    if (!ref) ref = this as never;
    return oIdx.apply(this, a);
  };
  const RNGp = RNG.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oReseed = RNGp.reseed;
  let phase = 0;
  RNGp.reseed = function (this: unknown, s: number) {
    let lab = '';
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/([^\s()]+\.ts)):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_i49')) { lab = `${m[2]}:${m[3]}`; break; }
    }
    const lm = Number(lab.split(':')[1] ?? -1);
    if ((phase === 0 && lm === 1146) || (phase === 1 && lm === 1158)) {
      const tag = phase === 0 ? 'A' : 'B';
      if (ref) {
        writeFileSync(`/tmp/iii50-out/js-snap${tag}-wall.bin`, Buffer.from(ref.wall.buffer as ArrayBuffer, ref.wall.byteOffset, ref.wall.byteLength));
        writeFileSync(`/tmp/iii50-out/js-snap${tag}-type.bin`, Buffer.from(ref.type.buffer as ArrayBuffer, ref.type.byteOffset, ref.type.byteLength));
        writeFileSync(`/tmp/iii50-out/js-snap${tag}-flags.bin`, Buffer.from(ref.flags));
        writeFileSync(`/tmp/iii50-out/js-snap${tag}-liq.bin`, Buffer.from(ref.liquid));
        console.log(`[i49s2] ${tag} saved @${lab}`);
      } else console.log(`[i49s2] ${tag} skipped(no ref)`);
      phase++;
    }
    return oReseed.call(this, s);
  };

  await generateWorld({ width: 4200, height: 1200, seedText: '1999040562', evil: 0, seedFlags: { tenthAnniversary: true } });
  StoreP.idx = oIdx;
  RNGp.reseed = oReseed;
}, 900_000);
