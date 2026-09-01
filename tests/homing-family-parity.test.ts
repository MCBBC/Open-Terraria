// 追踪类弹幕全族补齐回归（1457 制导惯用式 1:1）：
//   1 aiStyle 36 蜂族   AI() 派发器 :27683-27862（181 蜂枪/189 黄蜂枪/316 蝙蝠杖/
//                       566 巨蜂/307 腐化者小吞噬者）——30 update 延迟 + 800 曼哈顿
//                       + CanHit 重搜 + 逐轴步进转向（speed/accel 逐型表）
//   2 616 星旋涡旋弹    AI_001 重力链 616 支 :58383-58465——20 update 延迟 + 800 曼哈顿
//                       锁敌（失效不复锁）+ 1000 保持圈 + v=(v×7+dir×v0)/8
//   3 297 幽灵法杖弹    aiStyle 51 :28825-28927——400 双门重搜 + v=(v×20+dir×6)/21
//   4 659 灵魂之焰      aiStyle 129 :36861-36970——5 update 重索 + v=(v×2+dir×7.5)/3
//                       + 目标失效 timeLeft 钳 5 + 埋实心格钳 2
//   5 307 friendly 门   SetDefaults 无 friendly :3986-3995 + 锁定置位 :27789-27792
//   6 306→307 Kill 链   Projectile.cs:78052-78062（Next(2,5)、1% → 15、伤 ×0.75）
//   7 442 电圈导弹      AI_001 442 段 :55689-55740——到点 ≤16px Kill + alpha==0 后
//                       120t 超时
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { Arrow } from '../src/entities/Arrow';
import { wetCollision } from '../src/entities/npcLiquid';
import { canHit, canHitLine } from '../src/physics/LineOfSight';
import type { GameHooks } from '../src/entities/types';

// ★蓝队四轮（2026-08-31）：H 120→200——WetCollision 几何升级版按原版 Collision.cs:1603-05
// 上下界钳 maxTilesY−40，120 行店帧行 90 的注水格落在扫描带外（j1=min(H−40,…)=80）；
// 原版世界高度≫160，测试店随之加高即可，物理面其余用例不受扰
const W = 200, H = 200;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; wet?: boolean; dontTakeDamage?: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = [], opts?: { solidAt?: (tx: number, ty: number) => boolean }) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: {
      store,
      get groundLevel() { return 80; },
    } as unknown as GameHooks['world'],
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,           // 签名宽 mock（同 spawnDust 口径）
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnDust: (() => null) as never,
  };
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); },
    projectiles: [],
  };
  if (opts?.solidAt) {
    (store as unknown as { isSolid: (x: number, y: number) => boolean }).isSolid =
      (tx: number, ty: number) => opts.solidAt!(tx, ty);
  }
  return { hooks, store, player, added };
}
const step = (p: Arrow, ticks: number, hooks: GameHooks): void => {
  for (let i = 0; i < ticks && !p.dead; i++) p.fixedUpdate(1, hooks);
};

