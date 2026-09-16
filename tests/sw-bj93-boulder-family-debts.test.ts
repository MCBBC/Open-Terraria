// ★SW-BJ93（2026-09-16）新登记账五债清偿守卫（RollingBoulder/Player/BoulderMech）。
//
// 五项与金标锚（1457;1458 同域逐字对拍 2026-09-16:Kill 家族块 :76355-76500↔
// :76356-76501、宽限门 :12491 同行、1053/1048 伴生尘 :26390-26410/:26745-26749
// ↔+1、SkipDamage_EVP ProjectileID.cs:275 同行——byte-diff 全等）：
//   债1 aiStyle25 出膛宽限门   P.cs:12491（Damage_CanDealDamage 尾;type∉
//                              {1021,1047,1005,1014} ∧ localAI[2]<=7 → false）
//                              + Damage() :12512 门内四面（CutTiles/PVE/PVP/EVP）;
//                              localAI[2]=AI_025 头 :26360 出生计数;CutTiles 面
//                              :12515-12518（friendly ∧ type!=1054）整缺同债补
//   债2 Kill() 家族死亡尘/声   P.cs:76355-76500——尘表 1013→243/727→40/1014→12/
//                              1021→323/1048→322/缺省 1 + 声 Item16/Item14/
//                              NPCHit29/NPCDeath6/dig(0) + 1053 专属(尘31×25+尘6×
//                              80+gore61..63×4) + 1054(尘30×20) + 1055(尘192×50)
//                              + 掉落 1057→5523/1014→29 + 撞墙/落地/入湿 Kill 收口
//   债3 aiStyle25 头部伴生尘   1053 三色尘 :26390-26410 / 1048 滚动尘 :26745-26749
//   债4 1002 TNTBarrel         SkipDamage_EVP={108,164,1002}（:14848 唯一消费）+
//                              SelfHurtPlayers（:71766-71795/:15104-15152）+ 名实勘误
//                              （TileID.cs:1745 TNTBarrel）
//   债5 Chilled 门幻影姿态     Player.cs:28211（1458 :28209）wet&&!lavaWet&&!honeyWet
//                              → Player.ts wetSticky/splashLavaWet/splashHoneyWet 化
//
// 变异证红（开发期逐组实测,每债至少一线）：
//   债1-M1 摘 rbDamageCanDeal 门 → G1/G2 红 / 债1-M2 门改 <=8 → G1 红（第 8 拍仍免）
//   / 债1-M3 豁免集抹 1047 → G2 红 / 债1-M4 摘 CutTiles friendly 门 → G5 红 /
//   债2-M1 尘表 1013→1 → K2 红 / 债2-M2 声臂摘 NPCDeath6 → K5 红 / 债2-M3 摘
//   1053 gore 环 → K3 红 / 债2-M4 摘掉落臂 → K6/K7 红 / 债2-M5 撞墙回直写 dead →
//   K8 红 / 债3-M1 1048 尘门 |v|>1 摘除 → D3 红 / 债3-M2 1053 拍率改 1/2 → D1 红 /
//   债4-M1 摘 SKIP_DAMAGE_EVP 门 → E1 红 / 债4-M2 摘 sweater cap → E2b 红 /
//   债4-M3 self-hurt 盒回建模盒 31×31 → E2 红（玩家位在 260 盒内/建模盒外）。
//   债5 无行为判别线（水域/岩浆/蜂蜜主车道新旧行为同相,见 C3 定谳记录）——守卫=
//   C5 结构锁（vanilla 三旗原文钉死;回退桶位即红）+ C1/C2/C4 车道行为锚。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RollingBoulder, SKIP_DAMAGE_EVP } from '../src/entities/RollingBoulder';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE_DEFS } from '../src/data/tiles';
import { GorePiece } from '../src/entities/GorePiece';
import type { GameHooks } from '../src/entities/types';

// ================= 弹域夹具（sw-rb20a 同构 + cutTile/spawnDrop/gore 账） =================

const SOLID_ID = TILE_DEFS.findIndex((d) => d && d.solid && !d.platform);

