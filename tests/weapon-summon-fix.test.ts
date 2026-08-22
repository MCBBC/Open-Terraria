// 召唤/鞭类对齐回归（2026-08-23 基准切换 1457,标杆 Terarria1457/Terraria/Projectile.cs；
// ①-⑧ 各节行号锚为两版共有段,数值行为一致）：
//  ① 阿比盖尔 963 困难档伤害系数（:12116-12125 num9 0.55 / hardMode 1.3）
//  ② 星尘龙 625 追击加速 ×1.5 + Dot 阻尼 + 距敌 Size×0.75 门（:40229-40244）
//  ③ 星尘龙伤害段数 localAI[0] 含尾段（:40342 每段 self+1，基础龙 3 段）
//  ④ AI_062 索敌射程分档 2000/963=700 + CanHitLine 视线门（:62362-62375/:62434）
//  ⑤ AI_062 瞬移回收 >2000（:62786）
//  ⑥ 乌鸦 317 归位门 500/1400（ai[1]≠0 || friendly，:27422-27426）
//  ⑦ Foxparks 1094 按 velocity.X 翻转（:56111-56120 移出 MINION_NO_FLIP）
//  ⑧ 致命球 533 自旋相位门 ai[0]<3 || ≥9（:28874-28877）
//  ⑨ 星鞭 5479 星雨 1457 语义：CanProcOnNPC 门 + RemoveAllProcs、伤 ×2×0.22（:14001-14007/:15013-15036）
//  ⑩ 月主鞭 5480 proc：单发 1045 弧线弹（:14977-15011 num=1）+ 命中链式补发 ≤3（:14015-14018）
import { describe, expect, it } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { WhipProj } from '../src/entities/WhipProj';
import { resolveWhipTagHit, MoonLordWhipProc } from '../src/entities/WhipTag';
import { Arrow } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; vanillaId?: number;
  hurtFx?: (d: number) => void;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number) => boolean;
  pens: Array<number | undefined>;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, pens: [],
    hurt: (d: number, _kx: number, _ky: number, _g: GameHooks, pen?: number) => {
      e.hp -= d; e.pens.push(pen); return true;
    },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = [], hardMode = false) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: { store, flags: { hardMode } } as never,
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
  };
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player, projectiles, added, enemies };
}
function mkMinion(projId: number, owner: Player, x?: number, y?: number): MinionProj {
  return new MinionProj(x ?? owner.cx, y ?? owner.cy - 40, projId, 10, 2, false, 0, false, () => owner);
}
/** 记录型 ctx 桩（minion-orientation 同款）：捕获 scale 翻转调用 */
function drawAndRecord(m: MinionProj): { scale: number[][] } {
  const scale: number[][] = [];
  const ctx = {
    set imageSmoothingEnabled(_: boolean) {},
    get imageSmoothingEnabled() { return false; },
    save() {}, restore() {}, translate() {}, rotate() {},
    scale(x: number, y: number) { scale.push([x, y]); },
    drawImage() {}, fillRect() {}, strokeRect() {},
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    beginPath() {}, arc() {}, fill() {},
    set globalAlpha(_: number) {},
  } as unknown as CanvasRenderingContext2D;
  m.draw({ ctx } as never);
  return { scale };
}

