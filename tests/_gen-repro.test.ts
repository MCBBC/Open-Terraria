import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/core/rng', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/core/rng')>();
  return { ...mod, hashString: (_s: string) => 1084082940 };
});
const { generateWorld } = await import('../src/world/gen/WorldGen');
const { TILE_BY_KEY } = await import('../src/data/tiles');

function scan(type: Uint16Array, W: number, tree: number, label: string) {
  let broken = 0;
  const samples: string[] = [];
  for (let x = 1; x < W - 1; x++) {
    let y = 20;
    const segs: Array<[number, number]> = [];
    while (y < 800) {
      if (type[y * W + x] === tree) {
        let y2 = y;
        while (y2 + 1 < 800 && type[(y2 + 1) * W + x] === tree) y2++;
        segs.push([y, y2]);
        y = y2 + 1;
      } else y++;
    }
    // 病理:长段(≥5) + 缺口(1-6) + 下一段(基座区,长度≤3)
    for (let s = 0; s < segs.length - 1; s++) {
      const [a0, a1] = segs[s];
      const [b0, b1] = segs[s + 1];
      const gap = b0 - a1 - 1;
      if (a1 - a0 + 1 >= 5 && gap >= 1 && gap <= 6 && b1 - b0 + 1 <= 3) {
        broken++;
        if (samples.length < 8) samples.push(`x=${x}: ${a0}-${a1} | 缺${gap} | ${b0}-${b1}`);
        break;
      }
    }
  }
  console.log(`${label}: 病理树干 ${broken}`);
  samples.forEach((s) => console.log(' ', s));
}

describe('病理树干扫描', () => {
  it('repro vs saved', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'x', name: 'repro' } as never);
    const TREE = TILE_BY_KEY['tree']!;
    const st = world.store;
    // 合并整列 Uint16 视图
    scan(st.type, st.w, TREE, 'repro');
    const fs = await import('node:fs');
    const w = JSON.parse(fs.readFileSync('/Users/vinlic/Downloads/map-苍翠之境.json', 'utf8'));
    const u8 = Buffer.from(w.tiles, 'base64');
    const W = w.header.width;
    const type = new Uint16Array(W * w.header.height);
    let pos = 0, i = 0;
    function rv() { let v = 0, s = 0, b; do { b = u8[pos++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v >>> 0; }
    while (i < type.length && pos < u8.length) {
      const run = rv() + 1, t = rv();
      if (t !== 0) { rv(); rv(); }
      for (let k = 0; k < run && i < type.length; k++, i++) type[i] = t;
    }
    scan(type, W, TREE, 'saved');
    expect(true).toBe(true);
  }, 600000);
});
