// CCCC 批·诊断⑦:wire 带(1123,516±) 两端结构在 golden 57→58/75→76 增量中是否存在
// + JS 管线 s52 边界前后是否有对应 trap 图块。一次性探针。
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

const itIs = process.env.SW_CCCC === '7';

(itIs ? it : it.skip)('cccc wire endpoint', async () => {
  // golden 槽间增量扫描:窗口 [1105..1150]×[495..560]
  const win: Array<[number, number]> = [];
  for (let y = 495; y <= 560; y++) for (let x = 1105; x <= 1150; x++) win.push([x, y]);
  for (const [a, b] of [[57, 58], [75, 76], [99, 100], [100, 101]] as Array<[number, number]>) {
    const ta = b16(a, 'typ'), aa = b8(a, 'act'), tb = b16(b, 'typ'), ab = b8(b, 'act');
    const chg: string[] = [];
    for (const [x, y] of win) {
      const i = y * W + x;
      const va = aa[i]! ? ta[i]! : 0, vb = ab[i]! ? tb[i]! : 0;
      if (va !== vb) chg.push(`(${x},${y})${va}→${vb}`);
    }
    console.log(`golden ${a}→${b}: ${chg.length} 处 ${chg.slice(0, 30).join(' ')}`);
  }
  // JS 管线边界帧:s52 里这窗口有哪些活性非地形(帧/线捕获)——wire 已知,查 statue/plate 内部id
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fxMap = new Map<number, number>();
  for (let q = 0; q < fw.length; q += 4) fxMap.set(fw[q]!, fw[q + 1]!);
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  // golden typ 100 窗口打印
  const t100 = b16(100, 'typ'), a100 = b8(100, 'act');
  for (let y = 510; y <= 522; y++) {
    let row = '';
    for (let x = 1118; x <= 1128; x++) {
      const i = y * W + x;
      row += (a100[i]! ? String(t100[i]!).padStart(4) : '   .') + ' ';
    }
    console.log(`y=${y}: ${row}`);
  }
}, 300_000);
