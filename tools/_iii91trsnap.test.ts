// IIII87 jagged 定罪·快照仪 v2：在 Grass 段每个 dig(-1,noYC) runner 起跑瞬间抓 store+UR。
// 输出 /tmp/iii91-out/trsnap/k<KK>/{各通道 bin,args.json}
// 用法：cd game && SW_I91TS=1 npx vitest run tools/_iii91trsnap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = !!process.env.SW_I91TS;
const DIR = process.env.SW_I91TS_DIR ?? '/tmp/iii91-out/trsnap';

class AbortSnap extends Error {
  swAbort = true;
  constructor() { super('TRSNAP_ABORT'); }
}

type TypedArray = Int16Array | Uint16Array | Uint8Array | Int32Array | Uint32Array;
interface StoreLike { [k: string]: TypedArray | undefined }

(RUN ? it : it.skip)('IIIII87 multi-snapshot', async () => {
  let ended = false;
  let worldRef: { store: StoreLike } | null = null;
  let grassDigCount = -1;
  let urRef: { seedArray: Int32Array; inext: number } | null = null;

  const RNGp = RNG.prototype as unknown as { reseed: (this: { ur?: unknown }, s: number) => void };
  const oReseed = RNGp.reseed;
  RNGp.reseed = function (this: { ur?: unknown }, s: number) {
    const r = oReseed.call(this, s);
    if (this.ur) urRef = this.ur as unknown as { seedArray: Int32Array; inext: number };
    return r;
  };

  (globalThis as { __swTrCall?: (o2: Record<string, unknown>) => void }).__swTrCall =
    (o2) => {
      if (ended) return;
      if (o2.type !== -1 || !o2.nyC) return;
      grassDigCount++;
      try {
        const dir = `${DIR}/k${grassDigCount}`;
        mkdirSync(dir, { recursive: true });
        const st = worldRef!.store;
        for (const chn of ['type', 'flags', 'wall', 'half', 'slope', 'liquid', 'liquidType', 'wire', 'frameX', 'frameY']) {
          const arr = st[chn];
          if (arr && arr.buffer) writeFileSync(`${dir}/${chn}.bin`, Buffer.from(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)));
        }
        const u = urRef!;
        writeFileSync(`${dir}/ur.json`, JSON.stringify({ a: Array.from(u.seedArray), inext: u.inext }));
        writeFileSync(`${dir}/args.json`, JSON.stringify(o2));
      } catch (err) { console.log('grab fail', String(err)); }
      console.log(`TRSNAP saved #${grassDigCount}`);
      if (grassDigCount >= 24) {
        ended = true;
        throw new AbortSnap();
      }
    };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: process.env.SW_I91TS_SEED ?? '771005', evil: 0,
      seedFlags: { digExtraHoles: true },
      onWorldPartial: (world) => { if (!worldRef) worldRef = world as never; },
    });
  } catch (e) {
    if (!(e as { swAbort?: boolean })?.swAbort) throw e;
  }
}, 300_000);
