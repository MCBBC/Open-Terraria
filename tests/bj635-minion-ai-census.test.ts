// ★BJ635（2026-10-11）：召唤物/弹幕无专属 AI 落通用兜底 全域普查——批 1 落刀判别锁。
//  普查判据（BJ634 判例推广）= 原版有专属 AI 行为面 vs 本仓落通用兜底。批 1 三型：
//    · 759 雀宝宝（AI_158_BabyBird :49643-49913）——此前落通用飞行路径（追击恒速 5/
//      环形槽悬停/无栖息位栈/无分离力/无 2000 归位瞬移）；
//    · 387/388 双子魔眼（AI_066 flag29 面 :30084-30645）——此前追击恒速 5/无 388
//      冲刺态/387 激光固定 cd/无 leash 归位态；
//    · 533 致命球（AI_066 533 面全式）——旧相位机被通用飞行块逐拍覆写（蓄力 ×0.81
//      误档/冲刺零速度写/悬停锚错/零同型分离力）。
//  ★夹具纪律（BJ514/BJ634 判例防「夹具喂幻影」）：真 Enemy 盒 + maxHp=100000
//  （canBeChasedBy lifeMax>5 门）+ boss 旗（viewRect 豁免面）+ 真 World/真 Player/
//  直接驱动 fixedUpdate。
//  ★变异证红：每断言注「旧实现退化值」——M1 759 远档 Lerp→恒速 5 / M2 388 冲刺
//  触发摘除 / M3 533 蓄力 ×0.9→×1.0 / M4 387 反推支摘除 各必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj, babyBirdHomeLocation } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; vanillaId?: number;
  boss?: boolean;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
/** 真 boss 盒夹具（★防幻影三件套：maxHp 终值/boss 旗/真盒 w×h） */
const mkEnemy = (id: number, cx: number, cy: number, w = 40, h = 40, boss = true): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000, boss, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 120, 7, 'bj635');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, added };
}

let minionSeq = 0;
const minion = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, pid, 6, 0, false, 0, false, () => player);
  m.id = ++minionSeq;
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const fld = <T, K extends string>(o: T, k: K): unknown =>
  (o as unknown as Record<K, unknown>)[k];

