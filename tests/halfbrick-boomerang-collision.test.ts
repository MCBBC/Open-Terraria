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


// ---- 用户存档阶梯重放(map-Starter_World(25):玻璃斜坡阶梯右下沉,col k: slope1@362+2k /
//      solid@363+2k / slope4@364+2k;站位 c3352,feetY=5856)——修「右下扔只向上」判例 ----
it('用户阶梯地形:右下投掷可进入下行走廊(非永动向上弹射)', () => {
  // 坐标系:世界列 local = 存档列 - 3300(BASE 列 50 起步),行不变
  // ★2026-09-02 修复:阶梯行 r0=342..370(362+2k-12)与下落起点 y=340*TILE 均超出
  //   h=220——自 492cde03 落盘起全部 setTile 越界被略=无地板必红。按 fixture 自身
  //   数学加高(H≥378 容阶梯+8 净空,420 留余量)。
  const w = new World(120, 420, 7, 'user-stair');
  const st = w.store;
  const COL0 = 46;               // 对应存档 c3346(k=-4)
  for (let k = -4; k <= 10; k++) {
    const tx = COL0 + 4 + k, r0 = 360 + 2 * k;   // 存档 r0=362+2k → 本地以行 360 为 k=+1 对齐
    void tx; void r0;
  }
  // 直接按存档逐柱写:r0(L)=360+2*(kL-? ) 以 c52(feetRow366 tread)为锚:
  //   kL 与存档一一对应:kS=k-(-4)+col=COL0+k ... 简化循环写法
  for (let k = -4; k <= 10; k++) {
    const tx = 46 + (k + 4);      // local col of archive tx=3350+k
    const r0 = 362 + 2 * k - 12;  // 行整体上移 12 行留头顶空间(362→350 基准)
    if (r0 < 8 || r0 + 8 >= 420) continue;   // ★2026-09-02 随 H=420 同步(旧 220 使全部阶梯列被略)
    st.setTile(tx, r0, 2); st.setSlope(tx, r0, 1);
    st.setTile(tx, r0 + 1, 2);
    st.setTile(tx, r0 + 2, 2); st.setSlope(tx, r0 + 2, 4);
  }
  // 站位=c352(local 54,k=2,r0 tread=362+4-12=354? →feet=(354+1+1? ) 用与存档同构落点:
  //   存档 feetRow=366(=slope1@366 的格顶线);本地等价行=r0(c52)=354 → 格顶 354*16
  const bxLocal = (54) * TILE + 2;
  const surfTop = (356) * TILE;   // 356=c52 slope1@354 的下一?—直接以收敛为准,不精算
  const b = { x: bxLocal, y: (340) * TILE, w: 20, h: 42, vx: 0, vy: 0,
    onGround: false, hitWall: false, hitHead: false, collideY: false,
    tileCollide: true, dropThrough: true };
  for (let i = 0; i < 90 && !b.onGround; i++) { b.vy = Math.min(b.vy + 0.4, 10); moveAndCollide(b, w, b.vx, b.vy); }
  expect(b.onGround).toBe(true);
  const footRow = Math.floor((b.y + b.h) / TILE);
  expect(footRow, '应落在阶梯斜面带').toBeGreaterThanOrEqual(352);
  const cy = b.y + 21;
  const hooks = mkHooks(w);   // ★2026-09-02 补桩:该用例漏建 hooks(492cde03 半成品),否则 142 行 ReferenceError
  for (const [label, vx, vy] of [['steep', 11.4, 8], ['shallow', 13, 5], ['down', 5, 12]] as [string, number, number][]) {
      const __trace = label === 'steep';
    const bom = new Boomerang(b.x + 10, cy, vx, vy, 25, 8, 33, 1);
    if (__trace) console.log('TRC0 ctor vy=', bom.vy, 'y=', bom.y);
    bom.x -= bom.w / 2; bom.y -= bom.h / 2;
    if (__trace) console.log('TRC0 adj y=', bom.y, 'b.y=', b.y, 'cy=', cy);
    let minYAboveStart = 0;
    let maxX = 0;
    for (let t = 0; t < 60 && !bom.dead; t++) {
      bom.fixedUpdate(1 / 60, hooks);
      if (__trace && t % 3 === 0) console.log('TRC', t, 'dx=', Math.round(bom.cx - (b.x + 10)), 'dy=', Math.round(bom.cy - cy), 'v=', Math.round(bom.vx * 10) / 10, Math.round(bom.vy * 10) / 10);
      maxY_OFFSET_CHECK: void 0;
      maxX = Math.max(maxX, bom.cx - (b.x + 10));
      // 「向上弹射锁死」特征:长时间位于出生点上方 >24px
      if (bom.cy < cy - 24) minYAboveStart++;
    }
    expect(maxX, `${label} 应向右推进 ≥48px`).toBeGreaterThan(48);
    // 允许单次反弹过冲,但不得长期悬挂在出生点上方 24px 以上
    expect(minYAboveStart, `${label} 高位滞留 tick ${minYAboveStart}/60 应 ≤18`).toBeLessThanOrEqual(18);
  }
});