describe('① 阿比盖尔 963 困难档伤害系数（1456 :12116-12125）', () => {
  it('肉前 num9=0.55 → ×(1+0.55×(n-1));hardMode → 1.3', () => {
    const e1 = mkEnemy(1, 60 * 16 + 30, 90 * 16);
    const a = makeHooks([e1], false);
    // 两个 970 计数器 → n=2 → num7=1
    a.projectiles.push(new MinionProj(a.player.cx, a.player.cy, 970, 10, 2, false, 0, false, () => a.player));
    a.projectiles.push(new MinionProj(a.player.cx, a.player.cy, 970, 10, 2, false, 0, false, () => a.player));
    const body1 = mkMinion(963, a.player, e1.cx - 10, e1.cy - 12);
    body1.fixedUpdate(1, a.hooks);
    // contact 通道经 resolveWhipTagHit Math.round → round(10×1.55)=16
    expect(e1.hp).toBe(100000 - Math.round(10 * 1.55));

    const e2 = mkEnemy(2, 60 * 16 + 30, 90 * 16);
    const b = makeHooks([e2], true);                     // Main.hardMode
    b.projectiles.push(new MinionProj(b.player.cx, b.player.cy, 970, 10, 2, false, 0, false, () => b.player));
    b.projectiles.push(new MinionProj(b.player.cx, b.player.cy, 970, 10, 2, false, 0, false, () => b.player));
    const body2 = mkMinion(963, b.player, e2.cx - 10, e2.cy - 12);
    body2.fixedUpdate(1, b.hooks);
    expect(e2.hp).toBe(100000 - Math.round(10 * 2.3));  // 10×(1+1.3×1)——困难档不折半
  });
});

describe('② 星尘龙 625 追击加速（1456 :40229-40244）', () => {
  it('acc 档 ×1.5：d≥600 → 0.6、300≤d<600 → 0.9、d<300 → 1.2', () => {
    for (const [dist, expVx] of [[800, 0.6], [400, 0.9], [200, 1.2]] as const) {
      const e = mkEnemy(1, 60 * 16 + dist, 90 * 16);
      const { hooks, player } = makeHooks([e]);
      // 中心对齐：cx = e.cx - dist、cy = e.cy（左上 = 中心 - 8）
      const head = mkMinion(625, player, e.cx - dist - 8, e.cy - 8); // 首 tick 生成 626/627/628 链
      head.fixedUpdate(1, hooks);
      expect(head.vx).toBeCloseTo(expVx, 6);            // (dx/d)×acc0×1.5（dy=0）
    }
  });
  it('距敌 ≤ Size×0.75 门内不推进（:40237）', () => {
    const e = mkEnemy(1, 60 * 16 + 10, 90 * 16);        // d=10 < 28.8×0.75=21.6
    const { hooks, player } = makeHooks([e]);
    const head = mkMinion(625, player, e.cx - 18, e.cy - 8);
    head.fixedUpdate(1, hooks);
    expect(head.vx).toBe(0);                            // 门内零加速
  });
  it('Dot(velocity,方向)<0.25 → velocity×0.8 阻尼（:40240-40243）', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 90 * 16);       // d=300 → acc0=0.6×1.5=0.9
    const { hooks, player } = makeHooks([e]);
    const head = mkMinion(625, player, e.cx - 308, e.cy - 8);
    head.vx = -10;                                      // 背向高速 → Dot=-10×300<0.25
    head.fixedUpdate(1, hooks);
    // vx = (-10+0.9)×0.8 = -7.28（无阻尼应为 -9.1）
    expect(head.vx).toBeCloseTo(-7.28, 6);
    expect(head.vy).toBeCloseTo(0, 6);
  });
});

describe('③ 星尘龙伤害段数 localAI[0]（1456 :40342/:12097）', () => {
  it('链自尾向头传播：尾 628=0、627=1、626=2、头=3（基础龙 3 段含尾）', () => {
    const { hooks, player, projectiles } = makeHooks();
    const head = mkMinion(625, player);
    head.fixedUpdate(1, hooks);                          // 生成 626→627→628
    const byId = (id: number): MinionProj =>
      projectiles.find((m) => m instanceof MinionProj && (m as MinionProj).projId === id) as MinionProj;
    const lai = (m: MinionProj): number =>
      (m as unknown as { dragonLocalAI0: (g: GameHooks) => number }).dragonLocalAI0(hooks);
    expect(lai(head)).toBe(3);                           // 曾漏计尾段（旧=2）
    expect(lai(byId(626))).toBe(2);
    expect(lai(byId(627))).toBe(1);
    expect(lai(byId(628))).toBe(0);
    // 伤害档位逐段各自：头 ×(1+0.23×3)
    expect(1 + 0.23 * lai(head)).toBeCloseTo(1.69, 6);
  });
});

