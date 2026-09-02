// Kill 消亡面清偿批金标（2026-09-02，Projectile.cs:76329-78993 分档链缺口补齐）：
//   ① 283 VenomBullet Kill（:77513-77580）：Item10 + 30×d171 三组各 10（scale=
//      Next(1,10)×0.1 直赋/noGravity/fadeIn1.5;组1 v×0.75;组2 +oldV×0.5×rand;
//      组3 v×1.5+oldV×1.5×rand）+ owner 门三连 Damage 等价——80×80 盒沿 oldV 归一向
//      步进 60px 三段独立结算（283 无 local/ID-static 免疫表 → 同敌可三跳;pierce=1
//      → Enemy.hurt 豁免免疫帧）
//   ② 639 月总箭 Kill（:74813-74842）：d220×Next(5,9)（α100/noGravity/scale0.5）+
//      owner 侧衍生 640（出生位=localAI[0]/[1]、初速=ai[0]/[1] 快照 P.cs:56381-56386）
//   ③ 9 星怒天降星（:77259-77318 else 支）：Item10 + 10×d58（v×0.1、α150、scale1.2）
//      + 3×gore Next(16,18)（右开={16,17}、v×0.05）
//   ④ 80 冰雪魔杖冰弹（:77106-77124）：Item27 + 10×d67 + 弹心格 tile 127 → KillTile
//   ⑤ 712 彩虹水晶碎片（:77714-77746）：Item10 + rand(6,12)×d15（scale1 直赋/
//      fadeIn1.5/noGravity/色 (255,255,255,0)×0.3=XNA (76,76,76,0) 纯加算）+ 3×gore 1008
//   ⑥ 119/359/118（:76868-76886）：Item27 + d92×20（119/359）/×10（118）
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { Arrow } from '../src/entities/Arrow';
import { GorePiece } from '../src/entities/GorePiece';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

interface DustRec {
  type: number; alpha: number; scale: number; noGravity: boolean;
  sx: number; sy: number; fadeIn: number; color: unknown;
  vx: number; vy: number; x: number; y: number;
}

interface HurtRec { dmg: number; pierce: number; fromPlayer: boolean; }

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

