// CCCC 批·诊断⑧:(1123..1124,517..541) wire 带在管线边界 s17(雕像后)/s30(陷阱前)/
// s31(陷阱后)/s52(#101 前) 的出现时序 → 定位写入 pass。一次性探针。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;

const itIs = process.env.SW_CCCC === '8';

function wireOf(key: string): Uint8Array {
  const fw = new Uint32Array(readFileSync(`${BDIR}/${key}/frames.bin`).buffer.slice(0));
  const wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) wire[fw[q]!] = fw[q + 3]! & 0x1f;
  return wire;
}

(itIs ? it : it.skip)('cccc wire timeline', async () => {
  for (const key of ['s17', 's18', 's30', 's31', 's32', 's52']) {
    let wire = 0;
    try {
      const w = wireOf(key);
      for (let y = 517; y <= 541; y++) for (const x of [1122, 1123, 1124]) if (w[y * W + x]! & 15) wire++;
    } catch { console.log(`${key}: (no boundary)`); continue; }
    console.log(`${key}: wire cells in strip = ${wire}`);
  }
  // 也查 (1142,509) 压板附近 golden76 陷阱的更大窗
  const G2 = '/tmp/sw-slp/g';
  const { readdirSync } = await import('node:fs');
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
  const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
  const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const ta = b16(75, 'typ'), aa = b8(75, 'act'), tb = b16(76, 'typ'), ab = b8(76, 'act');
  const chg: string[] = [];
  for (let y = 460; y <= 570; y++) for (let x = 1080; x <= 1210; x++) {
    const i = y * W + x;
    const va = aa[i]! ? ta[i]! : 0, vb = ab[i]! ? tb[i]! : 0;
    if (va !== vb) chg.push(`(${x},${y})${va}→${vb}`);
  }
  console.log(`golden 75→76 (x1080-1210,y460-570): ${chg.join(' ')}`);
}, 300_000);
