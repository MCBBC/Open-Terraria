// 枪械备案遗留 6 项回归（2026-08-23）：
//   ① 信号枪弹 163 aiStyle 33（AI_033 Projectile.cs:27425-27498 + 贴壁 :18731-18745
//      + SetDefaults :2517-2526）——曾走 Arrow 直飞无重力无贴壁
//   ② 叶绿弹 207 自导引（AI_001 :53906-54010，300px 锁敌/ai[1] 锚定/(v×7+dir·v0)/8）
//   ③ 火箭烟尾（AI_016 :48181-48240，|v|≥8 每 update 2×烟尘+2×火尘 31）
//   ④ 五枪注册（127 太空枪/514 激光枪/3107 钉枪/1782 糖果玉米步枪/1258 刺炮发射器
//      + 弹药 3108/1783/1261；钉枪散布 :47928-47933、刺炮散布 :48603-48613、
//      1782 crit+6 :19755、1/3 省弹 :54248-54250）
//   ⑤ 冰霜甲×爆炸（StatusNPC :11524-11527 (melee||ranged)&&frostBurn→AddBuff(324)）
//   ⑥ 箭袋 stack 公式（Pl.cs:3966 bowEffectiveDamage——stack 段乘 rangedMultDamage
//      非 arrowMult²）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { itemCombat, rangedAmmoWeapon, gunAmmoSaveHit, projGravSpec } from '../src/data/vanillaItemCombat';
import { Game } from '../src/core/Game';
import { projectileData } from '../src/data/vanillaProjectiles';

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function makeGame(w: World, enemies: unknown[] = [], hooks: Record<string, unknown> = {}): GameHooks {
  return {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20,
      equipStats: { frostBurn: false } },
    enemies: () => enemies, critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    ...hooks,
  } as unknown as GameHooks;
}

const mkEnemy = (id: number, tx: number, ty: number) => ({
  id, x: tx * TILE - 8, y: ty * TILE - 8, w: 16, h: 16, dead: false,
  hurt: () => true,
});

// ================= ④ 五枪注册 =================

