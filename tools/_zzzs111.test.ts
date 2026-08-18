// ZZZ 验收探针 2：s111/m111 全管线 vs /tmp/vserver86/*.wld —— 苔藓 184 计数 + 668 格
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const VSRV = '/tmp/vserver86';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const CASES: Array<{ file: string; size: 's' | 'm'; seed: string }> = [
  { file: 's111.wld', size: 's', seed: '111' },
  { file: 'm111.wld', size: 'm', seed: '111' },
];

for (const c of CASES) {
  it(`zzz ${c.file} moss/668 parity`, async () => {
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${c.file}`)));
    const dims = SIZE_DIMS[c.size === 's' ? 0 : 1];
    const world = await generateWorld({ size: c.size === 's' ? 0 : 1, width: dims.width, height: dims.height, seedText: c.seed, evil: 0 });
    const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
    let v184 = 0, j184 = 0;
    const v668: string[] = [], j668: string[] = [];
    let v625 = 0, j625 = 0, v51 = 0, j51 = 0;
    const st = world.store;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const vt = wld.tiles.type[i]!, va = wld.tiles.active[i]!;
        const jt = SHEET[st.type[i]!] ?? -1, ja = st.flags[i] !== 0;
        if (va && vt === 184) v184++;
        if (ja && jt === 184) j184++;
        if (va && vt === 668) v668.push(`(${x},${y})`);
        if (ja && jt === 668) j668.push(`(${x},${y})`);
        if (va && vt === 625) v625++;
        if (ja && jt === 625) j625++;
        if (va && vt === 51) v51++;
        if (ja && jt === 51) j51++;
      }
    }
    console.log(`${c.file}: moss184 v=${v184} j=${j184} ${v184 === j184 ? '✓平权' : '✗差' + (j184 - v184)}`);
    console.log(`${c.file}: moss625 v=${v625} j=${j625}; cobweb51 v=${v51} j=${j51}`);
    console.log(`${c.file}: 668 v=[${v668.join(',')}]`);
    console.log(`${c.file}: 668 j=[${j668.join(',')}]`);
    console.log(`${c.file}: ⑭ ${v668.length === j668.length && v668.every((p, q) => p === j668[q]) ? '★位点全等' : '✗位点不等'}`);
  }, 480_000);
}
