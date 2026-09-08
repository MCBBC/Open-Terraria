// MinionProj 湿段 AI 读相=上拍快照（wetAi）回归（2026-09-08 定谳批）。
//  定谳（Terarria1457/Terraria/Projectile.cs 逐读点核,MinionProj 类字段块头注①②③）：
//  · vanilla Update 子步序 = AI(:16880) → 湿段(:16895-17113) → Shimmer(:17114) →
//    HandleMovement(:17122) → AI 读【上一子步】湿段值。
//  · 旧实现 tick 头湿段下 AI 读【当拍】段值 = 提前 1 拍;稳态同值,分叉仅「运动中跨
//    液面拍」——×2 = 起跳速 2×（-9→-18,贴水跳 2 倍高）,可感 → 修。
//  · 挪位（湿段插 AI 后/位移前）在本类不可达（家族 AI 与位移同函数体,ai0=1/2/4/5
//    早退 return 15+ 处会整跳湿段）→ 以 wetAi 上拍快照实现同读相;首拍=出生预置值
//    （vanilla NewProjectile :10886-10893 时点先于首拍 AI）。
//  判别力设计：跨液面边界拍——当拍湿段已置 wet=true、上拍值=false 时贴地起跳：
//  原版读相（上拍值）不 ×2（-9）,旧当拍读相会 ×2（-18）。几何=旧受段族批
//  minion-wet-oldfamilies 同款（蛙 758 真盒 20×30/水带/行 71 地板）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';

const LIQ = 255;
/** 地板行 71（px y 1136）;水带列 [30..40] 行 [60..70] 由 flood/drain 控制 */
function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  for (let x = 28; x <= 42; x++) w.store.setTile(x, 71, 1);
  return w;
}
function setWater(w: World, on: boolean): void {
  for (let x = 30; x <= 40; x++) {
    for (let y = 60; y <= 70; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = on ? LIQ : 0;
      w.store.liquidType[i] = 0;
    }
  }
}

interface Harness { g: GameHooks; w: World; player: Player; sfx: string[] }

