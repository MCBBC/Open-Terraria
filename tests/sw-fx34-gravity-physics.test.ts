// SW-FX34 反重力波 4——物理余量（1457 金标逐锚；gd=1 逐位恒等主判据 + 倒挂逐面行为）。
//  金标：Player.cs:22203-22383（WingMovement 双半边）/ :26974-26976（canRocket 双臂）/
//  :27126-27153（火箭推力双臂）/ :22018-22045（CarpetMovement 续期双臂）/ :27580-27596
//  （湿态重力+终端钳双臂）/ :28267-28278（StepUp/Down 门倒挂臂）/ Collision.cs:3641-3779
//  （StepUp else 支）/ Collision.cs:1691-1795 + Player.cs:23610（WalkDownSlope 门值
//  gravity*gravDir）/ :28463-28471（±0.01 顶头臂）/ :23899-23912（FloorVisuals 倒挂地板行）。
//  ★变异证红：每组注明「旧实现退化值」——回退任一刀对应组必红。
//  ★测试世界注：groundLevel 缺省 0 → 深度重力 num6 钳 0.25（y/16<60.13 带）/1（脚下带）；
//  全部积分断言放在 y/16>60.13（row 61+）带 = GRAVITY 全值 0.4。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { moveAndCollide, walkDownSlopePre } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { TILE, GRAVITY, PLAYER_JUMP_SPEED } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { drownCollision } from '../src/stats/TouchDamage';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import type { Body } from '../src/physics/TileCollision';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};
const SAND_ID = TILE_BY_KEY['sand'];
const STONE_ID = TILE_BY_KEY['stone'] ?? 1;
const JS = PLAYER_JUMP_SPEED;   // 5.01（裸装 jumpSpeed）

function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    vanillaDust: { spawn: () => null } as never,
  } as unknown as GameHooks;
}

/** 平地世界（地板 70/71 行石；row 61+ 带 GRAVITY 全值） */
function flatWorld(): World {
  const w = new World(480, 120, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, STONE_ID, 0, 0);
    w.store.setTileSilent(x, 71, STONE_ID, 0, 0);
  }
  return w;
}

/** 竖井世界：顶 62/63 行石（底=1024）、地板 68 行（顶=1088），中间 64px 净空 */
function shaftWorld(): World {
  const w = new World(480, 120, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 62, STONE_ID, 0, 0);
    w.store.setTileSilent(x, 63, STONE_ID, 0, 0);
    w.store.setTileSilent(x, 68, STONE_ID, 0, 0);
  }
  return w;
}

/** 触达 wingMovement 私有方法（值表级单测） */
function wingMove(p: Player, wings: number, hoverDown: boolean, js: number): void {
  (p as unknown as { wingMovement(w: number, h: boolean, j: number): void })
    .wingMovement(wings, hoverDown, js);
}
const mkWing = (gd: 1 | -1): Player => {
  const p = new Player(0, 0, new Inventory());
  p.gravDir = gd;
  return p;
};

