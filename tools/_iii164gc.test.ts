// IIIII164 批一次性诊断：ddual 座1 布局层（CSH 厅数/BIO→RM）+ I138 缺省翻转认证 —— JS 侧采集器。
//   承 _iii158gc.test.ts（i158 车道）换档：JOUT 缺省 /tmp/iii164-out，全局钩名（__swI113/
//   __swI156Walk/__swWvLog）为引擎挂载位不改，仅换档 env 门（SW_I164GC/SW_I164_DR/SW_I164_WALK）。
//   x86 侧：/tmp/i164-rig-src（克隆自 i158-rig-src，md5 3248fc76/b25c0710 双位一致）——
//   存量 x86 证据复用 /tmp/iii158-out/rig3 + /tmp/iii138-out/g2v3（rig 未重产）。
// 用法：cd game && SW_I164GC=1 SW_DG_GC=1 [SW_I138_EARLY=1] [SW_I164_DR=1] npx vitest run tools/_iii164gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I164GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I164GC_OUT ?? '/tmp/iii164-out';

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

(RUN ? it : it.skip)('i164 GC per-attempt stream js-side capture', { timeout: 600_000 }, async () => {
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
  const drLines: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    const s = args.map(String).join(' ');
    if (s.startsWith('GC-') || s.startsWith('T-') || s.startsWith('DGD-') || s.startsWith('PDC-') || s.startsWith('BATT-') || s.startsWith('GTR-')) gcLines.push(`${s}|mr=${rollN}`);
  };
  // ★i164：DR|S/DR|R/DR|Ro 布局域镜像采集（__swI113 挂载;DR|RV 帧内哈希量大,按需收）
  const drCollect = process.env.SW_I164_DR === '1';
  const drAll = process.env.SW_I164_DR_ALL === '1';
  (globalThis as { __swI113?: (line: string) => void }).__swI113 = (line: string) => {
    if (!drCollect) return;
    if (drAll || line.startsWith('DR|S|') || line.startsWith('DR|HC') || line.startsWith('DR|CP') || line.startsWith('DR|R|') || line.startsWith('DR|Ro|')) {
      drLines.push(line);
    }
  };
  // ★i164：snap() 段界 MARK|dungeon*|rc=|mc= 采集（__swWvLog 挂载 → 段界主实例计数）
  const wvLines: string[] = [];
  (globalThis as { __swWvLog?: unknown }).__swWvLog = true;
  (globalThis as { __wvLines?: string[] }).__wvLines = wvLines;
  // ★i164：Legacy 房 walk 取证（__swI156Walk → js-lg-walk.txt；钩名为引擎挂载位保持 156 代号）
  if (process.env.SW_I164_WALK === '1') {
    const walkLines: string[] = [];
    (globalThis as { __swI156Walk?: (p: Record<string, unknown>) => void }).__swI156Walk = (p) => {
      walkLines.push(JSON.stringify(p));
    };
    (globalThis as { __swI156WalkOut?: string[] }).__swI156WalkOut = walkLines;
  }

  // ★IIIII118：pre-pass 基态 dump（hydrate 后、pass 前）——sheet 域与 x86 DumpOnly 同域对拍。
  //   判据：t5 塔顶伪装树是否早于 dungeon pass 存在（x86 pre_ddual t5=0）。
  {
    const fs2 = await import('node:fs');
    const { TILE_DEFS: TD } = await import('../src/data/tiles');
    const w0 = st0.w, h0 = st0.h, n0 = w0 * h0;
    const vtyp = new Uint16Array(n0), vact = new Uint8Array(n0), vwal = new Uint16Array(n0);
    for (let i2 = 0; i2 < n0; i2++) {
      const ty = st0.type[i2]!;
      vtyp[i2] = ty === 0 ? 0 : (TD[ty]?.vanilla?.sheet ?? 9999);
      vact[i2] = st0.flags[i2]! & 1;
      vwal[i2] = st0.wall[i2]!;
    }
    const pfx = process.env.SW_DG_GC_DUMP ?? '';
    if (pfx) {
      for (const [nm, arr] of [['typ', vtyp], ['act', vact], ['wal', vwal]] as const) {
        fs2.writeFileSync(`${pfx}_js_base_pre_ddual.${nm}`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      }
    }
  }

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);

  console.log = origLog;
  delete g.__swOnRoll;
  delete (globalThis as { __swI113?: unknown }).__swI113;
  delete (globalThis as { __swWvLog?: unknown }).__swWvLog;
  delete (globalThis as { __wvLines?: unknown }).__wvLines;

  writeFileSync(`${JOUT}/js-gc-trace.txt`, gcLines.join('\n') + '\n');
  if (drCollect) writeFileSync(`${JOUT}/js-dr-trace.txt`, drLines.join('\n') + '\n');
  writeFileSync(`${JOUT}/js-wv-marks.txt`, wvLines.join('\n') + '\n');
  const walkOut = (globalThis as { __swI156WalkOut?: string[] }).__swI156WalkOut;
  if (walkOut) writeFileSync(`${JOUT}/js-lg-walk.txt`, walkOut.join('\n') + '\n');
  const walkLog = (globalThis as { __swI156WalkLog?: string[] }).__swI156WalkLog;
  if (walkLog) writeFileSync(`${JOUT}/js-cp-walk.txt`, walkLog.join('\n') + '\n');
  console.log(`[i164gc] gc rows=${gcLines.length} dr rows=${drLines.length} wv rows=${wvLines.length} walk=${walkOut?.length ?? 0} cpwalk=${walkLog?.length ?? 0} -> ${JOUT}`);
});
