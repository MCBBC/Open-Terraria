// IIII102b 一次性诊断：Dungeon pass 单窗重放 + wormlike 节点链导出（SW_I129=1）。
// 复用 cap-ddual 基座（_iii89dg 捕获面）→ __swI129Worm 收集 DWormlikeRoom 计算相
//   的 nodes/radii/dir0/rot2/final bounds → /tmp/iii129-out/worm.json。
// 用法：cd game && SW_I129=1 SW_I89_OUT=/tmp/iii129-out/cap-ddual npx vitest run tools/_iii129worm.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I129 === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii129-out/cap-ddual';

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  function desVal(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(desVal);
    if (v && typeof v === 'object') {
      const o = v as { __t?: string; d?: unknown[] };
      if (o.__t) {
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
        const arr = new (Ctor as unknown as new (n: number) => unknown)(o.d?.length ?? 0) as unknown as { set(a: unknown[]): void };
        arr.set(o.d!);
        return arr;
      }
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

(RUN ? it : it.skip)('replay dungeon pass with worm log', () => {
  const { st, gs } = hydrate();
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st.w, st.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gs.seed), gs);
  }
  const worm: Array<Record<string, unknown>> = [];
  (globalThis as unknown as { __swI129Worm?: Array<Record<string, unknown>> }).__swI129Worm = worm;
  const tables: Record<string, { list: Array<Record<string, unknown>> }> = {};
  const oAtt = (globalThis as unknown as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att;
  (globalThis as unknown as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att = (e) => {
    if ((e as { kind?: string }).kind === 'rooms') {
      const k = String((e as { k?: number }).k);
      tables[k] = { list: (e as { list?: Array<Record<string, unknown>> }).list ?? [] };
      console.log(`[i129] table k${k}: n=${tables[k]!.list.length}`);
    }
  };
  try {
    runDungeonPass(st, new RNG(gs.seed), gs, []);
  } finally {
    delete (globalThis as unknown as { __swI129Worm?: Array<Record<string, unknown>> }).__swI129Worm;
    (globalThis as unknown as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att = oAtt;
  }
  writeFileSync('/tmp/iii129-out/worm.json', JSON.stringify(worm));
  writeFileSync('/tmp/iii129-out/worm-tables.json', JSON.stringify(tables));
  console.log(`[i129] worm rooms=${worm.length} -> /tmp/iii129-out/worm.json`);
}, 900_000);