describe('④ AI_062 索敌射程分档 + 视线门（1456 :62362-62375/:62434）', () => {
  it('射手族 373 射程 2000：1200px 外的敌仍入索敌（旧 1000 门漏）', () => {
    const e = mkEnemy(1, 60 * 16 + 1200, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(373, player, player.cx, e.cy - 8); // 中心与敌同高 → 纯水平
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBe(5);                                // 锁定 → 速 5 直奔（悬停档 ≤4）
  });
  it('CanHitLine 视线门：墙后敌不入索敌（:62434）', () => {
    const e = mkEnemy(1, 60 * 16 + 500, 90 * 16);
    const { hooks, player, store } = makeHooks([e]);
    for (let y = 70; y < 100; y++) store.setTile(75, y, 1);   // 中间实心墙列
    const m = mkMinion(373, player, player.cx, e.cy - 8);
    m.fixedUpdate(1, hooks);
    expect(Math.abs(m.vx)).toBeLessThan(5);              // 无目标 → 悬停移速 <5
  });
  it('963 阿比盖尔 700 档 + CanHit 1×1 门（:62372-62375/:62455）', () => {
    const eFar = mkEnemy(1, 60 * 16 + 900, 90 * 16);     // >700 → 不索敌
    const a = makeHooks([eFar]);
    const m1 = mkMinion(963, a.player, a.player.cx, eFar.cy - 8);
    m1.fixedUpdate(1, a.hooks);
    expect(Math.abs(m1.vx)).toBeLessThan(7.4);           // 无目标 → 跟随档速 ≤4.8
    const eNear = mkEnemy(2, 60 * 16 + 400, 90 * 16);    // <700 → 索敌冲刺 7.4
    const b = makeHooks([eNear]);
    const m2 = mkMinion(963, b.player, b.player.cx, eNear.cy - 8);
    m2.fixedUpdate(1, b.hooks);
    expect(m2.vx).toBeCloseTo(7.4, 6);
  });
});

describe('⑤ AI_062 瞬移回收 >2000（1456 :62786）', () => {
  it('1500px 不回收、2200px 瞬移回玩家（旧门 1300 已废）', () => {
    const { hooks, player } = makeHooks();
    const m = mkMinion(375, player);
    m.x = player.cx + 1500 - 8; m.y = player.cy - 8;     // cx/cy 对齐玩家中心
    m.fixedUpdate(1, hooks);
    expect(Math.hypot(m.cx - player.cx, m.cy - player.cy)).toBeGreaterThan(1000);
    m.x = player.cx + 2200 - 8;
    m.fixedUpdate(1, hooks);
    expect(Math.hypot(m.cx - player.cx, m.cy - player.cy)).toBeLessThan(100);
  });
});

describe('⑥ 乌鸦 317 归位门 500/1400（1456 :27422-27426）', () => {
  const speedAfterTick = (rA1: number, rFriendly: boolean): number => {
    const { hooks, player } = makeHooks();               // 无敌怪 → 跟随分支
    const m = mkMinion(317, player, player.cx + 800, player.cy); // 曼哈顿 800 ∈ (500,1400]
    (m as unknown as { rA1: number; rFriendly: boolean }).rA1 = rA1;
    (m as unknown as { rA1: number; rFriendly: boolean }).rFriendly = rFriendly;
    m.fixedUpdate(1, hooks);
    return Math.hypot(m.vx, m.vy);
  };
  it('待机（ai[1]=0 非 friendly）→ 门 500 触发归位态 ai[0]=1 → 317 提速 15', () => {
    expect(speedAfterTick(0, false)).toBeCloseTo(15 / 21, 6);
  });
  it('扑击倒数态（ai[1]≠0）→ 门 1400 不触发 → 速 12（:27423）', () => {
    expect(speedAfterTick(10, false)).toBeCloseTo(12 / 21, 6);
  });
  it('冲刺帧（friendly=true）→ 门 1400 不触发 → 速 12（:27423/:27547）', () => {
    expect(speedAfterTick(0, true)).toBeCloseTo(12 / 21, 6);
  });
});

describe('⑦ Foxparks 1094 翻转（1456 :56111-56120）', () => {
  it('跟随态按 velocity.X 翻转（移出 MINION_NO_FLIP）：左行 facing=-1 → 渲染镜像', () => {
    const e = mkEnemy(1, 60 * 16 - 300, 90 * 16 - 40);
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(1094, player);
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBeLessThan(0);
    expect(m.facing).toBe(-1);
    expect(drawAndRecord(m).scale).toEqual([[-1, 1]]);   // 旧 NO_FLIP 恒不翻
  });
  it('喷火态 spriteDirection = -(velocity.X>0?1:-1)（:56111-56120）', () => {
    const { hooks, player } = makeHooks();
    const m = mkMinion(1094, player);
    (m as unknown as { foxChannel: boolean; foxAimX: number; foxAimY: number }).foxChannel = true;
    (m as unknown as { foxAimX: number; foxAimY: number }).foxAimX = 1;
    (m as unknown as { foxAimX: number; foxAimY: number }).foxAimY = 0;
    m.fixedUpdate(1, hooks);
    expect(m.facing).toBe(-1);                           // 朝右喷火 → 贴图反向
    (m as unknown as { foxAimX: number }).foxAimX = -1;
    m.fixedUpdate(1, hooks);
    expect(m.facing).toBe(1);
  });
});

describe('⑧ 致命球 533 自旋相位门（1456 :28874-28877）', () => {
  it('冲刺段（ai[0] 3-8）不自旋;待机（0-2）自旋 rotation += vx×0.04', () => {
    const e = mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40);   // <800 触发攻击
    const { hooks, player, enemies } = makeHooks([e]);
    const m = mkMinion(533, player, player.cx + 200, player.cy - 60);
    m.fixedUpdate(1, hooks);                             // 首击 → dA0=6 冲刺
    expect((m as unknown as { dA0: number }).dA0).toBe(6);
    const rotInDash = m.rot;
    for (let i = 0; i < 10; i++) m.fixedUpdate(1, hooks);
    expect(m.rot).toBe(rotInDash);                       // 3-8 相位零自旋（位移仍在）
    // 清敌 → 待机相位（无触发）→ 恢复自旋
    enemies.length = 0;
    (m as unknown as { dA0: number; dA1: number }).dA0 = 0;
    (m as unknown as { dA0: number; dA1: number }).dA1 = 0;
    m.fixedUpdate(1, hooks);
    expect(m.rot).not.toBe(rotInDash);
  });
});

