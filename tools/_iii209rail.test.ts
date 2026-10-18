// ★IIIII209 轨位扫描仪：找两侧 314 轨格分布
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const RUN = process.env.SW_I209R === '1';
const JS_DIR = '/tmp/iii203-out/pipeslot-97';
const GOLD = `${process.env.HOME ?? ''}/GoldenChains/golden-remix/dumps/097_Micro_Biomes`;
const W = 4200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii209 rail scan', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`), gT = le16(`${GOLD}.typ`);
  const RAIL = 314;
  const bands = (t: Uint16Array, name: string) => {
    console.log(`--- ${name} rail rows (y: [x-runs]) in x1300..1450 y340..400 ---`);
    for (let y = 340; y <= 400; y++) {
      const xs: number[] = [];
      for (let x = 1300; x <= 1450; x++) if (t[y * W + x] === RAIL) xs.push(x);
      if (xs.length) console.log(`y${y}: ${xs[0]}..${xs[xs.length - 1]} n=${xs.length}`);
    }
  };
  bands(jT, 'JS');
  bands(gT, 'x86');
});
