// IIIII188 一次性探针：capture harness 语境下 runMountainCavesPass 零写面取证。
//   复用 _iii179gc 的 hydrate + dualDungeonState 装配，再跑 MCO 并逐洞记账。
//   零掷 logging-only；结论供台账 §③（#34 MCO 复验）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState, setupDualDungeonTileProtection } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';

const RUN = process.env.SW_I188MCO === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';

  function desVal(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(desVal);
    if (v && typeof v === 'object') {
      const o = v as { __t?: string; d?: unknown[] };
      if (o.__t) {
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => Uint8Array | Int32Array>)[o.__t];
        const arr = new (Ctor as unknown as new (n: number) => never)(o.d?.length ?? 0) as unknown as { set(a: unknown[]): void };
        arr.set(o.d!);
        return arr;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  }

function hydrate(): { st: TileStore; gsRaw: Record<string, unknown>; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as { seed: string } & Record<string, unknown>;
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as Record<string, unknown>) as GenState;
  return { st, gsRaw, gs };
}

(RUN ? it : it.skip)('i188 MCO zero-write probe', { timeout: 600_000 }, async () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState & { ndsf: number };
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  const { st, gsRaw, gs } = hydrate();
  if (dualDungeonState.enabled && !dualDungeonState.tileProtection && dualDungeonState.dungeons.length >= 2) {
    setupDualDungeonTileProtection(dualDungeonState.dungeons[0]!.theme, dualDungeonState.dungeons[1]!.theme, !!(gsRaw as { crimson?: boolean }).crimson);
  }
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st.w, st.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gsRaw.seed as unknown as number), gsRaw as never);
  }
  runDungeonPass(st, new RNG(gsRaw.seed as unknown as number), gsRaw as never, []);

  // MCO 写面记账（零掷：只读快照差）
  const g = globalThis as { __swMcCap?: (gs: GenState, st: TileStore) => void };
  const snaps: Array<{ n: number; act: Uint8Array }> = [];
  g.__swMcCap = (gsM) => {
    console.log(`[mco-probe] entry numMCaves=${gsM.numMCaves} xs=${Array.from(gsM.mCaveX.slice(0, gsM.numMCaves))} ys=${Array.from(gsM.mCaveY.slice(0, gsM.numMCaves))} rockLevel=${gsM.rockLevel}`);
    snaps.push({ n: st.w * st.h, act: st.flags.slice() as unknown as Uint8Array });
  };
  // ★IIIII188：MCO 必须吃 desVal 后的 gs（原始 JSON 的 mCaveX={__t,d} 对象索引即 undefined
  //  → 洞坐标 NaN → 全程零写=_iii179gc capture 的 js034 增量恒 0 的 harness 伪影）
  runMountainCavesPass(st, new RNG(gsRaw.seed as unknown as number), gs);
  g.__swMcCap = undefined;
  if (snaps.length === 1) {
    const before = snaps[0]!.act;
    let d = 0;
    for (let i = 0; i < before.length; i++) if ((before[i]! & 1) !== (st.flags[i]! & 1)) d++;
    console.log(`[mco-probe] act flips after runMountainCavesPass = ${d}`);
  } else {
    console.log(`[mco-probe] __swMcCap not invoked (snaps=${snaps.length})`);
  }
  console.log(`[mco-probe] done`);
});
