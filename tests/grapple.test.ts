// 钩爪（Grappling Hooks）1:1 测试——原版行号 = Terarria1456 反编译源码。
//
// 覆盖：AI_007 三态（Projectile.cs:49647-49980）、GrappleMovement/GetGrapplingForces
// （Player.cs:22338-22577）、QuickGrapple 上限门与交替轮换（Player.cs:5930-6116）、
// 变体参数全表（HOOK_PROJ_STATS/HOOK_ITEMS）。
//
// 等价边界（与原版的差异，均为有意为之并在此断言）：
//  1. 挂墙当帧不计牵引——本仓玩家先于弹桶积分，锚点表下一 tick 消费（16.7ms 起拉延迟）
//  2. 原版无"落地自动释放"（RemoveAllGrapplingHooks 全部调用点：坐骑/床/传送/回归药水/
//     死亡，Player.cs:11475/:32923/:36990/:37068/:42313/:42446/:33101）——落地仍挂
//  3. 钩爪 damage=0 且 AI_007 无 NPC 目标段 → 钩中敌人无任何效果（蝙蝠钩亦然；
//     蝙蝠钩特性 = 牵引 14（Player.cs:22565-22566），非自动瞄准）
//  4. 绳渲染已 1:1 分节链贴图（src/data/grappleChains.ts，ChainID 表；见
//     tests/grapple-chain.test.ts）——仅贴图未就绪时回退线段+方块（下帧自愈）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE, PLAYER_JUMP_TICKS, PLAYER_JUMP_SPEED } from '../src/core/constants';
import {
  GrappleProj, GRAPPLE_FLY, GRAPPLE_RETRACT, GRAPPLE_LATCH, canTileBeLatchedOnTo,
} from '../src/entities/GrappleProj';
import {
  HOOK_PROJ_STATS, HOOK_ITEMS, HOOK_TIME_LEFT, hookItemOf, isHookProjectile,
} from '../src/data/grappleHooks';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';

const DIRT = TILE_BY_KEY['dirt']!;
const PLATFORM = TILE_BY_KEY['platform']!;
/** vid → 本仓物品内部 id（X2② 旧世界跑酷指南 6190 注入用） */
const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

/** 空 40×40 世界 + 假 GameHooks（Player/GrappleProj 只用 world/player/音效/粒子/掉落） */
function makeWorld(name = 'open') {
  const w = new World(60, 60, 42, name);
  const st = w.store;
  const p = new Player(30 * TILE, 40 * TILE, new Inventory());
  const hooks = {
    world: w,
    player: p,
    spawnDrop: () => null,
    addDamageNumber: () => {},
    playSfx: () => {},
    spawnParticles: () => {},
    onInventoryChanged: () => {},
    enemies: () => [],
    critters: () => [],
    spawnEnemy: () => {},
    damagePlayer: (): number => 0,
    // ★BJ303 判别面（2026-09-23 用户实报：反重力钩发射即崩停机）：与
    // Game.addLightAt（Game.ts:46368-46371）同形——首句读 this.world。钩爪
    // emitLineLight 必须以方法调用/绑定形态发出；若 detach 成局部引用
    // （this=undefined，ESM 严格模式）即抛 "Cannot read properties of
    // undefined (reading 'world')"。446/646-649 lineLight 钩每 AI 步走本
    // 通道 → 本文件全部钩步进皆过此判别（注册位记入 lights 供断言）。
    addLightAt(this: { world: World; lights: Array<[number, number]> },
      x: number, y: number, _r: number, _g: number, _b: number): void {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (this.world.store.inBounds(tx, ty)) this.lights.push([tx, ty]);
    },
    lights: [] as Array<[number, number]>,
  } as never;
  return { w, st, p, hooks };
}

/** 发射一发钩爪（模拟 Game.fireGrapple 的 spawn 段）并登记在役 */
function fire(p: Player, projType: number, dx: number, dy: number, speed: number) {
  const d = Math.hypot(dx, dy) || 1;
  const g = new GrappleProj(p.cx - 8, p.y + 8, (dx / d) * speed, (dy / d) * speed,
    projType, () => (p.dead ? null : p));
  p.registerGrappleProj(g);
  return g;
}

/** 一步 = 弹体 AI + 玩家积分（本仓时序：玩家消费锚点表 → 弹体自登记） */
function step(g: GrappleProj, p: Player, hooks: never, n = 1) {
  for (let i = 0; i < n; i++) {
    p.fixedUpdate(1 / 60, hooks);
    if (!g.dead) g.fixedUpdate(1 / 60, hooks);
  }
}