describe('备案遗留④ 五枪注册（items.ts + vanilla-itemcombat 1457 终值）', () => {
  it('五枪 vi_ 键已注册（键反解 vid；图标经 vanilla.json items 回退）', () => {
    for (const key of ['vi_127_太空枪', 'vi_514_激光枪', 'vi_3107_钉枪',
      'vi_1782_糖果玉米步枪', 'vi_1258_刺炮发射器']) {
      expect(ITEM_BY_KEY[key], key).toBeDefined();
    }
  });

  it('127 太空枪：magic/mana6/shoot20 灰电弧/伤20/use17/autoReuse（Item.cs:2911-2929）', () => {
    const c = itemCombat(127);
    expect(c).toMatchObject({
      magic: true, mana: 6, shoot: 20, damage: 20, knockBack: 0.75,
      useTime: 17, useAnimation: 17, shootSpeed: 10, autoReuse: true, noMelee: true,
    });
    // UseSound=Item157（任务书"shoot157?"系 UseSound 误记——shoot 是 20）
    expect(itemCombat(127)?.shoot).not.toBe(157);
  });

  it('514 激光枪：magic/mana8/shoot88 紫激光/伤29/use12（Item.cs:7498-7516）', () => {
    expect(itemCombat(514)).toMatchObject({
      magic: true, mana: 8, shoot: 88, damage: 29, knockBack: 2.5,
      useTime: 12, useAnimation: 12, shootSpeed: 17, autoReuse: true,
    });
  });

  it('3107 钉枪：useAmmo 3108/shoot514/伤85 + 钉弹已注册可装填（Item.cs:28758-28787）', () => {
    expect(itemCombat(3107)).toMatchObject({
      ranged: true, useAmmo: 3108, shoot: 514, damage: 85, useTime: 15, shootSpeed: 10, autoReuse: true,
    });
    expect(ITEM_BY_KEY['vi_3108_钉']).toBeDefined();
    expect(itemCombat(3108)?.ammo).toBe(3108);       // PickAmmo 反查匹配
    expect(itemCombat(3108)?.shoot).toBe(514);
    expect(rangedAmmoWeapon({ key: 'vi_3107_钉枪' })).toBe(3108);
  });

  it('1782 糖果玉米步枪：crit+6（:19755）/useAmmo 1783/1-3 省弹（:54248-54250）', () => {
    const c = itemCombat(1782);
    expect(c).toMatchObject({
      ranged: true, useAmmo: 1783, shoot: 311, damage: 60, useTime: 9, shootSpeed: 10, autoReuse: true,
    });
    expect(c?.crit).toBe(6);                          // crit += 6 提取器漏提 → EXTRACT_PATCH
    expect(ITEM_BY_KEY['vi_1783_糖果玉米']).toBeDefined();
    expect(itemCombat(1783)?.ammo).toBe(1783);
    expect(gunAmmoSaveHit(1782, 0.0)).toBe(true);     // Next(3)==0 → 省
    expect(gunAmmoSaveHit(1782, 0.5)).toBe(false);
  });

  it('1258 刺炮发射器：useAmmo 1261/shoot246/伤45 + 刺炮弹已注册（Item.cs:15588-15605）', () => {
    expect(itemCombat(1258)).toMatchObject({
      ranged: true, useAmmo: 1261, shoot: 246, damage: 45, knockBack: 5, useTime: 22, autoReuse: true,
    });
    expect(ITEM_BY_KEY['vi_1261_刺炮弹']).toBeDefined();
    expect(itemCombat(1261)?.shoot).toBe(246);
    expect(rangedAmmoWeapon({ key: 'vi_1258_刺炮发射器' })).toBe(1261);
  });

  it('弹体数据面：20/88 穿透 3 + 514 钉 aiStyle93 + 311 糖果玉米 + 246 刺炮弹', () => {
    expect(projectileData(20)).toMatchObject({ aiStyle: 1, penetrate: 3, extraUpdates: 2, light: 0.75 });
    expect(projectileData(88)).toMatchObject({ aiStyle: 1, penetrate: 3, extraUpdates: 4 });
    expect(projectileData(514)?.aiStyle).toBe(93);    // 钉：刺入 DoT 专管（AI_093 :33425-33487）
    expect(projectileData(311)).toMatchObject({ aiStyle: 1, penetrate: 3, timeLeft: 300 });
    expect(projectileData(246)?.ranged).toBe(true);   // Kill 爆炸+249 破片链（Game.onProjectileDeath 246 分支既有）
  });
});

// ================= ① 信号枪弹 163（aiStyle 33） =================

