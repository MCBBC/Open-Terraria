// IIIII179 批一次性诊断：ddual W1 残差三段（Lights 前段/GFD 两臂/GFD 后段）+ #34 MCO dual 支。
//   承 _iii172gc.test.ts 换档：JOUT 缺省 /tmp/iii179-out，env 门 SW_I179GC。
//   新增：
//   ① DR|LN·L7·LCHS·LPCF·LLN（Lights 逐候选/逐骰,x86 rig 同构）+ DR|GA·GFC（GFD 采点/呼叫）
//   ② hydrate 期补建 dualDungeonState.tileProtection/wallProtection（base_dual.json 未含,
//      setupDualDungeonTileProtection 确定性无掷——d0/d1 theme 取 dungeons[i].theme）
//   ③ js034 快照现含 #34 MCO dual 支（Cavinator/CaveOpenater/CanBeClearedDuringGeneration）
// 用法：cd game && SW_I179GC=1 npx vitest run tools/_iii179gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { dualDungeonState, setupDualDungeonTileProtection } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I192GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I179GC_OUT ?? '/tmp/iii179-out';

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
      for (const k of Object.keys(v as object)) out[k] = desVal(v[k]);
      return out;
    }
    return v;
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  // ★IIIII192：base_gs.json 早于 IIII194 的 wgNpcs 面——harness 语境补空数组防 wgSpawnNpc 崩
  (gs as unknown as { wgNpcs?: unknown[] }).wgNpcs ??= [];
  return { st, gs };
}

(RUN ? it : it.skip)('i179 post-dungeon full-channel capture', { timeout: 600_000 }, async () => {
  const du = JSON.parse(readFileSync(`${OUT}/base_dual.json`, 'utf8')) as typeof dualDungeonState;
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds;
  dualDungeonState.dungeons = du.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf;

  const gsRaw = JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8')) as unknown as { seed: string } & Record<string, unknown>;
  // ★IIIII179：base_dual.json 未持久化 tileProtection/wallProtection（Dunes 头产物）——
  //   setup 确定性无掷,按 dungeons theme+crimson 补建（与实链 Dunes 头同参）
  if (dualDungeonState.enabled && !dualDungeonState.tileProtection && dualDungeonState.dungeons.length >= 2) {
    const crimson = !!(gsRaw as unknown as { crimson?: boolean }).crimson;
    setupDualDungeonTileProtection(
      dualDungeonState.dungeons[0]!.theme,
      dualDungeonState.dungeons[1]!.theme,
      crimson,
    );
  }

  const st0 = hydrate().st;
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

  // ★IIIII192：PD_OUT 全网格 dump（x86 x86_s1_PD_out 同位对拍=EARLY 入态写面直检）
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const dumpAt = (pfx: string) => {
    const N = st0.w * st0.h;
    const typ = Buffer.alloc(N * 2), wal = Buffer.alloc(N * 2);
    const act = Buffer.alloc(N);
    for (let i = 0; i < N; i++) {
      const a = st0.flags[i]! & 1;
      act[i] = a;
      const sh = SHEET[st0.type[i]!];
      typ.writeUInt16LE(a ? (sh >= 0 ? sh : 9999) : 0, i * 2);
      wal.writeUInt16LE(st0.wall[i]!, i * 2);
    }
    writeFileSync(`${JOUT}/${pfx}.typ`, typ);
    writeFileSync(`${JOUT}/${pfx}.wal`, wal);
    writeFileSync(`${JOUT}/${pfx}.act`, act);
  };
  // ★IIIII192：runDungeonPass 消费 gsRaw（非 desVal gs）——IIII194 wgNpcs 面补空数组
  (gsRaw as unknown as { wgNpcs?: unknown[] }).wgNpcs ??= [];
  runDungeonPass(st0, new RNG(gsRaw.seed), gsRaw as never, [], (name) => {
    if (name === 'dungeonPD') dumpAt('jsPD');
  });

  // 快照 #33（post-Dungeon）
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

  // 快照 #34（再跑 MCO——本批 dual 支收口的对位面）
  runMountainCavesPass(st0, new RNG(gsRaw.seed), gsRaw as never);
  dump('js034');

  delete g.__swOnRoll;
  delete (globalThis as { __swI113?: unknown }).__swI113;
  delete (globalThis as { __swI168BB?: unknown }).__swI168BB;

  writeFileSync(`${JOUT}/js-dr-trace.txt`, drLines.join('\n') + '\n');
  console.log(`[i179gc] dr rows=${drLines.length} bb dumps=${bbCount} -> ${JOUT}`);
});
