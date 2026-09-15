// ★SW-RB20a（2026-09-15）RB20a 溢出发现清偿守卫（RollingBoulder/Player/MountCombat）。
//
// 四项与金标锚（1457;1458 同域逐字对拍 2026-09-15 零漂移）：
//   F1 727/1054/1048 三型专属分段弹支
//     727  = P.cs:19196-19239（落地弹 −0.65 :19204 + 双轴掷 3..5 发 763 碎片
//            :19205-19220/:19224-19239;撞墙 Kill 后碎片照发）
//     1054 = P.cs:19240-19302（X 档 0.1/0.25/0.5/0.8 :19244-19254、Y 档缺省 0.6、
//            X 门 >2 :19282 + localAI[1]++ :19285、>1 Kill :19298-19300;flag18
//            :19270 = 1054 无拍龄钟 → 恒假死门照抄）
//     1048 = P.cs:19303-19378（X/Y 档 0.1/0.2/0.45/0.75、门 >4、flag21 支
//            localAI[1]+=3 :19353 + Item177 :19355 + 尘 322×10 :19356-19362 +
//            PooFly 2..3 :19361-19367、静止杀 :19370-19372、>20 Kill :19374-19376;
//            flag20 :19333 承重=拍龄钟 :26365-26368 对 1048 生效）
//   F2 localAI0 字段注勘误：「1048 只写不读」伪——真读站 :19333/:19370（F1 移植后承重）
//   F4 friendly 弹对玩家伤害面豁免——Damage_EVP 门 P.cs:14848 `!hostile → return`
//   F6 wet 探针收口残留 4 消费面 → wetSticky（①OnFire/323 双清 :27961-27970
//     ②Stinky :27972-27980 ③slime 坐骑 :28192 ④出水截跳 :28071）
//
// 变异证红（每项至少一线）：
//   F1-R1 727 落地系数回 0.2（家族①）→ 红 / 727-R2 摘碎片掷 → 红 / 727-R3 f32 环
//   回退双精度（1/3×3<1 多掷一发）→ 红 / 1054-R1 撞墙 Kill（家族②）→ 红 /
//   1054-R3 门 2 改 5 → 红 / 1054-R4 上限门摘除 → 红 / 1048-R1 撞墙 Kill → 红 /
//   1048-R3 门 4 改 2（照抄 1054）→ 红 / 1048-R5 上限门摘除 → 红 / 1048-R6 钟摆门
//   摘除 → 红 / F4-R1 豁免摘除 → 红 / F6-① 323 臂摘除 → 红 / F6-② 探针回桶并集 →
//   红 / F6-③ 探针回桶并集 → 红 / F6-④ 门回桶并集 → 红。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RollingBoulder } from '../src/entities/RollingBoulder';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { tickSlimeWetState } from '../src/entities/MountCombat';
import { BuffType } from '../src/stats/Buffs';
import { TILE_DEFS } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';
import type { Arrow } from '../src/entities/Arrow';

// ================= 弹域夹具（sw-bj88 同构 + 碎片出射/Item177/玩家伤害账扩展） =================

const SOLID_ID = TILE_DEFS.findIndex((d) => d && d.solid && !d.platform);

function fakeStore(w = 64, h = 64, placed?: Map<number, number>) {
  const cells = placed ?? new Map<number, number>();
  return {
    w, h,
    type: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
    half: new Uint8Array(w * h),
    liquid: new Float32Array(w * h),
    liquidType: new Float32Array(w * h),
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const id = cells.get(y * w + x);
      return !!id && !!TILE_DEFS[id]?.solid && !TILE_DEFS[id]?.platform;
    },
    isPlatform: () => false,
    isActive: (x: number, y: number) => cells.has(y * w + x),
    hasTile: (x: number, y: number) => cells.has(y * w + x),
    isActuated: () => false,
    get: (x: number, y: number) => cells.get(y * w + x) ?? 0,
  };
}
type Store = ReturnType<typeof fakeStore>;

