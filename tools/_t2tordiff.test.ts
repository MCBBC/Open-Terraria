// 一次性诊断（t2 2026-09-02）：JS Corruption 槽末 typ 通道与 x86 认证 dump 逐格 diff。
// 真值 = /tmp/jjj-out/g1457/029_Corruption.typ（g 链 seed 9293480 corruption，x86 权威）。
// 用法：cd game && npx vitest run tools/_t2tordiff.test.ts
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

it('t2 typ channel diff vs x86 truth', async () => {
  const g = globalThis as { __swCorSlotEnd?: (st: TileStore, gs: GenState) => void };
  const prev = g.__swCorSlotEnd;
  let captured: Uint16Array | null = null;
  let act: Uint8Array | null = null;
  g.__swCorSlotEnd = (st: TileStore) => {
    const n = st.w * st.h;
    const typ = new Uint16Array(n);
    act = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      typ[i] = SHEET[st.type[i]!] ?? -1;
      act![i] = (st.flags[i]! & 1) ? 1 : 0;
    }
    captured = typ;
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g.__swCorSlotEnd = prev;
  }
  const truth = new Uint16Array(readFileSync('/tmp/jjj-out/g1457/029_Corruption.typ').buffer.slice(0));
  const truthAct = new Uint8Array(readFileSync('/tmp/jjj-out/g1457/029_Corruption.act').buffer.slice(0));
  const js = captured as unknown as Uint16Array;
  const jsAct = act as unknown as Uint8Array;
  const pairs = new Map<string, number>();
  let diffT = 0, diffA = 0, first: string[] = [];
  const cols = new Map<number, number>();
  for (let i = 0; i < truth.length; i++) {
    if (js[i] !== truth[i]) {
      diffT++;
      const x = i % W, y = (i / W) | 0;
      cols.set(x, (cols.get(x) ?? 0) + 1);
      const aT = jsAct[i] ? 'A' : 'g';
      pairs.set(`j${aT}${js[i]}>x${truthAct[i] ? 'A' : 'g'}${truth[i]}`, (pairs.get(`j${aT}${js[i]}>x${truthAct[i] ? 'A' : 'g'}${truth[i]}`) ?? 0) + 1);
      if (first.length < 12) first.push(`(${x},${y}) js=${js[i]} x86=${truth[i]} act js=${jsAct[i]} x86=${truthAct[i]}`);
    }
    if (jsAct[i] !== truthAct[i]) diffA++;
  }
  const top = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topCols = [...cols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const report = [
    `typDiff=${diffT} actDiff=${diffA}`,
    `topPairs: ${top.map(([k, v]) => `${k}×${v}`).join('  ')}`,
    `topCols: ${topCols.map(([k, v]) => `x${k}×${v}`).join('  ')}`,
    `first: ${first.join(' | ')}`,
  ];
  writeFileSync('/tmp/t2-out/typ-diff-cor.txt', report.join('\n') + '\n');
  console.log(report.join('\n'));
}, 900000);
