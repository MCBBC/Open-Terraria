/**
 * ★★对抗修复批④2026-09-01 回归锁（C-F5 臭虫否决链 / C-F8 standing 文案收尾）。
 * 覆盖蓝本验证底线四项：
 *  (i)   房内放臭虫封锁块（sheet 630）/幽灵臭虫封锁块（631）→ housingCheckAt 拒
 *        + reason='stinkbug'/'echoStinkbug'（MoveTownNPC 门 cs:4696-4718 同序：
 *        先常规臭虫后幽灵）;房旗 stinkbug/echoStinkbug 分立置位。
 *  (ii)  宠物申请者豁免（IsTownPet[type]——NPCID.cs:4446 全集与 housingCategory
 *        宠物集逐一相等,housingCheckAt 复用 npcHousingCategory 判）：城镇猫 637
 *        申请照常受理 'ok';非宠物（商人 17）被拒。
 *  (iii) 近玩家受理面对臭虫房：checkHousesNearAPlayer = Blocked 级（relocated/
 *        foundHouseNoSpawn 双 null——【不迁入】且【不缓存】LastFoundHouse,
 *        cs:5348-5355 先于 ScoreRoom/缓存支的 spawn 面结构;acceptTownNPCAtHouse
 *        内置门对本面无条件生效——宠物持 TownManager 房位豁免在无 TownManager
 *        房位面的本仓不存在）。
 *  (iv)  无臭虫正控：同几何零改动即 ok/迁入（防 vacuous）。
 * 附：QueryRoom/QuickFindHome 面（findFreeHouse）不过臭虫门——vanilla 仅
 * MoveTownNPC 与 SpawnTownNPC 两消费位（cs:5633-5716 全程不查二旗），不做金标。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  housingCheckAt, checkHousesNearAPlayer, type NearChainNpcView,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR_C = TILE_BY_KEY['door_closed']!;                       // sheet 10
const STINK = TILE_BY_KEY['v_630_stinkbug_blocker']!;             // sheet 630（非实心陈设）
const ECHO = TILE_BY_KEY['v_631_ghostly_stinkbug_blocker']!;      // sheet 631

/** 标准房（town-npc-movein.buildHouse 形态）：ox..ox+10 × oy..oy+5 */
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

/**
 * 角落定向 rand（housing-nearplayer-chain 同构）：恒返 0.99999 → NextFromRectangle
 * 首样必落矩形右下角含端点格;调用方把视野矩形右下角精确摆到目标背墙点上。
 */
function cornerAt(targetX: number, targetY: number):
{ players: Array<{ x: number; y: number }>; rand: () => number } {
  return { players: [{ x: targetX - 60, y: targetY - 37 }], rand: () => 0.99999 };
}

describe('(i) 房内臭虫封锁块 → 受理门否决档（C-F5）', () => {
  it('630 常规臭虫：housingCheckAt 拒 + reason=stinkbug;房旗分立置位', () => {
    const w = new World(4200, 1200, 91, 'open');
    buildHouse(w, 2100, 300);
    w.store.setTileSilent(2102, 304, STINK, 0, 0);
    const q = housingCheckAt(w.store, [], 2107, 303);
    expect(q.reason).toBe('stinkbug');
    expect(q.flags.stinkbug).toBe(true);
    expect(q.flags.echoStinkbug).toBe(false);
    // 种子直落封锁块自身格同样命中（泛洪遍历自有单元格,非种子周边限定）
    const qs = housingCheckAt(w.store, [], 2102, 304);
    expect(qs.reason).toBe('stinkbug');
    // 查询器"?"档（askingNpcId=-1,非宠物）同拒
    expect(housingCheckAt(w.store, [], 2107, 303, -1).reason).toBe('stinkbug');
  });

  it('631 幽灵臭虫：reason=echoStinkbug（两族旗独立,误置定罪面）', () => {
    const w = new World(4200, 1200, 92, 'open');
    buildHouse(w, 2100, 300);
    w.store.setTileSilent(2103, 304, ECHO, 0, 0);
    const q = housingCheckAt(w.store, [], 2107, 303);
    expect(q.reason).toBe('echoStinkbug');
    expect(q.flags.echoStinkbug).toBe(true);
    expect(q.flags.stinkbug).toBe(false);
  });

  it('双族齐备：报常规臭虫档优先（vanilla stopOnFail 首支先断,:4697 先于 :4706）', () => {
    const w = new World(4200, 1200, 93, 'open');
    buildHouse(w, 2100, 300);
    w.store.setTileSilent(2102, 304, STINK, 0, 0);
    w.store.setTileSilent(2103, 304, ECHO, 0, 0);
    expect(housingCheckAt(w.store, [], 2107, 303).reason).toBe('stinkbug');
    expect(housingCheckAt(w.store, [], 2107, 303).flags.stinkbug).toBe(true);
    expect(housingCheckAt(w.store, [], 2107, 303).flags.echoStinkbug).toBe(true);
  });
});

