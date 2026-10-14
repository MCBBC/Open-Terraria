import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { bindModTileEntities, serializeModTEs, _resetModTEsForTests } from '../src/mods/tileEntities';
import { registerModTileEntity } from '../src/mods/tileEntities';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('TE 派发复现(手注册)', () => {
  it('setTile 派发建 TE?', () => {
    // 手注册一个测试 TE(不依赖 mod 装载)
    const T = 777;
    registerModTileEntity('testmod', T, 'test_te', { create: () => ({ v: 1 }) });
    const s = new TileStore(24, 12);
    bindModTileEntities(s);
    s.setTile(2, 2, T, 0, 0);
    const i = s.idx(2, 2);
    console.log('after: type=', s.type[i], 'frameX=', s.frameX[i]);
    const tes = serializeModTEs(s);
    console.log('TEs:', JSON.stringify(tes));
    expect(tes.length).toBe(1);
  });
});
