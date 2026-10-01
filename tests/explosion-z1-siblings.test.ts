// SW-Z1 2026-09-04 爆炸面/弹道小尾四件回归：①液体火箭 I/III/IV 兄弟型扩表（Kill :79465-79628 四族支逐参,
//  族内唯音逐变体差异）②Prime 102 hostile 爆炸城镇半边（Damage_PVE_Inner :12626/:12631 + :47668-72）③激光臂拍序（:28958/:29074-75/:29153-54）。
// SW-AA1 2026-09-04 ④F-1 水晶受害者链（friendly 敌怪半边 548,:12626 flag2 + NPC.cs:16026-16052）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, LIQUID_ROCKET_IDS, LIQUID_ROCKET_II_IDS, LIQUID_ROCKET_DUST } from '../src/core/Game';
import { TownNPC } from '../src/entities/TownNPC';
import { Enemy } from '../src/entities/Enemy';
import { laserArmShotInterval } from '../src/entities/bossAI';
// 四族支逐参（尘型/首粒 scale+noGravity/次粒 scale;vel 恒首 7/次 4,水族首末粒 velY−1.2）
const FAMILY = [
  { ids: [784, 785, 786, 805, 903], dust: 'water' as const, f: [2.2, true], s: 1.3 },
  { ids: [787, 788, 789, 806, 904], dust: 35, f: [1.2, false], s: 0.3 },
  { ids: [790, 791, 792, 807, 905], dust: 152, f: [2.2, false], s: 1.3 },
  { ids: [799, 800, 801, 810, 906], dust: 31, f: [1.2, false], s: 0.3 },
];
const mkGame = (world: World) => {
  const g = Object.create(Game.prototype) as Record<string, any>;
  g.world = world;
  g.player = { cx: 60 * 16, cy: 60 * 16, w: 20, h: 42, equipStats: {}, luck: 0, lastDamageCause: null, addDPS: () => {} };   // SW-AA1:水晶支 Enemy.hurt fromPlayer 面 DPS 口
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.dmgNumbers = []; g.particles = []; g._bannerNpcs = new Set();   // 旗覆盖集空=无旗档
  g._particleFree = [];   // ★X2 补桩（2026-10-01）:粒子池化（744b0ad0）类字段壳上不初始化,受击血粒子 acquireParticle 需要池
  g.sfx = { playFiles: () => true };   // TownNPC.hurt 受击音口（playSfxFiles 消费面）
  g.sfxAt = () => {}; g.damagePlayer = () => 0; g.recLog = () => {};
  return g;
};
describe('SW-Z1 ①液体火箭全族尘表（Kill :79465-79628）', () => {
  it('20 型=四族支 id 逐字并集;族内尘参共形、逐变体差异唯音（II 集仍 4 型 Item62 门）', () => {
    expect(LIQUID_ROCKET_IDS.size).toBe(20);
    expect([...LIQUID_ROCKET_IDS].sort((a, b) => a - b)).toEqual(FAMILY.flatMap((f) => f.ids).sort((a, b) => a - b));
    for (const fam of FAMILY) for (const id of fam.ids) expect(LIQUID_ROCKET_DUST[id]).toEqual({
      dust: fam.dust,
      first: { scale: fam.f[0], noGravity: fam.f[1], up: fam.f[1] ? 1.2 : 0, vel: 7 },
      second: { scale: fam.s, noGravity: false, up: fam.f[1] ? 1.2 : 0, vel: 4 }, });
    expect([...LIQUID_ROCKET_II_IDS].every((id) => LIQUID_ROCKET_IDS.has(id))).toBe(true);
    expect(LIQUID_ROCKET_II_IDS.size).toBe(4);   // 音门 II 集不扩,I/III/IV 落 Item14
  });
});
describe('SW-Z1 ②Prime 102 hostile 爆炸城镇半边（:12626/:12631 + :47668-47672）', () => {
  it('128²盒×DV(40)×kb8:盒内受击/bound 无豁免/盒外·已死零伤;真链防御减算', () => {
    const g = mkGame(new World(48, 48, 7, 'z1')), px = 400, py = 400, mk = () => new TownNPC('guide', 0, 0);
    const place = (tn: TownNPC, dx: number, dy: number) => { tn.x = px + dx - tn.w / 2; tn.y = py + dy - tn.h / 2; };
    const spyOf = (tn: TownNPC) => { const s: number[][] = []; tn.hurt = ((d: number, kx: number, ky: number) => { s.push([d, kx, ky]); return true; }) as typeof tn.hurt; return s; };
    const [inA, inB, outC, deadD, boundE] = [mk(), mk(), mk(), mk(), mk()];
    place(inA, 30, 20); place(inB, -40, -30); place(outC, 200, 0); place(deadD, 0, 0); place(boundE, 10, -10);
    boundE.bound = true; deadD.dead = true;   // 原版链无 bound 豁免支→照收;dead 零伤
    g.entities.npcs = [inA, inB, outC, deadD, boundE];
    const sA = spyOf(inA), sE = spyOf(boundE);
    g.explodePrimeBomb102(24, 24, px, py, 0, false);
    expect(sA).toHaveLength(1);
    expect(sA[0][0]).toBeGreaterThanOrEqual(34); expect(sA[0][0]).toBeLessThanOrEqual(46);  // DV(40) ±15%
    expect(sA[0][1]).toBe(8); expect(sA[0][2]).toBe(0);   // PREPARE_BOMB_KB[102],盒心右 → +8/kby=0
    expect(sE).toHaveLength(1); expect(outC.hp).toBe(outC.maxHp); expect(deadD.hp).toBe(deadD.maxHp);
    const drop = inB.maxHp - inB.hp;               // 真链:DV→TownNPC.hurt(guide def30 → −15 截断)
    expect(drop).toBeGreaterThanOrEqual(19); expect(drop).toBeLessThanOrEqual(31);          // 34..46−15
  }); });
