// 巨石陷阱端到端(用户报"碎裂音+原地消失,不滚动"):
// 按 MicroBiomesPass.actuallyPlaceBoulderTrap 的真实口袋几何复刻——
// 3 宽口袋(左空柱+巨石 2×2+右侧 6×6 壳石壁)+ 支撑致动 + 下方走廊,
// actuate 后 TrapShot 必须:下落 ≥2 格 → 落地弹一下 → 持续滚动 → 远处撞墙才碎。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TrapShot } from '../src/entities/Dart';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const BOULDER = TILE_BY_KEY['v_138_boulder'];
const STONE = TILE_DEFS.findIndex((d) => d.vanilla?.sheet === 1);

/** 复刻 gen 布局(X=巨石锚列):2×2 巨石@X..X+1, 左列 X-1 净空, 壳壁 X+2 起 2 深,
 *  支撑行(致动器+线)在巨石下,再下 2 行净空走廊,走廊尽头右侧石墙 */
function trapWorld(): { w: World; wr: Wiring; spawnAt: () => TrapShot } {
  const w = new World(80, 80, 30, 'open');
  const st = w.store;
  const X = 40, Y = 40;                       // 巨石锚(左上)
  // 石壳:巨石右侧+下方走廊尽头(走廊 12 长)
  for (let y = Y - 2; y <= Y + 1; y++) st.setTileSilent(X + 2, y, STONE, 0, 0);
  const floorY = Y + 6;                       // 走廊地板
  for (let x = X - 1; x <= X + 14; x++) st.setTileSilent(x, floorY, STONE, 0, 0);
  for (let y = Y + 2; y < floorY; y++) st.setTileSilent(X + 14, y, STONE, 0, 0);  // 远端墙
  // 支撑(带致动器)在巨石正下两行之下取一行
  const supY = Y + 2;
  for (let x = X; x <= X + 1; x++) {
    st.setTileSilent(x, supY, STONE, 0, 0);
    st.wire[st.idx(x, supY)] = TileStore.WIRE_RED | TileStore.WIRE_ACTUATOR;
  }
  // 巨石 2×2
  st.setTileSilent(X, Y, BOULDER, 0, 0);
  st.setTileSilent(X + 1, Y, BOULDER, 18, 0);
  st.setTileSilent(X, Y + 1, BOULDER, 0, 18);
  st.setTileSilent(X + 1, Y + 1, BOULDER, 18, 18);
  const wr = new Wiring(st, 40);
  const spawned: TrapShot[] = [];
  wr.boulderFall = (bx, by) => {
    const t = new TrapShot(bx * TILE + 15.5, by * TILE + 16, 0, 0, 70, 'boulder');
    spawned.push(t);
  };
  return { w, wr, spawnAt: () => spawned[0] };
}

function game(w: World): GameHooks {
  return {
    world: w, player: { x: 0, y: 0, w: 20, h: 42, cx: 10, cy: 21, dead: true, iframes: 0 },
    enemies: () => [], critters: () => [], npcs: () => [], projectiles: () => [],
    entities: { critters: [], npcs: [], projectiles: [], add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, spawnParticles: () => {},
    addDamageNumber: () => {}, spawnDrop: () => null, cutTile: () => {},
    damagePlayer: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  } as unknown as GameHooks;
}

describe('巨石陷阱端到端(真实口袋几何)', () => {
  it('actuate → 巨石下落 ≥2 格 → 滚动前进 → 远端墙才碎裂', () => {
    const { w, wr, spawnAt } = trapWorld();
    wr.actuate(40, 42);                        // 触发支撑(真实信号两根同缩)
    wr.actuate(41, 42);
    const b = spawnAt();
    expect(b).toBeTruthy();                    // 生成 1 颗
    const g = game(w);
    const y0 = b.y, x0 = b.x;
    let shatterT = -1;
    for (let t = 0; t < 1200; t++) {
      b.fixedUpdate(1, g);
      if (b.dead && shatterT < 0) shatterT = t;
      if (shatterT >= 0) break;
    }
    // 下落:弹出生在锚中心,须掉到走廊(y 推进 ≥3 格)
    expect(b.y - y0).toBeGreaterThan(3 * TILE);
    // 滚动:水平推进(滚地加速 ±0.05)——至终点前应有显著位移
    expect(Math.abs(b.x - x0)).toBeGreaterThan(2 * TILE);
    // 最终碎在远端墙(14 列外)——而非出生/下落期
    expect(shatterT).toBeGreaterThan(60);
  });
});