function fakeStore(w = 64, h = 64, placed?: Map<number, number>) {
  const cells = placed ?? new Map<number, number>();
  const liquid = new Float32Array(w * h);            // ★债② wave2：提本地量供 setLiquid 闭包
  const liquidType = new Float32Array(w * h);
  return {
    w, h,
    type: new Uint8Array(w * h),
    flags: new Uint8Array(w * h),
    slope: new Uint8Array(w * h),
    half: new Uint8Array(w * h),
    liquid,
    liquidType,
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
    // ★BJ93 债⑤清账批（2026-09-16）fixture 补齐：债④b 1054 蛛网铺置支
    //  （RollingBoulder AI_025 :26402 PlaceTile(51,mute) → 仓内 setTile 监听链）
    //  在 10 拍 G5 窗内 1/7 掷必中,旧桩缺 setTile → TypeError 假红
    //  （TileStore.setTile(x,y,type,frameX=0,frameY=0) 直写;桩只记账 type 面）。
    setTile: (x: number, y: number, type: number) => { cells.set(y * w + x, type); },
    // ★SW-BJ93 债② wave2（2026-09-16）fixture 补齐：Kill 地形面 1053 注液
    //  （WorldGen.PlaceLiquid 仓内 setLiquid 原语）+ canHit/solidTileAt 的 wire 位
    //  （真 TileStore 域;旧桩缺 → TypeError 假红）。
    setLiquid: (x: number, y: number, amount: number, lt: number) => {
      liquid[y * w + x] = amount;
      liquidType[y * w + x] = lt;
    },
    wire: new Uint8Array(w * h),
  };
}
type Store = ReturnType<typeof fakeStore>;

function fakeGame(store: Store, opts?: {
  player?: Record<string, unknown>;
  enemies?: unknown[];
  projectiles?: unknown[];
}) {
  const dusts: Array<{ x: number; y: number; w: number; h: number; type: number;
    vx: number; vy: number; alpha: number; scale: number; noGravity: boolean }> = [];
  const particles: Array<{ x: number; y: number; color: string; count: number }> = [];
  const sfx: Array<{ name: string; x?: number; y?: number }> = [];
  const cuts: Array<[number, number]> = [];          // cutTile 账（债1 CutTiles 面）
  const drops: Array<{ x: number; y: number; key: string; n: number }> = [];
  const frags: unknown[] = [];
  const playerHits: number[] = [];
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
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      vx = 0, vy = 0, alpha = 0, _color = null, scale = 1) => {
      const dust = { x, y, w, h, type, vx, vy, alpha, scale, fadeIn: 0, noGravity: false, color: null };
      dusts.push(dust);
      return dust;
    },
    playSfx: (name: string) => { sfx.push({ name }); },
    playSfxWav: (name: string, _vol?: number, x?: number, y?: number) => { sfx.push({ name, x, y }); },
    playSfxFile: (name: string, _vol?: number, x?: number, y?: number) => { sfx.push({ name, x, y }); },
    cutTile: (ix: number, iy: number) => { cuts.push([ix, iy]); },
    spawnDrop: (x: number, y: number, key: string, n = 1) => { drops.push({ x, y, key, n }); return null; },
    spawnFriendlyProj: (e: unknown) => { frags.push(e); },
    damagePlayer: (dmg: number) => { playerHits.push(dmg); return dmg; },
    addLightAt: () => {},
    dusts, particles, sfx, cuts, drops, frags, playerHits,
  };
  return g as unknown as GameHooks & {
    dusts: typeof dusts; particles: typeof particles; sfx: typeof sfx;
    cuts: typeof cuts; drops: typeof drops; frags: typeof frags; playerHits: typeof playerHits;
  };
}

const mkBoulder = (sheet: number): RollingBoulder => new RollingBoulder(104, 104, sheet);
/** 直造弹型（无 tile sheet 的 hostile-only 型如 1021 MoonBoulder——BOULDER_CONVERT_TABLE
 *  无行,构造器回退 99 会污染族面断言;projId readonly → cast 覆写,仅测试面） */
const mkProj = (projId: number): RollingBoulder => {
  const b = new RollingBoulder(104, 104, 138);
  (b as unknown as { projId: number }).projId = projId;
  return b;
};

/** 私有面直调（rb20a bounceOf 同款 cast 约定） */
const internals = (b: RollingBoulder) =>
  b as unknown as {
    rbKill: (g: GameHooks) => void;
    localAI2: number; localAI0: number; localAI1: number;
  };

/** 大盒敌怪（覆盖弹道;hurt 侦） */
function bigEnemy(x: number, y: number, w = 200, h = 200) {
  const hurt = vi.fn();
  return { id: 1, dead: false, x, y, w, h, cx: x + w / 2, cy: y + h / 2, hurt,
    hurtCalls: hurt as unknown as { mock: { calls: unknown[][] } } };
}