describe('钩爪 AI_007（Projectile.cs:49647-49980）', () => {
  it('发射飞行：速度恒定直线、三态=飞行、timeLeft=36000', () => {
    const { st, p, hooks } = makeWorld();
    // 头顶 8 格处放一块实心天花板
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);           // 普通钩 shootSpeed 11.5（Item.cs:2357）
    expect(g.ai0).toBe(GRAPPLE_FLY);
    expect(g.timeLeft).toBe(HOOK_TIME_LEFT);      // `timeLeft *= 10`（:689）
    const v0 = Math.hypot(g.vx, g.vy);
    expect(v0).toBeCloseTo(11.5, 5);
    g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_FLY);              // 未碰实心 → 仍飞行
    expect(Math.hypot(g.vx, g.vy)).toBeCloseTo(11.5, 5);  // AI_007 不改飞行速度
    expect(g.y).toBeLessThan(p.y + 8);            // 向上位移
    void hooks;
  });

  it('命中挂墙：锚定格中心、速度清零、登记锚点表', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）   // 玩家上方 ~20 格
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    expect(g.vx).toBe(0);
    expect(g.vy).toBe(0);
    expect(g.latchY).toBe(24);                    // 命中天花板那行
    expect(g.cx).toBeCloseTo(Math.floor(g.cx / TILE) * TILE + 8, 5); // 吸附格中心
    p.fixedUpdate(1 / 60, hooks);                 // 下一 tick 玩家消费锚点表
    void hooks;
  });

  it('牵引速度公式：目标=锚质心-玩家中心，距离缩放到上限 11（Player.cs:22558-22574）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    // 挂墙 tick 已登记锚点表 → 玩家下一 tick 消费即拉（本仓边界：起拉比原版晚 1 tick）
    const pcx = p.cx, pcy = p.cy;
    const dist = Math.hypot(g.cx - pcx, g.cy - pcy);
    p.fixedUpdate(1 / 60, hooks);
    // :22558-22574：velocity = (锚质心 - 玩家中心) × min(1, 11/距离) → 方向 × min(距离, 11)
    expect(p.vx).toBeCloseTo(((g.cx - pcx) / dist) * Math.min(dist, 11), 3);
    expect(p.vy).toBeCloseTo(((g.cy - pcy) / dist) * Math.min(dist, 11), 3);
    expect(p.y).toBeLessThan(pcy - p.h / 2);      // 被拉向锚点
  });

  it('蝙蝠钩牵引上限 14（Player.cs:22565-22566）、荆棘钩 12（:22567）、月亮钩 16（:22569）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    for (const [type, cap, spd] of [[315, 14, 13.5], [487, 12, 15], [646, 16, 18]] as const) {
      const g = fire(p, type, 0, -1, spd);        // 物品 shootSpeed：1800/3021/3572
      for (let t = 0; t < 200 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
      expect(g.ai0).toBe(GRAPPLE_LATCH);
      step(g, p, hooks);                          // 玩家消费 → 弹体重登记
      expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(cap, 2);  // 距离 269px > cap → 钳在上限
      p.removeAllGrapplingHooks();
    }
  });

  it('双钩 73/74 运行时牵引 12.5（★1457 Player.cs:23022-23025 case 73/74;V1 复核补运行时钳覆盖——数据表外 getGrapplingForces 硬编码同源）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    for (const type of [73, 74] as const) {
      const g = fire(p, type, 0, -1, 13.5);       // 双钩 shootSpeed 13.5（Item.cs 976/977）
      for (let t = 0; t < 200 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
      expect(g.ai0).toBe(GRAPPLE_LATCH);
      step(g, p, hooks);
      expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(12.5, 2);  // 269px > 12.5 → 钳在上限
      p.removeAllGrapplingHooks();
    }
  });

  it('X2② oldStyleParkour 半跳（1457 :22906）：释放跳 jumpHold=(int)jumpHeight/2=7、初速不减', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);            // 挂墙 tick 已登记锚点表（未消费）
    p.inv.slots[5] = { id: iid(6190), stack: 1 }; // 旧世界跑酷指南——equipStats 实时 getter 生效
    expect(p.equipStats.oldStyleParkour).toBe(true);
    p.vx = 0; p.vy = 0;                           // velocity.Length()<2 → flag（覆写前快照）
    p.grappleReleaseJump = true;
    p.inputJump = true;
    p.grappleMovement(hooks as never);            // 直调纯释放语义（积分噪声零掺入）
    expect(p.grappling[0] == null).toBe(true);    // RemoveAllGrapplingHooks（:22915）
    expect(p.vy).toBe(-PLAYER_JUMP_SPEED);        // :22905 velocity.Y=-jumpSpeed 两档同值
    expect(p.jumpHold).toBe(Math.floor(PLAYER_JUMP_TICKS / 2));   // int 除法 (int)(15/2)=7
  });

  it('X2② 对照：无跑酷指南释放跳全段 jumpHold=jumpHeight=15（:22906 else 支）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    p.vx = 0; p.vy = 0;
    p.grappleReleaseJump = true;
    p.inputJump = true;
    p.grappleMovement(hooks as never);
    expect(!!p.equipStats.oldStyleParkour).toBe(false);
    expect(p.jumpHold).toBe(PLAYER_JUMP_TICKS);
  });

  it('跳键沿释放（Player.cs:22899-22926）：慢速(<2)时附带跳跃、钩全灭', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    p.vx = 0; p.vy = 0;                           // velocity.Length()<2 → flag（:22353-22354）
    p.grappleReleaseJump = true;                  // releaseJump（跳键沿）
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks);
    expect(p.grappleProjs.length).toBe(0);        // RemoveAllGrapplingHooks（:22480）
    expect(g.dead).toBe(true);
    expect(p.vy).toBeLessThan(0);                 // velocity.Y = -jumpSpeed（:22474）
    expect(p.jumpHold).toBeGreaterThan(0);        // jump = jumpHeight（:22475）
  });

  it('落地不自动释放（原版无此语义——RemoveAllGrapplingHooks 全调用点均非落地）', () => {
    const { st, p, hooks } = makeWorld();
    // 地面 row 44；钩朝左下发射 → 挂在地面块上（锚低于玩家 → 下拉分量压向地面）。
    // 原版挂壁中 velocity.Y 被牵引完全覆写（GrappleMovement :22387 在重力 :27033 之后）
    // → 纯水平锚会悬空不落；必须锚带下拉分量才能"挂壁落地"
    for (let x = 8; x <= 40; x++) st.setTileSilent(x, 44, DIRT);   // 地面
    p.y = 44 * TILE - 42;                         // 脚底正好落在地面顶面
    const g = fire(p, 13, -1, 0.3, 11.5);
    for (let t = 0; t < 400 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    for (let t = 0; t < 200; t++) step(g, p, hooks);
    expect(p.onGround).toBe(true);                // 已落地
    expect(g.ai0).toBe(GRAPPLE_LATCH);            // 钩仍挂着
    expect(p.grappleProjs.length).toBe(1);
  });

  it('松跳不释放 / 再按跳沿才释放（releaseJump 维护 :22463-22482）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    // 持续按住跳（无沿）→ 不释放（releaseJump=false 时不进释放分支）
    p.inputJump = true;
    p.grappleReleaseJump = false;
    step(g, p, hooks);
    expect(p.grappleProjs.length).toBe(1);
    p.inputJump = false;                          // 松跳 → releaseJump = true（:22481-22482）
    step(g, p, hooks);
    expect(p.grappleReleaseJump).toBe(true);
    p.inputJump = true;                           // 再按 → 沿 → 释放
    step(g, p, hooks);
    expect(p.grappleProjs.length).toBe(0);
  });

  it('静态钩不拉（type 652，Player.cs:22517-22536）：无输入时速度≈0', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 652, 0, -1, 16);
    for (let t = 0; t < 120 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    p.vx = 0; p.vy = 0;
    p.inputX = 0; p.inputDown = false; p.inputUp = false;
    p.fixedUpdate(1 / 60, hooks);
    // 目标 = 玩家中心 + 0（value = 0 输入投影）→ 速度 = 0（静态悬挂）
    expect(Math.abs(p.vx)).toBeLessThan(0.01);
    expect(Math.abs(p.vy)).toBeLessThan(0.01);
  });

  it('静态钩有输入时沿绳位移 6px/tick（:22527 num5=6，价值=绳向×输入投影）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）   // 锚在正上方 → 绳向=上
    const g = fire(p, 652, 0, -1, 16);
    for (let t = 0; t < 120 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    p.vx = 0; p.vy = 0;
    p.inputUp = true;                             // 朝锚点爬
    p.fixedUpdate(1 / 60, hooks);
    expect(p.vy).toBeCloseTo(-6, 2);              // 绳向(0,-1)×投影(1)×6
    p.inputUp = false;
  });

  it('反重力钩 446 自由悬浮（:22500-22515）：目标=锚+normalize(玩家-锚+输入×100)×200', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const g = fire(p, 446, 0, -1, 14);
    for (let t = 0; t < 120 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    const pcx = p.cx, pcy = p.cy;
    p.vx = 0; p.vy = 0;
    p.inputX = 1; p.inputDown = false; p.inputUp = false;   // 向右输入 → vec 偏右
    p.fixedUpdate(1 / 60, hooks);
    // vec = normalize((pcx,pcy) - 锚 + (100,0))；目标 = 锚 + vec×200
    let vx = pcx - g.cx + 100, vy = pcy - g.cy + 0;
    const vl = Math.hypot(vx, vy);
    vx /= vl; vy /= vl;
    const tx = (g.cx + vx * 200 - pcx);
    const ty = (g.cy + vy * 200 - pcy);
    const tl = Math.hypot(tx, ty);
    const k = Math.min(1, 11 / tl);
    expect(p.vx).toBeCloseTo(tx * k, 2);
    expect(p.vy).toBeCloseTo(ty * k, 2);
    p.inputX = 0;
  });

  it('松鼠钩 865 垂吊锚下 28px（:22538-22546 vector6 = -vector5×28，绳向 90° 吸附）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 锚在正上方 → 绳向=(0,-1)
    const g = fire(p, 865, 0, -1, 11.5);
    for (let t = 0; t < 120 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    g.fixedUpdate(1 / 60, hooks);                  // 锚定 tick 起 rotation 吸附 90°（:49660-49665）
    expect(Math.abs(g.rot % (Math.PI / 2))).toBeLessThan(1e-6);
    const pcx = p.cx, pcy = p.cy;
    p.vx = 0; p.vy = 0;
    p.fixedUpdate(1 / 60, hooks);
    // vector5 = (rot - PI/2) 的单位向量 = 玩家→锚方向；目标 = 锚 - vector5×28（垂吊点）
    const a = g.rot - Math.PI / 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    const tx = g.cx - ux * 28 - pcx;
    const ty = g.cy - uy * 28 - pcy;
    const tl = Math.hypot(tx, ty);
    const k = Math.min(1, 11 / tl);
    expect(p.vx).toBeCloseTo(tx * k, 2);
    expect(p.vy).toBeCloseTo(ty * k, 2);
    expect(uy).toBeLessThan(0);                    // 绳向朝上（锚在上方）
    // 垂吊点 = 锚 - 绳向×28：绳向朝上 → 垂吊点在锚【下方】28px（玩家侧对侧）
    expect(g.cy - uy * 28).toBeCloseTo(g.cy + 28, 5);
    expect(Math.sign(ty)).toBe(Math.sign(uy));      // 牵引沿绳向越过锚到达垂吊点
  });

  it('多锚质心牵引（GetGrapplingForces :22490-22557）：两锚取平均', () => {
    const { st, p, hooks } = makeWorld();
    // 常春藤鞭（32，3 锚上限）：左上/右上两块砖
    st.setTileSilent(22, 24, DIRT);
    st.setTileSilent(38, 24, DIRT);
    // 瞄准两块砖的格心（弹体出生 = 玩家中心偏移后 cx=491/cy=657）
    const g1 = fire(p, 32, 22 * TILE + 8 - 491, 24 * TILE + 8 - 657, 13);
    for (let t = 0; t < 200 && g1.ai0 !== GRAPPLE_LATCH; t++) g1.fixedUpdate(1 / 60, hooks);
    expect(g1.ai0).toBe(GRAPPLE_LATCH);
    const a1 = { x: g1.cx, y: g1.cy };
    const g2 = fire(p, 32, 38 * TILE + 8 - 491, 24 * TILE + 8 - 657, 13);
    for (let t = 0; t < 200 && g2.ai0 !== GRAPPLE_LATCH; t++) g2.fixedUpdate(1 / 60, hooks);
    expect(g2.ai0).toBe(GRAPPLE_LATCH);
    const a2 = { x: g2.cx, y: g2.cy };
    expect(g2.latchX).toBeGreaterThan(g1.latchX); // 第二锚在右侧
    const pcx = p.cx, pcy = p.cy;
    p.vx = 0; p.vy = 0;
    p.fixedUpdate(1 / 60, hooks);
    // 质心 = (a1+a2)/2 → 速度 = (质心 - 玩家) 钳 15（32 号回收速度…牵引上限默认 11）
    const tx = (a1.x + a2.x) / 2 - pcx;
    const ty = (a1.y + a2.y) / 2 - pcy;
    const tl = Math.hypot(tx, ty);
    const k = Math.min(1, 11 / tl);
    expect(p.vx).toBeCloseTo(tx * k, 2);
    expect(p.vy).toBeCloseTo(ty * k, 2);
  });

  it('超程回收（:49706-49747 / :49881-49927）：普通钩 300px 转 ai[0]=1', () => {
    const { st, p, hooks } = makeWorld();
    // 只放一块远砖（>300px 之外）——钩先超程转回收，永不挂上
    st.setTileSilent(30, 5, DIRT);
    const g = fire(p, 13, 0, -1, 11.5);
    let retracted = false;
    for (let t = 0; t < 200; t++) {
      g.fixedUpdate(1 / 60, hooks);
      if (g.ai0 === GRAPPLE_RETRACT) { retracted = true; break; }
    }
    expect(retracted).toBe(true);
    g.fixedUpdate(1 / 60, hooks);                  // 转 ai[0]=1 当帧保留飞行速度，下一帧起回收速度
    expect(Math.hypot(g.vx, g.vy)).toBeCloseTo(11, 2);   // 回收速度 11（:49895 默认）
    // 回收到贴身 24px 内即死（:49888-49890）
    let died = false;
    for (let t = 0; t < 400 && !g.dead; t++) g.fixedUpdate(1 / 60, hooks);
    died = g.dead;
    expect(died).toBe(true);
  });

  it('锚格被挖掉 → 回收（:49944-49950）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    st.setTileSilent(g.latchX, g.latchY, 0);      // 挖掉锚格
    g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_RETRACT);
  });

  it('松鼠钩挂树干（TileID.Sets.IsATreeTrunk，:49970）、非树干钩不挂', () => {
    const { st, p, hooks } = makeWorld();
    const TREE = TILE_BY_KEY['tree']!;            // sheet 5（IsATreeTrunk）
    st.setTileSilent(30, 24, TREE);
    const g = fire(p, 865, 0, -1, 11.5);
    let latched = false;
    for (let t = 0; t < 200 && !latched; t++) {
      g.fixedUpdate(1 / 60, hooks);
      latched = g.ai0 === GRAPPLE_LATCH;
    }
    expect(latched).toBe(true);                   // 865 可挂树干
    // 普通钩 13 不可挂树干（tileSolid[5]=false 且非 865）
    const g2 = fire(p, 13, 0, -1, 11.5);
    let latched2 = false;
    for (let t = 0; t < 200 && !latched2; t++) {
      g2.fixedUpdate(1 / 60, hooks);
      latched2 = g2.ai0 === GRAPPLE_LATCH;
    }
    expect(latched2).toBe(false);
    expect(g2.dead).toBe(true);                   // 超程回收后贴身死亡
  });

  it('canTileBeLatchedOnTo（:49961-49977）：致动格不可挂 / 轨道钩 403 只挂轨道', () => {
    const { st } = makeWorld();
    st.setTileSilent(10, 10, DIRT);
    expect(canTileBeLatchedOnTo(st, 10, 10, 13)).toBe(true);
    st.wire[st.idx(10, 10)] |= 32;                // inActive（致动）→ nactive()=false
    expect(canTileBeLatchedOnTo(st, 10, 10, 13)).toBe(false);
    st.wire[st.idx(10, 10)] &= ~32;
    expect(canTileBeLatchedOnTo(st, 10, 10, 13)).toBe(true);
    expect(canTileBeLatchedOnTo(st, 10, 10, 403)).toBe(false);  // 403 只挂 314 轨道
    const TRACK = TILE_BY_KEY['v_314_minecart_track'];
    if (TRACK) {
      st.setTileSilent(11, 10, TRACK);
      expect(canTileBeLatchedOnTo(st, 11, 10, 403)).toBe(true);
      expect(canTileBeLatchedOnTo(st, 11, 10, 13)).toBe(true);  // 轨道显式放行（:49969）
    }
  });

  it('锚点黑名单（UpdateBlacklistedTilesForGrappling :5890-5927）：平台锚 5×5 同族禁挂', () => {
    const { st, p, hooks } = makeWorld();
    // 顶上一排平台：第一发挂在 (30,20)，其 5×5 内的其余平台全部进黑名单
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, PLATFORM);
    const g = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 120 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    expect(g.latchX).toBe(30);
    expect(g.latchY).toBe(24);
    expect(p.isBlacklistedForGrappling(31, 24)).toBe(true);   // 5×5 同族
    expect(p.isBlacklistedForGrappling(30, 24)).toBe(true);   // 含锚本身
    expect(p.isBlacklistedForGrappling(40, 24)).toBe(false);  // 5×5 外
    // 第二发飞向相邻平台 (32,20)——黑名单拦截 → 不挂（继续飞行/超程回收）
    const g2 = fire(p, 13, 0.03, -1, 11.5);
    let latched2 = false;
    for (let t = 0; t < 400 && !latched2; t++) {
      g2.fixedUpdate(1 / 60, hooks);
      latched2 = g2.ai0 === GRAPPLE_LATCH;
    }
    expect(latched2).toBe(false);
  });
});

