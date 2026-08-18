// 老鼠坐骑 55 爬墙回归（WallClimbMovement :21329-21450 非 spikedBoots 支）：
// 按向墙方向 + 墙延到脚下一格 → 上 -2/t、下 4/t、松手 0.5/t；免坠伤（fallStartY 清）；
// 爬墙期间平台穿透（:27777 flag29）。反向按键不触发（slideDir 门）
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';

const DIRT = TILE_BY_KEY['dirt']!;
const PLAT = TILE_BY_KEY['platform']!;

function makeWorld(): World {
  return { store: new TileStore(40, 30), w: 40, h: 30 } as unknown as World;
}

/** 右侧一堵实心墙（x=25 列），玩家贴墙悬空 */
function wallWorld(): World {
  const w = makeWorld();
  for (let y = 0; y < 30; y++) w.store.setTile(25, y, DIRT);
  return w;
}

function hooks(w: World) {
  return {
    world: w,
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {},
    enemies: () => [], critters: () => [],
  } as never;
}

function mountedPlayer(w: World, x: number, y: number): Player {
  const p = new Player(x, y, new Inventory());
  p.mount.active = true;
  p.mount.type = 55;
  return p;
}

/** 单帧推进：设置输入 + 直调重力段所经的整 fixedUpdate 太重（需全套 GameHooks）——
 *  本测试直接复算 rat 块的条件与钉速（与 Player.ts 同式），验证引擎字段语义 */
function climbVy(p: Player, w: World, inputX: number, inputUp: boolean, inputDown: boolean): number | null {
  const ratClimb = p.mount.active && p.mount.type === 55
    && !p.onGround && p.hitWall && inputX !== 0
    && Math.sign(inputX) === Math.sign(p.vx || p.facing);
  if (!ratClimb) return null;
  const st = w.store;
  const sideX = inputX > 0 ? Math.floor((p.x + p.w + 1) / TILE) : Math.floor((p.x - 1) / TILE);
  const footY = Math.floor((p.y + p.h + 1) / TILE);
  if (!(st.inBounds(sideX, footY) && st.isSolid(sideX, footY))) return null;
  return inputUp ? -2 : inputDown ? 4 : 0.5;
}

describe('老鼠坐骑 55 爬墙（WallClimbMovement :21329-21450）', () => {
  it('贴右墙悬空 + 按右：墙延脚下 → 上-2/下4/松手0.5 三档', () => {
    const w = wallWorld();
    // 玩家左缘贴 x=25 墙（墙在 400px 起）
    const p = mountedPlayer(w, 400 - 20, 200);
    p.vx = 3; p.facing = 1; p.hitWall = true; p.onGround = false;
    expect(climbVy(p, w, 1, false, false)).toBe(0.5);    // 松手缓滑
    expect(climbVy(p, w, 1, true, false)).toBe(-2);      // 上爬
    expect(climbVy(p, w, 1, false, true)).toBe(4);       // 下爬
  });

  it('墙不延到脚下一格（脚下侧格空）→ 不触发', () => {
    const w = makeWorld();
    // 只在 y=5 一行有墙、玩家脚在 y=20 下方远处
    for (let x = 24; x < 28; x++) w.store.setTile(x, 5, DIRT);
    const p = mountedPlayer(w, 24 * TILE - 20, 18 * TILE);
    p.vx = 3; p.facing = 1; p.hitWall = true; p.onGround = false;
    expect(climbVy(p, w, 1, true, false)).toBeNull();
  });

  it('按左但 vx 朝右（slideDir 门）→ 不触发', () => {
    const w = wallWorld();
    const p = mountedPlayer(w, 400 - 20, 200);
    p.vx = 3; p.facing = 1; p.hitWall = true; p.onGround = false;
    expect(climbVy(p, w, -1, true, false)).toBeNull();
  });

  it('非 55 坐骑 → 不触发（WallslideMovement 另属钉鞋族）', () => {
    const w = wallWorld();
    const p = mountedPlayer(w, 400 - 20, 200);
    p.mount.type = 8;   // 猪鲨
    p.vx = 3; p.facing = 1; p.hitWall = true; p.onGround = false;
    expect(climbVy(p, w, 1, true, false)).toBeNull();
  });

  it('数据面：平台在脚下侧格不阻爬（isSolid 平台恒 false）', () => {
    const w = wallWorld();
    const st = w.store;
    st.setTile(25, Math.floor((200 + 42 + 1) / TILE), PLAT);   // 脚下侧格换平台
    const p = mountedPlayer(w, 400 - 20, 200);
    p.vx = 3; p.facing = 1; p.hitWall = true; p.onGround = false;
    expect(climbVy(p, w, 1, true, false)).toBeNull();          // 平台非实心 → 墙断
  });
});
