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
 *  (iii) 开门中段穿透合并样本（C-F3：sheet 11 仅锚帧 {0,54,72,126} 封边）。
 *  (iv) 379 泡沫块房在主链判 ok（C-F4 extraSolid 注入）。
 *  (v)  松露外扩域（E-11 GetTestedRoomBounds ±46 外扩盒计数）。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  WALL_HOUSE, queryRoom, housingCheckAt, findFreeHouse, acceptTownNPCAtHouse,
  checkHousesNearAPlayer, nearHouseViewRect, expandedMushroomCount,
  MUSHROOM_TILE_THRESHOLD, tileSolidLike, type NearChainNpcView,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR_C = TILE_BY_KEY['door_closed']!;     // sheet 10（本仓实心边界面）
const DOOR_O = TILE_BY_KEY['door_open']!;       // sheet 11（开门,C-F3 帧规则标的）
const GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const BUBBLE = TILE_BY_KEY['v_379_bubble']!;

/**
 * 角落定向 rand：恒返 0.99999 → NextFromRectangle 首样必落矩形右下角含端点格
 * （floor(r*(span)) = span-1）。调用方把视野矩形的右下角精确摆到目标墙点上，
 * 消除随机性同时不 mock 泛洪任何内部行为。
 */
function cornerAt(targetX: number, targetY: number): { players: Array<{ x: number; y: number }>; rand: () => number } {
  return {
    players: [{ x: targetX - 60, y: targetY - 37 }],   // rect.x1=targetX / rect.y1=targetY
    rand: () => 0.99999,
  };
}

/** 标准房（同 town-npc-movein.buildHouse 形态）：ox..ox+10 × oy..oy+5
 *  opts.lightless=true 时跳过两只火把 = 缺 RoomNeeds 光源件的 B1 负例构造 */
function buildHouse(w: World, ox: number, oy: number, opts?: { lightless?: boolean }): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + 10, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [ox, ox + 10]) {
    for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  }
  if (!opts?.lightless) {
    st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
    st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  }
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

