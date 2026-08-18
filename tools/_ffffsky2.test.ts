// SW_FFFF9=1 npx vitest run tools/_ffffsky2.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF9;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import type { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF sky tree cells', () => {
  it('positions', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    let postDg: TileStore | null = null;
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
      onWorldPartial: (w, _i, name) => { if (name === '生物群系') postDg = w.store; },
    });
    const pd = postDg!;
    const { TILE_DEFS } = await import('../src/data/tiles');
    const isTree = (t: number): boolean => (TILE_DEFS[t]?.vanilla?.sheet ?? -1) === 5;
    // 每列的 tree 格数（sky 带 y 120..150）
    const cols = new Map<number, number[]>();
    for (let y = 118; y <= 155; y++) {
      for (let x = 3370; x <= 3460; x++) {
        const pi = pd.idx(x, y);
        if (pd.flags[pi] && isTree(pd.type[pi])) {
          if (!cols.has(x)) cols.set(x, []);
          cols.get(x)!.push(y);
        }
      }
    }
    console.log('JS pdg tree columns:', [...cols.entries()].map(([x, ys]) => `${x}[${Math.min(...ys)}-${Math.max(...ys)}:${ys.length}]`).join(' '));
    const wcols = new Map<number, number[]>();
    for (let y = 118; y <= 155; y++) {
      for (let x = 3370; x <= 3460; x++) {
        const k = y * 4200 + x;
        if (wld.tiles.active[k] && wld.tiles.type[k] === 5) {
          if (!wcols.has(x)) wcols.set(x, []);
          wcols.get(x)!.push(y);
        }
      }
    }
    console.log('WLD tree columns:', [...wcols.entries()].map(([x, ys]) => `${x}[${Math.min(...ys)}-${Math.max(...ys)}:${ys.length}]`).join(' '));
  }, 600000);
});
