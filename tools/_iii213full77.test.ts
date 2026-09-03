// ★IIIII213 一次性仪⑬：锚 77 全通道对拍（含 fx/fy/wire/pnt/cbt）——找残余输入差。
// 用法：cd game && SW_I213F77=1 npx vitest run tools/_iii213full77.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const OUT = '/tmp/iii213-out';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
it('iii213 anchor77 full channels', () => {
  const pairs: [string, () => Uint8Array | Uint16Array, boolean][] = [
    ['fx', () => le16(`${OUT}/x86-iter1/K.fx-77`), true],
    ['fy', () => le16(`${OUT}/x86-iter1/K.fy-77`), true],
    ['wire', () => readFileSync(`${OUT}/x86-iter1/K.wire-77`), false],
    ['pnt', () => readFileSync(`${OUT}/x86-iter1/K.pnt-77`), false],
    ['cbt', () => readFileSync(`${OUT}/x86-iter1/K.cbt-77`), false],
  ];
  for (const [nm, load, wide] of pairs) {
    const k = load() as Uint8Array;
    const j = readFileSync(`${OUT}/jdump1/K.${nm}-77`) as Uint8Array;
    let d = 0; const cells: string[] = [];
    for (let i = 0; i < W * H; i++) {
      if (wide) {
        const kv = (k as unknown as Uint16Array)[i];
        const jv = (j as unknown as Uint16Array)[i];
        if (kv !== jv) { d++; if (cells.length < 10) cells.push(`(${i % W},${(i / W) | 0})k${kv}/j${jv}`); }
      } else if (k[i] !== j[i]) { d++; if (cells.length < 10) cells.push(`(${i % W},${(i / W) | 0})k${k[i]}/j${j[i]}`); }
    }
    console.log(`a77 ${nm}: diff=${d} ${cells.join(' ')}`);
  }
});