function fakeGame(store: Store, opts?: {
  player?: Record<string, unknown>;
  enemies?: unknown[];
  projectiles?: unknown[];
}) {
  const dusts: Array<{ x: number; y: number; type: number }> = [];
  const particles: Array<{ x: number; y: number; color: string; count: number }> = [];
  const sfx: Array<{ name: string; x?: number; y?: number }> = [];
  const frags: unknown[] = [];                       // spawnFriendlyProj 出射账
  const playerHits: number[] = [];                   // damagePlayer 账
  const player = opts?.player ?? { dead: true, x: 99999, y: 99999, w: 20, h: 42, cx: 100009, cy: 100020, vx: 0, vy: 0, facing: 1 };
  const g = {
    world: { store, w: store.w, h: store.h },
    player,
    candidatePlayers: () => [player],
    enemies: () => opts?.enemies ?? [],
    critters: () => [],
    npcs: () => [],
    projectiles: () => opts?.projectiles ?? [],
    spawnParticles: (x: number, y: number, color: string, count: number) => {
      particles.push({ x, y, color, count });
    },
    spawnDust: (x: number, y: number, _w: number, _h: number, type: number) => {
      const dust = { x, y, vx: 0, vy: 0, scale: 1, fadeIn: 0, noGravity: false, color: null };
      dusts.push({ x, y, type });
      return dust;
    },
    playSfx: (name: string) => { sfx.push({ name }); },
    playSfxWav: (name: string, _vol?: number, x?: number, y?: number) => { sfx.push({ name, x, y }); },
    playSfxFile: (name: string, _vol?: number, x?: number, y?: number) => { sfx.push({ name, x, y }); },
    spawnFriendlyProj: (e: unknown) => { frags.push(e); },
    damagePlayer: (dmg: number) => { playerHits.push(dmg); return dmg; },
    addLightAt: () => {},
    cutTile: () => {},
    dusts, particles, sfx, frags, playerHits,
  };
  return g as unknown as GameHooks & {
    dusts: typeof dusts; particles: typeof particles; sfx: typeof sfx;
    frags: typeof frags; playerHits: typeof playerHits;
  };
}

const mkBoulder = (sheet: number): RollingBoulder => new RollingBoulder(104, 104, sheet);

function wallCells(w: number, col: number, rows: number, n: number): Map<number, number> {
  const cells = new Map<number, number>();
  for (let r = rows; r < rows + n; r++) cells.set(r * w + col, SOLID_ID);
  return cells;
}

const bounceOf = (b: RollingBoulder) =>
  b as unknown as { rb727Bounce: (lx: number, ly: number, g: GameHooks) => void;
    rb1054Bounce: (lx: number, ly: number, g: GameHooks) => void;
    rb1048Bounce: (lx: number, ly: number, g: GameHooks) => void;
    localAI0: number; localAI1: number };

beforeEach(() => { vi.restoreAllMocks(); });

