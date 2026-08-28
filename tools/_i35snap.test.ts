// ★IIIII33 批一次性仪①：全管线跑到「微群系」(Micro Biomes,#97)槽末(≡x86 dump097)后整存整取快照。
// （#98 Settle_Liquids_Again 的基座=前槽末态；1457 序 MicroBiomes < SettleLiquidsPart2）
// 用法：cd game && SW_I35=1 SW_I35_CHAIN=notraps npx vitest run tools/_i35snap.test.ts
// 产物：/tmp/iii35-out/snap97-<chain>.json（含 base64 buffer）
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I35 === '1';
const CHAIN = process.env.SW_I35_CHAIN ?? 'notraps';
const OUT = process.env.I35_OUT ?? '/tmp/iii35-out';
// IIII31 快照槽名='地表装饰'→dump076；本批钉「微群系」→dump097（rdump 序与
// mile8 SLOT_END 表一致：…96 Larva<97 Micro_Biomes<98 Settle_Liquids_Again…）
const PIN = process.env.SW_I35_PIN ?? '微群系';

const CFG = CHAIN === 'const'
  ? { seedText: '1321365005', evil: -1 as -1 | 0 | 1, seedFlags: { theConstant: true } }
  : { seedText: '1896728457', evil: 1 as -1 | 0 | 1, seedFlags: { noTraps: true } };

(RUN ? it : it.skip)(`i35 snap ${CHAIN}`, async () => {
  mkdirSync(OUT, { recursive: true });
  let done = false;
  await generateWorld({
    width: 4200, height: 1200,
    seedText: CFG.seedText, evil: CFG.evil,
    seedFlags: CFG.seedFlags,
    onWorldPartial: (w, _i, pn) => {
      if (pn !== PIN) return;
      const s = w.store;
      const gs = lastGenState();
      const snap = {
        chain: CHAIN,
        pin: PIN,
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
          waterLine: (gs as unknown as Record<string, number>)?.waterLine,
        },
        chests: (w.chests ?? []).map((c) => ({ x: c.x, y: c.y, items: c.items })),
        genSolidOverrides: [...snapshotGenSolid()],
      };
      writeFileSync(`${OUT}/snap97-${CHAIN}.json`, JSON.stringify(snap));
      console.log(`snap written: ${OUT}/snap97-${CHAIN}.json`);
      done = true;
    },
  });
  if (!done) throw new Error(`${PIN} slot never fired`);
}, 900_000);

function b64(v: Uint8Array | Uint16Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}
