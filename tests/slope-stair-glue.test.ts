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
import { TILE_BY_KEY } from '../src/data/tiles';
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
/** 平台族：kind='flat' 错层平台 / 'hammer' 平台锤坡 */
function buildPlatformStair(w: World, kind: 'flat' | 'hammer'): void {
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);
  for (let c = 0; c < 16; c++) {
    const idx = st.idx(10 + c, BASE - 2 + c);
    st.setTile(10 + c, BASE - 2 + c, 2);            // 平台
    if (kind === 'hammer') st.slope[idx] = 1;
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

    // 平台族（用户家楼梯常见砌法）
    w = new World(W, H, 7, 'plat-flat'); buildPlatformStair(w, 'flat');
    expect(walk(w, baseBody(), 1, 200).air).toBe(0);

    w = new World(W, H, 7, 'plat-hammer'); buildPlatformStair(w, 'hammer');
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

  it('★平台锤坡+支撑柱楼梯下行零空帧（用户存档定罪形,2026-08-31）', () => {
    // 真实存档 Starter_World 的玩家标注楼梯（marks no1..no7）：每列一块
    // 木平台(type11)锤成 slope=1 ╲,下方有满格支撑柱。曾因 isPlatSlope 的
    // 脚带门/上行方向档先于下贴候选评估,交界帧候选窗裸奔 → 存档实测
    // 63/80 空帧缓慢坠落。本用例按同款几何合成复现。
    const PT = TILE_BY_KEY['platform'];
    const STONE = TILE_BY_KEY['stone'] ?? 1;
    expect(PT).toBeDefined();
    const w = new World(W, H, 7, 'plat-hammer-pillar');
    const st = w.store;
    for (let x = 0; x < W - 4; x++) { if (x < 8 || x >= 24) continue; }
    for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, 1);   // 起步平台
    for (let c = 0; c < 14; c++) {
      const x = 10 + c, ty = BASE - 2 + c;
      st.setTile(x, ty, PT!);                    // 平台
      st.slope[st.idx(x, ty)] = 1;               // 锤成 ╲
      st.setTile(x, ty + 1, STONE as number);    // 支撑柱
      if (c > 0) st.setTile(x, ty, PT as number);
    }
    const b = baseBody();
    b.x = 9.4 * TILE;
    b.y = (BASE - 2) * TILE - 42 + 6;            // 落在起步平台顶稍上
    b.onGround = true;
    let air = 0;
    for (let t = 0; t < 90; t++) {
      b.vx = 1;
      b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
      if (!b.onGround) air++;
    }
    // 允许 ≤1 帧瞬态（交界角单帧闪烁,实机不可见）；≥3 帧即裸奔缝复发
    expect(air).toBeLessThanOrEqual(1);
    expect((b.x / TILE) - 9.4).toBeGreaterThan(80 / 16 - 2);   // 水平线性推进未卡死
  });
});