describe('SW-FX34 域A：WingMovement 反重力半边（Player.cs:22203-22383）', () => {
  it('A1 gd=1 恒等：26 号翼值表逐位不变（旧实现退化值=本组断言值）', () => {
    const p1 = mkWing(1); p1.vy = 2;
    wingMove(p1, 26, false, JS);                 // num=.125 num2=.75 num3=2.5 num4=1 num5=.15
    expect(p1.vy).toBeCloseTo(1.125, 12);        // 2-0.125-0.75（下落减速档）
    const p2 = mkWing(1); p2.vy = -1;
    wingMove(p2, 26, false, JS);
    expect(p2.vy).toBeCloseTo(-1.275, 12);       // -1-0.125-0.15（上升微推档）
    const p3 = mkWing(1); p3.vy = -20;
    wingMove(p3, 26, false, JS);
    expect(p3.vy).toBeCloseTo(-JS * 2.5, 12);    // :22347 上升帽 -jumpSpeed*num3
    expect(p3.wingTime).toBe(-1);                // :22366 非 hover 下落档 1/tick
  });

  it('A2 gd=-1 镜像：26 号翼倒挂值表（变异=删 else 镜像臂 → 本组红）', () => {
    const p1 = mkWing(-1); p1.vy = -2;
    wingMove(p1, 26, false, JS);
    expect(p1.vy).toBeCloseTo(-1.125, 12);       // :22349 镜像：-2+0.125+0.75
    const p2 = mkWing(-1); p2.vy = 1;
    wingMove(p2, 26, false, JS);
    expect(p2.vy).toBeCloseTo(1.275, 12);        // 1+0.125+0.15（倒挂"上升"=世界向下）
    const p3 = mkWing(-1); p3.vy = 20;
    wingMove(p3, 26, false, JS);
    expect(p3.vy).toBeCloseTo(JS * 2.5, 12);     // :22358 帽 +jumpSpeed*num3
  });

  it('A3 4 号翼 hover 独占支镜像（:22205 `-=0.2f*gravDir` + :22220 else 臂）', () => {
    const up = mkWing(1); up.inputUp = true; up.vy = 2;   // tryingToHoverUp=controlUp
    wingMove(up, 4, false, JS);
    expect(up.vy).toBeCloseTo(0.8, 12);          // 2-0.2-1
    expect(up.wingTime).toBe(-2);                // :22232 ×2 消耗
    const dn = mkWing(-1); dn.inputUp = true; dn.vy = -2;
    wingMove(dn, 4, false, JS);
    expect(dn.vy).toBeCloseTo(-0.8, 12);         // :22220 镜像：-2+0.2+1
    expect(dn.wingTime).toBe(-2);
  });

  it('A4 gd=-1 44 号翼 hover 推力 ×gravDir（:22324 `-=0.4f*gravDir`）', () => {
    const dn = mkWing(-1); dn.inputUp = true; dn.vy = -2;
    wingMove(dn, 44, false, JS);
    // 链：hover 臂 -2+0.4=-1.6 →镜像 +1=-0.6 → 主体 -(-0.125)=-0.475 → 镜像 +0.85=+0.375
    //（44 号 hover 臂与主体同拍叠加=原文结构;变异=删 ×gravDir → 链变 -0.425 本组红）
    expect(dn.vy).toBeCloseTo(0.375, 12);
  });
});

describe('SW-FX34 域B：canRocket 门双臂（Player.cs:26974-26976）', () => {
  it('B1 gd=1 恒等：vy>-jumpSpeed 臂（旧实现退化值=true）', () => {
    const w = flatWorld();
    const p = new Player(60 * TILE, 65 * TILE, new Inventory());
    p.gravDir = 1; p.vy = 3; p.canRocket = false;
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.canRocket).toBe(true);
  });

  it('B2 gd=-1 臂：vy<jumpSpeed（变异=删倒挂臂 → 两例均翻转本组红）', () => {
    const w = flatWorld();
    // 倒挂坠落（世界向上 vy=-8）→ -8 < 5.01 → 可点火箭（旧 gd=1 形误判 false）
    const p = new Player(60 * TILE, 65 * TILE, new Inventory());
    p.gravDir = -1; p.vy = -8; p.canRocket = false;
    p.buffs.apply(BuffType.Gravitation, 600);      // 倒挂态每拍由 buff 维持（:26933 else 支复位）
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.canRocket).toBe(true);
    // 倒挂跳升段（世界向下 vy=8）→ 8 < 5.01 假 → 不可点
    const q = new Player(60 * TILE, 65 * TILE, new Inventory());
    q.gravDir = -1; q.vy = 8; q.canRocket = false;
    q.buffs.apply(BuffType.Gravitation, 600);
    q.fixedUpdate(1 / 60, makeGame(w));
    expect(q.canRocket).toBe(false);
  });
});

describe('SW-FX34 域C：火箭推力脉冲双臂（Player.cs:27126-27153）', () => {
  it('C1 gd=1 恒等：0.1/0.5/1.5 档（旧实现退化值=+0.2 终值）', () => {
    const w = flatWorld();
    const p = new Player(60 * TILE, 65 * TILE, new Inventory());
    p.gravDir = 1; p.vy = 0; p.rocketDelay = 1;
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.vy).toBeCloseTo(0.2, 9);            // 推力 -0.2 → 重力 +0.4
  });

  it('C2 gd=-1 镜像臂：终值 -0.2（变异=删镜像 → 符号翻转本组红）', () => {
    const w = flatWorld();
    const p = new Player(60 * TILE, 65 * TILE, new Inventory());
    p.gravDir = -1; p.vy = 0; p.rocketDelay = 1;
    p.buffs.apply(BuffType.Gravitation, 600);
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.vy).toBeCloseTo(-0.2, 9);           // 推力 +0.2 → 倒挂重力 -0.4
  });
});