// ================= F1：727 滚刺球（P.cs:19196-19239） =================
describe('SW-RB20a F1-727 专属支（P.cs:19196-19239）', () => {
  it('R1 路由·落地弹 −0.65 非 −0.2（fixedUpdate 全链;家族① 0.2 系数对 727 不适用）', () => {
    const cells = new Map<number, number>();
    for (let cx2 = 6; cx2 <= 8; cx2++) cells.set(9 * 64 + cx2, SOLID_ID);
    const game = fakeGame(fakeStore(64, 64, cells));
    const b = mkBoulder(484);                        // sheet 484 → projId 727
    b.vy = 10;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);                      // 落地不碎（:19201 Y 支）
    expect(b.vy).toBeCloseTo(-10.3 * 0.65, 6);       // :19204（家族①会给 -2.06=变异红）
  });

  it('R2 落地掷 3..5 发 763 碎片（:19205-19220）：计数∈[3,5]、|v|=2、Y 全翻上、出射位=Center−5', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(484);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9)                      // Next(3,6) → 5
      .mockReturnValueOnce(0.25);                    // NextFloat 基相
    bounceOf(b).rb727Bounce(0, 10, game);            // lastVy=10>5 → Y 支
    expect(b.vy).toBeCloseTo(-6.5, 6);
    expect(game.frags.length).toBe(5);               // 恰 5 发
    const self = b as unknown as { cx: number; cy: number };
    for (const f of game.frags) {
      const a = f as Arrow & { projId: number; damage: number; knockback: number; x: number; y: number; vx: number; vy: number };
      expect(a.projId).toBe(763);                    // RollingCactusSpike
      expect(a.damage).toBe(30);                     // :19198 num48
      expect(a.knockback).toBe(2);                   // :19199 num49
      expect(a.x).toBeCloseTo(self.cx - 5, 6);       // Center 出膛（10×10 半盒）
      expect(a.y).toBeCloseTo(self.cy - 5, 6);
      // :19200 num50=2;:19212-19214 Y>0（朝下）整向量 ×−0.7 → 模长 1.4 且翻上
      const mag = Math.hypot(a.vx, a.vy);
      expect(mag === 2 || Math.abs(mag - 1.4) < 1e-9).toBe(true);
      expect(a.vy).toBeLessThanOrEqual(0);           // 翻转后/未翻转的 Y 均不朝下
    }
  });

  it('R3 碎片环循环节距 f32（:19208 累加环）：Next(3,6)=3 恰 3 发（双精度累加 1/3×3<1 会多掷第 4 发）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(484);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)                      // 3+floor(0.2×3)=3
      .mockReturnValueOnce(0.5);
    bounceOf(b).rb727Bounce(0, 10, game);
    expect(game.frags.length).toBe(3);               // ★f32 守卫（去 f32 变异体=4 发红）
    expect(game.frags.length).toBeLessThan(4);
  });

  it('R4 路由·撞墙 Kill 后碎片照发（:19222-19239 Kill 后续行;与 1054/1048 反）', () => {
    const game = fakeGame(fakeStore(64, 64, wallCells(64, 9, 4, 7)));
    const b = new RollingBoulder(112, 104, 484);     // 盒 112..143,墙列 9=[144,160)
    b.vx = 7; b.vy = 0;
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2)                      // n=3
      .mockReturnValueOnce(0.5);
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);                       // :19223 Kill()（727 撞墙确实碎）
    expect(game.frags.length).toBe(3);               // Kill 后碎片照掷（:19224-19239）
  });
});

