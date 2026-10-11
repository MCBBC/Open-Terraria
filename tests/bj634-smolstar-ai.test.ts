// ★BJ634（2026-10-11）：刃杖（Smolstar vid 4758 / 召唤物 projId 864）「打 boss 老不打/
//  追不上」定谳锁。AI_169_Smolstars（Projectile.cs:46559-46700 亲读）1:1 折算落刀
//  （MinionProj.smolstarAI）。用户实报病灶 = 864 此前无专属 AI 分支落通用飞行路径：
//    · 攻击速度恒 5（原版 velocity=vector5 直写钳 16 :46666-46671）→ 追 boss 追不上；
//    · 索敌 nearestEnemy(700) 每拍重选（原版 Minion_FindTargetInRange(800) :46601-46602
//      + ai[0]=60 锁敌态机 :46603-46608 + 焦点支/双距/boss 豁免 viewRect）→ 目标乱跳；
//    · 命中受理无返航（原版 :14129-14141 Damage_PVE_Inner 864 特支 ai[0]>0→-1）；
//    · 命中盒 16×16 缺省（原版 10×10 :8288-8289）。
//  ★夹具纪律（BJ514 判例防「夹具喂幻影」）：真 Enemy 盒 + maxHp=100000（canBeChasedBy
//  lifeMax>5 门,BJ89 幻影字段教训）+ boss 旗（findTargetInRangeDual viewRect 豁免面）
//  + 真 World/真 Player/直接驱动 fixedUpdate。
//  ★变异证红：每断言注「旧实现退化值」——M1 攻击钳 16→5 / M2 锁敌态机摘除（每拍
//  重选最近）/ M3 命中转返航摘除 各必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
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
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24, boss = false): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000, boss, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 120, 7, 'bj634');
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
const minion = (player: Player, hooks: GameHooks, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, 864, 6, 0, false, 0, false, () => player);
  m.id = ++minionSeq;                       // Entities.add nextId++ 分配模拟（tGroup whoAmI 序依赖）
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;   // cx/cy 对齐（盒左上=Entity 语义）
  // ★运行时弹恒在 entities.projectiles 列内（tGroup/Main.projectile 遍历含自身）——
  // 夹具漏 push 会致 tGroup total=0（防御回退 1,但编队相位失真）——统一入列
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const st = (m: MinionProj): number => (m as unknown as { a169St: number }).a169St;
const tg = (m: MinionProj): number => (m as unknown as { a169Tg: number }).a169Tg;

