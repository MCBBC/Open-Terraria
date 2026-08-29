// SkyblockRuntime.calculate 地牢派生回归（2026-08-28 用户实报：
// 构造器漏建 anchorSets.dungeonTile → undefined.has 当场炸）
import { describe, expect, it } from 'vitest';
import { SkyblockRuntime, type SkyblockStoreLike } from '../src/world/SkyblockRuntime';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const W = 8, H = 220;
function mkStore(): SkyblockStoreLike {
  return {
    w: W, h: H,
    flags: new Uint8Array(W * H),   // 置 1=tile.active()——scanColumn 只数活格
    type: new Uint16Array(W * H),
    wall: new Uint16Array(W * H),
    idx: (x, y) => y * W + x,
  };
}
function put(st: SkyblockStoreLike, x: number, y: number, internalId: number): void {
  const i = st.idx(x, y);
  st.flags[i] = 1;
  st.type[i] = internalId;
}
const sheet = (sh: number): number => {
  const t = TILE_INTERNAL_BY_SHEET.get(sh);
  if (t === undefined || t < 0) throw new Error('sheet 未映射 ' + sh);
  return t;
};

describe('SkyblockRuntime.warmFullScan/calculate', () => {
  it('普通石块走完地牢派生支不炸（曾读 undefined.has）', () => {
    const st = mkStore();
    put(st, 2, 100, sheet(1));   // 石块：非任何锚点 → else-if 链走到 dungeonTile
    const rt = new SkyblockRuntime(st, () => true);
    expect(() => rt.warmFullScan()).not.toThrow();
    expect(rt.flags.noDungeon).toBe(true);   // 无地牢砖
    expect(rt.debugState().flags.lowTiles).toBe(true);   // skyblock 世界几乎无实体块
  });

  it('地牢砖(41)在场 → noDungeon=false', () => {
    const st = mkStore();
    put(st, 3, 100, sheet(1));   // 石块
    put(st, 4, 100, sheet(41));  // 地牢砖
    const rt = new SkyblockRuntime(st, () => true);
    rt.warmFullScan();
    expect(rt.flags.noDungeon).toBe(false);
  });

  it('祭坛锚点(26)识别', () => {
    const st = mkStore();
    put(st, 1, 100, sheet(26));
    const rt = new SkyblockRuntime(st, () => true);
    rt.warmFullScan();
    expect(rt.flags.noAltars).toBe(false);
  });
});