// ================= F1：1054 蜘蛛球（P.cs:19240-19302） =================
describe('SW-RB20a F1-1054 专属支（P.cs:19240-19302）', () => {
  it('R1 路由·撞墙不碎（fixedUpdate 全链;旧家族②此处 dead=true=债本体）', () => {
    const game = fakeGame(fakeStore(64, 64, wallCells(64, 9, 4, 7)));
    const b = new RollingBoulder(112, 104, 714);     // sheet 714 → 1054
    b.vx = 7; b.vy = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);
    expect(b.vx).toBeCloseTo(-7 * 0.8, 6);           // X 档缺省 0.8（:19244）
    expect(bounceOf(b).localAI1).toBe(1);            // 门 >2 → localAI[1]++（:19285）
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);   // flag19 → PlaySound(0)
  });

  it('R2 系数分段直译（:19244-19263）：X 0.1/0.25/0.5/0.8、Y 0.1/0.25/0.5/0.6', () => {
    const cases: Array<[number, boolean, number]> = [
      [0.3, false, 0.1], [0.6, false, 0.25], [0.8, false, 0.5], [2, false, 0.8],
      [0.3, true, 0.1], [0.6, true, 0.25], [0.8, true, 0.5], [6, true, 0.6],
    ];
    for (const [v, isY, factor] of cases) {
      const game = fakeGame(fakeStore());
      const b = mkBoulder(714);
      if (isY) { b.vx = 0; bounceOf(b).rb1054Bounce(0, v, game); expect(b.vy).toBeCloseTo(-v * factor, 6); }
      else { b.vy = 0; bounceOf(b).rb1054Bounce(v, 0, game); expect(b.vx).toBeCloseTo(-v * factor, 6); }
      expect(b.dead).toBe(false);
    }
  });

  it('R3 X 门 >2（:19282 非 Y 门 5!）：|lastVX|≤2 不计硬弹 / >2 计（门值变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(714);
    bounceOf(b).rb1054Bounce(1.5, 0, game);          // |1.5|≤2 → 不计
    expect(bounceOf(b).localAI1).toBe(0);
    expect(game.sfx.length).toBe(0);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(714);
    bounceOf(b2).rb1054Bounce(2.5, 0, game2);        // |2.5|>2 → 计
    expect(bounceOf(b2).localAI1).toBe(1);
    expect(game2.sfx.some((s) => s.name === 'dig')).toBe(true);
  });

  it('R4 两次撞墙上限（:19298-19300 localAI[1]>1 Kill）：第二次撞墙 dead（摘除变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(714);
    bounceOf(b).rb1054Bounce(7, 0, game);            // 第 1 次 → localAI1=1（b.vx=-5.6≠7=碰撞比较成立）
    expect(b.dead).toBe(false);
    bounceOf(b).rb1054Bounce(7, 0, game);            // 第 2 次（上拍弹回速度≠lastVX）→ localAI1=2 > 1 → Kill
    expect(b.dead).toBe(true);
  });

  it('R5 拍龄死门（:26365 钟仅 1013/1048）：1054 跑 100 拍 localAI0 恒 0、静止杀/钟摆门不可达', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(714);
    b.vx = 0.05; b.vy = 0.05;
    for (let t = 0; t < 100; t++) b.fixedUpdate(1 / 60, game);
    expect(bounceOf(b).localAI0).toBe(0);            // 钟不走 → flag18/静止杀恒死=vanilla 死门
    expect(b.dead).toBe(false);                      // 1:1 保留（勿"顺手修"——把 1054 加进钟=变异红）
  });
});

