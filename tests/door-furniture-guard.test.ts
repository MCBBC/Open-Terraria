// 门开关 × 旁贴多格家具守卫(用户报"开关门把工作台/墓碑半边贴图切没"):
// 根因 = closeDoor 曾 3 列无差别 setTile(0),门朝空侧开再关时扫过旁贴格;
// 原版 :32037-32057 只动 type==11(开门格)——关门列转换、其余开门格清空。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { openDoor, closeDoor } from '../src/world/Door';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR = 17, WB = TILE_BY_KEY['workbench'] as number, TOMB = TILE_BY_KEY['tombstone_v'] as number;

function trapWorld(furnId: number, furnW: number, anchorFx2: number): World {
  const w = new World(40, 40, 30, 'open');
  const st = w.store;
  for (let x = 10; x < 32; x++) st.setTileSilent(x, 30, 1, 0, 0);   // 地板
  // 门柱 x=20(关门三格,行内帧 0/18/36)
  st.setTileSilent(20, 27, DOOR, 0, 0);
  st.setTileSilent(20, 28, DOOR, 0, 18);
  st.setTileSilent(20, 29, DOOR, 0, 36);
  // 家具贴门右侧(2 格宽):锚(21,29)+右半(22,29)
  st.setTileSilent(21, 29, furnId, 0, 0);
  st.setTileSilent(22, 29, furnId, anchorFx2, 0);
  return w;
}

describe('门开关不伤旁贴家具', () => {
  it('工作台:朝空侧开→关,两半格原样保留', () => {
    const w = trapWorld(WB, 2, 18);
    const st = w.store;
    expect(openDoor(st, 20, 29, -1)).toBe(true);        // 左开(空侧)
    expect(st.get(21, 29)).toBe(WB);
    expect(st.get(22, 29)).toBe(WB);
    expect(closeDoor(st, 19, 29, () => 0, () => false)).toBe(true);  // 点左列关
    expect(st.get(20, 27)).toBe(DOOR);
    expect(st.get(20, 29)).toBe(DOOR);
    expect(st.get(21, 29)).toBe(WB);                    // ★曾在此被清
    expect(st.get(22, 29)).toBe(WB);
  });

  it('墓碑(死过一次掉门口):同样全周期无损', () => {
    const w = trapWorld(TOMB, 2, 18);
    const st = w.store;
    expect(openDoor(st, 20, 29, -1)).toBe(true);
    expect(closeDoor(st, 20, 29, () => 0, () => false)).toBe(true);  // 点右列关
    expect(st.get(21, 29)).toBe(TOMB);
    expect(st.get(22, 29)).toBe(TOMB);
  });

  it('朝家具侧开门仍拒绝(原版 OpenDoor 门禁)', () => {
    const w = trapWorld(WB, 2, 18);
    expect(openDoor(w.store, 20, 29, 1)).toBe(false);
    expect(w.store.get(21, 29)).toBe(WB);
  });
});
