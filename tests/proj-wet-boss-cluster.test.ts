// 弹幕通用湿段接入·boss/敌对弹簇回归（2026-09-06 溅花缺口清偿战役第三批）：
// bossAI_duke_moonlord(385/384/386/456/455) / bossAI_dd2(674/686/687/681/683) /
// bossAI_lategame(490/464/465/919/923) / bossAI_lunar_misc(526/539/574/578/579) /
// bossAI_martian(447) / BombSkeletronPrimeProj(102) / InfernoHostileBlast(292) /
// LunarNebula(634/635/645) 逐类接 projectileWetSection 共享体（P.cs:16903-17113）。
//  · 非豁免 id：入水溅花 10 粒（水档尘 33）+ Splash_1 + 湿旗跃迁
//  · 豁免 id（SetDefaults ignoreWater=true 逐 id 锚 P.cs 行号,见各字段块头）：段门
//    恒闭零行为（零溅花/零湿旗）
//  · 阻尼：tileCollide=true 宿主位移乘档（速度场不减）;tileCollide=false 宿主湿态
//    位移 = :16870 AI 前 velocity 快照（无阻尼滞后一子步 quirk,YoyoProj 回收态先例）;
//    锚定/零速/早退表宿主不适用（N/A 定谳注在各类字段块头）
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { DukeSharknadoBolt, DukeSharknadoTornado, MoonLeechProj, MLDeathray } from '../src/entities/bossAI_duke_moonlord';
import { DD2HealPulse, DD2BetsyFireball, BetsyBreath, DD2GoblinBomb, DD2OgreSmash } from '../src/entities/bossAI_dd2';
import { CultistRitualCircle, IceMistCloud, LightningOrb, FairyQueenLance, SunDanceBeam } from '../src/entities/bossAI_lategame';
import { TabletShardProj, LunarOrb, VortexPortalProj } from '../src/entities/bossAI_lunar_misc';
import { MartianDeathray } from '../src/entities/bossAI_martian';
import { BombSkeletronPrimeProj } from '../src/entities/BombSkeletronPrimeProj';
import { InfernoHostileBlast } from '../src/entities/InfernoHostileBlast';
import { NebulaBlazeBolt, LunarFlareStar } from '../src/entities/LunarNebula';
import type { GameHooks } from '../src/entities/types';
import type { Enemy } from '../src/entities/Enemy';

interface DustCall { type: number; x: number; y: number }
const SPLASH_WATER_DUST = 33;   // dustWaterFor(0)=33（renderer.waterStyle 缺省 0）

/** 水 = 格(18,20) = px[288,304)×[320,336)。liquidType=1（WATER,原版 +1 编码禁裸 0）。
 *  仓高 120：Wet/LavaCollision 扫描窗带 min(st.h-40) 狱底钳（80 行 > 20 行 ✔）。 */
function makeWorld(): World {
  const w = new World(60, 120, 7, 'wet-boss-test');
  return w;
}
function setWater(w: World, tx = 18, ty = 20): void {
  const st = w.store;
  st.liquid[st.idx(tx, ty)] = 255;
  st.liquidType[st.idx(tx, ty)] = 1;
}

function makeGame(world: World) {
  const dusts: DustCall[] = [];
  const sfx: string[] = [];
  const game = {
    world,
    player: { x: 0, y: 0, w: 20, h: 42, cx: 10, cy: 21, vx: 0, vy: 0, hp: 400, maxHp: 400, dead: true, buffs: { apply: () => {}, has: () => false } },
    enemies: () => [] as Enemy[],
    npcs: () => [],
    critters: () => [],
    candidatePlayers: () => [],
    entities: { projectiles: [], add: () => {} },
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => null,
    spawnParticles: () => {},
    spawnBurst: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number) => {
      dusts.push({ type, x: _x, y: _y });
      return { vx: 0, vy: 0, scale: 1, alpha: 0, color: null as unknown };
    },
    vanillaDust: undefined,
    playSfx: () => {},
    playSfxFile: () => {},
    playSfxFiles: () => {},
    playSfxWav: (name: string) => { sfx.push(name); },
    startTrackedLoop: () => null,
    addLightAt: () => {},
    onProjectileDeath: () => {},
    explodePrimeBomb102: () => {},
    notifyInventoryChanged: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { game, dusts, sfx };
}
const splashDusts = (dusts: DustCall[]) => dusts.filter((d) => d.type === SPLASH_WATER_DUST);
const splashed = (dusts: DustCall[], sfx: string[]) =>
  `${splashDusts(dusts).length} 粒水尘 / Splash_1×${sfx.filter((s) => s === 'Splash_1').length}`;