describe('(i)(ii) 近玩家实时回收链（CheckForHousesNearAPlayer cs:72184-72215）', () => {
  it('有流浪者在场：玩家站新房旁 → 单帧扫描即静默迁入（home null→房内、受理位一致）', () => {
    const w = new World(4200, 1200, 51, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300);
    expect(WALL_HOUSE.has(st.wall[st.idx(2102, 302)])).toBe(true);   // 定向首样目标背墙
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null as { x: number; y: number } | null, ref: { tag: 'npc17' } };
    const { players, rand } = cornerAt(2102, 302);                   // 右下角=(2102,302)
    const hitR = checkHousesNearAPlayer(
      st, players, 0,
      [mover] as NearChainNpcView<unknown>[],
      [],
      17,   // ★SW-BO1：优先型锁=迁入者类型（FindNPCLookingForHomeThatCanMoveIn 配型门）
      rand,
    );
    expect(hitR.seedHit).toEqual([2102, 302]);
    expect(hitR.relocated?.ref).toEqual({ tag: 'npc17' });           // 迁入者身份回投
    const h = hitR.home!;
    expect(h.x).toBeGreaterThanOrEqual(2101);                        // 站位落在本房内
    expect(h.x).toBeLessThanOrEqual(2109);
    expect(h.y).toBeGreaterThanOrEqual(301);
    expect(h.y).toBeLessThanOrEqual(304);
    const qr = queryRoom(st, h.x, h.y, { ignoreNeeds: true });       // 安家格确在本泛洪集
    expect(qr.room!.tiles.has(st.idx(h.x, h.y))).toBe(true);
    expect(hitR.foundHouseNoSpawn).toBeNull();                       // RelocatedHomeless 支不缓存
    const acc = acceptTownNPCAtHouse(st, [], 2102, 302, 17);         // 受理核合同位一致
    expect(acc.ok && acc.home && acc.home.x === h.x && acc.home.y === h.y).toBe(true);
  });

  it('无可迁者：在场全为已安家者 → FoundHouseNoSpawn 缓存 LastFoundHouse 位', () => {
    const w = new World(4200, 1200, 52, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300);
    // 已安家向导住在【另一处】（不在本房——vanilla：房被同类占用时 ScoreRoom=-1
    // 走 Blocked 支不缓存,见下一条负控）
    const housed = { key: 'guide', npcId: 22, bound: false, home: { x: 1800, y: 500 }, ref: {} };
    const occ = [{ x: 1800, y: 500, npcId: 22 }];
    const { players, rand } = cornerAt(2102, 302);
    const hitR = checkHousesNearAPlayer(
      st, players, 0, [housed], occ, 22, rand,   // ★SW-BO1：锁=22(在场者型),无 22 流浪者→缓存支
    );
    expect(hitR.seedHit).toEqual([2102, 302]);
    expect(hitR.relocated).toBeNull();
    expect(hitR.home).toBeNull();
    expect(hitR.foundHouseNoSpawn).toEqual([2102, 302]);             // cs:5535 缓存支
  });

  it('负控：房被同类别安家者占用（score=-1）→ Blocked 早退支【不】缓存 LastFoundHouse', () => {
    const w = new World(4200, 1200, 56, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300);
    const housedInTarget = { key: 'guide', npcId: 22, bound: false, home: { x: 2104, y: 304 }, ref: {} };
    const occ = [{ x: 2104, y: 304, npcId: 22 }];
    const { players, rand } = cornerAt(2102, 302);
    const hitR = checkHousesNearAPlayer(st, players, 0, [housedInTarget], occ, 22, rand);
    expect(hitR.seedHit).toEqual([2102, 302]);
    expect(hitR.foundHouseNoSpawn).toBeNull();                       // hiScore<=0 早退(:5365)先于缓存
  });

  it('Blocked 早退支不缓存：种子直接命中裸木墙（不成房）→ 受理核失败三态皆空', () => {
    const w = new World(4200, 1200, 53, 'open');
    const st = w.store;
    // 只有裸木墙一段（构成 wallHouse 命中面,种子即它自身 → StartedInASolidTile 档）
    st.setTileSilent(2000, 200, TILE_BY_KEY['wood']!, 0, 0);
    st.setWallSilent(2000, 200, 4);
    expect(WALL_HOUSE.has(st.wall[st.idx(2000, 200)])).toBe(true);
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null, ref: {} };
    const { players, rand } = cornerAt(2000, 200);
    const hitR = checkHousesNearAPlayer(st, players, 0, [mover], [], 17, rand);
    expect(hitR.seedHit).toEqual([2000, 200]);
    expect(hitR.relocated).toBeNull();
    expect(hitR.home).toBeNull();
    expect(hitR.foundHouseNoSpawn).toBeNull();                       // Blocked 不缓存(cs:5535 在全过之后)
  });

  it('(ii) 锚池契约独立证明：远程房对旧链（±10 锚窗）不可达,近链同帧可达并迁入', () => {
    const w = new World(4200, 1200, 54, 'open');
    const st = w.store;
    buildHouse(w, 2500, 300);                       // 房离任一锚点 >±10
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null, ref: {} };
    // 旧链口径：入驻环锚点扫（QuickFindHome 窗）——远处房 null（2026-08-15 契约样本）
    expect(findFreeHouse(st, [], 2100, 304, 17)).toBeNull();
    // 近链通路不查锚池：玩家站在该房旁即可受理（vanilla CheckForHousesNearAPlayer
    // 与 SpawnHomelessNPC 的 num==0 门互不相干）
    const { players, rand } = cornerAt(2502, 302);
    const hitR = checkHousesNearAPlayer(st, players, 0, [mover], [], 17, rand);
    expect(hitR.relocated).not.toBeNull();
    expect(hitR.home).not.toBeNull();
  });

  it('四元排除集：bound/37/453/368/160 均不可作近链迁入者;第一名取数组序先者', () => {
    const w = new World(4200, 1200, 55, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300);
    const views: NearChainNpcView<unknown>[] = [
      { key: 'old_man', npcId: 37, bound: false, home: null, ref: { k: 'oldman' } },
      { key: 'skeleton_merchant', npcId: 453, bound: false, home: null, ref: { k: '453' } },
      { key: 'travelling_merchant', npcId: 368, bound: false, home: null, ref: { k: '368' } },
      { key: 'truffle', npcId: 160, bound: false, home: null, ref: { k: '160' } },
      { key: 'bound_goblin', npcId: 107, bound: true, home: null, ref: { k: 'boundgob' } },
      { key: 'merchant', npcId: 17, bound: false, home: null, ref: { k: 'ok' } },
    ];
    const { players, rand } = cornerAt(2102, 302);
    const hitR = checkHousesNearAPlayer(st, players, 0, views, [], 17, rand);
    expect((hitR.relocated!.ref as { k?: string }).k).toBe('ok');    // 五个排除档跳过后首中商
    // ★SW-BO1：优先型配型门（FindNPCLookingForHomeThatCanMoveIn :5539-5547）——
    // 锁指 22 而在场流浪者仅 17 → mover=null,走缓存支（vanilla 近链只迁【同型】者）
    const hitR2 = checkHousesNearAPlayer(st, players, 0, views, [], 22, rand);
    expect(hitR2.relocated).toBeNull();
    expect(hitR2.foundHouseNoSpawn).toEqual([2102, 302]);
  });
});

