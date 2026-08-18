// 92 差格 × anchor 归属反推（env 门控=SW_PAN=1）：用 LT_TRACE 抓的 anchor 表
// 对每个 oracle-only 叶格找覆盖它的 anchor（圆/菱），算 dist/diamond 与阈值差。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_PAN === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_POV_G ?? '/tmp/cs-lt';

// LT_TRACE 抓取的 tree@1085 anchor 表（x, y, round, n44）
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

(RUN ? it : it.skip)('anchor attribution', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const W = wld.tilesWide;
  const oSheet = (x: number, y: number) => (act[y * W + x] !== 0 ? typ[y * W + x] : -1);
  const vSheet = (x: number, y: number) => {
    const i = y * W + x;
    return wld.tiles.active[i] === 1 ? wld.tiles.type[i] : -1;
  };
  // 收集 oracle-only 192 格（树1顶区）
  const diffs: Array<[number, number]> = [];
  for (let y = 205; y <= 245; y++) {
    for (let x = 1040; x <= 1115; x++) {
      const v = vSheet(x, y), o = oSheet(x, y);
      if (o === 192 && v !== 192) diffs.push([x, y]);
    }
  }
  console.log(`oracle-only 叶格=${diffs.length}`);
  // 每个 diff 格：找所有覆盖它的 anchor（用 num49 全档尝试）
  const num49s = [2.0, 1.9, 1.8, 1.7, 1.6];
  for (const [x, y] of diffs) {
    const covers: string[] = [];
    for (let ai = 0; ai < ANCH.length; ai++) {
      const [ax, ay, rnd, n44] = ANCH[ai];
      if (Math.abs(ax - x) > 2 * n44 || Math.abs(ay - y) > 2 * n44) continue;
      if (rnd) {
        const dx = ax - x, dy = ay - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < n44 * 0.9) covers.push(`#${ai}r(${ax},${ay})n${n44} d=${d.toFixed(3)} th=${(n44 * 0.9).toFixed(2)} margin=${(n44 * 0.9 - d).toFixed(3)}`);
      } else {
        for (const nf of num49s) {
          const val = Math.abs(ax - x) + Math.abs(ay - y) * nf;
          if (val < n44) covers.push(`#${ai}d(${ax},${ay})n${n44} nf${nf} v=${val.toFixed(2)} margin=${(n44 - val).toFixed(2)}`);
        }
      }
    }
    console.log(`(${x},${y}): ` + (covers.length ? covers.slice(0, 3).join(' | ') : '无覆盖!?'));
  }
}, 120_000);