// ================= F1：1048 屎球（P.cs:19303-19378） =================
describe('SW-RB20a F1-1048 专属支（P.cs:19303-19378）', () => {
  it('R1 路由·撞墙不碎 + X 档缺省 0.75（fixedUpdate 全链;旧家族②此处 dead=true=债本体）', () => {
    const game = fakeGame(fakeStore(64, 64, wallCells(64, 9, 4, 7)));
    const b = new RollingBoulder(112, 104, 712);     // sheet 712 → 1048
    b.vx = 7; b.vy = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(false);
    expect(b.vx).toBeCloseTo(-7 * 0.75, 6);          // :19307 缺省 0.75
    expect(bounceOf(b).localAI1).toBe(3);            // :19353 flag21 → +=3
  });

  it('R2 系数分段直译（:19309-19331）：X/Y 同表 0.1/0.2/0.45/0.75（★中档 0.2 与 1054 的 0.25 异）', () => {
    const cases: Array<[number, boolean, number]> = [
      [0.3, false, 0.1], [0.6, false, 0.2], [0.8, false, 0.45], [2, false, 0.75],
      [0.3, true, 0.1], [0.6, true, 0.2], [0.8, true, 0.45], [6, true, 0.75],
    ];
    for (const [v, isY, factor] of cases) {
      const game = fakeGame(fakeStore());
      const b = mkBoulder(712);
      if (isY) { bounceOf(b).rb1048Bounce(0, v, game); expect(b.vy).toBeCloseTo(-v * factor, 6); }
      else { bounceOf(b).rb1048Bounce(v, 0, game); expect(b.vx).toBeCloseTo(-v * factor, 6); }
    }
  });

  it('R3 门 >4（:19337/:19345 Y/X 同值）：|lastV|≤4 不计硬弹 / >4 计（照抄 1054 的门 2=变异红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    bounceOf(b).rb1048Bounce(3, 0, game);            // |3|≤4 → 不计
    expect(bounceOf(b).localAI1).toBe(0);
    expect(game.sfx.length).toBe(0);
    expect(game.dusts.length).toBe(0);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(712);
    bounceOf(b2).rb1048Bounce(5, 0, game2);          // |5|>4 → 计
    expect(bounceOf(b2).localAI1).toBe(3);
    expect(game2.sfx.some((s) => s.name === 'Item_177')).toBe(true);   // :19355 SoundID.Item177
  });

  it('R4 硬弹支产线（:19356-19367）：尘 322×10（盒 −(1,1) 2×2、速=−v×0.5）+ PooFly 2..3', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // 尘位/PooFly 计数 2+floor(0.9×2)=3
    bounceOf(b).rb1048Bounce(6, 0, game);            // 硬弹（b.vx=0≠6=碰撞比较成立）→ b.vx=-4.5
    expect(game.dusts.length).toBe(10);              // :19356 恰 10
    for (const d of game.dusts) expect(d.type).toBe(322);
    expect(game.particles.length).toBe(4);           // HitTiles 近似 1 + PooFly 3（:19361 2+Next(2)）
  });

  it('R5 >20 弹 Kill 门（:19374-19376）：localAI1=21 杀 / =20 不杀（摘除变异体红）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    bounceOf(b).localAI1 = 21;
    bounceOf(b).rb1048Bounce(0.5, 0, game);          // 非静止（0.5>0.1）→ 仅弹满门可达
    expect(b.dead).toBe(true);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(712);
    bounceOf(b2).localAI1 = 20;
    bounceOf(b2).rb1048Bounce(0.5, 0, game2);
    expect(b2.dead).toBe(false);
  });

  it('R6 钟摆门承重（:19333 flag20 = F2 勘误锚）：localAI0≥500 后低速（<4）碰撞也计硬弹', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    bounceOf(b).localAI0 = 500;
    bounceOf(b).rb1048Bounce(2, 0, game);            // |2|<4 但 flag20 真 → 计
    expect(bounceOf(b).localAI1).toBe(3);
    expect(game.sfx.some((s) => s.name === 'Item_177')).toBe(true);
    // 反例：499t 低速不计
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(712);
    bounceOf(b2).localAI0 = 499;
    bounceOf(b2).rb1048Bounce(2, 0, game2);
    expect(bounceOf(b2).localAI1).toBe(0);
    expect(game2.sfx.length).toBe(0);
  });

  it('R7 静止杀（:19370-19372 Length<0.1 ∧ localAI0>50）：拍龄钟承重（F2）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    b.vx = 0; b.vy = 0.05;
    bounceOf(b).localAI0 = 51;
    bounceOf(b).rb1048Bounce(0, 0, game);
    expect(b.dead).toBe(true);
    const game2 = fakeGame(fakeStore());
    const b2 = mkBoulder(712);
    b2.vx = 0; b2.vy = 0.05;
    bounceOf(b2).localAI0 = 50;
    bounceOf(b2).rb1048Bounce(0, 0, game2);
    expect(b2.dead).toBe(false);
  });
});

// ================= F2 勘误结构锁 + F4 玩家伤害豁免 =================
describe('SW-RB20a F2 勘误结构锁 / F4 Damage_EVP 豁免', () => {
  const src = readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');

  it('F2-S1 localAI0 字段注不再含「只写不读/照抄不裁剪」伪命题（回退注释=红）', () => {
    expect(src).not.toContain('写面照抄不裁剪');       // 旧「只写不读→照抄」指令面已退役
    expect(src).toContain('F2 勘误');                  // 勘误注在位
    expect(src).toContain('真读站三处');               // 修正语义（:19333/:19370 承重）
    expect(src).toContain('flag20 = this.localAI0 >= 500');   // 1048 钟摆门消费在码
  });

  it('F4-R1 1047（friendly 无 hostile 行）撞玩家零结算（P.cs:14848 !hostile 门;豁免摘除=红）', () => {
    const game = fakeGame(fakeStore(), {
      player: { dead: false, iframes: 0, x: 110, y: 110, w: 20, h: 42, cx: 120, cy: 131, vx: 0, vy: 0 },
    });
    const b = mkBoulder(711);                        // sheet 711 → 1047（friendly 非 hostile）
    b.fixedUpdate(1 / 60, game);
    expect(game.playerHits).toEqual([]);             // 原版永不伤玩家
  });

  it('F4-R2 hostile 家族（99 陷阱巨石）撞玩家照常结算（豁免不外溢）', () => {
    const game = fakeGame(fakeStore(), {
      player: { dead: false, iframes: 0, x: 110, y: 110, w: 20, h: 42, cx: 120, cy: 131, vx: 0, vy: 0 },
    });
    const b = mkBoulder(138);                        // sheet 138 → 99（friendly+hostile 双旗）
    b.fixedUpdate(1 / 60, game);
    expect(game.playerHits.length).toBe(1);
    expect(game.playerHits[0]).toBe(70);             // BOULDER_CONVERT_TABLE dmg 70
  });
});