// =====================================================================
// bossAI_duke_moonlord.ts
// =====================================================================
describe('DukeSharknadoBolt 385（P.cs:4678-4686 无 ignoreWater → 受段;tileCollide=true → 阻尼适用）', () => {
  it('入水溅花 10 粒 + Splash_1 + 湿旗跃迁;水中位移 ×0.5（湿旗读法:入水拍 AI 读上拍旗 → 不 Kill）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    // 中心锚 (297,314) → 盒 [282,312)×[299,329);湿探针 [292,302)×[307,322) 触水带,
    // 中心格 (18,19) 干 → 既有中心格液面 Kill 判不触发
    const b = new DukeSharknadoBolt(297, 100, 4, 2, true, false, {} as Enemy, { dead: true } as never);
    b.fixedUpdate(1 / 60, game);                       // 干位首拍 = 出生预置
    expect(b.presetDone).toBe(true);
    expect(b.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    const x0 = (b as unknown as { x: number }).x;
    const y0 = (b as unknown as { y: number }).y;
    (b as unknown as { x: number }).x = 282;           // 盒 [282,312)×[299,329)（中心 297,314）
    (b as unknown as { y: number }).y = 299;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);        // 弹面 10 粒（共享体 wetSplashStepShared）
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    const dx = (b as unknown as { x: number }).x - 282;
    const dy = (b as unknown as { y: number }).y - 299;
    expect(dx).toBeCloseTo(2, 10);                     // 4 × 0.5（大弹追踪支被 dead 目标短路 → vx0/vy0 不变）
    expect(dy).toBeCloseTo(1, 10);                     // 2 × 0.5
    void x0; void y0;
  });
});

describe('DukeSharknadoTornado 384/386（P.cs:4672/:4694 ignoreWater=true → 豁免）', () => {
  it('水带原位 tick：零溅花零湿旗（段门恒闭）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const t = new DukeSharknadoTornado(297, 329, false, {} as Enemy);
    t.fixedUpdate(1 / 60, game);
    expect(t.presetDone).toBe(true);
    expect(t.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
});

describe('MoonLeechProj 456（P.cs:5283-5293 无 ignoreWater → 受段;tileCollide=false → 湿位移走 :16870 AI 前快照）', () => {
  it('入水溅花 10 粒;湿态位移 = AI 前快照（非本拍重算速度,滞后一子步 quirk）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const src = { id: 7, dead: false, cx: 500, cy: 300, x: 492, y: 300 } as unknown as Enemy;
    const tgt = { cx: 200, cy: 200, dead: false, buffs: { apply: () => {} } };
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [src];
    const m = new MoonLeechProj(src, tgt as never);
    m.fixedUpdate(1 / 60, game);                       // 干位首拍（src 额前 (0,+216)）
    expect(m.wet).toBe(false);
    const v1x = (m as unknown as { vx: number }).vx;   // tick1 末速 = tick2 AI 前快照
    const x0 = (m as unknown as { x: number }).x;
    (m as unknown as { x: number }).x = 290;           // 盒 [290,306)×[313,329) → 探针 [293,303)×[317,325) 触水
    (m as unknown as { y: number }).y = 313;
    dusts.length = 0; sfx.length = 0;
    m.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(m.wet).toBe(true);
    const dx = (m as unknown as { x: number }).x - 290;
    expect(dx).toBeCloseTo(v1x, 9);                    // 湿位移 = AI 前快照（290±往返浮点噪声 <1e-9）
    const recompute = (m as unknown as { vx: number }).vx;
    expect(recompute).not.toBe(v1x);                   // 目标在左侧/水位于右侧 → 重算速必异（守卫）
  });
});

describe('MLDeathray 455（P.cs:5272-5282 无 ignoreWater → 受段;aiStyle84 早退表+锚定 → 阻尼 N/A）', () => {
  it('束原点入水溅花 10 粒;湿态位置恒 = 锚定位（无位移宿主）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const src = { id: 9, dead: false, vanillaId: 396, ai0: 0, cx: 297, cy: 100, lai0: 0, lai1: 1, targetRef: () => null } as unknown as Enemy;
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [src];
    const d = new MLDeathray(src, 'head', 0, 0, 50);
    d.fixedUpdate(1 / 60, game);                       // 干位首拍（锚 = src 心 + 椭圆偏移）
    expect(d.wet).toBe(false);
    (src as unknown as { cy: number }).cy = 320;       // 锚随源入水
    dusts.length = 0; sfx.length = 0;
    d.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(d.wet).toBe(true);
    expect((d as unknown as { x: number }).x).toBe(297 - 18);   // 恒 = 锚定位（src.cx − w/2 + 椭圆 0）
    expect((d as unknown as { y: number }).y).toBe(320 + 0 - 18);
  });
});

