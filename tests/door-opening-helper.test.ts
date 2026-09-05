// ★SW-AS1 2026-09-05 DoorOpeningHelper 普通门自动开关全量移植回归（TileStore 演算,不实例化 Game）。
// 原版:DoorOpeningHelper.cs CommonDoorOpeningInfoProvider :57-142 / Update :239-250 /
//  GetPlayerInfoForOpeningDoor :318-352 / Player.GetAutoDoorVelocityContribution :24534-24540。
import { describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T } from '../src/data/tiles';
import { DoorOpeningHelper, commonDoorProvideAnchor, commonDoorTryOpenDoor, commonDoorTryCloseDoor,
  getAutoDoorVelocityContribution, type DoorHelperPlayerView } from '../src/world/DoorOpeningHelper';

const T10 = T.DOOR_CLOSED, T11 = T.DOOR_OPEN;
const mkDoor = (st: TileStore, x = 30, y = 40) => {
  for (let dy = 0; dy < 3; dy++) st.setTileSilent(x, y + dy, T10, 0, dy * 18);   // style 0 闭门
};
const view = (o: Partial<DoorHelperPlayerView> = {}): DoorHelperPlayerView => ({
  x: 460, y: 640, w: 20, h: 42, vx: 0, gravDir: 1, controlLeft: false, controlRight: false,
  velocityContribution: 0, usingGamepad: false, ...o });

describe('普通门自动开关（DoorOpeningHelper 全量移植）', () => {
  it('ProvideInfo 锚格归一 + TryOpenDoor 双向重试 + 垂直容纳拒绝', () => {
    const st = new TileStore(64, 128); mkDoor(st);
    expect(commonDoorProvideAnchor(st, 30, 41)).toEqual([30, 40]);        // :63 frameY%54/18
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(29, 40 + dy, 1, 0, 0);   // 左侧堵石
    // 首试 dir=-1 被堵(tile 仍 10)→ 换 -dir=+1 开成（:94-105）
    expect(commonDoorTryOpenDoor(st, 30, 40, -1, 1, { x: 462, y: 641, w: 20, h: 40 })).toBe(true);
    expect(st.get(30, 40)).toBe(T11);
    const st2 = new TileStore(64, 128); mkDoor(st2);
    // 站门顶:收缩盒 599..639 与门盒 640..704 不相交 → 拒（:86-93,不开脚下门）
    expect(commonDoorTryOpenDoor(st2, 30, 40, 1, 1, { x: 462, y: 598, w: 20, h: 40 })).toBe(false);
    expect(st2.get(30, 40)).toBe(T10);
  });

  it('TryCloseDoor 结果面:贴边不关/远离关成(带音)/被拆失效/足印被堵', () => {
    const st = new TileStore(64, 128); mkDoor(st);
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(30, 40 + dy, T11, 0, dy * 18);   // 开门态
    const sfx: string[] = [];
    expect(commonDoorTryCloseDoor(st, 30, 40, { x: 482, y: 640, w: 20, h: 42 }, (n) => sfx.push(n)))
      .toBe('stillInDoorArea');                                            // :129-133 足印 479..497 内
    expect(commonDoorTryCloseDoor(st, 30, 40, { x: 600, y: 640, w: 20, h: 42 }, (n) => sfx.push(n)))
      .toBe('closedDoor');                                                 // :134-139 远离 → 关成
    expect(st.get(30, 40)).toBe(T10);
    expect(sfx).toEqual(['door_close']);                                   // CloseDoor :32197 SoundID 9
    expect(commonDoorTryCloseDoor(st, 30, 40, { x: 600, y: 640, w: 20, h: 42 }))
      .toBe('doorIsInvalidated');                                          // :112-116 type 已非 11
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(30, 40 + dy, T11, 0, dy * 18);
    expect(commonDoorTryCloseDoor(st, 30, 40, { x: 600, y: 640, w: 20, h: 42 },
      undefined, () => true)).toBe('failedToCloseDoor');                   // :140 EmptyTile 被堵
  });

  it('update 端到端:走近开门→走过关门;偏好三档(Enabled/GamepadOnly/Disabled)', () => {
    const st = new TileStore(64, 128); mkDoor(st);
    const h = new DoorOpeningHelper();
    h.update(st, view({ controlRight: true, velocityContribution: 0.5 }));   // num3=ceil(1.5)=2 → 开
    expect(st.get(30, 40)).toBe(T11);
    expect(h.isTrackingOpenDoor(30, 40)).toBe(true);
    h.update(st, view({ x: 504 }));                                          // 足印 479..497 外 → 关
    expect(st.get(30, 40)).toBe(T10);
    expect(h.isTrackingOpenDoor(30, 40)).toBe(false);
    for (const [pref, open] of [['enabled', true], ['gamepadOnly', false], ['disabled', false]] as const) {
      const si = new TileStore(64, 128); mkDoor(si);
      const hi = new DoorOpeningHelper(); hi.preference = pref;
      hi.update(si, view({ controlRight: true, velocityContribution: 0.5 }));   // gamepadOnly+无手柄/Disabled 不开
      expect(si.get(30, 40)).toBe(open ? T11 : T10);
    }
  });

  it('velocity-alone 窗(无输入前伸) + 滚轮鞋 3f 钳', () => {
    const st = new TileStore(64, 128); mkDoor(st);
    const h = new DoorOpeningHelper();
    h.allowOpeningDoorsByVelocityAloneForATime(60);                        // :234 注入窗
    h.update(st, view({ x: 460, vx: 5, velocityContribution: 5 }));        // num3=5 → 盒 465..485 触门
    expect(st.get(30, 40)).toBe(T11);
    const st2 = new TileStore(64, 128); mkDoor(st2);
    new DoorOpeningHelper().update(st2, view({ x: 460, vx: 5 }));          // 窗尽:num2 清零 → 不前伸不开
    expect(st2.get(30, 40)).toBe(T10);
    expect(getAutoDoorVelocityContribution(2.5, true, 57)).toBe(3);        // :24537-24539
    expect(getAutoDoorVelocityContribution(-2.5, true, 58)).toBe(-3);
    expect(getAutoDoorVelocityContribution(5, true, 57)).toBe(5);          // ≥3 不钳
    expect(getAutoDoorVelocityContribution(2.5, true, 8)).toBe(2.5);       // 非滚轮鞋
  });
});
