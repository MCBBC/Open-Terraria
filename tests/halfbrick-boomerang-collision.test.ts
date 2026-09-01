// 回旋镖弹体 × 地形形态碰撞回归（正典管线接入版）。
// 背景: bespoke solidBox 三次近似迭代史——①出生左上未回正(平地锁死)
//       →②半砖全格布尔(+8px 脚线互斥)→③坡面全格近似(斜砖重演帧0 锁死,
//       behavior-log-Starter_World-2026-08-31T16-41-58 五连掷实录)。
//       2026-09-01 终局:moveStep 改走 moveAndCollide 正典管线(TileCollision/
//       SlopeCollision 移植,半砖下半/坡面对角/平台 fallThrough 全覆盖),
//       本文件以「真站姿收敛摆位 + 真跑 fixedUpdate」做四形态行为断言。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { moveAndCollide } from '../src/physics/TileCollision';
import { Boomerang } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const W = 90, H = 160;

/** 测试替身钩子:33 出程不触 player 几何之外的分支,dust/sfx 全可省 */
function mkHooks(w: World): GameHooks {
  const hooks = {
    world: w,
    player: { x: 0, y: 0, w: 20, h: 42, cx: -99999, cy: -99999, dead: false,
      attackSpeedMult: 1,
      // hitEnemies 无条件读取的两项(空敌表不再深入)
      buffs: new Set(), critChance: () => 0 },
    enemies: () => [],
    playSfx() {}, playSfxFiles() {},
    // 低侧站位面向右端升口:预期内会发生反弹(33=bounce 族),尘/音需要桩
    spawnParticles() {},
  };
  return hooks as unknown as GameHooks;
}

type SurfaceKind = 'flat' | 'half' | 'slopeHigh' | 'slopeLow';

function mkWorld(kind: SurfaceKind): { w: World; standX: number; gy: number } {
  const w = new World(W, H, 7, `boom-collision-${kind}`);
  const st = w.store;
  const gy = 100;
  for (let x = 0; x < W; x++) { st.setTile(x, gy, 1); st.setTile(x, gy + 1, 1); }
  let standX = 45 * TILE;
  if (kind === 'half') {
    // 全行半砖（勿 setSlope 清位——store.setSlope 无条件清 half）。★不做
    // "半砖段接整砖"的台阶混排:那在原版也是真台阶,旋刃撞上属正常物理,
    // 不构成本回归的有效断言面。
    for (let x = 0; x < W; x++) { st.setTile(x, gy, 1); st.setHalfBrick(x, gy, true); }
    standX = 45 * TILE;
  } else if (kind === 'slopeHigh' || kind === 'slopeLow') {
    // 12 格 slope1(左高右低)嵌在整砖地台:item-slope-rest.test.ts 同款布局
    for (let x = 38; x < 50; x++) { st.setTile(x, gy, 0); st.setTile(x, gy + 1, 1); st.setSlope(x, gy + 1, 1); }
    if (kind === 'slopeHigh') standX = 38 * TILE + 6;      // 高侧(坡顶角,feet≈gy*16)
    else standX = 44 * TILE + 8;                            // 低侧中段(feet 沉对角线深处)
  }
  return { w, standX, gy };
}

/** 玩家站姿收敛:同尺寸(20×42)代理身体走同一正典管线落到表面,
 *  拿到真实中心作为回旋镖出生锚点(Game 场景 placeAtShootSpawn 等价)。 */
function stance(w: World, standX: number, gy: number):
  { cx: number; cy: number; footY: number } {
  const b = {
    x: standX - 10, y: (gy - 3) * TILE, w: 20, h: 42, vx: 0, vy: 0,
    onGround: false, hitWall: false, hitHead: false, collideY: false,
    tileCollide: true, dropThrough: true,
  };
  for (let i = 0; i < 90 && !b.onGround; i++) {
    b.vy = Math.min(b.vy + 0.4, 10);
    moveAndCollide(b, w, b.vx, b.vy);
    b.x = standX - 10;               // 锁横轴防坡面粘滞辅助挪位
  }
  expect(b.onGround, '站姿应落地').toBe(true);
  return { cx: b.x + 10, cy: b.y + 21, footY: b.y + b.h };
}

describe('Boomerang 弹体×地形形态(moveStep 正典管线接入)', () => {
  it.each<SurfaceKind>(['flat', 'half', 'slopeHigh', 'slopeLow'])('%s 上水平掷出:14t 存活、飞出 >48px、不进返回态', (kind) => {
    const { w, standX, gy } = mkWorld(kind);
    const s = stance(w, standX, gy);
    const hooks = mkHooks(w);
    const px = s.cx;
    // ★出生盒心回正必须在此复现(Game 场景由调用侧 placeAtShootSpawn 承担,
    //   构造器本体收【盒左上】坐标)——漏掉则下缘陷地=平地也锁死的假红
    const bom = new Boomerang(s.cx, s.cy, 14, 0, 25, 8, 33, 1);
    bom.x -= bom.w / 2; bom.y -= bom.h / 2;
    let alive = true;
    let maxDist = 0;
    // 14t 窗:远低于 30t 出程计时门(ai[1]≥30 回收),只观察地形互锁
    for (let t = 0; t < 14 && alive; t++) {
      bom.fixedUpdate(1 / 60, hooks);
      alive = !bom.dead;
      if (!alive) break;
      maxDist = Math.max(maxDist, Math.abs(bom.cx - px));
    }
    expect(alive, `${kind} 30t 内不应消亡`).toBe(true);
    expect(bom.ai0, `${kind} 不应被地形误判回收(ai0 必须=0 出程)`).toBe(0);
    expect(maxDist, `${kind} 最大位移 ${maxDist.toFixed(1)}px 应>48(非原地互锁)`).toBeGreaterThan(48);
  });
});
