// ★IIIII209 #97 轨域取证仪：JS pipeslot-97 vs 金标 097 细胞级对拍
// 用法: cd game && SW_I209F=1 npx vitest run tools/_iii209forensic.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const RUN = process.env.SW_I209F === '1';
const JS_DIR = '/tmp/iii203-out/pipeslot-97';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/097_Micro_Biomes';
const W = 4200, H = 1200;

function le16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
function u8(p: string): Uint8Array {
  const b = readFileSync(p);
  return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

(RUN ? it : it.skip)('iii209 forensic cell dump', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`);
  const jA = u8(`${JS_DIR}/base_flags.bin`);
  const jS = u8(`${JS_DIR}/base_slope.bin`);
  const jH = u8(`${JS_DIR}/base_half.bin`);
  const jW = u8(`${JS_DIR}/base_wire.bin`);
  const gT = le16(`${GOLD}.typ`);
  const gA = u8(`${GOLD}.act`);
  const gS = u8(`${GOLD}.slope`);
  const gH = u8(`${GOLD}.half`);
  const idx = (x: number, y: number) => y * W + x;
  const show = (label: string, x0: number, x1: number, y0: number, y1: number) => {
    console.log(`\n===== ${label} (x ${x0}..${x1}, y ${y0}..${y1}) =====`);
    console.log('format: x,y | JS typ/act/slope/half/wire | x86 typ/act/slope/half');
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y);
        const jt = jT[i] ?? -1, ja = jA[i] ?? -1, js2 = jS[i] ?? -1, jh = jH[i] ?? -1, jw = jW[i] ?? -1;
        const gt = gT[i] ?? -1, ga = gA[i] ?? -1, gs = gS[i] ?? -1, gh = gH[i] ?? -1;
        const diff = jt !== gt || ja !== ga || js2 !== gs || jh !== gh;
        if (diff) {
          console.log(
            `${x},${y} | JS ${jt}/${ja}/${js2}/${jh}/w${jw} | x86 ${gt}/${ga}/${gs}/${gh}` +
            (jt !== gt ? ' T!' : '') + (ja !== ga ? ' A!' : '') + (js2 !== gs ? ' S!' : '') + (jh !== gh ? ' H!' : ''),
          );
        }
      }
    }
  };
  show('TRACK FIRST-DIFF', 1360, 1390, 350, 378);
  show('TRAP LAST-OK', 3010, 3036, 930, 1010);
});