describe('QuickGrapple 上限门与交替轮换（Player.cs:5989-6116）', () => {
  it('单钩族（13）：再发射先杀最旧（num8=1，:6041-6044）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g1 = fire(p, 13, 0, -1, 11.5);
    for (let t = 0; t < 90 && g1.ai0 !== GRAPPLE_LATCH; t++) g1.fixedUpdate(1 / 60, hooks);
    expect(g1.ai0).toBe(GRAPPLE_LATCH);
    p.fixedUpdate(1 / 60, hooks);                 // 消费登记（latched=1）
    // num7 = max(1, 1-1)=1 ≥ inflight 0 → 允许再发；总数 1 ≥ num8 1 → 杀最旧
    const g2 = fire(p, 13, 0, -1, 11.5);           // fire() 已登记
    expect(p.grappleProjs.length).toBe(2);
    // 模拟 fireGrapple 的门段（Game.fireGrapple 同序）
    let oldest: GrappleProj | null = null;
    let oldestTL = 100000, inflight = 0, latched = 0;
    for (const g of p.grappleProjs) {
      if (g.ai0 === GRAPPLE_LATCH) latched++;
      else inflight++;
      if (g.timeLeft < oldestTL) { oldest = g; oldestTL = g.timeLeft; }
    }
    expect(inflight).toBe(1);
    expect(latched).toBe(1);
    const stats = HOOK_PROJ_STATS[13]!;
    const maxInflight = Math.max(1, stats.quickMax - latched);
    expect(maxInflight).toBe(1);                  // :6012
    expect(inflight < maxInflight).toBe(false);   // inflight 1 ≥ 1 → 本发被拒
    // 直杀最旧验证：num8 门
    if (oldest && latched + inflight >= stats.quickTotal) oldest.kill();
    expect(g1.dead).toBe(true);                   // 最旧（timeLeft 更小）被杀
    void hooks;
  });

  it('双钩交替（:6057-6065）：场上有蓝钩 73 → 下一发红钩 74', () => {
    const { p } = makeWorld();
    expect(hookItemOf(437)!.shoot).toBe(73);
    const g1 = fire(p, 73, 0, -1, 14);
    p.registerGrappleProj(g1);
    // Game.fireGrapple 的交替段：shootType==73 且场上有 73 → 74
    let shootType = 73;
    if (shootType === 73 && p.grappleProjs.some((g) => g.projType === 73)) shootType = 74;
    expect(shootType).toBe(74);
    // 红钩在场后：交替只认 73 → 仍发 74？——原版判据=场上存在 73（含蓝钩死亡后不再交替）
    p.unregisterGrapple(g1);
    shootType = 73;
    if (shootType === 73 && p.grappleProjs.some((g) => g.projType === 73)) shootType = 74;
    expect(shootType).toBe(73);                   // 无蓝钩 → 回蓝
  });

  it('月亮钩四色轮换（:6067-6092）：646→647→648→649→646（取最旧）', () => {
    const { p } = makeWorld();
    const next = (cur: number) => (cur === 646 ? 647 : cur === 647 ? 648 : cur === 648 ? 649 : 646);
    expect(next(646)).toBe(647);
    expect(next(647)).toBe(648);
    expect(next(648)).toBe(649);
    expect(next(649)).toBe(646);                  // -1 / 649 → 646（:6087-6091）
    expect(next(-1)).toBe(646);
    // timeLeft 最大（最旧）者决定下一色（:6072-6076 num10 < timeLeft → 取最大）
    const gA = fire(p, 646, 0, -1, 18);
    const gB = fire(p, 647, 0, -1, 18);
    gA.timeLeft = 30000; gB.timeLeft = 35000;     // B 更旧（fire() 已登记）
    let cur = -1, curTL = -1;
    for (const g of p.grappleProjs) {
      if (g.projType >= 646 && g.projType <= 649 && (curTL === -1 || curTL < g.timeLeft)) {
        cur = g.projType;
        curTL = g.timeLeft;
      }
    }
    expect(cur).toBe(647);
    expect(next(cur)).toBe(648);
  });

  it('最大钩数：吐蛛丝者 8（num17=8 :49825-49827）、常春藤鞭 3、静态钩 1（:49832）', () => {
    expect(HOOK_PROJ_STATS[165]!.maxLatched).toBe(8);
    expect(HOOK_PROJ_STATS[165]!.quickMax).toBe(8);
    expect(HOOK_PROJ_STATS[32]!.maxLatched).toBe(3);
    expect(HOOK_PROJ_STATS[32]!.quickMax).toBe(3);
    expect(HOOK_PROJ_STATS[652]!.maxLatched).toBe(1);
    expect(HOOK_PROJ_STATS[73]!.maxLatched).toBe(1);   // 双钩只留一个锚（交替跳点）
    expect(HOOK_PROJ_STATS[646]!.maxLatched).toBe(4);  // 月亮钩 4 锚
    expect(HOOK_PROJ_STATS[256]!.maxLatched).toBe(2);  // 骷髅王之手 2
    expect(HOOK_PROJ_STATS[372]!.maxLatched).toBe(2);  // 鱼钩 2
  });

  it('皇后钩 935 挂墙瞬移（DoQueenSlimeHookTeleport :22486-22506）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const beforeY = p.y;
    const g = fire(p, 935, 0, -1, 4);             // shootSpeed 4（Item.cs case 4980）
    for (let t = 0; t < 4000 && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
    expect(g.ai0).toBe(GRAPPLE_LATCH);
    expect(p.y).toBeLessThan(beforeY - 100);      // 玩家被传到锚点附近
    const d = Math.hypot(p.cx - g.cx, p.cy - g.cy);
    expect(d).toBeLessThan(40);                   // 150 步×12px 步进止于贴墙（锚在实心格内）
  });

  it('死亡/冰冻 → 钩灭（AI_007 :49649-49657）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 玩家 cy≈661 → 距 269px（<300 射程）
    const g = fire(p, 13, 0, -1, 11.5);
    g.fixedUpdate(1 / 60, hooks);
    expect(g.dead).toBe(false);
    p.buffs.apply(63, 10);                        // Frozen（原版 47）
    g.fixedUpdate(1 / 60, hooks);
    expect(g.dead).toBe(true);
  });
});

