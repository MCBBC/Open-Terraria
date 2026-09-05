import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
const RUN = process.env.SW_I181F === '1';
const G2 = String(process.env.HOME) + '/GoldenChains/golden-ddual2';
(RUN ? it : it.skip)('i181f2 late-vs-final diff', { timeout: 900_000 }, async () => {
  const W = 4200, H = 1200, N = W * H;
  await generateWorld({
    width: W, height: H, seedText: 'doubledaringdangers|20260831', evil: 0 as const,
    seedFlags: { dualDungeons: true },
  } as Parameters<typeof generateWorld>[0]);
  const snap = (globalThis as { __swI181Snap?: { type: Uint16Array; flags: Uint8Array } }).__swI181Snap;
  if (!snap) throw new Error('snap missing');
  const sheet = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') sheet[i] = s;
  }
  // 快照内 internal226 且 active 的格（=LATE 槽末已被改成 BoneWelder 的格）
  const atLate: number[] = [];
  for (let i = 0; i < N; i++) {
    if ((snap.flags[i] & 1) && snap.type[i] === 226) atLate.push(i);
  }
  console.log(`[i181f2] LATE-end internal226 active cells=${atLate.length} first=${JSON.stringify(atLate.slice(0, 8).map(i => [i % W, (i / W) | 0]))}`);
  // 金标 033 对拍：这些格 vanilla 是 226?
  const gTyp = new Uint16Array(readFileSync(`${G2}/033_Dungeon.typ`).buffer, 0, N);
  const gAct = new Uint8Array(readFileSync(`${G2}/033_Dungeon.act`).buffer, 0, N);
  let m = 0;
  for (const i of atLate) if (gAct[i] && gTyp[i] === 226) m++;
  console.log(`[i181f2] of them vanilla033=226: ${m}`);
}, 900_000);