describe('备案遗留① 信号枪弹 163（AI_033 Projectile.cs:27425-27498）', () => {
  it('SetDefaults 面：6×6 盒/penetrate −1/timeLeft 36000/alpha 255/重力规格 0', () => {
    expect(projGravSpec(163)).toEqual({ grav: 0, delay: -1 });   // aiStyle 33 不入 AI_001 重力链
    const game = makeGame(emptyWorld());
    const f = new Arrow(10 * TILE, 40 * TILE, 4, -2, 2, 1.5, 163, null, {});
    expect(f.w).toBe(6);
    expect(f.h).toBe(6);
    expect(f.pierce).toBe(-1);
    expect(f.life).toBe(36000);
    expect(f.alpha).toBe(255);
    expect(f.flare).toBe(true);
    void game;
  });

  it('alpha −50/t 渐显（:27428-27435）；30t 后每拍 vy+0.09（:27474-27482）、终端 16', () => {
    const game = makeGame(emptyWorld());
    const f = new Arrow(10 * TILE, 40 * TILE, 4, 0, 2, 0, 163, null, {});
    f.fixedUpdate(1, game);
    expect(f.alpha).toBe(205);
    for (let t = 0; t < 28; t++) f.fixedUpdate(1, game);   // 累计 29 拍
    expect(f.alpha).toBe(0);                                // 255−50×29 < 0 → 钳 0
    expect(f.vy).toBe(0);                                   // 前 29 拍无重力（localAI[1]<30）
    f.fixedUpdate(1, game);                                 // 第 30 拍：flareGravT 达 30 → +0.09
    expect(f.vy).toBeCloseTo(0.09, 9);
    f.fixedUpdate(1, game);
    expect(f.vy).toBeCloseTo(0.18, 9);
    for (let t = 0; t < 400 && f.vy < 16; t++) f.fixedUpdate(1, game);
    expect(f.vy).toBe(16);                                  // :27494-27496 钳 16
  });

  it('贴壁停驻（:18731-18745）：撞实心 velocity 归零 + damage=0；脱块恢复下坠', () => {
    const w = emptyWorld();
    for (let y = 30; y <= 50; y++) w.store.setTileSilent(30, y, 1, 0, 0);   // 竖墙
    const game = makeGame(w);
    const f = new Arrow(26 * TILE, 40 * TILE, 4, 0, 7, 0, 163, null, {});
    for (let t = 0; t < 20 && !f.dead; t++) f.fixedUpdate(1, game);
    expect(f.dead).toBe(false);                 // 贴壁不消亡（penetrate −1 + aiStyle33 支）
    expect(f.vx).toBe(0);
    expect(f.vy).toBe(0);
    expect(f.damage).toBe(0);                   // 停驻弹清伤（:27489）
    // 挖掉墙 → 次拍 AI 探得脱块（localAI[1]=30），再拍恢复 +0.09 下坠（:27480-27483）
    w.store.setTileSilent(30, 40, 0, 0, 0);
    w.store.setTileSilent(30, 41, 0, 0, 0);
    f.fixedUpdate(1, game);                     // 脱块拍（else 分支只清标，不施重力）
    expect(f.vy).toBe(0);
    f.fixedUpdate(1, game);                     // 恢复飞行档 → 立即续坠
    expect(f.vy).toBeCloseTo(0.09, 9);
  });

  it('命中点燃：163 → OnFire 5-10s（:11687-11696）；1009 诅咒弹 → Cursed Inferno 10s（:11702-11705）', () => {
    const enemy = { ...mkEnemy(1, 12, 40), onFireT: undefined as number | undefined };
    const game = makeGame(emptyWorld(), [enemy]);
    const f = new Arrow(12 * TILE - 4, 40 * TILE - 4, 0.5, 0, 2, 0, 163, null, {});
    for (let t = 0; t < 8 && enemy.onFireT === undefined; t++) f.fixedUpdate(1, game);
    expect(enemy.onFireT).toBeDefined();
    expect(enemy.onFireT!).toBeGreaterThanOrEqual(5);
    expect(enemy.onFireT!).toBeLessThanOrEqual(10);
    const enemy2 = { ...mkEnemy(2, 12, 40), cursedT: undefined as number | undefined };
    const game2 = makeGame(emptyWorld(), [enemy2]);
    const c = new Arrow(12 * TILE - 4, 40 * TILE - 4, 0.5, 0, 2, 0, 1009, null, {});
    for (let t = 0; t < 8 && !enemy2.cursedT; t++) c.fixedUpdate(1, game2);
    expect(enemy2.cursedT).toBe(10);
  });
});

// ================= ② 叶绿弹 207 自导引 =================

describe('备案遗留② 叶绿弹 207 自导引（AI_001 :53906-54010）', () => {
  it('300px 锁敌 + (v×7+dir·v0)/8 保速转向；初速基准 localAI[0] 不随转向衰减', () => {
    const enemy = mkEnemy(7, 108, 58);
    const game = makeGame(emptyWorld(), [enemy]);
    const a = new Arrow(100 * TILE, 50 * TILE, 5, 0, 9, 4.5, 207, null, { extraUpdates: 0 });
    a.fixedUpdate(1, game);
    expect(a.chloAi1).toBe(7);                       // ai[1] 锚定（:53963-53966）
    expect(a.chloSpeed).toBeCloseTo(5, 9);
    expect(a.vy).toBeGreaterThan(0);                 // 朝右下目标偏转
    const sp = Math.hypot(a.vx, a.vy);
    for (let t = 0; t < 30; t++) a.fixedUpdate(1, game);
    // 转向期 |v'|=|v×7+dir·5|/8 ∈ [3.75,5]（dir 不平行 v 时略降）——收敛后回到
    // 基准 5（num188/localAI[0] 恒为基准，不随转向累积衰减）
    expect(Math.hypot(a.vx, a.vy)).toBeGreaterThan(sp * 0.97);
    expect(Math.abs(Math.hypot(a.vx, a.vy) - a.chloSpeed)).toBeLessThan(0.15);
  });
});