describe('(iii) 开门中段穿透合并样本（C-F3：sheet 11 仅锚帧 {0,54,72,126} 封边）', () => {
  /** 双间连排房：外壳 + 共享隔墙列,隔墙 opening 三行铺开门片 frameX 组 frames */
  function buildTwins(w: World, ox: number, oy: number, frames: number[]): void {
    const st = w.store;
    const W = 26;
    for (let x = ox; x <= ox + W; x++) {
      st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(x, oy + 6, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy + 1; y <= oy + 5; y++) {
      st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(ox + W, y, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy; y <= oy + 6; y++) for (let x = ox; x <= ox + W; x++) st.wall[st.idx(x, y)] = 4;
    const cx = ox + 13;                            // 共享隔墙列
    for (let y = oy + 1; y <= oy + 5; y++) st.setTileSilent(cx, y, TILE_BY_KEY['wood']!, 0, 0);
    for (const dy of [0, 1, 2]) {
      st.setTileSilent(cx, oy + 2 + dy, DOOR_O, frames[dy] ?? 90, dy * 18);
    }
    // 左室四件套 + 左壁竖门（右室无家具——合并判定看连通）
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
    buildTwins(w, 2100, 300, [18, 36, 90]);
    const q = queryRoom(w.store, 2104, 303, { ignoreNeeds: true });
    expect(q.reason === 'ok' && !!q.room).toBe(true);
    const rt = q.room!;
    expect(rt.tiles.has(w.store.idx(2118, 303))).toBe(true);         // 隔墙右侧内室空气已并入
    expect(rt.tiles.has(w.store.idx(2122, 305))).toBe(true);
  });

  it('硬边帧(0/54/72/126)：仍当边界,两室各自成间（负控）', () => {
    for (const f of [0, 54, 72, 126]) {
      const w = new World(4200, 1200, 62, 'open');
      buildTwins(w, 2100, 300, [f, f, f]);
      const q = queryRoom(w.store, 2104, 303, { ignoreNeeds: true });
      expect(q.reason === 'ok' && !!q.room).toBe(true);
      expect(q.room!.tiles.has(w.store.idx(2118, 303))).toBe(false); // 未穿隔墙
    }
  });
});

describe('(iv) boulder 379 实心注入主链（C-F4）', () => {
  it('外墙嵌入泡沫块的房：主链判 ok;种子落在泡上=solid 档', () => {
    const w = new World(4200, 1200, 71, 'open');
    const st = w.store;
    buildHouse(w, 2200, 300);
    expect(BUBBLE).toBeDefined();
    // 把左下地板边界两格换成泡沫块;泡下外侧清墙做证伪面（若泡不被当界 → 泛经洞即
    // 'unsafeWalls/hole',原主链判负）
    st.setTileSilent(2203, 305, BUBBLE, 0, 0);
    st.setTileSilent(2204, 305, BUBBLE, 0, 0);
    st.wall[st.idx(2203, 306)] = 0;
    st.wall[st.idx(2204, 306)] = 0;
    expect(tileSolidLike(BUBBLE)).toBe(false);       // 自身非实心——判定全靠 extraSolid 注入
    const q = housingCheckAt(st, [], 2202, 303);
    expect(q.reason).toBe('ok');                     // 泡沫块当边界 → 封合成立
    const qs = queryRoom(st, 2203, 305);             // 种子直落泡沫块：实心起点同构档
    expect(qs.reason).toBe('solid');
  });
});

describe('(v) 松露人居所条件外扩域（E-11/C-F6）', () => {
  it('蘑菇族在外扩带内计入;带缘外不计入;阈值常量=100', () => {
    const w = new World(4200, 1200, 81, 'open');
    const st = w.store;
    buildHouse(w, 2300, 300);                        // 外壳盒 2300..2310 × 300..305
    // 带内批：左右两侧地板行 y=310（scan 域 x∈[2255..2355],y∈[258..350]）
    let inside = 0;
    for (let x = 2260; x <= 2277; x++) { st.setTileSilent(x, 310, GRASS, 0, 0); inside++; }
    for (let x = 2338; x <= 2354; x++) { st.setTileSilent(x, 310, GRASS, 0, 0); inside++; }
    const room = queryRoom(st, 2304, 303, { ignoreNeeds: true }).room;
    expect(room).not.toBeNull();
    const n = expandedMushroomCount(st, room!);
    expect(n).toBeGreaterThanOrEqual(inside);
    expect(MUSHROOM_TILE_THRESHOLD).toBe(100);
    // 负控同构房：草挪到带外远处不计入
    const w2 = new World(4200, 1200, 82, 'open');
    const st2 = w2.store;
    buildHouse(w2, 2300, 300);
    for (let x = 2450; x <= 2459; x++) st2.setTileSilent(x, 310, GRASS, 0, 0);
    const room2 = queryRoom(st2, 2304, 303, { ignoreNeeds: true }).room!;
    expect(expandedMushroomCount(st2, room2)).toBe(0);
  });

  it('外扩带铺满 ≥100 蘑菇族 → 计数过阈（home 复核/Housing 面）', () => {
    const w = new World(4200, 1200, 83, 'open');
    const st = w.store;
    buildHouse(w, 2400, 300);
    let put = 0;
    for (let y = 296; y >= 260 && put < 130; y--) {
      for (let x = 2440; x <= 2460 && put < 130; x++) { st.setTileSilent(x, y, GRASS, 0, 0); put++; }
    }
    expect(put).toBeGreaterThanOrEqual(MUSHROOM_TILE_THRESHOLD);
    const room = queryRoom(st, 2404, 303, { ignoreNeeds: true }).room!;
    expect(expandedMushroomCount(st, room)).toBeGreaterThanOrEqual(MUSHROOM_TILE_THRESHOLD);
  });

  // ---------------- 对抗修复批⑤B 2026-09-01 (vi)(B1) 追加段 ----------------
  it('(B1) 无光源房：近链命中采样点 → 静默不迁入且【不缓存】LastFoundHouse（Blocked 早退支）', () => {
    const w = new World(4200, 1200, 56, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300, { lightless: true });   // 门/桌/椅齐,仅缺光源
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null as { x: number; y: number } | null, ref: {} };
    const { players, rand } = cornerAt(2102, 302);
    const hitR = checkHousesNearAPlayer(st, players, 0, [mover], [], 17, rand);
    expect(hitR.seedHit).toEqual([2102, 302]);        // 背墙命中照常发生
    expect(hitR.relocated).toBeNull();                // B1 前:此房被静默迁入(比 vanilla 宽松)
    expect(hitR.home).toBeNull();
    expect(hitR.foundHouseNoSpawn).toBeNull();        // Blocked 支不缓存(cs:5535 在全过之后)
  });

  it('(B1) 快路径生人支同拒：acceptTownNPCAtHouse 对无光源房 ok=false（LastFoundHouse 安置位）', () => {
    const w = new World(4200, 1200, 57, 'open');
    const st = w.store;
    buildHouse(w, 2200, 300, { lightless: true });
    expect(WALL_HOUSE.has(st.wall[st.idx(2202, 302)])).toBe(true);
    const acc = acceptTownNPCAtHouse(st, [], 2202, 302, 17);
    expect(acc.ok).toBe(false);                       // RoomNeeds 档即出（vanilla cs:5344-47）
    expect(acc.home).toBeNull();
    st.setTileSilent(2205, 301, TILE_BY_KEY['torch']!, 22, 0);   // 补上光源——隔离变量
    const acc2 = acceptTownNPCAtHouse(st, [], 2202, 302, 17);
    expect(acc2.ok).toBe(true);
    expect(acc2.home).not.toBeNull();
  });
});

