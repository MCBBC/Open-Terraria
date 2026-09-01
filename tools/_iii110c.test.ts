// IIII110c 批一次性诊断：ddual 窗写面位置校准仪——hydrate 新鲜 cap（由
//   tools/_iii89dg.test.ts SW_I89CAP=1 产的 ▶Dungeon reseed 时点全通道 cap）→
//   重放蛇槽缓存 → runDungeonPass，segWatch 段级全图 wall/type/act 快照
//   （type 已映射 vanilla sheet 域,可与 x86 g2v3 dump 对拍）。
// 用法：cd game && \
//   SW_I110C=1 SW_I110C_OUT=/tmp/iii149-out SW_I138_EARLY=1 \
//   SW_I89_OUT=/tmp/iii149-out/cap-pre npx vitest run tools/_iii110c.test.ts
// （cap 产线：SW_I89CAP=1 SW_I89_OUT=/tmp/iii149-out/cap-pre SW_I89_SEED=... \
//   SW_I89_FLAGS=dualDungeons SW_MB_1457=1 npx vitest run tools/_iii89dg.test.ts）
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I110C === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I110C_OUT ?? '/tmp/iii149-out';
const SNAPS = (process.env.SW_I110C_SNAPS ?? 'dungeonPD,dungeonPi,dungeonW,dungeon').split(',');
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
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
        const Ctor = (globalThis as unknown as Record<string, new (n: number) => Uint8Array | Int16Array>)[o.__t];
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
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

(RUN ? it : it.skip)('i110c window-face fullmap snapshots', () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;
  const st0 = hydrate().st;
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as { seed: string };
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st0.w, st0.h);
    for (const c of CHANS) {
      const src = (st0 as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gsRaw.seed), gsRaw as never);
  }

  mkdirSync(JOUT, { recursive: true });
  const lines: string[] = [];
  (globalThis as unknown as { __wvLines?: string[] }).__wvLines = lines;
  (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog = 1;
  (globalThis as unknown as { __dgSegWatch?: (name: string, s: TileStore) => void }).__dgSegWatch =
    (name: string, s: TileStore) => {
      if (!SNAPS.includes(name)) return;
      const w = s.w, h = s.h, n = w * h;
      const rec = s as unknown as Record<string, Uint8Array | Uint16Array>;
      const act = new Uint8Array(n);
      const typ = new Uint16Array(n);
      for (let i = 0; i < n; i++) {
        act[i] = rec.flags[i]! & 1 ? 1 : 0;
        const sh = SHEET[rec.type[i]!];              // x86 dump 域=vanilla sheet id
        typ[i] = sh >= 0 ? sh : 9999;
      }
      writeFileSync(`${JOUT}/js-${name}.wal`, Buffer.from(rec.wall!.buffer, rec.wall!.byteOffset, n * 2));
      writeFileSync(`${JOUT}/js-${name}.typ`, Buffer.from(typ.buffer, typ.byteOffset, n * 2));
      writeFileSync(`${JOUT}/js-${name}.act`, Buffer.from(act.buffer, act.byteOffset, n));
      console.log(`[i110c] snap ${name} -> ${JOUT}/js-${name}.*`);
    };
  const t0 = Date.now();
  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);
  delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
  delete (globalThis as unknown as { __swWvLog?: unknown }).__swWvLog;
  writeFileSync(`${JOUT}/js-w9-110c.txt`, lines.filter((l) => l.startsWith('MARK|W9|')).join('\n') + '\n');
  console.log(`[i110c] dungeon pass done ${((Date.now() - t0) / 1000).toFixed(1)}s gate=${process.env.SW_I138_EARLY ?? 'off'}`);
}, 600_000);