beforeEach(() => { vi.restoreAllMocks(); });

// ================= 债1：aiStyle25 出膛宽限门（P.cs:12491 + Damage :12512 门） =================
describe('SW-BJ93 债1 出膛宽限门（P.cs:12491;出生 localAI[2]<=7 伤害四面全免）', () => {
  it('G1 99 出生 1..7 拍 PVE 全免、第 8 拍首伤（AI 先++/Damage 后读=Update :16880→:17184 序）', () => {
    const game = fakeGame(fakeStore());
    const e = bigEnemy(40, 60);                        // 200×200 盒罩住弹道
    const game2 = fakeGame(fakeStore(), { enemies: [e] });
    const b = mkBoulder(138);                          // sheet 138 → projId 99
    for (let t = 0; t < 7; t++) b.fixedUpdate(1 / 60, game2);
    expect(internals(b).localAI2).toBe(7);
    expect(e.hurt).not.toHaveBeenCalled();             // 宽限期 PVE 免（变异 M1/M2 红）
    b.fixedUpdate(1 / 60, game2);                      // 第 8 拍：localAI2=8 > 7
    expect(e.hurt).toHaveBeenCalledTimes(1);
    expect(game2.cuts.length).toBeGreaterThan(0);      // CutTiles 扫描账（门内）同拍出现（:12517）
  });

  it('G2 豁免型 1047 出生即伤（type∉门 {1021,1047,1005,1014} 例外臂 :12491）', () => {
    const e = bigEnemy(40, 60);
    const game = fakeGame(fakeStore(), { enemies: [e] });
    const b = mkBoulder(711);                          // sheet 711 → 1047
    b.fixedUpdate(1 / 60, game);                       // 第 1 拍即结算
    expect(e.hurt).toHaveBeenCalledTimes(1);
  });

  it('G3 1002（aiStyle16）不在 aiStyle25 钟内：localAI2 恒 0 且出生即伤（门 aiStyle==25 scoped）', () => {
    const e = bigEnemy(40, 60);
    const game = fakeGame(fakeStore(), { enemies: [e] });
    const b = mkBoulder(654);                          // sheet 654 → 1002
    b.fixedUpdate(1 / 60, game);
    expect(internals(b).localAI2).toBe(0);
    expect(e.hurt).toHaveBeenCalledTimes(1);           // 无宽限（aiStyle16 不进 :12491 支）
  });

  it('G4 CutTiles 门=CanDealDamage 门内（:12512→:12515）：宽限期不砍、第 8 拍起扫盒', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(138);
    for (let t = 0; t < 7; t++) b.fixedUpdate(1 / 60, game);
    expect(game.cuts.length).toBe(0);                  // 宽限期 CutTiles 全免
    b.fixedUpdate(1 / 60, game);
    expect(game.cuts.length).toBeGreaterThan(0);       // :12517 CutTiles()（31 盒→+1 排除界 4×4 格域）
  });

  it('G5 CutTiles 排除臂：1054 永不砍（type!=1054 :12515）、1021 非 friendly 不砍（json 无行）', () => {
    const g54 = fakeGame(fakeStore());
    const b54 = mkBoulder(714);                        // 1054
    for (let t = 0; t < 10; t++) b54.fixedUpdate(1 / 60, g54);   // 出宽限期后照旧
    expect(g54.cuts.length).toBe(0);                   // 1054=原版唯一 CutTiles 排除型
    const g21 = fakeGame(fakeStore());
    const b21 = mkProj(1021);
    for (let t = 0; t < 10; t++) b21.fixedUpdate(1 / 60, g21);
    expect(g21.cuts.length).toBe(0);                   // friendly 门（1021 hostile-only）
  });
});