// ============================================================
// ① 源码锚扫描（变异源码即红）
// ============================================================
describe('① 源码锚（AI_158 / AI_066 双侧亲读锚）', () => {
  it('原版 AI_158_BabyBird 块内数值锚', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const i = src.indexOf('private void AI_158_BabyBird()');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('private void AI_067_FreakingPirates()'));
    expect(block).toContain('float num = 6f');            // 基速 6（:49648）
    expect(block).toContain('float num2 = 8f');           // 攻击钳 8（:49649）
    expect(block).toContain('int num3 = 800');            // 索敌 800（:49650）
    expect(block).toContain('float num4 = 150f');         // 近身界 150（:49651）
    expect(block).toContain('0.15f');                     // 远档 Lerp 0.15（:49693）
    expect(block).toContain('0.35f');                     // 近身 sign 步进（:49700）
    expect(block).toContain('width * 3');                 // 攻击分离力 width×3（:49708）
    expect(block).toContain('AI_158_GetHomeLocation');    // 栖息位栈
    expect(block).toContain('> 2000f');                   // 瞬移门（:49747）
    expect(block).toContain('0.025f');                    // 攻击分离 0.025（:49707）
    expect(block).toContain('0.05f');                     // 归位分离/步进（:49770/:49802）
  });

  it('原版 AI_066 块内数值锚（双子/533）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria/Projectile.cs'.replace('/', '/')), 'utf8');
    const i = src.indexOf('else if (aiStyle == 66)');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('else if (aiStyle == 67)'));
    expect(block).toContain('num526 = 2000f');            // 索敌 2000（:30090/:30105）
    expect(block).toContain('num527 = 800f');             // 双子 leash 800
    expect(block).toContain('num527 = 900f');             // 533 leash 900
    expect(block).toContain('num528 = 1200f');            // 双子交战 leash 1200
    expect(block).toContain('num528 = 1500f');            // 533 交战 leash 1500
    expect(block).toContain('num529 = 150f');             // 双子落位门 150
    expect(block).toContain('num529 = 450f');             // 533 落位门 450
    expect(block).toContain('num544 = 6f');               // 双子逼近速 6（:30378）
    expect(block).toContain('num544 = 14f');              // 388 逼近速 14（:30381）
    expect(block).toContain('num545 = 4f');               // ≤200 反推 4（:30387）
    expect(block).toContain('num546 = 12f');              // 533 悬停速 12（:30397）
    expect(block).toContain('velocity * 40f');            // 阻尼 (v×40+…)（:30383/:30458）
    expect(block).toContain('MaxUpdates = 2');            // 533 冲刺双子步（:30241）
    expect(block).toContain('extraUpdates = 1');          // 388 冲刺双子步（:30156）
    expect(block).toContain('num555 = 8f');               // 387 激光速 8（:30590）
    expect(block).toContain('damage * 1.15f');            // 激光伤 ×1.15（:30603）
    expect(block).toContain('num559 = 800');              // 533 触发界 800（:30633）
  });

  it('本仓专支锚 + 分派先于通用路径（旧落通用=病灶）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('private babyBirdStep(');
    expect(src).toContain('private twinsStep(');
    expect(src).toContain('private ai066TryInterceptingTarget(');
    expect(src).toContain('babyBirdHomeLocation(');
    // 分派链：三型专支先于通用飞行路径（`if (!this.ground)`）
    const d759 = src.indexOf('if (this.projId === 759) { this.babyBirdStep(');
    const dtw = src.indexOf('if (this.projId === 387 || this.projId === 388) { this.twinsStep(');
    const d533 = src.indexOf('if (this.projId === 533) { this.deadlySpherePhase(game, p, tgt, dmg0); return; }');
    const generic = src.indexOf('if (!this.ground) {', d533);
    expect(d759).toBeGreaterThan(-1);
    expect(dtw).toBeGreaterThan(d759);
    expect(d533).toBeGreaterThan(dtw);
    expect(generic).toBeGreaterThan(d533);
    // 旧 MINION_SHOOT[387] 条目退役（twinsStep 承接）
    expect(src).not.toContain('387: { shot: 389, speed: 8, cd: 45');
    // 真盒注册（40×20 / 20×20）
    expect(src).toContain('else if (projId === 387 || projId === 388) { this.w = 40; this.h = 20; }');
    expect(src).toContain('else if (projId === 533) { this.w = 20; this.h = 20; }');
  });

  it('AI_158_GetHomeLocation 折算纯函数：栈位表逐档（:49886-49906）', () => {
    // index 0：无 case 偏移 → (0,-21)；index 1/2/4/5/3 各 case + 栈高 -16×⌊i/6⌋
    expect(babyBirdHomeLocation(1000, 500, 1, 0)).toEqual({ x: 1000, y: 479 });
    expect(babyBirdHomeLocation(1000, 500, 1, 1)).toEqual({ x: 1008, y: 477 });   // +dir×8, -2
    expect(babyBirdHomeLocation(1000, 500, 1, 2)).toEqual({ x: 990, y: 477 });    // -dir×10, -2
    expect(babyBirdHomeLocation(1000, 500, 1, 3)).toEqual({ x: 1000, y: 469 });   // -10
    expect(babyBirdHomeLocation(1000, 500, 1, 4)).toEqual({ x: 1010, y: 469 });   // +10, -10
    expect(babyBirdHomeLocation(1000, 500, 1, 5)).toEqual({ x: 988, y: 469 });    // -12, -10
    expect(babyBirdHomeLocation(1000, 500, 1, 6)).toEqual({ x: 1000, y: 463 });   // 栈高 -16
    expect(babyBirdHomeLocation(1000, 500, -1, 1)).toEqual({ x: 992, y: 477 });   // direction=-1
  });
});

