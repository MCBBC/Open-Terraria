// IIIII206 一次性诊断：ddual 座1 后段特征链写面对拍仪（座2 竖井定谳批）。
//   真链 generateWorld 直跑 + __swI113 DR 行（roll 账）+ __dgSegWatch 段级全图快照
//   （typ=uint16 LE SHEET 域 / wal=uint16 LE / act=uint8，与 x86 rig DumpOnly 同布局：
//   x86_s1_G_out ↔ js dungeonG、x86_s1_T_in ↔ js dungeonI、x86_s1_F_in ↔ js dungeonT、
//   x86_s1_PD_out ↔ js dungeonD）。座次按 occurrence 序（i1 先 i2 后）编 #0/#1。
// 用法：cd game && SW_I206CHAIN=1 SW_I179=1 SW_MB_1457=1 \
//        SW_I206CHAIN_OUT=/tmp/iii206-out/js npx vitest run tools/_iii206chain.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I206CHAIN === '1';
const OUT = process.env.SW_I206CHAIN_OUT ?? '/tmp/iii206-out/js';

(RUN ? it : it.skip)('i206 dual dungeon stage snapshot capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (line: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swRollN?: number;
    __swRollTotal?: number;
    __dgSegWatch?: (name: string, st: TileStore) => void;
  };
  const rows: string[] = [];
  g.__swI113 = (line: string) => { rows.push(`${line}|jmr=${g.__swRollN ?? -1}|jrc=${g.__swRollTotal ?? -1}`); };
  let rollAll = 0, mainInst: object | undefined;
  g.__swOnRoll = (_v, inst) => {
    rollAll++;
    g.__swRollTotal = rollAll;
    if (mainInst === undefined) mainInst = inst;
    else if (inst !== mainInst) return;
    g.__swRollN = rollAll;
  };

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  // dump 哪些段 + 每段第几次（0=座1, 1=座2）
  const WANT = new Set(['dungeonPi', 'dungeonS', 'dungeonD', 'dungeonW', 'dungeonP', 'dungeonC',
    'dungeonB', 'dungeonG', 'dungeonI', 'dungeonT', 'dungeonF', 'dungeonPa', 'dungeonBa', 'dungeonLate']);
  const occ: Record<string, number> = {};
  let dumped = 0;
  g.__dgSegWatch = (name: string, st: TileStore) => {
    if (!WANT.has(name)) return;
    const k = (occ[name] = (occ[name] ?? -1) + 1);
    const fs = require('node:fs') as typeof import('node:fs');
    const w = st.w, h = st.h, n = w * h;
    const typ = Buffer.alloc(n * 2);
    const wal = Buffer.alloc(n * 2);
    const act = Buffer.alloc(n);
    let o = 0;
    for (let i = 0; i < n; i++) {
      const ty = st.type[i]!;
      const sh = ty === 0 ? 0 : (SHEET[ty] >= 0 ? SHEET[ty]! : 9999);
      typ[o * 2] = sh & 0xff; typ[o * 2 + 1] = (sh >> 8) & 0xff;
      wal[o * 2] = st.wall[i]! & 0xff; wal[o * 2 + 1] = (st.wall[i]! >> 8) & 0xff;
      act[o] = st.flags[i]! & 1;
      o++;
    }
    fs.writeFileSync(`${OUT}/js_s${k}_${name.slice('dungeon'.length)}.typ`, typ);
    fs.writeFileSync(`${OUT}/js_s${k}_${name.slice('dungeon'.length)}.wal`, wal);
    fs.writeFileSync(`${OUT}/js_s${k}_${name.slice('dungeon'.length)}.act`, act);
    dumped++;
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete g.__swI113;
    delete g.__swOnRoll;
    delete g.__dgSegWatch;
  }
  const fs2 = require('node:fs') as typeof import('node:fs');
  fs2.writeFileSync(`${OUT}/js-dr-trace.txt`, rows.join('\n') + '\n');
  console.log(`[i206chain] dr rows=${rows.length} stage dumps=${dumped} -> ${OUT}`);
});
