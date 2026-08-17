// 一次性探针（构建 _matrixrun 前标定）：wld 侧 liquidType 编码 + 稀疏对象(5树/28罐/105像/323棕榈)结构与计时
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

it('probe', () => {
  const t0 = Date.now();
  const w = parseWld(new Uint8Array(readFileSync('/tmp/vserver/s111.wld')));
  console.log(`parse ${((Date.now() - t0) / 1000).toFixed(2)}s  ${w.tilesWide}x${w.tilesHigh} chests=${w.chests.length}`);
  const n = w.tilesWide * w.tilesHigh;
  // liquid 编码直方图（liquid>0 格）
  const lq = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (w.tiles.liquid[i] > 0) {
      const k = String(w.tiles.liquidType[i]);
      lq.set(k, (lq.get(k) ?? 0) + 1);
    }
  }
  console.log('liquidType 直方图(liquid>0):', [...lq.entries()].sort());
  // 稀疏类型计数
  const want = new Set([5, 28, 105, 323, 21, 580, 594, 192, 83]);
  const cnt = new Map<number, number>();
  for (let i = 0; i < n; i++) if (want.has(w.tiles.type[i])) cnt.set(w.tiles.type[i], (cnt.get(w.tiles.type[i]) ?? 0) + 1);
  console.log('类型格数:', [...cnt.entries()].sort((a, b) => a[0] - b[0]));
  // type5 列结构：每列连续 run 长度分布（前几列样本）
  const runs = new Map<number, number>();
  let cols = 0;
  for (let x = 0; x < w.tilesWide; x++) {
    let y = 0, has = false;
    while (y < w.tilesHigh) {
      if (w.tiles.type[y * w.tilesWide + x] === 5 && (y === 0 || w.tiles.type[(y - 1) * w.tilesWide + x] !== 5)) {
        let len = 0;
        while (y + len < w.tilesHigh && w.tiles.type[(y + len) * w.tilesWide + x] === 5) len++;
        runs.set(len, (runs.get(len) ?? 0) + 1);
        has = true;
        y += len;
      } else y++;
    }
    if (has) cols++;
  }
  console.log(`type5 列数=${cols} run长度分布(前12):`, [...runs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
  // 105 雕像 frame 样本（首 3 处）
  let shown = 0;
  for (let i = 0; i < n && shown < 3; i++) {
    if (w.tiles.type[i] === 105 && w.tiles.frameX[i] % 36 === 0) {
      console.log(`105@(${i % w.tilesWide},${Math.floor(i / w.tilesWide)}) f=${w.tiles.frameX[i]},${w.tiles.frameY[i]}`);
      shown++;
    }
  }
  console.log('header:', { ground: w.groundLevel, rock: w.rockLevel, moon: w.moonType, dun: [w.dungeonX, w.dungeonY], spawn: [w.spawnX, w.spawnY], treeX: w.treeX, treeStyle: w.treeStyle, crimson: w.isCrimson, treeTops: w.treeTops });
}, 300_000);