// ============================================================
// ② 759 雀宝宝 AI_158 行为锁（旧=通用恒速 5/环形槽 → M1 红）
// ============================================================
describe('② 759 AI_158 行为锁', () => {
  it('远档逼近 Lerp 0.15 → 稳态步距 6（旧通用恒速 5 → M1 红）', () => {
    const e = mkEnemy(1, 0, 0, 40, 40);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 759, player.cx + 300, player.cy);
    // 敌随从定距跟随（恒 300px 远档域,防靠进 ≤150 近身界混档）
    for (let t = 0; t < 30; t++) {
      e.cx = m.cx + 300; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
      m.fixedUpdate(1, hooks);
    }
    const x0 = m.x, y0 = m.y;
    e.cx = m.cx + 300; e.x = e.cx - 20;
    m.fixedUpdate(1, hooks);
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeGreaterThan(5.6);             // 稳态 → 6（Lerp 0.85ⁿ 收敛 25 拍 ≈5.9）
    expect(step).toBeLessThan(6.4);
    expect(step).not.toBeCloseTo(5, 1);            // 旧恒速 5 → 红
  });

  it('近身界 d≤150：sign 步进 0.35（首拍 |v|≈0.5;旧通用恒 5 → 红）', () => {
    const e = mkEnemy(2, 0, 0, 40, 40);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 759, player.cx + 80, player.cy);
    e.cx = player.cx + 80; e.x = e.cx - 20; e.cy = player.cy - 90; e.y = e.cy - 20;   // 距 70<150
    m.fixedUpdate(1, hooks);
    const v = Math.hypot(m.vx, m.vy);
    expect(v).toBeGreaterThan(0.3);                // sign 步进 0.35/轴（对角 0.495）
    expect(v).toBeLessThan(1.2);                   // 旧恒速 5 → 红
    expect((fld(m, 'tileCollide') as boolean)).toBe(false);   // :49697 近身 tileCollide=false
  });

  it('无目标 → 栖息玩家头部（AI_158_GetHomeLocation 栈位;旧环形槽 cy−30 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const mc0 = player.mountedCenter;
    const home0 = babyBirdHomeLocation(mc0.x, mc0.y, player.facing, 0);
    // 落点即栖息位（num8≈0 ≤ 8+playerSpeed → :49814-49823 snap 支;自 21px 外近家步进
    // 0.05/t 需 260 拍,不在本锁域）
    const m = minion(player, hooks, 759, home0.x, home0.y);
    m.fixedUpdate(1, hooks);
    const mc = player.mountedCenter;
    const home = babyBirdHomeLocation(mc.x, mc.y, player.facing, 0);
    expect(Math.abs(m.cx - home.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.cy - home.y)).toBeLessThanOrEqual(1);
    expect(fld(m, 'bbFrame')).toBe(4);             // 栖息帧 4（:49820,旧无此通道 → 红）
    expect(m.vx).toBe(0); expect(m.vy).toBe(0);    // 静止栖息
    expect(m.rot).toBe(0);                         // :49822
    // 次拍：玩家静置 → num8 仍 ≤8+pSpeed → 恒栖息（frame=4 连续;vanilla 每拍重置 fc=0）
    m.fixedUpdate(1, hooks);
    expect(fld(m, 'bbFrame')).toBe(4);
  });

  it('超远瞬移 2000（:49747-49756;旧仅通用 2000 回玩家中心非栖息位 → 红锚位差）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, 759, player.cx + 2100, player.cy);
    m.fixedUpdate(1, hooks);
    const mc = player.mountedCenter;
    const home = babyBirdHomeLocation(mc.x, mc.y, player.facing, 0);
    expect(Math.abs(m.cx - home.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.cy - home.y)).toBeLessThanOrEqual(1);
    expect(fld(m, 'bbFrame')).toBe(4);
  });

  it('归位档同类分离力 ±0.05（:49775-49795;旧零分离 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const m1 = minion(player, hooks, 759, player.cx + 100, player.cy - 60);
    const m2 = minion(player, hooks, 759, player.cx + 102, player.cy - 60);   // 曼哈顿 2 < width 10
    m1.fixedUpdate(1, hooks);
    m2.fixedUpdate(1, hooks);
    expect((m2.vx as number) - (m1.vx as number)).toBeGreaterThan(0.08);   // 互推差 ≥0.1（旧≈0 → 红）
  });

  it('玩家死亡断供（:49652-49655 dead→babyBird=false;维护链同相）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, 759, player.cx + 50, player.cy);
    player.dead = true;
    m.fixedUpdate(1, hooks);
    expect(m.dead).toBe(true);
  });
});

