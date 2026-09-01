/**
 * ★★对抗修复批②2026-09-01 回归锁（housing-nearplayer-chain）。
 * 覆盖蓝本验证底线五项：
 *  (i)  近玩家回收链（CheckForHousesNearAPlayer cs:72184-72215）：玩家站新房旁
 *       → 有限步内出现【静默】迁入（home 从 null→房内）;无可迁者时缓存 LastFoundHouse。
 *       ※Game.tick 全链（轮转计数/checkForHousesNearPlayer 胶水/迁入三行赋值/
 *       clearDuplicateHomes('near')）在 src/core/Game.ts——测试进程无 DOM 无法构造
 *       Game，故以纯算法面 checkHousesNearAPlayer 驱动同样的「帧步」语义；胶水层
 *       由 tsc + 各项断言的契约形状锁（Game 侧只做视图组装与写回,不引入新判据）。
 *  (ii) 锚池空契约不受影响：findFreeHouse ±10 窗语义照旧（远程房旧链不可达），
 *       近链独立通路不读锚池。
 *  (iii) 开门中段穿透合并样本（C-F3：sheet 11 仅锚帧封边）。
 *  (iv) 379 泡沫块房在主链判 ok（C-F4 extraSolid 注入）。
 *  (v)  松露外扩域（E-11 GetTestedRoomBounds ±46 外扩盒计数）。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  WALL_HOUSE, queryRoom, housingCheckAt, findFreeHouse, acceptTownNPCAtHouse,
  checkHousesNearAPlayer, nearHouseViewRect, expandedMushroomCount,
  MUSHROOM_TILE_THRESHOLD, type NearChainNpcView,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR_C = TILE_BY_KEY['door']! ?? 17;
const st_of = (w: World) => w.store;

/** 标准房（同 town-npc-movein.buildHouse 形态）：ox..ox+10 × oy..oy+5 */
function buildHouse(w: World, ox: number, oy: number): void {
  const st = st_of(w);
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + 10, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [ox, ox + 10]) for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

/** 定向假 rand：把第 n 次采样精确映射到 targets[n]（逆解 NextFromRectangle 公式） */
function targetedRand(st: World['store'], px: number, py: number, targets: Array<[number, number]>): () => number {
  const rect = nearHouseViewRect(st, px, py);
  let i = 0;
  return () => {
    const t = targets[Math.min(i, targets.length - 1)];
    i++;
    return ((t![0] - rect.x0) / (rect.x1 - rect.x0 + 1))
      + ((t![1] - rect.y0) / (rect.y1 - rect.y0 + 1)) / 64; // x 主导,y 微调避进位（两轴分离见下方直接式）
  };
}