describe('追踪弹全族补齐（1457 制导 1:1）', () => {
  it('aiStyle 36 蜂族 181：30 update 延迟后转向收敛到最近敌', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 90 * 16);
    const { hooks } = makeHooks([e]);
    // 出生向右平飞（敌在右侧 300px）——蜂枪初速 = shootSpeed 5（Item.cs:14482）
    const bee = new Arrow(60 * 16, 90 * 16, 5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3, extraUpdates: 3 });
    // 前 30 update 无转向：vy 恒 0（alpha 淡入 6 update 后 extraUpdates 3→0，
    // 30 update 延迟实际跨 ~26 tick——原版同拍）
    step(bee, 7, hooks);
    expect(bee.dead).toBe(false);
    expect(bee.vy).toBe(0);
    // 斜向敌验证转向：向左飞、敌在左下（−200,+100）——延迟后 vy 朝下偏
    const e2 = mkEnemy(2, 60 * 16 - 200, 90 * 16 + 100);
    const { hooks: h2 } = makeHooks([e2]);
    const bee2 = new Arrow(60 * 16, 90 * 16, -5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3, extraUpdates: 3 });
    step(bee2, 60, h2);
    expect(bee2.dead).toBe(false);
    expect(bee2.vy).toBeGreaterThan(0);        // :27823-27862 逐轴步进转向已激活
  });

  it('aiStyle 36 蜂族：入水即消亡（181）/ 307 豁免', () => {
    const e = mkEnemy(1, 60 * 16 + 100, 90 * 16);
    const { hooks, store } = makeHooks([e]);
    // 弹心格注水
    const tx = 60, ty = 90;
    store.liquid[store.idx(tx, ty)] = 200;
    store.liquidType[store.idx(tx, ty)] = 1;   // WATER（LIQUID_TYPE +1 编码）
    const bee = new Arrow(tx * 16, ty * 16, 5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3 });
    bee.fixedUpdate(1, hooks);
    expect(bee.dead).toBe(true);               // :27685-27688
    // 307 小吞噬者同格不死于水（type != 307 门）
    const eater = new Arrow(tx * 16, ty * 16, 5, 0, 9, 1, 307, null, { grav: 0, life: 600, pierce: 1, extraUpdates: 3 });
    eater.fixedUpdate(1, hooks);
    expect(eater.dead).toBe(false);
  });

  it('307 friendly 门：锁定前穿敌不结算，锁定后可伤', () => {
    const e = mkEnemy(1, 60 * 16 + 60, 90 * 16);
    const { hooks } = makeHooks([e]);
    // 背向敌出生（向左飞，敌在右 60px）——锁定前（friendly=false）穿过敌盒不结算
    const eater = new Arrow(60 * 16, 90 * 16, -4, 0, 10, 1, 307, null, { grav: 0, life: 600, pierce: 1, extraUpdates: 3 });
    step(eater, 5, hooks);
    expect(e.hits.length).toBe(0);             // 未锁定 friendly=false 不结算
    // 锁定（~26 tick）+ 折返（逐轴步进 0.35/update）→ 回到敌盒造成伤害
    step(eater, 150, hooks);
    expect(e.hits.length).toBeGreaterThan(0);
  });

  it('616 涡旋弹：20 update 延迟 + 800 曼哈顿距离门 + 失效不复锁', () => {
    // 距离门外：敌在身后 900px（飞行远离,曼哈顿恒 >800）→ 不锁敌直飞
    const far = mkEnemy(1, 60 * 16 - 900, 90 * 16);
    const { hooks: hFar } = makeHooks([far]);
    const a616far = new Arrow(60 * 16, 90 * 16, 8, 0, 20, 1, 616, null, { grav: 0, life: 270, pierce: 1, extraUpdates: 2 });
    step(a616far, 30, hFar);
    expect(a616far.dead).toBe(false);
    expect(a616far.vy).toBe(0);                // 无目标保持直飞（前瞻点 = v×100）
    // 距离门内（300px）→ 20 update（≈7 tick）后锁敌转向（敌在上方 → vy 变负）
    const near = mkEnemy(2, 60 * 16 + 300, 90 * 16 - 200);
    const { hooks: hNear } = makeHooks([near]);
    const a616 = new Arrow(60 * 16, 90 * 16, 8, 0, 20, 1, 616, null, { grav: 0, life: 270, pierce: 1, extraUpdates: 2 });
    step(a616, 6, hNear);
    expect(a616.vy).toBe(0);                   // 延迟期内不转
    step(a616, 30, hNear);
    expect(a616.vy).toBeLessThan(0);           // 锁敌后向上收敛
    // 失效不复锁：锁敌后杀目标 → 保持末速直飞（不重搜新目标）。
    // t1 放更近（上 120px）确保锁 t1；t2 放远（下 320px）
    const t1 = mkEnemy(3, 60 * 16 + 300, 90 * 16 - 120);
    const t2 = mkEnemy(4, 60 * 16 + 300, 90 * 16 + 320);
    const { hooks: h3 } = makeHooks([t1, t2]);
    const a3 = new Arrow(60 * 16, 90 * 16, 8, 0, 20, 1, 616, null, { grav: 0, life: 270, pierce: 1, extraUpdates: 2 });
    step(a3, 40, h3);
    expect((a3 as unknown as { vx616Ai1: number }).vx616Ai1).toBe(3);   // 锁 t1（近者）
    t1.dead = true;
    const vyHold = a3.vy;
    step(a3, 30, h3);
    expect(a3.vy).toBe(vyHold);                // :58421-58437 无清锁支——不复锁 t2
  });

  it('297 幽灵法杖弹：400 视距内转向收敛', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 90 * 16 - 150);
    const { hooks } = makeHooks([e]);
    const bolt = new Arrow(60 * 16, 90 * 16, 6, 0, 30, 1, 297, null, { grav: 0, life: 600, pierce: 3, extraUpdates: 1 });
    step(bolt, 30, hooks);
    expect(bolt.vy).toBeLessThan(0);           // :28913-28916 向敌收敛
  });

  it('659 灵魂之焰：追踪 + 目标失效 timeLeft 钳 5 + 埋实心格钳 2', () => {
    const e = mkEnemy(1, 60 * 16 + 150, 90 * 16 - 100);
    const { hooks } = makeHooks([e]);
    const flame = new Arrow(60 * 16, 90 * 16, 2, 0, 20, 1, 659, null, { grav: 0, life: 240, pierce: -1 });
    step(flame, 20, hooks);
    expect(flame.vy).toBeLessThan(0);          // :36954-36959 追踪
    expect(flame.life).toBeGreaterThan(240 - 25);   // 锁到即 timeLeft=420（:36896-36898）
    // 目标死亡 → ai[0]=−1 + timeLeft ≤ 5（:36963-36966）
    e.dead = true;
    step(flame, 2, hooks);
    expect(flame.life).toBeLessThanOrEqual(5);
    step(flame, 6, hooks);
    expect(flame.dead).toBe(true);
    // 埋实心格 → timeLeft 钳 2（:36945-36948）
    const e2 = mkEnemy(2, 60 * 16 + 150, 90 * 16 - 100);
    const { hooks: h2, store } = makeHooks([e2]);
    const f2 = new Arrow(60 * 16, 90 * 16, 2, 0, 20, 1, 659, null, { grav: 0, life: 240, pierce: -1 });
    step(f2, 10, h2);
    const bx = Math.floor(f2.cx / 16), by = Math.floor(f2.cy / 16);
    store.setTile(bx, by, 1);                  // 弹心格变实心
    step(f2, 2, h2);
    expect(f2.life).toBeLessThanOrEqual(2);
  });

  it('306 消亡撒 307 小吞噬者：锁定后命中（Kill 链参数 grav0/life600/pierce1）', () => {
    // 307 出生参数（Game.onProjectileDeath 306 分支按 :78052-78062 掷）：
    // grav 0 / life 600 / pierce 1 / extraUpdates 3（SetDefaults :3996-4004）
    const e = mkEnemy(1, 60 * 16 + 80, 90 * 16);
    const { hooks } = makeHooks([e]);
    const eater = new Arrow(60 * 16, 90 * 16, 0.5, -0.3, 22, 1, 307, null,
      { grav: 0, life: 600, pierce: 1, extraUpdates: 3 });
    step(eater, 150, hooks);
    expect(e.hits.length).toBeGreaterThan(0);  // 锁定后命中
    expect(eater.damage).toBe(22);
  });

  it('409 剃刀台风：500 视距锁敌 + rotateTowards 0.1 收敛 + 速度爬升', () => {
    const e = mkEnemy(1, 60 * 16 + 250, 90 * 16 - 180);
    const { hooks } = makeHooks([e]);
    // 2622 剃刀台风：shootSpeed 6、extraUpdates 2、penetrate −1、timeLeft 300
    const ty = new Arrow(60 * 16, 90 * 16, 6, 0, 85, 5, 409, null,
      { grav: 0, life: 300, pierce: -1, extraUpdates: 2 });
    step(ty, 40, hooks);
    expect(ty.dead).toBe(false);
    expect(ty.vy).toBeLessThan(0);             // :30933-30947 向敌收敛
    // 速度爬升（+0.0025/update 无帽）——40 tick ≈ 120 update → ≥6.3
    expect(Math.hypot(ty.vx, ty.vy)).toBeGreaterThan(6.2);
    // 锁敌失效（目标死亡）→ ai[0]=0 等冷却（不再转向）
    e.dead = true;
    const angBefore = Math.atan2(ty.vy, ty.vx);
    step(ty, 10, hooks);
    const angAfter = Math.atan2(ty.vy, ty.vx);
    expect(Math.abs(angAfter - angBefore)).toBeLessThan(0.01);   // 无目标保持直飞
  });

  it('451 涌流剑：命中后淡出瞬移重射第二目标，循环耗尽后淡出消亡', () => {
    // 第一敌在弹道上（命中）→ 淡出 → 瞬移到 250 内第二敌周围重射
    const e1 = mkEnemy(1, 60 * 16 + 120, 90 * 16);
    const e2 = mkEnemy(2, 60 * 16 + 260, 90 * 16 + 40);
    const { hooks } = makeHooks([e1, e2]);
    const iw = new Arrow(60 * 16, 90 * 16, 11, 0, 100, 4.5, 451, null,
      { grav: 0, life: 3600, pierce: 3 });
    step(iw, 20, hooks);
    expect(e1.hits.length).toBeGreaterThan(0);          // 飞行态命中 e1
    expect((iw as unknown as { iwAi0: number }).iwAi0).toBe(3);   // :14117 首中 ai[0] += pen
    step(iw, 10, hooks);
    // 淡出瞬移重射（ai[0] → 6 末段）→ 末段可伤命中 e2 → 命中钩回环
    // （ai[0] −= pen+1 → 再淡出重射；本仓 hitSet 恒久同敌免伤近似 → 循环无伤可结算
    // → 末段 alpha 满 Kill（:31700-31702）——原版同支同 Kill，差异仅在重击同敌窗）
    step(iw, 130, hooks);
    expect(e2.hits.length).toBeGreaterThan(0);
    expect(iw.dead).toBe(true);                // 循环耗尽淡出消亡
  });

  it('617 星璇秘术：减速段归一 4 速 + 慢速段锁敌追踪 + 掷 618 隐形火花', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 90 * 16 - 120);
    const { hooks } = makeHooks([e]);
    const orb = new Arrow(60 * 16, 90 * 16, 7, 0, 70, 5, 617, null,
      { grav: 0, life: 3600, pierce: 3 });
    // makeHooks 的 entities.add 不落桶——重接以捕获 618
    const spawned: Arrow[] = [];
    (hooks as unknown as { entities: { add: (x: unknown) => void } }).entities.add =
      (x: unknown) => { spawned.push(x as Arrow); };
    // 火花与母弹同拍步进（骑乘语义要求 618 每 update 消费父位移）
    const stepAll = (ticks: number) => {
      for (let i = 0; i < ticks && !orb.dead; i++) {
        orb.fixedUpdate(1, hooks);
        for (const s of spawned) if (!s.dead) s.fixedUpdate(1, hooks);
      }
    };
    stepAll(80);
    expect(orb.dead).toBe(false);
    const sp80 = Math.hypot(orb.vx, orb.vy);
    expect(sp80).toBeLessThanOrEqual(4.01);    // :35353-35357 归一 4 速
    expect(sp80).toBeGreaterThanOrEqual(3.4);  // 慢速段追踪 lerp 可短时 <4（无下限钳）
    // 慢速段锁敌（敌在上方）→ vy 向上收敛（:35443-35441 v=(v×7+dir×4)/8）——
    // 收敛后悬停于敌心（速度衰减趋 0，取收敛途中拍验证）
    stepAll(60);
    expect(orb.vy).toBeLessThan(0);
    // 618 火花已掷（慢速段 ai[0] 清零重计，每 30 update 一枚——至收敛悬停 ~3 枚）
    const sparks = spawned.filter((s) => s.projId === 618);
    expect(sparks.length).toBeGreaterThanOrEqual(2);
    const s0 = sparks[0];
    expect(s0.naParent).toBe(orb);             // ai[1] = 父引用
    expect(Math.hypot(s0.vx, s0.vy)).toBeLessThanOrEqual(6.01);   // :35493-35495 速帽 6
    // 618 骑乘：单 update 位移 ≈ 父位移 + 速度项（≤10px）
    const px0 = s0.cx;
    const pox = orb.cx;
    s0.fixedUpdate(1, hooks);
    orb.fixedUpdate(1, hooks);
    expect(Math.abs((s0.cx - px0) - (orb.cx - pox))).toBeLessThan(10);   // 骑乘主导
  });

  it('442 电圈导弹：到点 ≤16px Kill + alpha 归零后 120t 超时', () => {
    const { hooks } = makeHooks([]);
    // 锁定格 = 出生点右侧 240px（15 格）——12 速直线 20 tick 到点
    const orb = new Arrow(60 * 16, 90 * 16, 12, 0, 40, 0, 442, null,
      { grav: 0, life: 600, pierce: 1, aimPoint: { tx: 60 + 15, ty: 90 } });
    step(orb, 25, hooks);
    expect(orb.dead).toBe(true);               // :55704-55710 到点杀
    // 超时：锁定点远（永不达）→ alpha 归零（≈3 tick）后 120 update Kill
    const orb2 = new Arrow(60 * 16, 90 * 16, 0.5, 0, 40, 0, 442, null,
      { grav: 0, life: 600, pierce: 1, aimPoint: { tx: 60 + 500, ty: 90 } });
    step(orb2, 200, hooks);
    expect(orb2.dead).toBe(true);              // :55708-55712 localAI[1] ≥ 120
  });

  it('★F6 蜂族索敌视线=CanHit 步行族全盒(:27776)：非对称走廊判别场钉案', () => {
    // 独立高世界（y 帽=maxTilesY−40=100；row≤76 不受 groundFill 干扰）。
    // 初速置 0：索敌门开启（ai[0]>30）前弹不位移 ⇒ 判定几何完全静态可复核。
    const st = new TileStore(220, 140);
    // 近敌嵌入 5×5 实心单体内（自身格也被石覆）：任意逼近射线必踏到实心落脚格,
    // 步行族/线族皆断——静态拓扑保证,不受斜向步进细节影响。
    for (let x = 42; x <= 46; x++) {
      for (let y = 58; y <= 62; y++) st.setTile(x, y, 1);
    }
    // 走廊地板带 row71 col40..56：步行族「垂直对偶双实心才夹杀」放行 / 线族三组 ANY 断。
    // row70 上方全开 ⇒ 单侧邻接不构成步行夹杀——非对称性正是两族分叉点。
    for (let x = 40; x <= 56; x++) st.setTile(x, 71, 1);
    const decoy = mkEnemy(1, 44 * 16, 60 * 16);              // 近敌 (704,960) 埋单体、曼哈顿更近
    const target = mkEnemy(2, 55 * 16, 70 * 16);             // 远敌 (880,1120) 走廊尽头
    const player = new Player(30 * 16, 40 * 16, new Inventory());
    const hooks = ({
      world: { store: st, flags: { hardMode: false } } as never,
      player: player as never,
      enemies: () => [decoy, target],
      critters: () => [], spawnDrop: () => null, damagePlayer: (): number => 0,
      addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
      spawnEnemy: () => {}, spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
      spawnDust: (() => null) as never,
    }) as unknown as GameHooks;
    const bee = new Arrow(30 * 16, 0, 0, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3 });
    (bee as unknown as { y: number }).y = 70 * 16 - bee.h / 2;   // 弹心精确落在 row70 走廊线
    // 双向自证（与实现同参）：D 两族皆断 / T 步行通·积分线断 ⇒ 行为分叉只在 T 面
    const ray = (e: MockEnemy) => [bee.x, bee.y, bee.w, bee.h, e.x, e.y, e.w, e.h] as const;
    expect(canHit(st, ...ray(decoy))).toBe(false);
    expect(canHitLine(st, ...ray(decoy))).toBe(false);
    expect(canHit(st, ...ray(target))).toBe(true);
    expect(canHitLine(st, ...ray(target))).toBe(false);
    // 实弹：锁远者（近者板后被隔）——旧 canHitLine 挂法两候选全灭 → 恒不锁定。
    // 只取【首次锁定拍】：一旦开始追踪即停步，防后续位移改变可达性结论。
    const aimOf = () => bee as unknown as { bee36AimLocked: boolean; bee36Aim?: { cx: number } };
    let lockedSeen = false;
    for (let i = 0; i < 60 && !lockedSeen; i++) {
      bee.fixedUpdate(1, hooks);
      lockedSeen = aimOf().bee36AimLocked;
    }
    expect(lockedSeen).toBe(true);
    expect(aimOf().bee36Aim?.cx).toBe(55 * 16);
  });

  it('★F5 湿敌豁免按 vanillaId(:27769 type==370)：湿 Duke 可追、湿常怪拒', () => {
    const mkWet = (id: number, cx: number, cy: number, vanillaId?: number) =>
      Object.assign(mkEnemy(id, cx, cy), { wet: true, vanillaId });
    // A. 只有湿常怪（vanillaId 缺省≠370）→ 豁免永不命中,恒不锁定（旧 e.id!==370 同病此面）
    const onlyWet = mkWet(9, 60 * 16 + 100, 90 * 16);
    const hA = makeHooks([onlyWet]).hooks;
    const beeA = new Arrow(60 * 16, 90 * 16, 5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3 });
    step(beeA, 45, hA);
    expect((beeA as unknown as { bee36AimLocked: boolean }).bee36AimLocked).toBe(false);
    // B. 湿常怪近(240px)/湿 Duke 远(曼哈顿 600<800)→ 候选集只剩 Duke,锁定取远者
    const wetNorm = mkWet(8, 60 * 16 + 240, 90 * 16);
    const duke = mkWet(3, 60 * 16 + 400, 90 * 16 - 200, 370);
    const hB = makeHooks([wetNorm, duke]).hooks;
    const beeB = new Arrow(60 * 16, 90 * 16, 5, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3 });
    step(beeB, 45, hB);
    const aimB = () => beeB as unknown as { bee36AimLocked: boolean; bee36Aim?: { cx: number; cy: number } };
    expect(aimB().bee36AimLocked).toBe(true);
    expect(aimB().bee36Aim?.cx).toBe(60 * 16 + 400);
    expect(aimB().bee36Aim?.cy).toBe(90 * 16 - 200);
  });
});