// ============================================================
// ③ 387/388 双子 AI_066 flag29 行为锁（M2/M4 红位）
// ============================================================
describe('③ 387/388 AI_066 flag29 行为锁', () => {
  it('387 交战逼近：阻尼 (v×40+dir×6)/41 → 稳态 6（旧通用恒速 5 → 红）', () => {
    const e = mkEnemy(3, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 387, player.cx + 300, player.cy);
    // 敌定距跟随（恒 >200 逼近域,防落 ≤200 反推区混档）;阻尼系数 40/41 慢收敛
    //  （6×(1−(40/41)ⁿ),n=140 → 5.80）
    for (let t = 0; t < 140; t++) {
      e.cx = m.cx + 300; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
      m.fixedUpdate(1, hooks);
    }
    const x0 = m.x, y0 = m.y;
    e.cx = m.cx + 300; e.x = e.cx - 20;
    m.fixedUpdate(1, hooks);
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeGreaterThan(5.5);             // 稳态 → 6
    expect(step).toBeLessThan(6.5);
  });

  it('387 近敌反推区 d≤200：(v×40+dir×−4)/41 → 远离目标（旧恒追进 → M4 红）', () => {
    const e = mkEnemy(4, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 387, player.cx + 100, player.cy);
    e.cx = player.cx + 200; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;   // 距 100
    for (let t = 0; t < 30; t++) m.fixedUpdate(1, hooks);
    expect(m.vx).toBeLessThan(-1);                 // 稳态远离 ≈ −3.9（旧 +5 追 → 红）
  });

  it('387 激光眼 389：dmg×1.15 截断 + 速 8 + 随机游走冷却（:30594-30613;旧固定 cd45 → 红）', () => {
    const e = mkEnemy(5, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const m = minion(player, hooks, 387, player.cx + 200, player.cy);
    e.cx = player.cx + 300; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
    m.fixedUpdate(1, hooks);
    // （夹具 added 数组含随从本体=BJ634 习语 push——只数激光弹）
    const lasers = added.filter((p) => (p as { projId?: number }).projId === 389);
    expect(lasers.length).toBe(1);                 // 首拍 twA1=0 → 出手
    const laser = lasers[0] as { projId: number; damage: number; vx: number; whipTagShot: boolean };
    expect(laser.projId).toBe(389);
    expect(laser.damage).toBe(6);                  // dmg0=6 → 6×1.15=6.9 截断 6
    expect(Math.hypot(laser.vx, (laser as unknown as { vy: number }).vy)).toBeCloseTo(8, 3);
    expect(laser.whipTagShot).toBe(true);          // 389 ∈ MinionShot
    expect(fld(m, 'twA1')).toBe(1);                // 冷却启动（随机游走面）
  });

  it('388 冲刺攻击态：触发拍速 8 → 冲刺拍双子步 16px/拍（extraUpdates=1;旧恒速 5 → M2 红）', () => {
    const e = mkEnemy(6, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 388, player.cx + 300, player.cy);
    e.cx = player.cx + 600; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;   // 距 300 <500
    m.fixedUpdate(1, hooks);                       // 触发拍：twA0=2,velocity=dir×8
    expect(fld(m, 'twA0')).toBe(2);
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(8, 3);   // 旧无冲刺态恒 5 → 红
    const x0 = m.x;
    m.fixedUpdate(1, hooks);                       // 冲刺拍：2 子步 × 8 = 16px（截击不触发：敌静止）
    expect(m.x - x0).toBeCloseTo(16, 1);           // 旧 5 → 红
  });

  it('388 冲刺 40 子步收束（20 拍）回巡航态（:30169-30174）', () => {
    const e = mkEnemy(7, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 388, player.cx + 300, player.cy);
    e.cx = player.cx + 600; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
    m.fixedUpdate(1, hooks);
    expect(fld(m, 'twA0')).toBe(2);
    for (let t = 0; t < 25; t++) m.fixedUpdate(1, hooks);
    expect(fld(m, 'twA0')).toBe(0);                // 40 子步 = 20 拍 → 回 0
  });

  it('388 远距逼近速 14（num526≥500 不冲刺;旧恒速 5 → 红）', () => {
    const e = mkEnemy(8, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 388, player.cx + 300, player.cy);
    // 敌钉玩家+900（对鸟恒 ≈600 ≥500 不触发冲刺）;鸟逐拍回位玩家+300（防 1200 leash
    // ——追 600px 外敌 100+ 拍即触 leash 归位带,混档）;阻尼 40/41 慢收敛
    //  （14×(1−(40/41)ⁿ),n=140 → 13.5）
    for (let t = 0; t < 140; t++) {
      e.cx = player.cx + 900; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
      m.x = player.cx + 300 - m.w / 2; m.y = player.cy - m.h / 2;
      m.fixedUpdate(1, hooks);
    }
    const x0 = m.x, y0 = m.y;
    e.cx = m.cx + 600; e.x = e.cx - 20;
    m.fixedUpdate(1, hooks);
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeGreaterThan(12);              // 稳态 → 14
    expect(step).toBeLessThan(16);
  });

  it('双子分离力 ±0.05（:30117-30146;旧通用块互斥已有但仅双子——本锁防退役回归）', () => {
    const { hooks, player } = makeHooks([]);
    const m1 = minion(player, hooks, 387, player.cx + 100, player.cy - 60);
    const m2 = minion(player, hooks, 388, player.cx + 104, player.cy - 60);   // 曼哈顿 4 < width 40
    m1.fixedUpdate(1, hooks);
    m2.fixedUpdate(1, hooks);
    expect(Math.abs((m2.vx as number) - (m1.vx as number))).toBeGreaterThan(0.001);
  });
});

// ============================================================
// ④ 533 致命球 AI_066 533 面行为锁（M3 红位）
// ============================================================
describe('④ 533 AI_066 533 面行为锁', () => {
  it('蓄力段 velocity×0.9/拍（:30193;旧通用覆写恒速 5/×0.81 误档 → M3 红）', () => {
    const e = mkEnemy(9, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 533, player.cx + 100, player.cy);
    e.cx = player.cx + 1100; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;   // 距 1000 >800 不触发
    (fld(m, 'dA0') as never);                      // 态机字段直置蓄力带
    (m as unknown as { dA0: number }).dA0 = 5;
    m.vx = 4; m.vy = 0;
    m.fixedUpdate(1, hooks);
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(3.6, 3);   // ×0.9（旧恒 5/0.81×4=3.24 → 红）
    // 蓄力帧表游标（:30196 num533 = dA1/2 + (dA0−3)×8 = 16 → `29−num533` 档 = 13）
    expect(fld(m, 'dFrame')).toBe(13);
  });

  it('冲刺触发拍 velocity=dir×10（:30640-30643;旧零速度写恒速 5 → 红）', () => {
    const e = mkEnemy(10, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 533, player.cx + 100, player.cy);
    e.cx = player.cx + 500; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;   // 距 400 <800
    m.fixedUpdate(1, hooks);
    expect(fld(m, 'dA0')).toBe(6);                 // 0+6 → 冲刺带
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(10, 3);   // 出膛 10（旧 5 → 红）
  });

  it('冲刺 MaxUpdates=2 → 20px/拍双子步（:30241;旧单步恒速 5 → 红）', () => {
    const e = mkEnemy(11, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 533, player.cx + 100, player.cy);
    e.cx = player.cx + 500; e.x = e.cx - 20; e.cy = player.cy; e.y = e.cy - 20;
    m.fixedUpdate(1, hooks);                       // 触发（出膛 10,单步积分）
    const x0 = m.x;
    m.fixedUpdate(1, hooks);                       // 冲刺拍：2 子步 × 10 = 20px
    expect(m.x - x0).toBeCloseTo(20, 1);           // 旧 5 → 红
  });

  it('悬停锚 = player.Center+(0,−60) 阻尼 12（:30402-30467;旧环形槽 cy−30 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, 533, player.cx + 100, player.cy);
    // >70px 阻尼逼近/<70px 无驱动力直航（原版死区）→ 绕锚极限环（振幅 ≈70+直航越程）;
    // 采样最小 Y 触锚带
    let minY = Infinity;
    for (let t = 0; t < 120; t++) {
      m.fixedUpdate(1, hooks);
      minY = Math.min(minY, m.cy);
      expect(Math.hypot(m.cx - player.cx, m.cy - (player.cy - 60))).toBeLessThan(135);   // 死区直航越程有界
    }
    expect(minY).toBeLessThan(player.cy - 50);     // 触 −60 锚带（旧环形槽 −30−18 → min −48 → 红）
  });

  it('同型分离力 ±0.05（:30117-30146 flag30;旧 533 不在互斥面 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const m1 = minion(player, hooks, 533, player.cx + 100, player.cy - 60);
    const m2 = minion(player, hooks, 533, player.cx + 110, player.cy - 60);   // 曼哈顿 10 < width 20
    m1.fixedUpdate(1, hooks);
    m2.fixedUpdate(1, hooks);
    expect((m2.vx as number) - (m1.vx as number)).toBeGreaterThan(0.04);   // 旧 0 → 红
  });

  it('状态光/帧通道：ai[0]%3==2 蓝光 + 帧机分相（:30150-30155/:30596-30620）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, 533, player.cx, player.cy);
    (m as unknown as { dA0: number }).dA0 = 2;
    expect(m.lightRGB).toEqual([0.3, 0.5, 0.7]);   // 相位 2 档蓝光（旧恒暖 → 红）
    (m as unknown as { dA0: number }).dA0 = 0;
    expect(m.lightRGB).toEqual([0.8, 0.3, 0.1]);
    m.fixedUpdate(1, hooks);                       // dA0=0 待机：dFc=1 → frame=4+0
    expect(fld(m, 'dFrame')).toBe(4);              // 旧三帧近似 [2,3,0] → 1 → 红
  });

  it('撞墙计数 dLai2（:30120 衰减/:18314 +30）——击退 ×0.5 消费面登记', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, 533, player.cx + 100, player.cy);
    (m as unknown as { dLai2: number }).dLai2 = 50;
    m.fixedUpdate(1, hooks);                       // 无碰撞拍：50−1=49
    expect(fld(m, 'dLai2')).toBe(49);
  });
});

