// IIIII172 批一次性诊断：ddual 座1 竖井带 MCO 首差 + 蜘蛛厅族 —— JS 侧采集器。
//   承 _iii168gc.test.ts 换档：JOUT 缺省 /tmp/iii172-out，env 门 SW_I172GC。
//   输出：
//   ① js033_*  全通道 post-DungeonPass 快照（=mile8 槽#33=x86 dump 033_Dungeon 对位）
//   ② js034_*  再跑 runMountainCavesPass 后快照（=x86 dump 034_Mountain_Caves 对位）
//   ③ bb_*     __swI168BB bbox 快照（与 x86 rig DumpBox 同构,int32 LE l,t,r,b+5B/格）
//   ④ js-dr-trace.txt（DR| 行 + jmr/jrc 注脚）
//   通道格式（与 x86 SW_DUMP_ALL 同语义,Python 侧直接逐字节对拍）：
//     .typ u16 = active ? sheet(TILE_DEFS.vanilla.sheet,缺失→9999) : 0
//     .act u8  = flags&1        .inact u8 = (wire>>>5)&1
//     .wal u16 = wall 原值      .liq u8/.lty u8(0 基)/.half u8/.slope u8
// 用法：cd game && SW_I172GC=1 npx vitest run tools/_iii172gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I172GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I172GC_OUT ?? '/tmp/iii172-out';

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

(RUN ? it : it.skip)('i172 post-dungeon full-channel capture', { timeout: 600_000 }, async () => {
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

  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number; __swRollTotal?: number };
  let rollN = 0;
  let rollAll = 0;
  let mainInst: object | undefined;
  g.__swOnRoll = (_v, inst) => {
    rollAll++;
    g.__swRollTotal = rollAll;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
  };

  const drLines: string[] = [];
  (globalThis as { __swI113?: (line: string) => void }).__swI113 = (line: string) => {
    drLines.push(`${line}|jmr=${rollN}|jrc=${rollAll}`);
  };

  let bbCount = 0;
  (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void }).__swI168BB =
    (tag, l, t, r, b) => {
      if (r <= l || b <= t) return;
      if (l < 0) l = 0;
      if (t < 0) t = 0;
      if (r > st0.w) r = st0.w;
      if (b > st0.h) b = st0.h;
      if (r <= l || b <= t) return;
      const wCell = r - l, hCell = b - t;
      const buf = Buffer.alloc(16 + wCell * hCell * 5);
      let o = 0;
      buf.writeInt32LE(l, o); o += 4;
      buf.writeInt32LE(t, o); o += 4;
      buf.writeInt32LE(r, o); o += 4;
      buf.writeInt32LE(b, o); o += 4;
      for (let y = t; y < b; y++) {
        for (let x = l; x < r; x++) {
          const i = st0.idx(x, y);
          const ty = st0.type[i]!;
          buf.writeUInt16LE(ty === 0 ? 0 : (TILE_DEFS[ty]?.vanilla?.sheet ?? 9999), o); o += 2;
          buf.writeUInt16LE(st0.wall[i]!, o); o += 2;
          buf.writeUInt8(st0.flags[i]! & 1, o); o += 1;
        }
      }
      writeFileSync(`${JOUT}/bb_${tag}.bb`, buf);
      bbCount++;
    };

  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, []);

  // 快照 #33（post-Dungeon）
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const dump = (pfx: string) => {
    const N = st0.w * st0.h;
    const typ = Buffer.alloc(N * 2), wal = Buffer.alloc(N * 2);
    const act = Buffer.alloc(N), inact = Buffer.alloc(N), liq = Buffer.alloc(N), lty = Buffer.alloc(N);
    const half = Buffer.alloc(N), slope = Buffer.alloc(N);
    for (let i = 0; i < N; i++) {
      const a = st0.flags[i]! & 1;
      act[i] = a;
      const sh = SHEET[st0.type[i]!];
      typ.writeUInt16LE(a ? (sh >= 0 ? sh : 9999) : 0, i * 2);
      wal.writeUInt16LE(st0.wall[i]!, i * 2);
      inact[i] = (st0.wire[i]! >>> 5) & 1;
      liq[i] = st0.liquid[i]!;
      lty[i] = st0.liquid[i]! > 0 ? st0.liquidType[i]! - 1 : 0;
      half[i] = st0.half[i]!;
      slope[i] = st0.slope[i]!;
    }
    writeFileSync(`${JOUT}/${pfx}.typ`, typ);
    writeFileSync(`${JOUT}/${pfx}.wal`, wal);
    writeFileSync(`${JOUT}/${pfx}.act`, act);
    writeFileSync(`${JOUT}/${pfx}.inact`, inact);
    writeFileSync(`${JOUT}/${pfx}.liq`, liq);
    writeFileSync(`${JOUT}/${pfx}.lty`, lty);
    writeFileSync(`${JOUT}/${pfx}.half`, half);
    writeFileSync(`${JOUT}/${pfx}.slope`, slope);
  };
  dump('js033');

  // 快照 #34（再跑 MCO——只为本批 MCO 写面归因,不影响 #33 快照）
  runMountainCavesPass(st0, new RNG(gsRaw.seed), gsRaw as never);
  dump('js034');

  delete g.__swOnRoll;
  delete (globalThis as { __swI113?: unknown }).__swI113;
  delete (globalThis as { __swI168BB?: unknown }).__swI168BB;

  writeFileSync(`${JOUT}/js-dr-trace.txt`, drLines.join('\n') + '\n');
  console.log(`[i172gc] dr rows=${drLines.length} bb dumps=${bbCount} -> ${JOUT}`);
});
