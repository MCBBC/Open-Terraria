// 斜坡楼梯双向贴合回归（2026-08-31「下楼梯=跌落感」定案）：
//   症状 = 城镇 NPC/玩家下行斜坡砖砌楼梯时 FindFrame 走腾空帧（原版观感=行走）。
//   根因 = slopeCollide 只有「沉入→上抬」单向贴合；跨两坡格交界瞬间旧格已水平
//   出窗、新格脚底尚未垂直入格，双方重叠门都拒收 → 面随态裸奔 4~5 帧，vy 自由
//   落体成簇（离线探针实证：斜坡梯 65/140 空帧；满格/半砖阶 0 空帧）。
//   修复 = 对贴地下行(wasGround+vy≥0)的实心地面坡(1/2)在重叠门前发【面随下贴】
//   候选（线 = vy0+num4,num4∈[0,TILE] 左/右缘进深钳制天然防 tip-over 误拉），
//   门 gap∈(0.05,17px)=StepDown 吸附窗界（Collision.cs:3629）；与抬升互斥。
//   原版对照：SlopeCollision 双向把面随实体压回对角线，velocity.Y 全程==0，
//   NPC.cs:69416 FindFrame 的 velocity.Y==0f 门持续命中行走帧。
import { describe, it, expect } from 'vitest';
import { moveAndCollide } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const W = 60, H = 40, BASE = 22;
type BodyT = Parameters<typeof moveAndCollide>[0];

function baseBody(): BodyT {
  return {
    x: 8 * TILE, y: (BASE - 2) * TILE - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
    liqFactor: 1,
  } as unknown as BodyT;
}

/** 斜坡梯（每列降 1 行,slope1 ╲） */
function buildRamp(w: World): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const x = 10 + c;
    const ty = BASE - 2 + c;
    st.setTile(x, ty, 1);
    st.slope[st.idx(x, ty)] = 1;
  }
}
/** 满格/半砖阶梯（每列降 1 行） */
function buildStair(w: World, half: boolean): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const x = 10 + c;
    const ty = BASE - 2 + c;
    st.setTile(x, ty, 1);
    if (half) st.half[st.idx(x, ty)] = 128;
    st.setTile(x, ty + 1, 1);
  }
}

/** 以 vx=±1 匀速行走,返回空中帧数与终点 x（格） */
function walk(w: World, b: BodyT, dir: 1 | -1, ticks: number):
{ air: number; endX: number; grounded: boolean } {
  let air = 0;
  for (let t = 0; t < ticks; t++) {
    b.vx = dir;
    b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, w, b.vx, b.vy);
    if (!b.onGround) air++;
  }
  return { air, endX: b.x / TILE, grounded: b.onGround };
}

describe('斜坡楼梯下行不丢接地（Collision.cs SlopeCollision 双向贴合补齐）', () => {
  it('下行三类台阶全程零空中帧（修正前斜坡梯 65/140）', () => {
    let w = new World(W, H, 7, 'slope-stair'); buildRamp(w);
    expect(walk(w, baseBody(), 1, 200).air).toBe(0);

    w = new World(W, H, 7, 'block-stair'); buildStair(w, false);
    expect(walk(w, baseBody(), 1, 200).air).toBe(0);

    w = new World(W, H, 7, 'half-stair'); buildStair(w, true);
    expect(walk(w, baseBody(), 1, 200).air).toBe(0);
  });

  it('下行滑行线性推进（无卡顿/无棘轮）', () => {
    const w = new World(W, H, 7, 'glide'); buildRamp(w);
    const b = baseBody();
    // vx=1px/t × 200t ⇒ 应恰好推进 ~12.5 格（无 X 反复受阻）
    const r = walk(w, b, 1, 200);
    expect(r.endX).toBeGreaterThan(20.0);   // 起步 8.0 + ≥12.5
    expect(r.grounded).toBe(true);
  });

  it('上行爬升全程零空中帧', () => {
    const w = new World(W, H, 7, 'ascent');
    buildRamp(w);
    const st = w.store;
    for (let x = 26; x < 36; x++) st.setTile(x, BASE + 14, 1);   // 梯底落点平台
    const b = baseBody();
    b.x = 30 * TILE;
    b.y = (BASE + 14) * TILE - 42;
    const r = walk(w, b, -1, 260);
    expect(r.air).toBe(0);
    expect(r.endX).toBeLessThan(15);        // 一路爬到高位区段
    expect(r.grounded).toBe(true);
  });

  it('腾空横越坡面不被下贴误拉（wasGround 门）', () => {
    const w = new World(W, H, 7, 'flyover');
    buildRamp(w);
    const b = baseBody();
    b.x = 4 * TILE;
    b.vy = -6.5;                            // 起跳离地
    let airborneTicks = 0;
    for (let t = 0; t < 120; t++) {
      b.vx = 3;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
      if (!b.onGround) airborneTicks++;
    }
    // 核心断言：真腾空（非被按到坡面上拖行）。修正前该场景 onGround 门已挡,
    // 此用例锁定修复不会被未来的宽容化无声回退。
    expect(airborneTicks).toBeGreaterThan(40);
  });
});
