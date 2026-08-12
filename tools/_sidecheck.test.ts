// 一次性诊断（只读）：对比原版 .wld 与我方引擎在多种子下的侧别归属。
// 输出每种子的:原版地牢列区/丛林列区/雪原列区 vs 我方 dungeonSide/jungleX/dungeonX/snowOrigin。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';

const CASES = [
  { file: '12345世界.wld', seedText: '12345', evil: 0 as const },
  { file: '9293480世界.wld', seedText: '9293480', evil: 0 as const },
  { file: '20260811世界.wld', seedText: '20260811', evil: 0 as const },
  { file: '2147483647世界.wld', seedText: '2147483647', evil: 1 as const },
  { file: 'SandboxWorld世界.wld', seedText: 'SandboxWorld', evil: 1 as const },
];

// 地牢砖(41/43/44)列直方图 → 地牢侧;泥(59)深层列直方图 → 丛林侧;雪(147)列直方图 → 雪原侧
const W = 4200, H = 1200;
function colHist(t: { type: Uint16Array }, pred: (v: number) => boolean, yMin: number, yMax: number) {
  const cols = new Map<number, number>();
  for (let y = yMin; y < Math.min(yMax, H); y++) {
    for (let x = 0; x < W; x++) {
      if (pred(t.type[y * W + x])) cols.set(x, (cols.get(x) ?? 0) + 1);
    }
  }
  return cols;
}
function centroid(cols: Map<number, number>, minCount: number): number {
  let sum = 0, n = 0;
  for (const [x, c] of cols) if (c >= minCount) { sum += x * c; n += c; }
  return n > 0 ? sum / n : -1;
}

it('side check: vanilla wld vs ours', () => {
  for (const c of CASES) {
    const buf = readFileSync(`tests/golden/wld/${c.file}`);
    const parsed = parseWld(new Uint8Array(buf));
    const g = parsed.tiles;
        if (c.seedText === '12345') {
      const top = new Map<number, number>();
      for (let i = 0; i < g.type.length; i++) top.set(g.type[i], (top.get(g.type[i]) ?? 0) + 1);
      console.log('wld top types:', [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}x${v}`).join(' '));
    }
    const { world, gs } = runResetAndTerrain({ width: 4200, height: 1200, seedText: c.seedText, evil: c.evil });
    // wld 的 type 是原版 id;JS 侧直接用 gs 的 Reset 派生值
    const dungeonCols = colHist(g, (v) => v === 41 || v === 43 || v === 44, 0, 400);
    const jungleCols = colHist(g, (v) => v === 59, 300, 1000);
    const snowCols = colHist(g, (v) => v === 147, 0, 500);
    const vd = centroid(dungeonCols, 30), vj = centroid(jungleCols, 80), vs = centroid(snowCols, 30);
    console.log(
      `${c.seedText}: vanilla dungeon@${vd.toFixed(0)} jungle@${vj.toFixed(0)} snow@${vs.toFixed(0)} | ` +
      `ours side=${gs.dungeonSide === -1 ? 'LEFT' : 'RIGHT'} jungleX=${gs.jungleX} dungeonLoc=${gs.dungeonLocation} snow[${gs.snowOriginLeft},${gs.snowOriginRight}]`,
    );
  }
});
