// SW-BJ33 2026-09-08：公主 663 魔法攻击全链回归（用户实报「怪物身上没有攻击特效,
// 只有凭空受伤害」）。根因=950 魔法阵曾由通用 TownShot 承载——通用命中环「命中即亡」,
// 而 950 是在敌体内出生的 104×104 定点阵（NPC.cs:55367）→ tick1 命中=tick1 亡,零帧可见。
// 原版锚（Terarria1457）：SetDefaults P.cs:8958-8971 / AI_186_PrincessWeapon
// P.cs:43453-43573 / 绘制 Main.cs:28735-28755 / 命中面 Damage_PVE_Inner P.cs:12615
// （penetrate=-1 → :14189 减命支不可达=命中不亡;:14182-14186 NPC.immune[owner]=10 =
// 10t 再命中窗;:13575-13577 damage×0.98 字段逐击衰减）/ 发射端 NPC.cs:55451-55462
// + :55366-55377（落点弹,实心重掷≤5,velocity=0）/ :56064-56080（AttackTime 60 入态）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot, PrincessAuraShot } from '../src/entities/TownShot';
import {
  TOWN_MAGIC, TOWN_ATTACK_TIME, TOWN_ATTACK_TYPE, TOWN_DANGER_RANGE,
} from '../src/data/vanillaTownAttack';
import type { VDust } from '../src/fx/VanillaDust';
import { Inventory } from '../src/items/Inventory';

/** 可切敌 stub（无靶守卫测试用）;enemies 形参支持多敌 */
function makeGame(npc: TownNPC, enemy: { x: number; y: number; w: number; h: number },
  extra: Array<{ x: number; y: number; w: number; h: number }> = []) {
  const world = new World(200, 200, 100, 'bj33');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const shots: TownShot[] = [];
  const dusts: Array<VDust & Record<string, unknown>> = [];
  const enemies = [enemy, ...extra];
  let enemiesOn = true;
  return {
    world, shots, dusts,
    setEnemiesOn(v: boolean) { enemiesOn = v; },
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => (enemiesOn ? enemies : []),
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnDust: (x: number, y: number, w: number, h: number, type: number,
        sx = 0, sy = 0, alpha = 0, color: { r: number; g: number; b: number; a: number } | null = null,
        scale = 1, noGravity = false) => {
        const d = {
          active: true, x, y, vx: sx, vy: sy, type, scale, alpha, fadeIn: 0,
          noGravity, color, rotation: 0,
        } as VDust & Record<string, unknown>;
        dusts.push(d);
        return d;
      },
      spawnParticles: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      addDamageNumber: () => {},
      critters: () => [],
    } as never,
  };
}

interface HurtRec { d: number; kx: number; tick: number }

function makeEnemy(x: number, y: number, id = 7) {
  const rec: { hurts: HurtRec[] } = { hurts: [] };
  const e = {
    x, y, w: 20, h: 40, dead: false, id, damage: 40, def: {} as { friendly?: boolean },
    hurt(d: number, kx: number): boolean { rec.hurts.push({ d, kx, tick: -1 }); return true; },
  };
  return { e, rec };
}