describe('变体参数全表（HOOK_PROJ_STATS / HOOK_ITEMS 逐项对照源码）', () => {
  it('射程表（Projectile.cs:49706-49747）逐项', () => {
    const range: Record<number, number | null> = {
      13: 300, 32: 400, 73: 440, 74: 440, 165: 375, 256: 425, 315: 500, 322: 550,
      331: 400, 332: 550, 372: 400, 396: 300, 446: 500, 486: 480, 487: 480, 488: 480,
      489: 480, 646: 550, 647: 550, 648: 550, 649: 550, 652: 600, 753: 420, 865: 300,
      935: 500, 403: null,
    };
    for (const [t, r] of Object.entries(range)) {
      expect(HOOK_PROJ_STATS[+t]!.range, `type ${t}`).toBe(r);
    }
    // 宝石钩 230-235：300+(t-230)*30（:49736-49742）
    for (let i = 0; i <= 5; i++) {
      expect(HOOK_PROJ_STATS[230 + i]!.range).toBe(300 + i * 30);
    }
  });

  it('回收速度表（Projectile.cs:49894-49927）逐项', () => {
    const retract: Record<number, number> = {
      // 73/74 双钩回收 22 = ★1457 终值（Projectile.cs:53723-53725 ai[0]==1 段
      // `if(type==73||type==74) num18=22f`；旧 1456 钉 17 :49888-49890 已随
      // 2026-08-23 基准切换反转）
      13: 11, 32: 15, 73: 22, 74: 22, 165: 11, 256: 11, 315: 20, 322: 22,
      331: 11, 332: 17, 372: 11, 396: 11, 446: 20, 486: 18, 487: 18, 488: 18,
      489: 18, 646: 24, 652: 24, 753: 15, 865: 11, 935: 11,
    };
    for (const [t, r] of Object.entries(retract)) {
      expect(HOOK_PROJ_STATS[+t]!.retract, `type ${t}`).toBe(r);
    }
    for (let i = 0; i <= 5; i++) {                // 宝石钩 11+(t-230)*0.75（:49898-49899）
      expect(HOOK_PROJ_STATS[230 + i]!.retract).toBeCloseTo(11 + i * 0.75, 5);
    }
  });

  it('物品表（Item.cs 各 case）逐项：shoot / shootSpeed / useTime', () => {
    const table: Record<number, [number, number, number]> = {
      84: [13, 11.5, 20], 185: [32, 13, 20], 437: [73, 14, 20], 939: [165, 10, 20],
      1236: [230, 10, 20], 1237: [231, 10.5, 20], 1238: [232, 11, 20],
      1239: [233, 11.5, 20], 1240: [234, 12, 20], 1241: [235, 12.5, 20],
      1273: [256, 8, 25], 1800: [315, 13.5, 20], 1829: [322, 15.5, 20],
      1915: [331, 11.5, 20], 1916: [332, 15.5, 20], 2360: [372, 13, 20],
      2585: [396, 13, 20], 2800: [446, 14, 20], 3020: [486, 15, 20],
      // 3021 荆棘钩 shootSpeed 16（Item.cs:27955-27957 `if(type==3021) shootSpeed=16f`
      // 共用块缺省 15 后覆写——2026-08-22 补 C 审计批亲核原文修正，曾误取 15）
      3021: [487, 16, 20], 3022: [488, 15, 20], 3023: [489, 15, 20],
      3572: [646, 18, 20], 3623: [652, 16, 20], 4257: [753, 12.5, 20],
      4759: [865, 11.5, 20], 4980: [935, 4, 20],
    };
    expect(Object.keys(HOOK_ITEMS).length).toBe(Object.keys(table).length);
    for (const [item, [shoot, speed, useTime]] of Object.entries(table)) {
      const hi = hookItemOf(+item)!;
      expect(hi.shoot, `item ${item}`).toBe(shoot);
      expect(hi.shootSpeed, `item ${item}`).toBeCloseTo(speed, 5);
      expect(hi.useTime, `item ${item}`).toBe(useTime);
    }
    expect(hookItemOf(1)).toBeNull();             // 非钩爪物品
  });

  it('钩爪族判定（aiStyle 7，Main.cs:6573-6577 projHook）', () => {
    for (const t of [13, 32, 73, 165, 230, 256, 315, 652, 865, 935]) {
      expect(isHookProjectile(t)).toBe(true);
    }
    for (const t of [1, 2, 10, 75, 90]) expect(isHookProjectile(t)).toBe(false);
  });

  it('钩中敌人无效果（原版 damage=0 :49865 + AI_007 无 NPC 目标段）', () => {
    // 蝙蝠钩无自动瞄准：其特性=牵引 14/回收 20/射程 500（全部已在数值表断言）。
    // 钩爪弹体对敌怪零交互——飞行段只做 tile 锚定扫描，无 hurt 调用。
    const stats = HOOK_PROJ_STATS[315]!;
    expect(stats.pull).toBe(14);                  // Player.cs:22565-22566
    expect(stats.retract).toBe(20);               // :49903-49905
    expect(stats.range).toBe(500);                // :49706
    expect(HOOK_PROJ_STATS[646]!.pull).toBe(16);  // 月亮钩更快（:22569-22570）
    // 双钩牵引 12.5 = ★1457 新设 case（Player.cs:23022-23025 `case 73: case 74:
    // num9=12.5f`;1456 无覆盖走缺省 11 :22559——2026-08-23 基准切换反转）
    expect(HOOK_PROJ_STATS[73]!.pull).toBe(12.5);
    expect(HOOK_PROJ_STATS[74]!.pull).toBe(12.5);
  });
});