// ================= 债2：Kill() 家族死亡尘/声面（P.cs:76355-76500） =================
describe('SW-BJ93 债2 Kill 家族尘/声面（BJ92 登记债;rbKill 家族面整缺→接通）', () => {
  it('K1 尘表直译：1013→243 / 727→40 / 1014→12 / 1021→323 / 1048→322 / 99→1,各 ×30 半数 scale×1.4', () => {
    const cases: Array<[number, number]> = [
      [664, 243], [484, 40], [665, 12], [712, 322], [138, 1],
    ];
    for (const [sheet, dustType] of cases) {
      const game = fakeGame(fakeStore());
      internals(mkBoulder(sheet)).rbKill(game);
      // ★SW-BJ93 债② wave2 重锚（2026-09-16）：地形面（:76478-76489）落刀后,1048 的
      //  rbKill 追加金字塔逐格 3×2 尘 322（16×16 盒×72）——死亡尘面断言按原盒 31×31 过滤。
      const death = game.dusts.filter((d) => d.w === 31 && d.h === 31);
      expect(death.length).toBe(30);
      expect(death.every((d) => d.type === dustType)).toBe(true);
      const scaled = death.filter((d) => d.scale !== 1);
      expect(scaled.length).toBeGreaterThan(0);
      expect(scaled.length).toBeLessThan(30);          // Next(2)==0 半数（确定性掷域内非全量）
    }
  });

  it('K1b 1021（MoonBoulder,无 tile sheet）→ 尘 323×30 + dig（族表直译;mkProj 直造）', () => {
    const game = fakeGame(fakeStore());
    internals(mkProj(1021)).rbKill(game);
    expect(game.dusts.length).toBe(30);
    expect(game.dusts.every((d) => d.type === 323)).toBe(true);
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);
  });

  it('K2 声面直译：1048→Item16 / 1053→Item14 / 1054→NPCHit29 / 1055→NPCDeath6 / 余→dig(0)', () => {
    const cases: Array<[number, string]> = [
      [712, 'Item_16'], [713, 'Item_14'], [714, 'NPC_Hit_29'], [715, 'NPC_Killed_6'],
      [138, 'dig'], [484, 'dig'], [664, 'dig'], [665, 'dig'],
    ];
    for (const [sheet, snd] of cases) {
      const game = fakeGame(fakeStore());
      internals(mkBoulder(sheet)).rbKill(game);
      expect(game.sfx.some((s) => s.name === snd)).toBe(true);
    }
  });

  it('K3 1053 专属爆面（:76390-76446）：尘31×25(×1.4)+尘6×80(对 scale 3/2 分档)+gore 61..63×4 scale1.5', () => {
    const goreSpy = vi.spyOn(GorePiece, 'newGore');
    const game = fakeGame(fakeStore());
    internals(mkBoulder(713)).rbKill(game);
    const d31 = game.dusts.filter((d) => d.type === 31);
    const d6 = game.dusts.filter((d) => d.type === 6);
    expect(d31.length).toBe(25);
    expect(d31.every((d) => d.scale === 2 && d.alpha === 100)).toBe(true);
    expect(d6.length).toBe(80);                        // 40 迭代 × (scale3 + scale2) 双尘
    expect(d6.filter((d) => d.scale === 3 && d.noGravity).length).toBe(40);
    expect(d6.filter((d) => d.scale === 2).length).toBe(40);
    expect(goreSpy).toHaveBeenCalledTimes(4);
    for (const call of goreSpy.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(61);      // Next(61,64)
      expect(call[0]).toBeLessThan(64);
      expect(call[5]).toBe(1.5);                       // scale
    }
    goreSpy.mockRestore();
  });

  it('K4 1054/1055 专属尘臂：1054→尘30×20(vy=-1) / 1055→尘192×50(vel×0.5 入参,scale×1.5,noGravity)', () => {
    const g1 = fakeGame(fakeStore());
    internals(mkBoulder(714)).rbKill(g1);
    expect(g1.dusts.length).toBe(20);
    expect(g1.dusts.every((d) => d.type === 30 && d.vy === -1)).toBe(true);
    const b = mkBoulder(715);
    b.vx = 4; b.vy = -2;
    const g2 = fakeGame(fakeStore());
    internals(b).rbKill(g2);
    expect(g2.dusts.length).toBe(50);
    expect(g2.dusts.every((d) => d.type === 192 && d.noGravity && d.scale === 1.5)).toBe(true);
    expect(g2.dusts[0].vx).toBeCloseTo(4, 6);          // velocity.X×0.5（入参）→ 后写 ×2（:76462）
    expect(g2.dusts[0].vy).toBeCloseTo(-2, 6);         // velocity.Y×0.5 → ×2
  });

  it('K5 缺省支 1057 排除（type!=1057 → 零尘）+ dig 声', () => {
    const game = fakeGame(fakeStore());
    internals(mkBoulder(716)).rbKill(game);
    expect(game.dusts.length).toBe(0);
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);
  });

  it('K6 掉落臂（:76479-76487）：1057→Item 5523 / 1014→Item 29（Center 出膛）', () => {
    const g1 = fakeGame(fakeStore());
    internals(mkBoulder(716)).rbKill(g1);
    expect(g1.drops.length).toBe(1);
    expect(g1.drops[0].key).toBe('vi_5523_BoulderPet');
    const g2 = fakeGame(fakeStore());
    internals(mkBoulder(665)).rbKill(g2);
    expect(g2.drops.length).toBe(1);
    expect(g2.drops[0].key).toBe('vi_29_LifeCrystal');
    const g3 = fakeGame(fakeStore());
    internals(mkBoulder(138)).rbKill(g3);
    expect(g3.drops.length).toBe(0);                   // 99 无掉落臂
  });

  it('K7 撞墙 Kill 收口（:19097-19100 直调 Kill）：99 撞墙 dead+尘1×30+dig（旧直写 dead=静默）', () => {
    const cells = new Map<number, number>();
    for (let r = 4; r < 11; r++) cells.set(r * 64 + 9, SOLID_ID);   // 墙列 9=[144,160)
    const game = fakeGame(fakeStore(64, 64, cells));
    const b = new RollingBoulder(112, 104, 138);       // 盒 112..143 触墙列
    b.vx = 7; b.vy = 0;
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);
    expect(game.dusts.filter((d) => d.type === 1).length).toBe(30);   // Kill 面（非旧灰粒子）
    expect(game.sfx.some((s) => s.name === 'dig')).toBe(true);
  });

  it('K8 入湿 Kill 收口（:26750-26752 Kill()）：1053 任一液湿→dead+Item14（旧直写 dead=静默）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);     // 头部伴生尘三支全假（隔离债3 面）
    const game = fakeGame(fakeStore());
    const b = mkBoulder(713);
    (b as unknown as { wet: boolean }).wet = true;     // AnyWet 位（AI 段尾消费 :26748）
    b.fixedUpdate(1 / 60, game);
    expect(b.dead).toBe(true);
    expect(game.sfx.some((s) => s.name === 'Item_14')).toBe(true);
    expect(game.dusts.filter((d) => d.type === 31).length).toBe(25);  // 1053 专属爆面随 Kill 发放
  });
});

