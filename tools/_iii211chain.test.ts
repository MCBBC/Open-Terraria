// IIIII211 一次性诊断：ddual 座1 pre-EARLY(PD) 残差定位 + S4 st=2 归桶仪（S4 字典分桶定谳批）。
//   继承 _iii206chain 全套（真链 generateWorld + __swI113 DR 行 + __dgSegWatch 段级全图快照），
//   本批扩展：
//   ① WANT 增加 dungeonPD（=x86 rig x86_s{n}_PD_out 同位：房/厅/入口 + Platforms&Doors 收口后、
//      EARLY 入口前）——座1 post-EARLY 写面残差（IIIII206 移交 18,795）经 PD 位直接对拍定位；
//   ② SW_I211=1 时在 EARLY dict 建桶处逐房 emit（I211|DICT|seat|idx|st|ty|bb，零掷）——
//      per-room style 仪 JS 侧（x86 侧以 S4 st=n 计数 + RB 全集反证归桶差=布局投影）。
// 用法：cd game && SW_I211CHAIN=1 SW_I179=1 SW_I200=1 SW_I211=1 SW_MB_1457=1 \
//        SW_I211CHAIN_OUT=/tmp/iii211-out/js npx vitest run tools/_iii211chain.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I211CHAIN === '1';
const OUT = process.env.SW_I211CHAIN_OUT ?? '/tmp/iii211-out/js';

(RUN ? it : it.skip)('i211 dual dungeon stage snapshot capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (line: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swRollN?: number;
    __swRollTotal?: number;
    __dgSegWatch?: (name: string, st: TileStore) => void;
    __swI211?: (line: string) => void;
  };
  const rows: string[] = [];
  g.__swI113 = (line: string) => { rows.push(`${line}|jmr=${g.__swRollN ?? -1}|jrc=${g.__swRollTotal ?? -1}`); };
  const rows211: string[] = [];
  g.__swI211 = (line: string) => { rows211.push(line); };
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
  const WANT = new Set(['dungeonL', 'dungeonClimb', 'dungeonE', 'dungeonPD', 'dungeonPi', 'dungeonS', 'dungeonD', 'dungeonW', 'dungeonP', 'dungeonC',
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
    delete g.__swI211;
  }
  const fs2 = require('node:fs') as typeof import('node:fs');
  fs2.writeFileSync(`${OUT}/js-dr-trace.txt`, rows.join('\n') + '\n');
  if (rows211.length) fs2.writeFileSync(`${OUT}/js-i211-dict.txt`, rows211.join('\n') + '\n');
  console.log(`[i211chain] dr rows=${rows.length} i211 rows=${rows211.length} stage dumps=${dumped} -> ${OUT}`);
});