describe('SW-FX34 域D：飞毯续期双臂（Player.cs:22038-22045）', () => {
  function carpetPlayer(gd: 1 | -1, vy0: number): { p: Player; w: World; game: GameHooks } {
    const w = flatWorld();
    const p = new Player(60 * TILE, 65 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(934), stack: 1 };   // 飞毯（vanilla-accfx.json carpet:1）
    p.gravDir = gd; p.vy = vy0;
    if (gd === -1) p.buffs.apply(BuffType.Gravitation, 600);
    p.carpetTime = 300;                            // 已激活毯（倒挂禁新激活不限制续期 :22041）
    p.extraJumps = [];                             // :22020 全部二段跳耗尽门
    p.inputJump = true;
    return { p, w, game: makeGame(w) };
  }

  it('D1 gd=1 恒等：钉 -(gravity+ε) → 重力后 ≈ -ε（旧无条件写同值）', () => {
    const { p, game } = carpetPlayer(1, 3);
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeLessThan(0);
    expect(Math.abs(p.vy)).toBeLessThan(1e-5);
  });

  it('D2 gd=-1 续期臂：钉 +(gravity+ε)（变异=删臂 → 旧无条件写 -0.8 本组红）', () => {
    const { p, game } = carpetPlayer(-1, -2);      // 倒挂"坠落"=世界向上 → 过门 vy<gravity
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeGreaterThan(0);
    expect(Math.abs(p.vy)).toBeLessThan(1e-5);
  });

  it('D3 gd=-1 门右端：世界向下 vy=3 不过门 → 纯倒挂重力 2.6', () => {
    const { p, game } = carpetPlayer(-1, 3);
    p.fixedUpdate(1 / 60, game);
    expect(p.vy).toBeCloseTo(2.6, 9);
  });
});