function mkGame(w: World): Harness {
  const sfx: string[] = [];
  const pl = new Player(20 * TILE, 30 * TILE, new Inventory());
  pl.facing = 1;
  const g = {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: () => ({ vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown }),
    playSfxWav: (name: string) => { sfx.push(String(name)); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  (g as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { g, w, player: pl, sfx };
}

const mkMinion = (h: Harness, projId: number, x: number, y: number): MinionProj =>
  new MinionProj(x, y, projId, 10, 2, false, 0, false, () => h.player);

// =====================================================================
// 蛙 758（AI_067 flag2）:51616 湿身跳 ×2 读相——wetAi 上拍快照
// =====================================================================
describe('蛙 758 :51616 湿身跳 ×2 读相（wetAi 上拍快照）', () => {
  /** 两拍序列：拍 1 玩家同高（|dyA|<48 无高出距离表;前墙列扫无墙 → 无跳跃意图）
   *  → 拍间设水（或不设）→ 拍 2 玩家升至 108px 高处（距离表 -9 档）。
   *  wetAtTick1=false ⇒ 拍 2「当拍湿段置 wet=true 而上拍值=false」的边界拍。 */
  const vyAtBoundary = (wetAtTick1: boolean): { vy: number; wet: boolean } => {
    const h = mkGame(mkWorld());
    if (wetAtTick1) setWater(h.w, true);
    const m = mkMinion(h, 758, 500, 1106);      // 真盒 20×30,盒底=1136（行 71 顶）
    h.player.x = 620; h.player.y = 1100;        // p.cy=1121=蛙心（同高）
    m.fixedUpdate(1 / 60, h.g);                 // 拍 1:预置+上拍快照定格
    if (!wetAtTick1) setWater(h.w, true);       // 拍间跨液面 → 拍 2 当拍 wet=true
    h.player.x = 543; h.player.y = 992;         // 拍 2:高差 108 → 距离表 -9
    m.fixedUpdate(1 / 60, h.g);
    return { vy: m.vy, wet: m.wet };
  };

  it('边界拍:当拍 wet=true、上拍值=false → 原版读相不 ×2（-9;旧当拍读相=-18）', () => {
    const r = vyAtBoundary(false);
    expect(r.wet).toBe(true);                   // 分叉在 AI 读相,非旗本身
    expect(r.vy).toBeCloseTo(-9, 9);
  });

  it('稳态:上拍值=true → ×2（-18;与 minion-wet-oldfamilies 出生拍钉互补）', () => {
    const r = vyAtBoundary(true);
    expect(r.wet).toBe(true);
    expect(r.vy).toBeCloseTo(-18, 9);
  });
});

// =====================================================================
// 卡提瓦 1093（AI_067 flag8）:51616 ×2 读相——probe 现场盒测位退役归一快照
//  （palGroundStep 消费位同刀;跳体=跳梯五档,墙列出现于拍 2 → 两场景梯档同值）
// =====================================================================
describe('卡提瓦 1093 :51616 湿身跳 ×2 读相（wetAi 上拍快照,probe 位退役）', () => {
  /** 两拍序列:拍 1 无墙（列扫不触发,梯档不跑）→ 拍间设水+立前墙 → 拍 2 列扫命中
   *  跳梯（flag21 需 |v15x|≥64 → 锚=敌侧翼点,前方同高敌 320px,台账批①同款 mkEnemy）。
   *  两场景梯档几何全同,唯一差=上拍湿旗 → vy 比值 2=×2 生效判据。 */
  const vyAtBoundary = (wetAtTick1: boolean): { vy: number; wet: boolean } => {
    const h = mkGame(mkWorld());
    if (wetAtTick1) setWater(h.w, true);
    const m = mkMinion(h, 1093, 490, 1136 - 22);   // 真盒 14×22,盒底=1136
    const en = {
      id: 3, x: 817 - 8, y: 1125 - 12, w: 16, h: 24, dead: false,
      cx: 817, cy: 1125, hp: 100000, hits: [] as number[],
      hurt(d: number): boolean { this.hp -= d; this.hits.push(d); return true; },
    };
    (h.g as unknown as { enemies: () => unknown[] }).enemies = () => [en];
    h.player.x = 620; h.player.y = 1100;
    m.fixedUpdate(1 / 60, h.g);                    // 拍 1:无墙不跳,快照定格
    if (!wetAtTick1) setWater(h.w, true);
    // 列扫柱 = 中柱+intent+round(vx)（:51438 柱式,vx=0.6 → round=1）→ 墙跨中柱+1 两列;
    // 跳梯探测柱 pc = 中柱+intent+trunc(vx)=中柱+1 → 同墙覆盖（五档 -11.1 档）
    const wallCol = Math.floor((m.x + m.w / 2) / 16) + 1;
    for (const wc of [wallCol, wallCol + 1]) {
      for (let yy = 65; yy <= 70; yy++) h.w.store.setTile(wc, yy, 1);
    }
    h.player.x = 543; h.player.y = 992;
    m.fixedUpdate(1 / 60, h.g);                    // 拍 2:前墙列扫命中 → 跳梯
    return { vy: m.vy, wet: m.wet };
  };

  it('边界拍:上拍值=false → 不 ×2（vy=梯档 L）;稳态:上拍值=true → vy=2L', () => {
    const dry = vyAtBoundary(false);
    const wet = vyAtBoundary(true);
    expect(dry.wet).toBe(true);
    expect(wet.wet).toBe(true);
    expect(dry.vy).toBeLessThan(-4);               // 梯档确已起跳（负速）
    expect(wet.vy).toBeCloseTo(2 * dry.vy, 9);     // ×2 只看上拍旗（旧当拍读相=两场景同比 1）
  });
});

// =====================================================================
// TryJumpingToTarget 共享尾（:52109-52167,2026-09-08 续单 1:1 补接）
//   调用位 :51024（五家族,结算段/俯扑门前）→ 跃起 vy≠0 使结算段让位;
//   :52114 湿中下落支与 :51084 干态俯扑专支以 wet 互斥=原文设计。
// =====================================================================

/** 卡提瓦 1093 + 正上方 120px 敌（盒底距=盒底距）;返回拍 1 终速与旗 */
const tailCase = (opts: { wet: boolean; vy0?: number; palA1?: number }): {
  vy: number; wet: boolean;
} => {
  const h = mkGame(mkWorld());
  if (opts.wet) setWater(h.w, true);
  const m = mkMinion(h, 1093, 490, 1136 - 22);     // 真盒 14×22,盒底=1136,心 cy=1125
  const en = {
    id: 9, x: 489, y: 1016 - 24, w: 16, h: 24, dead: false,   // 盒底 1016 = 本体盒底−120
    cx: 497, cy: 1004, hp: 100000, hits: [] as number[],
    hurt(d: number): boolean { this.hp -= d; this.hits.push(d); return true; },
  };
  (h.g as unknown as { enemies: () => unknown[] }).enemies = () => [en];
  h.player.x = 620; h.player.y = 1100;
  if (opts.vy0 !== undefined) (m as unknown as { vy: number }).vy = opts.vy0;
  if (opts.palA1 !== undefined) (m as unknown as { palA1: number }).palA1 = opts.palA1;
  m.fixedUpdate(1 / 60, h.g);
  return { vy: m.vy, wet: m.wet };
};

describe('TryJumpingToTarget 共享尾（:52154 贴地跃起,:52114 湿中下落支）', () => {
  it('贴地+敌高于 30px → 共享尾跃起 vy=−√(h×0.8)（结算段让位,无梯/表/×2）', () => {
    // 侧翼钳 Y=敌盒底−11=1005 → h=1125−1005=120;跃起后 moveAndCollide 上行
    // → onGround=false → 结算段整段让位 → 仅余重力 +0.4
    const r = tailCase({ wet: false });
    expect(r.wet).toBe(false);
    expect(r.vy).toBeCloseTo(-Math.sqrt(120 * 2 * 0.4) + 0.4, 9);
  });

  it(':52114 湿中下落支=跃起（−√(h×0.8),无 +1）;:51084 干态俯扑专支=跃起（+1）——两支以 wet 互斥', () => {
    // 下落态（vy0=3>1）+敌盒底高 120（>100 门）:
    //  干态 → 共享尾 flag=false（vy≠0 且非湿）→ :51084 专支（!wet 门放行）√+1
    //  湿态 → 共享尾 :52114 支放行（wet∧vy>0∧!shouldFallThrough）√（无 +1）
    //        → :51084 门 vy>1 被跃起让位=不可达（原文互斥设计）
    const dry = tailCase({ wet: false, vy0: 3 });
    const wet = tailCase({ wet: true, vy0: 3 });
    expect(dry.vy).toBeCloseTo(-(Math.sqrt(120 * 2 * 0.4) + 1) + 0.4, 9);
    expect(wet.vy).toBeCloseTo(-Math.sqrt(120 * 2 * 0.4) + 0.4, 9);
    expect(wet.wet).toBe(true);
  });

  it(':51084 ai[1]==0 门（palA1≠0 → 俯扑不触发,回落结算段距离表 −10）', () => {
    // 干态下落+palA1=5：共享尾不跃（干态下落 flag=false）,俯扑门被 ai[1]==0 拦
    // → 结算段（onGround 贴地）距离表 d=120 → −10 档终值（palGroundStep 重力行
    //    :51553-51556 在结算段【前】,表位即终值,无尾随重力）
    const r = tailCase({ wet: false, vy0: 3, palA1: 5 });
    expect(r.vy).toBeCloseTo(-10, 9);
  });
});
