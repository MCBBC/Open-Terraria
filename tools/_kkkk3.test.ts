// KKKKKKK：残差两簇邻域打印（JS post-Dungeon 态）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const RUN = process.env.SW_K3 === '1';
const W = 4200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
(RUN ? it : it.skip)('context print', () => {
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const jt = le16('/tmp/kkk-out/js32.typ');
  const ja = readFileSync('/tmp/kkk-out/js32.act');
  const jw = le16('/tmp/jjj-out/g1457-const/032_Dungeon.wal');   // 墙两侧全等（mile8 W=0），直接用 x86 的
  for (const [cx, cy] of [[3277, 752], [3646, 757]] as Array<[number, number]>) {
    console.log(`=== 簇 (${cx},${cy}) 邻域 typ/act/wall ===`);
    for (let y = cy - 5; y <= cy + 6; y++) {
      const row: string[] = [];
      for (let x = cx - 8; x <= cx + 8; x++) {
        const i = y * W + x;
        const sh = ja[i]! & 1 ? SHEET[jt[i]!] : -1;
        row.push(`${sh >= 0 ? sh : '.'}w${jw[i]!}`);
      }
      console.log(`y${y}: ${row.join(' ')}`);
    }
  }
});
