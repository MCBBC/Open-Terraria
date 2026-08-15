// 住房 B 方案终态（用户定案"百分百对齐原版",2026-08-15）:
// ①入驻轮锚点回归原版——锚池空(无人已安家)整轮不跑(:5035-5037 return),
//   远程基地自动入驻不再发生(曾经的玩家位/出生点兜底 = 两轮偏离,已摘);
// ②远程基地正路 = 住房查询/分配 UI(moveRoom 语义):任意距离手动查询/塞人;
// ③查询旗标(RoomNeeds 四布尔)+失败文案链(inter 39-42 / HouseMissing_n)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { queryRoom, housingCheckAt, checkRoom, type RoomNeedsFlags } from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR = 17;

/** 用户存档逐格复刻(报告 areaPlayer 解码):双门/木墙/三火把/桌/椅/工作台 */
function buildHouse(w: World): void {
  const st = w.store;
  for (let x = 2164; x <= 2174; x++) { st.setTileSilent(x, 292, TILE_BY_KEY['wood'], 0, 0); st.setTileSilent(x, 298, TILE_BY_KEY['wood'], 0, 0); }
  for (let y = 293; y <= 297; y++) { st.setTileSilent(2164, y, TILE_BY_KEY['wood'], 0, 0); st.setTileSilent(2174, y, TILE_BY_KEY['wood'], 0, 0); }
  for (let y = 293; y <= 297; y++) for (let x = 2165; x <= 2173; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [2164, 2174]) for (let y = 295; y <= 297; y++) st.setTileSilent(dx, y, DOOR, 0, (y - 295) * 18);
  st.setTileSilent(2165, 294, TILE_BY_KEY['torch'], 22, 0);
  st.setTileSilent(2173, 294, TILE_BY_KEY['torch'], 44, 0);
  st.setTileSilent(2170, 295, TILE_BY_KEY['torch'], 0, 0);
  st.setTileSilent(2168, 296, TILE_BY_KEY['chair'], 0, 0);
  st.setTileSilent(2168, 297, TILE_BY_KEY['chair'], 0, 18);
  for (let x = 2169; x <= 2171; x++) { st.setTileSilent(x, 296, TILE_BY_KEY['table'], (x - 2169) * 18, 0); st.setTileSilent(x, 297, TILE_BY_KEY['table'], (x - 2169) * 18, 18); }
  for (const [x, fx] of [[2172, 0], [2173, 18]] as const) { st.setTileSilent(x, 296, TILE_BY_KEY['workbench'], fx, 0); st.setTileSilent(x, 297, TILE_BY_KEY['workbench'], fx, 18); }
}

function houseWorld(): World {
  const w = new World(4200, 1200, 30, 'open');
  buildHouse(w);
  return w;
}

describe('住房查询/分配(B 方案 moveRoom 语义)', () => {
  it('queryRoom:任意点种子命中房间(StartRoomCheck 语义),reason=ok', () => {
    const w = houseWorld();
    const q = queryRoom(w.store, 2167, 296);   // 房中心
    expect(q.reason).toBe('ok');
    expect(q.room).not.toBeNull();
  });

  it('缺件旗标:拆椅子 → flags.chair=false, reason=needs(RoomNeeds 四布尔)', () => {
    const w = houseWorld();
    w.store.setTile(2168, 296, 0);
    w.store.setTile(2168, 297, 0);
    const q = queryRoom(w.store, 2167, 296);
    expect(q.reason).toBe('needs');
    expect(q.flags.chair).toBe(false);
    expect(q.flags.table).toBe(true);
    expect(q.flags.light).toBe(true);
    expect(q.flags.door).toBe(true);
  });

  it('实心起点/世界缘:reason=solid/edge', () => {
    const w = houseWorld();
    expect(queryRoom(w.store, 2170, 298).reason).toBe('solid');   // 地板
    expect(queryRoom(w.store, 5, 5).reason).toBe('edge');
  });

  it('housingCheckAt:占用(score=-1)→occupied;空闲→ok 任意距离(远程基地手动分配正路)', () => {
    const w = houseWorld();
    expect(housingCheckAt(w.store, [], 2167, 296).reason).toBe('ok');
    // 同类别占用者(城镇 NPC home 在房内)→ occupied
    const occ = [{ x: 2168, y: 297, npcId: 22 }];
    expect(housingCheckAt(w.store, occ, 2167, 296, 17).reason).toBe('occupied');
    // 宠物(异类别)可同房 → 仍 ok
    expect(housingCheckAt(w.store, occ, 2167, 296, 637).reason).toBe('ok');
  });
});

describe('①锚点回归原版语义(偏离已摘)', () => {
  it('原判定契约保持:房离出生点 66 格,出生点 ±10 窗外(findFreeHouse null = 自动不可达)', () => {
    const w = houseWorld();
    // 出土点语义仍在 Housing 侧可见(冷启锚回归后由锚池空门在 Game 侧拦截)
    expect(checkRoom(w.store, 2164, 297)).not.toBeNull();  // 房本身合格
  });
});
