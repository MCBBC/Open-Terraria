/**
 * SW-BJ2 2026-09-06 回归锁（用户实报「NPC 入住逻辑跟着玩家走」：森林房入住 →
 * 玩家回出生点 → NPC 又在出生点旁空房入住,反复把家搬到玩家所在地）。
 *
 * 根因（机制级,探针 tests/_swbj2-probe 实锤后转正为本文件 T2）：
 *   Game.updateTownNpcArrival ①'' 房况复核旧实现用 findFreeHouse（±10 窗枚举门锚
 *   + 多房择优）冒充 QuickFindHome——vanilla WorldGen.cs:5654-5716 的扫描锚是
 *   homeTile【房位】且 step1 自 homeTile-1 直锚泛洪【所在房间】;门/入口距 home
 *   站格 >10 的宽房/远门房在旧路径下每 7200t 必判「无房」→ 已入住者被误转无家 →
 *   每 tick 近玩家回收链（CheckForHousesNearAPlayer cs:72184）把它迁进玩家视野内
 *   的空房 =「家跟着玩家搬」。次生根因：AI_007_TownEntities_TeleportToHome 全堵支
 *   （NPC.cs:56236-56237）旧实现清 home + anchorTile=当前位置（vanilla= homeless
 *   后【立即】以旧 homeTile 重扫 QuickFindHome,失败不清 homeTile）。
 *
 * ※Game 实例无 DOM 不可构造（同 housing-nearplayer-chain.test.ts 备案）——本文件
 *  以 Housing 纯函数驱动同款「帧步」语义;Game 侧胶水（runQuickFindHome/
 *  quickFindHomeForNpc/①'' 循环）由 tsc + 契约形状锁,不引入新判据。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  WALL_HOUSE, queryRoom, findFreeHouse, quickFindHome, checkHousesNearAPlayer,
  type NearChainNpcView,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR_C = TILE_BY_KEY['door_closed']!;   // sheet 10

/** 标准小房 ox..ox+10 × oy..oy+5（同 housing-nearplayer-chain.buildHouse 形态） */
function buildHouse(w: World, ox: number, oy: number): void {
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
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

/** 宽房 ox..ox+wd × oy..oy+5：门只在左墙、家具在左端（右端距门 >10 格） */
function buildWideRoom(w: World, ox: number, oy: number, wd: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + wd; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + wd, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + wd - 1; x++) st.wall[st.idx(x, y)] = 4;
  for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(ox, y, DOOR_C, 0, (y - oy - 2) * 18);
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + wd - 1, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 2, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 3 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 3 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

/** 角落定向 rand：恒返 0.99999 → 采样矩形右下角含端点格（消除随机性,不 mock 内部） */
function cornerAt(targetX: number, targetY: number):
  { players: Array<{ x: number; y: number }>; rand: () => number } {
  return {
    players: [{ x: targetX - 60, y: targetY - 37 }],   // rect.x1=targetX / rect.y1=targetY
    rand: () => 0.99999,
  };
}

const inRect = (x: number, x0: number, x1: number) => x >= x0 && x <= x1;

describe('SW-BJ2 NPC 入住与玩家位置解耦（QuickFindHome WorldGen.cs:5654-5716 1:1）', () => {
  it('T1 多空房解耦：森林房+出生点房各一,已入住森林房者复核后留森林房;玩家回出生点近链不迁已入住者', () => {
    const w = new World(4200, 1200, 51, 'open');
    const st = w.store;
    buildHouse(w, 500, 300);    // 森林房 A（现居）
    buildHouse(w, 2100, 300);   // 出生点房 B（空房）
    const homeX = 503, homeY = 304;              // 房 A 站格（homeTile 地板行=305）
    // ①'' 复核等价调用：quickFindHome（锚=homeTile 房位;签名无玩家位置——结构解耦）
    const r1 = quickFindHome(st, [], homeX, homeY + 1, 22);
    expect(r1.noop).toBe(false);
    expect(r1.home).not.toBeNull();
    // 新家仍在森林房 tiles 集内、绝无可能落到 1600 格外的出生点房
    const qr = queryRoom(st, r1.home!.x, r1.home!.y, { ignoreNeeds: true });
    expect(qr.room).not.toBeNull();
    expect(qr.room!.tiles.has(st.idx(homeX, homeY))).toBe(true);   // 同一物理房间
    expect(inRect(r1.home!.x, 501, 509)).toBe(true);
    // 玩家回出生点：近链采样命中出生点房背墙——已入住者【不】被迁入（vanilla 近链
    // 只迁 homeless,FindNPCLookingForHomeThatCanMoveIn :5539 homeless 门）
    const housed: NearChainNpcView<{ tag: string }> = {
      key: 'guide', npcId: 22, bound: false, home: { x: r1.home!.x, y: r1.home!.y }, ref: { tag: 'npc22' },
    };
    const { players, rand } = cornerAt(2102, 302);   // 定向首样=出生点房背墙格
    const near = checkHousesNearAPlayer(st, players, 0, [housed], [{ x: r1.home!.x, y: r1.home!.y, npcId: 22 }], rand);
    expect(near.seedHit).toEqual([2102, 302]);       // 出生点旁空房确被采样命中
    expect(near.relocated).toBeNull();               // ★已入住者不搬（解耦判别核心断言）
    expect(near.home).toBeNull();
    // 下一轮 ①'' 复核：仍留森林房（玩家位置不进任何入住判定;occupied 不含本人——
    // vanilla IsRoomConsideredOccupiedForNPCIndex :5694 按 index 排除自身,Game 侧
    // runQuickFindHome 以 `m !== n` 同义排除）
    const r2 = quickFindHome(st, [], r1.home!.x, r1.home!.y + 1, 22);
    expect(r2.home).not.toBeNull();
    expect(r2.home!.x).toBe(r1.home!.x);
    expect(r2.home!.y).toBe(r1.home!.y);
  });

  it('T2 实报根因锁（宽房/远门房）：门距 home>10 不得误判无房——step1 自 home 泛洪即受理', () => {
    const w = new World(4200, 1200, 52, 'open');
    const st = w.store;
    buildWideRoom(w, 2000, 300, 40);
    const hx = 2000 + 38, hy = 304;   // 右端站格;左门 2000 距其 38 格（>±10 窗）
    // 房间本体合格（vanilla StartRoomCheck(homeTileX, homeTileY-1) 可判 true 的前提）
    expect(queryRoom(st, hx, hy).room).not.toBeNull();
    // 旧路径指纹：findFreeHouse（±10 门锚枚举）在此几何必判 null → 曾致每 7200t 误转无家
    expect(findFreeHouse(st, [], hx, hy, 22)).toBeNull();
    // 修复后：QuickFindHome 1:1 → 同房重锚（不转无家,近链无机可乘）
    const r = quickFindHome(st, [], hx, hy + 1, 22);
    expect(r.noop).toBe(false);
    expect(r.home).not.toBeNull();
    const qr = queryRoom(st, r.home!.x, r.home!.y, { ignoreNeeds: true });
    expect(qr.room!.tiles.has(st.idx(hx, hy))).toBe(true);   // 仍是原房间
  });

  it('T3 房被毁重选：现居房泛洪失败 → 3×3/±10 步长2 网格重找（原版扫描序）,找到即重安家', () => {
    const w = new World(4200, 1200, 53, 'open');
    const st = w.store;
    buildHouse(w, 2000, 300);   // 现居房 A（将被拆）
    buildHouse(w, 2012, 300);   // 邻房 B（2012..2022,完好——vanilla 扫描窗内可达）
    // 拆房：A 左墙中段开洞（泛洪泄漏 → StartRoomCheck 判负）
    st.setTileSilent(2000, 302, 0, 0, 0);
    st.wall[st.idx(2000, 302)] = 0;
    expect(queryRoom(st, 2004, 304).room).toBeNull();        // step1 必失败（房已毁）
    const r = quickFindHome(st, [], 2004, 305, 22);          // 锚=旧 homeTile 地板行
    expect(r.noop).toBe(false);
    expect(r.home).not.toBeNull();                           // 邻房 B 重安家
    const qr = queryRoom(st, r.home!.x, r.home!.y, { ignoreNeeds: true });
    expect(qr.room!.tiles.has(st.idx(2016, 304))).toBe(true); // 落点在邻房 B 内
    expect(qr.room!.tiles.has(st.idx(2004, 304))).toBe(false); // 不在已毁 A 内
  });

  it('T4 QuickFindHome 字面 quirk 锁：外层无 break → 终值=末列(k=hx+10)探测结果,前列成功被覆写', () => {
    const w = new World(4200, 1200, 54, 'open');
    const st = w.store;
    buildHouse(w, 1988, 300);   // B1（列 k=hx-8/hx-6 可达,扫描序在前）
    buildHouse(w, 2013, 300);   // B2（内含列 k=hx+10,扫描序在后）
    buildHouse(w, 2000, 300);   // 现居房 A → 整体填实（=被拆的另一形态:全部实心）
    for (let y = 300; y <= 305; y++) {
      for (let x = 2000; x <= 2010; x++) st.setTileSilent(x, y, TILE_BY_KEY['wood']!, 0, 0);
    }
    const hx = 2004;
    // vanilla :5674-5682 内层 `l<=… && !StartRoomCheck(k,l)` 仅同列首成功即停,外层
    // 继续扫描并在失败时覆写 canSpawn → k=hx+10 列命中 B2 决定终局;若按直觉
    // 「首个成功即锁定」会落 B1——本锁钉死反编译字面行为。
    const r = quickFindHome(st, [], hx, 305, 22);
    expect(r.noop).toBe(false);
    expect(r.home).not.toBeNull();
    const qr = queryRoom(st, r.home!.x, r.home!.y, { ignoreNeeds: true });
    expect(qr.room!.tiles.has(st.idx(2017, 304))).toBe(true);   // B2（末列 k=2014 所在房）
    expect(qr.room!.tiles.has(st.idx(1992, 304))).toBe(false);  // 非 B1
  });

  it('T5 无空房 homeless 语义：homeTile=-1 守卫 no-op（不凭空安置）;近链无房命中=零动作', () => {
    const w = new World(4200, 1200, 55, 'open');
    const st = w.store;
    // vanilla :5661 守卫未过（homeTile=-1 的 homeless NPC）→ 整函数无操作
    const r = quickFindHome(st, [], -1, -1, 22);
    expect(r.noop).toBe(true);
    expect(r.home).toBeNull();
    // 世界边缘 home 同样 no-op（已安家者保持原状——vanilla 守卫字面）
    const r2 = quickFindHome(st, [], 8, 305, 22);
    expect(r2.noop).toBe(true);
    // 无房世界：近链 300 点采样无 wallHouse 命中 → seedHit=null,无迁入无缓存
    const mover: NearChainNpcView<{ tag: string }> = {
      key: 'merchant', npcId: 17, bound: false, home: null, ref: { tag: 'npc17' },
    };
    const { players, rand } = cornerAt(2102, 302);
    const near = checkHousesNearAPlayer(st, players, 0, [mover], [], rand);
    expect(near.seedHit).toBeNull();
    expect(near.relocated).toBeNull();
    expect(near.foundHouseNoSpawn).toBeNull();
  });

  it('T6 旅商/老人/骷髅商特例排除面登记：37 老人有 home 锚也不入复核轮（Game 循环守卫由契约形状锁）', () => {
    // ①'' 循环显式排除 vanillaId ∈ {368,37,453}（Main.cs:65088-65092 同口径）;本处锁
    // Housing 层不引入第四个特例——quickFindHome 对 37 仍按普通房位执行（语义中性）,
    // 排除责任在 Game 侧（tsc + Game 契约）;此处仅锁守卫与占用面不被误改。
    const w = new World(4200, 1200, 56, 'open');
    buildHouse(w, 2100, 300);
    const r = quickFindHome(w.store, [], 2103, 305, 37);
    expect(r.noop).toBe(false);
    expect(r.home).not.toBeNull();
  });
});
