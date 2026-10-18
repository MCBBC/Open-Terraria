// BJ214: 用户 .wld 导出直扫——flags(三机械/hardMode) + tile 238/236/233/60 计数与分布。
// 用途: 判定"打完三王无花苞"是门假(缺旗)还是链断(有旗无苞)。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser.ts';

const FILES = [
  needInput(join(DOWNLOADS, '欺诈的灵魂祸根.wld')),
  needInput(join(DOWNLOADS, 'Starter World.wld')),
];

const WANT = [238, 236, 233, 60, 226, 59];

for (const f of FILES) {
  let buf;
  try {
    buf = readFileSync(f);
  } catch (e) {
    console.log(`=== ${f}: READ FAIL ${e.message}`);
    continue;
  }
  const wld = parseWld(new Uint8Array(buf));
  const { tilesWide: W, tilesHigh: H } = wld;
  const t = wld.tiles.type, act = wld.tiles.active;
  const counts = new Map(WANT.map((x) => [x, []]));
  for (let i = 0; i < W * H; i++) {
    if (!act[i]) continue;
    const ty = t[i];
    if (counts.has(ty)) counts.get(ty).push(i);
  }
  const surface = wld.groundLevel;
  const summary = Object.fromEntries([...counts.entries()].map(([ty, arr]) => [
    ty,
    {
      n: arr.length,
      belowSurfaceN: arr.filter((i) => Math.floor(i / W) > surface).length,
      sampleXY: arr.slice(0, 6).map((i) => [i % W, Math.floor(i / W)]),
    },
  ]));
  console.log(`=== ${f.split('/').pop()} ===`);
  console.log(JSON.stringify({
    title: wld.title, size: `${W}x${H}`, groundLevel: surface, rockLevel: wld.rockLevel,
    dungeonXY: [wld.dungeonX, wld.dungeonY], hardMode: wld.hardMode, version: wld.version,
    flags: wld.flags,
    mechAll: !!(wld.flags.downed_134 && wld.flags.downed_125 && wld.flags.downed_127),
    tileCounts: summary,
  }, null, 2));
}
