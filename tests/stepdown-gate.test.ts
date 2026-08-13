// StepDown 门回归（萤火虫/蝴蝶"怪力按压闪现"根因修复）：
//   原 vy>=0 宽门 → 低空飞行小动物被周期性瞬移按压（Collision.cs StepDown 7~17px 吸附）。
//   修复后门：NPC 族 = onGround（原版 NPC.cs:54374 vy==0 在该时点=贴地语义）、
//   玩家 = vy===GRAVITY（Player.cs:23252 字面）。空中实体（onGround=false）永不吸附。
import { describe, it, expect } from 'vitest';
import { moveAndCollide } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { GRAVITY, TILE } from '../src/core/constants';

const W = 40, H = 40, FLOOR = 21;

function makeWorld(): World {
  const w = new World(W, H, 7, 'stepdown-test');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);   // 全幅地板 row21
  return w;
}

/** 刚走下台阶的实体：全身悬于地板上方 16px（gap∈StepDown 7~17 窗），水平移动中 */
function body(over: Partial<{ onGround: boolean; vy: number; stepDownGate: 'grounded' | 'gravity' }>) {
  return {
    x: 12 * TILE, y: (FLOOR - 1) * TILE - 16,   // 脚底 336-16=320,距地板顶 16px
    w: 12, h: 16,
    vx: 2, vy: GRAVITY,
    onGround: true, hitWall: false, hitHead: false,
    stepUp: true,
    ...over,
  } as Parameters<typeof moveAndCollide>[0];
}

describe('StepDown 门（Collision.cs:3577-3638）', () => {
  it('贴地行走（onGround=true）→ 仍吸附下台阶（原行为保留）', () => {
    const w = makeWorld();
    const b = body({});
    const yBefore = b.y;
    moveAndCollide(b, w, b.vx, b.vy);
    expect(b.y).toBeGreaterThan(yBefore + 8);   // 被 StepDown 瞬移吸附 16px 贴地
  });

  it('★空中飞行（onGround=false, vy=0.3 平飞）→ 不吸附（修复核心）', () => {
    const w = makeWorld();
    const b = body({ onGround: false, vy: 0.3 });
    const yBefore = b.y;
    moveAndCollide(b, w, b.vx, b.vy);
    expect(b.y - yBefore).toBeLessThan(2);      // 只按 vy 缓降,无瞬移按压
  });

  it('玩家门 = vy===GRAVITY 字面：vy=GRAVITY 吸附、vy=0.3 不吸附', () => {
    const w = makeWorld();
    const a = body({ stepDownGate: 'gravity' as const, vy: GRAVITY });
    const y0 = a.y;
    moveAndCollide(a, w, a.vx, a.vy);
    expect(a.y).toBeGreaterThan(y0 + 8);        // vy==gravity → 吸附（Player.cs:23252）

    const w2 = makeWorld();
    const c = body({ stepDownGate: 'gravity' as const, vy: 0.3 });
    const y1 = c.y;
    moveAndCollide(c, w2, c.vx, c.vy);
    expect(c.y - y1).toBeLessThan(2);           // 空中缓降 → 不吸附
  });
});
