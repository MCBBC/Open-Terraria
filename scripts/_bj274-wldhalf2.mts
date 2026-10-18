// BJ274: 导出 .wld 全图 halfBrick 坐标集（与 kv save 的 blocks 通道 diff）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { parseWld } from '../src/wld/WldParser.ts';
import fs from 'node:fs';
const buf = new Uint8Array(fs.readFileSync(needInput(join(DOWNLOADS, '有害的动物尸体树篱.wld'))));
const wld = parseWld(buf);
const T = wld.tiles as any;
const w = wld.tilesWide;
const lines: string[] = [];
for (let i = 0; i < w * wld.tilesHigh; i++) {
  if (T.half[i]) lines.push(`${i % w},${(i / w) | 0}`);
}
fs.writeFileSync('/tmp/bj274-wld-half.txt', lines.join('\n'));
console.log('wld half lines:', lines.length);
process.exit(0);
