// NNN · 岛2 未知类型精确 dump + 207/323 扫描 + 三岛家具对照
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

describe('NNN 岛2 精查', { timeout: 600_000 }, () => {
  it('dump', async () => {
    const g = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld')));
    const ours = await generateWorld({ width: g.tilesWide, height: g.tilesHigh, seedText: g.seed, name: 'nnn' });
    const st = ours.store;
    const W = g.tilesWide;
    const mk = (act: Uint8Array, van: ArrayLike<number>, fx: ArrayLike<number>, fy: ArrayLike<number>, wall: ArrayLike<number>) => ({ act, van: van as number[], fx: fx as number[], fy: fy as number[], wall: wall as number[] });
    const G = mk(g.tiles.active, g.tiles.type, g.tiles.frameX, g.tiles.frameY, g.tiles.wall);
    const jvan = new Int32Array(W * g.tilesHigh);
    for (let i = 0; i < W * g.tilesHigh; i++) jvan[i] = SHEET[st.type[i]] ?? -1;
    const J = mk(st.flags, jvan, st.frameX, st.frameY, st.wall);

    // 1) 岛2 周边(1300-1420 × 80-135)非普通类型清单
    const scan = (s: typeof G, name: string) => {
      const cnt = new Map<string, string[]>();
      for (let x = 1300; x <= 1420; x++) for (let y = 80; y <= 135; y++) {
        const i = y * W + x;
        if (!s.act[i]) continue;
        const t = s.van[i];
        if ([0, 2, 3, 5, 202].includes(t)) continue;
        const k = `t${t}`;
        if (!cnt.has(k)) cnt.set(k, []);
        if (cnt.get(k)!.length < 24) cnt.get(k)!.push(`${x},${y}[${s.fx[i]},${s.fy[i]}]`);
      }
      console.log(`[island2-vicinity ${name}]`);
      for (const [k, v] of [...cnt.entries()].sort()) console.log(`  ${k} x${v.length}: ${v.join(' ')}`);
    };
    scan(G, 'golden');
    scan(J, 'js');

    // 2) 三岛家具对照（14/15 有无）+ 每岛 i 推定
    for (const [x0, x1, y0, y1, label] of [[630, 660, 75, 95, 'island0'], [1030, 1060, 95, 115, 'island1'], [1340, 1370, 90, 110, 'island2']] as const) {
      for (const [s, nm] of [[G, 'g'], [J, 'j']] as const) {
        const out: string[] = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (s.act[i] && (s.van[i] === 14 || s.van[i] === 15)) out.push(`${s.van[i] === 14 ? 'T' : 'c'}${x},${y}[${s.fx[i]},${s.fy[i]}]`);
        }
        console.log(`[${label} ${nm}] ${out.join(' ') || '无桌椅'}`);
      }
    }

    // 3) 205-324 全部 207/323/324 出现处（全图天空区 y<300）
    for (const [s, nm] of [[G, 'g'], [J, 'j']] as const) {
      const out: string[] = [];
      for (let x = 0; x < W; x++) for (let y = 0; y < 300; y++) {
        const i = y * W + x;
        if (s.act[i] && (s.van[i] === 207 || s.van[i] === 323 || s.van[i] === 324)) out.push(`${s.van[i]}@${x},${y}[${s.fx[i]},${s.fy[i]}]`);
      }
      console.log(`[sky 207/323/324 ${nm}] n=${out.length}: ${out.slice(0, 40).join(' ')}`);
    }
  });
});
