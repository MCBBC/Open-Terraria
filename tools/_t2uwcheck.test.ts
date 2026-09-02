// 一次性诊断（t2 2026-09-02）：48 幽灵 type 差在 Underworld 入口的在位检查。
// __swUwCap（UnderworldPass 入口，gs+st）快照 typ，核对 48 差格在 UW 前是否已带幽灵 type。
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const W = 4200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

it('t2 underworld-entry ghost check', async () => {
  const g = globalThis as { __swUwCap?: (gs: unknown, st: TileStore) => void };
  const prev = g.__swUwCap;
  const rep = readFileSync('/tmp/t2-out/typ-diff-cor.txt', 'utf8');
  const coords: Array<[number, number]> = [];
  for (const m of rep.matchAll(/\((\d+),(\d+)\) js=(\d+) x86=(\d+)/g)) coords.push([Number(m[1]), Number(m[2])]);
  let entryTyp: Uint16Array | null = null;
  g.__swUwCap = (_gs: unknown, st: TileStore) => {
    const typ = new Uint16Array(st.w * st.h);
    for (let i = 0; i < typ.length; i++) typ[i] = SHEET[st.type[i]!] ?? -1;
    entryTyp = typ;
  };
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  } finally {
    g.__swUwCap = prev;
  }
  const je = entryTyp as unknown as Uint16Array;
  const lines: string[] = [`coords=${coords.length}`];
  let pre = 0;
  for (const [x, y] of coords) {
    const v = je![x + y * W]!;
    if (v !== 0) pre++;
    lines.push(`(${x},${y}) uwEntry=${v}`);
  }
  lines.push(`nonZeroAtUwEntry=${pre}/${coords.length}`);
  writeFileSync('/tmp/t2-out/ghost-uw-entry.txt', lines.join('\n') + '\n');
  console.log(`nonZeroAtUwEntry=${pre}/${coords.length}`);
}, 900000);
