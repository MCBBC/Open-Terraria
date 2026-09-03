// ★IIIII209 液体域取证仪：#98 (3681,113) 邻域 8 通道对拍
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const RUN = process.env.SW_I209L === '1';
const JS_DIR = '/tmp/iii209-out/pipeslot-98';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/098_Settle_Liquids_Again';
const W = 4200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii209 liquid forensics', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`), jA = u8(`${JS_DIR}/base_flags.bin`), jL = u8(`${JS_DIR}/base_liquid.bin`), jLt = u8(`${JS_DIR}/base_liquidType.bin`);
  const gT = le16(`${GOLD}.typ`), gA = u8(`${GOLD}.act`), gL = u8(`${GOLD}.liq`), gLt = u8(`${GOLD}.lty`);
  const x0 = Number(process.env.SW_I209_X0 ?? 3660), x1 = Number(process.env.SW_I209_X1 ?? 3710);
  const y0 = Number(process.env.SW_I209_Y0 ?? 105), y1 = Number(process.env.SW_I209_Y1 ?? 122);
  for (let y = y0; y <= y1; y++) {
    let rj = '', rg = '';
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const f = (t: number, a: number, l: number, lt: number) => `${t < 10 ? ' ' : ''}${t < 100 ? ' ' : ''}${t}${a ? '*' : ' '}/${String(l).padStart(3, ' ')}${lt === 1 ? 'L' : lt === 0 ? ' ' : 'w'}`;
      rj += f(jT[i] ?? 0, jA[i] ?? 0, jL[i] ?? 0, jLt[i] ?? 0) + '|';
      rg += f(gT[i] ?? 0, gA[i] ?? 0, gL[i] ?? 0, gLt[i] ?? 0) + '|';
    }
    console.log(`y${y}`);
    console.log(`  JS  ${rj}`);
    console.log(`  x86 ${rg}`);
  }
});