// ================= F6：wet 探针收口（Player 全链 + MountCombat 单元） =================

const W = 64, H = 160;
const ROW = 40;
const LIP_TOP = ROW * TILE + 8;
const PW = 20, PH = 42;

/** 唇袋几何（bj89 镜像）·液型参数化：岩浆 2 / 水 1——全盒 LavaCollision 可及、
 *  居中探针干（graze 姿态） */
function pocketWorld(type: number): World {
  const w = new World(W, H, 11, 'rb20a-pocket');
  const st = w.store;
  for (let x = 26; x <= 35; x++) st.setTile(x, ROW + 1, 1);
  for (const x of [26, 27, 34, 35]) st.setTile(x, ROW, 1);
  for (const x of [28, 29, 31]) { st.setTile(x, ROW, 1); st.setHalfBrick(x, ROW, true); }
  st.setTile(33, ROW, 1); st.setSlope(33, ROW, 2);
  st.setLiquid(30, ROW, 255, type);
  st.setLiquid(32, ROW, 255, type);
  return w;
}

/** 深池（探针必湿）：row 60-119 灌液、row 120 池底；右侧 45-52 行干台 */
function deepPoolWorld(type: number): World {
  const w = new World(80, 200, 11, 'rb20a-deep-pool');
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, 120, 1);
    for (let y = 60; y < 120; y++) st.setLiquid(x, y, 255, type);
  }
  for (let x = 62; x < 76; x++) for (let y = 100; y < 120; y++) st.setTile(x, y, 1);
  return w;
}

