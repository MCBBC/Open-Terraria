// CCCC 批·诊断⑬:全部 style-1 金箱的 countWires(±20)(strip 后基座)——找另 5 组幻影
// wire 嫌疑 + golden 证据核验。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '12';

(itIs ? it : it.skip)('cccc wire suspects', async () => {
  const gt = b16(100, 'typ'), ga = b8(100, 'act');
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) wire[fw[q]!] = fw[q + 3]! & 0x1f;
  for (let y = 517; y <= 541; y++) for (const x of [1122, 1123, 1124]) wire[y * W + x] = 0;   // 已strip
  const chestList = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as Array<{ x: number; y: number }>;
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  // 用 frameX 判 style1 金箱:frames.bin 有 fx
  const fxMap = new Map<number, number>();
  for (let q = 0; q < fw.length; q += 4) fxMap.set(fw[q]!, fw[q + 1]!);
  const countWires = (x: number, y: number): number => {
    let n = 0;
    for (let i = x - 20; i <= x + 20; i++) {
      for (let j = y - 20; j <= y + 20; j++) {
        if (i < 0 || i >= W || j < 0 || j >= H) continue;
        const b = wire[j * W + i]! & 15;
        n += (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
      }
    }
    return n;
  };
  let nStyle1 = 0;
  const suspects: string[] = [];
  for (let ci = 0; ci < chestList.length; ci++) {
    const { x, y } = chestList[ci]!;
    const i = y * W + x;
    if (!ga[i]! || gt[i]! !== 21) continue;
    const fx = fxMap.get(i) ?? 0;
    if (fx % 36 !== 0 || Math.trunc(fx / 36) !== 1) continue;
    nStyle1++;
    const n = countWires(x, y);
    if (n > 0) suspects.push(`#${ci}(${x},${y}) wires=${n}`);
  }
  console.log(`style-1 金箱 ${nStyle1} 个;countWires>0 的 ${suspects.length} 个:`);
  for (const s of suspects) console.log('   ' + s);
  // 嫌疑箱周边 golden 陷阱证据(57→58/75→76 ±60)
  const t58 = b16(58, 'typ'), a58 = b8(58, 'act'), t76 = b16(76, 'typ'), a76 = b8(76, 'act');
  const t57 = b16(57, 'typ'), a57 = b8(57, 'act'), t75 = b16(75, 'typ'), a75 = b8(75, 'act');
  for (const s of suspects) {
    const m = /#(\d+)\((\d+),(\d+)\) wires=(\d+)/.exec(s)!;
    const cx = Number(m[2]), cy = Number(m[3]);
    const chg = (ta: Uint16Array, aa: Uint8Array, tb: Uint16Array, ab: Uint8Array): string => {
      const out: string[] = [];
      for (let y = cy - 60; y <= cy + 60; y++) for (let x = cx - 60; x <= cx + 60; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const i = y * W + x;
        const va = aa[i]! ? ta[i]! : 0, vb = ab[i]! ? tb[i]! : 0;
        if (va !== vb) out.push(`(${x},${y})${va}→${vb}`);
      }
      return out.slice(0, 10).join(' ');
    };
    console.log(`\n${s}:`);
    console.log(`   statues57→58: ${chg(t57, a57, t58, a58) || '(无)'}`);
    console.log(`   traps75→76: ${chg(t75, a75, t76, a76) || '(无)'}`);
  }
}, 300_000);