describe('SW-FX34 域E：StepUp 倒挂半边（Collision.cs:3641-3779 else 支 + Player.cs:28273-28275）', () => {
  /** 天花板世界：顶 62/63 行石；[x1..x2] 列 64 行凸台阶（倒挂的"上台阶"） */
  function ceilingWorld(x1: number, x2: number): World {
    const w = new World(480, 120, 30, 'open');
    for (let x = 0; x < w.w; x++) {
      w.store.setTileSilent(x, 62, STONE_ID, 0, 0);
      w.store.setTileSilent(x, 63, STONE_ID, 0, 0);
    }
    for (let x = x1; x <= x2; x++) w.store.setTileSilent(x, 64, STONE_ID, 0, 0);
    return w;
  }

  function invBody(w: World, xPx: number, yPx: number): Body {
    return {
      x: xPx, y: yPx, w: 20, h: 42, vx: 3, vy: 0,
      onGround: false, hitWall: false, hitHead: false,
      gravDir: -1, stepUp: true, stepUpInvGate: true, stepUpHolds: false,
      stepDownGate: 'gravity',
    };
  }

  it('E1 gd=-1 倒挂上台阶：身体顶边下移 16px 贴台阶格底 + 清 vy（变异=不调 applyStepUpInv → 红）', () => {
    const w = ceilingWorld(40, 50);
    const b = invBody(w, 40 * TILE - 20, 64 * TILE);   // 右缘 640 顶台阶列；探柱携 vx=3 入柱
    moveAndCollide(b, w, 0, 0);                        // dx=0：单验 StepUp 探柱步进本身
    expect(b.y).toBe(65 * TILE);                       // 顶边 1024 → 1040（台阶格 64 底）
    expect(b.vy).toBe(0);                              // :3773 velocity.Y=0f（normal 半边无此写）
  });

  it('E2 gd=-1 门关闭（玩家侧门否域）不踏', () => {
    const w = ceilingWorld(40, 50);
    const b = invBody(w, 40 * TILE - 20, 64 * TILE);
    b.stepUpInvGate = false;                           // =(∨carpet)∧vy<=g∧!controlUp 的否域
    moveAndCollide(b, w, 0, 0);
    expect(b.y).toBe(64 * TILE);
  });

  it('E3 gd=1 恒等：正挂上台阶 16px 抬升照旧（旧实现退化值=1062）', () => {
    const w = flatWorld();
    for (let x = 40; x <= 50; x++) w.store.setTileSilent(x, 69, STONE_ID, 0, 0);  // 1 级台阶
    const b: Body = {
      x: 40 * TILE - 20, y: 70 * TILE - 42, w: 20, h: 42, vx: 3, vy: GRAVITY,
      onGround: false, hitWall: false, hitHead: false,
      stepUp: true, stepUpHolds: false, stepDownGate: 'gravity',
    };
    moveAndCollide(b, w, 0, 0);
    expect(b.y).toBe(69 * TILE - 42);                  // 脚底 1120 → 1104（台阶顶）
  });

  it('E4 StepDown 倒挂零吸附（Collision.StepDown 体不读 gravDir、门 vy==+gravity 恒假=原版逐位同果）', () => {
    const w = shaftWorld();
    // gd=1 恒等孪体：脚下 12px 有地板 → 吸附（既有行为,旧实现退化值=1046）
    const g: Body = {
      x: 100, y: 68 * TILE - 42 - 12, w: 20, h: 42, vx: 1, vy: GRAVITY,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepDownGate: 'gravity',
    };
    moveAndCollide(g, w, 0, 0);
    expect(g.y).toBe(68 * TILE - 42);
    // gd=-1：脚下 12px 有地板也不吸附（门 vy==+GRAVITY 对 -0.4 恒假）
    const b: Body = {
      x: 100, y: 68 * TILE - 42 - 12, w: 20, h: 42, vx: 1, vy: -GRAVITY,
      onGround: false, hitWall: false, hitHead: false,
      gravDir: -1, stepUp: true, stepUpInvGate: false, stepDownGate: 'gravity',
    };
    moveAndCollide(b, w, 0, 0);
    expect(b.y).toBe(68 * TILE - 42 - 12);
  });
});

describe('SW-FX34 域F：WalkDownSlope 门值 gravity*gravDir（Collision.cs:1695 + Player.cs:23610）', () => {
  /** slope1（左高右低）实心坡格 @ (40,66) */
  function slopeWorld(): World {
    const w = flatWorld();
    w.store.setTileSilent(40, 66, STONE_ID, 0, 0);
    w.store.slope[w.store.idx(40, 66)] = 1;
    return w;
  }
  const slopeBody = (gd: 1 | -1 | undefined, vy0: number): { b: Body; w: World } => {
    const w = slopeWorld();
    const b: Body = {
      x: 40 * TILE, y: 66 * TILE + 2 - 42, w: 20, h: 42, vx: 2, vy: vy0,
      onGround: false, hitWall: false, hitHead: false,
      stepUp: true, stepDownGate: 'gravity',
    };
    if (gd !== undefined) b.gravDir = gd;
    return { b, w };
  };

  it('F1 gd=-1 过门（vy=-GRAVITY）：身下坡 quirk 拖拽 vy+=|vx|（变异=门不乘 gravDir → 红）', () => {
    const { b, w } = slopeBody(-1, -GRAVITY);
    walkDownSlopePre(b, w, false);
    expect(b.vy).toBeCloseTo(-GRAVITY + 2, 9);     // :1777 += |Velocity.X|（不镜像=原版 quirk 照单全收）
  });

  it('F2 gd=-1 门关（vy≠-GRAVITY）不加', () => {
    const { b, w } = slopeBody(-1, 0.3);
    walkDownSlopePre(b, w, false);
    expect(b.vy).toBe(0.3);
  });

  it('F3 gd=1 恒等：贴地下坡 vy+=|vx| 照旧（旧实现退化值=+2.4）', () => {
    const { b, w } = slopeBody(undefined, GRAVITY);
    walkDownSlopePre(b, w, false);
    expect(b.vy).toBeCloseTo(GRAVITY + 2, 9);
  });
});