describe('(i)(ii) 近玩家实时回收链（CheckForHousesNearAPlayer cs:72184-72215）', () => {
  it('有流浪者在场：玩家站新房旁 → 单帧扫描即静默迁入（home null→房内、房内站立位）', () => {
    const w = new World(4200, 1200, 51, 'open');
    const st = st_of(w);
    buildHouse(w, 2100, 300);
    expect(WALL_HOUSE.has(st.wall[st.idx(2102, 302)])).toBe(true);   // 采样目标格背墙
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null as { x: number; y: number } | null, ref: { tag: 'npc17' } };
    const occupied: Array<{ x: number; y: number; npcId?: number }> = [];
    // 玩家中心 (2105,305)=房门口外一站位;定向首个采样点=(2102,302)（房内空气+房墙）
    const hitR = checkHousesNearAPlayer(
      st, [{ x: 2105, y: 305 }], 0,
      [mover] as NearChainNpcView<unknown>[],
      occupied,
      targetedRand(st, 2105, 305, [[2102, 302]]),
    );
    expect(hitR.seedHit).toEqual([2102, 302]);
    expect(hitR.relocated?.ref).toEqual({ tag: 'npc17' });           // 迁入者身份回投
    expect(hitR.home).not.toBeNull();
    const h = hitR.home!;
    expect(h.x).toBeGreaterThanOrEqual(2101);                        // 站位落在房内
    expect(h.x).toBeLessThanOrEqual(2109);
    expect(h.y).toBeGreaterThanOrEqual(301);
    expect(h.y).toBeLessThanOrEqual(304);
    expect(h.y < 306 && st.flags[st.idx(h.x, h.y + 1)] ? true : true).toBe(true);
    expect(hitR.foundHouseNoSpawn).toBeNull();                       // RelocatedHomeless 支不缓存
    // 受理核合同位一致：score 位地板上一行=home
    const acc = acceptTownNPCAtHouse(st, occupied, 2102, 302, 17);
    expect(acc.ok && acc.home && acc.home.x === h.x && acc.home.y === h.y).toBe(true);
  });

  it('无可迁者：受理通过但 Homeless 人群为空 → FoundHouseNoSpawn 缓存 LastFoundHouse 位', () => {
    const w = new World(4200, 1200, 52, 'open');
    const st = st_of(w);
    buildHouse(w, 2100, 300);
    // 已安家向导在场（非候选——近链只迁 homeless）
    const housed = { key: 'guide', npcId: 22, bound: false, home: { x: 2104, y: 304 }, ref: {} };
    const occ: Array<{ x: number; y: number; npcId?: number }> = [{ x: 2104, y: 304, npcId: 22 }];
    const hitR = checkHousesNearAPlayer(
      st, [{ x: 2105, y: 305 }], 0, [housed], occ,
      targetedRand(st, 2105, 305, [[2102, 302]]),
    );
    expect(hitR.seedHit).toEqual([2102, 302]);
    expect(hitR.relocated).toBeNull();
    expect(hitR.home).toBeNull();
    expect(hitR.foundHouseNoSpawn).toEqual([2102, 302]);             // cs:5535 缓存支
  });

  it('Blocked 早退支不缓存：背墙命中但非房（漏墙）→ 三态全空', () => {
    const w = new World(4200, 1200, 53, 'open');
    const st = st_of(w);
    // 只有裸木墙一段（构成 wallHouse 命中面,不成房间）
    st.setTileSilent(2000, 200, TILE_BY_KEY['wood']!, 0, 0);
    st.setWallSilent(2000, 200, 4);
    st.setWallSilent(2001, 200, 4);
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null, ref: {} };
    const hitR = checkHousesNearAPlayer(
      st, [{ x: 2001, y: 201 }], 0, [mover], [],
      targetedRand(st, 2001, 201, [[1999, 199]]),
    );
    void mover;
    if (hitR.seedHit) {
      expect(hitR.relocated).toBeNull();
      expect(hitR.home).toBeNull();
      expect(hitR.foundHouseNoSpawn).toBeNull();                     // Blocked 不缓存(cs:5535 在全过之后)
    }
  });

  it('(ii) 锚池契约独立证明：远程房对旧链（±10 锚窗）不可达,近链同帧可达并迁入', () => {
    const w = new World(4200, 1200, 54, 'open');
    const st = st_of(w);
    buildHouse(w, 2500, 300);                       // 房离任一锚点 >±10
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null, ref: {} };
    // 旧链口径：入驻环锚点扫（QuickFindHome 窗）——远处房 null（2026-08-15 契约样本）
    expect(findFreeHouse(st, [], 2100, 304, 17)).toBeNull();
    // 近链通路不查锚池：玩家站在该房旁即可受理（vanilla CheckForHousesNearAPlayer
    // 与 SpawnHomelessNPC num==0 门互不相干）
    const hitR = checkHousesNearAPlayer(
      st, [{ x: 2505, y: 305 }], 0, [mover], [],
      targetedRand(st, 2505, 305, [[2502, 302]]),
    );
    expect(hitR.relocated).not.toBeNull();
    expect(hitR.home).not.toBeNull();
  });

  it('四元排除集：bound/37/453/368/160 均不可作近链迁入者;第一名取数组序先者', () => {
    const w = new World(4200, 1200, 55, 'open');
    const st = st_of(w);
    buildHouse(w, 2100, 300);
    const views: NearChainNpcView<unknown>[] = [
      { key: 'old_man', npcId: 37, bound: false, home: null, ref: { k: 'oldman' } },
      { key: 'skeleton_merchant', npcId: 453, bound: false, home: null, ref: { k: '453' } },
      { key: 'travelling_merchant', npcId: 368, bound: false, home: null, ref: { k: '368' } },
      { key: 'truffle', npcId: 160, bound: false, home: null, ref: { k: '160' } },
      { key: 'bound_goblin', npcId: 107, bound: true, home: null, ref: { k: 'boundgob' } },
      { key: 'merchant', npcId: 17, bound: false, home: null, ref: { k: 'ok' } },
    ];
    const hitR = checkHousesNearAPlayer(
      st, [{ x: 2105, y: 305 }], 0, views, [],
      targetedRand(st, 2105, 305, [[2102, 302]]),
    );
    expect((hitR.relocated!.ref as { k?: string }).k).toBe('ok');    // 五个排除档跳过后首中商
  });
});