describe('⑨ 星鞭 5479 星雨 1457 语义（Projectile.cs:14001-14007/:15013-15036）', () => {
  it('CanProcOnNPC 门（随从 OnTaggedHit 启窗）+ RemoveAllProcs、伤 ×2×0.22', () => {
    const e = mkEnemy(1, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const w = new WhipProj(player.cx, player.cy, 0, 1034, 5479, 30, 4, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
    const pts = w.pointsAt(18, true);
    e.cx = pts[10].x; e.cy = pts[10].y; e.x = pts[10].x - 8; e.y = pts[10].y - 12;
    w.fixedUpdate(1, hooks);                             // 首鞭命中（无 proc 窗 → 不撒星 :14002）
    expect(added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 1039).length).toBe(0);
    // 随从命中经 WhipTagEffect_Constellation.OnTaggedHit（_Constellation.cs:6-10）启窗——直书等价态
    player.tagEffectStack.tryEnableProcOnNPC(5479, e.id);
    // 第二挥（新弹 localAI[0]=0）命中 → 撒星 + RemoveAllProcs（:14005-14006）
    const w2 = new WhipProj(player.cx, player.cy, 0, 1034, 5479, 30, 4, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w2.fixedUpdate(1, hooks);
    const pts2 = w2.pointsAt(18, true);
    e.cx = pts2[10].x; e.cy = pts2[10].y; e.x = pts2[10].x - 8; e.y = pts2[10].y - 12;
    w2.fixedUpdate(1, hooks);
    const stars = added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 1039) as Arrow[];
    expect(stars.length).toBe(6);                        // 每 3 控制点一颗（:15019 i+=3）
    expect(stars[0].damage).toBe(Math.max(1, Math.trunc(Math.round(30 * 0.9) * 2 * 0.22))); // :14005+:15016-15017
    expect(player.tagEffectStack.canProcOnNPC(5479, e.id)).toBe(false); // RemoveAllProcs（:14006）
  });
});

describe('⑩ 月主鞭 5480 proc 1457 语义（Projectile.cs:14977-15011/:14015-14018）', () => {
  it('单发 1045（伤 20 弧线弹,num=Next(1,4) 后被覆写 1）+ 命中链式补发 ai[1]<2 → 全程 ≤3', () => {
    const e = mkEnemy(1, 200 * 8, 60 * 16, 240, 240);    // 大判定盒容纳弧线漂移
    const { hooks, player, added } = makeHooks([e]);
    player.tagEffectStack.tryApplyTagToNPC(5480, e.id, e.vanillaId);
    player.tagEffectStack.tryEnableProcOnNPC(5480, e.id);
    const res = resolveWhipTagHit(e, 10, hooks, (el) => {
      (hooks as unknown as { entities: { add: (x: unknown, b?: string) => void } }).entities.add(el, 'projectiles');
    }, 1, e.cx, e.cy, player);
    // TagDamage=25（ItemID.cs:1412-1417）;5480 CritChance=10（:1416）→ 10% TagCrit ×2
    expect([10 + 25, (10 + 25) * 2]).toContain(res.dmg);
    expect(player.tagEffectStack.canProcOnNPC(5480, e.id)).toBe(false); // proc 消费
    const genOf = (p: MoonLordWhipProc) => p.gen;
    let procs = added.filter((a): a is MoonLordWhipProc => a instanceof MoonLordWhipProc);
    expect(procs.length).toBe(1);                        // 单发（:14980-14981 死掷后 num=1）
    expect(procs[0].damage).toBe(20);
    expect(procs[0].arc).not.toBe(0);                    // 旋转弧线弹道
    // gen0 命中 → 伤 20（pen 50）+ 补发 gen1
    procs[0].x = e.cx - procs[0].w / 2; procs[0].y = e.cy - procs[0].h / 2;
    procs[0].fixedUpdate(1, hooks);
    expect(e.pens[e.pens.length - 1]).toBe(50);          // armorPenetration=50（:9910）
    procs = added.filter((a): a is MoonLordWhipProc => a instanceof MoonLordWhipProc);
    expect(procs.length).toBe(2);
    expect(genOf(procs[1])).toBe(1);
    // gen1 命中 → 补发 gen2
    procs[1].x = e.cx - procs[1].w / 2; procs[1].y = e.cy - procs[1].h / 2;
    procs[1].fixedUpdate(1, hooks);
    procs = added.filter((a): a is MoonLordWhipProc => a instanceof MoonLordWhipProc);
    expect(procs.length).toBe(3);
    expect(genOf(procs[2])).toBe(2);
    // gen2 命中 → ai[1]=2 不再补发（:14016）
    procs[2].x = e.cx - procs[2].w / 2; procs[2].y = e.cy - procs[2].h / 2;
    procs[2].fixedUpdate(1, hooks);
    procs = added.filter((a): a is MoonLordWhipProc => a instanceof MoonLordWhipProc);
    expect(procs.length).toBe(3);                        // 全程 ≤3（1+2 代补发）
    expect(e.hp).toBe(100000 - 20 * 3);                  // 每代固定 20
    expect(procs.every((p) => p.dead)).toBe(true);       // penetrate=1 首敌即逝
  });
});