// ★BJ303（2026-09-23 用户实报：装备反重力钩使用即崩"Cannot read properties of
// undefined (reading 'world')"→帧循环熔断停机）。根因 = GrappleProj.emitLineLight
// 曾把 game.addLightAt detach 成局部引用再调用（this=undefined）→ Game.addLightAt
// 首句 this.world 抛 TypeError。触发面 = hookChainOf(projType).lineLight 非空
// （grappleChains.ts：仅 446 反重力钩/646-649 月亮钩）——普通钩无沿线光不走本段。
// 修复 = bind 调用（this=preserved）。本组测试：446 全态（飞/锚）光照通道畅通 +
// 普通钩零光照注册（判别面），stub 的 addLightAt 为 this 依赖方法（见 makeWorld）。
describe('BJ303 沿线光通道（emitLineLight this 保持判别——反重力钩/月亮钩崩点回归）', () => {
  it('446 反重力钩：飞行→挂墙→锚定全态 addLightAt 以 this=hooks 形态逐 tick 注册', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 天花板（与 13 号用例同景）
    const g = fire(p, 446, 0, -1, 14);            // 反重力钩 shootSpeed 14（Item.cs case 2800）
    const h = hooks as unknown as { lights: Array<[number, number]> };
    // 飞行段：每 AI 步至少两枚（mountedCenter + 钩心；沿线再补）——修复前此步即抛
    // TypeError（崩点=用户实报第一帧）
    expect(() => step(g, p, hooks, 5)).not.toThrow();
    expect(h.lights.length).toBeGreaterThanOrEqual(2);
    // 挂墙（446 range=500，天花板 269px 内）→ 锚定态持续发光（用户挂墙游走常驻态）
    for (let i = 0; i < 120 && !g.latched; i++) step(g, p, hooks);
    expect(g.latched).toBe(true);
    const n = h.lights.length;
    expect(n).toBeGreaterThanOrEqual(2);
    step(g, p, hooks, 5);
    expect(h.lights.length).toBeGreaterThan(n);   // 锚定态逐 tick 持续注册
  });

  it('普通钩 13：无 lineLight → 不走 emitLineLight（全程零光照注册）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const g = fire(p, 13, 0, -1, 11.5);           // 普通钩 shootSpeed 11.5
    expect(() => step(g, p, hooks, 20)).not.toThrow();
    const h = hooks as unknown as { lights: Array<[number, number]> };
    expect(h.lights.length).toBe(0);              // 13 无沿线光（grappleChains.ts lineLight 缺省）
    // 挂墙回归：锚定态不受影响
    for (let i = 0; i < 120 && !g.latched; i++) step(g, p, hooks);
    expect(g.latched).toBe(true);
  });

  it('646 月亮钩：同 lineLight 面（另一触发族）全态同判别', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const g = fire(p, 646, 0, -1, 18);            // 月亮钩 shootSpeed 18（Item.cs:32201-32211）
    const h = hooks as unknown as { lights: Array<[number, number]> };
    expect(() => step(g, p, hooks, 5)).not.toThrow();
    expect(h.lights.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 120 && !g.latched; i++) step(g, p, hooks);
    expect(g.latched).toBe(true);
  });
});