// ============================================================
// ① AI_169 移动式逐参锁（源码扫描 + 行为锁）
// ============================================================
describe('① AI_169 移动式逐参锁（Projectile.cs:46559-46700 亲读锚）', () => {
  it('原版块内数值锚（源码扫描,变异源码即红）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const i = src.indexOf('private void AI_169_Smolstars()');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('private void AI_019_Spears()'));
    expect(block).toContain('num6 = 16f');                      // 攻击态钳 16（:46666）
    expect(block).toContain('num4 = 10f');                      // 巡航基速 10（:46588）
    expect(block).toContain('200f, 600f');                      // 速度梯（:46589）
    expect(block).toContain('>= 3000f');                        // 瞬移门（:46591）
    expect(block).toContain('startAttackRange = 800');          // 索敌 800（:46598）
    expect(block).toContain('>= 900f');                         // 玩家距目标放弃门（:46658）
    expect(block).toContain('0.92f');                           // 返航阻尼（:46637）
    expect(block).toContain('width * 5');                       // 分离距离 50（:46676）
    expect(block).toContain('Minion_FindTargetInRange');        // 索敌单源
  });

  it('本仓 smolstarAI 块内对应锚 + 864 专属分派先于通用路径（旧落通用=病灶）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const i = src.indexOf('private smolstarAI(');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, src.indexOf('private terraprismaAI('));
    expect(block).toContain('dist > 16');                       // 攻击钳 16（M1 变异位）
    expect(block).toContain('findTargetInRangeDual(game, 800)');// 索敌 800（旧 700=红）
    expect(block).toContain('a169St = 60');                     // 锁敌态机（M2 变异位）
    expect(block).toContain('a169St = -1');
    expect(block).toContain('>= 900');
    expect(block).toContain('*= 0.92');
    expect(block).toContain('this.w * 5');
    expect(block).toContain('this.contact(game, dmg0) && this.a169St > 0');  // M3 变异位
    // 分派链：864 分支先于通用飞行路径（`if (!this.ground)`）
    const disp = src.indexOf('if (this.projId === 864) { this.smolstarAI(');
    const generic = src.indexOf('if (!this.ground) {', disp);
    expect(disp).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(-1);
  });

  it('攻击态速度 16：boss 盒内锁定 1 拍位移=16px 沿向（旧通用 5 → M1 红）', () => {
    const boss = mkEnemy(7, 0, 0, 120, 120, true);
    const { hooks, player } = makeHooks([boss]);
    const m = minion(player, hooks, player.cx + 300, player.cy);
    boss.cx = player.cx + 100; boss.x = boss.cx - 60; boss.cy = player.cy; boss.y = boss.cy - 60;
    m.fixedUpdate(1, hooks);                       // 巡航拍锁定（me 距=200≤800）
    expect(st(m)).toBe(60);
    expect(tg(m)).toBe(7);
    const x0 = m.x, y0 = m.y;
    m.fixedUpdate(1, hooks);                       // 攻击拍：velocity=vector5 钳 16
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeCloseTo(16, 3);               // 距心 184>16 → 恒 16/t（旧 5 → 红）
  });

  it('巡航速度梯：无敌 <200px→10/t（旧通用 ≤4 红）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx + 100, player.cy - 30);   // 距锚 ~100<200
    const x0 = m.x, y0 = m.y;
    m.fixedUpdate(1, hooks);
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(10);          // num4=10（<200 梯底）
    expect(step).toBeCloseTo(10, 3);               // 旧通用 min(4, d*0.08)≈4 → 红
  });

  it('巡航速度梯：>600px 外→40/t 直写钳（原版 GetLerpValue(200,600) 满档）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx + 700, player.cy);        // 距锚 ~700>600
    const x0 = m.x, y0 = m.y;
    m.fixedUpdate(1, hooks);
    const step = Math.hypot(m.x - x0, m.y - y0);
    expect(step).toBeCloseTo(40, 3);               // num4=10+30=40（旧通用 4 → 红）
  });

  it('瞬移门 3000：距锚 ≥3000 → 瞬移至锚（+同拍旧 vector4 速度 40px,原版 :46591-46597 同构）→ 次拍收敛', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx + 3100, player.cy);
    m.fixedUpdate(1, hooks);                       // 瞬移拍：Center=vector 后 velocity=旧 vector4 钳 40
    const anchorX = player.cx, anchorY = player.y - 30;
    expect(Math.hypot(m.cx - anchorX, m.cy - anchorY)).toBeLessThanOrEqual(40.01);
    expect(Math.hypot(m.cx - anchorX, m.cy - anchorY)).toBeGreaterThan(30);   // 旧速 40 直积分同构
    m.fixedUpdate(1, hooks);                       // 次拍 dist≈40<200 → 10/t 收敛
    expect(Math.hypot(m.cx - anchorX, m.cy - anchorY)).toBeLessThanOrEqual(31);
  });

  it('玩家死亡断供（:46566-46569 dead→smolstar=false→弹灭;维护链同拍直杀同相）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx + 50, player.cy);
    player.dead = true;
    m.fixedUpdate(1, hooks);
    expect(m.dead).toBe(true);
  });
});

