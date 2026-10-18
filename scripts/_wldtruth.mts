// 直接解析原始 .wld:标注点 (3227,391) 的真实 vanilla tile id + frame
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { parseWld } from '../src/wld/WldParser.ts';
import fs from 'fs';
const buf = new Uint8Array(fs.readFileSync(needInput(join(DOWNLOADS, 'Starter_World Master.wld'))));
const wld = parseWld(buf);
const w = wld.tilesWide;
const idx = (x: number, y: number) => y * w + x;
console.log('wld:', wld.tilesWide, 'x', wld.tilesHigh);
for (const [x, y] of [[3227, 391], [3227, 396], [3200, 391], [3227, 320]]) {
  const t = wld.tiles.type[idx(x, y)];
  const fx = wld.tiles.frameX[idx(x, y)];
  const fy = wld.tiles.frameY[idx(x, y)];
  console.log(`(${x},${y}) vanilla tile=${t} frame=(${fx},${fy})`);
}
process.exit(0);
