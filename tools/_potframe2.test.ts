// frame 通道敏感性：dump070 的 type19 格,JS 管线 frameY bin vs vanilla 终态 wld frameY
// —— shelfRow∈[6,12] 的集合差即陶罐 pass 掷数差的直接候选
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
const RUN = process.env.SW_PARITY === '1';
(RUN ? it : it.skip)('type19 frameY: js-bin vs wld', () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/sw-num4/home/9293480.wld')));
  const W = wld.tilesWide;
  const act = wld.tiles.active, typ = wld.tiles.type, fyW = wld.tiles.frameY;
  const fyJ = new Uint16Array(readFileSync('/tmp/sw-t1-pot-frameY.bin').buffer.slice(0));
  const t70 = new Uint16Array(readFileSync('/tmp/sw-num4/van_x86_g/070_Quick_Cleanup.typ').buffer.slice(0));
  const a70 = readFileSync('/tmp/sw-num4/van_x86_g/070_Quick_Cleanup.act');
  let n19 = 0, diffCells = 0, shelfJ = 0, shelfW = 0, shelfFlip = 0;
  for (let y = 0; y < wld.tilesHigh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a70[i] && t70[i] === 19) {
        n19++;
        const rJ = Math.floor(fyJ[i] / 18), rW = Math.floor(fyW[i] / 18);
        if (fyJ[i] !== fyW[i]) diffCells++;
        const sJ = rJ >= 6 && rJ <= 12, sW = rW >= 6 && rW <= 12;
        if (sJ) shelfJ++;
        if (sW) shelfW++;
        if (sJ !== sW) shelfFlip++;
      }
    }
  }
  console.log(`dump070 type19 active=${n19} frameY差格=${diffCells} shelf(6..12): js=${shelfJ} wld=${shelfW} 翻转格=${shelfFlip}`);
});
