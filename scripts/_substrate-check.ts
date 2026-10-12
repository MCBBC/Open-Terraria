// ★628:基底可行性检查——实跑 .wld vanilla 面 vs 本仓引擎同种子输出(本仓内部 id 空间 FNV)
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { generateWorld } from '../src/world/gen/WorldGen';

const fnvOf = (arr: Uint16Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    h ^= arr[i] & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (arr[i] >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
const decodeRle = (b64: string, n: number): Uint16Array => {
  const u8 = Uint8Array.from(Buffer.from(b64, 'base64'));
  const out = new Uint16Array(n);
  let p = 0, i = 0;
  while (i < n && p < u8.length) {
    let run = 0, s = 0;
    for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
    let tRaw = 0; s = 0;
    for (;;) { const b = u8[p++]; tRaw |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
    let t = 0;
    if (tRaw !== 0) {
      // stable→internal(泛化:查表)
      const tbl = (globalThis as { __TIOS?: Uint16Array }).__TIOS;
      t = tbl ? (tbl[tRaw] || 0) : tRaw;
      s = 0;
      for (;;) { const b = u8[p++]; if (!(b & 0x80)) break; s += 7; }   // fx 丢弃
      s = 0;
      for (;;) { const b = u8[p++]; if (!(b & 0x80)) break; s += 7; }   // fy 丢弃
    }
    const end = Math.min(i + run + 1, n);
    for (; i < end; i++) out[i] = t;
  }
  return out;
};

// ① 实跑 wld → parseWldToSave → RLE → FNV(内部 id 空间)
const wldPath = process.argv[2] ?? '/tmp/tml-golden/golden-vanilla.wld';
const imp = parseWldToSave(new Uint8Array(readFileSync(wldPath)));
const save = imp.save as unknown as { tiles: string; version: number; header: { width: number; height: number } };
const { TILE_INTERNAL_OF_STABLE } = await import('../src/data/tiles');
(globalThis as { __TIOS?: Uint16Array }).__TIOS = TILE_INTERNAL_OF_STABLE;
const n = save.header.width * save.header.height;
const realType = decodeRle(save.tiles, n);
console.log(`[substrate] 实跑 wld=${save.header.width}x${save.header.height} fnv=${fnvOf(realType)} 活格=${(() => { let c = 0; for (let i = 0; i < n; i++) if (realType[i]) c++; return c; })()}`);

// ② 本仓引擎同种子(无 mod passes——纯 vanilla 面对比)
const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
const st = world.store as unknown as { type: Uint16Array };
console.log(`[substrate] 本仓引擎 fnv=${fnvOf(st.type)}`);
console.log('[substrate] 判定:', fnvOf(realType) === fnvOf(st.type) ? '基底逐位全等 ✓(战役直通)' : '基底有差(需查首个分歧 pass)');
process.exit(0);