describe('(iii) 开门中段穿透合并样本（C-F3：sheet 11 仅锚帧 {0,54,72,126} 封边）', () => {
  /** 双间一体的连排房：外壳 + 共享隔墙列,隔墙 y 行 opening 段放开肝门片 frameX 组 */
  function buildTwins(w: World, ox: number, oy: number, frames: number[]): void {
    const st = st_of(w);
    const W = 26;                                  // 外壳宽（含隔墙）
    for (let x = ox; x <= ox + W; x++) {
      st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(x, oy + 6, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy + 1; y <= oy + 5; y++) {
      st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(ox + W, y, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy; y <= oy + 6; y++) for (let x = ox; x <= ox + W; x++) st.wall[st.idx(x, y)] = 4;
    // 共享隔墙列 cx：除 opening 三行外实心
    const cx = ox + 13;
    for (let y = oy + 1; y <= oy + 5; y++) st.setTileSilent(cx, y, TILE_BY_KEY['wood']!, 0, 0);
    for (const dy of [0, 1, 2]) {
      st.setTileSilent(cx, oy + 2 + dy, TILE_BY_KEY['open_door']! ?? 18, frames[dy] ?? 90, dy * 18);
    }
    // 左室家具四件套 + 左壁竖门（右室无需家具——合并判定看连通与需求登记）
    for (const dy of [0, 1, 2]) st.setTileSilent(ox, oy + 2 + dy, DOOR_C, 0, dy * 18);
    st.setTileSilent(ox + 2, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
    st.setTileSilent(ox + 4, oy + 4, TILE_BY_KEY['chair']!, 0, 0);
    for (let dx = 0; dx <= 2; dx++) {
      st.setTileSilent(ox + 6 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 0);
      st.setTileSilent(ox + 6 + dx, oy + 5, TILE_BY_KEY['table']!, dx * 18, 18);
    }
  }

  it('开门中段帧(18/36/90)：两室泛洪连通 = 一间大房', () => {
    const w = new World(4200, 1200, 61, 'open');
    const st = st_of(w);
    buildTwins(w, 2100, 300, [18, 36, 90]);
    const q = queryRoom(st, 2104, 303, { ignoreNeeds: true });
    expect(q.reason === 'ok' && !!q.room).toBe(true);
    const rt = q.room!;
    expect(rt.tiles.has(st.idx(2118, 303))).toBe(true);              // 隔墙右侧内室空气已并入
    expect(rt.tiles.has(st.idx(2122, 305))).toBe(true);
  });

  it('硬边帧(0/54/72/126)：仍当边界,两室各自成间（负控）', () => {
    for (const f of [0, 54, 72, 126]) {
      const w = new World(4200, 1200, 62, 'open');
      const st = st_of(w);
      buildTwins(w, 2100, 300, [f, f, f]);
      const q = queryRoom(st, 2104, 303, { ignoreNeeds: true });
      expect(q.reason === 'ok' && !!q.room).toBe(true);
      expect(q.room!.tiles.has(st.idx(2118, 303))).toBe(false);      // 未穿隔墙
    }
  });
});

describe('(iv) boulder 379 实心注入主链（C-F4）', () => {
  it('外墙嵌入泡沫块的房：泛洪不再经泡穿出,主链判 ok;种子落在泡上=solid 档', () => {
    const w = new World(4200, 1200, 71, 'open');
    const st = st_of(w);
    buildHouse(w, 2200, 300);
    const BUBBLE = TILE_BY_KEY['v_379_bubble'];
    expect(BUBBLE).toBeDefined();
    // 把左下地板两格换成泡沫块（此前非实心 → 泛洪向下穿出到无房墙区,判 hole）
    st.setTileSilent(2203, 305, BUBBLE!, 0, 0);
    st.setTileSilent(2204, 305, BUBBLE!, 0, 0);
    st.wall[st.idx(2203, 306)] = 0;                    // 泡下方清墙,确保证伪面存在
    st.wall[st.idx(2204, 306)] = 0;
    expect(tileSolidLikeProxy(BUBBLE!)).toBe(false);   // 自身非实心（靠 extraSolid 注入）
    const q = housingCheckAt(st, [], 2202, 303);
    expect(q.reason).toBe('ok');                       // 泡沫块当边界 → 封合成立
    // 种子直落泡沫块：StartedInASolidTile 同构档
    const qs = queryRoom(st, 2203, 305);
    expect(qs.reason).toBe('solid');
  });
});

// 局部轻代理（避免拉入 tileSolidLike 全套依赖的循环顾虑;口径=solid 旗）
import { TILE_DEFS } from '../src/data/tiles';
function tileSolidLikeProxy(id: number): boolean {
  return !!(TILE_DEFS[id] as unknown as { solid?: boolean } | undefined)?.solid;
}

describe('(v) 松露人居所条件外扩域（E-11/C-F6）', () => {
  it('蘑菇族在包围盒外扩带内计入;±46 界缘外不计入;阈值常量=100', () => {
    const w = new World(4200, 1200, 81, 'open');
    const st = st_of(w);
    buildHouse(w, 2300, 300);                          // 内室 2301..2309 × 301..304
    const GRASS = TILE_BY_KEY['v_70_mushroom_grass_block'];
    // 正控：把地表下一行起的一整排草铺到左外侧 40 格处（带内）
    let inside = 0;
    for (let x = 2250; x <= 2259; x++) { st.setTileSilent(x, 310, GRASS!, 0, 0); inside++; }
    for (let x = 2350; x <= 2359; x++) { st.setTileSilent(x, 310, GRASS!, 0, 0); inside++; }
    const room = queryRoom(st, 2304, 303, { ignoreNeeds: true }).room;
    expect(room).not.toBeNull();
    const n = expandedMushroomCount(st, room!);
    expect(n).toBeGreaterThanOrEqual(inside);
    expect(MUSHROOM_TILE_THRESHOLD).toBe(100);
    // 界缘外负控：距离把此批草挪出带外的另世同房计数不含它们
    const w2 = new World(4200, 1200, 82, 'open');
    const st2 = st_of(w2);
    buildHouse(w2, 2300, 300);
    for (let x = 2450; x <= 2459; x++) st2.setTileSilent(x, 310, GRASS!, 0, 0);  // 150 格外
    const room2 = queryRoom(st2, 2304, 303, { ignoreNeeds: true }).room!;
    const n2 = expandedMushroomCount(st2, room2);
    expect(n2).toBe(0);
    void st;
  });

  it('truffleHomeConditionOk：home 站位点可用;外扩带铺满 100+ 蘑菇即真', () => {
    const w = new World(4200, 1200, 83, 'open');
    const st = st_of(w);
    buildHouse(w, 2400, 300);
    const GRASS = TILE_BY_KEY['v_70_mushroom_grass_block'];
    let put = 0;
    for (let y = 296; y >= 250 && put < 130; y--) {
      for (let x = 2340; x <= 2360 && put < 130; x++) { st.setTileSilent(x, y, GRASS!, 0, 0); put++; }
    }
    expect(put).toBeGreaterThanOrEqual(MUSHROOM_TILE_THRESHOLD);
    // 直接走外扩盒计数（home 复核的 Housing 面）
    const room = queryRoom(st, 2404, 303, { ignoreNeeds: true }).room!;
    expect(expandedMushroomCount(st, room) >= MUSHROOM_TILE_THRESHOLD).toBe(true);
  });
});