function makeDriver(world: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 4000;
  const hooks = {
    world, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  return { p, hooks };
}

describe('SW-RB20a F6 wet 探针收口（wetSticky 单源）', () => {
  it('F6-① 真实入水熄火：OnFire(24)+地狱火(323) 双清（:27961-27970;旧仓缺 323 臂=红）', () => {
    const { p, hooks } = makeDriver(deepPoolWorld(1), 30 * TILE, 55 * TILE);
    p.buffs.apply(BuffType.OnFire, 3);
    p.buffs.apply(BuffType.OnFire3, 3);
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.inWater).toBe(true);
    expect(p.buffs.has(BuffType.OnFire)).toBe(false);
    expect(p.buffs.has(BuffType.OnFire3)).toBe(false);   // ★323 臂（摘除变异体红）
  });

  it('F6-①/② 岩浆浸入（num86 真∧lavaWet 真）：地狱火不灭（!lavaWet 豁免臂）、恶臭照洗（无豁免臂）', () => {
    const { p, hooks } = makeDriver(deepPoolWorld(2), 30 * TILE, 55 * TILE);
    p.buffs.apply(BuffType.OnFire3, 300);
    p.buffs.apply(BuffType.Stinky, 300);
    let sawLava = false, sawWetSticky = false;
    const self = p as unknown as { wetSticky: boolean };
    for (let t = 0; t < 60; t++) {
      p.fixedUpdate(1 / 60, hooks);
      sawLava = sawLava || p.inLava;
      sawWetSticky = sawWetSticky || self.wetSticky;   // 岩浆湿=居中探针湿（wet 位含岩浆 :28060）
    }
    expect(sawLava).toBe(true);
    expect(sawWetSticky).toBe(true);                 // num86 真 → 洗臂支可达
    expect(p.buffs.has(BuffType.OnFire3)).toBe(true);    // :27961 !lavaWet 门（火在岩浆里不灭）
    expect(p.buffs.has(BuffType.Stinky)).toBe(false);    // :27972 无种别/无豁免
  });

  it('F6-② 岩浆擦过姿态（探针干+全盒岩浆）：恶臭不被幻影洗（探针回桶并集=红）', () => {
    const { p, hooks } = makeDriver(pocketWorld(2), 28 * TILE, LIP_TOP - PH);
    p.buffs.apply(BuffType.Stinky, 30);
    let sawLava = false;
    const self = p as unknown as { wetSticky: boolean };
    let sawSticky = false;
    for (let t = 0; t < 44; t++) {
      p.x += 2.5;                                    // 唇袋横穿（bj89 step 口径）
      p.fixedUpdate(1 / 60, hooks);
      sawLava = sawLava || p.inLava;
      sawSticky = sawSticky || self.wetSticky;
    }
    expect(sawLava).toBe(true);                      // 擦过确曾发生（全盒臂 1:1 不受损）
    expect(sawSticky).toBe(false);                   // 居中探针恒干 = vanilla wet 恒假
    expect(p.buffs.has(BuffType.Stinky)).toBe(true); // ★num86 恒假 → 原版不洗
  });

  it('F6-③ slime 坐骑探针：wetSticky 真 → wetSlime=30;擦过姿态（湿旗假）不入浮力档', () => {
    const wet = { wetSticky: true, vy: 3, wetSlime: 0, mount: { active: true, type: 3 } };
    tickSlimeWetState(wet);
    expect(wet.wetSlime).toBe(30);
    expect(wet.vy).toBeCloseTo(2.2);
    const graze = { wetSticky: false, inLava: true, vy: 3, wetSlime: 0, mount: { active: true, type: 3 } };
    tickSlimeWetState(graze);                        // 三桶并集时代 inLava 真→幻影档;现 wetSticky 假→静默
    expect(graze.wetSlime).toBe(0);
    expect(graze.vy).toBe(3);
  });

  it('F6-④ 出水截跳门（:28071 else if (wet)）：真出水帧置位、擦过姿态全程零置位（门回桶并集=红）', () => {
    // 真出水：深水 → 传送干台 → 翻转帧置位（消费位截跳后自清,经访问器捕账）
    const { p, hooks } = makeDriver(deepPoolWorld(1), 30 * TILE, 55 * TILE);
    for (let t = 0; t < 60; t++) p.fixedUpdate(1 / 60, hooks);
    const seen: boolean[] = [];
    let v = false;
    Object.defineProperty(p, '_wetExitJumpClip', {
      get: () => v, set: (nv: boolean) => { if (nv) seen.push(nv); v = nv; },
    });
    p.x = 68 * TILE; p.y = 99 * TILE;
    p.fixedUpdate(1 / 60, hooks);
    expect(seen.length).toBe(1);                     // 真出水恰 1 帧
    // 擦过姿态：全程 wetSticky 假 → 永不置位
    const { p: p2, hooks: hooks2 } = makeDriver(pocketWorld(2), 28 * TILE, LIP_TOP - PH);
    const seen2: boolean[] = [];
    let v2 = false;
    Object.defineProperty(p2, '_wetExitJumpClip', {
      get: () => v2, set: (nv: boolean) => { if (nv) seen2.push(nv); v2 = nv; },
    });
    for (let t = 0; t < 44; t++) { p2.x += 2.5; p2.fixedUpdate(1 / 60, hooks2); }
    expect(seen2.length).toBe(0);                    // ★幻影截跳消失（旧门 wasWetAny 桶并集=红）
  });
});
