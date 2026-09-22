// BJ274: 解析原始 .wld —— 实报条带 (1830-1930, 290-300) 的 vanilla 真实态:
// type/halfBrick/slope/liquid + frame。判别 halfBrick 唇格与水面是否原版自带。
import { parseWld } from '../src/wld/WldParser.ts';
import fs from 'node:fs';
const buf = new Uint8Array(fs.readFileSync('/Users/vinlic/Downloads/有害的动物尸体树篱.wld'));
const wld = parseWld(buf);
const w = wld.tilesWide;
const idx = (x: number, y: number) => y * w + x;
console.log('wld:', wld.tilesWide, 'x', wld.tilesHigh);
const T = wld.tiles as any;
const has = (k: string) => T[k] !== undefined;
console.log('arrays:', Object.keys(T).join(','));
for (let y = 290; y <= 300; y++) {
  const cells: string[] = [];
  for (let x = 1830; x <= 1935; x++) {
    const i = idx(x, y);
    const t = T.type[i];
    const lq = T.liquid ? T.liquid[i] : 0;
    const hb = T.halfBrick ? T.halfBrick[i] : 0;
    const sl = T.slope ? T.slope[i] : 0;
    if (t !== 0 || lq > 0 || hb || sl) cells.push(`${x}:t${t}${hb ? 'H' : ''}${sl ? 's' + sl : ''}${lq ? 'l' + lq : ''}`);
  }
  if (cells.length) console.log(`y=${y}:`, cells.join(' '));
}
process.exit(0);