// ================= 债3：aiStyle25 头部伴生尘（:26390-26410 / :26745-26749） =================
describe('SW-BJ93 债3 头部伴生尘（1053 三色尘 / 1048 滚动尘）', () => {
  it('D1 1053 三支独立 1/3 拍率（:26390/26398/26403）：全假=零尘、全真=31×1+6×2 且盒/scale/后写逐式', () => {
    const mock = vi.spyOn(Math, 'random');
    mock.mockReturnValue(0.9);                          // Next(3)∈{1,2} → 三支全假
    const g1 = fakeGame(fakeStore());
    mkBoulder(713).fixedUpdate(1 / 60, g1);
    expect(g1.dusts.length).toBe(0);
    mock.mockReturnValue(0.1);                          // 三支全真（floor(0.3)=0）
    const g2 = fakeGame(fakeStore());
    const b = mkBoulder(713);
    b.fixedUpdate(1 / 60, g2);
    expect(g2.dusts.length).toBe(3);
    expect(g2.dusts[0].type).toBe(31);                  // 尘①烟：盒 pos+(6,6) 尺 (w-12,h-12) scale1.5
    expect(g2.dusts[0].scale).toBe(1.5);
    expect(g2.dusts[1].type).toBe(6);                   // 尘②火：noGravity（:26401）
    expect(g2.dusts[1].noGravity).toBe(true);
    expect(g2.dusts[2].type).toBe(6);                   // 尘③火：全盒（:26405）
    mock.mockReturnValue(0.4);                          // 0.4 档：Next(3)=1 全假 / Next(2)=0 全真
    const g3 = fakeGame(fakeStore());                   // —— 1/2 拍率变异体在此误发 3 尘（M11 红）
    mkBoulder(713).fixedUpdate(1 / 60, g3);
    expect(g3.dusts.length).toBe(0);                    // 1/3 拍率守卫（变异 M11 判别线）
    mock.mockRestore();
  });

  it('D2 1048 滚动尘（:26745-26749）：|v|>1 → 尘322 盒 2×2、速=−v×0.5、scale∈[0.75,1)、noGravity', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    b.vx = 3; b.vy = -2;
    b.fixedUpdate(1 / 60, game);
    const rolling = game.dusts.filter((d) => d.type === 322 && d.w === 2 && d.h === 2);
    expect(rolling.length).toBe(1);
    const d = rolling[0];
    expect(d.noGravity).toBe(true);
    expect(d.scale).toBeGreaterThanOrEqual(0.75);
    expect(d.scale).toBeLessThanOrEqual(1);
    expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(Math.hypot(-b.vx, -b.vy) * 0.5, 6);  // −velocity×0.5（弹后值）
  });

  it('D3 1048 静止（|v|<=1）不滚动尘（门 :26745 velocity.Length()>1）', () => {
    const game = fakeGame(fakeStore());
    const b = mkBoulder(712);
    b.vx = 0.5; b.vy = 0.5;
    b.fixedUpdate(1 / 60, game);
    expect(game.dusts.filter((d) => d.type === 322).length).toBe(0);
  });
});

