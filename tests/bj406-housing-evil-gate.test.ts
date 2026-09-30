/**
 * BJ406（2026-09-23 用户实报「腐化/猩红环境下的房屋仍然可以入住 NPC」）定谳锁。
 *
 * 定谳锚（Terarria1457 亲读）：
 *  · 环境门唯一形态 = ScoreRoom 邪恶罚分（WorldGen.cs:5809-5829）：num3 =
 *    腐+猩−5×向日葵−圣（GetTileTypeCountByCategory TotalGoodEvil cs:5767-5791,
 *    计数域 = 房间包围盒外扩 ±46/±44 盒 GetTestedRoomBounds cs:5929-5951 +
 *    CountTileTypesInArea cs:5753-5765 [startX+1..endX-1]×[startY+2..endY+1],
 *    只数 active tile 不数墙）；num3<50 清零（cs:5816-5818）、base=50−num3、
 *    num2<=−250 整房作废（cs:5825-5829）。
 *  · 三受理门唯一否决位 = hiScore>0，roomEvil 仅为 hiScore≤0 时的文案选择器：
 *    QuickFindHome cs:5692-5713 / SpawnTownNPC cs:5356-5360 / MoveTownNPC
 *    cs:4719-4747（occupied→evil→无站位→缺件 文案序）。
 *  · moveOut = 复核链 QuickFindHome 失败 → homeless=true（cs:5705-5713 两 else 支,
 *    写位 :5707/:5712；每 7200t 对 !homeless 全员重跑 = Main.cs:66526-66534 门
 *    （checkForSpawns<7200/worldUpdateRate :66529）+ :66590-66592 调用
 *    （★清偿刀 P4 锚勘误 2026-09-30:旧引 Main.cs:65088-65092 漂移,1457 亲读复核;
 *    夜扫 UnspawnHomelessNPC = :66022-66024）。
 *  · 本仓病灶层 = housingCheckAt 曾把 roomEvil 恒作否决位（比原版严一格：
 *    evilNet∈[50,300) 且站位分>0 的腐化带装饰房,原版放行,本仓手动分配被拒）。
 *    ——本文件 T5 锁刀;T1-T4/T6-T7 锁环境门本体与 moveOut。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  housingCheckAt, quickFindHome, acceptTownNPCAtHouse, scoreRoom, queryRoom,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const WOOD = TILE_BY_KEY['wood']!;            // sheet 30
const DOOR_C = TILE_BY_KEY['door_closed']!;   // sheet 10
const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block']!;   // sheet 25（腐化计数表成员）
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block']!;  // sheet 203（猩红计数表成员）

/** 标准小房 ox..ox+10 × oy..oy+5（同 sw-bj2 形态：双门/双炬/桌/椅,含水背景墙） */
function buildHouse(w: World, ox: number, oy: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, WOOD, 0, 0);
    st.setTileSilent(x, oy + 5, WOOD, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, WOOD, 0, 0);
    st.setTileSilent(ox + 10, y, WOOD, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [ox, ox + 10]) {
    for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  }
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

/** 房间下方铺 count 格邪恶块（不接触房体,全落在外扩计数盒 ±44 内） */
function evilRing(w: World, ox: number, oy: number, count: number, t: number): void {
  const st = w.store;
  let placed = 0;
  for (let y = oy + 7; y <= oy + 44 && placed < count; y++) {
    for (let x = ox; x <= ox + 10 && placed < count; x++) {
      st.setTileSilent(x, y, t, 0, 0);
      placed++;
    }
  }
}

