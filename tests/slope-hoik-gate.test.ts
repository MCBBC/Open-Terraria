// hoik 放行门默认关闭回归（2026-09-01 tent 悬臂弹飞定罪）。
// 判例：原版 Collision.TileCollision 的天花板坡链水平穿越豁免包在 `if (!hoik)`
// 内（Collision.cs 左撞墙支 :2412 / 右撞墙支 :2432），hoik 是第 9 形参【默认
// false】，仅钻洞弹幕 AI 显式传 true。曾误开为无条件规则：从右侧接近"实心格 +
// 右邻天花板坡(slope3)"组合时被永久放行 1px 幽灵入场（用户存档 tent 结构
// x591/(592,328) 案），头顶嵌入悬臂实心后由 unembedPass 爆推 63px = "阻尼走到
// 尽头被弹飞数格"；且 X-pass 从未真拦 → hitWall 恒 false，NPC 检测不到墙无限重试。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w = 60, h = 60): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

/** 场景镜像 tent 案：地台 row32；悬臂实心 (34,29)；其右邻为天花板坡 slope3 (35,29)。
 *  身体立于地台向左走，左缘距 (34,29) 右缘 1~N px 时按 vanilla 必须被拦。 */
function buildTent(W: World): void {
  const st = W.store;
  for (let x = 20; x <= 52; x++) st.setTile(x, 32, DIRT);   // 地台
  st.setTile(34, 29, DIRT);                                  // 悬臂实心（拦人者）
  st.setSlope(35, 29, 3);                                    // 天花板坡（右邻）
}

interface B { x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; hitWall: boolean; hitHead: boolean; collideY?: boolean;
  stepUp?: boolean; stepUpHolds?: boolean; hoik?: boolean; embedTicks?: number }

describe('hoik 放行门默认关闭（tent 弹飞回归）', () => {
  it('普通实体贴近"实心+右邻天花坡"必被拦：hitWall 置位、不越界、不产生远距位移', () => {
    const W = makeWorld(); buildTent(W);
    const b: B = { x: 37 * TILE, y: 32 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      stepUp: true, stepUpHolds: true };
    const wallRight = 35 * TILE;              // (34,29) 右缘 = 身体不得越过此线
    let sawHitWall = false;
    for (let t = 0; t < 120; t++) {
      b.vx = -1; b.vy = Math.min(8, b.vy + 0.35);
      moveAndCollide(b as never, W, b.vx, b.vy);
      if (b.hitWall) sawHitWall = true;
      expect(b.x).toBeGreaterThanOrEqual(wallRight - 0.01);
    }
    expect(sawHitWall).toBe(true);
  });

  it('hitWall 已置位前禁止单帧大位移弹射（unembedPass 会话帽 ≤2 格）', () => {
    const W = makeWorld(); buildTent(W);
    const b: B = { x: 37 * TILE, y: 32 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      stepUp: true, stepUpHolds: true };
    let prevX = b.x;
    for (let t = 0; t < 240; t++) {
      b.vx = -1; b.vy = Math.min(8, b.vy + 0.35);
      moveAndCollide(b as never, W, b.vx, b.vy);
      // 出现 hitWall 后任何后续帧不允许再出现 >8px 的水平跳变（弹飞签名）
      if (b.hitWall || prevX <= 35 * TILE + 24) {
        expect(Math.abs(b.x - prevX)).toBeLessThanOrEqual(TILE);
      }
      prevX = b.x;
    }
  });

  it('显式 hoik=true（钻洞弹幕语义）仍可穿右邻天花坡的链缝', () => {
    const W = makeWorld(); buildTent(W);
    const b: B = { x: 37 * TILE, y: 32 * TILE - 42, w: 20, h: 42,
      vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
      stepUp: true, hoik: true };
    for (let t = 0; t < 120 && b.x > 33 * TILE; t++) {
      b.vx = -1; b.vy = Math.min(8, b.vy + 0.35);
      moveAndCollide(b as never, W, b.vx, b.vy);
    }
    expect(b.x).toBeLessThan(35 * TILE);      // 已穿过 (34,29)/(35,29) 链缝
  });
});
