// 一次性诊断（GGGGG 批）：spawn-tree-regression 种子上放置期扫杀清单取证。
// 用法：cd game && SW_G5K=1 npx vitest run tools/_g5kills.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_G5K === '1';
const SITES: Array<[number, number]> = [[3296, 680]];

(RUN ? it : it.skip)('g5 sweep kills on spawn-tree-regression', async () => {
  const kills: string[] = [];
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap = (x, y, sheet) => {
    if ((globalThis as Record<string, unknown>).__g5InStatues) {
    kills.push(`${sheet}@(${x},${y})`);
    if (kills.length === 1 && (globalThis as Record<string, unknown>).__g5St) {
      const s2 = (globalThis as unknown as { __g5St: { type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; slope: Uint8Array; half: Uint8Array; wall: Uint16Array; wire: Uint8Array; w: number } }).__g5St;
      const W = s2.w;
      console.log(`KILLOK sheet=${sheet} @(${x},${y}) sweep=${(globalThis as Record<string, unknown>).__g5SweepXY}`);
      for (let dy = -3; dy <= 4; dy++) {
        let row = `  y${y + dy}: `;
        for (let dx = -4; dx <= 4; dx++) {
          const j = (y + dy) * W + (x + dx);
          const a = s2.flags[j], t = a ? SHEET[s2.type[j]] : -1;
          row += (a ? `${t}/${s2.frameX[j]},${s2.frameY[j]} s${s2.slope[j]}h${s2.half[j]}w${s2.wall[j]}` : '·').padStart(20);
        }
        console.log(row);
      }
    }
  }
  };
  // 先抓 statues 入口前态帧
  const { RNG } = await import('../src/core/rng');
  const TILE_DEFS = (await import('../src/data/tiles')).TILE_DEFS;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const sv = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sv === 'number') SHEET[i] = sv; }
  let pre: { type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array; slope: Uint8Array; half: Uint8Array; wire: Uint8Array } | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const wsrc = (await import('node:fs')).readFileSync(new URL('../src/world/gen/WorldGen.ts', import.meta.url), 'utf8').split('\n');
  let cur: unknown = null;
  RNGp.reseed = function (this: unknown, s: number) {
    const c = cur as null | { type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array };
    if (c) {
      const m = (new Error().stack ?? '').match(/(\/[^\s()]+WorldGen\.ts):(\d+):\d+/);
      if (m && wsrc[Number(m[2]) - 1]?.includes('Statues cs:16947')) {
        pre = { type: c.type.slice(), flags: c.flags.slice(), frameX: c.frameX.slice(), frameY: c.frameY.slice(), slope: (c as unknown as { slope: Uint8Array }).slope.slice(), half: (c as unknown as { half: Uint8Array }).half.slice(), wire: (c as unknown as { wire: Uint8Array }).wire.slice() };
      }
    }
    return oReseed.call(this, s);
  };
  const g0 = generateWorld({ width: 4200, height: 1200, seedText: 'spawn-tree-regression', name: 't', onWorldPartial: (w) => { if (!cur) cur = w.store; } } as never);
  try {
    await g0;
  } finally { RNGp.reseed = oReseed; }
  if (pre) {
    const W = 4200;
    for (const [sx, sy] of SITES) {
      console.log(`\n== site (${sx},${sy}) PRE frames:`);
      for (let dy = -3; dy <= 3; dy++) {
        let row = `  y${sy + dy}: `;
        for (let dx = -3; dx <= 3; dx++) {
          const j = (sy + dy) * W + (sx + dx);
          const a = pre.flags[j], t = a ? SHEET[pre.type[j]] : -1;
          row += (a ? `${t}/${pre.frameX[j] ?? 0},${pre.frameY[j] ?? 0} s${(pre as { slope: Uint8Array }).slope[j]}h${(pre as { half: Uint8Array }).half[j]}w${(pre as { wire: Uint8Array }).wire[j] & 32 ? 1 : 0}` : '·').padStart(18);
        }
        console.log(row);
      }
    }
  }
  if (false) {
    delete (globalThis as { __swKillCap?: unknown }).__swKillCap;
  }
  const bySheet = new Map<string, number>();
  for (const k of kills) {
    const s = k.split('@')[0];
    bySheet.set(s, (bySheet.get(s) ?? 0) + 1);
  }
  console.log(`total kills=${kills.length}`);
  console.log(`by sheet: ${[...bySheet.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(' ')}`);
  console.log(`first 40: ${kills.slice(0, 40).join(' ')}`);
}, 600_000);