// ================= ④b 钉 514 / 刺炮弹 246 / 糖果玉米 311 弹体行为 =================

describe('备案遗留④b 新枪弹体行为（AI_093 :33425-33487 / AI_001 :58105-58132）', () => {
  it('钉 514：首中即刺入（ai[0]=-敌-1）+ 隔拍 ×0.15 DoT；不耗穿透', () => {
    const e = { ...mkEnemy(5, 20, 40), hp: 100000, iframes: 0,
      hurt: (_d: number) => true };
    const hits: number[] = [];
    e.hurt = (d: number) => { hits.push(d); return true; };
    const game = makeGame(emptyWorld(), [e]);
    const n = new Arrow(20 * TILE - 40, 40 * TILE - 4, 4, 0, 100, 0, 514, null, {});
    expect(n.nail93).toBe(true);
    for (let t = 0; t < 20 && n.nailAi0 === 0; t++) n.fixedUpdate(1, game);
    expect(n.nailAi0).toBe(-6);                       // -(5+1)
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toBe(100);                        // 首跳全额
    // 刺入 DoT：隔拍 ×0.15（immune[owner]=1 档 :14060-14062）
    const dotCount = hits.length;
    for (let t = 0; t < 10; t++) n.fixedUpdate(1, game);
    expect(hits.length).toBeGreaterThan(dotCount);
    expect(hits[hits.length - 1]).toBe(15);           // trunc(100×0.15)
  });

  it('钉 514 撞块弹开（:18931-18941）：ai[0]=1 + 速度归一×3，AI 侧 ×0.6/t 衰减', () => {
    const w = emptyWorld();
    for (let y = 35; y <= 45; y++) w.store.setTileSilent(30, y, 1, 0, 0);
    const game = makeGame(w);
    const n = new Arrow(26 * TILE, 40 * TILE, 4, 0, 100, 0, 514, null, {});
    for (let t = 0; t < 20 && n.nailAi0 === 0; t++) n.fixedUpdate(1, game);
    expect(n.nailAi0).toBe(1);
    const sp0 = Math.hypot(n.vx, n.vy);
    expect(sp0).toBeCloseTo(3, 6);                    // 归一 ×3
    n.fixedUpdate(1, game);
    expect(Math.hypot(n.vx, n.vy)).toBeCloseTo(sp0 * 0.6, 9);   // :33454 ×0.6
  });

  it('刺炮弹 246：alpha −20/t 渐显 + 60 子步后 vy+0.15（:58105-58114）', () => {
    const game = makeGame(emptyWorld());
    const s = new Arrow(10 * TILE, 40 * TILE, 6, 0, 17, 1, 246, null, { extraUpdates: 0 });
    expect(s.alpha).toBe(255);
    s.fixedUpdate(1, game);
    expect(s.alpha).toBe(235);
    for (let t = 0; t < 58; t++) s.fixedUpdate(1, game);   // age 累计 59
    expect(s.vy).toBe(0);
    s.fixedUpdate(1, game);                                // age 60 → +0.15
    expect(s.vy).toBeCloseTo(0.15, 9);
  });

  it('糖果玉米 311：alpha −50/t 渐显 + 30 拍后 vy+0.5（:58116-58132）+ 同敌 10t 冷却', () => {
    const game = makeGame(emptyWorld());
    const c = new Arrow(10 * TILE, 40 * TILE, 6, 0, 9, 1.5, 311, null, { extraUpdates: 0 });
    expect(c.alpha).toBe(255);
    c.fixedUpdate(1, game);
    expect(c.alpha).toBe(205);
    for (let t = 0; t < 28; t++) c.fixedUpdate(1, game);
    expect(c.vy).toBe(0);
    c.fixedUpdate(1, game);                                // 第 30 拍 → +0.5
    expect(c.vy).toBeCloseTo(0.5, 9);
  });
});

