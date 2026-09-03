// ★IIIII209 邻域全量打印仪
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const RUN = process.env.SW_I209NB === '1';
const JS_DIR = '/tmp/iii203-out/pipeslot-97';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/097_Micro_Biomes';
const W = 4200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii209 neighborhood print', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`), jA = u8(`${JS_DIR}/base_flags.bin`), jS = u8(`${JS_DIR}/base_slope.bin`), jH = u8(`${JS_DIR}/base_half.bin`);
  const gT = le16(`${GOLD}.typ`), gA = u8(`${GOLD}.act`), gS = u8(`${GOLD}.slope`), gH = u8(`${GOLD}.half`);
  const x0 = Number(process.env.SW_I209_X0 ?? 1364), x1 = Number(process.env.SW_I209_X1 ?? 1390);
  const y0 = Number(process.env.SW_I209_Y0 ?? 356), y1 = Number(process.env.SW_I209_Y1 ?? 372);
  for (let y = y0; y <= y1; y++) {
    let rowJ = '', rowG = '';
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const j = `${jT[i] < 10 ? ' ' : ''}${jT[i] < 100 ? ' ' : ''}${jT[i]}${jA[i] ? '*' : ' '}${jS[i] ? 'S' + jS[i] : '  '}${jH[i] ? 'H' : ' '}`;
      const g = `${gT[i] < 10 ? ' ' : ''}${gT[i] < 100 ? ' ' : ''}${gT[i]}${gA[i] ? '*' : ' '}${gS[i] ? 'S' + gS[i] : '  '}${gH[i] ? 'H' : ' '}`;
      rowJ += j + '|'; rowG += g + '|';
    }
    console.log(`y${y}  JS ${rowJ}`);
    console.log(`     x86 ${rowG}`);
  }
});
