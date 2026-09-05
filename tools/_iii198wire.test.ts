// IIII198: x86 w.wld 导线位 vs JS slot104 wire 位——137 门翻转普查
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200;

it('iii198 wire compare', () => {
  const buf = readFileSync('/Users/vinlic/GoldenChains/i106/x86-iamerror/w.wld');
  const wld = parseWld(new Uint8Array(buf.buffer, buf.byteOffset));
  const tw = wld.tilesWide;
  let id137 = -1;
  const jw = new Uint8Array(readFileSync('/tmp/iii198-out/js-slot104/base_wire.bin').buffer);
  const jt = new Uint16Array(readFileSync('/tmp/iii198-out/js-slot104/base_type.bin').buffer);
  const jf = new Uint8Array(readFileSync('/tmp/iii198-out/js-slot104/base_flags.bin').buffer);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (s === 137) { id137 = i; break; }
  }
  console.log(`[wire] js id(137)=${id137}`);
  let tot137 = 0, gateFlip = 0, wireDiff = 0, act137x = 0;
  const samples: string[] = [];
  for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) {
    const i = y * W + x;
    const iv = y * tw + x;
    const va = wld.tiles.active[iv] ? 1 : 0;
    const ja = jf[i] & 1;
    if (!va || !ja) continue;
    const vt = wld.tiles.type[iv];
    const is137x = vt === 137;
    const is137j = jt[i] === id137;
    const vw = wld.tiles.wire[iv];
    const vWired = (vw & 15) !== 0;
    const jWired = (jw[i] & 15) !== 0;
    if (vWired !== jWired) wireDiff++;
    if (is137x && is137j) {
      tot137++;
      if (vWired !== jWired) {
        gateFlip++;
        if (samples.length < 6) samples.push(`(${x},${y}) x86wire=${vw} jswire=${jw[i]}`);
      }
    }
    if (is137x !== is137j) act137x++;
  }
  console.log(`[wire] 双活137格=${tot137} 门翻转(wire差)=${gateFlip} 全域导线位差=${wireDiff} 137型错位=${act137x}`);
  for (const s of samples) console.log('  ' + s);
}, 600_000);