// ================= ⑤ 冰霜甲×爆炸 =================

describe('备案遗留⑤ 冰霜甲×爆炸（StatusNPC :11524-11527）', () => {
  function boomShell(frostBurn: boolean, enemies: unknown[]) {
    const g = Object.create(Game.prototype) as unknown as {
      world: World; entities: { enemies: unknown[]; npcs: unknown[]; critters: unknown[] };
      player: unknown; spawnParticles: () => void; addDamageNumber: () => void;
      playSfxFiles: () => void; playSfx: () => void; net?: unknown; remotePlayerProxies?: unknown[];
    };
    g.world = new World(40, 40, 20, 'boom');
    g.entities = { enemies, npcs: [], critters: [] };
    g.spawnParticles = () => {};
    g.addDamageNumber = () => {};
    g.playSfxFiles = () => {};
    g.playSfx = () => {};
    g.net = undefined;
    g.remotePlayerProxies = [];
    (g as unknown as { scene: unknown }).scene = {};
    g.player = {
      cx: -9999, cy: -9999, w: 12, h: 28, dead: true, hp: 100, maxHp: 100,
      equipStats: { frostBurn },
      damage: () => {}, iframes: 0,
    };
    return g;
  }

  const mkBoomEnemy = (tx: number, ty: number) => ({
    x: tx * TILE - 8, y: ty * TILE - 8, w: 16, h: 16, cx: tx * TILE, cy: ty * TILE,
    dead: false, vanillaId: null, def: {},
    hp: 100, maxHp: 100,
    hurt: () => true,
    frostburn2T: undefined as number | undefined,
  });

  it('冰霜甲在身：爆炸敌伤结算触发 Frostburn2(324) 5-14s（:11524-11527 Next(5,15)）', () => {
    const e = mkBoomEnemy(20, 20);
    const g = boomShell(true, [e]);
    (g as unknown as { explodeAt: (...a: unknown[]) => void })
      .explodeAt(20, 20, 100, 0, false, 64, 0, 28);
    expect(e.frostburn2T).toBeDefined();
    expect(e.frostburn2T!).toBeGreaterThanOrEqual(5);
    expect(e.frostburn2T!).toBeLessThanOrEqual(14);
  });

  it('无冰霜甲：同爆炸不触发（frostBurn 门）', () => {
    const e = mkBoomEnemy(20, 20);
    const g = boomShell(false, [e]);
    (g as unknown as { explodeAt: (...a: unknown[]) => void })
      .explodeAt(20, 20, 100, 0, false, 64, 0, 28);
    expect(e.frostburn2T).toBeUndefined();
  });
});

// ================= ⑥ 箭袋 stack 公式 =================

describe('备案遗留⑥ 箭袋 stack 公式（Pl.cs:3966 bowEffectiveDamage）', () => {
  it('stack 段乘装备远程乘区（rangedMultDamage）而非 arrowMult²：Archery 下 stack 贡献 0.11', () => {
    // (rangedDamage/rangedMult + stack)×rangedMult×arrow，无枯萎时 rangedMult=1：
    //   = (rangedDamage + 0.1)×1.1 —— stack 只乘 arrowMult 一次
    // 旧码 (rangedDamage + 0.1×1.1)×1.1 = stack 段 ×arrowMult²（0.121）
    const base = 1.0;          // rangedDamage 全链（无装备加成）
    const stack = 0.1;
    const arrow = 1.1;         // Archery
    const want = (base / 1 + stack) * 1 * arrow;
    expect(want).toBeCloseTo(base * arrow + stack * arrow, 9);
    expect(stack * arrow).toBeCloseTo(0.11, 9);            // 原版 stack 贡献
    expect(stack * arrow * arrow).toBeCloseTo(0.121, 9);   // 旧码 stack 贡献（×arrowMult²）
  });
});