// ============================================================
// ⑤ BJ632 三帧档债定谳锁（643 3t 循环 / 758 分段帧机 / 1119 状态帧）
// ============================================================
describe('⑤ BJ632 帧档债清偿锁', () => {
  it('643 彩虹水晶塔 3t 帧循环：MINION_FRAMES[643]=[3,8,0]（AI_123 :37787-37793 源锚）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toMatch(/643: \[3, 8, 0\]/);
    const vsrc = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const i = vsrc.indexOf('private void AI_123_FloatingTurrets()');
    const block = vsrc.slice(i, i + 4000);
    expect(block).toContain('frameCounter >= 3');  // 3t 推帧（旧 age/8 → 红）
  });

  it('758 吸血蛙 flag6 四带帧机：静立 0/飞行 1/步行带 2-9/攻击带 10-15/空中攻击 13', () => {
    const e = mkEnemy(20, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 758, player.cx + 100, player.cy - 200);
    const tick = (tgt: unknown) =>
      (m as unknown as { frogFrameTick: (t: unknown) => void }).frogFrameTick(tgt);
    // 静立（grounded + vx=0）
    (m as unknown as { onGround: boolean }).onGround = true; m.vx = 0;
    (m as unknown as { frFrame: number }).frFrame = 5;   // 带外残留
    (m as unknown as { frFc: number }).frFc = 0;
    tick(null);
    expect(fld(m, 'frFrame')).toBe(0);             // :51735-51739
    // 步行带（grounded + |vx|≥0.5 → fc 累计 >10 推帧,带 2-9）
    (m as unknown as { frFrame: number }).frFrame = 0;
    m.vx = 3;
    for (let t = 0; t < 4; t++) tick(null);        // fc: 4,8,12→推帧,4
    expect(fld(m, 'frFrame')).toBe(2);             // 旧 age/8 匀速 → 红
    for (let t = 0; t < 24; t++) tick(null);       // 推满带
    expect(fld(m, 'frFrame')).toBeGreaterThanOrEqual(2);
    expect(fld(m, 'frFrame')).toBeLessThanOrEqual(9);
    // 飞行（!onGround 无敌 → 帧 1）
    (m as unknown as { onGround: boolean }).onGround = false;
    tick(null);
    expect(fld(m, 'frFrame')).toBe(1);             // :51751-51756
    // 空中攻击（!onGround 有敌 → 帧 13）
    tick(e);
    expect(fld(m, 'frFrame')).toBe(13);            // :51722-51726
    // 攻击带（grounded 有敌 → fc>3 推帧,带 10-15）
    (m as unknown as { onGround: boolean }).onGround = true;
    (m as unknown as { frFrame: number }).frFrame = 0;
    (m as unknown as { frFc: number }).frFc = 0;
    for (let t = 0; t < 8; t++) tick(e);
    expect(fld(m, 'frFrame')).toBeGreaterThanOrEqual(10);
    expect(fld(m, 'frFrame')).toBeLessThanOrEqual(15);
  });

  it('1119 禁戒魂灵状态帧机：出弹前 4t 起帧 5/攻击带推帧/失靶即断/待机带滞帧', () => {
    const e = mkEnemy(21, 0, 0);
    const { hooks, player } = makeHooks([e]);
    const m = minion(player, hooks, 1119, player.cx + 100, player.cy - 60);
    e.cx = player.cx + 200; e.x = e.cx - 20; e.cy = player.cy - 60; e.y = e.cy - 20;
    (m as unknown as { shootCd: number }).shootCd = 125;
    m.fixedUpdate(1, hooks);                       // shootCd 125→124 → 起帧 5（:38296）
    expect(fld(m, 'fmFrame')).toBe(5);             // 旧 age/8 匀速 → 红
    (m as unknown as { fmFc: number }).fmFc = 3;
    m.fixedUpdate(1, hooks);                       // 攻击带 fc 4 → frame 6
    expect(fld(m, 'fmFrame')).toBe(6);
    // 失靶即断（:38307-38310）
    e.dead = true;
    (m as unknown as { fmFrame: number }).fmFrame = 7;
    (m as unknown as { fmFc: number }).fmFc = 0;
    m.fixedUpdate(1, hooks);
    expect(fld(m, 'fmFrame')).toBe(0);
    // 待机带不扫攻击帧（100 拍恒 ≤4——旧 age/8 % 9 扫到 5-8 → 红）
    e.dead = false; e.hp = 100000;
    e.cx = player.cx + 100000; e.x = e.cx - 20;    // 屏外+超 800 → tgtF 无
    for (let t = 0; t < 100; t++) m.fixedUpdate(1, hooks);
    expect(fld(m, 'fmFrame')).toBeLessThanOrEqual(4);
  });
});
