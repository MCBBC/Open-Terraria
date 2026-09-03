// IIIII224 (XCIX) 一次性诊断：ddual 座2 欠账定域——掷流台账配对仪（FEAT 相界 per-instance 快照）。
//   继承 _iii211chain 全套（真链 generateWorld + __swI113 DR 行），本批扩展：
//   ① __swOnRoll 按实例分账（perInst Map）——识别 dungeon 相 rng 实例（首个 RV 行的 lastInst），
//      每个 DR|S|/DR|FEAT|/DR|PLW|/DR|R| 行落 |jmd=<dungeon 实例累计掷数>——与 x86 rig
//      JJHook.RollCount（pass 域）同口径对相界 Δ；
//   ② console.log 拦截收 PDC-*/BATT-*/GC-TRY 行（SW_I158_PDC=1 时）→ j-pdc.txt；
//   ③ 段级 dump 默认关（SW_I224_NODUMP=1 省盘；SW_I224_DUMP=1 才落）。
// 用法：cd game && SW_I224=1 SW_MB_1457=1 SW_I158_PDC=1 SW_I224_OUT=/tmp/iii224-out \
//        npx vitest run tools/_iii224cap.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I224 === '1';
const OUT = process.env.SW_I224_OUT ?? '/tmp/iii224-out';
const DUMP = process.env.SW_I224_DUMP === '1';

(RUN ? it : it.skip)('i224 dual dungeon roll-ledger capture', { timeout: 900_000 }, async () => {
  const g = globalThis as {
    __swI113?: (line: string) => void;
    __swOnRoll?: (v: number, inst: object) => void;
    __swRollN?: number;
    __swRollTotal?: number;
    __dgSegWatch?: (name: string, st: unknown) => void;
  };
  const rows: string[] = [];
  const snapRows: string[] = [];          // FEAT/INL/R 首行等相界行（带 perInst 快照）
  const pdcRows: string[] = [];
  // ── per-instance 掷账 ──
  const perInst = new Map<object, number>();
  const instId = new Map<object, number>();
  let instSeq = 0;
  const idOf = (o: object): number => {
    let v = instId.get(o);
    if (v === undefined) { v = ++instSeq; instId.set(o, v); }
    return v;
  };
  let lastInst: object | null = null;
  let lastInstCnt = -1;
  let rollAll = 0;
  g.__swOnRoll = (_v: number, inst: object) => {
    rollAll++;
    const c = (perInst.get(inst) ?? 0) + 1;
    perInst.set(inst, c);
    lastInst = inst;
    lastInstCnt = c;
    g.__swRollTotal = rollAll;
  };
  g.__swI113 = (line: string) => {
    const tag = line.slice(0, 10);
    if (DUMP || tag === 'DR|S|i' || tag === 'DR|FEAT' || tag === 'DR|PLW|' || tag.startsWith('DR|R|') || tag === 'DR|Ro|' || tag === 'DR|CP|') {
      const m = JSON.stringify(Array.from(perInst, ([k, v]) => [idOf(k), v]));
      snapRows.push(`${line}|jrc=${rollAll}|lastInst=${lastInst === null ? -1 : idOf(lastInst)}|lastCnt=${lastInstCnt}|perInst=${m}`);
    }
    rows.push(`${line}|jmr=-1|jrc=${rollAll}`);
  };
  // ── PDC/BATT console 拦截 ──
  const origLog = console.log;
  console.log = (...a: unknown[]) => {
    const s = typeof a[0] === 'string' ? a[0] : '';
    if (/^(PDC-|BATT-|GC-TRY)/.test(s)) pdcRows.push(s);
    origLog(...a);
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    console.log = origLog;
    delete g.__swI113;
    delete g.__swOnRoll;
  }
  const fs2 = require('node:fs') as typeof import('node:fs');
  fs2.writeFileSync(`${OUT}/j224-dr.txt`, rows.join('\n') + '\n');
  fs2.writeFileSync(`${OUT}/j224-snap.txt`, snapRows.join('\n') + '\n');
  if (pdcRows.length) fs2.writeFileSync(`${OUT}/j224-pdc.txt`, pdcRows.join('\n') + '\n');
  origLog(`[i224] dr rows=${rows.length} snap rows=${snapRows.length} pdc rows=${pdcRows.length} insts=${instSeq} -> ${OUT}`);
});