// =====================================================================
// bossAI_dd2.ts
// =====================================================================
describe('DD2 湿段（674/683 豁免;686/681 受段+阻尼;687 受段锚定）', () => {
  it('674 DD2HealPulse（P.cs:7216 ignoreWater=true）水带 tick 零溅花', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const h = new DD2HealPulse(297, 329);
    h.fixedUpdate(1 / 60, game);
    expect(h.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });

  it('683 DD2OgreSmash（P.cs:7291 ignoreWater=true）水带 tick 零溅花', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const o = new DD2OgreSmash(297, 329, 40);
    o.fixedUpdate(1 / 60, game);
    expect(o.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });

  it('686 DD2BetsyFireball（P.cs:7307-7316 无 ignoreWater → 受段）入水溅 10 粒 + 位移 ×0.5（AI 后速度 ×档）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const f = new DD2BetsyFireball(game, 297, 100, 4, 0, 35);
    f.fixedUpdate(1 / 60, game);                       // 干位首拍:vx×0.99 → 3.96,位移 3.96
    expect(f.wet).toBe(false);
    const dryDx = (f as unknown as { x: number }).x - (297 - 15);
    expect(dryDx).toBeCloseTo(4 * 0.99, 10);
    (f as unknown as { x: number }).x = 282;           // 中心 297 → 盒 [282,312)×[y,y+30)
    (f as unknown as { y: number }).y = 299;           // 探针 [292,302)×[307,322) 触水
    dusts.length = 0; sfx.length = 0;
    f.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(f.wet).toBe(true);
    const dx = (f as unknown as { x: number }).x - 282;
    expect(dx).toBeCloseTo(4 * 0.99 * 0.99 * 0.5, 10); // (vx×0.99^2) × 0.5（重力支 tA<10 不加 vy）
  });

  it('681 DD2GoblinBomb（P.cs:7265-7273 无 ignoreWater → 受段）入水溅 10 粒 + 位移 ×0.5', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const b = new DD2GoblinBomb(297, 100, 4, 0, 30);
    b.fixedUpdate(1 / 60, game);                       // 干位首拍
    expect(b.wet).toBe(false);
    const dryDx = (b as unknown as { x: number }).x - (297 - 7);
    expect(dryDx).toBeCloseTo(4, 10);
    (b as unknown as { x: number }).x = 290;           // 盒 [290,304)×[322,336) → 探针 [292,302)×[322,336) 触水
    (b as unknown as { y: number }).y = 322;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    const dx = (b as unknown as { x: number }).x - 290;
    expect(dx).toBeCloseTo(2, 10);                     // 4 × 0.5（ai0=2 ≤5 重力门未开,vy=0）
  });

  it('687 BetsyBreath（P.cs:7317-7326 无 ignoreWater → 受段）焰心锚入水溅 10 粒;位置恒 = 嘴部锚（阻尼 N/A）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const src = { id: 3, dead: false, cx: 195, cy: 100, facing: 1, visAngle: 0 } as unknown as Enemy;
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [src];
    const br = new BetsyBreath(src, 35);
    br.fixedUpdate(1 / 60, game);                      // 干位首拍（锚 = src 心 + (102,30)）
    expect(br.wet).toBe(false);
    (src as unknown as { cy: number }).cy = 300;       // 锚 (297,330) 入水（探针 [292,302)×[323,338)）
    dusts.length = 0; sfx.length = 0;
    br.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(br.wet).toBe(true);
    expect((br as unknown as { x: number }).x).toBe(297 - 15);  // 恒 = 嘴部锚（AI 写位,无位移宿主）
    expect((br as unknown as { y: number }).y).toBe(330 - 15);
  });
});