// ★QFH 2026-09-20（用户实报「新 NPC 只入住世界生成点附近」根因锁）：WALL_HOUSE 缺
// Gemspark 153-166 → 近链对宝石火花墙房采样失明（不迁入/不缓存 LastFoundHouse）→
// 新 NPC 到达只剩流浪生成（锚=现有 NPC 的家）。修前 S2a 探针实测失明。
describe('(vi) WALL_HOUSE 权威全集对拍（Main.cs wallHouse 全提取,★QFH）', () => {
  /** Main.cs 全部 `wallHouse[n]=true` 显式赋值 + :10491-10493 循环 `for (num4=153;
   *  num4<167; num4++)`——tools 提取脚本产出的 279 面权威清单硬编码。 */
  const VANILLA_WALL_HOUSE = new Set<number>([
    1, 4, 5, 6, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32,
    33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 60, 66, 67, 68, 72, 73, 74, 75,
    76, 77, 78, 82, 84, 85, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 106, 107,
    108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124,
    125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141,
    142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158,
    159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 172, 173, 174, 175, 176, 177,
    179, 181, 182, 183, 184, 186, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234,
    235, 236, 237, 238, 239, 240, 241, 242, 243, 245, 246, 247, 248, 249, 250, 251, 252,
    253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269,
    270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286,
    287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303,
    304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320,
    321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337,
    338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 351, 352, 353, 354, 355, 356,
    357, 358, 359, 360, 361, 362, 363, 364, 365, 366,
  ]);
  it('Housing.WALL_HOUSE 与 vanilla 279 面全集零差集（missing/extra 双向）', () => {
    const missing = [...VANILLA_WALL_HOUSE].filter((x) => !WALL_HOUSE.has(x));
    const extra = [...WALL_HOUSE].filter((x) => !VANILLA_WALL_HOUSE.has(x));
    expect(missing).toEqual([]);                      // 修前 = [153..166]（Gemspark 14 面）
    expect(extra).toEqual([]);
    expect(WALL_HOUSE.size).toBe(279);
  });

  it('宝石火花墙房（wall=153）近链全绿：迁移迁入 + 无迁者缓存 LastFoundHouse（修前红）', () => {
    const w = new World(4200, 1200, 58, 'open');
    const st = w.store;
    buildHouse(w, 2100, 300);
    for (let y = 301; y <= 304; y++) for (let x = 2101; x <= 2109; x++) st.wall[st.idx(x, y)] = 153;
    expect(WALL_HOUSE.has(153)).toBe(true);           // 153=AmberGemspark（WallID.cs）
    expect(st.wall[st.idx(2102, 302)]).toBe(153);
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null as { x: number; y: number } | null, ref: { tag: 'gemspark' } };
    const { players, rand } = cornerAt(2102, 302);
    const hitR = checkHousesNearAPlayer(
      st, players, 0, [mover] as NearChainNpcView<unknown>[], [], 17, rand,
    );
    expect(hitR.seedHit).toEqual([2102, 302]);        // 修前 = null（采样失明）
    expect(hitR.relocated?.ref).toEqual({ tag: 'gemspark' });   // 修前 = null
    expect(hitR.foundHouseNoSpawn).toBeNull();
    // 无迁者形态：FoundHouseNoSpawn 缓存支照常（快路径新 NPC 入住通路）
    const housed = { key: 'guide', npcId: 22, bound: false, home: { x: 1800, y: 500 }, ref: {} };
    const hitR2 = checkHousesNearAPlayer(
      st, cornerAt(2102, 302).players, 0, [housed], [{ x: 1800, y: 500, npcId: 22 }], 22, cornerAt(2102, 302).rand,
    );
    expect(hitR2.foundHouseNoSpawn).toEqual([2102, 302]);       // 修前 = null
  });

  it('抽查新补面逐面命中（153/160/166 入集;自然墙 9/245 外集边界不动）', () => {
    for (const id of [153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166]) {
      expect(WALL_HOUSE.has(id)).toBe(true);
    }
    expect(WALL_HOUSE.has(9)).toBe(false);            // 自然墙全部不在内（原语义保持）
    expect(WALL_HOUSE.has(245)).toBe(true);           // 邻域面不受补刀扰动
  });
});