describe('SW-FX34 域G：倒挂顶头臂（Player.cs:28467-28471 vy=-0.01+jump=0）', () => {
  it('G1 倒挂跳向下撞地板：同拍 vy=-0.01 + jumpHold=0（变异=删臂 → 钉地板 re-pin 本组红）', () => {
    const w = shaftWorld();
    const p = new Player(100, 64 * TILE, new Inventory());   // 顶边贴天花板底（1024）
    p.gravDir = -1;
    p.buffs.apply(BuffType.Gravitation, 600);
    const game = makeGame(w);
    p.fixedUpdate(1 / 60, game);                   // t0 落定：吸顶 vy=0
    expect(p.vy).toBe(0);
    p.inputJump = true;                            // t1 跳沿（onGround 延拍置位 → 起跳落 t2）
    for (let i = 0; i < 12; i++) {
      p.fixedUpdate(1 / 60, game);
      if (p.hitDown) break;                        // 命中地板那拍（顶头臂同拍消费）
    }
    expect(p.jumpHold).toBe(0);                    // :28469-28471 同拍取消
    expect(p.vy).toBe(-0.01);                      // :28468 velocity.Y=-0.01f
    expect(p.hitDown).toBe(true);                  // Collision.down 命中拍（非落地）
  });

  it('G2 hitDown 语义：moveAxis dir>0 阻挡置位、上撞不置位', () => {
    const w = flatWorld();
    const b: Body = {
      x: 100, y: 70 * TILE - 42 - 8, w: 20, h: 42, vx: 0, vy: 3,
      onGround: false, hitWall: false, hitHead: false, gravDir: -1,
      stepUp: true, stepDownGate: 'gravity',
    };
    moveAndCollide(b, w, 0, 12);                   // 底 1112+12 越地板顶 1120 → 拦
    expect(b.hitDown).toBe(true);                  // Collision.down
    expect(b.hitHead).toBe(false);
    expect(b.y).toBe(70 * TILE - 42);
    const cw = shaftWorld();
    const u: Body = {
      x: 100, y: 64 * TILE + 4, w: 20, h: 42, vx: 0, vy: -3,
      onGround: false, hitWall: false, hitHead: false, gravDir: -1,
      stepUp: true, stepDownGate: 'gravity',
    };
    moveAndCollide(u, cw, 0, -12);                 // 顶 1028-12 越天花板底 1024 → 拦
    expect(u.hitDown).toBe(false);
    expect(u.hitHead).toBe(true);                  // 倒挂落地=上撞（原版 gd=-1 无 ±0.01）
    expect(u.vy).toBe(0);
  });

  it('G3 gd=1 恒等：上撞顶头 vy=0、无 -0.01 臂（碰撞层钉面;★SW-FX40 已在 Player 层补 :28463-28466 `vy=0.01+jump=0` 臂——本断言钉的是 moveAndCollide 碰撞层语义,两层不冲突,注释重锚不改断言）', () => {
    const w = shaftWorld();
    const b: Body = {
      x: 100, y: 64 * TILE + 4, w: 20, h: 42, vx: 0, vy: -3,
      onGround: false, hitWall: false, hitHead: false, stepUp: true, stepDownGate: 'gravity',
    };
    moveAndCollide(b, w, 0, -12);
    expect(b.vy).toBe(0);                          // 碰撞层清零（SW-FX40 Player 层 +0.01 在其后写）
    expect(b.hitDown).toBe(false);
  });
});

