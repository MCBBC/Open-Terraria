// 一次性诊断（t2 2026-09-02）：48 处幽灵 type 差的继承源判定。
// 在 runCorruptionPass 首个 zone 标记时点（本 pass 尚未写任何 tile）快照 typ，
// 对 48 个差格核对：JS 在 Corruption 入口是否已带幽灵 type（=上游继承）。
// x86 真值：/tmp/jjj-out/g1457/028_Underworld.typ（Underworld 槽末）。
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';

const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

it('t2 entry-state ghost check', async () => {
  const g = globalThis as {
    __swCorMark?: (s: string) => void;
    __swCorGsCap?: (gs: unknown) => void;
  };
  const prevMark = g.__swCorMark;
  const truth = new Uint16Array(readFileSync('/tmp/jjj-out/g1457/028_Underworld.typ').buffer.slice(0));
  const truth29 = new Uint16Array(readFileSync('/tmp/jjj-out/g1457/029_Corruption.typ').buffer.slice(0));
  // 先复跑 typ-diff 得到的 48 差格：从上批报告读坐标
  const rep = readFileSync('/tmp/t2-out/typ-diff-cor.txt', 'utf8');
  const coords: Array<[number, number]> = [];
  for (const m of rep.matchAll(/\((\d+),(\d+)\) js=(\d+) x86=(\d+)/g)) {
    coords.push([Number(m[1]), Number(m[2])]);
  }
  let storeRef: TileStore | null = null;
  let captured = false;
  let entryTyp: Uint16Array | null = null;
  (globalThis as { __swCorSlotEnd?: (st: TileStore, gs: unknown) => void }).__swCorSlotEnd = (st: TileStore) => { storeRef = st; };
  g.__swCorMark = (s: string) => {
    if (!captured && s.startsWith('zone')) {
      captured = true;
      const st = storeRef as unknown as TileStore;
      const typ = new Uint16Array(st.w * st.h);
      for (let i = 0; i < typ.length; i++) typ[i] = SHEET[st.type[i]!] ?? -1;
      entryTyp = typ;
    }
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally {
    g.__swCorMark = prevMark;
  }
  const jsEntry = entryTyp as unknown as Uint16Array;
  const lines: string[] = [`coords=${coords.length} captured=${captured}`];
  let inherited = 0, corruptionCreated = 0;
  for (const [x, y] of coords) {
    const i = x + y * W;
    const e = jsEntry[i]!, t29 = truth29[i]!;
    // x86 在 Underworld 末与 Corruption 末均为 0；JS 入口值即上游继承值
    if (e !== 0) inherited++; else corruptionCreated++;
    lines.push(`(${x},${y}) jsEntry=${e} x86uw=${truth[i]} x86cor=${t29}`);
  }
  lines.push(`inherited(before Corruption) = ${inherited}  createdByCorruption = ${corruptionCreated}`);
  writeFileSync('/tmp/t2-out/ghost-inherit-check.txt', lines.join('\n') + '\n');
  console.log(lines.slice(0, 6).join('\n'));
  console.log(`inherited=${inherited} createdByCorruption=${corruptionCreated}`);
}, 900000);