// ============================================================
// ② 索敌门锁（真 boss 盒夹具——防幻影）
// ============================================================
describe('② 索敌门锁（Minion_FindTargetInRange(800, skip=false) 1:1）', () => {
  it('boss 豁免 viewRect：boss 盒心屏外（y−700）但随从距 650 ≤800 → 照锁（旧 viewRect 无豁免 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    // 随从在 (P.x+700, P.y-50)；boss 盒心 (P.x+700, P.y-700)：me 距 650≤800 ✔、
    // player 距 hypot(700,700)=990>800（closerIsMe 支 ok=md ✔）；
    // viewRect=P 中心 ±(960,600)：boss 盒 [cy−775,cy−625] 与 [cy−600,cy+600] 不相交
    const m = minion(player, hooks, player.cx + 700, player.cy - 50);
    const boss = mkEnemy(9, player.cx + 700, player.cy - 700, 150, 150, true);
    (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [boss];
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(60);
    expect(tg(m)).toBe(9);
  });

  it('非 boss 屏外拒：同位杂兵（无 boss 旗）→ 不锁（viewRect 门对非 boss 生效）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx + 700, player.cy - 50);
    const mob = mkEnemy(10, player.cx + 700, player.cy - 700, 150, 150, false);
    (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [mob];
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(0);
    expect(tg(m)).toBe(0);
  });

  it('焦点支（respectOwnerTarget 缺省 true）：槽内敌 780px 优先于野生近敌 100px', () => {
    const { hooks, player } = makeHooks([]);
    const far = mkEnemy(11, player.cx + 780, player.cy, 40, 40, true);
    const near = mkEnemy(12, player.cx + 100, player.cy, 40, 40, true);
    (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [far, near];
    const m = minion(player, hooks, player.cx + 700, player.cy);
    (player as unknown as { minionTargetId: number }).minionTargetId = far.id;
    m.fixedUpdate(1, hooks);
    expect(tg(m)).toBe(11);                        // 焦点即退（:49888-49897）;旧 nearestEnemy → 12 红
  });

  it('锁敌态机：锁定 A 后新杂兵更近出现 → 恒追 A（旧每拍重选 → M2 红）', () => {
    const a = mkEnemy(21, 0, 0, 100, 100, true);
    const { hooks, player } = makeHooks([a]);
    const m = minion(player, hooks, player.cx + 100, player.cy);
    a.cx = player.cx + 200; a.x = a.cx - 50; a.cy = player.cy; a.y = a.cy - 50;
    m.fixedUpdate(1, hooks);                       // 锁 A
    expect(tg(m)).toBe(21);
    // 新杂兵更近 + A 远去——仍锁 A
    const c = mkEnemy(22, player.cx + 10, player.cy, 40, 40, true);
    a.cx = player.cx + 700; a.x = a.cx - 50; a.cy = player.cy; a.y = a.cy - 50;
    (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [a, c];
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(60);
    expect(tg(m)).toBe(21);                        // M2（每拍重选）→ 22 红
  });

  it('目标失效转返航（:46651-46656 CanBeChasedBy 失败 → ai[0]=-1）', () => {
    const a = mkEnemy(31, 0, 0, 100, 100, true);
    const { hooks, player } = makeHooks([a]);
    const m = minion(player, hooks, player.cx + 100, player.cy);
    a.cx = player.cx + 200; a.x = a.cx - 50; a.cy = player.cy; a.y = a.cy - 50;
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(60);
    a.dead = true;
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(-1);                        // 旧无态机恒 60 → 红
  });

  it('玩家距目标 ≥900 放弃（:46657-46662）→ 回闲置态', () => {
    const a = mkEnemy(41, 0, 0, 100, 100, true);
    const { hooks, player } = makeHooks([a]);
    const m = minion(player, hooks, player.cx + 100, player.cy);
    a.cx = player.cx + 200; a.x = a.cx - 50; a.cy = player.cy; a.y = a.cy - 50;
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(60);
    a.cx = player.cx + 950; a.x = a.cx - 50; a.cy = player.cy; a.y = a.cy - 50;
    m.fixedUpdate(1, hooks);
    expect(st(m)).toBe(0);
    expect(tg(m)).toBe(0);
  });
});

// ============================================================
// ③ 命中判定锁（接触伤/local 10 冷却/命中转返航）
// ============================================================
describe('③ 命中判定锁（:14129-14141 Damage_PVE_Inner 864 特支折算）', () => {
  it('锁定态接触 boss → hurt 结算 + 命中后转返航（M3 摘除 → a169St 恒 60 红）', () => {
    const boss = mkEnemy(51, 0, 0, 300, 300, true);
    const { hooks, player } = makeHooks([boss]);
    const m = minion(player, hooks, player.cx + 100, player.cy - 150);
    boss.cx = player.cx + 100; boss.x = boss.cx - 150;
    boss.cy = player.cy - 150; boss.y = boss.cy - 150;    // 盒心=仆从位（AABB 交）
    m.fixedUpdate(1, hooks);                              // 锁定拍（索敌置 60 后 contact）
    expect(boss.hits.length).toBeGreaterThan(0);          // 伤害落地（dmg0=6×mult=6）
    expect(st(m)).toBe(-1);                               // 命中 → 返航（ai[0]>0 特支）
    expect((m as unknown as { a169Rt: number }).a169Rt).toBe(0);
  });

  it('localNPCHitCooldown=10：10t 冷却窗内持续接触只结算一次（CONTACT_CD_TABLE 864:10）', () => {
    const boss = mkEnemy(61, 0, 0, 600, 600, true);       // 巨盒覆盖返航漂移区
    const { hooks, player } = makeHooks([boss]);
    boss.cx = player.cx; boss.cy = player.cy;
    boss.x = boss.cx - 300; boss.y = boss.cy - 300;
    const m = minion(player, hooks, player.cx, player.cy);
    for (let t = 0; t < 9; t++) m.fixedUpdate(1, hooks);  // 首拍命中+转返航+9 拍内
    expect(boss.hits.length).toBe(1);                     // 冷却窗内不再结算
    expect(st(m)).toBe(-1);                               // 返航 9t 未满（hit 拍后 rt 计数 <9）
  });

  it('闲置态命中不转返航（ai[0]>0 门 :14135——接触伤照结算）：boss 盒盖仆从而心距 >800 索敌拒', () => {
    const boss = mkEnemy(71, 0, 0, 300, 2200, true);
    const { hooks, player } = makeHooks([boss]);
    const m = minion(player, hooks, player.cx, player.cy);
    // 盒心 (P.cx, P.cy+950)：玩家/随从距盒心 950>800 → 巡航索敌拒 → 恒 0 态;
    // 盒 x∈[cx−150,cx+150] y∈[cy−150,cy+2050] 盖住仆从（y=P.y−30）→ contact 结算
    boss.cx = player.cx; boss.x = boss.cx - 150;
    boss.cy = player.cy + 950; boss.y = boss.cy - 1100;
    m.fixedUpdate(1, hooks);
    expect(boss.hits.length).toBeGreaterThan(0);          // 接触伤照结算
    expect(st(m)).toBe(0);                                // 恒闲置（ai[0]>0 门拒转）
  });

  it('返航态命中不转（-1 态 ai[0]<0 同门 :14135）', () => {
    const boss = mkEnemy(72, 0, 0, 300, 300, true);
    const { hooks, player } = makeHooks([boss]);
    const m = minion(player, hooks, player.cx, player.cy);
    boss.cx = player.cx; boss.x = boss.cx - 150;
    boss.cy = player.cy; boss.y = boss.cy - 150;
    (m as unknown as { a169St: number }).a169St = -1;
    (m as unknown as { a169Rt: number }).a169Rt = 5;
    m.fixedUpdate(1, hooks);
    expect(boss.hits.length).toBeGreaterThan(0);          // 命中结算
    expect((m as unknown as { a169St: number }).a169St).toBe(-1);   // 恒 -1（无二次转）
  });
});

// ============================================================
// ④ 闲置态（编队悬浮锚/分离力/返航节奏）
// ============================================================
describe('④ 闲置态与返航重整态（:46562-46584/:46617-46644/:46675-46698）', () => {
  it('编队悬浮锚：total=3 三刃椭圆相位分离（:46575-46584 vec2=(12,2.4)×(total-1) 角差 2π/3）', () => {
    const { hooks, player } = makeHooks([]);
    const ms = [
      minion(player, hooks, player.cx, player.cy),
      minion(player, hooks, player.cx, player.cy),
      minion(player, hooks, player.cx, player.cy),
    ];
    for (const m of ms) m.fixedUpdate(1, hooks);
    // index 0/1/2 → 角差 2π/3（gtw=0 相位项 0 仍分离）——X 投影差非零
    // （vec2x=6×2=12: |−sin(0)·12 −(−sin(4π/3)·12)|>0;旧无编队=全同位 → 0 红）
    const ax = Math.abs(ms[0].cx - ms[2].cx) + Math.abs(ms[0].cy - ms[2].cy);
    expect(ax).toBeGreaterThan(0);
  });

  it('分离力：60 态双刃曼哈顿 <50 → 双轴互推 ±0.1/t（:46675-46698;闲置态无分离力）', () => {
    const boss = mkEnemy(81, 0, 0, 100, 100, true);
    const { hooks, player } = makeHooks([boss]);
    const m1 = minion(player, hooks, player.cx + 100, player.cy);
    const m2 = minion(player, hooks, player.cx + 104, player.cy);   // 曼哈顿 4<50
    boss.cx = player.cx + 200; boss.x = boss.cx - 50; boss.cy = player.cy; boss.y = boss.cy - 50;
    m1.fixedUpdate(1, hooks);
    m2.fixedUpdate(1, hooks);
    // 两只同拍锁定（同向速度 16）+ 互推反向叠加——速度差 ∈ (0,0.2]（互推存在形态;
    // 判向经 m1 先行位移后可能换侧,但互推量恒 ±0.1/轴 → 差非零）;旧无分离力 → 0 红
    expect(st(m1)).toBe(60);
    expect(st(m2)).toBe(60);
    const dv = Math.abs(m1.vx - m2.vx);
    expect(dv).toBeGreaterThan(0.001);
    expect(dv).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('返航重整态节奏：首拍圆缘冲量+阻尼 0.92、9 拍回闲置（:46617-46644）', () => {
    const { hooks, player } = makeHooks([]);
    const m = minion(player, hooks, player.cx, player.cy);
    (m as unknown as { a169St: number }).a169St = -1;
    (m as unknown as { a169Rt: number }).a169Rt = 0;
    m.vx = 10; m.vy = -6;
    const v0 = Math.hypot(m.vx, m.vy);
    m.fixedUpdate(1, hooks);                       // rt0→1：冲量(≤4)+旋转积分+×0.92
    const v1 = Math.hypot(m.vx, m.vy);
    // 合成包络：|v0±4|×0.92（冲量随机角 + 0.92 阻尼,原版序 :46633→:46637）
    expect(v1).toBeGreaterThanOrEqual((v0 - 4) * 0.92 - 1e-6);
    expect(v1).toBeLessThanOrEqual((v0 + 4) * 0.92 + 1e-6);
    expect(st(m)).toBe(-1);
    for (let t = 0; t < 8; t++) m.fixedUpdate(1, hooks);   // rt 1→9
    expect(st(m)).toBe(0);                         // ≥9 回闲置
    expect((m as unknown as { a169Rt: number }).a169Rt).toBe(0);
  });
});
