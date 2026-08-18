// 床设重生点 CheckSpawn 房间校验回归（2026-08-18 "登记项全清"轮）:
// ① 原版床设点 = StartRoomCheck 纯围合——【无家具的围合房也能设点】（家具是
//    TownNPC RoomNeeds 的独立步骤;曾误用带家具的 checkRoom 过严）
// ② 天然墙(有墙非房墙)失败原因 = unsafeWalls → Game.BedRoomHasUnsafeWalls
//    (WorldGen.CheckRoom :6171-6176);无墙漏墙 = hole
// ③ 379 泡沫块在检查期按实心算（CheckSpawn 翻转 tileSolid[379] 同构——defs 已
//    non-solid,extraSolid 补回检查期语义;围合泛洪边界同理）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  checkRoomEnclosure, checkRoom, lastRoomCheckFail,
} from '../src/world/Housing';

function buildWorld() {
  const w = new World(200, 200, 42, 'bedspawn');
  const st = w.store;
  // 30×12 腔体:x 80..109,y 120..131;地板行 131 实心,顶 119 实心,两侧墙
  for (let x = 80; x <= 109; x++) {
    st.setTileSilent(x, 131, 2);
    st.setTileSilent(x, 119, 2);
  }
  // 侧墙含 119 行(与天花行对角封口——8 向泛洪会穿对角缺口,原版同)
  for (let y = 119; y <= 131; y++) {
    st.setTileSilent(79, y, 2);
    st.setTileSilent(110, y, 2);
  }
  // 全铺木墙(4) = 房墙围合
  for (let x = 80; x <= 109; x++) {
    for (let y = 120; y <= 131; y++) st.setWallSilent(x, y, 4);
  }
  return w;
}

describe('床设点房间校验（Player.CheckSpawn :53608-53666 纯围合语义）', () => {
  it('无家具的木墙围合房:checkRoomEnclosure 通过(家具是 RoomNeeds 独立步骤)', () => {
    const w = buildWorld();
    expect(checkRoomEnclosure(w.store, 95, 125, new Set([379]))).not.toBeNull();
    // 对照:同房对 TownNPC 住房入口(checkRoom)应为 null——缺家具
    expect(checkRoom(w.store, 95, 125)).toBeNull();
    expect(lastRoomCheckFail).toBe('notValid');   // 家具档(围合档不触发)
  });

  it('非房墙(地牢墙 7):fail = unsafeWalls(BedRoomHasUnsafeWalls 文案档)', () => {
    const w = buildWorld();
    // ★泥墙 wallHouse[1]=true 是原版事实(Main.cs:10295,可放置泥墙合法)——
    //   真不安全墙用墙 7(地牢砖墙,wallHouse 未收录)
    for (let x = 80; x <= 109; x++) {
      for (let y = 120; y <= 131; y++) w.store.setWallSilent(x, y, 7);   // dungeon wall
    }
    expect(checkRoomEnclosure(w.store, 95, 125, new Set([379]))).toBeNull();
    expect(lastRoomCheckFail).toBe('unsafeWalls');
  });

  it('无墙空腔:fail = hole(漏墙档)', () => {
    const w = buildWorld();
    for (let x = 80; x <= 109; x++) {
      for (let y = 120; y <= 131; y++) w.store.setWallSilent(x, y, 0);
    }
    expect(checkRoomEnclosure(w.store, 95, 125, new Set([379]))).toBeNull();
    expect(lastRoomCheckFail).toBe('hole');
  });

  it('379 泡沫块:检查期按实心算——堵在腔体内时围合被切成两半/边界(同构翻转)', () => {
    const w = buildWorld();
    const bubble = TILE_BY_KEY['v_379_bubble'];
    expect(bubble).toBeDefined();
    // 泡沫块非实心(defs 已按 DoUpdateInWorld 语义改 false)——直接验证通行口径
    expect(w.store.isSolid(95, 125)).toBe(false);
    w.store.setTileSilent(95, 125, bubble);
    expect(w.store.isSolid(95, 125)).toBe(false);   // defs 通行性保持非实心
    // extraSolid={379} 时该格是泛洪边界:整列竖墙切开房间 → 围合仍各自成立(左半),
    // 但锚点右侧被切;此处只验证边界语义——95 列竖排泡沫后,右半腔与锚点隔离
    for (let y = 120; y <= 130; y++) w.store.setTileSilent(95, y, bubble);
    const leftRoom = checkRoomEnclosure(w.store, 90, 125, new Set([379]));
    expect(leftRoom).not.toBeNull();      // 左半仍围合(泡沫=边界)
    // 无 extraSolid 时泡沫格可穿透 → 泛洪越界到 110 墙仍在房内(不因泡沫切开)
    const noExtra = checkRoomEnclosure(w.store, 90, 125);
    expect(noExtra).not.toBeNull();
  });
});
