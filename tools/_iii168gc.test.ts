// IIIII168 批一次性诊断：ddual 布局相结构级 bbox 快照对拍 —— JS 侧采集器。
//   承 _iii165gc.test.ts 换档：JOUT 缺省 /tmp/iii168-out，env 门 SW_I168GC。
//   ★本批增量：
//   ①__swI168BB 挂载（DungeonPass/DungeonDualLayout dormant 钩消费）——布局相逐房/逐厅
//     generate 前后 bbox 快照（i{N}r{i}|p{j}|c{k}|s{l}|h{m}|cl{seq}|eh{seq} a/b），格式与
//     x86 rig JJHook.DumpBox 逐字节同构（int32 LE l,t,r,b 半开域 + typ(2LE)+wal(2LE)+act(1)）；
//   ②保留 i165 的 DR| 行采集（|jmr=|jrc= 注脚）+ __swOnRoll（jmr/jrc 计数）。
//   对拍锚（x86 /tmp/iii165-rig1/mark.log rc 空间）：W1=(i1 HG 47772516, i2 INL 48221384]。
// 用法：cd game && SW_I168GC=1 npx vitest run tools/_iii168gc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runDualDungeonsDitherSnakePass, dualSnakes } from '../src/world/gen/vanilla/DitherSnakePass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I168GC === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';
const JOUT = process.env.SW_I168GC_OUT ?? '/tmp/iii168-out';

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

(RUN ? it : it.skip)('i168 bbox snapshot js-side capture', { timeout: 600_000 }, async () => {
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
  // ★i168b：wv marks（snap/dgpMark 段界行,五窗对账用）
  const wvLines: string[] = [];
  (globalThis as { __wvLines?: string[] }).__wvLines = wvLines;

  // ★i168：bbox 快照挂载——格式与 x86 JJHook.DumpBox 逐字节同构（零掷,logging-only）
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

  delete g.__swOnRoll;
  delete (globalThis as { __swI113?: unknown }).__swI113;
  delete (globalThis as { __swI168BB?: unknown }).__swI168BB;
  delete (globalThis as { __wvLines?: unknown }).__wvLines;

  writeFileSync(`${JOUT}/js-dr-trace.txt`, drLines.join('\n') + '\n');
  writeFileSync(`${JOUT}/js-wv-marks.txt`, wvLines.join('\n') + '\n');
  console.log(`[i168gc] dr rows=${drLines.length} bb dumps=${bbCount} -> ${JOUT}`);
});
