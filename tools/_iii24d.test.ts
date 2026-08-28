// IIII24 批诊断 d：对选定家族单元格打印四态行（d104/d105/js57/js58）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const G2 = process.env.SW_III24_G2 ?? '/tmp/jjj-out/g1457-ntb';
const OUT = process.env.SW_III24_OUT ?? '/tmp/iii24-out';
const W = 4200, N = W * 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer, 0, readFileSync(p).byteLength >> 1);
function loadCh(idx: number): Record<string, Uint16Array | Uint8Array> {
  const pre = `${G2}/${(readdirSync(G2).find((f) => f.startsWith(`${String(idx).padStart(3, '0')}_`) && f.endsWith('.typ'))!).replace(/\.typ$/, '')}`;
  return { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`) };
}
it('rowdump', () => {
  const j57t = le16(`${OUT}/js57_type.bin`), j58t = le16(`${OUT}/js58_type.bin`);
  const j57f = new Uint8Array(readFileSync(`${OUT}/js57_flags.bin`).buffer, 0, N);
  const j58f = new Uint8Array(readFileSync(`${OUT}/js58_flags.bin`).buffer, 0, N);
  const j57w = le16(`${OUT}/js57_wall.bin`), j58w = le16(`${OUT}/js58_wall.bin`);
  const d104 = loadCh(104), d105 = loadCh(105);
  const row = (i: number): string => {
    const mk = (a: number | undefined, t: number, w2: number): string =>
      `${a ? 'A' : '.'}${String(t).padStart(3)}/w${w2}`;
    return [
      mk(d104.a[i], d104.t[i]!, d104.w[i]!), mk(d105.a[i], d105.t[i]!, d105.w[i]!),
      mk(j57f[i]! & 1, SHEET[j57t[i]!]!, j57w[i]!), mk(j58f[i]! & 1, SHEET[j58t[i]!]!, j58w[i]!),
    ].join('  ');
  };
  const fams: Array<[string, (i: number) => boolean]> = [
    ['T62>0', (i) => d105.a[i] && d105.t[i] === 62 && !(j58f[i]! & 1)],
    ['T43>59', (i) => d105.a[i] && d105.t[i] === 43 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 59],
    ['T60>43', (i) => d105.a[i] && d105.t[i] === 60 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 43],
    ['T230>161', (i) => d105.a[i] && d105.t[i] === 230 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 161],
    ['T161>147', (i) => d105.a[i] && d105.t[i] === 161 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 147],
    ['T59>147', (i) => d105.a[i] && d105.t[i] === 59 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 147],
    ['T69>0', (i) => d105.a[i] && d105.t[i] === 69 && !(j58f[i]! & 1)],
    ['T5>0', (i) => d105.a[i] && d105.t[i] === 5 && !(j58f[i]! & 1)],
    ['T596>616', (i) => d105.a[i] && d105.t[i] === 596 && (j58f[i]! & 1) && SHEET[j58t[i]!] === 616],
  ];
  for (const [nm, pred] of fams) {
    let n = 0;
    console.log(`===== ${nm} samples =====`);
    for (let i = 0; i < N && n < 3; i++) {
      if (!pred(i)) continue;
      const x = i % W, y = Math.floor(i / W);
      console.log(`(${x},${y}) d104|d105|js57|js58: ${row(i)}`);
      // 上方一行参考
      if (y > 0) console.log(`   up-row d105:[${x},${y - 1}]=${row(i - W)}  js58-up=[${row(i - W)}]`);
      n++;
    }
  }
}, 600_000);
