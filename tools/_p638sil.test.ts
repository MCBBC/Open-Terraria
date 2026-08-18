// 地表轮廓二分：oracle 任意检查点 vs 真实 wld 每 x 首个 active 行 y（env 门控=SW_SIL=1）
// 轮廓对后期 pass 大多稳定（洞在下、草原地转化）→ 可作为早期 pass 的近似真值对照。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_SIL === '1';
const FILE = process.env.SW_PDUMPF ?? 's111.wld';
const VSRV = process.env.SW_MATRIX_VSRV ?? '/tmp/vserver86';
const GRID = process.env.SW_SIL_G ?? '/tmp/cs-island';

(RUN ? it : it.skip)('surface silhouette compare', () => {
  const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${FILE}`)));
  const typ = new Uint16Array(new Uint8Array(readFileSync(`${GRID}.typ`)).buffer);
  const act = new Uint8Array(readFileSync(`${GRID}.act`));
  const W = wld.tilesWide, H = wld.tilesHigh;
  const firstActive = (isOracle: boolean) => {
    const out = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      let y = 0;
      if (isOracle) {
        while (y < H && act[y * W + x] === 0) y++;
      } else {
        while (y < H && wld.tiles.active[y * W + x] !== 1) y++;
      }
      out[x] = y >= H ? -1 : y;
    }
    return out;
  };
  // vanilla 侧排除浮空岛/树（y<200 的活格跳过——地表轮廓从 y>=150 起扫）
  const firstActiveVSkip = (skipAbove: number) => {
    const out = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      let y = skipAbove;
      while (y < H && wld.tiles.active[y * W + x] !== 1) y++;
      out[x] = y >= H ? -1 : y;
    }
    return out;
  };
  const os = firstActive(true);
  const vs = firstActiveVSkip(150);
  let eq = 0, diff = 0, sumD = 0;
  const buckets = new Map<number, number>();
  const samples: string[] = [];
  for (let x = 0; x < W; x++) {
    if (os[x] < 0 || vs[x] < 0) continue;
    const d = vs[x] - os[x];
    if (d === 0) eq++;
    else {
      diff++;
      sumD += Math.abs(d);
      buckets.set(d, (buckets.get(d) ?? 0) + 1);
      if (samples.length < 15) samples.push(`x${x}:o${os[x]}/v${vs[x]}`);
    }
  }
  console.log(`轮廓(y>=150 起): 相等=${eq} 差=${diff} Σ|d|=${sumD}`);
  console.log('d 分布:', [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  console.log('样例:', samples.join(' '));
}, 120_000);