// ================= 债4：1002 TNTBarrel（EVP 豁免 + SelfHurtPlayers + 名实勘误） =================
describe('SW-BJ93 债4 1002 TNTBarrel（SkipDamage_EVP :14848 + SelfHurtPlayers :15104）', () => {
  const pOver = (over: Record<string, unknown> = {}) => ({
    dead: false, iframes: 0, x: 100, y: 100, w: 20, h: 42,
    cx: 110, cy: 121, vx: 0, vy: 0, facing: 1, luck: 0,
    equipStats: { deadMansSweater: false }, ...over,
  });

  it('E1 集合面直译（ProjectileID.cs:275）+ 1002 接触零结算（:14848 第 4 因子;RB21 双向偏差正向）', () => {
    expect([...SKIP_DAMAGE_EVP].sort((a, b) => a - b)).toEqual([108, 164, 1002]);
    const game = fakeGame(fakeStore(), { player: pOver() });
    const b = mkBoulder(654);                          // 1002 hostile=true（json）
    b.fixedUpdate(1 / 60, game);                       // 玩家盒与弹盒相交
    expect(game.playerHits.length).toBe(0);            // EVP 豁免（变异 M1 红）
  });

  it('E1b 99 正例（不在集）：hostile 门照常结算=豁免不外溢', () => {
    const game = fakeGame(fakeStore(), { player: pOver() });
    const b = mkBoulder(138);
    internals(b).localAI2 = 8;                         // 出宽限期（否则 G1 门先挡）
    b.fixedUpdate(1 / 60, game);
    expect(game.playerHits.length).toBe(1);
  });

  it('E2 Kill 自伤面（:15104-15152）：DV 掷域 [340,460]=400±15%、盒=vanilla 260×260（非建模盒）', () => {
    // 玩家位 (200,200)：在 vanilla 260 盒 [90,350) 内、建模盒 31×31 [90,121) 外
    // （盒变异体=建模盒 → 玩家盒外早退 → 变异红）
    const game = fakeGame(fakeStore(), { player: pOver({ x: 200, y: 200, cx: 210, cy: 221 }) });
    const b = mkBoulder(654);
    b.x = 90; b.y = 90;
    internals(b).rbKill(game);
    expect(game.playerHits.length).toBe(1);
    expect(game.playerHits[0]).toBeGreaterThanOrEqual(340);   // DamageVar ±15%（:15118 单源掷）
    expect(game.playerHits[0]).toBeLessThanOrEqual(460);
  });

  it('E2b self-hurt 三门：immune 窗/盒外 → 零结算;sweater（trap ✓ :9539）→ ×0.5 截断 min 300（:15119-22）', () => {
    const g1 = fakeGame(fakeStore(), { player: pOver({ iframes: 3 }) });
    const b1 = mkBoulder(654);
    internals(b1).rbKill(g1);
    expect(g1.playerHits.length).toBe(0);              // immune（:15107 localPlayer.immune）
    const g2 = fakeGame(fakeStore(), { player: pOver({ x: 5000, y: 5000, cx: 5010, cy: 5021 }) });
    internals(mkBoulder(654)).rbKill(g2);
    expect(g2.playerHits.length).toBe(0);              // Colliding 门（260 盒外 :15108）
    const g3 = fakeGame(fakeStore(), {
      player: pOver({ equipStats: { deadMansSweater: true } }),
    });
    const b3 = mkBoulder(654);
    internals(b3).rbKill(g3);
    expect(g3.playerHits.length).toBe(1);
    expect(g3.playerHits[0]).toBeLessThanOrEqual(300); // sweater cap（DV 后截断再 min）
  });

  it('E3 名实勘误（TileID.cs:1745=TNTBarrel）：654 行权威=TNTBarrel、行尾不再以仙人掌球为名', () => {
    const src = readFileSync(join(__dirname, '../src/world/BoulderMech.ts'), 'utf8');
    expect(src).toContain('TNTBarrel');
    const row = src.split('\n').find((l) => l.includes('654: { proj: 1002'));
    expect(row).toBeDefined();
    expect(row!).toMatch(/\/\/ TNTBarrel（TNT 炸药桶/);      // 行名权威
    expect(row!).not.toMatch(/大石柱仙人掌球（偏移/);         // 旧行名退役（勘误注可引旧名）
    expect(src).toContain('∪ 654 TNTBarrel');               // 文头族表同步
  });
});

