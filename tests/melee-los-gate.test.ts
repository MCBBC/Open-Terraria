// 近战挥击视线门回归（2026-08-30 用户报"隔着一格方块能打到怪"）：
// 原版 ProcessHitAgainstNPC（1457 Player.cs:44641 / 1456 :43619）在命中盒相交后
// 还要过 `noTileCollide || CanHit(nPC)`——Player.CanHit(Entity)（1457 :42858 /
// 1456 :41886）四射线任一通过才算见着。此前 updateSwingHits 漏接此门 → 隔实心
// 块照样命中，与原版不符。本测试钉住 playerCanHitEntity 的几何语义：
//  · 实体 tile（整块实心）挡得住；半砖/坡面/平台（tileSolidTop）不挡；
//  · 背景【墙壁】从来不在判定里（store 无墙输入），只看 tile。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { canHit, canHitLine, playerCanHitEntity } from '../src/physics/LineOfSight';

const STONE = TILE_BY_KEY['stone'];
const PLATFORM = TILE_BY_KEY['platform'];

/** 盒：px 坐标（原版 16px 一格）。cx/cy/facing 走 LOSBox 可选面 */
function box(cxPx: number, cyPx: number, w: number, h: number) {
  return { x: cxPx - w / 2, y: cyPx - h / 2, w, h };
}

/** 场景骨架：P|W|E 三列并排——玩家中心 (30.5 格)，目标中心 (32.5 格)，
 *  中间 x=31 列为被试障碍。玩家 20×42 / 目标 18×40（近似原版身材）。 */
function makeScene(fillWall: (st: TileStore) => void) {
  const world = new World(64, 64, 42, '测试');
  fillWall(world.store);
  const pcy = 16 * 16 + 8;
  const player = { ...box(30.5 * 16, pcy, 20, 42), cx: 30.5 * 16, cy: pcy, facing: 1 };
  const enemy = box(32.5 * 16, pcy, 18, 40);
  return { store: world.store, player, enemy, pcy };
}

describe('近战视线门 playerCanHitEntity（Player.CanHit 四射线链）', () => {
  it('开阔地:CanHit 整盒直判过,可命中', () => {
    const { store, player, enemy } = makeScene(() => {});
    expect(canHit(store, player.x, player.y, player.w, player.h,
      enemy.x, enemy.y, enemy.w, enemy.h)).toBe(true);
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });

  it('隔一整块实心石壁:A 盒射线/三手位射线全被挡 → 不可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, STONE);
    });
    // 手位点 = Center+(facing*w/2, −h/3)；目标锚点 = Center±h/3 与本体
    const hx = player.cx + (player.w / 2), hy = player.cy - player.h / 3;
    const ecx = enemy.x + enemy.w / 2, ecy = enemy.y + enemy.h / 2;
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy - enemy.h / 3, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, hy, 0, 0, ecx, ecy, 0, 0)).toBe(false);
    expect(canHitLine(store, hx, player.cy, 0, 0, ecx, ecy + enemy.h / 3, 0, 0)).toBe(false);
    expect(playerCanHitEntity(store, player, enemy)).toBe(false);
  });

  it('中间换平台:tileSolidTop 不阻挡视线 → 可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) st.setTile(31, ty, PLATFORM);
    });
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });

  it('致动石壁(inActive):不阻挡 → 可命中', () => {
    const { store, player, enemy } = makeScene((st) => {
      for (let ty = 8; ty <= 24; ty++) {
        st.setTile(31, ty, STONE);
        const i = st.idx(31, ty);
        st.wire[i] |= TileStore.WIRE_ACTUATED;   // inActive（fullSolid 排除致动格）
      }
    });
    expect(playerCanHitEntity(store, player, enemy)).toBe(true);
  });
});
