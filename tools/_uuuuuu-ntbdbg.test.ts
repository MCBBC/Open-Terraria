// 一次性诊断（UUUUUU 批）：NTB 首差 (2573,212) 定罪——NotTheBees 首跑 in/out 切片
// vs vanilla dump 017/018。用法：cd game && SW_NTB_DBG=1 npx vitest run tools/_uuuuuu-ntbdbg.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_NTB_DBG === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const rd8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
const W = 4200, H = 1200;
const at = (t: Uint16Array | Uint8Array, x: number, y: number): number => t[y * W + x]!;

(RUN ? it : it.skip)('ntb first-call in/out slice vs vanilla 017/018', async () => {
  const G2 = '/tmp/sw-slp/g-secret-ntb';
  const v17t = le16(`${G2}/017_Jungle.typ`), v17a = rd8(`${G2}/017_Jungle.act`);
  const v18t = le16(`${G2}/018_Mud_Caves_To_Grass.typ`), v18a = rd8(`${G2}/018_Mud_Caves_To_Grass.act`);
  let calls = 0;
  const g = globalThis as { __swNTBCap?: (phase: string, gs: unknown, st: { type: Uint16Array; flags: Uint8Array; idx: (x: number, y: number) => number }) => void };
  g.__swNTBCap = (phase, _gs, st) => {
    calls++;
    if (calls > 2) return;               // 只看首跑（MudCavesToJungleGrass 槽）
    const pts: Array<[number, number]> = [[2573, 212], [2570, 213], [2000, 300], [2100, 500], [1732, 700]];
    for (const [x, y] of pts) {
      const i = st.idx(x, y);
      const js = st.flags[i] ? SHEET[st.type[i]] : -1;
      const vv = phase === 'in' ? (at(v17a, x, y) ? at(v17t, x, y) : -1) : (at(v18a, x, y) ? at(v18t, x, y) : -1);
      console.log(`call#${calls} ${phase} (${x},${y}) js=${js} vanilla=${vv}`);
    }
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: '1372357239', evil: 0,
      seedFlags: { notTheBees: true } as never,
      onWorldPartial: undefined,
    });
  } finally { delete g.__swNTBCap; }
  console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s calls=${calls}`);
}, 600_000);
