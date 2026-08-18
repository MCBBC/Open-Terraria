// 树1 canopy 拟合搜索（env 门控=SW_PFIT=1）：用 trace anchor 表重放叶放置，
// 对每个候选假设（n44±/y±/阈值档）与 vanilla 真值 canopy 逐格比对。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PFIT === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';

// LT_TRACE 抓的 tree@1085 anchor 表（x, y, round, n44）——JS/Oracle 流一致
const ANCH: Array<[number, number, number, number]> = [
  [1094,279,0,7],[1099,279,0,6],[1102,279,0,7],[1079,264,0,7],[1076,264,0,7],[1074,263,0,7],
  [1092,258,0,7],[1096,258,0,8],[1084,242,0,7],[1078,243,1,13],[1073,245,1,14],[1074,243,1,15],
  [1086,240,1,14],[1088,244,1,13],[1089,241,1,11],[1084,241,0,6],[1085,240,0,8],[1085,239,0,6],
  [1085,238,0,8],[1085,237,1,10],[1081,235,1,12],[1092,236,1,11],[1094,236,1,10],[1094,234,1,11],
  [1084,237,0,7],[1084,236,0,8],[1082,235,1,12],[1082,239,1,14],[1079,234,1,15],[1084,235,0,8],
  [1085,234,0,7],[1090,234,1,14],[1094,231,1,14],[1093,233,1,14],[1085,233,0,6],[1083,231,1,12],
  [1079,226,1,15],[1077,230,1,12],[1075,233,1,12],[1076,231,1,15],[1085,232,0,6],[1085,231,0,7],
  [1085,231,1,13],[1089,231,1,10],[1093,230,1,15],[1093,231,1,15],[1093,229,1,13],[1084,230,0,7],
  [1084,229,0,7],[1080,228,1,10],[1080,229,1,15],[1085,229,1,10],[1085,228,0,6],[1085,227,0,8],
  [1089,226,1,10],[1085,226,0,7],[1085,225,0,7],[1085,224,0,8],
];

(RUN ? it : it.skip)('canopy fit search', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const W = wld.tilesWide;
  // 树1 canopy 窗口
  const X0 = 1030, X1 = 1130, Y0 = 205, Y1 = 290;
  const vLeaf = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1 && (wld.tiles.type[i] === 192 || wld.tiles.type[i] === 191);
  };
  // 假设空间：roundTh 倍率 / round n44 偏移 / y 偏移 / num49 档（菱形用 1.6-2.0 全档最小值）
  const hypotheses: Array<{ name: string; roundTh: number; rOff: number; yOff: number }> = [];
  for (const th of [0.9, 0.85, 0.8]) for (const ro of [0, -1, 1]) for (const yo of [0, 1, -1])
    hypotheses.push({ name: `th${th} r${ro >= 0 ? '+' : ''}${ro} y${yo >= 0 ? '+' : ''}${yo}`, roundTh: th, rOff: ro, yOff: yo });

  for (const h of hypotheses) {
    // 重放叶放置（忽略 canPlaceLeaves 门——树1区域内无 191/云冲突时近似成立）
    const mine = new Set<number>();
    for (const [ax, ay, rnd, n44] of ANCH) {
      const y = ay + h.yOff;
      const r = n44 + h.rOff;
      const bx = 2 * (rnd ? r : r), by = 2 * r;
      for (let x = ax - bx; x <= ax + bx; x++) {
        for (let yy = y - by; yy <= y + by; yy++) {
          if (x < X0 || x > X1 || yy < Y0 || yy > Y1) continue;
          if (rnd) {
            const dx = ax - x, dy = y - yy;
            if (Math.sqrt(dx * dx + dy * dy) < r * h.roundTh) mine.add(yy * W + x);
          } else {
            // 菱形取最大 num49=2.0（上界并集——真实档位由流决定，只能近似）
            if (Math.abs(ax - x) + Math.abs(y - yy) * 2.0 < r) mine.add(yy * W + x);
          }
        }
      }
    }
    // 比对：vanilla 叶(含191) vs mine——只统计窗口内"vanilla 有而 mine 无"与"mine 有而 vanilla 无"
    let miss = 0, extra = 0;
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        const v = vLeaf(x, y);
        const m = mine.has(y * W + x);
        if (v && !m) miss++;
        if (!v && m) extra++;
      }
    }
    console.log(`${h.name.padEnd(20)} miss=${String(miss).padStart(4)} extra=${String(extra).padStart(4)}`);
  }
}, 120_000);
