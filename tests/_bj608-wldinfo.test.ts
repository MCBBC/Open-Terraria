// BJ608 oracle 仪:解析用户实报 .wld,导出玩家活动带平台布局真值（供判别测试复现布局）。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_ORACLE === '1';
(RUN ? it : it.skip)('bj608 wld platform layout', () => {
  const wld = parseWld(Uint8Array.from(readFileSync('/tmp/bj608/user.wld')));
  const w = wld.tilesWide;
  const T = wld.tiles as any;
  const out: string[] = [];
  out.push(`wld ${wld.tilesWide}x${wld.tilesHigh}`);
  for (let y = 262; y <= 286; y++) {
    const cells: string[] = [];
    for (let x = 3900; x <= 3950; x++) {
      const i = y * w + x;
      const t = T.type[i];
      const lq = T.liquid ? T.liquid[i] : 0;
      const hb = T.halfBrick ? T.halfBrick[i] : 0;
      const sl = T.slope ? T.slope[i] : 0;
      const frY = T.frameY ? T.frameY[i] : 0;
      const frX = T.frameX ? T.frameX[i] : 0;
      if (t !== 0 || lq > 0 || hb || sl) cells.push(`${x}:t${t}${hb ? 'H' : ''}${sl ? 's' + sl : ''}${lq ? 'l' + lq : ''}(${frX},${frY})`);
    }
    if (cells.length) out.push(`y=${y}: ${cells.join(' ')}`);
  }
  writeFileSync('/tmp/bj608/layout.txt', out.join('\n'));
  console.log(out.join('\n'));
});