describe('BJ406 腐化/猩红房屋环境门（ScoreRoom 邪恶罚分 1:1）', () => {
  it('T1 正常房间照入：无邪恶块 → housingCheckAt ok + quickFindHome 安家', () => {
    const w = new World(4200, 1200, 401, 'open');
    buildHouse(w, 2000, 300);
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('ok');
    expect(q.score).toBeGreaterThan(0);
    const r = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r.noop).toBe(false);
    expect(r.home).not.toBeNull();
  });

  it('T2 腐化房间拒入（≥300 黑曜石=base≤−250 硬拒带）：三门全拒 + evil 文案档', () => {
    const w = new World(4200, 1200, 402, 'open');
    buildHouse(w, 2000, 300);
    evilRing(w, 2000, 300, 300, EBONSTONE);
    // RoomScore 直接对表：roomEvil 置位 + 罚分后无正分站位
    const qr = queryRoom(w.store, 2005, 303);
    expect(qr.room).not.toBeNull();
    const s = scoreRoom(w.store, qr.room!, [], -1);
    expect(s.roomEvil).toBe(true);
    expect(s.score).toBeLessThanOrEqual(0);
    // 手动分配门（housingCheckAt）→ 'evil'（hiScore≤0 文案序:occupied→evil）
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('evil');
    // 自动门（QuickFindHome）与受理核（SpawnTownNPC 面）同拒
    const r = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r.home).toBeNull();
    const acc = acceptTownNPCAtHouse(w.store, [], 2005, 303, 22);
    expect(acc.ok).toBe(false);
  });

  it('T3 阈值边界（49 格=num3<50 清零带）：零罚分,房照常合格（WorldGen.cs:5816-5818）', () => {
    const w = new World(4200, 1200, 403, 'open');
    buildHouse(w, 2000, 300);
    evilRing(w, 2000, 300, 49, EBONSTONE);
    const qr = queryRoom(w.store, 2005, 303);
    expect(qr.room).not.toBeNull();
    const s = scoreRoom(w.store, qr.room!, [], -1);
    expect(s.roomEvil).toBe(false);      // 清零后 num3=0 → roomEvil 不置位
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('ok');
    const r = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r.home).not.toBeNull();
  });

  it('T4 已入住被腐化 → 原版 moveOut 语义：复核链 QuickFindHome 失败转 homeless（cs:5705-5713）', () => {
    const w = new World(4200, 1200, 404, 'open');
    buildHouse(w, 2000, 300);
    // 入住（①''/① 同调用形：锚=homeTile 地板行）
    const r1 = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r1.home).not.toBeNull();
    // 腐化蔓延至房屋（≥300 硬拒带）
    evilRing(w, 2000, 300, 300, EBONSTONE);
    // 下一入驻轮复核（Main.cs:65088-65092 每 7200t 等价调用）→ 拒 → homeless
    const r2 = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r2.noop).toBe(false);
    expect(r2.home).toBeNull();
  });

  it('T5 ★BJ406 定谳刀：腐化带装饰房（evilNet∈[50,300) 且站位分>0）→ 受理（roomEvil 仅文案档）', () => {
    const w = new World(4200, 1200, 405, 'open');
    buildHouse(w, 2000, 300);
    evilRing(w, 2000, 300, 60, EBONSTONE);   // 60 格：base=−10,房内装饰把站位分顶正
    const qr = queryRoom(w.store, 2005, 303);
    expect(qr.room).not.toBeNull();
    const s = scoreRoom(w.store, qr.room!, [], -1);
    expect(s.roomEvil).toBe(true);           // 罚分带内 roomEvil 置位（cs:5821-5824）
    expect(s.score).toBeGreaterThan(0);      // 装饰充足 → 站位分>0（本夹具实测 5）
    // 刀面：hiScore>0 = 原版唯一受理条件 → 手动分配门放行（旧实现此处 'evil' 恒拒）
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('ok');
    // 自动门同文受理（QuickFindHome cs:5692 `hiScore > 0`）
    const r = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r.home).not.toBeNull();
  });

  it('T6 猩红同门（≥300 血腥石）：三门全拒（TotalGoodEvil 猩红表 cs:5775-5776）', () => {
    const w = new World(4200, 1200, 406, 'open');
    buildHouse(w, 2000, 300);
    evilRing(w, 2000, 300, 300, CRIMSTONE);
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('evil');
    const r = quickFindHome(w.store, [], 2005, 304, 22);
    expect(r.home).toBeNull();
    const acc = acceptTownNPCAtHouse(w.store, [], 2005, 303, 22);
    expect(acc.ok).toBe(false);
  });

  it('T7 神圣不拒（Hallow 为净减项）：≥300 神圣块房照常合格（cs:5777-5786）', () => {
    const w = new World(4200, 1200, 407, 'open');
    buildHouse(w, 2000, 300);
    const pearl = TILE_BY_KEY['v_117_pearlstone_block']!;   // sheet 117（神圣表成员）
    evilRing(w, 2000, 300, 300, pearl);
    const qr = queryRoom(w.store, 2005, 303);
    expect(qr.room).not.toBeNull();
    const s = scoreRoom(w.store, qr.room!, [], -1);
    expect(s.roomEvil).toBe(false);          // 圣为负项,num3 不升
    const q = housingCheckAt(w.store, [], 2005, 303);
    expect(q.reason).toBe('ok');
  });
});
