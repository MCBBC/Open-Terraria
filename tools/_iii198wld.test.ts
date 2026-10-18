// IIII198: x86 w.wld 帧提取——幸存罐格 x86帧 vs JS帧 逐格对拍(帧域定罪)
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198WLD=1 npx vitest run tools/_iii198wld.test.ts
//   ★机器态硬依赖单列（212 章 M3）:本件读本机会话产物（~/GoldenChains i106 w.wld + /tmp/iii195-out）,他机/产物清理后必红——仅门内运行。
const RUN = process.env.SW_I198WLD === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200, N = W * H;

it('iii198 wld frames', () => {
  const wldBuf = readFileSync(`${process.env.HOME ?? ''}/GoldenChains/i106/x86-iamerror/w.wld`);
  const wld = parseWld(new Uint8Array(wldBuf.toArrayBuffer ? wldBuf.toArrayBuffer() : wldBuf.buffer.slice(wldBuf.byteOffset)));
  const tw = wld.tilesWide, th = wld.tilesHigh;
  console.log(`[wld] tiles=${tw}x${th} active=${wld.tiles.active.length}`);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const jfx = new Uint16Array(readFileSync('/tmp/iii195-out/js-slot105/base_frameX.bin').buffer);
  const jfy = new Uint16Array(readFileSync('/tmp/iii195-out/js-slot105/base_frameY.bin').buffer);
  const jt = new Uint16Array(readFileSync('/tmp/iii195-out/js-slot105/base_type.bin').buffer);
  const jf = new Uint8Array(readFileSync('/tmp/iii195-out/js-slot105/base_flags.bin').buffer);
  // 幸存罐格(JS 侧活罐,x86 也活)帧对拍
  const wrap2 = (v: number) => { let n = Math.floor(v / 18); while (n > 1) n -= 2; return n; };
  let both = 0, fxSame = 0, fySame = 0;
  const diffs: string[] = [];
  for (let y = 6; y < Math.min(th, H) - 6; y++) for (let x = 6; x < Math.min(tw, W) - 6; x++) {
    const i = y * W + x;
    if (!(jf[i] & 1) || SHEET[jt[i]] !== 28) continue;
    const iv = y * tw + x;
    if (!(wld.tiles.active[iv] && wld.tiles.type[iv] === 28)) continue;
    both++;
    const vfx = wld.tiles.frameX[iv], vfy = wld.tiles.frameY[iv];
    if (vfx === jfx[i]) fxSame++; else if (diffs.length < 10) diffs.push(`(${x},${y}) fx x86=${vfx} js=${jfx[i]}`);
    if (vfy === jfy[i]) fySame++; else if (diffs.length < 10) diffs.push(`(${x},${y}) fy x86=${vfy} js=${jfy[i]}`);
  }
  console.log(`[wld] 双方活罐格=${both} fx同=${fxSame} fy同=${fySame}`);
  for (const d of diffs) console.log('  ' + d);
  // x86 帧自洽性(幸存罐)
  let tot = 0, cons = 0;
  for (let y = 6; y < Math.min(th, H) - 6; y++) for (let x = 6; x < Math.min(tw, W) - 6; x++) {
    const iv = y * tw + x;
    if (!(wld.tiles.active[iv] && wld.tiles.type[iv] === 28)) continue;
    tot++;
    const x0 = x - wrap2(wld.tiles.frameX[iv]);
    let n3 = Math.floor(wld.tiles.frameY[iv] / 18), num4 = 0;
    while (n3 > 1) { n3 -= 2; num4++; }
    const y0 = y - n3;
    let ok = true;
    for (let k = x0; k < x0 + 2 && ok; k++) for (let l = y0; l < y0 + 2; l++) {
      const q = l * tw + k;
      if (!(wld.tiles.active[q] && wld.tiles.type[q] === 28 && wrap2(wld.tiles.frameX[q]) === k - x0 && wld.tiles.frameY[q] === (l - y0) * 18 + num4 * 36)) ok = false;
    }
    if (ok) cons++;
  }
  console.log(`[wld] x86 幸存罐格=${tot} 帧自洽=${cons}`);
}, 600_000);
