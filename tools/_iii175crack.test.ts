// IIIII175 批：裂纹砖(481-483)分布对拍取证（源=_iii170traps 拷贝,AMENDED）。
// 目的：T0（seat0 TRAPS|i,pre 态）sheet 域快照,与 x86 033_Dungeon.typ/.act 对拍
// 裂砖分布差——定位 roll-neutral 写面分歧结构（厅 cb 旗已证全等,见 /tmp/iii175-out）。
// 用法：cd game && SW_I170=1 SW_I175=1 SW_I175_OUT=/tmp/iii175-out npx vitest run tools/_iii175crack.test.ts
// 产物：$SW_I175_OUT/js-t0-sheets.{typ,act,wal} + js-t0-sheets.meta.txt
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I175 === '1';
const OUT = process.env.SW_I175_OUT ?? '/tmp/iii175-out';
const FEED = process.env.SW_I170_FEED ?? '/tmp/iii170-out/x86-feed-dg.txt';
import { mkdirSync as _mk } from 'node:fs';
_mk(OUT, { recursive: true });

(RUN ? it : it.skip)('i175 cracked-sheet T0 capture', { timeout: 900_000 }, async () => {
  const g = globalThis as { __swI170Feed?: number[] };
  const src = readFileSync(FEED, 'utf8');
  const feed: number[] = [];
  for (const l of src.split('\n')) { const t = l.trim(); if (t) feed.push(parseInt(t, 10)); }
  g.__swI170Feed = feed;                       // 复用 i170 dump 点（T0=TRAPS|i pre 态）
  (globalThis as { __swI175Dump?: unknown }).__swI175Dump = (d: { x0: number; y0: number; w: number; h: number; typ: Uint8Array; act: Uint8Array; wal: Uint8Array }) => {
    writeFileSync(`${OUT}/js-t0-sheets.typ`, d.typ);
    writeFileSync(`${OUT}/js-t0-sheets.act`, d.act);
    writeFileSync(`${OUT}/js-t0-sheets.wal`, d.wal);
    writeFileSync(`${OUT}/js-t0-sheets.meta.txt`, `x0=${d.x0} y0=${d.y0} w=${d.w} h=${d.h}\n`);
    console.log(`[i175] sheet dump ${d.w}x${d.h} @(${d.x0},${d.y0})`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1.1.1.0.doubledaringdangers|20260831', evil: -1 as -1 | 0 | 1,
      seedFlags: { dualDungeons: true },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    (globalThis as { __swI175Dump?: unknown }).__swI175Dump = undefined;
    g.__swI170Feed = undefined;
  }
  mkdirSync(OUT, { recursive: true });
  console.log('[i175] done');
}, 900_000);
