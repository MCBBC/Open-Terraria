// CCCC 批·诊断⑥:(1129,537) ±20 wire 格逐格定位 + golden 各槽对照(78/99/100),判定
// wire 属 JS 幻影(#76债)或原版结构。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '6';

(itIs ? it : it.skip)('cccc wire cells', async () => {
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { wire[fw[q]!] = fw[q + 3]! & 0x1f; }
  const t100 = b16(100, 'typ'), a100 = b8(100, 'act');
  const t99 = b16(99, 'typ'), a99 = b8(99, 'act');
  const t78 = b16(78, 'typ'), a78 = b8(78, 'act');
  const t76 = b16(76, 'typ'), a76 = b8(76, 'act');
  const t58 = b16(58, 'typ'), a58 = b8(58, 'act');
  const t57 = b16(57, 'typ'), a57 = b8(57, 'act');
  let n = 0;
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      const x = 1129 + dx, y = 537 + dy;
      const i = y * W + x;
      if (wire[i]! & 15) {
        n++;
        console.log(`wire(${x},${y}) bits=${wire[i]! & 15} | g100=${a100[i]! ? t100[i]! : '-'} | g99=${a99[i]! ? t99[i]! : '-'} | g78=${a78[i]! ? t78[i]! : '-'} | g76=${a76[i]! ? t76[i]! : '-'} | g57→58: ${a57[i]! ? t57[i]! : '-'}→${a58[i]! ? t58[i]! : '-'}`);
      }
    }
  }
  console.log(`total wire cells = ${n}`);
}, 300_000);