// =====================================================================
// bossAI_lategame.ts（五类全豁免——逐 id P.cs 行号见各字段块头）
// =====================================================================
describe('bossAI_lategame 豁免簇（490/464/465/919/923）水带 tick 零溅花零湿旗', () => {
  it('490 CultistRitualCircle（P.cs:5664）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const c = new CultistRitualCircle({ id: 99 } as Enemy);
    c.fixedUpdate(1 / 60, game);
    expect(c.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
  it('464 IceMistCloud 母云（P.cs:5362）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const m = new IceMistCloud(297, 329, 4, 0, 35, true);
    m.fixedUpdate(1 / 60, game);
    expect(m.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
  it('465 LightningOrb（P.cs:5391）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const o = new LightningOrb(297, 329, 45);
    o.fixedUpdate(1 / 60, game);
    expect(o.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
  it('919 FairyQueenLance（P.cs:8727）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const l = new FairyQueenLance(297, 329, 0, 0, 40);
    l.fixedUpdate(1 / 60, game);
    expect(l.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
  it('923 SunDanceBeam（P.cs:8770）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const s = new SunDanceBeam(297, 329, 0, 1, 50, false);
    s.fixedUpdate(1 / 60, game);
    expect(s.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
});

// =====================================================================
// bossAI_lunar_misc.ts
// =====================================================================
describe('TabletShardProj 526（P.cs:5964-5972 无 ignoreWater → 受段;tileCollide=false → 湿位移走快照）', () => {
  it('入水溅花 10 粒;湿态位移 = AI 前快照', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const t = new TabletShardProj(290, 100, 3, 1, 2000, 100);
    t.fixedUpdate(1 / 60, game);
    expect(t.wet).toBe(false);
    const v1x = (t as unknown as { vx: number }).vx;
    (t as unknown as { x: number }).x = 290;           // 盒 [290,298)×[315,323) → 探针 [290,298)×[317,321) 触水
    (t as unknown as { y: number }).y = 315;
    dusts.length = 0; sfx.length = 0;
    t.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(t.wet).toBe(true);
    const preVx = v1x;                                  // tick2 AI 前快照
    const dx = (t as unknown as { x: number }).x - 290;
    expect(Math.abs(dx - preVx)).toBeLessThan(1e-9);    // 湿位移 = 快照（AI 已把速度 lerp 向 +15 追踪向）
  });
});

describe('LunarOrb 539/574（P.cs:6144-6152/6241-6249 均无 ignoreWater → 受段;539 阻尼适用/574 走快照）', () => {
  function makeParent(): Enemy {
    // 父体静止（x==prevX → 跟随差 0）;cx=520 ≠ 弹心 → 盘旋 sign 速度编辑 +0.15 可观察
    return { id: 5, dead: false, cx: 520, cy: 200, x: 520, y: 200, prevX: 520, prevY: 200, targetRef: () => null } as unknown as Enemy;
  }
  it('539 入水溅花 + 速度积分 ×0.5（父体跟随直写位移不受阻尼,原版同构）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const parent = makeParent();
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [parent];
    const o = new LunarOrb(parent, 539, 2, 0, 60, 300, 190);   // 显式出生 (291,175) 干位
    o.fixedUpdate(1 / 60, game);
    expect(o.wet).toBe(false);
    const dryDx = (o as unknown as { x: number }).x - 291;
    expect(dryDx).toBeCloseTo(2.15, 10);               // 父差 0 + post-AI vx(2+0.15)×1
    (o as unknown as { x: number }).x = 291;           // 盒 [291,309)×[305,335) → 探针 [295,305)×[313,328) 触水
    (o as unknown as { y: number }).y = 305;
    dusts.length = 0; sfx.length = 0;
    o.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(o.wet).toBe(true);
    const dx = (o as unknown as { x: number }).x - 291;
    expect(dx).toBeCloseTo(2.3 * 0.5, 10);             // post-AI vx(2.15+0.15)×0.5（父差 0）
  });
  it('574 入水溅花 + 湿态位移 = AI 前快照（tileCollide=false quirk）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const parent = makeParent();
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [parent];
    const o = new LunarOrb(parent, 574, 2, 0, 0, 300, 200);    // 显式出生 (291,191) 干位
    o.fixedUpdate(1 / 60, game);
    expect(o.wet).toBe(false);
    const v1x = (o as unknown as { vx: number }).vx;   // 2.15（AI 已 +0.15）
    (o as unknown as { x: number }).x = 291;           // 盒 [291,309)×[311,329) → 探针 [295,305)×[316,325) 触水
    (o as unknown as { y: number }).y = 311;
    dusts.length = 0; sfx.length = 0;
    o.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(o.wet).toBe(true);
    const dx = (o as unknown as { x: number }).x - 291;
    expect(dx).toBeCloseTo(v1x, 9);                    // 湿位移 = AI 前快照 2.15（本拍 AI 重算 = 2.3）
    expect((o as unknown as { vx: number }).vx).toBeCloseTo(2.3, 9);
  });
});

describe('VortexPortalProj 578/579（P.cs:6291 ignoreWater=true → 豁免）', () => {
  it('水带 tick 零溅花零湿旗', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const p = new VortexPortalProj(297, 329, 578);
    p.fixedUpdate(1 / 60, game);
    expect(p.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
});

// =====================================================================
// bossAI_martian.ts
// =====================================================================
describe('MartianDeathray 447（P.cs:5198 ignoreWater=true → 豁免）', () => {
  it('水带 tick 零溅花零湿旗', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const src = { id: 11, dead: false, vanillaId: 395, ai0: 2, ai3: 60, cx: 297, cy: 260, master: null, targetRef: () => null } as unknown as Enemy;
    (game as unknown as { enemies: () => Enemy[] }).enemies = () => [src];
    const d = new MartianDeathray(src, 50);
    d.fixedUpdate(1 / 60, game);
    expect(d.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
  });
});

// =====================================================================
// BombSkeletronPrimeProj.ts
// =====================================================================
describe('BombSkeletronPrimeProj 102（P.cs:1898-1905 无 ignoreWater → 受段;tileCollide=true → 阻尼适用）', () => {
  it('入水溅花 10 粒 + moveAndCollide 位移入参 ×0.5（撞墙响应仍读未阻尼速度场）', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const b = new BombSkeletronPrimeProj(297, 200, 4, 4);
    b.fixedUpdate(1 / 60, game);                       // 干位首拍（vy=4 → 落地引信钳不触发）
    expect(b.wet).toBe(false);
    const dryDx = (b as unknown as { x: number }).x - (297 - 11);
    expect(dryDx).toBeCloseTo(4, 10);
    (b as unknown as { x: number }).x = 286;           // 盒 [286,308)×[317,339) → 探针 [292,302)×[323,334) 触水
    (b as unknown as { y: number }).y = 317;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    const dx = (b as unknown as { x: number }).x - 286;
    const dy = (b as unknown as { y: number }).y - 317;
    expect(dx).toBeCloseTo(2, 10);                     // 4 × 0.5（ai0=2 ≤5 重力门未开）
    expect(dy).toBeCloseTo(2, 10);
  });
});

// =====================================================================
// InfernoHostileBlast.ts
// =====================================================================
describe('InfernoHostileBlast 292（P.cs:3817-3827 无 ignoreWater → 受段;零速钉地 → 阻尼 N/A）', () => {
  it('干位出生后水漫入爆区 → 溅花 10 粒;位置恒钉死（UpdatePosition 两支位移均 0）', () => {
    const w = makeWorld();
    const { game, dusts, sfx } = makeGame(w);
    const b = new InfernoHostileBlast(297, 200, 30);   // 盒 [232,362)×[135,265) 干位
    b.fixedUpdate(1 / 60, game);
    expect(b.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    setWater(w, 18, 11);                               // 水 px[288,304)×[176,192) 漫入探针 [292,302)×[168,233)
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    expect((b as unknown as { x: number }).x).toBe(297 - 65);  // 位置恒钉死
    expect((b as unknown as { y: number }).y).toBe(200 - 65);
  });
});

// =====================================================================
// LunarNebula.ts
// =====================================================================
describe('NebulaBlazeBolt 634/635（P.cs:6825 634 ignoreWater=true 豁免;635 :6829-6839 无行 → 受段）', () => {
  it('634 水带逐子步零溅花（豁免段门恒闭）+ 位移不阻尼', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const b = new NebulaBlazeBolt(275, 310, 4, 0, 50, 6, 634);   // 盒 [275,315)×[310,350) → 探针 [290,300)×[320,330) 在水带
    (b as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;   // 隔离出手散射随机面
    b.fixedUpdate(1 / 60, game);
    expect(b.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(0);
    const dx = (b as unknown as { x: number }).x - 275;
    expect(dx).toBeCloseTo(12, 10);                    // 3 子步 × 4（extraUpdates=2 → 3 子步）,不阻尼
  });
  it('635 入水溅花 10 粒（子步 1 触发一次）+ 子步位移 ×0.5', () => {
    const w = makeWorld(); setWater(w);
    const { game, dusts, sfx } = makeGame(w);
    const b = new NebulaBlazeBolt(275, 100, 4, 0, 50, 6, 635);
    (b as unknown as { birthSpreadDone: boolean }).birthSpreadDone = true;
    b.fixedUpdate(1 / 60, game);
    expect(b.wet).toBe(false);
    const dryDx = (b as unknown as { x: number }).x - 275;
    expect(dryDx).toBeCloseTo(16, 10);                 // 4 子步 × 4（extraUpdates=3 → 4 子步,P.cs:6837+:16780）
    (b as unknown as { x: number }).x = 275;           // 盒 [275,315)×[310,350) → 探针 [290,300)×[320,330) 触水
    (b as unknown as { y: number }).y = 310;
    dusts.length = 0; sfx.length = 0;
    b.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);        // 仅子步 1 入水溅一次
    expect(sfx.filter((s) => s === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    const dx = (b as unknown as { x: number }).x - 275;
    expect(dx).toBeCloseTo(8, 10);                     // 4 子步 × 4 × 0.5（逐子步阻尼档,子步 1 置旗）
  });
});

describe('LunarFlareStar 645（P.cs:6955-6967 无 ignoreWater → 受段;过线前 tileCollide=false/过线后 true）', () => {
  it('下落穿水：过线前湿阻尼不适用（dry 位移恒 24/拍）,过线且触水拍 22（5×4+4×0.5）+ 溅花一次', () => {
    const w = makeWorld(); setWater(w, 18, 20);
    const { game, dusts, sfx } = makeGame(w);
    // 出生 (290,220)、目标线 ai1=240（构造钳 ≥ startY+20）、vy=4、6 子步/拍
    // 探针 = [x,x+10)×[y+3,y+8)（10² 盒 num=10/num2=5）→ x=290 落水带列 [288,304)
    const s = new LunarFlareStar(290, 220, 0, 4, 50, 6, 240);
    for (let t = 1; t <= 4; t++) {
      const y0 = (s as unknown as { y: number }).y;
      s.fixedUpdate(1 / 60, game);
      const dy = (s as unknown as { y: number }).y - y0;
      expect(dy).toBeCloseTo(24, 10);                  // 拍 1-4 干态（探针带 [y+3,y+8) 未触 [320,336)）
    }
    expect(s.wet).toBe(false);
    expect(splashDusts(dusts).length).toBe(0);
    // 拍 5 子步 1：pre-y=316 → 探针 [319,324) 触水带 [320,336) → 溅花 + collide(316>240) → 位移 ×0.5
    const y4 = (s as unknown as { y: number }).y;      // = 220+96 = 316
    dusts.length = 0; sfx.length = 0;
    s.fixedUpdate(1 / 60, game);
    expect(splashDusts(dusts).length).toBe(10);
    expect(sfx.filter((s2) => s2 === 'Splash_1').length).toBe(1);
    expect(s.wet).toBe(true);
    const dy5 = (s as unknown as { y: number }).y - y4;
    expect(dy5).toBeCloseTo(12, 10);                   // 子步1 4×0.5 + 子步2-6 各 2 = 12
    void y4;
  });
});
