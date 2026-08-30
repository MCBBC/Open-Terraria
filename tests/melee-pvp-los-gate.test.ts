// 近战 PvP 挥击视线门回归（2026-08-30 补接）：原版 ItemCheck_MeleeHitPVP
// （1457 Player.cs:44420 / 1456 :43398）命中循环门禁串 :44429/:43407
// `!itemRectangle.Intersects(player.Hitbox) || !CanHit(player)` → continue——
// CanHit = Player.CanHit(Entity ent) 四射线链（1457 :42858-42865 / 1456 :41886）。
// 此前 updateSwingHits 的 PvP 桶只查 hitRect 相交就广播 msg44 意向（隔实心块也能
// 打到远端玩家），与 enemies 桶不同式 → 本测试钉住补接后的几何语义：
//  · 调用形 = playerCanHitEntity(world.store, 本地玩家, 远端代理) —— 远端代理
//    Player 与本地玩家同一 Entity 基类面（x/y/w/h/cx/cy/facing），盒构造同构；
//  · 玩家身材取原版 20×42（双方同款）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { canHit, canHitLine, playerCanHitEntity } from '../src/physics/LineOfSight';

const STONE = TILE_BY_KEY['stone'];

/** 盒：px 坐标（16px 一格）；cx/cy/facing 走 LOSBox 可选面 */
function box(cxPx: number, cyPx: number, w: number, h: number) {
  return { x: cxPx - w / 2, y: cyPx - h / 2, w, h };
}

/** 场景骨架（玩家对玩家）：本地中心 (30.5 格)、远端中心 (32.5 格)，中间 x=31 列
 *  为被试障碍。双方均原版身材 20×42；facing=1（近战 PvP 只在挥击侧发起） */
function makeScene(fillWall: (st: TileStore) => void) {
  const world = new World(64, 64, 42, '测试');
  fillWall(world.store);
  const pcy = 16 * 16 + 8;
  const local = { ...box(30.5 * 16, pcy, 20, 42), cx: 30.5 * 16, cy: pcy, facing: 1 };
  const remote = box(32.5 * 16, pcy, 20, 42);
  return { store: world.store, local, remote };
}

describe('近战 PvP 视线门（ItemCheck_MeleeHitPVP 的 CanHit(player) 支）', () => {
  it('开阔地:门通过（hitRect 后可进 swingHitSet / 广播 msg44 意向）', () => {
    const { store, local, remote } = makeScene(() => {});
    expect(playerCanHitEntity(store, local, remote)).toBe(true);
  });

  it('隔一整列石壁:A 盒直判+三手位射线全被挡 → 门拒(continue,不发意向)', () => {
    const { store, local, remote } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, STONE);
    });
    // 门禁链逐项复现：CanHit(整盒) false 且三手位射线全 false ⇒ CanHit(player)=false
    const hx = local.cx + (local.facing ?? 1) * (local.w / 2), hy = local.cy - local.h / 3;
    const ecx = remote.x + remote.w / 2, ecy = remote.y + remote.h / 2;
    expect(canHit(store, local.x, local.y, local.w, local.h,
      remote.x, remote.y, remote.w, remote.h)).toBe(false);
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy - remote.h / 3, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, local.cy, 0, 0, ecx, ecy + remote.h / 3, 0, 0)).toBe(false);
    expect(playerCanHitEntity(store, local, remote)).toBe(false);
  });

  it('致动石壁(inActive):豁免照常生效于 PvP 门 → 可命中', () => {
    const { store, local, remote } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) {
        st.setTile(31, ty, STONE);
        const i = st.idx(31, ty);
        st.wire[i] |= TileStore.WIRE_ACTUATED;
      }
    });
    expect(playerCanHitEntity(store, local, remote)).toBe(true);
  });
});
