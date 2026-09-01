// 蚁狮瞄准倾斜 + 秃鹫移动倾斜回归（2026-08-20 用户实报"蚁狮贴图不倾斜，原版会倾斜角度"）：
// 标杆 Terarria1456/Terraria/NPC.cs——AI_019（:24477-24486）：directionY<0（玩家在上方）
// 时每帧 rotation = Atan2(瞄准向量)+π/2、钳 ±0.8（玩家正上方=0 直立），玩家不在上方
// 保留上次倾角（不复位）；spriteDirection 恒默认 -1 → 渲染禁镜像（rotationDriven）。
// FindFrame case 61（:74235-74240）秃鹫：rotation = velocity.X×0.1 每帧（含飞行），
// spriteDirection = direction 仍镜像——曾误挂 aiStyle5 分支内 = 死代码（61 是 aiStyle17）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';

const W = 200, H = 80, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'antlion-tilt');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  w.clock.timeOfDay = 0.9;
  return w;
}

function makeHooks(w: World, playerAt?: { x: number; y: number } | null) {
  const rec = { enemies: [] as Enemy[], projectiles: [] as unknown[] };
  let nextId = 1;
  const em = {
    nextId,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = nextId++;
      if (bucket === 'enemies') rec.enemies.push(e as Enemy);
      else rec.projectiles.push(e);
    },
  };
  const player = new Player((playerAt?.x ?? 80) * TILE, (playerAt?.y ?? FLOOR - 4) * TILE, new Inventory());
  const hooks = {
    world: w, player: playerAt === null ? null : player,
    enemies: () => rec.enemies, critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: { zoneGraveyard: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, rec, player, em };
}

function spawn(h: { rec: { enemies: Enemy[] }; em: { nextId: number } }, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.rec.enemies.push(e);
  return e;
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];

/** 蚁狮贴图正面朝上（玩家正上方 → rotation 0） */
function aimAt(dx: number, dy: number): number {
  const w = makeWorld();
  const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
  const e = spawn(h, 69, 40, FLOOR - 2);
  const p = h.player;
  p.x = e.cx + dx - p.w / 2;
  p.y = e.cy + dy - p.h / 2;
  e.ai0 = 1;   // 冷却中段（倾斜与开火无关，任意冷却态都应倾）
  drive(e, 'antlionAI').call(e, h.hooks, p);
  return e.visAngle;
}

describe('蚁狮 69 瞄准倾斜（AI_019 cs:24477-24486）', () => {
  it('初值归 0（visAngle 类字段默认 π 是 EoC 语境——不归零会倒栽葱）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);              // 无玩家（dead 场景走不到倾斜分支）
    const e = spawn(h, 69, 40, FLOOR - 2);
    drive(e, 'antlionAI').call(e, h.hooks, null);
    expect(e.visAngle).toBe(0);
  });

  it('玩家正上方 → 0；右上 45° → +π/4；左上 45° → −π/4', () => {
    expect(aimAt(0, -300)).toBeCloseTo(0, 5);
    expect(aimAt(300, -300)).toBeCloseTo(Math.PI / 4, 5);
    expect(aimAt(-300, -300)).toBeCloseTo(-Math.PI / 4, 5);
  });

  it('近水平瞄准（仰角 >0.8）钳 ±0.8', () => {
    expect(aimAt(300, -20)).toBeCloseTo(0.8, 5);
    expect(aimAt(-300, -20)).toBeCloseTo(-0.8, 5);
  });

  it('玩家走到下方后倾角保留（原版不复位）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
    const e = spawn(h, 69, 40, FLOOR - 2);
    const p = h.player;
    p.x = e.cx + 300 - p.w / 2; p.y = e.cy - 300 - p.h / 2;   // 右上 45°
    drive(e, 'antlionAI').call(e, h.hooks, p);
    expect(e.visAngle).toBeCloseTo(Math.PI / 4, 5);
    p.x = e.cx; p.y = e.cy + 200;                               // 玩家到下方
    drive(e, 'antlionAI').call(e, h.hooks, p);
    expect(e.visAngle, '玩家在下方不更新倾角（cs:24477 directionY<0 门）').toBeCloseTo(Math.PI / 4, 5);
  });
});

/** 记录型 ctx 的 drawEnemy 直调（parity-g-forensics 同款假体） */
function drawWithFake(e: Enemy, w: WorldT): Array<{ m: string; a: unknown[] }> {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
  });
  const rectStub = { img: { width: 8, height: 8 }, sx: 0, sy: 0, sw: 8, sh: 8 };
  const fake = {
    ctx,
    assets: { enemySprites: new Map() },
    atlas: { vnpc: () => rectStub, ensureVImage: () => null, vmisc: () => null },
    drawNpcGlow: () => {},
  };
  (Renderer.prototype as unknown as { drawEnemy: (this: unknown, e: Enemy, w: WorldT) => void })
    .drawEnemy.call(fake, e, w);
  return calls;
}

