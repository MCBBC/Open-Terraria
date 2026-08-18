// 圆冠 n44−1 假设终审（env 门控=SW_PR1=1）：单覆盖圆冠格逐格判
// chain 放置 ∧ vanilla 缺失 → 必须 d ≥ (n44−1)*0.9
// vanilla 存在 → 必须 d < (n44−1)*0.9
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PR1 === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_POV_G ?? '/tmp/cs-fin';

// tree@1085 anchor 表（来自 LT_TRACE；JS=oracle 流一致）
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

(RUN ? it : it.skip)('round n44-1 verdict', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const W = wld.tilesWide;
  const vActive = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1;
  };
  const oActive = (x: number, y: number) => act[y * W + x] !== 0 && typ[y * W + x] === 192;

  // 树1 区域内所有格：对每格收集覆盖它的圆冠 anchor（d < n44*0.9）与菱形可能覆盖（|dx|+|dy|*2 < n44 上界）
  const X0 = 1040, X1 = 1115, Y0 = 205, Y1 = 285;
  let okMiss = 0, badMiss = 0, okHave = 0, badHave = 0;
  const badCells: string[] = [];
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      // 单覆盖判定：恰好一个圆冠覆盖、且无任何菱形上界覆盖
      let roundCover = -1;
      let multi = false;
      let diamondPossible = false;
      for (let ai = 0; ai < ANCH.length; ai++) {
        const [ax, ay, rnd, n44] = ANCH[ai];
        if (Math.abs(ax - x) > 2 * n44 || Math.abs(ay - y) > 2 * n44) continue;
        if (rnd) {
          const dx = ax - x, dy = ay - y;
          if (Math.sqrt(dx * dx + dy * dy) < n44 * 0.9) {
            if (roundCover >= 0) multi = true;
            roundCover = ai;
          }
        } else if (Math.abs(ax - x) + Math.abs(ay - y) * 2.0 < n44) diamondPossible = true;
      }
      if (multi || diamondPossible || roundCover < 0) continue;
      const [ax, ay, , n44] = ANCH[roundCover];
      const dx = ax - x, dy = ay - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const th1 = (n44 - 1) * 0.9;
      const oHas = oActive(x, y), vHas = vActive(x, y) && wld.tiles.type[y * W + x] === 192;
      if (oHas && !vHas) {
        // chain 有 vanilla 无：n44−1 假设要求 d ≥ th1
        if (d >= th1) okMiss++; else { badMiss++; badCells.push(`miss(${x},${y}) d=${d.toFixed(3)} th1=${th1}`); }
      } else if (oHas && vHas) {
        if (d < th1) okHave++; else { badHave++; badCells.push(`have(${x},${y}) d=${d.toFixed(3)} th1=${th1}`); }
      }
      // vanilla 有 chain 无（单覆盖圆冠）——不该存在（chain 半径更大）
      else if (!oHas && vHas) { badHave++; badCells.push(`vOnly(${x},${y}) d=${d.toFixed(3)}`); }
    }
  }
  console.log(`n44−1 假设：okMiss=${okMiss} badMiss=${badMiss} okHave=${okHave} badHave=${badHave}`);
  console.log(badCells.slice(0, 15).join(' | ') || '（全部自洽 ✓）');
}, 120_000);
