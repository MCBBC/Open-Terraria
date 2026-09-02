// IIII114b2 批一次性诊断：G 段(BasicChests)逐房/逐 attempt 双端流对拍 JS 侧采集器。
//   x86 侧：/tmp/i154-rig-src（i113b 血统+SW_GCLOG 门控 GC-RM/GC-TRY/GC-FA 钩,mr=MainRolls/rc=RollCount）
//   JS 侧：cap-pre 基座 + DungeonPass.ts SW_DG_GC=1 dormant 钩（console.log）→ 本工具包一层
//   console.log 追加 |mr=<主实例掷计数>（__swOnRoll 首样本锁 MainInst,x86 SW_MAINROLL=1 同口径）。
// 用法：cd game && SW_I154GC=1 SW_I154GC_OUT=/tmp/iii154-out npx vitest run tools/_iii154gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I154GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I154GC_OUT ?? '/tmp/iii154-out';

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

(RUN ? it : it.skip)('i154 GC per-attempt stream js-side capture', () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;

  const st0 = hydrate().st;
  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as { seed: string };
  if (du.dungeons.length >= 2 && !dualSnakes[0]) {
    const scr = new TileStore(st0.w, st0.h);
    for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = (st0 as unknown as Record<string, Uint8Array | Uint16Array>)[c]!;
      (scr as unknown as Record<string, Uint8Array | Uint16Array>)[c]!.set(src);
    }
    runDualDungeonsDitherSnakePass(scr, new RNG(gsRaw.seed), gsRaw as never);
  }

  const g = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number };
  let rollN = 0;
  let mainInst: object | undefined;
  g.__swOnRoll = (_v, inst) => {
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
  };

  const gcLines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    const s = args.map(String).join(' ');
    if (s.startsWith('GC-') || s.startsWith('T-')) gcLines.push(`${s}|mr=${rollN}`);
  };

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);

  console.log = origLog;
  delete g.__swOnRoll;

  writeFileSync(`${JOUT}/js-gc-trace.txt`, gcLines.join('\n') + '\n');
  console.log(`[i154gc] gc rows=${gcLines.length} -> ${JOUT}/js-gc-trace.txt`);
});