// ================= 债5：Chilled 门同族幻影姿态（Player.cs:28211 / 1458 :28209） =================
const W5 = 80, H5 = 200;
const ROW5 = 40;

function poolWorld5(type: number): World {
  const w = new World(W5, H5, 11, 'bj93-chilled');
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, 120, 1);
    for (let y = 60; y < 120; y++) st.setLiquid(x, y, 255, type);
  }
  for (let x = 62; x < 76; x++) for (let y = 100; y < 120; y++) st.setTile(x, y, 1);
  return w;
}

/** 唇袋（graze 姿态,rb20a pocketWorld 镜像）：全盒 WetCollision 可及、居中探针干 */
function pocketWorld5(type: number): World {
  const w = new World(64, 160, 11, 'bj93-pocket');
  const st = w.store;
  for (let x = 26; x <= 35; x++) st.setTile(x, ROW5 + 1, 1);
  for (const x of [26, 27, 34, 35]) st.setTile(x, ROW5, 1);
  for (const x of [28, 29, 31]) { st.setTile(x, ROW5, 1); st.setHalfBrick(x, ROW5, true); }
  st.setTile(33, ROW5, 1); st.setSlope(33, ROW5, 2);
  st.setLiquid(30, ROW5, 255, type);
  st.setLiquid(32, ROW5, 255, type);
  return w;
}