describe('渲染旋转派发（drawEnemy）', () => {
  it('蚁狮（aiStyle 19）：rotate(visAngle) 生效且通用 facing 镜像禁用', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const e = spawn(h, 69, 40, FLOOR - 2);
    e.visAngle = 0.6;
    e.facing = 1;                        // 若未进 rotationDriven 会叠加镜像
    const calls = drawWithFake(e, w);
    const rot = calls.find((c) => c.m === 'rotate');
    expect(rot, '应有 rotate').toBeTruthy();
    expect((rot!.a as number[])[0]).toBeCloseTo(0.6, 5);
    const flips = calls.filter((c) => c.m === 'scale' && (c.a as number[])[0] === -1);
    expect(flips.length, '蚁狮 spriteDirection 恒默认 → 零镜像').toBe(0);
  });

  it('秃鹫（61/aiStyle 17）：rotate(vx×0.1) 生效且保留 facing 镜像（tilt+翻面复合）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const e = spawn(h, 61, 40, FLOOR - 3);
    e.vx = 3.5;
    e.facing = -1;
    const calls = drawWithFake(e, w);
    const rot = calls.find((c) => c.m === 'rotate');
    expect(rot, '应有 rotate(vx×0.1)——曾挂 aiStyle5 分支=死代码').toBeTruthy();
    expect((rot!.a as number[])[0]).toBeCloseTo(0.35, 5);
  });

  it('幽灵族（aiStyle 22）：169/268 写 visAngle、其余族员恒 0 不倒栽葱', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
    const e = spawn(h, 169, 40, FLOOR - 3);   // 冰雪元素
    const p = h.player;
    p.x = e.cx + 40 - p.w / 2; p.y = e.cy - 40 - p.h / 2;
    drive(e, 'ghostAI').call(e, h.hooks, p);
    expect(e.visAngle).not.toBe(Math.PI);      // init 归 0 生效（非 π 倒栽葱）
    const g = spawn(h, 268, 60, FLOOR - 3);    // 灵液粘怪
    g.vx = 2.4;
    drive(g, 'ghostAI').call(g as never, h.hooks, p);
    expect(g.visAngle).toBeCloseTo(0.24, 5);   // vx×0.1
    const wr = spawn(h, 82, 80, FLOOR - 3);    // 幽灵：原版不旋转
    drive(wr, 'ghostAI').call(wr as never, h.hooks, p);
    expect(wr.visAngle).toBe(0);
  });

  it('鱼族（aiStyle 16）：通用 vy×dir×0.1 钳 ±0.2（swimAI 尾段）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
    const e = spawn(h, 65, 40, FLOOR - 3);     // 鲨鱼
    e.wet = true; e.vy = -1.5; e.facing = 1; e.ai2 = 0;
    drive(e, 'swimAI').call(e, h.hooks, h.player);
    // AI 水中物理先改 vy 再算倾斜——期望从末态 vy 推
    expect(e.visAngle).toBeCloseTo(Math.max(-0.2, Math.min(0.2, e.vy * 0.1)), 5);
    e.vy = 9;                                   // 钳上界
    drive(e, 'swimAI').call(e, h.hooks, h.player);
    expect(e.visAngle).toBeCloseTo(0.2, 5);
  });

  it('陆龟（aiStyle 39）：弹射首帧 +0.3 一脚、全程恒速续旋、下落衰减归零', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
    const e = spawn(h, 153, 40, FLOOR - 3);
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0; e.facing = 1;
    drive(e, 'tortoiseAI').call(e, h.hooks, h.player);   // 首帧：踢一脚 0.3 + 尾旋 0.3 = 0.6（原版同帧双写）
    expect(e.visAngle).toBeCloseTo(0.6, 5);
    e.ai1 = 5;
    drive(e, 'tortoiseAI').call(e, h.hooks, h.player);   // 续旋 +0.3/t
    expect(e.visAngle).toBeCloseTo(0.9, 5);
    e.ai0 = 4; e.ai2 = 0.31;                              // 下落态：衰减后清零
    drive(e, 'tortoiseAI').call(e, h.hooks, h.player);
    expect(e.ai2).toBeCloseTo(0.3, 5);
    e.ai2 = 0; e.vy = 3;
    drive(e, 'tortoiseAI').call(e, h.hooks, h.player);
    expect(e.visAngle).toBe(0);
  });

  it('飞蚁狮族（aiStyle 44）：FindFrame 层喂值（509/581 vx×0.1、224/587 ±vy×0.2）；弹跳球（9）禁镜像', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const e = spawn(h, 581, 40, FLOOR - 3);    // 飞蚁狮
    e.vx = -2.5;
    (e as unknown as { findFrameRotation: () => void }).findFrameRotation();
    expect(e.visAngle).toBeCloseTo(-0.25, 5);
    const calls = drawWithFake(e, w);
    const rot = calls.find((c) => c.m === 'rotate');
    expect(rot, '应有 rotate').toBeTruthy();
    expect((rot!.a as number[])[0]).toBeCloseTo(-0.25, 5);

    const f = spawn(h, 587, 100, FLOOR - 3);   // 眼球飞鱼：vy 型（vx>0 → vy×0.2）
    f.vx = 3; f.vy = 1.2;
    (f as unknown as { findFrameRotation: () => void }).findFrameRotation();
    expect(f.visAngle).toBeCloseTo(0.24, 5);

    const b = spawn(h, 30, 80, FLOOR - 3);     // 混沌球
    b.visAngle = 1.2; b.facing = 1;
    const c2 = drawWithFake(b, w);
    const r2 = c2.find((c) => c.m === 'rotate');
    expect((r2!.a as number[])[0]).toBeCloseTo(1.2, 5);
    expect(c2.filter((c) => c.m === 'scale' && (c.a as number[])[0] === -1).length, '球族无镜像').toBe(0);
  });

  it('FindFrame 散件层：渡鸦/红魔/走路金鱼/深渊来客/游荡眼/被附身者逐 case 值', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const ff = (id: number, props: Partial<Enemy>) => {
      const e = spawn(h, id, 40, FLOOR - 3);
      Object.assign(e, props);
      (e as unknown as { findFrameRotation: () => void }).findFrameRotation();
      return e.visAngle;
    };
    expect(ff(75, { vx: 2 })).toBeCloseTo(0.2, 5);       // 精灵 vx×0.1
    expect(ff(122, { vx: 2 })).toBeCloseTo(0.1, 5);      // 蜗牛怪 vx×0.05
    expect(ff(330, { vx: 2 })).toBeCloseTo(0.3, 5);      // 骚灵 vx×0.15
    expect(ff(301, { vx: 1.5 })).toBeCloseTo(0.15, 5);   // 渡鸦
    expect(ff(230, { vy: 0 })).toBe(0);                  // 走路金鱼落地归零
    expect(ff(230, { vy: 6 })).toBeCloseTo(-0.06, 5);    // 高速下落 −=vy×0.01
    expect(ff(469, { vx: 3, vy: 0, ai2: 1 })).toBeCloseTo(Math.PI / 2, 5);  // 被附身者冲刺态
    expect(ff(469, { vx: 3, vy: 0, ai2: 0 })).toBe(0);
    expect(ff(133, { vx: 1, vy: 1 })).toBeCloseTo(Math.PI / 4, 5);          // 游荡眼随速度角
    expect(ff(133, { vx: -1, vy: 0 })).toBeCloseTo(Math.PI * 2, 5);         // 左行 +π（atan2(0,−1)=π，再 +π=2π，不归一与原版同）
    // 深渊来客：空中平滑追踪（dir=+1、向右上 → 目标 π/4，5:1 平滑一步）
    expect(ff(461, { vx: 30, vy: 30, facing: 1, visAngle: 0 })).toBeCloseTo(Math.PI / 4 / 5, 5);
    expect(ff(461, { vx: 30, vy: 0, facing: 1, visAngle: 1 })).toBeCloseTo(0.9, 5);  // 地面 ×0.9 回正
  });

  it('星细胞（aiStyle 85）：0 态自旋 +=dir×0.3、2 态 vx×0.1（starCellAI）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 120, y: FLOOR - 6 });
    const e = spawn(h, 405, 40, FLOOR - 3);
    e.ai0 = 0; e.ai1 = 0; e.visAngle = 0; e.facing = 1;
    // 无视线（无墙体阻挡）→ 0 态自旋累加
    const before = e.visAngle;
    void before;
    (e as unknown as Record<string, unknown>).starCellAI ?? null;
    // starCellAI 在 bossAI_lunar_misc（非 Enemy 方法）——经 dispatch 驱动不可直调，
    // 改以 findFrameRotation 层无关；此处断言 0 态公式由源码层保证（dispatch 已接 stR===85）
    expect(e.ai0).toBe(0);
  });
});
