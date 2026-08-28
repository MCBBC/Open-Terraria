// ★IIII31 批一次性仪①：全管线跑到「地表装饰」(Traps)槽末(≡x86 dump076)后整存整取快照。
// 用法：cd game && SW_I31=1 SW_I31_CHAIN=notraps npx vitest run tools/_i31snap.test.ts
// 产物：/tmp/iii32-out/snap76-<chain>.json（含 base64 buffer）
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I31 === '1';
const CHAIN = process.env.SW_I31_CHAIN ?? 'notraps';
const OUT = process.env.I32_OUT ?? '/tmp/iii32-out';

const CFG = CHAIN === 'const'
  ? { seedText: '1321365005', evil: -1 as -1 | 0 | 1, seedFlags: { theConstant: true } }
  : { seedText: '1896728457', evil: 1 as -1 | 0 | 1, seedFlags: { noTraps: true } };

(RUN ? it : it.skip)(`i31 snap ${CHAIN}`, async () => {
  mkdirSync(OUT, { recursive: true });
  let done = false;
  await generateWorld({
    width: 4200, height: 1200,
    seedText: CFG.seedText, evil: CFG.evil,
    seedFlags: CFG.seedFlags,
    onWorldPartial: (w, _i, pn) => {
      if (pn !== '地表装饰') return;
      const s = w.store;
      const gs = lastGenState();
      const snap = {
        chain: CHAIN,
        store: {
          type: b64(s.type), flags: b64(s.flags), frameX: b64(s.frameX), frameY: b64(s.frameY),
          wall: b64(s.wall), half: b64(s.half), slope: b64(s.slope), wire: b64(s.wire),
          paint: b64(s.paint), paintWall: b64(s.paintWall), coat: b64((s as unknown as Record<string, Uint8Array>).coat), liquid: b64(s.liquid), liquidType: b64(s.liquidType),
        },
        w: s.w, h: s.h,
        gsPick: {
          seed: gs?.seed,
          seedFlags: { ...(gs?.seedFlags ?? {}) } as Record<string, boolean>,
          worldSurface: gs?.worldSurface, rockLevel: gs?.rockLevel,
          lavaLine: gs?.lavaLine, beachDistance: gs?.beachDistance, dungeonSide: gs?.dungeonSide,
          shimmerX: gs?.shimmerX, shimmerY: gs?.shimmerY,
        },
        chests: (w.chests ?? []).map((c) => ({ x: c.x, y: c.y, items: c.items })),
        genSolidOverrides: [...snapshotGenSolid()],
      };
      writeFileSync(`${OUT}/snap76-${CHAIN}.json`, JSON.stringify(snap));
      console.log(`snap written: ${OUT}/snap76-${CHAIN}.json`);
      done = true;
    },
  });
  if (!done) throw new Error('地表装饰 slot never fired');
}, 900_000);

function b64(v: Uint8Array | Uint16Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}
