// 锁定门硬闸门（2026-08-13）：isLockedDoor 内部 id 空间修复的回归。
// 背景：Door.ts 曾写 st.type[i]===10——10 是原版 sheet id,TileStore 存内部 id
// （door_closed=17）→ 恒 false → 神庙锁门无钥匙可开、unlockDoor 永不生效。
// 权威：WorldGen.cs:69248（type==10 && frameY∈[594,646] && frameX<54）；
// PlaceDoor(:31938) style→帧映射；TemplePass 锁门=style 11(:34199)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { T } from '../src/data/tiles';
import { placeDoorClosed, doorClosedFrame, doorStyleOf, isLockedDoor, unlockDoor } from '../src/world/Door';

describe('锁定门链（isLockedDoor/unlockDoor/帧映射）', () => {
  const w = new World(20, 20, 7, 'locked-door-test');
  const st = w.store;

  it('style 11 三格均判定为锁（含中/底格——Game.ts 锁段扫描覆盖点击任意格）', () => {
    placeDoorClosed(st, 5, 5, 11);
    for (let dy = 0; dy < 3; dy++) {
      expect(isLockedDoor(st, 5, 5 + dy), `格(5,${5 + dy}) 应为锁`).toBe(true);
    }
  });

  it('style 12/13/16 非锁（神庙解锁门/地牢门/蓝地牢门）', () => {
    placeDoorClosed(st, 7, 5, 12);
    placeDoorClosed(st, 9, 5, 13);
    placeDoorClosed(st, 11, 5, 16);
    for (const x of [7, 9, 11]) {
      for (let dy = 0; dy < 3; dy++) {
        expect(isLockedDoor(st, x, 5 + dy), `格(${x},${5 + dy}) 不应为锁`).toBe(false);
      }
    }
  });

  it('unlockDoor 三格 frameY+54 出锁区后判定解锁', () => {
    expect(unlockDoor(st, 5, 6)).toBe(true);          // 点中格也能扫到顶格
    for (let dy = 0; dy < 3; dy++) {
      expect(isLockedDoor(st, 5, 5 + dy), `解锁后(${5 + dy})`).toBe(false);
    }
    expect(st.frameY[st.idx(5, 5)]).toBe(594 + 54);   // 648 = style 12 帧（锁机制=移出区间）
  });

  it('门帧映射对齐 PlaceDoor(:31938)：style13→fy702 / style17→fy918', () => {
    expect(doorClosedFrame(13)).toEqual([0, 702]);
    expect(doorClosedFrame(17)).toEqual([0, 918]);
    expect(doorClosedFrame(13, 2)).toEqual([36, 702]);  // 变体列 +36
    expect(doorStyleOf(36, 720)).toBe(13);              // 中格反推同 style
  });

  it('门内部 id 空间守恒：TileStore 中关门恒为 T.DOOR_CLOSED（防再写 sheet id 比较值）', () => {
    expect(T.DOOR_CLOSED).not.toBe(10);   // sheet id 10 ≠ 内部 id；此断言炸=常量表重排，全量复查
    expect(st.type[st.idx(5, 5)]).toBe(T.DOOR_CLOSED);
  });
});