describe('SW-FX34 域H：FloorVisuals 倒挂地板行（Player.cs:23904-23908）', () => {
  function sandWorld(): World {
    const w = new World(480, 120, 30, 'open');
    for (let x = 0; x < w.w; x++) {
      w.store.setTileSilent(x, 63, SAND_ID, 0, 0);       // 倒挂天花板=沙
      w.store.setTileSilent(x, 70, SAND_ID, 0, 0);       // 正挂地板=沙
      w.store.setTileSilent(x, 71, SAND_ID, 0, 0);
    }
    return w;
  }

  it('H1 gd=-1：地板行=身体顶行 → 沙族旗点亮（变异=fy0 不换位 → 红）', () => {
    const w = sandWorld();
    const p = new Player(100, 64 * TILE, new Inventory());
    p.gravDir = -1;
    const game = makeGame(w);
    p.fixedUpdate(1 / 60, game);                   // t0 吸顶（vy=0）
    p.fixedUpdate(1 / 60, game);                   // t1 vy=0 拍刷地板旗
    expect(p.floorTileT).toBe(SAND_ID);
    expect(p.runningOnSand).toBe(true);
  });

  it('H2 gd=1 恒等：脚下一行沙 → 旗亮（旧实现退化值=true）', () => {
    const w = sandWorld();
    const p = new Player(100, 65 * TILE, new Inventory());
    p.gravDir = 1;
    const game = makeGame(w);
    for (let i = 0; i < 20; i++) p.fixedUpdate(1 / 60, game);   // 落地后旗亮
    expect(p.floorTileT).toBe(SAND_ID);
    expect(p.runningOnSand).toBe(true);
  });
});

describe('SW-FX34 域I：湿态重力/终端钳倒挂臂（Player.cs:27580 `+= gravity*gravDir` 镜像）', () => {
  function poolWorld(): World {
    const w = flatWorld();
    for (let x = 40; x <= 60; x++) {
      for (let y = 65; y <= 68; y++) {
        const k = w.store.idx(x, y);
        w.store.liquid[k] = 255;
        w.store.liquidType[k] = 1;                 // LIQUID_TYPE +1 编码：1=水
      }
    }
    return w;
  }

  it('I1 gd=1 恒等：浸没下坠 vy>0（旧实现退化值=正号）', () => {
    const w = poolWorld();
    const p = new Player(50 * TILE, 66 * TILE, new Inventory());
    p.gravDir = 1;
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.vy).toBeGreaterThan(0);
  });

  it('I2 gd=-1：浸没上浮 vy<0（变异=删镜像臂 → 旧 +lGrav 下坠本组红）', () => {
    const w = poolWorld();
    const p = new Player(50 * TILE, 66 * TILE, new Inventory());
    p.gravDir = -1;
    p.buffs.apply(BuffType.Gravitation, 600);
    p.fixedUpdate(1 / 60, makeGame(w));
    expect(p.vy).toBeLessThan(0);
  });
});

describe('SW-FX34 域J：既有倒挂面回归锁（波 1-3 已接线,防回退）', () => {
  it('J1 DrownCollision 倒挂口盒（Collision.cs:1395-1398 口盒 y+13..y+25）', () => {
    const w = new World(480, 120, 30, 'open');     // 120 行：h-40 钳让 66 行可扫描
    const st = w.store;
    for (let x = 40; x <= 60; x++) {
      const k = st.idx(x, 66);
      st.liquid[k] = 255; st.liquidType[k] = 1;
    }
    const px = 50 * TILE, py = 64 * TILE + 12;     // 倒挂口盒 1053..1065 含 66 行
    expect(drownCollision(st, px, py, 20, 42, -1)).toBe(true);
    expect(drownCollision(st, px, py, 20, 42, 1)).toBe(false);   // gd=1 口盒 1034..1046 无水
  });

  it('J2 GetGrapplingForces 446 反重力钩输入 ×gravDir（Player.cs:23003）', () => {
    const p = new Player(0, 0, new Inventory());
    p.x = 100; p.y = 1000;                          // 中心 (110,1021)
    p.grappling[0] = {
      ai0: 2, projType: 446, x: 100, y: 942, cx: 110, cy: 950, rot: 0,
    } as unknown as (typeof p.grappling)[number];   // 锚在头顶 71px
    p.grapCount = 1;                                // 挂钩计数（:22991 循环界）
    p.inputDown = true;
    const gf = (pp: Player): [number, number, number] =>
      (pp as unknown as { getGrapplingForces(): [number, number, number] }).getGrapplingForces();
    p.gravDir = 1;
    const [, vy1] = gf(p);                          // 输入 (0,+1)×100 → 净 (0,171) → 拉下
    p.gravDir = -1;
    const [, vy2] = gf(p);                          // 输入 (0,-1)×100 → 净 (0,-29) → 拉上
    expect(vy1).toBeGreaterThan(0);
    expect(vy2).toBeLessThan(0);
  });
});
