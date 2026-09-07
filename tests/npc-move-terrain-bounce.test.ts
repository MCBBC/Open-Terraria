// NPC 移动域行为日志样本回归（behavior-log-Starter_World-2026-09-07T09-24-49-198Z.json）：
//
// ① v_200(FemaleZombie, aiStyle 3) 坡楔弹跳 —— 用户实报"NPC 在地形里来回无法脱离"。
//    现场（meta.terrain 3183-3189/363-371，slope2 台阶 + 头顶石檐 (3187,365) + 右壁列
//    3188）：僵尸沿 slope2 上行到楔点后永久 ±2px 弹跳（log 12 帧：vx 恒 0.87 从不
//    归零、x 50987↔50991、g 交替、hw 恒 false）。定谳：AI_003 卡死计数链
//    （position.X == oldPosition.X → ai3++，NPC.cs:57703；满 num58=60 → 停索敌
//    :57732 → 游荡转向 :57783-57797）在本仓被物理侧饿死 —— slopeCollide 缺口
//    短途支（TileCollision.ts shortfall X-slide）偏离原版 Collision.cs:2004-2033：
//    原版每截短 tick 按精确差额 num9 滑移并清零 velocity.X/Y（:2016-2017
//    vector3.X=0f; vector3.Y=0f），本仓一次性 4px 推离且不清 vx → x 永不静止
//    → ai3 恒卡 1 → 永不转向。物理侧修复属 TileCollision 车道（本文件不含）。
//    本测试锁定【AI 侧链路】在 vanilla 前提（楔点每拍位置恒等 + vx 归零）下
//    必须走完 卡死计数→停索敌→转向→走出 全链 —— 任何人削弱
//    `this.x === this.fighterPrevX` 计数、游荡计数保持或转向状态机即刻爆红。
//
// ② v_2(Demon Eye, aiStyle 2 飘浮眼——非僵尸, 僵尸=NPCID 3) 坑内反复"跳-落" ——
//    log 的 vy 反复 -1（配 g=true）即 AI_002 碰撞反弹的【最小弹速地板】：
//    velocity.Y = oldVelocity.Y * -0.5f 后 (−1,0) 域抬到 −1（NPC.cs:52849-52855）、
//    X 侧 (−2,0)/(0,2) 抬到 ∓2（:52841-52847）；本仓 Enemy.ts floatEyeAI 逐字在位。
//    原版 AI_002 无任何跳跃冷却/脱离机制——目标不可达时无限反弹=原版本体。
//    本测试锁定反弹地板的 vanilla 数值。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeGame(name: string): GameHooks {
  const world = new World(96, 64, 13, name);
  world.groundLevel = 16;
  world.rockLevel = 32;
  return {
    world, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

type Cell = [number, number, number, number, number, number];

function buildCells(w: World, cells: Cell[]): void {
  const st = w.store;
  for (const [x, y, t, s, h] of cells) {
    st.setTileSilent(x, y, t, 0, 0);
    if (s) st.setSlope(x, y, s);
    if (h) st.half[st.idx(x, y)] = 1;
  }
}

// log meta.terrain cols 3183-3189 / rows 363-371（归一化 −3163/−341）非空格逐格搬运：
// slope 值取 log field[1]。楔 = slope2 台阶 (23,28)s2+(24,27)s2 上行、头顶檐 (22,24)/(24,24)
// 行 24（log row 365）实心封顶、右壁列 25-26（log 3188-3189）rows 25-28 实心。
const WEDGE: Cell[] = [
  [20, 22, 113, 0, 0, 0], [21, 22, 113, 0, 0, 0], [22, 22, 113, 0, 0, 0], [23, 22, 113, 0, 0, 0], [24, 22, 113, 0, 0, 0], [25, 22, 11, 0, 0, 0],
  [20, 23, 97, 0, 0, 0], [21, 23, 97, 0, 0, 0], [22, 23, 97, 0, 0, 0], [23, 23, 97, 0, 0, 0], [24, 23, 113, 0, 0, 0],
  [22, 24, 97, 4, 0, 0], [23, 24, 97, 0, 0, 0], [24, 24, 97, 0, 0, 0], [25, 24, 113, 0, 0, 0],
  [25, 25, 97, 0, 0, 0], [26, 25, 113, 0, 0, 0],
  [25, 26, 97, 0, 0, 0], [26, 26, 97, 0, 0, 0],
  [24, 27, 97, 2, 0, 0], [25, 27, 97, 0, 0, 0], [26, 27, 97, 0, 0, 0],
  [23, 28, 97, 2, 0, 0], [24, 28, 97, 0, 0, 0], [25, 28, 97, 0, 0, 0], [26, 28, 97, 3, 0, 0],
  [20, 29, 97, 2, 0, 0], [21, 29, 97, 0, 0, 0], [22, 29, 97, 0, 0, 0], [23, 29, 97, 0, 0, 0], [24, 29, 97, 3, 0, 0], [25, 29, 77, 0, 0, 0],
  [20, 30, 97, 0, 0, 0], [21, 30, 97, 0, 0, 0], [22, 30, 97, 0, 0, 0], [23, 30, 97, 0, 0, 0], [25, 30, 77, 0, 0, 0],
];

// v_200 楔点（log cx 50989→归一化 381.5±；探针实测现行物理弹跳驻留 cx≈382.9, cy≈420.1）
const WEDGE_PIN_X = 382.9 - 9;   // 左上 x = cx − w/2（w=18）
const WEDGE_PIN_Y = 420.1 - 20;  // 顶 y = cy − h/2（h=40）

describe('v_200 坡楔卡死链（AI_003, NPC.cs:57703→:57732→:57783）', () => {
  it('vanilla 缺口前提（楔点位置恒等+vx 归零）下：ai3 计满 60 → 停索敌 → 转向 → 走出楔', () => {
    const game = makeGame('v200-wedge');
    buildCells(game.world, WEDGE);
    const z = Enemy.fromVanilla(200, WEDGE_PIN_X, WEDGE_PIN_Y);
    if (!z) throw new Error('v_200 构造失败');
    // log 玩家 (3193,342)→归一化 (30,1)：楔右上方，引其向右楔入（log dir 恒 1）
    const player = { x: 30 * 16, y: 1 * 16, w: 20, h: 42, cx: 30.5 * 16, cy: 1.5 * 16, dead: false };
    (game as { player: unknown }).player = player;
    const e = z as unknown as { ai3: number; facing: number };
    let turned = -1, escaped = -1;
    for (let t = 0; t < 600; t++) {
      z.fixedUpdate(1 / 60, game);
      // —— vanilla shortfall 前提注入（Collision.cs:2016-2017 等价观测量）：
      // 面朝右（楔入向）期间强制楔点平衡：位置恒等 + velocity.X 归零。
      // （物理侧修复落地后此注入即冗余——x 本就静止、vx 本就被清零）
      if (e.facing === 1) { z.x = WEDGE_PIN_X; z.vx = 0; }
      if (turned < 0 && e.facing === -1) turned = t;
      if (turned >= 0 && escaped < 0 && z.cx < WEDGE_PIN_X + 9 - 8) escaped = t;  // 左移 ≥8px
    }
    // 卡死计数必须计满（现行 bug 态=恒卡 1，见文件头定谳）
    expect(e.ai3).toBeGreaterThanOrEqual(60);
    expect(turned).toBeGreaterThanOrEqual(0);            // 转向必发生（log 态=永不转向）
    expect(turned).toBeLessThan(200);                    // vanilla 节奏 ≈ 60+2 tick
    expect(escaped).toBeGreaterThanOrEqual(0);           // 转向后走出楔（log 态=原地弹跳）
  });
});

// v_2 反弹地板夹具：平地 + 右壁（log cols 3192-3215/rows 333-351 的口袋同构简化，
// 103 石砖对应 log 围岩类型；反弹地板断言只需平面几何）
function buildEyePocket(w: World): void {
  const st = w.store;
  for (let x = 20; x <= 38; x++) st.setTileSilent(x, 30, 103, 0, 0);   // 地板 row30
  for (let y = 26; y <= 29; y++) st.setTileSilent(34, y, 103, 0, 0);   // 右壁 col34
}

describe('v_2 飘浮眼反弹地板（AI_002, NPC.cs:52841-52855）', () => {
  it('落地反弹：vy=oldVy×−0.5 落 (−1,0) 域 → 恰 −1（log 实录 vy 反复 -1 且 g=true）', () => {
    const game = makeGame('v2-bounce-y');
    buildEyePocket(game.world);
    const eye = Enemy.fromVanilla(2, 30 * 16, 28 * 16);
    if (!eye) throw new Error('v_2 构造失败');
    // 玩家在眼下下方 → dirY=1 俯冲触地；dirX=1 无右墙干扰（col34 墙在 64px 外）
    const player = { x: 32 * 16, y: 29 * 16, w: 20, h: 42, cx: 32.5 * 16, cy: 29.5 * 16, dead: false };
    (game as { player: unknown }).player = player;
    let bounced = -1;
    for (let t = 0; t < 120 && bounced < 0; t++) {
      eye.fixedUpdate(1 / 60, game);
      if (eye.onGround) bounced = t;
    }
    expect(bounced).toBeGreaterThanOrEqual(0);           // 必须先落地
    expect(eye.vy).toBe(-1);                             // vanilla :52854 最小弹速地板
  });

  it('撞墙反弹：vx=oldVx×−0.5 落 (−2,0) 域且 direction=1 → 恰 −2（vanilla :52845-52847）', () => {
    const game = makeGame('v2-bounce-x');
    buildEyePocket(game.world);
    const eye = Enemy.fromVanilla(2, 30 * 16, 27 * 16);
    if (!eye) throw new Error('v_2 构造失败');
    // 玩家在右壁(col34)另一侧等高 → dirX=1 引其撞壁；dirY=-1 微上飘避开地板
    const player = { x: 36 * 16, y: 25 * 16, w: 20, h: 42, cx: 36.5 * 16, cy: 25.5 * 16, dead: false };
    (game as { player: unknown }).player = player;
    let hit = -1;
    for (let t = 0; t < 300 && hit < 0; t++) {
      eye.fixedUpdate(1 / 60, game);
      if (eye.hitWall) hit = t;
    }
    expect(hit).toBeGreaterThanOrEqual(0);               // 必须先撞壁
    expect(eye.vx).toBe(-2);                             // vanilla :52846 最小反弹速度
  });
});