function chilledDriver(world: World, px: number, py: number, zoneSnow = true) {
  world.difficulty = 1;                                // Main.expertMode（:28211 第 1 因子）
  const p = new Player(px, py, new Inventory());
  p.hp = 4000;
  const hooks = {
    world, player: p,
    scene: { zoneSnow },                               // ZoneSnow（:28211 第 2 因子）
    enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
  return { p, hooks };
}

describe('SW-BJ93 债5 Chilled 门探针基面（wet&&!lavaWet&&!honeyWet :28211）', () => {
  it('C1 深水（wetSticky 真）+专家+雪原 → Chilled(46) 恒挂（浸着每拍 AddBuff(46,150)）', () => {
    const { p, hooks } = chilledDriver(poolWorld5(1), 30 * TILE, 80 * TILE);
    for (let t = 0; t < 30; t++) p.fixedUpdate(1 / 60, hooks);
    expect((p as unknown as { wetSticky: boolean }).wetSticky).toBe(true);
    expect(p.buffs.has(BuffType.Chilled)).toBe(true);
  });

  it('C2 经典档（expertMode 假）不冻（:28211 第 1 因子）', () => {
    const w = poolWorld5(1);
    w.difficulty = 0;
    const { p, hooks } = chilledDriver(w, 30 * TILE, 80 * TILE);
    w.difficulty = 0;
    for (let t = 0; t < 30; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.buffs.has(BuffType.Chilled)).toBe(false);
  });

  it('C3 幻影假设证伪备案（定谳记录）：水缘擦过两门同相——inWater=居中探针湿∧!inLava ⊆ wetSticky', () => {
    // ★BJ93 债5 定谳（2026-09-16,探针实测）：登记债假设「inWater 全盒擦水幻影」被
    //  证伪——vanilla num86=Collision.WetCollision 内部【居中小盒】探针（Collision.cs
    //  WetCollision 头 10×Height/2 窗）,仓内 wetCollision（npcLiquid,居中盒 1:1）同构,
    //  inWater = r.wet ∧ !inLava ⊆ r.wet ≡ wetNow ≡ wetSticky → 水域两门恒同相。
    //  残余可达偏差仅限微光交叠边（vanilla lavaWet/honeyWet 的 !shimmering 置位门 vs
    //  旧仓裸 inLava/inHoney 桶位）与本仓 inHoney :4128 二次盒覆写——C5 结构锁钉死
    //  vanilla 三旗原文防回退。本测=唇袋横穿（rb20a F6-② 口径）留证：居中探针恒干、
    //  两门同相不冻。
    const LIP_TOP = ROW5 * TILE + 8;
    const { p, hooks } = chilledDriver(pocketWorld5(1), 28 * TILE, LIP_TOP - 42);
    const self = p as unknown as { wetSticky: boolean; inWater: boolean };
    let chilledEver = false;
    for (let t = 0; t < 44; t++) {
      p.x += 2.5;
      p.fixedUpdate(1 / 60, hooks);
      chilledEver = chilledEver || p.buffs.has(BuffType.Chilled);
    }
    expect(self.wetSticky).toBe(false);                // 居中探针恒干（rb20a F6-② 同判）
    expect(chilledEver).toBe(false);                   // 新门不冻=vanilla 静默
  });

  it('C4 lavaWet/honeyWet 门：深岩浆/深蜂蜜浸着不冻（:28211 第 4/5 因子;变异 M2 红线）', () => {
    const lava = chilledDriver(poolWorld5(2), 30 * TILE, 80 * TILE);
    for (let t = 0; t < 20; t++) lava.p.fixedUpdate(1 / 60, lava.hooks);
    expect((lava.p as unknown as { wetSticky: boolean }).wetSticky).toBe(true);   // wet 含岩浆湿
    expect(lava.p.buffs.has(BuffType.Chilled)).toBe(false);
    const honey = chilledDriver(poolWorld5(3), 30 * TILE, 80 * TILE);
    for (let t = 0; t < 20; t++) honey.p.fixedUpdate(1 / 60, honey.hooks);
    expect(honey.p.buffs.has(BuffType.Chilled)).toBe(false);
  });

  it('C5 结构锁：门序原文 wetSticky→splashLavaWet→splashHoneyWet（探针基面单源,防回退桶位）', () => {
    const src = readFileSync(join(__dirname, '../src/entities/Player.ts'), 'utf8');
    expect(src).toMatch(/this\.wetSticky && !this\.splashLavaWet\s*\n?\s*&& !this\.splashHoneyWet/);
    expect(src).not.toContain('this.inWater && !this.inLava && !this.inHoney');
  });
});

// ================= 结构锁（源文本锚,防静默回退） =================
describe('SW-BJ93 结构锁（判据表达式与位序钉死）', () => {
  const rb = () => readFileSync(join(__dirname, '../src/entities/RollingBoulder.ts'), 'utf8');

  it('S1 宽限门原文：aiStyle25 支+豁免集序 {1021,1047,1005,1014}+localAI2<=7（:12491 直译）', () => {
    const src = rb();
    const gate = src.slice(src.indexOf('private rbDamageCanDeal'), src.indexOf('private rbKill('));
    expect(gate).toContain('this.localAI2 <= 7');
    expect(gate.indexOf('1021')).toBeLessThan(gate.indexOf('1047'));   // 原文字面序
    expect(gate.indexOf('1047')).toBeLessThan(gate.indexOf('1005'));
    expect(gate.indexOf('1005')).toBeLessThan(gate.indexOf('1014'));
    expect(src).toContain('if (this.projId !== 1002) this.localAI2++');   // AI_025 头 :26360
    expect(src).toContain('if (this.rbDamageCanDeal())');                 // Damage :12512 门
    expect(src).toContain('cutTilesBox(game, this.x, this.y, this.w, this.h, this.projId)');
  });

  it('S2 EVP 门序：hostile → SkipDamage_EVP → 玩家位（:14848 四因子序）', () => {
    const src = rb();
    expect(src).toContain('!SKIP_DAMAGE_EVP.has(this.projId)');
    expect(src.indexOf('?.hostile')).toBeLessThan(src.indexOf('SKIP_DAMAGE_EVP.has'));
  });

  it('S3 Kill 单口：rbKill 内家族面+1002 自伤双臂接线（1047 早退保持专属爆段）', () => {
    const src = rb();
    expect(src).toContain('this.rbKillFamilyFace(game)');
    expect(src).toContain('if (this.projId === 1002) this.rbSelfHurtPlayers(game)');
    const fam = src.slice(src.indexOf('private rbKillFamilyFace'), src.indexOf('private rbSelfHurtPlayers'));
    expect(fam).toContain('SpreadPoopPyramid');        // 地形面登记注在场（邻接债防散佚）
    expect(fam).toContain('LavaBoulderExplosion');
  });
});