describe('SW-BJ33 公主 663 魔法阵 950（AI_186 域内专类）', () => {
  it(' PrincessAuraShot 命中【不亡】+ 同敌 10t 再命中窗 + ×0.98 逐击衰减（bug 本 face）', () => {
    const world = new World(200, 200, 100, 'bj33');
    const { e, rec } = makeEnemy(100 * 16, 90 * 16);
    const game = makeGame({} as TownNPC, e).game;
    const aura = new PrincessAuraShot(100 * 16 + 10, 90 * 16 + 20, 15, 3, 0);
    let tick = 0;
    const wrappedHurt = e.hurt.bind(e);
    e.hurt = (d: number, kx: number): boolean => {
      const r = wrappedHurt(d, kx);
      rec.hurts[rec.hurts.length - 1].tick = tick;
      return r;
    };
    for (tick = 1; tick <= 59; tick++) aura.fixedUpdate(1 / 60, game);
    // ①核心回归:命中后弹体存活（旧 TownShot 命中即亡=零帧可见）
    expect(rec.hurts.length).toBe(6);                          // 1/11/21/31/41/51 六击
    expect(rec.hurts.map((h) => h.tick)).toEqual([1, 11, 21, 31, 41, 51]);   // 10t 窗
    expect(rec.hurts.map((h) => h.d)).toEqual([15, 14, 13, 12, 11, 10]);     // ×0.98 (int) 截断链
    expect(rec.hurts.every((h) => h.kx === 3)).toBe(true);     // num40=direction=1（Entity.cs:20）→ +3 右推
    expect(aura.dead).toBe(false);                             // 59t 仍活
    aura.fixedUpdate(1 / 60, game);                            // t=60 → AI Kill（:43457-61）
    expect(aura.dead).toBe(true);
    expect(rec.hurts.length).toBe(6);                          // t=60 不再出 7 击
  });

  it('多敌独立免疫窗:同拍重叠双敌各吃首击', () => {
    const world = new World(200, 200, 100, 'bj33');
    const a = makeEnemy(100 * 16, 90 * 16, 1);
    const b = makeEnemy(101 * 16, 90 * 16, 2);
    const game = makeGame({} as TownNPC, a.e, [b.e]).game;
    const aura = new PrincessAuraShot(100 * 16 + 10, 90 * 16 + 20, 15, 3, 0);
    aura.fixedUpdate(1 / 60, game);
    expect(a.rec.hurts.length).toBe(1);
    expect(b.rec.hurts.length).toBe(1);                        // per-enemy immune 槽独立
    expect(aura.dead).toBe(false);                             // 双命中仍不亡（penetrate=-1）
  });

  it('tileCollide=false:阵心埋实心不撞块杀（SetDefaults :8969）', () => {
    const world = new World(200, 200, 100, 'bj33');
    const cx = 100 * 16 + 10, cy = 90 * 16 + 20;
    world.store.setTileSilent(Math.floor(cx / 16), Math.floor(cy / 16), 1);   // 阵心实心
    const { e } = makeEnemy(cx - 10, cy - 20);
    const game = makeGame({} as TownNPC, e).game;
    const aura = new PrincessAuraShot(cx, cy, 15, 3, 0);
    for (let t = 0; t < 10; t++) aura.fixedUpdate(1 / 60, game);
    expect(aura.dead).toBe(false);
  });

  it('AI_186 包络:Opacity 线性淡出 + scale 先胀后收 + d267 双环尘/编排粒子在飞', () => {
    const world = new World(200, 200, 100, 'bj33');
    const { e } = makeEnemy(100 * 16, 90 * 16);
    const { game, dusts } = makeGame({} as TownNPC, e);
    const aura = new PrincessAuraShot(100 * 16 + 10, 90 * 16 + 20, 15, 3, 0);
    const scl: number[] = [];
    for (let t = 1; t <= 59; t++) {
      aura.fixedUpdate(1 / 60, game);
      scl.push(aura.scl);
      if (t === 1) expect(aura.opacity).toBeCloseTo(59 / 60, 5);          // Remap(t,0,60,1,0)
      if (t === 45) expect(aura.scl).toBeGreaterThan(0.9);                // 峰值段（:43469 e2→1,tail 未收）
      if (t === 55) {
        expect(aura.scl).toBeLessThan(0.6);                               // 尾收 (1−Remap(t,45,60)²)
        expect(aura.opacity).toBeLessThan(0.1);
      }
      if (t === 1) expect(aura.scl).toBeGreaterThan(0.4);                 // 出生 0.4 起胀
    }
    // 单调性:前 45t 胀、后 15t 收
    expect(Math.max(...scl.slice(0, 44))).toBeGreaterThan(Math.max(...scl.slice(45)));
    expect(scl[0]).toBeLessThan(scl[43]);
    // 尘:d267 双环 + 白 CloneDust（VanillaDust 267 帝皇蝶尘 face 承载）
    const d267 = dusts.filter((d) => d.type === 267);
    const white = dusts.filter((d) => (d.color as { r: number } | null)?.r === 255
      && (d.color as { g: number } | null)?.g === 255);
    expect(d267.length).toBeGreaterThan(40);                   // ≤2环×3×½×2(白影)×59t 谱内
    expect(white.length).toBeGreaterThan(20);
    const colored = d267.find((d) => (d.color as { r: number } | null)?.r === 255
      && (d.color as { g: number } | null)?.g === 0
      && (d.color as { b: number } | null)?.b === 122);
    expect(colored).toBeDefined();                             // hslToRgb(0.92,1,0.5) 色面
  });

  it('发射端:公主入魔法态 → 一次施法恰 5 阵（15/25/35/45/55）,落点在敌盒内,零速', () => {
    const princess = new TownNPC('princess', 100 * 16, 99 * 16, new Inventory());
    const { e } = makeEnemy(104 * 16, 96 * 16);
    const { game, shots } = makeGame(princess, e);
    let entered = -1;
    for (let t = 0; t < 900; t++) {
      e.x = princess.cx + 6 * 16;                              // chase（危检保持,同 town-npc-attack 惯例）
      princess.fixedUpdate(1 / 60, game);
      if (princess.attackState === 14 && entered < 0) entered = t;
      if (entered >= 0) {
        if (princess.attackState !== 14) break;                // 首个施法态窗结束
      }
    }
    expect(entered).toBeGreaterThanOrEqual(0);                 // 入态（AttackType[663]=2 → ai[0]=14）
    const inState = shots.filter((s) => s instanceof PrincessAuraShot);
    expect(inState.length).toBe(5);                            // AttackTime 60 → 15/25/35/45/55
    for (const s of inState) {
      expect(s.projId).toBe(950);
      expect(s.vx).toBe(0); expect(s.vy).toBe(0);              // num63=0（:55451-62 未赋速度）
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;            // 104×104 阵心=落点
      expect(cx).toBeGreaterThanOrEqual(e.x);                  // position+Size×rand(0..1)（:55367）
      expect(cx).toBeLessThanOrEqual(e.x + e.w);
      expect(cy).toBeGreaterThanOrEqual(e.y);
      expect(cy).toBeLessThanOrEqual(e.y + e.h);
    }
  });

  it('发射端无靶守卫（:55366 if(num70!=-1)）:施法中敌消失 → 整拍不出膛不坠本体侧', () => {
    const princess = new TownNPC('princess', 100 * 16, 99 * 16, new Inventory());
    const { e } = makeEnemy(104 * 16, 96 * 16);
    const { game, shots, setEnemiesOn } = makeGame(princess, e);
    let entered = false;
    for (let t = 0; t < 900 && !entered; t++) {
      e.x = princess.cx + 6 * 16;
      princess.fixedUpdate(1 / 60, game);
      if (princess.attackState === 14) entered = true;
    }
    expect(entered).toBe(true);
    setEnemiesOn(false);                                       // 态内敌全灭
    for (let t = 0; t < 120; t++) princess.fixedUpdate(1 / 60, game);
    expect(shots.length).toBe(0);                              // 五个发射拍全部静默（旧实现坠通用支=本体侧出膛）
  });

  it('微光变体 ai2=1 透传（townNpcVariationIndex → 红阵 hue 0.96 绘制面）', () => {
    const world = new World(200, 200, 100, 'bj33');
    const { e } = makeEnemy(100 * 16, 90 * 16);
    const game = makeGame({} as TownNPC, e).game;
    const aura = new PrincessAuraShot(100 * 16 + 10, 90 * 16 + 20, 15, 3, 1);
    expect(aura.ai2).toBe(1);
    aura.fixedUpdate(1 / 60, game);
    expect(aura.dead).toBe(false);
  });

  it('数据表锁（NPCID.cs:4839-4855 1457 终值）+ 发射端结构锁', () => {
    expect(TOWN_ATTACK_TYPE[663]).toBe(2);                     // AttackType=2 魔法态（NPCID.cs:4855）
    expect(TOWN_ATTACK_TIME[663]).toBe(60);                    // AttackTime（:4851）
    expect(TOWN_DANGER_RANGE[663]).toBe(700);                  // DangerDetectRange（:4839）
    expect(TOWN_MAGIC[663]).toMatchObject({ proj: 950, dmg: 15, speed: 0, shootTick: 15, kb: 3 });
    expect(TOWN_MAGIC[663]?.burst).toEqual([25, 35, 45, 55]);  // 连发梯（:55464 for 步长 10）
    expect(TOWN_MAGIC[663]?.hardMode).toMatchObject({ dmg: 20 });   // :55453 (!hardMode?15:20)
    // 结构锁:专类锚 + 发射端专类化 + 无靶守卫（防静默回退到通用 TownShot）
    const townShotSrc = readFileSync(join(import.meta.dirname, '../src/entities/TownShot.ts'), 'utf8');
    expect(townShotSrc).toContain('AI_186_PrincessWeapon');
    expect(townShotSrc).toContain(':14182-14186');
    expect(townShotSrc).toContain('NPC.immune[owner]=10');
    expect(townShotSrc).toContain(':13575-13577');
    expect(townShotSrc).toContain('penetrate=-1');
    expect(townShotSrc).toContain('class PrincessAuraShot extends TownShot');
    const townNpcSrc = readFileSync(join(import.meta.dirname, '../src/entities/TownNPC.ts'), 'utf8');
    expect(townNpcSrc).toContain('new PrincessAuraShot(px, py');
    expect(townNpcSrc).toContain('if (speed === 0 && !target && (this.vanillaId === 160 || this.vanillaId === 663)) return;');
    // 中央 CutTiles 通道 npcProj 半边门（P.cs:12516 调用点门——城镇弹不割草）
    const entitySrc = readFileSync(join(import.meta.dirname, '../src/entities/Entity.ts'), 'utf8');
    expect(entitySrc).toContain('m.npcProj !== true');
    expect(townShotSrc).toContain('npcProj = true');
  });
});
