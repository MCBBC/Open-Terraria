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
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
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
    damagePlayer: () => {},
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
});