describe('(ii) 宠物申请者豁免（IsTownPet ↔ npcHousingCategory 判）', () => {
  it('城镇猫 637 申请臭虫房照常受理 ok;非宠物 17 被拒（负控防空豁免）', () => {
    const w = new World(4200, 1200, 94, 'open');
    buildHouse(w, 2100, 300);
    w.store.setTileSilent(2102, 304, STINK, 0, 0);
    const qCat = housingCheckAt(w.store, [], 2107, 303, 637);
    expect(qCat.reason).toBe('ok');                    // 豁免后继续走 ScoreRoom 正常打分
    expect(qCat.score).toBeGreaterThan(0);
    expect(housingCheckAt(w.store, [], 2107, 303, 17).reason).toBe('stinkbug');
    // 幽灵臭虫房对非宠物仍是拒（豁免不限族）
    expect(housingCheckAt(w.store, [], 2107, 303, 684).reason).toBe('ok');
  });
});

describe('(iii) 近玩家受理面：臭虫房 Blocked 级——不迁入且不缓存 LastFoundHouse', () => {
  it('流浪者+臭虫房：seedHit 命中但 relocated/foundHouseNoSpawn 双 null', () => {
    const w = new World(4200, 1200, 95, 'open');
    buildHouse(w, 2100, 300);
    w.store.setTileSilent(2102, 304, STINK, 0, 0);
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null as { x: number; y: number } | null, ref: {} };
    const { players, rand } = cornerAt(2102, 302);
    const r = checkHousesNearAPlayer(
      w.store, players, 0, [mover] as NearChainNpcView<unknown>[], [], rand,
    );
    expect(r.seedHit).toEqual([2102, 302]);
    expect(r.relocated).toBeNull();            // 不迁入（RelocatedHomeless 支不可达）
    expect(r.home).toBeNull();
    expect(r.foundHouseNoSpawn).toBeNull();    // cs:5535 缓存支亦不可达（Blocked 早退在先）
  });

  it('cached 面同证：最后受理核 accept 位对臭虫房 ok=false（快路径落回锚扫前提成立）', () => {
    const w = new World(4200, 1200, 96, 'open');
    buildHouse(w, 2200, 300);
    w.store.setTileSilent(2208, 304, ECHO, 0, 0);
    const q = housingCheckAt(w.store, [], 2205, 303, 22);
    expect(q.reason).toBe('echoStinkbug');      // 入驻轮③ LastFoundHouse 快路径同门
  });
});

describe('(iv) 无臭虫正控（同几何零改动）', () => {
  it('housingCheckAt ok + 近链静默迁入（防 vacuous）', () => {
    const w = new World(4200, 1200, 97, 'open');
    buildHouse(w, 2100, 300);
    const q = housingCheckAt(w.store, [], 2107, 303);
    expect(q.reason).toBe('ok');
    const mover = { key: 'merchant', npcId: 17, bound: false, home: null, ref: { tag: 'npc17' } };
    const { players, rand } = cornerAt(2102, 302);
    const r = checkHousesNearAPlayer(w.store, players, 0, [mover], [], rand);
    expect(r.seedHit).toEqual([2102, 302]);
    expect(r.relocated?.ref).toEqual({ tag: 'npc17' });   // 迁入照旧
    expect(r.foundHouseNoSpawn).toBeNull();
  });
});
