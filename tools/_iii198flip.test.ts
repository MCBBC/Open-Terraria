// IIII198: 扫撒流翻转源——slot104 态下,误差世界 sweep 的 roll-相关不可见门翻转普查
// (a) 非活性苔藓幽灵格 (moss gate 读裸 type) (b) 137 格 wire 门 (c) 全域首翻转位置
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198FLIP=1 npx vitest run tools/_iii198flip.test.ts
const RUN = process.env.SW_I198FLIP === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200;
const MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);

it('iii198 roll-gate flips', () => {
  const buf = readFileSync(`${process.env.HOME ?? ''}/GoldenChains/i106/x86-iamerror/w.wld`);
  const wld = parseWld(new Uint8Array(buf.buffer, buf.byteOffset));
  const tw = wld.tilesWide;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const id137 = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 137);
  const jw = new Uint8Array(readFileSync('/tmp/iii198-out/js-slot104/base_wire.bin').buffer);
  const jt = new Uint16Array(readFileSync('/tmp/iii198-out/js-slot104/base_type.bin').buffer);
  const jf = new Uint8Array(readFileSync('/tmp/iii198-out/js-slot104/base_flags.bin').buffer);
  // (a) 苔藓幽灵门翻转:cell(非活性) 其中一侧 ghost∈MOSS
  let mossFlip = 0; const mossFirst: string[] = [];
  // (b) 137 wire 门翻转
  let w137Flip = 0; const w137First: string[] = [];
  for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) {
    const i = y * W + x;
    const iv = y * tw + x;
    const va = wld.tiles.active[iv] ? 1 : 0;
    const ja = jf[i] & 1;
    const vt = wld.tiles.type[iv];
    const jtV = jt[i];
    // (a) 苔藓幽灵(非活性侧)
    if (!va || !ja) {
      const vMoss = MOSS.has(vt), jMoss = ja ? MOSS.has(SHEET[jtV]) : MOSS.has(SHEET[jtV]);
      // 非活性侧:vanilla type 裸读 vs JS type 裸读(两世界各自的 ghost)
      const gMossX = !va && MOSS.has(vt);
      const gMossJ = !ja && MOSS.has(SHEET[jtV] ?? -1);
      if (gMossX !== gMossJ) {
        mossFlip++;
        if (mossFirst.length < 8) mossFirst.push(`(${x},${y}) x86ghost=${!va ? vt : '-'} jsghost=${!ja ? (SHEET[jtV] ?? -1) : '-'}`);
      }
    }
    // (b) 137 活格 wire 门
    if (va && ja && vt === 137 && jtV === id137) {
      const vWired = (wld.tiles.wire[iv] & 15) !== 0;
      const jWired = (jw[i] & 15) !== 0;
      if (vWired !== jWired) {
        w137Flip++;
        if (w137First.length < 8) w137First.push(`(${x},${y}) x86wire=${wld.tiles.wire[iv]} jswire=${jw[i]}`);
      }
    }
  }
  console.log(`[flip] 苔藓幽灵门翻转=${mossFlip}`);
  for (const s of mossFirst) console.log('  M ' + s);
  console.log(`[flip] 137 wire 门翻转=${w137Flip}`);
  for (const s of w137First) console.log('  W ' + s);
}, 600_000);
