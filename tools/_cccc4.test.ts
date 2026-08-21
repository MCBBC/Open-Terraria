// CCCCCC 批·④：m20260811 全管线跑 + 冰箱门判定日志（5 箱 fx36 vs 金标 396 定位）
// SW_C4=1 npx vitest run tools/_cccc4.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_C4 === '1';
const SEED = process.env.SW_C4_SEED ?? '20260811';
const EVIL = Number(process.env.SW_C4_EVIL ?? 0);
const W = Number(process.env.SW_C4_W ?? 6400), H = Number(process.env.SW_C4_H ?? 1800);

(RUN ? it : it.skip)('cccc4 full pipeline with ice gate log', async () => {
  const log: string[] = [];
  const g0 = globalThis as { __swIceGate?: (i: number, gy: number, tBelow: number, mainId: number, style: number, fired: number) => void; __swChestWrite?: (i: number, topY: number, tile: number, style: number, fx: number) => void };
  g0.__swIceGate = (i, gy, tBelow, mainId, style, fired) => {
    log.push(`ICE ${i} ${gy} t${tBelow} m${mainId} s${style} f${fired}`);
  };
  g0.__swChestWrite = (i, topY, tile, style, fx) => {
    log.push(`WRT ${i} ${topY} tile${tile} s${style} fx${fx}`);
  };
  try {
    const cells = [[1646,1006],[1704,1001],[1628,608],[1692,1078],[1133,1071]];
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w, slot, name) => {
        const st = w.store;
        const vals = cells.map(([x, y]) => {
          const i = st.idx(x, y);
          return st.type[i] + '/' + st.frameX[i];
        }).join(' ');
        log.push(`SLOT ${slot} ${name ?? ''} :: ${vals}`);
      },
    });
  } finally { delete g0.__swIceGate; delete g0.__swChestWrite; }
  writeFileSync('/tmp/cccccc-out/icegate-m.txt', log.join('\n') + '\n');
  // 目标 5 箱:i=1647/1705/1629/1693/1134
  const targets = new Set([1647, 1705, 1629, 1693, 1134]);
  for (const ln of log) { const f = ln.split(' '); if (targets.has(Number(f[1]))) console.log(ln); }
  console.log(`total ice-gate evaluations: ${log.length}`);
}, 900_000);
