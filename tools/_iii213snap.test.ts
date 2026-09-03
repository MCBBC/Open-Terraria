// ★IIIII213 一次性仪①：REMIX 全管线跑到「微群系」(#97)槽末整存整取快照（#98 基座）。
// 产物：/tmp/iii213-out/snap97-remix.json（含 genSolidOverrides=严格口径，i35 同款）
// 用法：cd game && SW_I213S=1 npx vitest run tools/_iii213snap.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I213S === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';
// mile8 remix 快照同参：{SW_MB_1457=1(缺省), SW_I81_EVIL=0, seed=1138154190, 4200×1200, flags=remix}
const PIN = process.env.SW_I213_PIN ?? '微群系';

(RUN ? it : it.skip)('iii213 snap remix #97', async () => {
  mkdirSync(OUT, { recursive: true });
  let done = false;
  await generateWorld({
    width: 4200, height: 1200,
    seedText: '1138154190', evil: 0,
    seedFlags: { remix: true },
    onWorldPartial: (w, _i, pn) => {
      if (pn !== PIN) return;
      const s = w.store;
      const gs = lastGenState();
      const snap = {
        chain: 'remix',
        pin: PIN,
        store: {
          type: b64(s.type), flags: b64(s.flags), frameX: b64(s.frameX), frameY: b64(s.frameY),
          wall: b64(s.wall), half: b64(s.half), slope: b64(s.slope), wire: b64(s.wire),
          paint: b64(s.paint), paintWall: b64(s.paintWall), coat: b64((s as unknown as Record<string, Uint8Array>).coat),
          liquid: b64(s.liquid), liquidType: b64(s.liquidType),
        },
        w: s.w, h: s.h,
        gsPick: {
          seed: gs?.seed,
          seedFlags: { ...(gs?.seedFlags ?? {}) } as Record<string, boolean>,
          worldSurface: gs?.worldSurface, rockLevel: gs?.rockLevel,
          lavaLine: gs?.lavaLine, beachDistance: gs?.beachDistance, dungeonSide: gs?.dungeonSide,
          shimmerX: gs?.shimmerX, shimmerY: gs?.shimmerY,
          waterLine: (gs as unknown as Record<string, number>)?.waterLine,
          remixSurfaceLayerLow: (gs as unknown as Record<string, number>)?.remixSurfaceLayerLow,
          remixSurfaceLayerHigh: (gs as unknown as Record<string, number>)?.remixSurfaceLayerHigh,
        },
        genSolidOverrides: [...snapshotGenSolid()],
      };
      writeFileSync(`${OUT}/snap97-remix.json`, JSON.stringify(snap));
      console.log(`snap written: ${OUT}/snap97-remix.json (pin=${PIN})`);
      done = true;
    },
  });
  if (!done) throw new Error(`${PIN} slot never fired`);
}, 900_000);

function b64(v: Uint8Array | Uint16Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}