describe('SW-Z1 ③激光臂拍序（NPC.cs:28958/:29074-29075/:29153-29154）', () => {
  it('attached 201t / 头旋 ⌈201/4⌉=51t / detached 81t（无旋加成）', () => {
    expect(laserArmShotInterval(false, false)).toBe(201);   // localAI++ 先加后判 >200f
    expect(laserArmShotInterval(true, false)).toBe(51);     // +=3 与 ++ 叠加 4/t:4k>200 → k=51
    expect(laserArmShotInterval(false, true)).toBe(81); expect(laserArmShotInterval(true, true)).toBe(81); // detached 无旋加成
  }); });
describe('SW-AA1 2026-09-04 F-1：Prime 102 friendly 敌怪半边（DD2 永恒水晶 548）', () => {
  it('128²盒×DV(40) 真链掉血（def14→−7）;盒外/胜利演出 dontTakeDamage 零伤;549 传送门不在受害集', () => {
    const g = mkGame(new World(48, 48, 7, 'aa1')), px = 400, py = 400;
    g.addDamageNumber = () => {};   // Enemy.hurt 飘值单点（真实链）
    const inA = Enemy.fromVanilla(548, 0, 0)!, outB = Enemy.fromVanilla(548, 0, 0)!;
    const winC = Enemy.fromVanilla(548, 0, 0)!, portalD = Enemy.fromVanilla(549, 0, 0)!;
    winC.dontTakeDamage = true;                       // :41280 胜利演出 ai[1]==1 置 dontTakeDamageFromHostiles
    const spy: number[][] = [];
    portalD.hurt = ((d: number) => { spy.push([d]); return false; }) as typeof portalD.hurt;
    const place = (e: Enemy, dx: number, dy: number) => { e.x = px + dx - e.w / 2; e.y = py + dy - e.h / 2; };
    place(inA, 30, 20); place(outB, 200, 0); place(winC, 30, 20); place(portalD, 0, 0);   // 40² 盒,半宽 20
    g.entities.enemies = [inA, outB, winC, portalD];
    g.explodePrimeBomb102(24, 24, px, py, 0, false);
    const drop = inA.maxHp - inA.hp;                  // 真链:DV(40)∈[34,46] → CalculateDamageNPCsTake −def×0.5=−7
    expect(drop).toBeGreaterThanOrEqual(27); expect(drop).toBeLessThanOrEqual(39);
    expect(outB.hp).toBe(outB.maxHp); expect(winC.hp).toBe(winC.maxHp);
    expect(spy).toHaveLength(0);                      // 549 LanePortal 非 friendly（:16061-16081）→ 不扫
  }); });