// ★F7 终裁固防（2026-09-01，MB-D 旧红「蜂族入水即消亡」收口追认）：F7 判死几何
// 升级（Arrow.ts 蜂族站改走 npcLiquid.wetCollision = Collision.WetCollision :1575-1656
// 全式移植）后全绿——旧红定谳为旧实现「弹心格单格近似」的预先存在债，现以 truth
// 三态判别场景钉进固防，防回退。truth 分家表（1457）：
//   · WetCollision :1575-1656 ——【wet 家族】liquid>0 即真,液种不筛（水/岩浆/蜂蜜/
//     微光同权）,蜂蜜/微光经静态旗 Collision.honey/.shimmer 外带;中心小盒
//     (min(10,W)×min(H/2,H))+液面下探 (256-liquid)/32×2px + 坡面整格支;
//   · DrownCollision :1385 ——【溺水面】排除 lava 与 shimmer、honey 计入
//     （NPC 呼吸域专用 + 底行实心豁免支——与弹族无关）;
//   · LavaCollision :1657 ——【仅岩浆】。
// 蜂族门 Projectile.cs:27685 `type != 307 && wet && !honeyWet && !shimmerWet`：
// wet 家族 ⇒ 岩浆无豁免（致死）、蜂蜜/微光经旗豁免；对照 IsDestroyedByWater 族
// :16917 有 `!lavaWet` 门——两勿混。蜂盒探针（181=8×8）：宽 min(10,8)=8、高 H/2=4，
// 即 [px..px+8]×[py+2..py+6]；L=200 液带 = [ty*16+3.5, ty*16+16.5]。
// MB-D 两界复验（直测旗位见本组末测）：①honey 计入 = 蜜格返回 wet:true+honey:true
// （NPC 侧照常湿身、蜂侧靠旗豁免）；②lava 致死面 = 浆格 wet:true 且无旗 ⇒ 蜂死。
const putLiquid = (st: TileStore, tx: number, ty: number, amt: number, t: number): void => {
  st.liquid[st.idx(tx, ty)] = amt;
  st.liquidType[st.idx(tx, ty)] = t;
};
describe('★F7 蜂族入水判死几何三态固防（深水/浅缘/邻格/蜜·光豁免/浆致死）', () => {
  const bee181 = (px: number, py: number): Arrow =>
    new Arrow(px, py, 0, 0, 9, 1, 181, null, { grav: 0, life: 600, pierce: 3 });
  const diesWithin = (p: Arrow, n: number, h: GameHooks): boolean => {
    let died = false;
    for (let i = 0; i < n && !died; i++) { p.fixedUpdate(1, h); died = p.dead; }
    return died;
  };

  it('深水：弹心格 L255 整浸 1 拍即死', () => {
    const { hooks, store } = makeHooks([]);           // 无敌怪 → 静止几何零位移可复核
    putLiquid(store, 60, 90, 255, 1);                 // WATER
    const bee = bee181(60 * 16 + 4, 90 * 16);         // 探针 [1442..1446] ⊂ 液带
    expect(diesWithin(bee, 1, hooks)).toBe(true);
  });

  it('浅缘上掠（a 类误杀面反例）：盒底恰在液面之上⇒不死，尽管中心格仍在液体行', () => {
    const { hooks, store } = makeHooks([]);
    putLiquid(store, 60, 90, 200, 1);                 // 液带 [1443.5, 1456.5]
    // 盒 [1438..1442]，1442 > 1443.5 不成立 → 原版不杀；旧「弹心格 liquid>0」近似
    // 读到中心格（cy=1440→row90 有液）必误杀——此景即 F7 升级的判别器
    const bee = bee181(60 * 16 + 4, 90 * 16 - 4);
    expect(diesWithin(bee, 45, hooks)).toBe(false);
  });

  it('浅缘生死 1px 级阈对拍：py−3 生 / py−2 死（液面下探半像素差两分）', () => {
    const { hooks, store } = makeHooks([]);
    putLiquid(store, 60, 90, 200, 1);
    const live = bee181(60 * 16 + 4, 90 * 16 - 3);    // 盒 [1439..1443]，压线未进
    expect(diesWithin(live, 45, hooks)).toBe(false);
    const dead = bee181(60 * 16 + 4, 90 * 16 - 2);    // 盒 [1440..1444]，探底越过 1443.5
    expect(diesWithin(dead, 1, hooks)).toBe(true);
  });

  it('邻格液体（b 类漏杀面反例）：弹心格干燥、右邻 1px 探沿触液⇒死', () => {
    const { hooks, store } = makeHooks([]);
    putLiquid(store, 61, 90, 255, 1);                 // 仅右邻列有水
    // 弹心 cx=973→col60 干燥（旧单格判活）；探针 [969..977] 越界 1px 触 col61
    const bee = bee181(60 * 16 + 9, 90 * 16);
    expect(diesWithin(bee, 1, hooks)).toBe(true);
  });

  it('蜂蜜/微光豁免对拍（同几何死场：water 死 / honey·shimmer 活）', () => {
    for (const [t, mustDie] of [[1, true], [3, false], [4, false]] as const) {
      const { hooks, store } = makeHooks([]);
      putLiquid(store, 60, 90, 200, t);               // 致死几何 = py−2 压线进入
      const bee = bee181(60 * 16 + 4, 90 * 16 - 2);
      expect(diesWithin(bee, 8, hooks)).toBe(mustDie);
    }
  });

  it('岩浆无豁免致死面（wet 家族不分家；对照 IsDestroyedByWater 族有 !lavaWet 门）', () => {
    const { hooks, store } = makeHooks([]);
    putLiquid(store, 60, 90, 200, 2);                 // LAVA
    const bee = bee181(60 * 16 + 4, 90 * 16 - 2);     // 同致死几何
    expect(diesWithin(bee, 1, hooks)).toBe(true);
  });

  it('wetCollision 旗位直测：honey/shimmer 计入 wet 并外带旗；lava/water 不带旗', () => {
    const probe = (t: number) => {
      const st = new TileStore(80, 200);        // 高 200：j 钳 maxTilesY−40=160（复测顶注）
      putLiquid(st, 40, 40, 255, t);
      return wetCollision(st, 40 * 16 + 4, 40 * 16, 8, 8);   // 蜂盒几何探 [.. +6]
    };
    expect(probe(1)).toMatchObject({ wet: true, honey: false, shimmer: false });   // 水
    expect(probe(2)).toMatchObject({ wet: true, honey: false, shimmer: false });   // 岩浆
    expect(probe(3)).toMatchObject({ wet: true, honey: true, shimmer: false });    // 蜂蜜计入
    expect(probe(4)).toMatchObject({ wet: true, honey: false, shimmer: true });    // 微光计入
  });

  it('★L1+L2 致动斜坡出生判死（:1632 纯在场位 + wet 缓存出生预置）：接线致动坡格+上格液体 → 出生拍即判死', () => {
    // 坡格 (60,95) slope=1 且【致动】、上格 (60,94) 满水——原版 :1632 门是
    // tile.active() 纯在场位（无 inActive 检查）⇒ 致动斜坡照样判湿;蜂族 AI 头
    // :27685 读 wet 缓存,出生拍 = NewProjectile :10887-93 预置（本仓 fixedUpdate
    // 头等价块）——出生即在致动坡湿带上,首子步即 Kill。
    const { hooks, store } = makeHooks([]);
    store.setTile(60, 95, 1);
    store.setSlope(60, 95, 1);
    putLiquid(store, 60, 94, 255, 1);           // 液带 [1504.06,1520.06)
    store.setActuated(60, 95, true);            // ★致动位（修复前 nactive 口径 → 漏判存活）
    // 探针盒 y[1521,1525)：越过液带底 1520.06（255 满水带 0.06px 渗出,不落液体支）、落坡行 [1520,1536)
    // → 湿判定只能来自坡面支;蜂 8×8：vy = py + 4 − 2 = py + 2
    const bee = bee181(60 * 16 + 4, 94 * 16 + 15);
    expect(diesWithin(bee, 1, hooks)).toBe(true);
  });
});
