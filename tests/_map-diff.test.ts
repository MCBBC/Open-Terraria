// 临时：双地图对账分析（原版导入 vs 自产）——vitest 跑完即删
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const VANILLA = '/Users/vinlic/Downloads/map-不负责任的女妖啤酒厂 (1).json';
const OURS = '/Users/vinlic/Downloads/map-难看的派对地洞 (1).json';

interface Decoded { type: Uint16Array; fx: Uint16Array; fy: Uint16Array; liquid: Uint8Array; }

function decode(path: string): { w: number; h: number; st: Decoded } {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const W = j.header.width, H = j.header.height;
  const u8 = Buffer.from(j.tiles, 'base64');
  const type = new Uint16Array(W * H), fx = new Uint16Array(W * H), fy = new Uint16Array(W * H);
  const liquid = new Uint8Array(W * H);
  const lu8 = Buffer.from(j.liquid, 'base64');
  let pos = 0, i = 0;
  function rv(src: Buffer, p: { i: number }) { let v = 0, s = 0, b; do { b = src[p.i++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; }
  while (i < type.length && pos < u8.length) {
    const run = rv(u8, { get i() { return pos; }, set i(v) { pos = v; } }) + 1;
    // 注意：rv 内部用 pos（对象包装太慢，直接内联）
    const t = (() => { let v = 0, s = 0, b; do { b = u8[pos++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; })();
    let fxx = 0, fyy = 0;
    if (t !== 0) {
      fxx = (() => { let v = 0, s = 0, b; do { b = u8[pos++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; })();
      fyy = (() => { let v = 0, s = 0, b; do { b = u8[pos++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; })();
    }
    for (let r = 0; r < run && i < type.length; r++, i++) { type[i] = t; fx[i] = fxx; fy[i] = fyy; }
  }
  // liquid 是 RLE pairs（值,游程）
  let lp = 0; i = 0;
  while (lp < lu8.length && i < liquid.length) {
    const val = lu8[lp++]; let run = lu8[lp++];
    while (run-- > 0 && i < liquid.length) liquid[i++] = val;
  }
  return { w: W, h: H, st: { type, fx, fy, liquid } };
}

const nameOf = (id: number) => {
  const d = TILE_DEFS[id];
  return d ? `${d.key}${d.vanilla ? `(sh${d.vanilla.sheet})` : ''}` : `?${id}`;
};

describe('双地图对账', () => {
  it('直方图 + 海滩/水中植物分析', () => {
    const A = decode(VANILLA), B = decode(OURS);
    for (const [label, m] of [['原版', A], ['我们', B]] as const) {
      const { type, liquid } = m.st;
      const hist = new Map<number, number>();
      for (let i = 0; i < type.length; i++) if (type[i] !== 0) hist.set(type[i], (hist.get(type[i]) ?? 0) + 1);
      const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
      console.log(`\n== ${label} tile Top30 ==`);
      for (const [id, n] of top) console.log(`  ${String(n).padStart(7)} ${nameOf(id)}`);
      // 水中的植物类（sheet 3/73/201/24 等 decor）
      let plantsInWater = 0; const kinds = new Map<string, number>();
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          const i = y * m.w + x;
          const d = TILE_DEFS[type[i]];
          if (!d?.decor || liquid[i] === 0) continue;
          plantsInWater++;
          const k = nameOf(type[i]);
          kinds.set(k, (kinds.get(k) ?? 0) + 1);
        }
      }
      console.log(`== ${label} 水中 decor 格: ${plantsInWater} ==`);
      console.log('  ', [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(', '));
      // 海滩带（地图左右各 250 列）decor/物品 tile 分布
      const beach = new Map<string, number>();
      for (let x = 0; x < 250; x++) {
        for (let y = 0; y < m.h; y++) {
          const i = y * m.w + x;
          if (type[i] === 0) continue;
          const d = TILE_DEFS[type[i]];
          const k = nameOf(type[i]);
          if (d?.decor || d?.framed) beach.set(k, (beach.get(k) ?? 0) + 1);
        }
      }
      console.log(`== ${label} 西海滩带(0..250) decor/framed ==`);
      console.log('  ', [...beach.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(', ') || '(无)');
    }
  }, 300000);
});
