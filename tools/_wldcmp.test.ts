// 对拍两个原版 wld(vserver 基线 vs 新鲜 x86 探针跑)是否同一世界
// 用法:node tools/../tmp 不行——须 vitest 环境(ESM+TS)。放 tools/ 下跑。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = !!process.env.SW_WLDCMP;
(RUN ? it : it.skip)('wld cmp', () => {
  const a = parseWld(new Uint8Array(readFileSync('/tmp/vserver/l2222.wld')));
  const b = parseWld(new Uint8Array(readFileSync('/tmp/l2222home/2222x.wld')));
  console.log('vserver:', a.tilesWide, 'x', a.tilesHigh, 'ground', a.groundLevel, 'rock', a.rockLevel,
    'spawn', a.spawnX, a.spawnY, 'dungeon', a.dungeonX, a.dungeonY, 'crimson', a.isCrimson, 'moon', a.moonType, 'worldId', a.worldId);
  console.log('fresh  :', b.tilesWide, 'x', b.tilesHigh, 'ground', b.groundLevel, 'rock', b.rockLevel,
    'spawn', b.spawnX, b.spawnY, 'dungeon', b.dungeonX, b.dungeonY, 'crimson', b.isCrimson, 'moon', b.moonType, 'worldId', b.worldId);
  if (a.tilesWide !== b.tilesWide || a.tilesHigh !== b.tilesHigh) return;
  const n = a.tilesWide * a.tilesHigh;
  let t = 0, ac = 0, wal = 0, liq = 0, first = -1;
  const pairs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const va = a.tiles.active[i] === 1, vb = b.tiles.active[i] === 1;
    if (va !== vb) ac++;
    if (va && vb && a.tiles.type[i] !== b.tiles.type[i]) {
      t++; const k = `${a.tiles.type[i]}>${b.tiles.type[i]}`; pairs[k] = (pairs[k] ?? 0) + 1;
      if (first < 0) first = i;
    }
    if (a.tiles.wall[i] !== b.tiles.wall[i]) wal++;
    if (a.tiles.liquid[i] !== b.tiles.liquid[i]) liq++;
  }
  console.log('actDiff=%d activeTypeDiff=%d walDiff=%d liqDiff=%d firstIdx=%d(x=%d,y=%d)',
    ac, t, wal, liq, first, first % a.tilesWide, first / a.tilesWide | 0);
  console.log('top pairs:', Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 8));
}, 300_000);
