// IIIII200 一次性诊断：ddual 真链坑井受理态逐格仪。
//   真链 generateWorld 直跑（无 hydrate 复跑污染）+ __swI113 DR 行（含 ★IIIII200 PT|/SET|
//   行,SW_I179+SW_I200 双门）+ __swI168BB bbox 快照（含 pt<k> 坑井区域,与 x86 JJHook.PitDump
//   同格式：int32 l,t,r,b + 每格 typ(2LE sheet)/wal(2LE)/act(1)）。
//   C0−30 口径同 _iii192chain：蛇槽末（Dual_Dungeons_Dither_Snake）清零 jrc。
// 用法：cd game && SW_I200CHAIN=1 SW_I179=1 SW_I200=1 SW_MB_1457=1 \
//        SW_I200CHAIN_OUT=/tmp/iii200-out/js npx vitest run tools/_iii200chain.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I200CHAIN === '1';
const OUT = process.env.SW_I200CHAIN_OUT ?? '/tmp/iii200-out/js';

(RUN ? it : it.skip)('i200 full-chain pit trace capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (line: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swRollN?: number;
    __swRollTotal?: number;
    __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void;
  };
  const rows: string[] = [];
  g.__swI113 = (line: string) => { rows.push(`${line}|jmr=${g.__swRollN ?? -1}|jrc=${g.__swRollTotal ?? -1}`); };
  let rollN = 0, rollAll = 0, mainInst: object | undefined;
  g.__swOnRoll = (_v, inst) => {
    rollAll++;
    g.__swRollTotal = rollAll;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    rollN++;
    g.__swRollN = rollN;
  };

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  let store: TileStore | undefined;
  let bbCount = 0;
  g.__swI168BB = (tag, l, t, r, b) => {
    if (!store) return;
    const st = store;
    if (r <= l || b <= t) return;
    if (l < 0) l = 0;
    if (t < 0) t = 0;
    if (r > st.w) r = st.w;
    if (b > st.h) b = st.h;
    if (r <= l || b <= t) return;
    // 动态 import 规避循环依赖：写文件走 node:fs 动态取
    const fs = require('node:fs') as typeof import('node:fs');
    const wCell = r - l, hCell = b - t;
    const buf = Buffer.alloc(16 + wCell * hCell * 5);
    let o = 0;
    buf.writeInt32LE(l, o); o += 4;
    buf.writeInt32LE(t, o); o += 4;
    buf.writeInt32LE(r, o); o += 4;
    buf.writeInt32LE(b, o); o += 4;
    for (let y = t; y < b; y++) {
      for (let x = l; x < r; x++) {
        const idx = st.idx(x, y);
        const ty = st.type[idx]!;
        buf.writeUInt16LE(ty === 0 ? 0 : (SHEET[ty] >= 0 ? SHEET[ty]! : 9999), o); o += 2;
        buf.writeUInt16LE(st.wall[idx]!, o); o += 2;
        buf.writeUInt8(st.flags[idx]! & 1, o); o += 1;
      }
    }
    fs.writeFileSync(`${OUT}/bb_${tag}.bb`, buf);
    bbCount++;
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
      onWorldPartial: (w: { store: TileStore }, _i: number, pn: string) => {
        if (pn === 'Dual_Dungeons_Dither_Snake') { rollN = 0; rollAll = 0; mainInst = undefined; }
        store ??= w.store;
      },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete g.__swI113;
    delete g.__swOnRoll;
    delete g.__swI168BB;
  }
  const fs2 = require('node:fs') as typeof import('node:fs');
  fs2.writeFileSync(`${OUT}/js-dr-trace.txt`, rows.join('\n') + '\n');
  console.log(`[i200chain] dr rows=${rows.length} bb dumps=${bbCount} -> ${OUT}`);
});