/** Arrow 仿真桩（同 arrow-flight-trail-dust harness + 敌集/实体桶扩展） */
function makeGame(w: World, dusts: DustRec[], bucket: unknown[] = [],
  enemies: unknown[] = [], critters: unknown[] = []) {
  return {
    world: w, player: null as unknown, enemies: () => enemies, critters: () => critters,
    projectiles: () => [],
    entities: { nextId: 1, add: (e: unknown) => { bucket.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    onProjectileDeath: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0, c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec = { type, alpha, scale, noGravity: !!ng, sx, sy, fadeIn: 0,
        color: c, vx: 0, vy: 0, x: 0, y: 0 };
      dusts.push(d);
      return d;
    },
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

/** onProjectileDeath 零场桩（Object.create(Game.prototype) 模式,同 ammo-remainder-fixes） */
function mkDeathGame(opts?: {
  world?: World; enemies?: Array<Record<string, unknown>>;
}) {
  const dusts: DustRec[] = [];
  const sfx: string[] = [];
  const brokenTiles: Array<[number, number]> = [];
  const hurt: HurtRec[] = [];
  const enemies = (opts?.enemies ?? []).map((e) => ({
    dead: false, x: 0, y: 0, w: 20, h: 20, ...e,
    hurt: (dmg: number, _kbx: number, _kby: number, _g: unknown,
      _ap: number, _c: boolean, pierce = 0, fromPlayer = false) => {
      hurt.push({ dmg, pierce, fromPlayer });
      return true;
    },
  }));
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = { dead: false, cx: 0, cy: 0, x: -10, y: -21, w: 20, h: 42, equipStats: {} };
  g.entities = { enemies, critters: [], projectiles: [], add: () => {} };
  g.world = opts?.world ?? emptyWorld();
  g.sfx = { play: (name: string) => { sfx.push(name); } };
  g.playSfxFiles = (names: string[]) => { sfx.push(...names); };
  g.spawnDust = (_x: number, _y: number, _w: number, _h: number, type: number,
    sx = 0, sy = 0, alpha = 0, c: unknown = null, scale = 1, ng = false) => {
    const d: DustRec = { type, alpha, scale, noGravity: !!ng, sx, sy, fadeIn: 0,
      color: c, vx: 1, vy: 1, x: 0, y: 0 };
    dusts.push(d);
    return d;
  };
  g.breakTile = (x: number, y: number) => { brokenTiles.push([x, y]); };
  g.damagePlayer = (): number => 0;
  return { g: g as unknown as { onProjectileDeath: (...a: unknown[]) => void },
    dusts, sfx, brokenTiles, hurt };
}

function kill(a: Arrow, game: GameHooks): void {
  (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
}

describe('Kill 消亡面清偿批金标（2026-09-02）', () => {
  it('① 283：Item_10 + 30×d171 三组结构（scale∈[0.1,0.9]/fadeIn1.5/noGravity;组1 零附加、组2/3 oldV 附加）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(400, 300, 6, 0, 30, 1, 283, null, { grav: 0 });
    kill(a, game);
    const d171 = dusts.filter((d) => d.type === 171);
    expect(d171.length).toBe(30);
    expect(d171.every((d) => d.noGravity && d.fadeIn === 1.5
      && d.scale >= 0.1 - 1e-9 && d.scale <= 0.9 + 1e-9)).toBe(true);
    const g1 = dusts.slice(0, 10).filter((d) => d.type === 171);
    const g2 = dusts.slice(10, 20).filter((d) => d.type === 171);
    const g3 = dusts.slice(20, 30).filter((d) => d.type === 171);
    // 组1 仅 ×0.75（本仓桩初速 0 → 恒 0）；组2/3 += oldV×k×rand（v=6 → 组2 ≤3、组3 ≤9）
    expect(g1.every((d) => Math.abs(d.vx) < 1e-9 && Math.abs(d.vy) < 1e-9)).toBe(true);
    expect(g2.every((d) => d.vx >= -1e-9 && d.vx <= 3 + 1e-9)).toBe(true);
    expect(g3.every((d) => d.vx >= -1e-9 && d.vx <= 9 + 1e-9)).toBe(true);
    expect(g2.some((d) => d.vx > 0)).toBe(true);
    expect(g3.some((d) => d.vx > 3)).toBe(true);
  });

  it('① 283 三连 Damage 等价：段心 405/465/525（步进 60px、盒 ±40+敌半宽 10）——中段敌两跳、段0 敌一跳、远敌不结算;pierce=1/fromPlayer', () => {
    const dusts: DustRec[] = [];
    const mkEnemy = (cx: number) => {
      const rec: { hits: HurtRec[] } = { hits: [] };
      const e = {
        x: cx - 10, y: 300, w: 20, h: 20, dead: false, vanillaId: 0, rec,
        hurt: (dmg: number, _kbx: number, _kby: number, _g: unknown, _ap: number,
          _c: boolean, pierce = 0, fromPlayer = false) => {
          rec.hits.push({ dmg, pierce, fromPlayer });
          return true;
        },
      };
      return e;
    };
    const seg0 = mkEnemy(405);   // 仅段0（|405−465|=60 > 50）
    const mid = mkEnemy(495);    // 段1+段2（|495−465|=30 / |495−525|=30）
    const beyond = mkEnemy(700); // 三段全不覆盖
    const game = makeGame(emptyWorld(), dusts, [], [seg0, mid, beyond]);
    const a = new Arrow(400, 300, 6, 0, 30, 1, 283, null, { grav: 0 });
    kill(a, game);
    expect(seg0.rec.hits).toHaveLength(1);
    expect(mid.rec.hits).toHaveLength(2);
    expect(beyond.rec.hits).toHaveLength(0);
    for (const e of [seg0, mid]) {
      expect(e.rec.hits.every((h) => h.pierce === 1 && h.fromPlayer && h.dmg === 30)).toBe(true);
    }
  });

  it('① 283 面单口性：Game.onProjectileDeath 无 283 分档（双触发防护）', () => {
    const mk = (cx: number) => ({ x: cx - 10, y: 290, w: 20, h: 20, dead: false, vanillaId: 0 });
    const d = mkDeathGame({ enemies: [mk(400)] });
    d.g.onProjectileDeath(283, 395, 295, 10, 10, 6, 0, 30, {});
    expect(d.hurt).toHaveLength(0);
    expect(d.sfx).toHaveLength(0);
  });

  it('② 639：Kill 撒 d220×5..9（α100/noGravity/scale0.5）+ owner 侧衍生 640（出生位/初速=快照）', () => {
    const dusts: DustRec[] = [];
    const bucket: Array<{ projId?: number; x?: number; vx?: number; vy?: number;
      damage?: number; alpha?: number }> = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(400, 300, 6, 0, 30, 1, 639, null, { grav: 0, life: 600 });
    for (let i = 0; i < 2 && !a.dead; i++) a.fixedUpdate(1 / 60, game);
    const snap = a as unknown as { moonArrowL0: number; moonArrowL1: number;
      moonArrowA0: number; moonArrowA1: number };
    expect(snap.moonArrowL0).toBeCloseTo(405, 6);            // 出生心快照（x=400+5）
    expect(snap.moonArrowA0).toBeCloseTo(6, 6);
    kill(a, game);
    const d220 = dusts.filter((d) => d.type === 220);
    expect(d220.length).toBeGreaterThanOrEqual(5);
    expect(d220.length).toBeLessThanOrEqual(9);
    expect(d220.every((d) => d.alpha === 100 && d.noGravity && Math.abs(d.scale - 0.5) < 1e-9)).toBe(true);
    const derived = bucket.filter((e) => e.projId === 640);
    expect(derived).toHaveLength(1);
    expect(derived[0].x).toBeCloseTo(405, 6);                // localAI[0]（top-left=Center 怪癖按原文）
    expect(derived[0].vx).toBeCloseTo(6, 6);
    expect(derived[0].damage).toBe(30);
    expect(derived[0].alpha).toBe(255);                      // PROJ_ALPHA0[640]（SetDefaults :6902）
  });

  it('③ 9：Item_10 + 10×d58（v×0.1、α150、scale1.2）+ 3×gore Next(16,18)（v×0.05）', () => {
    const dusts: DustRec[] = [];
    const d = mkDeathGame({});
    const goreSpy = vi.spyOn(GorePiece, 'newGore');
    d.g.onProjectileDeath(9, 1000 - 12, 1000 - 12, 24, 24, 5, -2, 20, {});
    const goreCalls = goreSpy.mock.calls;
    goreSpy.mockRestore();
    expect(d.sfx.filter((s) => s === 'Item_10')).toHaveLength(1);
    const d58 = d.dusts.filter((x) => x.type === 58);
    expect(d58).toHaveLength(10);
    expect(d58.every((x) => x.alpha === 150 && Math.abs(x.scale - 1.2) < 1e-9
      && Math.abs(x.sx - 0.5) < 1e-9 && Math.abs(x.sy + 0.2) < 1e-9)).toBe(true);
    expect(goreCalls).toHaveLength(3);
    expect(goreCalls.every(([id]) => id === 16 || id === 17)).toBe(true);
    expect(goreCalls.every(([, , , vx, vy]) => Math.abs((vx ?? 0) - 0.25) < 1e-9
      && Math.abs((vy ?? 0) + 0.1) < 1e-9)).toBe(true);
  });

  it('④ 80：Item_27 + 10×d67 + 弹心格 tile 127 → KillTile（非 127 不拆）', () => {
    const w = emptyWorld();
    const ice = TILE_INTERNAL_BY_SHEET.get(127);
    expect(ice).toBeDefined();
    w.store.setTileSilent(25, 18, ice!, 0, 0);
    w.store.setTileSilent(40, 18, 1, 0, 0);                  // 普通石（sheet 1）
    const withIce = mkDeathGame({ world: w });
    withIce.g.onProjectileDeath(80, 25 * TILE, 18 * TILE, 16, 16, 0, 0, 10, {});
    expect(withIce.sfx).toContain('Item_27');
    expect(withIce.dusts.filter((x) => x.type === 67)).toHaveLength(10);
    expect(withIce.brokenTiles).toEqual([[25, 18]]);
    const plain = mkDeathGame({ world: w });
    plain.g.onProjectileDeath(80, 40 * TILE, 18 * TILE, 16, 16, 0, 0, 10, {});
    expect(plain.brokenTiles).toHaveLength(0);               // 非 127 → 不 KillTile
  });

  it('⑤ 712：Item_10 + 6..11×d15（scale1 直赋/fadeIn1.5/noGravity/色(76,76,76,0)）+ 3×gore 1008', () => {
    const d = mkDeathGame({});
    const goreSpy = vi.spyOn(GorePiece, 'newGore');
    d.g.onProjectileDeath(712, 500, 500, 10, 10, 3, 1, 40, {});
    const gore712 = goreSpy.mock.calls.filter(([id]) => id === 1008);
    goreSpy.mockRestore();
    expect(d.sfx.filter((s) => s === 'Item_10')).toHaveLength(1);
    const d15 = d.dusts.filter((x) => x.type === 15);
    expect(d15.length).toBeGreaterThanOrEqual(6);
    expect(d15.length).toBeLessThanOrEqual(11);
    expect(d15.every((x) => x.noGravity && x.fadeIn === 1.5 && Math.abs(x.scale - 1) < 1e-9)).toBe(true);
    expect(d15.every((x) => (x.color as { r: number; g: number; b: number; a: number })?.r === 76
      && (x.color as { r: number; g: number; b: number; a: number })?.a === 0)).toBe(true);
    expect(gore712).toHaveLength(3);
  });

  it('⑥ 119/359：Item_27 + d92×20；118：×10', () => {
    const a = mkDeathGame({});
    a.g.onProjectileDeath(119, 600, 600, 14, 14, 0, 0, 10, {});
    expect(a.sfx).toContain('Item_27');
    expect(a.dusts.filter((x) => x.type === 92)).toHaveLength(20);
    const b = mkDeathGame({});
    b.g.onProjectileDeath(359, 600, 600, 14, 14, 0, 0, 10, {});
    expect(b.dusts.filter((x) => x.type === 92)).toHaveLength(20);
    const c = mkDeathGame({});
    c.g.onProjectileDeath(118, 600, 600, 14, 14, 0, 0, 10, {});
    expect(c.sfx).toContain('Item_27');
    expect(c.dusts.filter((x) => x.type === 92)).toHaveLength(10);
  });
});
